import { describe, expect, it } from "vitest";
import { getAdapter } from "../adapters/registry.js";
import { renderRoute, route, suggestEffort } from "./router.js";
import { makeRoster, shippedRoster } from "./roster.testutil.js";

// The shipped roster and the real adapters: this tests the actual hard rules, not a mock of them.
const roster = shippedRoster();
const go = (profile: Parameters<typeof route>[2]) => route(roster, getAdapter, profile);
const names = (r: ReturnType<typeof go>) => r.candidates.map((c) => c.soldier);
const why = (r: ReturnType<typeof go>, soldier: string) => r.excluded.find((e) => e.soldier === soldier)?.reason;

describe("build", () => {
  it("routine: cheapest qualifying soldier first, hard-only specialists left out", () => {
    const r = go({ role: "build" });
    expect(names(r)).toEqual(["claude-sonnet", "grok", "codex-sol"]);
    expect(why(r, "claude-opus")).toMatch(/builds only hard tasks/);
    expect(why(r, "codex-astra")).toMatch(/not configured for the "build" role/);
    expect(why(r, "agy")).toMatch(/not configured for the "build" role/);
    expect(r.candidates[0]!.reasons.join()).toMatch(/cheapest soldier that qualifies/);
    expect(r.candidates[0]!.effort).toBe("medium");
  });

  it("hard: the hard specialist first, then most capable, with high effort", () => {
    const r = go({ role: "build", difficulty: "hard" });
    expect(names(r)).toEqual(["claude-opus", "codex-sol", "claude-sonnet", "grok"]);
    expect(r.candidates[0]!.reasons.join()).toMatch(/specialist for hard builds/);
    expect(r.candidates.every((c) => c.effort === "high")).toBe(true);
  });
});

describe("review", () => {
  it("never offers grok, whatever else is true", () => {
    const r = go({ role: "review" });
    expect(names(r)).toEqual(["claude-opus"]);
    expect(why(r, "grok")).toMatch(/never takes review/);
    expect(r.candidates[0]!.effort).toBe("high");
  });

  it("nobody reviews their own work", () => {
    const r = go({ role: "review", author: "claude-opus" });
    expect(r.candidates).toEqual([]);
    expect(why(r, "claude-opus")).toMatch(/never reviews its own work/);
  });

  it("an author who cannot review anyway is excluded for the stronger reason", () => {
    expect(why(go({ role: "review", author: "grok" }), "grok")).toMatch(/never takes review/);
  });
});

describe("research, test and orchestrate", () => {
  it("research and test go to agy", () => {
    expect(names(go({ role: "research" }))).toEqual(["agy"]);
    expect(names(go({ role: "test" }))).toEqual(["agy"]);
  });

  it("agy never gets write access, so a research task that needs writing has no taker", () => {
    const r = go({ role: "research", write: true });
    expect(r.candidates).toEqual([]);
    expect(why(r, "agy")).toMatch(/read-only/);
  });

  it("orchestrate follows the configured monarch order", () => {
    const r = go({ role: "orchestrate" });
    expect(names(r)).toEqual(["codex-astra", "claude-opus"]);
    expect(r.candidates[0]!.reasons).toEqual(["the configured Monarch"]);
    expect(r.candidates[1]!.reasons).toEqual(["the configured fallback Monarch"]);
  });
});

describe("a delegate file can restrict an adapter but never grant it more", () => {
  it("grok stays out of review even if the roster grants it", () => {
    const generous = makeRoster({ grok: { cli: "grok", model: "m", roles: ["build", "review"] } });
    const r = route(generous, getAdapter, { role: "review" });
    expect(r.candidates).toEqual([]);
    expect(r.excluded[0]!.reason).toMatch(/never takes review/);
  });

  it("agy stays read-only even if the roster says write: true and grants build", () => {
    const generous = makeRoster({ agy: { cli: "agy", model: "m", roles: ["build"], write: true } });
    const r = route(generous, getAdapter, { role: "build" });
    expect(r.candidates).toEqual([]);
    expect(r.excluded[0]!.reason).toMatch(/read-only/);
  });

  it("an adapter that does not exist is excluded with a reason", () => {
    const r = route(makeRoster({ x: { cli: "ghost", model: "m", roles: ["build"] } }), getAdapter, { role: "build" });
    expect(r.excluded).toEqual([{ soldier: "x", reason: 'no adapter for CLI "ghost"' }]);
  });
});

describe("ranking ties and effort", () => {
  it("equal cost falls back to roster order, so results are stable", () => {
    const r = route(
      makeRoster({
        a: { cli: "claude", model: "m", roles: ["build"], cost: 1 },
        b: { cli: "codex", model: "m", roles: ["build"], cost: 1 },
      }),
      getAdapter,
      { role: "build" },
    );
    expect(names(r)).toEqual(["a", "b"]);
  });

  it("suggests effort by role and difficulty", () => {
    expect(suggestEffort("build", "routine")).toBe("medium");
    expect(suggestEffort("build", "hard")).toBe("high");
    expect(suggestEffort("review", "routine")).toBe("high");
    expect(suggestEffort("research", "hard")).toBe("medium");
  });
});

describe("renderRoute", () => {
  it("shows the ranking, the reasons, and what was excluded and why", () => {
    const profile = { role: "build" as const, difficulty: "hard" as const };
    const out = renderRoute(profile, go(profile));
    expect(out).toContain("Routing: build (hard)");
    expect(out).toContain("1. claude-opus");
    expect(out).toContain("Excluded:");
    expect(out).toContain("agy: ");
  });

  it("says plainly when nobody is eligible", () => {
    const profile = { role: "review" as const, author: "claude-opus" };
    expect(renderRoute(profile, go(profile))).toContain("Nobody is eligible for this task.");
  });
});
