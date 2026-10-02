import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Vault } from "../vault/vault.js";
import type { Adapter, RunRequest, RunResult } from "../adapters/Adapter.js";
import { checkAssignment, defaultRole } from "./assign.js";
import { makeRoster, shippedRoster } from "./roster.testutil.js";
import { renderReport, summon, SummonError } from "./summon.js";

const roster = shippedRoster();

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

const base = { roster, task: "look around", cwd: "/w" };

describe("assignment rules", () => {
  it("refuses review for a CLI that cannot review, even if the roster grants the role", async () => {
    // Adapter capabilities are code; the delegate file can restrict them but never grant more.
    const a = fake({ capabilities: { write: true, review: false } });
    const generous = makeRoster({ g: { cli: "grok", model: "m", roles: ["build", "review"] } });
    await expect(summon({ ...base, roster: generous, soldier: "g", role: "review", adapter: a })).rejects.toThrow(/never takes review/);
    expect(a.calls).toHaveLength(0);
  });

  it("refuses a role the roster forbids, even if the adapter could do it", async () => {
    const a = fake(); // adapter allows review
    const r = makeRoster({ g: { cli: "grok", model: "m", roles: ["build"], forbidden: ["review"] } });
    await expect(summon({ ...base, roster: r, soldier: "g", role: "review", adapter: a })).rejects.toThrow(/never takes review/);
    expect(a.calls).toHaveLength(0);
  });

  it("refuses write for a soldier the roster marks read-only, even if the adapter could write", async () => {
    const a = fake(); // adapter allows write
    const r = makeRoster({ s: { cli: "x", model: "m", roles: ["research"], write: false } });
    await expect(summon({ ...base, roster: r, soldier: "s", role: "research", write: true, adapter: a })).rejects.toThrow(/read-only/);
    expect(a.calls).toHaveLength(0);
  });

  it("never gives agy write access, and refuses build for it", async () => {
    const a = fake({ capabilities: { write: false, review: false } });
    await expect(summon({ ...base, soldier: "agy", write: true, role: "research", adapter: a })).rejects.toThrow(/read-only/);
    await expect(summon({ ...base, soldier: "agy", role: "build", adapter: a })).rejects.toThrow(/not configured/);
    expect(a.calls).toHaveLength(0);
  });

  it("refuses write outside the build role and orchestrate as a task", () => {
    const s = roster.soldiers.get("claude-opus")!;
    const a = fake();
    expect(checkAssignment(s, a, "review", true)).toMatchObject({ ok: false });
    expect(checkAssignment(s, a, "orchestrate", false)).toMatchObject({ ok: false });
    expect(checkAssignment(s, a, "build", true)).toEqual({ ok: true, role: "build", write: true });
  });

  it("rejects an unknown soldier", async () => {
    await expect(summon({ ...base, soldier: "nobody", adapter: fake() })).rejects.toBeInstanceOf(SummonError);
  });

  it("defaults to the first non-orchestrate role", () => {
    expect(defaultRole(roster.soldiers.get("claude-opus")!)).toBe("review");
    expect(defaultRole(roster.soldiers.get("agy")!)).toBe("research");
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

  it("refuses a write run without claims or outside a git repository, before any soldier starts", async () => {
    const a = fake();
    await expect(summon({ ...base, soldier: "claude-sonnet", role: "build", write: true, adapter: a })).rejects.toThrow(
      /at least one claim/,
    );
    const notRepo = await mkdtemp(join(tmpdir(), "shadow-norepo-"));
    try {
      await expect(
        summon({ ...base, cwd: notRepo, soldier: "claude-sonnet", role: "build", write: true, claims: ["x"], adapter: a }),
      ).rejects.toThrow(/needs a git repository/);
    } finally {
      await rm(notRepo, { recursive: true, force: true });
    }
    expect(a.calls).toHaveLength(0);
  });

  it("returns an error report when the soldier fails", async () => {
    const a = fake({ result: { text: "", isError: true, errorMessage: "timed out" } });
    const r = await summon({ ...base, soldier: "grok", adapter: a });
    expect(r).toMatchObject({ status: "error", error: "timed out" });
    expect(renderReport(r)).toContain("Error: timed out");
  });
});

describe("summon with a vault", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "shadow-summon-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const withNotes = (notes: string[]): RunResult => ({
    text: `\`\`\`shadow-report\n${JSON.stringify({ summary: "done", notes })}\n\`\`\``,
    isError: false,
  });

  it("records the run and proposes the report's notes without sharing them yet", async () => {
    const vault = Vault.forCwd(dir);
    const a = fake({ result: withNotes(["repo uses ESM"]) });
    const r = await summon({ ...base, soldier: "grok", adapter: a, vault });

    expect(r.runId).toBeTruthy();
    expect(r.vaultError).toBeUndefined();
    expect((await vault.getRun(r.runId!)).report.summary).toBe("done");
    expect(await vault.listNotes("proposed")).toMatchObject([{ text: "repo uses ESM", source: "grok", runId: r.runId }]);

    // A proposed note must not reach the next soldier.
    const b = fake();
    await summon({ ...base, soldier: "claude-sonnet", adapter: b, vault });
    expect(b.calls[0]!.prompt).not.toContain("repo uses ESM");
  });

  it("gives accepted notes to the next soldier's brief", async () => {
    const vault = Vault.forCwd(dir);
    const first = fake({ result: withNotes(["repo uses ESM"]) });
    await summon({ ...base, soldier: "grok", adapter: first, vault });
    const [note] = await vault.listNotes();
    await vault.setNoteStatus(note!.id, "accepted");

    const next = fake();
    await summon({ ...base, soldier: "claude-sonnet", adapter: next, vault });
    expect(next.calls[0]!.prompt).toContain("SHARED NOTES FROM THE VAULT");
    expect(next.calls[0]!.prompt).toContain("- repo uses ESM");
  });

  it("records failed runs but proposes no notes from them", async () => {
    const vault = Vault.forCwd(dir);
    const a = fake({ result: { text: "", isError: true, errorMessage: "boom" } });
    const r = await summon({ ...base, soldier: "grok", adapter: a, vault });
    expect(r.status).toBe("error");
    expect((await vault.getRun(r.runId!)).report.error).toBe("boom");
    expect(await vault.listNotes()).toEqual([]);
  });

  it("never loses the report when the vault cannot be written", async () => {
    const blocker = join(dir, "file");
    await writeFile(blocker, "i am a file, not a directory", "utf8");
    const vault = Vault.forCwd(blocker); // .shadow cannot be created under a file
    const a = fake();
    const r = await summon({ ...base, soldier: "grok", adapter: a, vault });
    expect(r).toMatchObject({ status: "ok", summary: "done" });
    expect(r.vaultError).toMatch(/vault/);
    expect(r.runId).toBeUndefined();
    expect(renderReport(r)).toContain("Vault warning");
  });

  it("does not touch the filesystem without a vault", async () => {
    await summon({ ...base, soldier: "grok", adapter: fake(), cwd: dir });
    expect(existsSync(join(dir, ".shadow"))).toBe(false);
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
