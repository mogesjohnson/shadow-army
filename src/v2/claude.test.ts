import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as managedProcesses from "./processTree.js";
import type { ChannelEvent } from "./channel.js";
import { ClaudeChannel, claudeChannelArgs } from "./claude.js";

const channels: ClaudeChannel[] = [];
const folders: string[] = [];
async function setup(extra: { interruptTimeoutMs?: number } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "sa-native-claude-"));
  folders.push(cwd);
  const events: ChannelEvent[] = [];
  const channel = new ClaudeChannel({ cwd, model: "fake-model", instructions: "Standing instructions remain appended.", onEvent: (event) => events.push(event), command: { file: process.execPath, args: [resolve("test/fakes/claude.mjs")] }, ...extra });
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
async function s6Protocol() {
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
  const injected = vi.spyOn(managedProcesses, "spawnManagedProcess").mockResolvedValueOnce({
    pid: 1, stdin, stdout, stderr, exited: new Promise(() => {}), close: async () => {},
  });
  const events: ChannelEvent[] = [];
  const channel = new ClaudeChannel({ cwd: tmpdir(), model: "synthetic-s6", instructions: "S6 regression", onEvent: (event) => events.push(event) });
  channels.push(channel);
  // open() invokes the injected spawner synchronously; restoring avoids other tests' state.
  injected.mockRestore();
  const send = async (text = "partial native work") => {
    const pending = channel.send(text);
    await until(() => sent.some((frame) => frame.type === "user" && (frame.message as { content: string }).content === text));
    return { pending, id: (sent.filter((frame) => frame.type === "user").at(-1)!).uuid };
  };
  return { channel, events, emit, send };
}

const zeroUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const interruptedResult = (id: unknown) => ({ type: "result", subtype: "error_during_execution", is_error: true, errors: [], user_message_uuid: id, usage: zeroUsage, total_cost_usd: 0, modelUsage: {} });
afterEach(async () => {
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
    expect(result.usage).toMatchObject({ inputTokens: 50, cachedInputTokens: 16, outputTokens: 14, raw: { source: "assistant_and_stream", terminal: { ...zeroUsage, total_cost_usd: 0, modelUsage: {} } } });
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
    expect((await streamed.pending).usage).toMatchObject({ inputTokens: 21, cachedInputTokens: 8, outputTokens: 5 });
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

  it("retains a usable native dollar estimate independently of stopped-turn token counters", async () => {
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
    expect(result.usage?.costUsd).toBeCloseTo(0.02);
    expect(result.usage?.costSource).toBe("native_cli_estimate");
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

  it("settles pending work once and reports uncertain containment without rejecting an event-triggered close", async () => {
    const original = managedProcesses.spawnManagedProcess;
    const injected = vi.spyOn(managedProcesses, "spawnManagedProcess").mockImplementationOnce(async (options) => {
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

  it("keeps one process, session and history across two turns with appended instructions", async () => {
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

  it("decodes JSON lines and UTF-8 characters split across chunks", async () => {
    const { channel, events } = await setup();
    expect((await channel.send("split")).text).toBe("split 🌙");
    expect(events.filter((event) => event.type === "text").map((event) => event.data)).toEqual(["split 🌙"]);
  }, 15_000);

  it("fails a malformed protocol explicitly and settles the pending turn once", async () => {
    const { channel, events } = await setup();
    const result = await channel.send("malformed");
    expect(result.status).toBe("interrupted");
    expect(result.error?.message).toContain("malformed JSON");
    await channel.close();
    expect(events.filter((event) => event.type === "turn_end")).toHaveLength(1);
    expect(events.filter((event) => event.type === "closed")).toHaveLength(1);
  }, 15_000);

  it("uses only the main conversation for the meter and preserves native terminal/cache usage", async () => {
    const { channel, events } = await setup();
    const result = await channel.send("meters");
    expect(result.contextTokens).toBe(22);
    expect(result.usage?.inputTokens).toBe(70);
    expect(result.usage?.cachedInputTokens).toBe(40);
    expect(result.usage?.raw.cache_creation).toEqual({ ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 20 });
    expect(events.some((event) => event.type === "usage" && (event.data as { scope: string }).scope === "auxiliary")).toBe(true);
  }, 15_000);

  it("keeps rate limit, context overflow, login and refusal distinct without restarting", async () => {
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

  it("settles a stream death mid-tool call as interrupted and preserves partial files", async () => {
    const { channel, events, cwd } = await setup();
    const result = await channel.send("die");
    expect(result.status).toBe("interrupted");
    expect(result.error?.kind).toBe("transport");
    expect(await readFile(join(cwd, "partial.txt"), "utf8")).toBe("partial edit\n");
    expect(events.filter((event) => event.type === "tool_call")).toHaveLength(1);
    expect(events.filter((event) => event.type === "turn_end")).toHaveLength(1);
  }, 15_000);

  it("interrupts after a partial edit without freshening the session or replaying", async () => {
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

  it("ends an unresponsive native stop and settles pending work once", async () => {
    const { channel, events } = await setup({ interruptTimeoutMs: 30 });
    const pending = channel.send("ignore-interrupt");
    await until(() => events.some((event) => event.type === "tool_call"));
    await channel.interrupt();
    expect((await pending).status).toBe("interrupted");
    await channel.close();
    expect(events.filter((event) => event.type === "turn_end")).toHaveLength(1);
  }, 15_000);

  it("never answers an approval without an explicit response and drops stopped request ids", async () => {
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

  it("emits text deltas without replaying the completed assistant text", async () => {
    const { channel, events } = await setup();
    expect((await channel.send("partial-events")).text).toBe("first second");
    expect(events.filter((event) => event.type === "text").map((event) => event.data)).toEqual(["first ", "second"]);
  }, 15_000);
});
