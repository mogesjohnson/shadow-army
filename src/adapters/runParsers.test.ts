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

  it("flags any status other than SUCCESS", () => {
    expect(parseAgyRun(JSON.stringify({ status: "FAILED", response: "" }))).toMatchObject({
      isError: true,
      errorMessage: "agy status FAILED",
    });
  });
});
