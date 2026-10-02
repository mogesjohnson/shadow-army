import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";
import { parseDelegate } from "./delegate.js";
import { buildRoster, loadRoster, RosterError } from "./roster.js";

const config = (soldiers: Record<string, { cli: string; model: string }>) => parseConfig(JSON.stringify({ soldiers }));
const delegate = (soldiers: string) =>
  parseDelegate(`---\nmonarch:\n  default: m\nsoldiers:\n${soldiers}\n---\nprose`);

const policy = `  m:\n    roles: [orchestrate]\n    cost: 3\n  b:\n    roles: [build]\n    cost: 1`;
const runtime = { m: { cli: "one", model: "m1" }, b: { cli: "two", model: "m2" } };

describe("buildRoster", () => {
  it("merges runtime settings with policy and carries the prose guide", () => {
    const r = buildRoster(config(runtime), delegate(policy));
    expect(r.soldiers.get("b")).toEqual({
      key: "b", cli: "two", model: "m2", roles: ["build"], cost: 1, buildFor: undefined, forbidden: [], write: true,
    });
    expect(r.monarch).toEqual({ default: "m" });
    expect(r.guide).toBe("prose");
  });

  it("refuses a soldier that has no policy, since it would run without its rules", () => {
    const withExtra = { ...runtime, z: { cli: "three", model: "m3" } };
    expect(() => buildRoster(config(withExtra), delegate(policy))).toThrow(RosterError);
    expect(() => buildRoster(config(withExtra), delegate(policy))).toThrow(/"z" is in shadow.config.json but has no policy/);
  });

  it("refuses a soldier that has no cli or model", () => {
    const { b: _drop, ...onlyM } = runtime;
    expect(() => buildRoster(config(onlyM), delegate(policy))).toThrow(/"b" is in orchestratorDelegate.md but has no cli\/model/);
  });

  it("lists every disagreement, not just the first", () => {
    const both = { m: runtime.m, z: { cli: "x", model: "y" } };
    expect(() => buildRoster(config(both), delegate(policy))).toThrow(/"z".*\n.*"b"/);
  });
});

describe("the shipped files", () => {
  it("agree with each other", () => {
    const r = loadRoster();
    expect([...r.soldiers.keys()]).toEqual(["codex-astra", "codex-sol", "claude-opus", "claude-sonnet", "grok", "agy"]);
    expect(r.soldiers.get("agy")).toMatchObject({ cli: "agy", write: false, roles: ["research", "test"] });
    expect(r.soldiers.get("grok")).toMatchObject({ cli: "grok", forbidden: ["review"] });
    expect(r.guide.length).toBeGreaterThan(100);
  });
});
