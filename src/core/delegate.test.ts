import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DelegateError, parseDelegate, parseDelegateV2 } from "./delegate.js";

const doc = (yaml: string, body = "# Guide\n\nprose") => `---\n${yaml}\n---\n${body}`;

const minimal = `
monarch:
  default: m
soldiers:
  m:
    roles: [orchestrate]
  b:
    roles: [build]
`;

describe("the shipped orchestratorDelegate.md", () => {
  const d = parseDelegate(readFileSync(new URL("../../orchestratorDelegate.md", import.meta.url), "utf8"));

  it("keeps the hard rules", () => {
    expect(d.policy.soldiers["grok"]!.forbidden).toEqual(["review"]);
    expect(d.policy.soldiers["agy"]).toMatchObject({ write: false, roles: ["research", "test"] });
    expect(d.policy.soldiers["claude-opus"]!.buildFor).toEqual(["hard"]);
  });

  it("names the monarch order and returns the prose guide", () => {
    expect(d.policy.monarch).toEqual({ default: "codex-astra", fallback: "claude-opus" });
    expect(d.guide).toContain("# Orchestrator Delegation Guide");
    expect(d.guide).not.toContain("monarch:"); // front-matter is not part of the guide
  });
});

describe("parseDelegate", () => {
  it("applies defaults: cost 2, write allowed, nothing forbidden", () => {
    const d = parseDelegate(doc(minimal));
    expect(d.policy.soldiers["b"]).toEqual({ roles: ["build"], cost: 2, forbidden: [], write: true });
    expect(d.guide).toContain("prose");
  });

  it("accepts Windows line endings and a byte-order mark", () => {
    const crlf = ("﻿" + doc(minimal)).replace(/\n/g, "\r\n");
    expect(parseDelegate(crlf).policy.soldiers["b"]).toBeDefined();
  });

  it("requires a front-matter block", () => {
    expect(() => parseDelegate("# just prose")).toThrow(DelegateError);
    expect(() => parseDelegate("# just prose")).toThrow(/front-matter/);
  });

  it("reports YAML syntax errors", () => {
    expect(() => parseDelegate(doc("monarch: [unclosed"))).toThrow(/not valid YAML/);
  });

  it("rejects a misspelled rule key instead of silently ignoring a hard rule", () => {
    const typo = minimal.replace("roles: [build]", "roles: [build]\n    forbiden: [review]");
    expect(() => parseDelegate(doc(typo))).toThrow(DelegateError);
    expect(() => parseDelegate(doc(typo))).toThrow(/forbiden/);
    expect(() => parseDelegate(doc(minimal.replace("monarch:", "monarchs:")))).toThrow(DelegateError);
  });

  it("rejects an unknown role and an out-of-range cost", () => {
    expect(() => parseDelegate(doc(minimal.replace("[build]", "[bake]")))).toThrow(DelegateError);
    expect(() => parseDelegate(doc(minimal.replace("roles: [build]", "roles: [build]\n    cost: 9")))).toThrow(DelegateError);
  });

  it("rejects contradictions", () => {
    const both = minimal.replace("roles: [build]", "roles: [build, review]\n    forbidden: [review]");
    expect(() => parseDelegate(doc(both))).toThrow(/both granted in roles and listed in forbidden/);

    const noWriteBuild = minimal.replace("roles: [build]", "roles: [build]\n    write: false");
    expect(() => parseDelegate(doc(noWriteBuild))).toThrow(/cannot have the build role/);

    const buildForNoBuild = minimal.replace("roles: [build]", "roles: [research]\n    buildFor: [hard]");
    expect(() => parseDelegate(doc(buildForNoBuild))).toThrow(/does not have the build role/);
  });

  it("requires the monarch to be an orchestrator that exists", () => {
    expect(() => parseDelegate(doc(minimal.replace("default: m", "default: ghost")))).toThrow(/not a soldier in this file/);
    expect(() => parseDelegate(doc(minimal.replace("default: m", "default: b")))).toThrow(/orchestrate role/);
    expect(() => parseDelegate(doc(minimal.replace("default: m", "default: m\n  fallback: b")))).toThrow(/monarch.fallback/);
  });
});

describe("parseDelegateV2 (Claude is the Monarch)", () => {
  const noMonarch = minimal.replace("monarch:\n  default: m\n", "");

  it("accepts a file with no monarch block, and v1 still refuses it", () => {
    expect(noMonarch).not.toContain("monarch");
    const d = parseDelegateV2(doc(noMonarch));
    expect(d.policy.soldiers["b"]).toEqual({ roles: ["build"], cost: 2, forbidden: [], write: true });
    expect(d.policy).not.toHaveProperty("monarch");
    expect(() => parseDelegate(doc(noMonarch))).toThrow(DelegateError);
  });

  it("ignores a stale monarch block: unknown soldier, no orchestrate role, wrong shape", () => {
    for (const block of ["monarch:\n  default: ghost", "monarch:\n  default: b\n  fallback: ghost", "monarch: nonsense", "monarch:\n  who: me"]) {
      const text = noMonarch.replace("soldiers:", `${block}\nsoldiers:`);
      expect(() => parseDelegateV2(doc(text))).not.toThrow();
      expect(() => parseDelegate(doc(text))).toThrow(DelegateError);
    }
  });

  it("keeps every soldier rule and the strict keys: a delegate file can only restrict", () => {
    const refused: Array<[string, RegExp]> = [
      [noMonarch.replace("roles: [build]", "roles: [build, review]\n    forbidden: [review]"), /both granted in roles and listed in forbidden/],
      [noMonarch.replace("roles: [build]", "roles: [build]\n    write: false"), /cannot have the build role/],
      [noMonarch.replace("roles: [build]", "roles: [research]\n    buildFor: [hard]"), /does not have the build role/],
      [noMonarch.replace("roles: [build]", "roles: [build]\n    forbiden: [review]"), /forbiden/],
      [noMonarch.replace("roles: [build]", "roles: [bake]"), /roles/],
      [noMonarch.replace("soldiers:", "soldier:"), /soldier/],
    ];
    for (const [text, why] of refused) expect(() => parseDelegateV2(doc(text))).toThrow(why);
  });

  it("ignores a conflict limited to the legacy orchestrate role, and drops the role; v1 still refuses it", () => {
    const text = noMonarch.replace("roles: [build]", "roles: [build, orchestrate]\n    forbidden: [orchestrate]");
    expect(() => parseDelegate(doc(text.replace("soldiers:", "monarch:\n  default: b\nsoldiers:")))).toThrow(
      /"orchestrate" is both granted in roles and listed in forbidden/,
    );
    const d = parseDelegateV2(doc(text));
    expect(d.policy.soldiers["b"]).toEqual({ roles: ["build"], cost: 2, forbidden: [], write: true });
    expect(JSON.stringify(d.policy)).not.toContain("orchestrate");
  });

  it("still refuses a conflict on a role v2 uses, next to the legacy one", () => {
    const text = noMonarch.replace("roles: [build]", "roles: [build, review, orchestrate]\n    forbidden: [review, orchestrate]");
    expect(() => parseDelegateV2(doc(text))).toThrow(/"review" is both granted/);
  });

  it("parses the shipped file the same way v1 does, apart from the monarch block and the orchestrate role", () => {
    const text = readFileSync(new URL("../../orchestratorDelegate.md", import.meta.url), "utf8");
    const v1 = parseDelegate(text);
    const v2 = parseDelegateV2(text);
    const noLegacy = Object.fromEntries(
      Object.entries(v1.policy.soldiers).map(([k, v]) => [
        k,
        { ...v, roles: v.roles.filter((r) => r !== "orchestrate"), forbidden: v.forbidden.filter((r) => r !== "orchestrate") },
      ]),
    );
    expect(v2.policy.soldiers).toEqual(noLegacy);
    expect(v2.guide).toBe(v1.guide);
  });
});
