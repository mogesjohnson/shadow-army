import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAdapter } from "../adapters/registry.js";
import { RosterError } from "../core/roster.js";
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
