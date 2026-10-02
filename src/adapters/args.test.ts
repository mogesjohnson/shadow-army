import { describe, expect, it } from "vitest";
import type { RunRequest } from "./Adapter.js";
import { agyArgs } from "./agy.js";
import { claudeArgs } from "./claude.js";
import { codexArgs } from "./codex.js";
import { grokArgs } from "./grok.js";

const req = (over: Partial<RunRequest> = {}): RunRequest => ({
  prompt: "line one\nline two",
  model: "m",
  cwd: "/work",
  write: false,
  timeoutMs: 1000,
  ...over,
});

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
const FILE = "/tmp/prompt.txt";

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
    expect(after(grokArgs(req(), FILE), "--permission-mode")).toBe("plan");
    expect(after(grokArgs(req({ write: true }), FILE), "--permission-mode")).toBe("acceptEdits");
  });
  it("agy is always in plan mode, even if write is requested", () => {
    expect(after(agyArgs(req({ write: true })), "--mode")).toBe("plan");
  });
});

describe("the brief never goes on the command line for CLIs that can read it elsewhere", () => {
  // A Windows .cmd shim cannot take an argument with a line break, and every brief has one.
  const noLineBreaks = (args: string[]) => args.every((a) => !/[\r\n]/.test(a));

  it("claude: -p with no prompt argument (stdin)", () => {
    const args = claudeArgs(req());
    expect(noLineBreaks(args)).toBe(true);
    expect(args).not.toContain("line one\nline two");
    expect(args[0]).toBe("-p");
    expect(after(args, "-p")).toBe("--output-format");
  });

  it("codex: a trailing '-' (stdin)", () => {
    const args = codexArgs(req());
    expect(noLineBreaks(args)).toBe(true);
    expect(args.at(-1)).toBe("-");
  });

  it("grok: --prompt-file", () => {
    const args = grokArgs(req(), FILE);
    expect(noLineBreaks(args)).toBe(true);
    expect(after(args, "--prompt-file")).toBe(FILE);
    expect(args).not.toContain("-p");
  });

  it("agy: the -p= argument, attached so a brief starting with '-' is not read as a flag", () => {
    expect(agyArgs(req())[0]).toBe("-p=line one\nline two");
    expect(agyArgs(req({ prompt: "--not-a-flag" }))[0]).toBe("-p=--not-a-flag");
  });
});

describe("shared request fields", () => {
  it("passes model and cwd", () => {
    expect(after(claudeArgs(req()), "--model")).toBe("m");
    expect(after(codexArgs(req()), "-C")).toBe("/work");
    expect(after(grokArgs(req(), FILE), "--cwd")).toBe("/work");
    expect(after(agyArgs(req()), "--model")).toBe("m");
  });
  it("maps effort, with max becoming xhigh for codex", () => {
    expect(after(claudeArgs(req({ effort: "high" })), "--effort")).toBe("high");
    expect(after(grokArgs(req({ effort: "low" }), FILE), "--reasoning-effort")).toBe("low");
    expect(after(agyArgs(req({ effort: "max" })), "--effort")).toBe("max");
    // codex reads the prompt from stdin, so the effort flag must come before the final "-"
    const codex = codexArgs(req({ effort: "max" }));
    expect(after(codex, "-c")).toBe('model_reasoning_effort="xhigh"');
    expect(codex.at(-1)).toBe("-");
  });
});
