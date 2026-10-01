import { describe, expect, it } from "vitest";
import type { RunRequest } from "./Adapter.js";
import { agyArgs } from "./agy.js";
import { claudeArgs } from "./claude.js";
import { codexArgs } from "./codex.js";
import { grokArgs } from "./grok.js";

const req = (over: Partial<RunRequest> = {}): RunRequest => ({
  prompt: "do it",
  model: "m",
  cwd: "/work",
  write: false,
  timeoutMs: 1000,
  ...over,
});

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("read-only by default, write only when asked", () => {
  it("claude", () => {
    expect(after(claudeArgs(req()), "--permission-mode")).toBe("plan");
    expect(after(claudeArgs(req({ write: true })), "--permission-mode")).toBe("acceptEdits");
  });
  it("codex", () => {
    expect(after(codexArgs(req()), "-s")).toBe("read-only");
    expect(after(codexArgs(req({ write: true })), "-s")).toBe("workspace-write");
  });
  it("grok", () => {
    expect(after(grokArgs(req()), "--permission-mode")).toBe("plan");
    expect(after(grokArgs(req({ write: true })), "--permission-mode")).toBe("acceptEdits");
  });
  it("agy is always in plan mode, even if write is requested", () => {
    expect(after(agyArgs(req({ write: true })), "--mode")).toBe("plan");
  });
});

describe("shared request fields", () => {
  it("passes model, prompt and cwd", () => {
    expect(after(claudeArgs(req()), "--model")).toBe("m");
    expect(after(claudeArgs(req()), "-p")).toBe("do it");
    expect(after(codexArgs(req()), "-C")).toBe("/work");
    expect(after(grokArgs(req()), "--cwd")).toBe("/work");
    expect(codexArgs(req()).at(-1)).toBe("do it");
  });
  it("maps effort, with max becoming xhigh for codex", () => {
    expect(after(claudeArgs(req({ effort: "high" })), "--effort")).toBe("high");
    expect(after(grokArgs(req({ effort: "low" })), "--reasoning-effort")).toBe("low");
    expect(after(agyArgs(req({ effort: "max" })), "--effort")).toBe("max");
    expect(after(codexArgs(req({ effort: "max" })), "-c")).toBe('model_reasoning_effort="xhigh"');
  });
});
