import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { windowsOnly } from "./windowsOnly.testutil.js";
import * as managedProcesses from "./processTree.js";
import type { ChannelEvent, NativeError, TurnUsage } from "./channel.js";
import { ClaudeChannel, claudeChannelArgs, claudeVersionProblem, OLDEST_CLAUDE, resolveClaudeLaunch, VERSION_TIMEOUT_MS } from "./claude.js";

const channels: ClaudeChannel[] = [];
const folders: string[] = [];
async function setup(extra: { interruptTimeoutMs?: number; versionTimeoutMs?: number; autonomy?: "supervised" | "auto" | "full"; fakeArgs?: string[] } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "sa-native-claude-"));
  folders.push(cwd);
  const events: ChannelEvent[] = [];
  const channel = new ClaudeChannel({ cwd, model: "fake-model", instructions: "Standing instructions remain appended.", onEvent: (event) => events.push(event), command: { file: process.execPath, args: [resolve("test/fakes/claude.mjs"), ...(extra.fakeArgs ?? [])] }, interruptTimeoutMs: extra.interruptTimeoutMs, versionTimeoutMs: extra.versionTimeoutMs, autonomy: extra.autonomy });
  channels.push(channel);
  return { cwd, channel, events };
}
async function until(check: () => boolean): Promise<void> {
  for (let tries = 0; tries < 600; tries++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("fake Claude did not reach expected event");
}

/** Hand-written native-shaped S6 regression, not a recorded fixture or live provider test.
 * Owner's Claude 2.1.296 probe observed error_during_execution/is_error with zero usage
 * after interrupt. Streaming usage shapes follow the vendor SDK/API documentation.
 */
async function s6Protocol(autonomy?: "supervised" | "auto" | "full") {
  const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough();
  const sent: Record<string, unknown>[] = [];
  let buffer = "";
  const emit = (frame: Record<string, unknown>) => stdout.write(`${JSON.stringify({ session_id: "s6-session", ...frame })}\n`);
  stdin.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const frame = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      sent.push(frame);
      if (frame.request?.subtype === "initialize") emit({ type: "control_response", response: { subtype: "success", request_id: frame.request_id, response: {} } });
    }
  });
  // The channel reads `claude --version` first (CH-2), which spawns once before the session does.
  const versionOutput = new PassThrough();
  versionOutput.end("2.1.295 (Claude Code)\n");
  const injected = vi.spyOn(managedProcesses, "spawnManagedProcess").mockResolvedValueOnce({
    pid: 2, stdin: new PassThrough(), stdout: versionOutput, stderr: new PassThrough(), exited: Promise.resolve({ code: 0, signal: null }), close: async () => {},
  }).mockResolvedValueOnce({
    pid: 1, stdin, stdout, stderr, exited: new Promise(() => {}), close: async () => {},
  });
  const events: ChannelEvent[] = [];
  const channel = new ClaudeChannel({ cwd: tmpdir(), model: "synthetic-s6", instructions: "S6 regression", autonomy, onEvent: (event) => events.push(event), command: { file: process.execPath } });
  channels.push(channel);
  // Both one-shot values are used by the constructor's version check and session spawn; later spawns are real.
  const send = async (text = "partial native work") => {
    const pending = channel.send(text);
    await until(() => sent.some((frame) => frame.type === "user" && (frame.message as { content: string }).content === text));
    return { pending, id: (sent.filter((frame) => frame.type === "user").at(-1)!).uuid };
  };
  return { channel, events, emit, send, sent, spawned: () => injected.mock.calls.map(([options]) => options) };
}

const zeroUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const interruptedResult = (id: unknown) => ({ type: "result", subtype: "error_during_execution", is_error: true, errors: [], user_message_uuid: id, usage: zeroUsage, total_cost_usd: 0, modelUsage: {} });
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(channels.splice(0).map((channel) => channel.close()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe("native persistent Claude channel (synthetic protocol; no provider calls)", () => {
  it("recovers only this stopped turn's main provider usage, deduplicates response ids and retains zero terminal evidence", async () => {
    const { channel, events, emit, send } = await s6Protocol();
    const first = await send("earlier completed turn");
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "earlier", usage: { input_tokens: 9999, output_tokens: 1 } } });
    emit({ type: "result", subtype: "success", user_message_uuid: first.id, result: "done", usage: { input_tokens: 9999, output_tokens: 12 }, total_cost_usd: 0.03 });
    await first.pending;

    const { pending, id } = await send();
    const stepA = { input_tokens: 20, cache_creation_input_tokens: 3, cache_read_input_tokens: 7, output_tokens: 1 };
    emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: "step-a", usage: stepA } } });
    emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_delta", usage: { output_tokens: 4 } } });
    emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_delta", usage: { output_tokens: 6 } } });
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "step-a", content: [{ type: "tool_use", id: "edit-a", name: "Edit", input: {} }], usage: stepA } });
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "step-a", content: [{ type: "tool_use", id: "edit-b", name: "Edit", input: {} }], usage: stepA } });
    const stepB = { input_tokens: 30, cache_creation_input_tokens: 4, cache_read_input_tokens: 9, output_tokens: 1 };
    emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: "step-b", usage: stepB } } });
    emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_delta", usage: { output_tokens: 8 } } });
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "step-b", usage: stepB } });
    emit({ type: "assistant", parent_tool_use_id: "agent-tool", message: { id: "auxiliary", usage: { input_tokens: 9000, output_tokens: 5000 } } });
    emit({ type: "stream_event", parent_tool_use_id: "agent-tool", event: { type: "message_start", message: { id: "auxiliary", usage: { input_tokens: 9000 } } } });
    emit({ type: "stream_event", parent_tool_use_id: "agent-tool", event: { type: "message_delta", usage: { output_tokens: 5000 } } });
    await channel.interrupt();
    emit(interruptedResult(id));
    const result = await pending;
    expect(result.status).toBe("interrupted");
    expect(result.error).toBeUndefined();
    expect(result.contextTokens).toBe(43);
    expect(result.usage).toMatchObject({ inputTokens: 50, cachedInputTokens: 16, outputTokens: undefined, raw: { source: "assistant_and_stream", terminal: { ...zeroUsage, total_cost_usd: 0, modelUsage: {} } } });
    expect(result.usage?.costUsd).toBeUndefined();
    expect(result.usage?.costSource).toBeUndefined();
    expect((result.usage?.raw.mainMessages as unknown[])).toHaveLength(2);
    expect(events.filter((event) => event.type === "turn_end")).toHaveLength(2);
    expect(events.some((event) => event.type === "usage" && (event.data as { scope: string }).scope === "auxiliary")).toBe(true);
    expect(events.filter((event) => event.type === "error")).toHaveLength(0);

    // The zero interruption total must not reset the previous cumulative baseline. Its
    // missing cost boundary also makes the next turn's delta unknown, not prior+new spend.
    const next = await send("next explicit turn");
    emit({ type: "result", subtype: "success", user_message_uuid: next.id, result: "next", total_cost_usd: 0.1, usage: { input_tokens: 15, output_tokens: 2 } });
    expect((await next.pending).usage?.costUsd).toBeUndefined();
    const later = await send("later explicit turn");
    emit({ type: "result", subtype: "success", user_message_uuid: later.id, result: "later", total_cost_usd: 0.13 });
    expect((await later.pending).usage?.costUsd).toBeCloseTo(0.03);
  });

  it("recovers stream-only input/cache usage but leaves assistant-only output placeholders unknown", async () => {
    const { channel, emit, send } = await s6Protocol();
    const streamed = await send("streamed work");
    emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: "stream-only", usage: { input_tokens: 21, cache_read_input_tokens: 8, cache_creation_input_tokens: 4, output_tokens: 1 } } } });
    emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_delta", usage: { output_tokens: 5 } } });
    await channel.interrupt();
    emit(interruptedResult(streamed.id));
    expect((await streamed.pending).usage).toMatchObject({ inputTokens: 21, cachedInputTokens: 8, outputTokens: undefined });
    const assistantOnly = await send("assistant-only work");
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "assistant-only", usage: { input_tokens: 11, cache_read_input_tokens: 2, output_tokens: 1 } } });
    await channel.interrupt();
    emit(interruptedResult(assistantOnly.id));
    const usage = (await assistantOnly.pending).usage;
    expect(usage?.inputTokens).toBe(11);
    expect(usage?.outputTokens).toBeUndefined();
  });

  it("keeps execution errors failed when no stop was requested", async () => {
    const { emit, send } = await s6Protocol();
    const { pending, id } = await send();
    emit({ ...interruptedResult(id), errors: ["Native execution failed"] });
    expect(await pending).toMatchObject({ status: "failed", error: { kind: "other", message: "Native execution failed" } });
  });

  it("leaves usage and the next cost delta unknown when a stopped turn supplies no provider evidence", async () => {
    const { channel, emit, send } = await s6Protocol();
    const stopped = await send("stop without usage");
    await channel.interrupt();
    emit({ ...interruptedResult(stopped.id), usage: undefined, total_cost_usd: undefined });
    const result = await stopped.pending;
    expect(result.status).toBe("interrupted");
    expect(result.usage).toBeUndefined();
    const next = await send("first cumulative cost after stop");
    emit({ type: "result", subtype: "success", user_message_uuid: next.id, result: "done", usage: { input_tokens: 12, output_tokens: 3 }, total_cost_usd: 0.08 });
    expect((await next.pending).usage?.costUsd).toBeUndefined();
  });

  it("reports no cost for a stopped turn but keeps its totals as the next baseline (CH-2)", async () => {
    const { channel, emit, send } = await s6Protocol();
    const first = await send("known previous cost");
    emit({ type: "result", subtype: "success", user_message_uuid: first.id, result: "done", total_cost_usd: 0.03 });
    await first.pending;
    const stopped = await send("stopped work with reported cost");
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "reported-input", usage: { input_tokens: 20, output_tokens: 1 } } });
    await channel.interrupt();
    emit({ ...interruptedResult(stopped.id), total_cost_usd: 0.05 });
    const result = await stopped.pending;
    expect(result.status).toBe("interrupted");
    expect(result.usage?.inputTokens).toBe(20);
    expect(result.usage?.outputTokens).toBeUndefined();
    // CH-2: a stopped turn's cost reads "not reported" even where its totals grew; the totals are the next baseline.
    expect(result.usage?.costUsd).toBeUndefined();
    const next = await send("after the stop");
    emit({ type: "result", subtype: "success", user_message_uuid: next.id, result: "done", usage: { input_tokens: 4, output_tokens: 2 }, total_cost_usd: 0.06 });
    expect((await next.pending).usage?.costUsd).toBeCloseTo(0.01);
  });

  // CH-2: usage figures per turn, from the result's running totals.
  it("takes a turn's cost from its totals less the result before it; /clear and a total below the baseline start over", async () => {
    const { emit, send } = await s6Protocol();
    const turn = async (text: string, total: number | undefined) => {
      const sent = await send(text);
      emit({ type: "result", subtype: "success", user_message_uuid: sent.id, result: "ok", usage: { input_tokens: 3, output_tokens: 1 }, total_cost_usd: total });
      return (await sent.pending).usage?.costUsd;
    };
    expect(await turn("first", 0.1)).toBeCloseTo(0.1);
    expect(await turn("second", 0.25)).toBeCloseTo(0.15);
    // /clear (also /reset and /new): claude's totals start over, so the result's own totals are the turn's figures.
    expect(await turn("/clear", 0.02)).toBeCloseTo(0.02);
    expect(await turn("after the clear", 0.05)).toBeCloseTo(0.03);
    expect(await turn("/new", 0.01)).toBeCloseTo(0.01);
    // A total above zero but below the baseline has started over without a command.
    expect(await turn("quiet restart", 0.002)).toBeCloseTo(0.002);
    expect(await turn("then", 0.012)).toBeCloseTo(0.01);
  });

  it("never takes a zero total as a baseline: the next result reports no cost and becomes the baseline", async () => {
    const { emit, send } = await s6Protocol();
    const first = await send("first");
    emit({ type: "result", subtype: "success", user_message_uuid: first.id, result: "ok", usage: { input_tokens: 3, output_tokens: 1 }, total_cost_usd: 0.1 });
    await first.pending;
    const free = await send("zero cost");
    emit({ type: "result", subtype: "success", user_message_uuid: free.id, result: "ok", usage: { input_tokens: 5, output_tokens: 2 }, total_cost_usd: 0 });
    const zero = (await free.pending).usage;
    expect(zero?.costUsd).toBeUndefined();
    expect(zero?.inputTokens).toBe(5);
    const after = await send("after zero");
    // CH-2: with no result before it, input and cache are the main-loop messages' sums and output is the result's.
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "after-a", usage: { input_tokens: 4, cache_read_input_tokens: 2, output_tokens: 1 } } });
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "after-b", usage: { input_tokens: 3, cache_read_input_tokens: 1, output_tokens: 1 } } });
    emit({ type: "result", subtype: "success", user_message_uuid: after.id, result: "ok", usage: { input_tokens: 6, output_tokens: 2 }, total_cost_usd: 0.4 });
    const next = (await after.pending).usage;
    expect(next?.costUsd).toBeUndefined();
    expect(next).toMatchObject({ inputTokens: 7, cachedInputTokens: 3, outputTokens: 2 });
    expect(next?.raw.models).toBeUndefined();
    const later = await send("later");
    emit({ type: "result", subtype: "success", user_message_uuid: later.id, result: "ok", usage: { input_tokens: 6, output_tokens: 2 }, total_cost_usd: 0.45 });
    expect((await later.pending).usage?.costUsd).toBeCloseTo(0.05);
  });

  it("reads input, cache and cost, and no output, for an all-zero result that is not a stop", async () => {
    const { emit, send } = await s6Protocol();
    const crashed = await send("crashed");
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "m1", usage: { input_tokens: 30, cache_read_input_tokens: 10, output_tokens: 1 } } });
    emit({ type: "result", subtype: "success", user_message_uuid: crashed.id, result: "", usage: zeroUsage, total_cost_usd: 0, modelUsage: {} });
    const usage = (await crashed.pending).usage;
    expect(usage).toMatchObject({ inputTokens: 30, cachedInputTokens: 10, outputTokens: undefined });
    expect(usage?.costUsd).toBeUndefined();
  });

  it("treats a result whose modelUsage counters are all zero as a zero result (CH-2)", async () => {
    const { emit, send } = await s6Protocol();
    const crashed = await send("zero counters");
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "z1", usage: { input_tokens: 12, cache_read_input_tokens: 4, output_tokens: 1 } } });
    emit({ type: "result", subtype: "success", user_message_uuid: crashed.id, result: "", usage: zeroUsage, total_cost_usd: 0, modelUsage: { "fake-claude": { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, costUSD: 0, contextWindow: 200000 } } });
    const usage = (await crashed.pending).usage;
    expect(usage).toMatchObject({ inputTokens: 12, cachedInputTokens: 4, outputTokens: undefined });
    expect(usage?.costUsd).toBeUndefined();
  });

  it("reports no output for a stopped turn whose stream closes before its result (CH-2)", async () => {
    const { channel, emit, send } = await s6Protocol();
    const stopped = await send("stopped");
    emit({ type: "assistant", parent_tool_use_id: null, message: { id: "s1", usage: { input_tokens: 9, cache_read_input_tokens: 3, output_tokens: 1 } } });
    emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: "s1", usage: { input_tokens: 9 } } } });
    emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_delta", usage: { output_tokens: 7 } } });
    await channel.interrupt();
    await channel.close();
    const usage = (await stopped.pending).usage;
    expect(usage).toMatchObject({ inputTokens: 9, cachedInputTokens: 3 });
    expect(usage?.outputTokens).toBeUndefined();
  });

  it("does not take a lower total after a gap for a new session; only /clear starts over then (CH-2)", async () => {
    const { emit, send } = await s6Protocol();
    const first = await send("first");
    emit({ type: "result", subtype: "success", user_message_uuid: first.id, result: "ok", usage: { input_tokens: 3, output_tokens: 1 }, total_cost_usd: 0.5 });
    await first.pending;
    const gap = await send("gap");
    emit({ type: "result", subtype: "success", user_message_uuid: gap.id, result: "ok", usage: { input_tokens: 3, output_tokens: 1 } });
    await gap.pending;
    const lower = await send("lower");
    emit({ type: "result", subtype: "success", user_message_uuid: lower.id, result: "ok", usage: { input_tokens: 3, output_tokens: 1 }, total_cost_usd: 0.2 });
    expect((await lower.pending).usage?.costUsd).toBeUndefined();
    const gap2 = await send("gap again");
    emit({ type: "result", subtype: "success", user_message_uuid: gap2.id, result: "ok", usage: { input_tokens: 3, output_tokens: 1 }, total_cost_usd: 0 });
    await gap2.pending;
    const cleared = await send("/clear");
    emit({ type: "result", subtype: "success", user_message_uuid: cleared.id, result: "", usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: 0.01 });
    expect((await cleared.pending).usage?.costUsd).toBeCloseTo(0.01);
  });

  it("gives each turn its own per-model figures, subagent models included, which add up to the last result (CH-2, M1-AC3)", async () => {
    const { emit, send } = await s6Protocol();
    const totals = [
      { main: { inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 50, costUSD: 0.1, contextWindow: 200000 } },
      { main: { inputTokens: 250, outputTokens: 30, cacheReadInputTokens: 120, costUSD: 0.25, contextWindow: 200000 }, sub: { inputTokens: 400, outputTokens: 40, costUSD: 0.05 } },
      { main: { inputTokens: 300, outputTokens: 35, cacheReadInputTokens: 200, costUSD: 0.3, contextWindow: 200000 }, sub: { inputTokens: 900, outputTokens: 90, costUSD: 0.1 } },
    ];
    const turns: Record<string, Record<string, number>>[] = [];
    const costs: number[] = [];
    const firstClass: TurnUsage["models"][] = [];
    for (const [index, modelUsage] of totals.entries()) {
      const turn = await send(`turn ${index}`);
      const total = Object.values(modelUsage).reduce((sum, entry) => sum + entry.costUSD, 0);
      emit({ type: "result", subtype: "success", user_message_uuid: turn.id, result: "ok", usage: { input_tokens: 5, output_tokens: 1 }, total_cost_usd: total, modelUsage });
      const usage = (await turn.pending).usage!;
      turns.push(usage.raw.models as Record<string, Record<string, number>>);
      firstClass.push(usage.models);
      costs.push(usage.costUsd!);
    }
    expect(turns[1]).toEqual({ main: { inputTokens: 150, outputTokens: 20, cacheReadInputTokens: 70, costUSD: expect.closeTo(0.15) }, sub: { inputTokens: 400, outputTokens: 40, costUSD: 0.05 } });
    // #124 C1: the same figures as TurnUsage's own per-model field, in its names.
    expect(firstClass[1]).toEqual({ main: { inputTokens: 150, outputTokens: 20, cachedInputTokens: 70, costUsd: expect.closeTo(0.15) }, sub: { inputTokens: 400, outputTokens: 40, costUsd: 0.05 } });
    for (const model of ["main", "sub"]) expect(firstClass.reduce((sum, models) => sum + (models?.[model]?.inputTokens ?? 0), 0)).toBe((totals[2] as Record<string, Record<string, number>>)[model].inputTokens);
    for (const model of ["main", "sub"]) for (const key of ["inputTokens", "outputTokens", "costUSD"]) {
      const sum = turns.reduce((total, models) => total + (models[model]?.[key] ?? 0), 0);
      expect(sum).toBeCloseTo((totals[2] as Record<string, Record<string, number>>)[model][key]);
    }
    expect(costs.reduce((sum, cost) => sum + cost, 0)).toBeCloseTo(0.4);
    // A stopped turn reports no per-model figures, and its totals are the next baseline.
    const stopped = await send("stopped");
    emit({ type: "result", subtype: "error_during_execution", is_error: true, errors: [], user_message_uuid: stopped.id, terminal_reason: "aborted_tools", usage: zeroUsage, total_cost_usd: 0.5, modelUsage: { main: { inputTokens: 350, outputTokens: 40, costUSD: 0.4 }, sub: { inputTokens: 900, outputTokens: 90, costUSD: 0.1 } } });
    const stoppedUsage = (await stopped.pending).usage;
    expect(stoppedUsage?.raw.models).toBeUndefined();
    expect(stoppedUsage?.models).toBeUndefined();
    const after = await send("after stop");
    emit({ type: "result", subtype: "success", user_message_uuid: after.id, result: "ok", usage: { input_tokens: 5, output_tokens: 1 }, total_cost_usd: 0.6, modelUsage: { main: { inputTokens: 360, outputTokens: 41, costUSD: 0.5 }, sub: { inputTokens: 900, outputTokens: 90, costUSD: 0.1 } } });
    expect((await after.pending).usage?.raw.models).toEqual({ main: { inputTokens: 10, outputTokens: 1, costUSD: expect.closeTo(0.1) }, sub: { inputTokens: 0, outputTokens: 0, costUSD: 0 } });
    // /clear starts the totals over: that turn's own totals are its figures.
    const cleared = await send("/clear");
    emit({ type: "result", subtype: "success", user_message_uuid: cleared.id, result: "", usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: 0.01, modelUsage: { main: { inputTokens: 1, outputTokens: 1, costUSD: 0.01 } } });
    const clearedUsage = (await cleared.pending).usage;
    expect(clearedUsage?.raw.models).toEqual({ main: { inputTokens: 1, outputTokens: 1, costUSD: 0.01 } });
    expect(clearedUsage?.models).toEqual({ main: { inputTokens: 1, outputTokens: 1, costUsd: 0.01 } });
  });

  it.each([
    ["no map", undefined],
    ["an empty map", {}],
    ["an entry with no counters", { main: { contextWindow: 200000 } }],
    ["a malformed entry beside a good one", { main: { inputTokens: 200, costUSD: 0.2 }, sub: null }],
  ])("gives no per-model figures across a result with a cost and %s, then resumes (#111 C6)", async (_name, gap) => {
    const { emit, send } = await s6Protocol();
    let turns = 0;
    const turnUsage = async (total: number, modelUsage: unknown, text = `turn ${turns++}`) => {
      const sent = await send(text);
      emit({ type: "result", subtype: "success", user_message_uuid: sent.id, result: "ok", usage: { input_tokens: 5, output_tokens: 1 }, total_cost_usd: total, modelUsage });
      return (await sent.pending).usage!;
    };
    await turnUsage(0.1, { main: { inputTokens: 100, costUSD: 0.1 }, sub: { inputTokens: 40, costUSD: 0 } });
    await turnUsage(0.2, gap);
    const across = await turnUsage(0.3, { main: { inputTokens: 300, costUSD: 0.25 }, sub: { inputTokens: 90, costUSD: 0.05 } });
    expect(across.costUsd).toBeCloseTo(0.1);
    expect(across.models).toBeUndefined();
    expect(across.raw.models).toBeUndefined();
    const next = await turnUsage(0.35, { main: { inputTokens: 330, costUSD: 0.3 }, sub: { inputTokens: 90, costUSD: 0.05 } });
    expect(next.models).toEqual({ main: { inputTokens: 30, costUsd: expect.closeTo(0.05) }, sub: { inputTokens: 0, costUsd: 0 } });
    // A known reset makes the totals local, so they need no boundary.
    await turnUsage(0.4, gap);
    const cleared = await turnUsage(0.01, { main: { inputTokens: 7, costUSD: 0.01 } }, "/clear");
    expect(cleared.models).toEqual({ main: { inputTokens: 7, costUsd: 0.01 } });
    await turnUsage(0.2, gap);
    const lower = await turnUsage(0.05, { main: { inputTokens: 9, costUSD: 0.05 } });
    expect(lower.models).toEqual({ main: { inputTokens: 9, costUsd: 0.05 } });
  });

  it("leaves out a counter the previous result's model entry did not carry (#111 C6)", async () => {
    const { emit, send } = await s6Protocol();
    const first = await send("first");
    emit({ type: "result", subtype: "success", user_message_uuid: first.id, result: "ok", total_cost_usd: 0.1, modelUsage: { main: { costUSD: 0.1 } } });
    await first.pending;
    const second = await send("second");
    emit({ type: "result", subtype: "success", user_message_uuid: second.id, result: "ok", total_cost_usd: 0.15, modelUsage: { main: { inputTokens: 500, costUSD: 0.15 } } });
    expect((await second.pending).usage?.models).toEqual({ main: { costUsd: expect.closeTo(0.05) } });
  });

  // M1-AC14 (unit part): the live run is the owner's.
  it("starts every claude process with auto memory off, in its environment and in --settings, over an inherited 0", async () => {
    const before = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
    process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "0";
    try {
      // Each mode starts twice: a post-office restart builds a new channel through the same launches.
      let spawned: () => managedProcesses.ManagedProcessOptions[] = () => [];
      for (const autonomy of ["supervised", "auto", "full", "full"] as const) {
        const before = spawned().length;
        ({ spawned } = await s6Protocol(autonomy));
        await until(() => spawned().length >= before + 2);
      }
      // The version probe and the session, for every start: both settings values on each.
      expect(spawned()).toHaveLength(8);
      for (const call of spawned()) {
        expect(call.env?.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe("1");
        expect(JSON.parse(call.args![call.args!.indexOf("--settings") + 1])).toEqual({ env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" } });
      }
      expect(spawned().filter((call) => call.args?.includes("--version"))).toHaveLength(4);
    } finally {
      if (before === undefined) delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY; else process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = before;
    }
    for (const autonomy of ["supervised", "auto", "full"] as const) expect(claudeChannelArgs({ cwd: ".", model: "fake", instructions: "", autonomy, onEvent: () => {} })).toContain("--settings");
  });

  it.each([["rate_limit", "rate_limit", "API Error: rate limit"], ["invalid_request", "context_overflow", "API Error: prompt is too long"]])("does not let stop hide an earlier %s failure", async (code, kind, text) => {
    const { channel, emit, send } = await s6Protocol();
    const { pending, id } = await send();
    emit({ type: "assistant", parent_tool_use_id: null, error: code, message: { id: "error-response", content: [{ type: "text", text }] } });
    await channel.interrupt();
    emit({ ...interruptedResult(id), errors: ["Native turn stopped"] });
    expect(await pending).toMatchObject({ status: "failed", error: { kind, message: text } });
  });

  it("keeps an earlier typed failure when an aborted terminal does not set is_error", async () => {
    const { channel, emit, send } = await s6Protocol();
    const { pending, id } = await send();
    emit({ type: "assistant", parent_tool_use_id: null, error: "rate_limit", message: { id: "rate-response", content: [{ type: "text", text: "API Error: rate limit" }] } });
    await channel.interrupt();
    emit({ type: "result", subtype: "success", is_error: false, user_message_uuid: id, terminal_reason: "aborted_tools", result: "Native turn stopped" });
    expect(await pending).toMatchObject({ status: "failed", error: { kind: "rate_limit", message: "API Error: rate limit" } });
  });

  it.each([["rate_limit", "rate_limit", "Rate limit from terminal"], ["context_overflow", "context_overflow", "Context overflow from terminal"]])("keeps a terminal-only %s distinct when it races stop", async (code, kind, message) => {
    const { channel, emit, send } = await s6Protocol();
    const { pending, id } = await send();
    await channel.interrupt();
    emit({ ...interruptedResult(id), error: code, errors: [message] });
    expect(await pending).toMatchObject({ status: "failed", error: { kind, message } });
  });

  it("honors native completion racing a requested stop and ignores foreign/background results", async () => {
    const { channel, events, emit, send } = await s6Protocol();
    const { pending, id } = await send();
    emit({ ...interruptedResult("another-turn"), total_cost_usd: 500 });
    emit({ ...interruptedResult(id), origin: { kind: "task-notification" }, total_cost_usd: 600 });
    expect(events.filter((event) => event.type === "turn_end")).toHaveLength(0);
    await channel.interrupt();
    emit({ type: "result", subtype: "success", is_error: false, user_message_uuid: id, result: "Already completed", usage: { input_tokens: 10, output_tokens: 2 }, total_cost_usd: 0.03 });
    expect(await pending).toMatchObject({ status: "completed", text: "Already completed", usage: { costUsd: 0.03 } });
  });

  it.runIf(process.platform === "win32")("preserves multiline standing text through a real Windows batch shim and removes its append file", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sa-native-claude-batch-"));
    folders.push(cwd);
    const batch = join(cwd, "fake-claude.cmd");
    await writeFile(batch, `@echo off\r\n"${process.execPath}" "${resolve("test/fakes/claude.mjs")}" %*\r\n`);
    const instructions = "First line 🌙\r\nSecond line with \"quotes\" & literal %values%.\nThird line.";
    const channel = new ClaudeChannel({ cwd, model: "fake-model", instructions, onEvent: () => {}, command: { file: batch } });
    channels.push(channel);
    const inspection = JSON.parse((await channel.send("inspect")).text);
    expect(inspection.appendText).toBe(instructions);
    expect(inspection.args).not.toContain("--system-prompt-file");
    expect(inspection.args).not.toContain(instructions);
    const instructionPath = inspection.args[inspection.args.indexOf("--append-system-prompt-file") + 1];
    await channel.close();
    await expect(readFile(instructionPath)).rejects.toThrow();
  }, 45_000);

  windowsOnly("settles pending work once and reports uncertain containment without rejecting an event-triggered close", async () => {
    const original = managedProcesses.spawnManagedProcess;
    const injected = vi.spyOn(managedProcesses, "spawnManagedProcess").mockImplementationOnce(original).mockImplementationOnce(async (options) => {
      const child = await original(options);
      return { ...child, close: async () => { await child.close(); throw new Error("injected containment uncertainty"); } };
    });
    try {
      const { channel, events } = await setup();
      const result = await channel.send("die");
      expect(result.status).toBe("interrupted");
      expect(result.error?.message).toContain("containment failed");
      await expect(channel.close()).resolves.toBeUndefined();
      expect(events.filter((event) => event.type === "turn_end")).toHaveLength(1);
      expect(events.find((event) => event.type === "closed")?.data).toMatchObject({ containmentStopped: false });
    } finally { injected.mockRestore(); }
  }, 15_000);

  windowsOnly("keeps one process, session and history across two turns with appended instructions", async () => {
    const { channel } = await setup();
    const first = await channel.send("inspect");
    const second = await channel.send("inspect");
    const a = JSON.parse(first.text), b = JSON.parse(second.text);
    expect(a.pid).toBe(b.pid);
    expect(first.sessionId).toBe(second.sessionId);
    expect(b.history).toEqual(["inspect", "inspect"]);
    expect(a.args).toContain("--append-system-prompt");
    expect(a.args).toContain("Standing instructions remain appended.");
    expect(a.args).not.toContain("--system-prompt");
    expect(a.args).not.toContain("--no-session-persistence");
    expect(a.args).not.toContain("--bare");
    expect(second.usage?.costUsd).toBeCloseTo(0.03);
    expect(second.usage?.costSource).toBe("native_cli_estimate");
    expect(second.usage?.raw.total_cost_usd).toBe(0.06);
  }, 15_000);

  it("uses each native autonomy mode without disabling native tools", () => {
    const opts = { cwd: ".", model: "fake", instructions: "", onEvent: () => {} };
    expect(claudeChannelArgs(opts)).toContain("plan");
    expect(claudeChannelArgs({ ...opts, autonomy: "auto" })).toContain("auto");
    expect(claudeChannelArgs({ ...opts, autonomy: "full" })).toContain("bypassPermissions");
    expect(claudeChannelArgs(opts)).not.toContain("--tools");
  });

  windowsOnly("decodes JSON lines and UTF-8 characters split across chunks", async () => {
    const { channel, events } = await setup();
    expect((await channel.send("split")).text).toBe("split 🌙");
    expect(events.filter((event) => event.type === "text").map((event) => event.data)).toEqual(["split 🌙"]);
  }, 15_000);

  windowsOnly("shows one unparseable line as a redacted error of kind other and carries on (W11-2, CH-1)", async () => {
    const { channel, events } = await setup();
    const result = await channel.send("malformed-once");
    expect(result.status).toBe("completed");
    expect(result.text).toBe("after bad line");
    const errors = events.filter((event) => event.type === "error").map((event) => event.data as NativeError);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("other");
    expect(errors[0].message).toContain("broken JSON");
    expect(errors[0].message).not.toContain("sk-ant-abcdefghijklmnop");
    expect(events.some((event) => event.type === "raw" && (event.data as { type?: string }).type === "unparseable_line")).toBe(true);
    expect((await channel.send("hello")).status).toBe("completed");
  }, 15_000);

  windowsOnly("counts only ten unparseable lines in a row as a lost connection, settling the turn once (W11-2, CH-1)", async () => {
    const { channel, events } = await setup();
    const survived = await channel.send("malformed-nine-then-ok");
    expect(survived.status).toBe("completed");
    const result = await channel.send("malformed-ten");
    expect(result.status).toBe("interrupted");
    expect(result.error?.kind).toBe("transport");
    expect(result.error?.message).toContain("10 unparseable lines in a row");
    await channel.close();
    expect(events.filter((event) => event.type === "turn_end")).toHaveLength(2);
    expect(events.filter((event) => event.type === "closed")).toHaveLength(1);
  }, 15_000);

  windowsOnly("uses only the main conversation for the meter and preserves native terminal/cache usage", async () => {
    const { channel, events } = await setup();
    const result = await channel.send("meters");
    expect(result.contextTokens).toBe(22);
    expect(result.usage?.inputTokens).toBe(70);
    expect(result.usage?.cachedInputTokens).toBe(40);
    expect(result.usage?.raw.cache_creation).toEqual({ ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 20 });
    expect(events.some((event) => event.type === "usage" && (event.data as { scope: string }).scope === "auxiliary")).toBe(true);
  }, 15_000);

  windowsOnly("keeps rate limit, context overflow, login and refusal distinct without restarting", async () => {
    const { channel } = await setup();
    for (const [prompt, kind, prose] of [["rate", "rate_limit", "API Error: rate limit; try after reset"], ["context", "context_overflow", "API Error: prompt is too long"], ["login", "login_needed", "Please login to Claude Code"]]) {
      const result = await channel.send(prompt);
      expect(result.status).toBe("failed");
      expect(result.error?.kind).toBe(kind);
      expect(result.error?.message).toBe(prose);
    }
    const refused = await channel.send("refusal");
    expect(refused.status).toBe("completed");
    expect(refused.refusal).toBe(true);
    expect(refused.error).toBeUndefined();
    expect((await channel.send("still alive")).text).toContain("turn 5");
  }, 15_000);

  it("leaves missing usage unknown and does not substitute estimated tokens", async () => {
    const { channel } = await setup();
    expect((await channel.send("unknown-usage")).usage).toBeUndefined();
  }, 15_000);

  windowsOnly("settles a stream death mid-tool call as interrupted and preserves partial files", async () => {
    const { channel, events, cwd } = await setup();
    const result = await channel.send("die");
    expect(result.status).toBe("interrupted");
    expect(result.error?.kind).toBe("transport");
    expect(await readFile(join(cwd, "partial.txt"), "utf8")).toBe("partial edit\n");
    expect(events.filter((event) => event.type === "tool_call")).toHaveLength(1);
    expect(events.filter((event) => event.type === "turn_end")).toHaveLength(1);
  }, 15_000);

  windowsOnly("interrupts after a partial edit without freshening the session or replaying", async () => {
    const { channel, events, cwd } = await setup();
    const stopped = channel.send("partial");
    await until(() => events.some((event) => event.type === "tool_call"));
    await channel.interrupt();
    const partial = await stopped;
    expect(partial.status).toBe("interrupted");
    expect(await readFile(join(cwd, "partial.txt"), "utf8")).toBe("partial edit\n");
    const next = await channel.send("new explicit instruction");
    expect(next.sessionId).toBe(partial.sessionId);
    expect(next.text).toContain("turn 2");
    expect(next.text).toContain("earlier=partial");
  }, 15_000);

  windowsOnly("ends an unresponsive native stop and settles pending work once", async () => {
    const { channel, events } = await setup({ interruptTimeoutMs: 30 });
    const pending = channel.send("ignore-interrupt");
    await until(() => events.some((event) => event.type === "tool_call"));
    await channel.interrupt();
    expect((await pending).status).toBe("interrupted");
    await channel.close();
    expect(events.filter((event) => event.type === "turn_end")).toHaveLength(1);
  }, 15_000);

  windowsOnly("never answers an approval without an explicit response and drops stopped request ids", async () => {
    const { channel, events, cwd } = await setup();
    const pending = channel.send("approval");
    await until(() => events.some((event) => event.type === "approval"));
    const requestId = (events.find((event) => event.type === "approval")!.data as { request_id: string }).request_id;
    await expect(readFile(join(cwd, "approval-response.json"))).rejects.toThrow();
    await channel.interrupt();
    expect((await pending).status).toBe("interrupted");
    await expect(channel.respondApproval(requestId, { behavior: "allow" })).rejects.toThrow("no longer open");
    const next = channel.send("approval");
    await until(() => events.filter((event) => event.type === "approval").length === 2);
    const newRequest = (events.filter((event) => event.type === "approval")[1].data as { request_id: string }).request_id;
    const answer = { behavior: "deny", message: "Owner says no" };
    await channel.respondApproval(newRequest, answer);
    expect((await next).text).toBe("Explicit owner denied");
    expect(JSON.parse(await readFile(join(cwd, "approval-response.json"), "utf8"))).toEqual(answer);
  }, 15_000);

  windowsOnly("emits text deltas without replaying the completed assistant text", async () => {
    const { channel, events } = await setup();
    expect((await channel.send("partial-events")).text).toBe("first second");
    expect(events.filter((event) => event.type === "text").map((event) => event.data)).toEqual(["first ", "second"]);
  }, 15_000);
  // M1-AC4 / M1-AC5 faults, through test/fakes/claude.mjs. Every frame is synthetic: no claude recordings exist yet (blocker B4).
  // Each test below that reads a claude frame or message (login, model change, background result, unknown frames, the managed-settings
  // refusal, the init permission mode, the cut-off line) must be re-run with the frames copied from section 5.1 C's recordings when they land.
  const errorsOf = (events: ChannelEvent[]) => events.filter((event) => event.type === "error").map((event) => event.data as NativeError);
  const rawOf = (events: ChannelEvent[], type: string) => events.filter((event) => event.type === "raw" && (event.data as { type?: string }).type === type);

  it("bounds --version at 10 s and names the oldest claude (CH-2)", () => {
    expect(VERSION_TIMEOUT_MS).toBe(10_000);
    expect(OLDEST_CLAUDE).toBe("2.1.277");
  });

  windowsOnly("ends a --version that never exits, and the soldier does not start (M1-AC4)", async () => {
    const started = Date.now();
    expect(await claudeVersionProblem({ file: process.execPath, args: [resolve("test/fakes/claude.mjs"), "--fake-version-hang"] }, tmpdir(), 300)).toBe("claude --version gave no answer in 0.3 s");
    expect(Date.now() - started).toBeLessThan(8_000);
    const { channel, events } = await setup({ versionTimeoutMs: 300, fakeArgs: ["--fake-version-hang"] });
    const result = await channel.send("hello");
    expect(result.status).toBe("interrupted");
    expect(result.error).toEqual({ kind: "other", message: "claude --version gave no answer in 0.3 s" });
    expect(events.some((event) => event.type === "raw" && (event.data as { type?: string }).type === "system")).toBe(false);
  }, 15_000);

  const withPath = (...entries: string[]): NodeJS.ProcessEnv => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path")), PATH: entries.join(delimiter) });
  async function fakeClaudeIn(directory: string, body: string): Promise<string> {
    await mkdir(directory, { recursive: true });
    const file = join(directory, process.platform === "win32" ? "claude.cmd" : "claude");
    await writeFile(file, process.platform === "win32" ? `@echo off\r\n${body}\r\n` : `#!/bin/sh\n${body}\n`);
    if (process.platform !== "win32") await chmod(file, 0o755);
    return file;
  }

  it("resolves claude once on PATH outside the soldier's folder, and refuses an unvalidated target (CH-1)", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sa-claude-launch-")); folders.push(cwd);
    const outside = await mkdtemp(join(tmpdir(), "sa-claude-trusted-")); folders.push(outside);
    const local = join(cwd, "bin");
    await fakeClaudeIn(local, "exit 0");
    const trusted = await fakeClaudeIn(outside, "exit 0");
    const launch = await resolveClaudeLaunch(undefined, cwd, withPath("bin", "", local, join(outside, "missing"), outside));
    if (typeof launch === "string") throw new Error(launch);
    expect(launch.file.toLowerCase()).toBe(trusted.toLowerCase()); // PATHEXT's own case
    expect(launch.dropped).toEqual(["bin", "", local, join(outside, "missing")]);
    expect(launch.env.PATH).toBe(outside);
    if (process.platform === "win32") expect(launch.env.NoDefaultCurrentDirectoryInExePath).toBe("1");
    expect(await resolveClaudeLaunch(undefined, cwd, withPath("bin", local))).toMatch(/not found on PATH/);
    const dotted = join(cwd, "..tools"); // inside the folder, though its name starts with ".."
    await fakeClaudeIn(dotted, "exit 0");
    expect(await resolveClaudeLaunch(undefined, cwd, withPath(dotted))).toMatch(/not found on PATH/);
    expect(await resolveClaudeLaunch({ file: "claude" }, cwd, withPath(outside))).toMatch(/not an absolute path/);
  });

  windowsOnly("starts the probe and the session from the same validated claude and environment (CH-1)", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sa-claude-launch-")); folders.push(cwd);
    const outside = await mkdtemp(join(tmpdir(), "sa-claude-trusted-")); folders.push(outside);
    const log = join(outside, "starts.log"); const marker = join(cwd, "local-ran");
    const local = join(cwd, "bin");
    await fakeClaudeIn(local, `echo ran>"${marker}"`);
    const trusted = await fakeClaudeIn(outside, `echo %~f0^|%PATH%>>"${log}"\r\n"${process.execPath}" "${resolve("test/fakes/claude.mjs")}" %*`);
    const events: ChannelEvent[] = [];
    const channel = new ClaudeChannel({ cwd, model: "fake-model", instructions: "x", onEvent: (event) => events.push(event), env: withPath(local, outside) });
    channels.push(channel);
    expect((await channel.send("hello")).status).toBe("completed");
    expect((await readFile(log, "utf8")).trim().split(/\r?\n/)).toEqual([`${trusted}|${outside}`, `${trusted}|${outside}`]);
    expect(events.find((event) => event.type === "raw" && (event.data as { type?: string }).type === "path")?.data).toEqual({ type: "path", dropped: [local] });
    const refusedEvents: ChannelEvent[] = [];
    const refused = new ClaudeChannel({ cwd, model: "fake-model", instructions: "x", onEvent: (event) => refusedEvents.push(event), env: withPath(local) });
    channels.push(refused);
    expect((await refused.send("hello")).error?.kind).toBe("other");
    await until(() => refusedEvents.some((event) => event.type === "closed"));
    expect(refusedEvents.find((event) => event.type === "closed")?.data).toMatchObject({ refusedStart: true });
    await expect(readFile(marker)).rejects.toThrow();
  }, 30_000);

  windowsOnly("opens no session for a claude older than the oldest, and it is not a crash (CH-2, M1-AC4)", async () => {
    const { channel, events } = await setup({ fakeArgs: ["--fake-version", "2.1.276"] });
    const result = await channel.send("hello");
    expect(result.status).toBe("interrupted");
    expect(result.error).toEqual({ kind: "other", message: `claude 2.1.276 is older than ${OLDEST_CLAUDE}; update claude` });
    expect(errorsOf(events).map((error) => error.kind)).toEqual(["other"]);
    await until(() => events.some((event) => event.type === "closed"));
    expect(events.find((event) => event.type === "closed")?.data).toMatchObject({ refusedStart: true, containmentStopped: true });
    const { channel: oldest } = await setup({ fakeArgs: ["--fake-version", OLDEST_CLAUDE] });
    expect((await oldest.send("hello")).status).toBe("completed");
    const { channel: newer } = await setup({ fakeArgs: ["--fake-version", "2.2.0"] });
    expect((await newer.send("hello")).status).toBe("completed");
  }, 30_000);

  windowsOnly("treats a start that managed settings refuse as a refused start, not a crash (PO-1, M1-AC4)", async () => {
    const { channel, events } = await setup({ autonomy: "full", fakeArgs: ["--fake-refuse-managed"] });
    const result = await channel.send("hello");
    expect(result.status).toBe("interrupted");
    expect(result.error?.kind).toBe("other");
    expect(result.error?.message).toContain("claude can't start at full: your organization's managed settings refuse it");
    expect(result.error?.message).toContain("disableBypassPermissionsMode");
    expect(result.error?.message).toContain("lower its autonomy");
    expect(rawOf(events, "stderr")).not.toHaveLength(0);
    await until(() => events.some((event) => event.type === "closed"));
    expect(events.find((event) => event.type === "closed")?.data).toMatchObject({ refusedStart: true });
  }, 15_000);

  it("ends a turn only on a result that names its message in either field (CH-2, M1-AC4)", async () => {
    const { events, emit, send } = await s6Protocol();
    const { pending, id } = await send("scoped");
    emit({ type: "result", subtype: "success", result: "names nothing", total_cost_usd: 5, usage: { input_tokens: 1, output_tokens: 1 } });
    emit({ type: "result", subtype: "success", result: "named", user_message_uuids: ["another-message"], user_message_uuid: id, total_cost_usd: 0.03, usage: { input_tokens: 3, output_tokens: 1 } });
    const result = await pending;
    expect(result).toMatchObject({ status: "completed", text: "named" });
    expect(result.usage?.costUsd).toBeCloseTo(0.03);
    expect(rawOf(events, "result_ignored")).toHaveLength(1);
  });

  it("sends each message with Claude's native priority later (CH-2)", async () => {
    const { emit, send, sent } = await s6Protocol();
    const { pending, id } = await send("queued");
    expect(sent.find((frame) => frame.type === "user")).toMatchObject({ uuid: id, priority: "later" });
    emit({ type: "result", subtype: "success", user_message_uuid: id, result: "done" });
    expect((await pending).status).toBe("completed");
  });

  it("surfaces claude's API retry as a notice, not an error, and the turn then completes (CH-2, M1-AC4)", async () => {
    const { events, emit, send } = await s6Protocol();
    const { pending, id } = await send("retried");
    emit({ type: "system", subtype: "api_retry", attempt: 2, max_retries: 10, retry_delay_ms: 1200, error_status: 529, error: "overloaded" });
    emit({ type: "result", subtype: "success", user_message_uuid: id, result: "done", total_cost_usd: 0.01, usage: { input_tokens: 3, output_tokens: 1 } });
    expect(await pending).toMatchObject({ status: "completed", text: "done" });
    expect(events.filter((event) => event.type === "retry").map((event) => event.data)).toEqual([{ attempt: 2, maxRetries: 10, retryDelayMs: 1200, errorStatus: 529, error: "overloaded" }]);
    expect(errorsOf(events)).toHaveLength(0);
  });

  windowsOnly("a retry from the fake ends in its own result (CH-2)", async () => {
    const { channel, events } = await setup();
    expect(await channel.send("retry")).toMatchObject({ status: "completed", text: "after retry" });
    expect(events.filter((event) => event.type === "retry")).toHaveLength(1);
  }, 15_000);

  it("opens no session when the version probe's processes cannot be confirmed stopped (CH-2, fail closed)", async () => {
    const versionOutput = new PassThrough();
    versionOutput.end("2.1.295 (Claude Code)\n");
    const spawn = vi.spyOn(managedProcesses, "spawnManagedProcess").mockResolvedValueOnce({
      pid: 3, stdin: new PassThrough(), stdout: versionOutput, stderr: new PassThrough(), exited: Promise.resolve({ code: 0, signal: null }), close: async () => { throw new Error("descendants still running"); },
    });
    const events: ChannelEvent[] = [];
    const channel = new ClaudeChannel({ cwd: tmpdir(), model: "probe", instructions: "probe", onEvent: (event) => events.push(event), command: { file: process.execPath } });
    channels.push(channel);
    const result = await channel.send("hello");
    expect(result.status).toBe("interrupted");
    expect(result.error).toMatchObject({ kind: "transport", message: expect.stringContaining("probe containment failed: descendants still running") });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(events.find((event) => event.type === "closed")?.data).toMatchObject({ containmentStopped: false, refusedStart: false });
  });

  windowsOnly("a login needed keeps its kind whether the fake keeps running or exits after it (CH-2, M1-AC4)", async () => {
    const running = await setup();
    expect((await running.channel.send("login")).error?.kind).toBe("login_needed");
    expect((await running.channel.send("hello")).status).toBe("completed");
    const exiting = await setup();
    const result = await exiting.channel.send("login-exit");
    expect(result.error?.kind).toBe("login_needed");
    await until(() => exiting.events.some((event) => event.type === "closed"));
    expect(exiting.events.find((event) => event.type === "closed")?.data).toMatchObject({ reason: { kind: "login_needed" } });
    const after = await exiting.channel.send("again");
    expect(after.status).toBe("interrupted");
    expect(after.error?.kind).toBe("login_needed");
  }, 20_000);

  windowsOnly("logs a model change claude makes by itself and names the new model in the turn's usage (CH-2, M1-AC4)", async () => {
    const { channel, events } = await setup();
    const result = await channel.send("model-change");
    expect(result.status).toBe("completed");
    expect(rawOf(events, "model_changed").map((event) => event.data)).toEqual([{ type: "model_changed", from: "fake-claude", to: "fake-fallback" }]);
    expect(result.usage?.raw.model).toBe("fake-fallback");
    expect(errorsOf(events)).toHaveLength(0);
  }, 15_000);

  windowsOnly("a background task's follow-up result ends only its own message (CH-2, M1-AC4)", async () => {
    const { channel, events } = await setup();
    expect((await channel.send("background-start")).text).toBe("started a task");
    const next = await channel.send("background-next");
    expect(next).toMatchObject({ status: "completed", text: "own result" });
    expect(next.usage?.costUsd).toBeCloseTo(0.03);
    expect(rawOf(events, "result_ignored")).toHaveLength(2);
    expect(events.filter((event) => event.type === "turn_end")).toHaveLength(2);
  }, 15_000);

  windowsOnly("records unknown frames and unknown fields and changes nothing else (CH-1, M1-AC4)", async () => {
    const { channel, events } = await setup();
    const result = await channel.send("unknown-frames");
    expect(result).toMatchObject({ status: "completed", text: "known result", contextTokens: 10 });
    const raw = (predicate: (data: Record<string, unknown>) => boolean) => events.filter((event) => event.type === "raw" && predicate(event.data as Record<string, unknown>));
    expect(raw((data) => data.type === "hologram")).toHaveLength(1);
    expect(raw((data) => data.subtype === "from_the_future")).toHaveLength(1);
    expect(raw((data) => data.novel_field !== undefined)).toHaveLength(1);
    expect(raw((data) => data.new_result_field !== undefined)).toHaveLength(1);
    expect(events.filter((event) => event.type === "text").map((event) => event.data)).toEqual(["known frame"]);
    expect(errorsOf(events)).toHaveLength(0);
    expect(events.filter((event) => event.type === "closed")).toHaveLength(0);
  }, 15_000);

  windowsOnly("reads a last line cut off by the fake's exit as one malformed line (CH-1, M1-AC4)", async () => {
    const { channel, events } = await setup();
    const result = await channel.send("cutoff");
    expect(result.status).toBe("interrupted");
    expect(rawOf(events, "unparseable_line")).toHaveLength(1);
    expect(errorsOf(events).filter((error) => error.kind === "other")).toHaveLength(1);
  }, 15_000);

  windowsOnly("names both modes in one line when system/init reports another permission mode than the one passed (M1-AC5)", async () => {
    const { events, channel } = await setup({ autonomy: "auto", fakeArgs: ["--fake-mode", "plan"] });
    expect((await channel.send("hello")).status).toBe("completed");
    const mismatches = errorsOf(events).filter((error) => /permission mode/.test(error.message));
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain("plan");
    expect(mismatches[0].message).toContain("auto");
    const matching = await setup({ autonomy: "full" });
    expect((await matching.channel.send("hello")).status).toBe("completed");
    expect(errorsOf(matching.events)).toHaveLength(0);
  }, 15_000);

  it("passes exactly one permission mode per autonomy level and removes no tool or prompt (M1-AC5)", () => {
    const opts = { cwd: ".", model: "fake", instructions: "text", onEvent: () => {} };
    for (const [autonomy, mode] of [["supervised", "plan"], ["auto", "auto"], ["full", "bypassPermissions"]] as const) {
      const args = claudeChannelArgs({ ...opts, autonomy });
      expect(args.filter((arg) => arg === "--permission-mode")).toHaveLength(1);
      expect(args[args.indexOf("--permission-mode") + 1]).toBe(mode);
      for (const forbidden of ["--system-prompt", "--system-prompt-file", "--tools", "--allowedTools", "--disallowedTools", "--bare", "--dangerously-skip-permissions"]) expect(args).not.toContain(forbidden);
    }
  });
});
