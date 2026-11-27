import { describe, expect, it } from "vitest";
import { makeRoster, shippedRoster } from "../core/roster.testutil.js";
import { buildStandingInstructions, estimateInstructionTokens, InstructionsTooLargeError, MAX_INSTRUCTION_TOKENS, shadowName } from "./instructions.js";

describe("standing instructions", () => {
  it("includes the actual team, hard rules, full shared and soldier rules, report and handoff", () => {
    const roster = shippedRoster();
    for (const soldier of roster.soldiers.values()) {
      const text = buildStandingInstructions(roster, soldier);
      expect(text).toContain(`${shadowName(soldier.key)} (${soldier.key}), model ${soldier.model}`);
      expect(text).toContain(`roles: ${soldier.roles.filter((role) => role !== "orchestrate").join(", ")}`);
      expect(text).toContain("Claude Code is the Monarch");
      expect(text).toContain("Grok never reviews; agy never writes");
      expect(text).toContain(roster.rules.all);
      expect(text).toContain(roster.rules.perSoldier.get(soldier.key) ?? "(none)");
      for (const member of roster.soldiers.values()) {
        expect(text).toContain(`${shadowName(member.key)} (${member.key}): ${member.model}; ${member.roles.filter((role) => role !== "orchestrate").join(", ")}`);
      }
      expect(text).not.toContain("Tank (");
      expect(text).toContain("at most five lines of at most 120 characters each");
      expect(text).toContain("When asked for a handoff, reply under these headings: working on, done, decided, files, open");
      expect(text).toContain("200,000 context tokens");
      expect(text).toContain("working on, done, decided, files, open");
      expect(estimateInstructionTokens(text)).toBeLessThan(MAX_INSTRUCTION_TOKENS);
    }
  });

  it("keeps Claude as v2 Monarch regardless of legacy routing authority", () => {
    const roster = makeRoster({ legacy: { cli: "claude", model: "opus", roles: ["orchestrate", "review"] } });
    roster.monarch.default = "legacy";
    const text = buildStandingInstructions(roster, roster.soldiers.get("legacy")!);
    expect(text).toContain("roles: review.");
    expect(text).toContain("Claude Code is the Monarch. Only the Monarch plans and assigns work");
    expect(text).not.toContain("orchestrate");
  });

  it("does not copy another soldier's private instructions", () => {
    const roster = makeRoster({
      alpha: { cli: "claude", model: "opus", roles: ["build"] },
      beta: { cli: "claude", model: "sonnet", roles: ["research"] },
    }, undefined, { all: "Common instruction", perSoldier: new Map([["alpha", "ALPHA ONLY"], ["beta", "BETA ONLY"]]) });
    const text = buildStandingInstructions(roster, roster.soldiers.get("alpha")!);
    expect(text).toContain("ALPHA ONLY");
    expect(text).not.toContain("BETA ONLY");
  });

  it("makes a configured build soldier explicitly read-only when claims are unavailable", () => {
    const roster = makeRoster({ builder: { cli: "claude", model: "opus", roles: ["build"], write: true } });
    const soldier = roster.soldiers.get("builder")!;
    const text = buildStandingInstructions(roster, soldier, { readOnly: true });
    expect(text).toContain("Do not create, change or delete files");
    expect(text).toContain("including generated or build output");
    expect(text).toContain("A build role grants no write permission here");
    expect(text).toContain("describe what is needed instead");
    expect(buildStandingInstructions(roster, soldier)).not.toContain("This is a read-only session");
  });

  it("rejects oversized instructions without truncating rules", () => {
    const roster = makeRoster({ a: { cli: "claude", model: "opus", roles: ["build"] } }, undefined,
      { all: "x".repeat(4_500), perSoldier: new Map() });
    expect(() => buildStandingInstructions(roster, roster.soldiers.get("a")!)).toThrow(/must be below 1500/);
  });

  // SI-3, builder only: this test is the proof of the byte count (3 bytes per token) and of the error text at the
  // 1,500 boundary. The office-open evidence (log record, no leftover workspace or lease) is separate: postOffice tests.
  it("refuses at exactly 1,500 tokens, naming the count, rules.md and the agent.md section (SI-3)", () => {
    const make = (n: number) => makeRoster({ a: { cli: "claude", model: "opus", roles: ["build"] } }, undefined, { all: "x".repeat(n), perSoldier: new Map() });
    const base = estimateInstructionTokens(buildStandingInstructions(make(0), make(0).soldiers.get("a")!));
    // each x adds one byte, so three bytes add one token
    const pad = (MAX_INSTRUCTION_TOKENS - 1 - base) * 3;
    const ok = make(pad);
    expect(estimateInstructionTokens(buildStandingInstructions(ok, ok.soldiers.get("a")!))).toBe(MAX_INSTRUCTION_TOKENS - 1);
    const over = make(pad + 3);
    let error: unknown;
    try { buildStandingInstructions(over, over.soldiers.get("a")!); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(InstructionsTooLargeError);
    expect((error as InstructionsTooLargeError).estimate).toBe(MAX_INSTRUCTION_TOKENS);
    expect((error as Error).message).toMatch(/estimate 1500 tokens.*rules\.md.*"## a" section of agent\.md/);
  });

  it("uses configured shadow names for the soldier and the team", () => {
    const roster = makeRoster({ a: { cli: "claude", model: "opus", roles: ["build"] }, b: { cli: "claude", model: "sonnet", roles: ["research"] } });
    const text = buildStandingInstructions(roster, roster.soldiers.get("a")!, { names: new Map([["a", "Scout"], ["b", "Ward"]]) });
    expect(text).toContain("You are Scout (a)");
    expect(text).toContain("- Ward (b)");
  });

  it("counts UTF-8 bytes in the estimate and uses a fallback name for custom soldiers", () => {
    expect(estimateInstructionTokens("éé")).toBe(2);
    expect(shadowName("claude-opus-build")).toBe("Tank");
    expect(shadowName("custom")).toBe("custom");
    expect(shadowName("__proto__")).toBe("__proto__");
  });
});
