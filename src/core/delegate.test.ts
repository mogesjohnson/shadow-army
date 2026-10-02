import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DelegateError, parseDelegate } from "./delegate.js";

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
