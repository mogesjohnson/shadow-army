import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Adapter, RunRequest } from "../adapters/Adapter.js";
import { shippedRoster } from "../core/roster.testutil.js";
import { summon } from "../core/summon.js";
import { applyToCheckout } from "./apply.js";
import { registerWorkspaceCommands } from "./cli.js";
import { ledgerPath, notUndone, readLedger, recordApplied } from "./ledger.js";
import { ensureShadowRoot } from "./session.js";
import { snapshotFolder } from "./snapshot.js";
import { makeRepo } from "./testRepo.testutil.js";
import { renderUndo, undoApplied } from "./undo.js";

vi.setConfig({ testTimeout: 60_000 });

const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

type Repo = ReturnType<typeof makeRepo>;

function repo(files: Record<string, string> = { "keep.txt": "a\n", "old.txt": "gone\n", "other.txt": "x\n" }) {
  const r = makeRepo(files);
  repos.push(r);
  return r;
}

const shadowOf = (r: Repo) => join(r.dir, ".shadow");
const read = (r: Repo, p: string) => readFileSync(join(r.dir, p), "utf8");
const has = (r: Repo, p: string) => existsSync(join(r.dir, p));
const statusLines = (r: Repo) =>
  execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: r.dir, encoding: "utf8" }).split("\n").filter(Boolean);

/** What `sa run` does at its end, minus the soldiers: snapshot the folder, make the run's branch, apply it, record it. */
async function applyRun(r: Repo, id: string, changes: Record<string, string | null>, kind: "run" | "summon" = "run") {
  await ensureShadowRoot(shadowOf(r));
  const base = await snapshotFolder(r.dir);
  const branch = `shadow/run/${id}`;
  r.branchFrom(base, branch, changes);
  const applied = await applyToCheckout(r.dir, base, branch);
  if (!applied.applied) throw new Error(`test setup: ${applied.reason}`);
  await recordApplied(r.dir, shadowOf(r), { id, kind, base, branch, files: applied.files });
  return { base, branch, files: applied.files };
}

describe("undoing an applied run", () => {
  it("puts modified and deleted files back, removes added files and their intent-to-add entries, and leaves the rest alone", async () => {
    const r = repo();
    r.write("other.txt", "my own edit\n");
    r.write("notes.txt", "untracked, mine\n");
    const before = statusLines(r);
    const head = r.git("rev-parse", "HEAD");
    const { branch } = await applyRun(r, "run1", { "keep.txt": "a\nb\n", "old.txt": null, "dir/hello.txt": "hi\n" });
    expect(statusLines(r)).toContain(" A dir/hello.txt");

    const result = await undoApplied(r.dir, shadowOf(r));
    expect(result).toEqual({
      undone: true,
      id: "run1",
      kind: "run",
      branch,
      files: [
        { change: "A", path: "dir/hello.txt" },
        { change: "M", path: "keep.txt" },
        { change: "D", path: "old.txt" },
      ],
    });
    expect(read(r, "keep.txt")).toBe("a\n");
    expect(read(r, "old.txt")).toBe("gone\n");
    expect(has(r, "dir/hello.txt")).toBe(false);
    expect(read(r, "other.txt")).toBe("my own edit\n");
    expect(read(r, "notes.txt")).toBe("untracked, mine\n");
    // The folder is as it was before the apply: same status, and no ghost entry for the added file.
    expect(statusLines(r)).toEqual(before);
    expect(r.git("ls-files")).toBe("keep.txt\nold.txt\nother.txt");
    expect(r.git("rev-parse", "HEAD")).toBe(head);
    expect(r.git("rev-parse", "--verify", branch)).toMatch(/^[0-9a-f]{40}$/); // the backup branch stays
  });

  it("records every apply and undo in the ledger", async () => {
    const r = repo();
    const { base, branch, files } = await applyRun(r, "run1", { "new.txt": "n\n" });
    const tip = r.git("rev-parse", branch);
    const head = r.git("rev-parse", "HEAD");
    expect(existsSync(ledgerPath(shadowOf(r)))).toBe(true);
    // The index entry the apply left is the empty file, which is how git stores an intent-to-add entry.
    const index = { "new.txt": "100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 0;" };
    expect(await readLedger(shadowOf(r))).toEqual([{ type: "applied", id: "run1", kind: "run", base, branch, tip, head, index, files, at: expect.any(String) }]);
    expect(files).toEqual([{ change: "A", path: "new.txt" }]);

    await undoApplied(r.dir, shadowOf(r));
    const entries = await readLedger(shadowOf(r));
    expect(entries.map((e) => [e.type, e.id])).toEqual([["applied", "run1"], ["undone", "run1"]]);
    expect(notUndone(entries)).toEqual([]);
    // One JSON object per line, in the vault's own (ignored) folder.
    expect(readFileSync(ledgerPath(shadowOf(r)), "utf8").trim().split("\n")).toHaveLength(2);
    expect(statusLines(r)).toEqual([]);
  });

  it("without an id undoes the latest apply that is not undone yet, then the one before it", async () => {
    const r = repo();
    await applyRun(r, "run1", { "bye.txt": "bye\n" });
    await applyRun(r, "run2", { "bye.txt": "goodbye forever\n", "extra.txt": "e\n" });

    expect(await undoApplied(r.dir, shadowOf(r))).toMatchObject({ undone: true, id: "run2" });
    expect(read(r, "bye.txt")).toBe("bye\n");
    expect(has(r, "extra.txt")).toBe(false);
    expect(statusLines(r)).toEqual([" A bye.txt"]);

    expect(await undoApplied(r.dir, shadowOf(r))).toMatchObject({ undone: true, id: "run1" });
    expect(has(r, "bye.txt")).toBe(false);
    expect(statusLines(r)).toEqual([]);

    expect(await undoApplied(r.dir, shadowOf(r))).toEqual({ undone: false, reason: "no applied run or summon is left to undo", files: [] });
  });

  it("undoes the run with the given id, by id or by branch name, even when it is not the latest", async () => {
    const r = repo();
    await applyRun(r, "run1", { "one.txt": "1\n" });
    await applyRun(r, "run2", { "two.txt": "2\n" });
    expect(await undoApplied(r.dir, shadowOf(r), "run1")).toMatchObject({ undone: true, id: "run1" });
    expect(has(r, "one.txt")).toBe(false);
    expect(has(r, "two.txt")).toBe(true);
    expect(notUndone(await readLedger(shadowOf(r))).map((e) => e.id)).toEqual(["run2"]);
    expect(await undoApplied(r.dir, shadowOf(r), "shadow/run/run2")).toMatchObject({ undone: true, id: "run2" });
    expect(statusLines(r)).toEqual([]);
  });

  it("refuses an id it does not know and one that was already undone, changing nothing", async () => {
    const r = repo();
    await applyRun(r, "run1", { "one.txt": "1\n" });
    expect(await undoApplied(r.dir, shadowOf(r), "nope")).toEqual({ undone: false, reason: "no applied run or summon called nope", files: [] });
    expect(has(r, "one.txt")).toBe(true);
    await undoApplied(r.dir, shadowOf(r), "run1");
    expect(await undoApplied(r.dir, shadowOf(r), "run1")).toEqual({ undone: false, reason: "run1 was already undone", files: [] });
  });

  it("has nothing to undo before anything was applied", async () => {
    const r = repo();
    expect(await undoApplied(r.dir, shadowOf(r))).toMatchObject({ undone: false, reason: "no applied run or summon is left to undo" });
  });

  it("tolerates a damaged ledger line", async () => {
    const r = repo();
    await applyRun(r, "run1", { "one.txt": "1\n" });
    appendFileSync(ledgerPath(shadowOf(r)), '{"type":"applied","id":"cut off\nnot json\n');
    expect(await undoApplied(r.dir, shadowOf(r))).toMatchObject({ undone: true, id: "run1" });
  });
});

describe("when the folder is no longer as the apply left it", () => {
  it("refuses, and changes nothing at all, when a file the run changed was edited since", async () => {
    const r = repo();
    await applyRun(r, "run1", { "keep.txt": "a\nb\n", "old.txt": null, "dir/hello.txt": "hi\n" });
    r.write("keep.txt", "a\nb\nand my own line\n");
    const status = statusLines(r);

    const result = await undoApplied(r.dir, shadowOf(r));
    expect(result).toEqual({ undone: false, reason: "these files have changed since the run was applied", files: ["keep.txt"] });
    // Not even the files that could have been undone were touched.
    expect(read(r, "keep.txt")).toBe("a\nb\nand my own line\n");
    expect(has(r, "old.txt")).toBe(false);
    expect(read(r, "dir/hello.txt")).toBe("hi\n");
    expect(statusLines(r)).toEqual(status);
    expect(notUndone(await readLedger(shadowOf(r))).map((e) => e.id)).toEqual(["run1"]);
    expect(renderUndo(result)).toBe("Not undone: these files have changed since the run was applied.\n  keep.txt\nNothing was changed.");
  });

  it("refuses when a file the run added was removed, or one it deleted was recreated", async () => {
    const r = repo();
    await applyRun(r, "run1", { "old.txt": null, "added.txt": "n\n" });
    rmSync(join(r.dir, "added.txt"));
    r.write("old.txt", "recreated\n");
    expect(await undoApplied(r.dir, shadowOf(r))).toEqual({ undone: false, reason: "these files have changed since the run was applied", files: ["added.txt", "old.txt"] });
    expect(read(r, "old.txt")).toBe("recreated\n");
  });

  it("refuses to undo an earlier run while a later one has changed the same file, and works once that is undone", async () => {
    const r = repo();
    await applyRun(r, "run1", { "bye.txt": "bye\n" });
    await applyRun(r, "run2", { "bye.txt": "goodbye forever\n" });
    expect(await undoApplied(r.dir, shadowOf(r), "run1")).toEqual({ undone: false, reason: "these files have changed since the run was applied", files: ["bye.txt"] });
    expect(read(r, "bye.txt")).toBe("goodbye forever\n");
    expect(await undoApplied(r.dir, shadowOf(r), "run2")).toMatchObject({ undone: true });
    expect(await undoApplied(r.dir, shadowOf(r), "run1")).toMatchObject({ undone: true });
    expect(has(r, "bye.txt")).toBe(false);
    expect(statusLines(r)).toEqual([]);
  });

  it("refuses when the owner staged one of the files, and says so instead of guessing", async () => {
    const r = repo();
    await applyRun(r, "run1", { "keep.txt": "a\nb\n", "added.txt": "n\n" });
    r.git("add", "keep.txt");
    const result = await undoApplied(r.dir, shadowOf(r));
    expect(result).toEqual({ undone: false, reason: "you have staged changes to files the run changed; unstage them first", files: ["keep.txt"] });
    expect(read(r, "keep.txt")).toBe("a\nb\n");
    expect(has(r, "added.txt")).toBe(true);
    expect(r.git("diff", "--cached", "--name-only")).toBe("keep.txt");
  });

  it("does not mind staging that was there before the run, only staging done since", async () => {
    const r = repo();
    r.write("keep.txt", "a\nstaged before the run\n");
    r.git("add", "keep.txt");
    const before = statusLines(r);
    expect(before).toEqual(["M  keep.txt"]);
    await applyRun(r, "run1", { "keep.txt": "a\nstaged before the run\nthen the run\n" });
    expect(statusLines(r)).toEqual(["MM keep.txt"]);
    expect(await undoApplied(r.dir, shadowOf(r))).toMatchObject({ undone: true });
    expect(read(r, "keep.txt")).toBe("a\nstaged before the run\n");
    expect(statusLines(r)).toEqual(before); // their staged edit is still staged, as it was

    await applyRun(r, "run2", { "keep.txt": "a\nstaged before the run\nand again\n" });
    r.git("add", "keep.txt"); // now they stage the run's work as well
    expect(await undoApplied(r.dir, shadowOf(r))).toMatchObject({ undone: false, files: ["keep.txt"] });
  });

  it("refuses when the owner staged a file the run added", async () => {
    const r = repo();
    await applyRun(r, "run1", { "added.txt": "n\n" });
    r.git("add", "added.txt");
    expect(await undoApplied(r.dir, shadowOf(r))).toMatchObject({ undone: false, files: ["added.txt"] });
    expect(has(r, "added.txt")).toBe(true);
  });

  it("refuses when the files were committed since, which is a job for git revert", async () => {
    const r = repo();
    await applyRun(r, "run1", { "keep.txt": "a\nb\n", "added.txt": "n\n" });
    r.git("add", "-A");
    r.git("commit", "-q", "-m", "keeping the run's work");
    const result = await undoApplied(r.dir, shadowOf(r));
    expect(result).toEqual({ undone: false, reason: "these files were committed since the run was applied, so use git revert for them", files: ["added.txt", "keep.txt"] });
    expect(read(r, "keep.txt")).toBe("a\nb\n");
    expect(statusLines(r)).toEqual([]);
  });

  it("is fine with commits that do not touch the run's files", async () => {
    const r = repo();
    await applyRun(r, "run1", { "keep.txt": "a\nb\n" });
    r.write("other.txt", "committed meanwhile\n");
    r.git("commit", "-q", "-m", "unrelated", "--", "other.txt"); // only that file, not the run's
    expect(await undoApplied(r.dir, shadowOf(r))).toMatchObject({ undone: true });
    expect(read(r, "keep.txt")).toBe("a\n");
  });

  it("changes no file when the index cannot be locked", async () => {
    const r = repo();
    await applyRun(r, "run1", { "keep.txt": "a\nb\n", "added.txt": "n\n" });
    writeFileSync(join(r.dir, ".git", "index.lock"), "owner's lock");
    const result = await undoApplied(r.dir, shadowOf(r));
    expect(result.undone).toBe(false);
    expect(!result.undone && result.reason).toContain("index.lock");
    expect(read(r, "keep.txt")).toBe("a\nb\n");
    expect(read(r, "added.txt")).toBe("n\n");
  });

  it("does not need the branch, since the ledger holds the run's commit", async () => {
    const r = repo();
    const { branch } = await applyRun(r, "run1", { "keep.txt": "a\nb\n" });
    r.git("branch", "-D", branch);
    expect(await undoApplied(r.dir, shadowOf(r))).toMatchObject({ undone: true });
    expect(read(r, "keep.txt")).toBe("a\n");
  });
});

describe("undoing a summon", () => {
  it("takes back what `sa summon --write` applied, which started from the owner's uncommitted work", async () => {
    const r = repo({ "src/a.ts": "a\n", "src/b.ts": "b\n", "README.md": "hello\n" });
    r.write("src/a.ts", "a\nuncommitted\n");
    const before = statusLines(r);
    const seen: string[] = [];
    const adapter: Adapter = {
      id: "fake",
      label: "Fake",
      command: "fake",
      capabilities: { write: true, review: true },
      detect: async () => ({ found: true }),
      listModels: async () => ({ source: "cli", models: [] }),
      async run(req: RunRequest) {
        seen.push(readFileSync(join(req.cwd, "src/a.ts"), "utf8"));
        appendFileSync(join(req.cwd, "src/a.ts"), "by the soldier\n");
        mkdirSync(dirname(join(req.cwd, "src/new.ts")), { recursive: true });
        writeFileSync(join(req.cwd, "src/new.ts"), "new\n");
        return { text: '```shadow-report\n{"summary":"done"}\n```', isError: false };
      },
    };
    const report = await summon({ roster: shippedRoster(), soldier: "grok", task: "extend src", cwd: r.dir, write: true, claims: ["src/**"], adapter });
    expect(report.status).toBe("ok");
    expect(seen).toEqual(["a\nuncommitted\n"]); // it started from the folder as it was, not from HEAD

    // What the summon command does after a good write run.
    const w = report.workspace!;
    const applied = await applyToCheckout(r.dir, w.base, w.branch);
    expect(applied).toMatchObject({ applied: true });
    if (!applied.applied) throw new Error("not applied");
    await recordApplied(r.dir, shadowOf(r), { id: w.branch, kind: "summon", base: w.base, branch: w.branch, files: applied.files });
    expect(read(r, "src/a.ts")).toBe("a\nuncommitted\nby the soldier\n");
    expect(read(r, "src/new.ts")).toBe("new\n");

    const result = await undoApplied(r.dir, shadowOf(r), w.branch);
    expect(result).toMatchObject({ undone: true, id: w.branch, kind: "summon" });
    expect(read(r, "src/a.ts")).toBe("a\nuncommitted\n"); // the owner's own edit survives
    expect(has(r, "src/new.ts")).toBe(false);
    expect(statusLines(r)).toEqual(before);
    expect((await readLedger(shadowOf(r))).map((e) => e.type)).toEqual(["applied", "undone"]);
  });
});

describe("what the report says", () => {
  it("lists what was done to each file and where the work still is", () => {
    const text = renderUndo({
      undone: true,
      id: "run1",
      kind: "run",
      branch: "shadow/run/run1",
      files: [{ change: "A", path: "dir/hello.txt" }, { change: "M", path: "keep.txt" }, { change: "D", path: "old.txt" }],
    });
    expect(text.split("\n")).toEqual([
      "Undone run1: your folder no longer has its changes.",
      "  removed  dir/hello.txt",
      "  restored keep.txt",
      "  put back old.txt",
      "The work is still on shadow/run/run1.",
    ]);
  });
});

describe("sa undo", () => {
  async function sa(args: string[]) {
    const program = new Command().exitOverride();
    registerWorkspaceCommands(program);
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));
    const exitCode = process.exitCode;
    process.exitCode = undefined;
    try {
      await program.parseAsync(["node", "sa", "undo", ...args]);
      return { out: lines.join("\n"), code: process.exitCode as number | undefined };
    } finally {
      process.exitCode = exitCode;
      log.mockRestore();
    }
  }

  it("undoes the latest apply in the repository given by --cwd, and exits non-zero when it refuses", async () => {
    const r = repo();
    await applyRun(r, "run1", { "keep.txt": "a\nb\n" });
    r.write("keep.txt", "a\nb\nedited\n");
    const refused = await sa(["--cwd", r.dir]);
    expect(refused.out).toBe("Not undone: these files have changed since the run was applied.\n  keep.txt\nNothing was changed.");
    expect(refused.code).toBe(1);

    r.write("keep.txt", "a\nb\n");
    const done = await sa(["run1", "--cwd", r.dir]);
    expect(done.out).toContain("Undone run1");
    expect(done.code).toBeUndefined();
    expect(read(r, "keep.txt")).toBe("a\n");
  });
});
