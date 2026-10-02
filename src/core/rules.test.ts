import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRoster } from "./roster.js";
import { checkRules, loadRules, MAX_RULES_CHARS, parseAgentRules, RulesError } from "./rules.js";

describe("agent.md", () => {
  it("splits into one section per soldier, ignoring text before the first section", () => {
    const s = parseAgentRules("# Title\nintro\n\n## grok\n- build only\n\n## agy\n- test only\n- no code\n");
    expect([...s.keys()]).toEqual(["grok", "agy"]);
    expect(s.get("agy")).toBe("- test only\n- no code");
  });

  it("refuses two sections for the same soldier", () => {
    expect(() => parseAgentRules("## grok\na\n## grok\nb")).toThrow(RulesError);
  });
});

describe("checkRules", () => {
  it("flags sections for unknown soldiers and anything too long for a brief", () => {
    const problems = checkRules(
      { all: "x".repeat(MAX_RULES_CHARS + 1), perSoldier: new Map([["ghost", "a"], ["grok", "y".repeat(5000)]]) },
      ["grok", "agy"],
    );
    expect(problems.join("\n")).toMatch(/rules\.md is \d+ characters/);
    expect(problems.join("\n")).toMatch(/"ghost", which is not a soldier/);
    expect(problems.join("\n")).toMatch(/section "grok" is 5000 characters/);
    expect(checkRules({ all: "ok", perSoldier: new Map([["grok", "ok"]]) }, ["grok"])).toEqual([]);
  });
});

describe("loading", () => {
  it("prefers the working directory's files and drops rules.md's title line", () => {
    const dir = mkdtempSync(join(tmpdir(), "shadow-rules-"));
    try {
      writeFileSync(join(dir, "rules.md"), "# My rules\n\n1. Be careful.\n");
      writeFileSync(join(dir, "agent.md"), "## grok\n- local grok rule\n");
      const r = loadRules(dir);
      expect(r.all).toBe("1. Be careful.");
      expect(r.perSoldier.get("grok")).toBe("- local grok rule");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the shipped files are strict and every section names a real soldier", () => {
    const roster = loadRoster();
    expect(roster.rules.all).toMatch(/^These rules apply to every task/);
    expect(roster.rules.all).toMatch(/Leave git alone/);
    expect(roster.rules.all).toMatch(/Never read, print, copy or send secrets/);
    expect([...roster.rules.perSoldier.keys()].every((k) => roster.soldiers.has(k))).toBe(true);
    expect(roster.rules.perSoldier.get("grok")).toMatch(/Never review/);
  });

  it("a section for a soldier that does not exist stops the roster from loading", () => {
    const dir = mkdtempSync(join(tmpdir(), "shadow-rules-"));
    try {
      writeFileSync(join(dir, "agent.md"), "## ghost\n- boo\n");
      expect(() => loadRoster(dir)).toThrow(/"ghost", which is not a soldier/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
