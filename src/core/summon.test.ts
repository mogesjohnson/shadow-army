import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Adapter, RunRequest, RunResult } from "../adapters/Adapter.js";
import { checkAssignment, defaultRole } from "./assign.js";
import { parseConfig } from "./config.js";
import { renderReport, summon, SummonError } from "./summon.js";

const config = parseConfig(readFileSync(new URL("../../shadow.config.json", import.meta.url), "utf8"));

function fake(over: Partial<Adapter> & { result?: RunResult } = {}): Adapter & { calls: RunRequest[] } {
  const calls: RunRequest[] = [];
  return {
    id: "fake",
    label: "Fake",
    command: "fake",
    capabilities: { write: true, review: true },
    detect: async () => ({ found: true }),
    listModels: async () => ({ source: "cli", models: [] }),
    run: async (req) => {
      calls.push(req);
      return over.result ?? { text: '```shadow-report\n{"summary":"done"}\n```', isError: false, costUsd: 0.01 };
    },
    ...over,
    calls,
  };
}

const base = { config, task: "look around", cwd: "/w" };

describe("assignment rules", () => {
  it("refuses review for grok", async () => {
    const a = fake({ capabilities: { write: true, review: false } });
    const cfg = parseConfig(
      JSON.stringify({
        monarch: { default: "g" },
        soldiers: { g: { cli: "grok", model: "m", roles: ["build", "review"] } },
      }),
    );
    await expect(summon({ ...base, config: cfg, soldier: "g", role: "review", adapter: a })).rejects.toThrow(/never takes review/);
    expect(a.calls).toHaveLength(0);
  });

  it("never gives agy write access, and refuses build for it", async () => {
    const a = fake({ capabilities: { write: false, review: false } });
    await expect(summon({ ...base, soldier: "agy", write: true, role: "research", adapter: a })).rejects.toThrow(/read-only/);
    await expect(summon({ ...base, soldier: "agy", role: "build", adapter: a })).rejects.toThrow(/not configured/);
    expect(a.calls).toHaveLength(0);
  });

  it("refuses write outside the build role and orchestrate as a task", () => {
    const s = config.soldiers["claude-opus"]!;
    const a = fake();
    expect(checkAssignment("claude-opus", s, a, "review", true)).toMatchObject({ ok: false });
    expect(checkAssignment("claude-opus", s, a, "orchestrate", false)).toMatchObject({ ok: false });
    expect(checkAssignment("claude-opus", s, a, "build", true)).toEqual({ ok: true, role: "build", write: true });
  });

  it("rejects an unknown soldier", async () => {
    await expect(summon({ ...base, soldier: "nobody", adapter: fake() })).rejects.toBeInstanceOf(SummonError);
  });

  it("defaults to the first non-orchestrate role", () => {
    expect(defaultRole(config.soldiers["claude-opus"]!)).toBe("review");
    expect(defaultRole(config.soldiers["agy"]!)).toBe("research");
  });
});

describe("summon", () => {
  it("is read-only by default and passes only the brief and model to the soldier", async () => {
    const a = fake();
    const r = await summon({ ...base, soldier: "claude-sonnet", adapter: a });
    expect(a.calls[0]).toMatchObject({ model: "sonnet", write: false, cwd: "/w" });
    expect(a.calls[0]!.prompt).toContain("look around");
    expect(r).toMatchObject({ status: "ok", summary: "done", structured: true, costUsd: 0.01 });
  });

  it("allows writing only when asked for the build role", async () => {
    const a = fake();
    await summon({ ...base, soldier: "claude-sonnet", role: "build", write: true, adapter: a });
    expect(a.calls[0]!.write).toBe(true);
  });

  it("returns an error report when the soldier fails", async () => {
    const a = fake({ result: { text: "", isError: true, errorMessage: "timed out" } });
    const r = await summon({ ...base, soldier: "grok", adapter: a });
    expect(r).toMatchObject({ status: "error", error: "timed out" });
    expect(renderReport(r)).toContain("Error: timed out");
  });
});

describe("renderReport", () => {
  it("lists files, questions and notes and shows stats", async () => {
    const a = fake({
      result: {
        text: '```shadow-report\n{"summary":"s","filesTouched":["a.ts"],"openQuestions":["why?"],"notes":["n1"]}\n```',
        isError: false,
        usage: { inputTokens: 10, outputTokens: 5 },
        costUsd: 0.5,
        resolvedModel: "real-model",
      },
    });
    const out = renderReport(await summon({ ...base, soldier: "claude-sonnet", adapter: a }));
    expect(out).toContain("real-model");
    expect(out).toContain("  - a.ts");
    expect(out).toContain("  - why?");
    expect(out).toContain("  - n1");
    expect(out).toContain("10 in | 5 out | $0.5000");
  });
});
