import { describe, expect, it } from "vitest";
import type { Autonomy, RunRequest } from "./Adapter.js";
import { agyArgs } from "./agy.js";
import { claudeArgs } from "./claude.js";
import { codexArgs } from "./codex.js";
import { grokArgs } from "./grok.js";

const req = (autonomy: Autonomy | undefined, write = false): RunRequest => ({
  prompt: "p",
  model: "m",
  cwd: "/work",
  write,
  autonomy,
  timeoutMs: 1000,
});
const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("each autonomy level maps to the vendor's own flags", () => {
  it("claude: plan/acceptEdits, then its classifier (auto), then bypassPermissions", () => {
    expect(after(claudeArgs(req(undefined)), "--permission-mode")).toBe("plan");
    expect(after(claudeArgs(req("supervised", true)), "--permission-mode")).toBe("acceptEdits");
    expect(after(claudeArgs(req("auto")), "--permission-mode")).toBe("auto");
    expect(after(claudeArgs(req("full")), "--permission-mode")).toBe("bypassPermissions");
  });

  it("codex: read-only/workspace-write sandbox, then automatic review, then full access", () => {
    expect(after(codexArgs(req("supervised")), "-s")).toBe("read-only");
    expect(after(codexArgs(req("supervised", true)), "-s")).toBe("workspace-write");
    const auto = codexArgs(req("auto"));
    expect(after(auto, "-s")).toBe("workspace-write");
    expect(auto).toContain("--approve-for-me");
    const full = codexArgs(req("full"));
    expect(after(full, "-s")).toBe("danger-full-access");
    expect(full).toContain('approval_policy="never"');
    expect(full.at(-1)).toBe("-"); // the brief still comes on stdin
  });

  it("grok: plan/acceptEdits, then auto, then always-approve", () => {
    expect(after(grokArgs(req("supervised"), "f"), "--permission-mode")).toBe("plan");
    expect(after(grokArgs(req("auto"), "f"), "--permission-mode")).toBe("auto");
    const full = grokArgs(req("full"), "f");
    expect(full).toContain("--always-approve");
    expect(full).not.toContain("--permission-mode");
  });

  it("agy: no classifier mode, so auto stays in plan mode; full skips permissions", () => {
    expect(after(agyArgs(req("supervised")), "--mode")).toBe("plan");
    expect(after(agyArgs(req("auto")), "--mode")).toBe("plan");
    const full = agyArgs(req("full"));
    expect(full).toContain("--dangerously-skip-permissions");
    expect(full).not.toContain("--mode");
  });

  it("under auto and full, the write flag no longer changes the CLI's mode", () => {
    for (const level of ["auto", "full"] as const) {
      expect(claudeArgs(req(level, true))).toEqual(claudeArgs(req(level, false)));
      expect(codexArgs(req(level, true))).toEqual(codexArgs(req(level, false)));
      expect(grokArgs(req(level, true), "f")).toEqual(grokArgs(req(level, false), "f"));
    }
  });
});
