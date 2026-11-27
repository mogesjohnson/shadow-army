import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAdapter } from "../adapters/registry.js";
import { checkAssignment } from "../core/assign.js";
import { loadRoster, RosterError } from "../core/roster.js";
import { shippedRoster } from "../core/roster.testutil.js";
import { route } from "../core/router.js";
import { DEFAULT_SHADOW_NAMES, loadConfiguredShadowNames, loadV2Roster, resolveShadowNames, shadowName } from "./roster.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function projectWith(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "sa-roster-"));
  dirs.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "shadow.config.json"), JSON.stringify(config));
  return dir;
}

describe("shadow names (ARM-3)", () => {
  it("defaults as 2.0 sets them, and a soldier with neither takes its key", () => {
    expect(DEFAULT_SHADOW_NAMES).toEqual({
      "codex-astra": "Bellion", "codex-sol": "Igris", "claude-opus": "Kaisel", "claude-opus-build": "Tank",
      "claude-sonnet": "Iron", grok: "Beru", agy: "Tusk",
    });
    expect(shadowName("custom")).toBe("custom");
    expect(shadowName("__proto__")).toBe("__proto__");
    const names = resolveShadowNames(["grok", "custom"]);
    expect(names.get("grok")).toBe("Beru");
    expect(names.get("custom")).toBe("custom");
  });

  it("lets shadowName override a default", () => {
    expect(resolveShadowNames(["grok"], { grok: "Scout" }).get("grok")).toBe("Scout");
  });

  it("refuses a duplicate name in any case, naming both soldiers", () => {
    expect(() => resolveShadowNames(["grok", "agy"], { agy: "BERU" })).toThrow(/"BERU".*"grok".*"agy"|"BERU".*"agy"/s);
    expect(() => resolveShadowNames(["a", "b"], { a: "Same", b: "same" })).toThrow(RosterError);
    expect(() => resolveShadowNames(["a", "b"], { a: "Same", b: "same" })).toThrow(/"a" and "b"/);
  });

  it("refuses a name that is another soldier's key, in any case", () => {
    expect(() => resolveShadowNames(["grok", "agy"], { agy: "grok" })).toThrow(/key of soldier "grok"/);
    expect(() => resolveShadowNames(["grok", "agy"], { agy: "GROK" })).toThrow(/"agy".*"grok"/);
  });

  it("allows a name equal to the soldier's own key, and refuses an empty one", () => {
    expect(resolveShadowNames(["grok"], { grok: "grok" }).get("grok")).toBe("grok");
    expect(() => resolveShadowNames(["grok"], { grok: "  " })).toThrow(/empty shadowName/);
  });

  it("reads shadowName from the config file and rejects a non-string", () => {
    const dir = projectWith({ soldiers: { grok: { cli: "grok", model: "m", shadowName: "Scout" }, agy: { cli: "agy", model: "m" } } });
    expect(loadConfiguredShadowNames(dir)).toEqual({ grok: "Scout" });
    const bad = projectWith({ soldiers: { grok: { cli: "grok", model: "m", shadowName: 7 } } });
    expect(() => loadConfiguredShadowNames(bad)).toThrow(/not a string/);
  });
});

describe("the shipped roster (ARM-1, M1-AC6)", () => {
  it("loads from the two files, which list the same soldiers, with default names", () => {
    const { roster, names } = loadV2Roster();
    expect([...roster.soldiers.keys()]).toEqual(["codex-sol", "claude-opus", "codex-astra", "claude-sonnet", "grok", "agy"]);
    expect(names.get("codex-astra")).toBe("Bellion");
    expect(names.size).toBe(roster.soldiers.size);
  });

  it("gives Bellion review and hard builds, listed after claude-opus, and v1 still ranks claude-opus first", () => {
    const roster = shippedRoster();
    const keys = [...roster.soldiers.keys()];
    expect(keys.indexOf("codex-astra")).toBeGreaterThan(keys.indexOf("claude-opus"));
    const bellion = roster.soldiers.get("codex-astra")!;
    expect(bellion.roles).toEqual(expect.arrayContaining(["review", "build"]));
    expect(bellion.buildFor).toEqual(["hard"]);
    for (const profile of [{ role: "review" as const }, { role: "build" as const, difficulty: "hard" as const }]) {
      const order = route(roster, getAdapter, profile).candidates.map((c) => c.soldier);
      expect(order.indexOf("claude-opus")).toBeGreaterThanOrEqual(0);
      expect(order.indexOf("claude-opus")).toBeLessThan(order.indexOf("codex-astra"));
    }
  });

  it("keeps v1's Monarch: codex-astra stays monarch.default and keeps orchestrate", () => {
    const roster = shippedRoster();
    expect(roster.monarch.default).toBe("codex-astra");
    expect(roster.soldiers.get("codex-astra")!.roles).toContain("orchestrate");
  });

  it("refuses the files at start when a name clashes", () => {
    const dir = projectWith({ soldiers: {
      "codex-sol": { cli: "codex", model: "m", shadowName: "Beru" },
      "claude-opus": { cli: "claude", model: "opus" },
      "codex-astra": { cli: "codex", model: "m" },
      "claude-sonnet": { cli: "claude", model: "sonnet" },
      grok: { cli: "grok", model: "m" },
      agy: { cli: "agy", model: "m" },
    } });
    expect(() => loadV2Roster(dir)).toThrow(/"Beru".*"codex-sol".*"grok"|"Beru".*"grok".*"codex-sol"/s);
  });
});

describe("a shadow name against keys that differ only by case (ARM-3, review 100 C1)", () => {
  it("refuses a name that is the folded key of another soldier, whatever the key order", () => {
    const delegate = "---\nsoldiers:\n  Scout:\n    roles: [research]\n  scout:\n    roles: [research]\n  Other:\n    roles: [research]\n---\n";
    const dir = projectWith({ soldiers: {
      Scout: { cli: "grok", model: "m", shadowName: "Ember" },
      scout: { cli: "grok", model: "m", shadowName: "Scout" },
      Other: { cli: "agy", model: "m" },
    } });
    writeFileSync(join(dir, "orchestratorDelegate.md"), delegate);
    writeFileSync(join(dir, "agent.md"), "");
    expect(() => loadV2Roster(dir)).toThrow(/shadow name "Scout" of "scout" is the key of soldier "Scout"/);
  });
});

describe("the v2 loader ignores the legacy Monarch settings (C2)", () => {
  const shippedDelegate = readFileSync(new URL("../../orchestratorDelegate.md", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const shippedConfig = readFileSync(new URL("../../shadow.config.json", import.meta.url), "utf8");
  const LEGACY = "monarch:\n  default: codex-astra\n  fallback: claude-opus\n";
  const project = (delegate: string): string => {
    const dir = projectWith(JSON.parse(shippedConfig));
    writeFileSync(join(dir, "orchestratorDelegate.md"), delegate);
    return dir;
  };

  it("starts with no monarch block, and v1 refuses the same files", () => {
    const delegate = shippedDelegate.replace(LEGACY, "");
    expect(delegate).not.toMatch(/^monarch:/m);
    const dir = project(delegate);
    const { roster, names } = loadV2Roster(dir);
    expect([...roster.soldiers.keys()]).toEqual(["codex-sol", "claude-opus", "codex-astra", "claude-sonnet", "grok", "agy"]);
    expect(names.get("claude-opus")).toBe("Kaisel");
    expect(() => loadRoster(dir)).toThrow(/monarch/);
  });

  it("starts with a stale monarch block: a ghost soldier, or one without the orchestrate role", () => {
    for (const stale of ["monarch:\n  default: ghost\n", "monarch:\n  default: agy\n  fallback: grok\n"]) {
      const dir = project(shippedDelegate.replace(LEGACY, stale));
      expect(loadV2Roster(dir).roster.soldiers.size).toBe(6);
      expect(() => loadRoster(dir)).toThrow();
    }
  });

  it("still refuses a soldier the two files disagree on, and a soldier rule contradiction", () => {
    const dir = project(shippedDelegate.replace(LEGACY, "").replace("  agy:\n", "  extra:\n    roles: [build]\n  agy:\n"));
    expect(() => loadV2Roster(dir)).toThrow(/"extra" is in orchestratorDelegate.md but has no cli\/model/);
    const bad = project(shippedDelegate.replace(LEGACY, "").replace("roles: [research, test]", "roles: [research, test]\n    buildFor: [hard]"));
    expect(() => loadV2Roster(bad)).toThrow(/does not have the build role/);
  });

  it("still cannot grant an adapter more: agy never writes and grok never reviews, whatever the file says", () => {
    const granting = "---\nsoldiers:\n  grok:\n    roles: [build, review]\n  agy:\n    roles: [research, build]\n    write: true\n---\n";
    const dir = projectWith({ soldiers: { grok: { cli: "grok", model: "m" }, agy: { cli: "agy", model: "m" } } });
    writeFileSync(join(dir, "orchestratorDelegate.md"), granting);
    writeFileSync(join(dir, "agent.md"), ""); // the shipped agent.md has sections for soldiers this small roster lacks
    const { roster } = loadV2Roster(dir);
    const agy = roster.soldiers.get("agy")!;
    expect(agy.write).toBe(true);
    expect(checkAssignment(agy, getAdapter("agy"), "build", true).ok).toBe(false);
    const grok = roster.soldiers.get("grok")!;
    expect(grok.roles).toContain("review");
    expect(checkAssignment(grok, getAdapter("grok"), "review", false).ok).toBe(false);
  });
});
