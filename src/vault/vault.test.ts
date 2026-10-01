import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Report } from "../core/types.js";
import { renderNotes, renderOverview, renderRuns } from "./render.js";
import { MAX_NOTE_CHARS, Vault, VaultError } from "./vault.js";

let dir: string;
let vault: Vault;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "shadow-vault-"));
  vault = Vault.forCwd(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const report = (over: Partial<Report> = {}): Report => ({
  soldier: "grok",
  role: "build",
  model: "m",
  status: "ok",
  summary: "done",
  filesTouched: [],
  openQuestions: [],
  notes: [],
  structured: true,
  durationMs: 1000,
  ...over,
});

describe("layout and safety", () => {
  it("keeps the vault under <project>/.shadow and ships a .gitignore that ignores everything", async () => {
    await vault.addNote({ text: "hello", source: "you", status: "accepted" });
    expect(vault.root).toBe(join(dir, ".shadow"));
    expect(readFileSync(join(vault.root, ".gitignore"), "utf8").trim()).toBe("*");
  });

  it("creates a private directory per soldier and refuses names that could escape the vault", async () => {
    const a = await vault.soldierDir("claude-sonnet");
    const b = await vault.soldierDir("grok");
    expect(a).not.toBe(b);
    expect(existsSync(a)).toBe(true);
    for (const bad of ["..", "../x", "a/b", "a\\b", "", ".hidden", "x..y"]) {
      await expect(vault.soldierDir(bad)).rejects.toBeInstanceOf(VaultError);
    }
  });

  it("refuses unsafe ids for notes and runs", async () => {
    await expect(vault.setNoteStatus("../../etc/passwd", "accepted")).rejects.toBeInstanceOf(VaultError);
    await expect(vault.getRun("..\\..\\x")).rejects.toBeInstanceOf(VaultError);
    await expect(vault.addNote({ text: "x", source: "../evil", status: "proposed" })).rejects.toBeInstanceOf(VaultError);
  });
});

describe("notes", () => {
  it("stores notes with their status and lists them oldest first", async () => {
    const a = await vault.addNote({ text: "first", source: "grok", status: "proposed", runId: "r1" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await vault.addNote({ text: "second", source: "you", status: "accepted" });
    const all = await vault.listNotes();
    expect(all.map((n) => n.id)).toEqual([a.id, b.id]);
    expect(all[0]).toMatchObject({ status: "proposed", source: "grok", runId: "r1" });
    expect((await vault.listNotes("accepted")).map((n) => n.text)).toEqual(["second"]);
  });

  it("does not add the same note twice, even with different case or spacing, whatever its status", async () => {
    const a = await vault.addNote({ text: "Uses ESM modules", source: "grok", status: "proposed" });
    await vault.setNoteStatus(a.id, "rejected");
    const again = await vault.addNote({ text: "  uses   esm MODULES ", source: "agy", status: "proposed" });
    expect(again.id).toBe(a.id);
    expect(again.status).toBe("rejected");
    expect(await vault.listNotes()).toHaveLength(1);
  });

  it("rejects empty notes and truncates very long ones", async () => {
    await expect(vault.addNote({ text: "   ", source: "you", status: "accepted" })).rejects.toThrow(/empty/);
    const n = await vault.addNote({ text: "x".repeat(MAX_NOTE_CHARS * 3), source: "you", status: "accepted" });
    expect(n.text.length).toBe(MAX_NOTE_CHARS);
    expect(n.text.endsWith("…")).toBe(true);
  });

  it("changes status, and reports a missing note clearly", async () => {
    const n = await vault.addNote({ text: "a", source: "grok", status: "proposed" });
    expect((await vault.setNoteStatus(n.id, "accepted")).status).toBe("accepted");
    expect((await vault.listNotes())[0]!.status).toBe("accepted");
    await expect(vault.setNoteStatus("n-nope", "accepted")).rejects.toThrow(/no such note/);
  });

  it("skips a corrupt note file instead of failing the whole vault", async () => {
    await vault.addNote({ text: "good", source: "you", status: "accepted" });
    await writeFile(join(vault.root, "shared", "notes", "n-broken.json"), "{not json", "utf8");
    expect((await vault.listNotes()).map((n) => n.text)).toEqual(["good"]);
  });

  it("returns an empty list for a vault that does not exist yet", async () => {
    expect(await vault.listNotes()).toEqual([]);
    expect(await vault.listRuns()).toEqual([]);
    expect(existsSync(vault.root)).toBe(false);
  });
});

describe("what soldiers may see", () => {
  it("only accepted notes are ever offered", async () => {
    await vault.addNote({ text: "proposed one", source: "grok", status: "proposed" });
    await vault.addNote({ text: "rejected one", source: "grok", status: "rejected" });
    await vault.addNote({ text: "accepted one", source: "you", status: "accepted" });
    expect(await vault.acceptedNotes()).toEqual(["accepted one"]);
  });

  it("keeps the newest notes when over budget, in written order", async () => {
    for (const t of ["old note", "middle note", "newest note"]) {
      await vault.addNote({ text: t, source: "you", status: "accepted" });
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(await vault.acceptedNotes(25)).toEqual(["middle note", "newest note"]);
    expect(await vault.acceptedNotes(0)).toEqual([]);
  });
});

describe("runs", () => {
  it("saves the run with the report and lists newest first", async () => {
    const a = await vault.saveRun({ soldier: "grok", task: "t1", role: "build", write: false, report: report() });
    await new Promise((r) => setTimeout(r, 5));
    const b = await vault.saveRun({ soldier: "agy", task: "t2", role: "research", write: false, report: report({ soldier: "agy" }) });
    expect((await vault.listRuns()).map((r) => r.id)).toEqual([b.id, a.id]);
    expect((await vault.listRuns(1)).map((r) => r.id)).toEqual([b.id]);
    expect(await vault.getRun(a.id)).toMatchObject({ soldier: "grok", task: "t1", report: { summary: "done" } });
    await expect(vault.getRun("nope")).rejects.toThrow(/no such run/);
  });
});

describe("rendering", () => {
  it("shows what is waiting for review and recent runs", async () => {
    const n = await vault.addNote({ text: "needs review", source: "grok", status: "proposed" });
    await vault.addNote({ text: "already ok", source: "you", status: "accepted" });
    const run = await vault.saveRun({ soldier: "grok", task: "do a thing", role: "build", write: false, report: report({ costUsd: 0.5 }) });
    const out = renderOverview(vault.root, await vault.listNotes(), await vault.listRuns());
    expect(out).toContain("1 accepted, 1 proposed, 0 rejected");
    expect(out).toContain(n.id);
    expect(out).toContain(run.id);
    expect(renderNotes([])).toBe("(no notes)");
    expect(renderRuns([])).toBe("(no runs)");
    expect(renderRuns(await vault.listRuns())).toContain("$0.5000");
  });
});
