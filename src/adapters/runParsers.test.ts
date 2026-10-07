import { describe, expect, it } from "vitest";
import { parseAgyRun, parseClaudeRun, parseCodexRun, parseGrokRun } from "./runParsers.js";

describe("parseClaudeRun", () => {
  const ok = JSON.stringify({
    stop_reason: "end_turn",
    session_id: "s1",
    total_cost_usd: 0.0467,
    usage: { input_tokens: 2, cache_read_input_tokens: 13813, cache_creation_input_tokens: 10457, output_tokens: 210 },
    modelUsage: { "claude-sonnet-5-5": { inputTokens: 2 } },
    is_error: false,
    subtype: "success",
    result: "pong",
  });

  it("reads result, usage (including cache), cost, session and resolved model", () => {
    expect(parseClaudeRun(ok)).toEqual({
      text: "pong",
      isError: false,
      errorMessage: undefined,
      usage: { inputTokens: 24272, outputTokens: 210 },
      costUsd: 0.0467,
      sessionId: "s1",
      resolvedModel: "claude-sonnet-5-5",
    });
  });

  it("flags is_error and non-success subtypes", () => {
    const bad = JSON.stringify({ is_error: true, subtype: "error_during_execution", result: "boom" });
    expect(parseClaudeRun(bad)).toMatchObject({ isError: true, errorMessage: "boom" });
  });

  it("reports unreadable output as an error", () => {
    expect(parseClaudeRun("not json")).toMatchObject({ isError: true });
  });
});

describe("parseCodexRun", () => {
  const events = [
    "Reading additional input from stdin...",
    '{"type":"thread.started","thread_id":"t1"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"pong"}}',
    '{"type":"turn.completed","usage":{"input_tokens":19951,"output_tokens":5}}',
  ].join("\n");

  it("takes the last agent_message and the turn usage, ignoring non-JSON lines", () => {
    expect(parseCodexRun(events)).toEqual({
      text: "pong",
      isError: false,
      usage: { inputTokens: 19951, outputTokens: 5 },
      sessionId: "t1",
    });
  });

  it("surfaces turn.failed as an error", () => {
    const failed = '{"type":"turn.failed","error":{"message":"model not found"}}';
    expect(parseCodexRun(failed)).toMatchObject({ isError: true, errorMessage: "model not found" });
  });

  it("treats a run with no answer as an error", () => {
    expect(parseCodexRun('{"type":"turn.started"}')).toMatchObject({ isError: true });
  });
});

describe("parseGrokRun", () => {
  const out = JSON.stringify({
    text: "pong",
    stopReason: "end_turn",
    sessionId: "g1",
    usage: { input_tokens: 20563, output_tokens: 30 },
    total_cost_usd: 0.0143,
    modelUsage: { "grok-4.7-build": {} },
  });

  it("reads text, usage, cost, session and resolved model", () => {
    expect(parseGrokRun(out)).toMatchObject({
      text: "pong",
      isError: false,
      usage: { inputTokens: 20563, outputTokens: 30 },
      costUsd: 0.0143,
      sessionId: "g1",
      resolvedModel: "grok-4.7-build",
    });
  });

  it("counts cached input, which grok leaves out of input_tokens", () => {
    // Usage as grok -p reported it on 2026-10-07.
    const cached = JSON.stringify({
      text: "Lantern is a tiny command-line tool.",
      stopReason: "end_turn",
      usage: { input_tokens: 22063, cache_read_input_tokens: 23936, cache_creation_input_tokens: 0, output_tokens: 333 },
    });
    expect(parseGrokRun(cached).usage).toEqual({ inputTokens: 45999, outputTokens: 333 });
  });

  it("flags an empty answer with a non-end_turn stop reason", () => {
    expect(parseGrokRun(JSON.stringify({ text: "", stopReason: "max_tokens" }))).toMatchObject({ isError: true });
  });
});

describe("parseAgyRun", () => {
  it("reads response and usage on SUCCESS", () => {
    const out = JSON.stringify({
      conversation_id: "a1",
      status: "SUCCESS",
      response: "pong\n",
      usage: { input_tokens: 13278, output_tokens: 540 },
    });
    expect(parseAgyRun(out)).toMatchObject({
      text: "pong\n",
      isError: false,
      usage: { inputTokens: 13278, outputTokens: 540 },
      sessionId: "a1",
    });
  });

  it("counts cached input, which agy leaves out of input_tokens", () => {
    // Usage as agy -p reported it on 2026-10-07.
    const out = JSON.stringify({
      conversation_id: "a2",
      status: "SUCCESS",
      response: "Lantern is a small command-line tool.",
      usage: { input_tokens: 15177, output_tokens: 1250, thinking_tokens: 922, cache_read_tokens: 12141, total_tokens: 16427 },
    });
    expect(parseAgyRun(out).usage).toEqual({ inputTokens: 27318, outputTokens: 1250 });
  });

  it("flags any status other than SUCCESS", () => {
    expect(parseAgyRun(JSON.stringify({ status: "FAILED", response: "" }))).toMatchObject({
      isError: true,
      errorMessage: "agy status FAILED",
    });
  });

  describe("error reason", () => {
    const err = (fields: Record<string, unknown>, stderr?: string) =>
      parseAgyRun(JSON.stringify({ status: "ERROR", ...fields }), stderr);

    it("uses an `error` string", () => {
      expect(err({ error: "quota exceeded" })).toMatchObject({
        isError: true,
        errorMessage: "agy status ERROR: quota exceeded",
      });
    });

    it("uses `error.message` when `error` is an object", () => {
      expect(err({ error: { code: 429, message: "rate limited" } }).errorMessage).toBe("agy status ERROR: rate limited");
    });

    it("uses a top-level `message`", () => {
      expect(err({ message: "model not found" }).errorMessage).toBe("agy status ERROR: model not found");
    });

    it("uses the `response` text, and keeps it as the parsed text", () => {
      expect(err({ response: "Could not reach the tool server.\n" })).toMatchObject({
        text: "Could not reach the tool server.\n",
        isError: true,
        errorMessage: "agy status ERROR: Could not reach the tool server.",
      });
    });

    it("takes the first present of error, error.message, message, response", () => {
      const all = { error: "e", message: "m", response: "r" };
      expect(err(all).errorMessage).toBe("agy status ERROR: e");
      expect(err({ ...all, error: { message: "em" } }).errorMessage).toBe("agy status ERROR: em");
      expect(err({ ...all, error: { code: 1 } }).errorMessage).toBe("agy status ERROR: m");
      expect(err({ error: "  ", message: "m", response: "r" }).errorMessage).toBe("agy status ERROR: m");
      expect(err({ response: "r" }).errorMessage).toBe("agy status ERROR: r");
    });

    it("flattens whitespace and clips a long reason with an ellipsis", () => {
      expect(err({ error: "line one\n\n  line   two\ttabbed" }).errorMessage).toBe(
        "agy status ERROR: line one line two tabbed",
      );
      const clipped = err({ response: `${"x".repeat(299)}y${"z".repeat(100)}` }).errorMessage ?? "";
      expect(clipped).toBe(`agy status ERROR: ${"x".repeat(299)}…`);
      const exact = "x".repeat(300);
      expect(err({ error: exact }).errorMessage).toBe(`agy status ERROR: ${exact}`);
    });

    it("keeps the full response as text even when the reason is clipped", () => {
      const long = "a ".repeat(400);
      expect(err({ response: long }).text).toBe(long);
    });

    it("falls back to the bare status when the JSON has no reason", () => {
      expect(err({}).errorMessage).toBe("agy status ERROR");
      expect(err({ response: "", error: "", message: " " }).errorMessage).toBe("agy status ERROR");
      expect(err({ error: null, message: 7 }).errorMessage).toBe("agy status ERROR");
    });

    it("appends the last non-empty stderr line when the JSON has no reason", () => {
      expect(err({ response: "" }, "warming up\r\nauth token expired\r\n\r\n  \n").errorMessage).toBe(
        "agy status ERROR: auth token expired",
      );
      expect(err({}, "x".repeat(400)).errorMessage).toBe(`agy status ERROR: ${"x".repeat(299)}…`);
      expect(err({}, " \n\n").errorMessage).toBe("agy status ERROR");
    });

    it("prefers the JSON reason over stderr", () => {
      expect(err({ error: "quota exceeded" }, "something else").errorMessage).toBe("agy status ERROR: quota exceeded");
    });

    it("ignores stderr and reasons on SUCCESS", () => {
      const ok = parseAgyRun(JSON.stringify({ status: "SUCCESS", response: "pong", message: "m" }), "noise");
      expect(ok).toMatchObject({ text: "pong", isError: false, errorMessage: undefined });
    });
  });
});
