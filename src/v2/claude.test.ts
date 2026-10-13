import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
afterEach(async () => {
  await Promise.all(channels.splice(0).map((channel) => channel.close()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe("native persistent Claude channel (synthetic protocol; no provider calls)", () => {
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
