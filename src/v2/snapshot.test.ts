import { execFileSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HarnessGit } from "./git/harness.js";
import {
  armyMark, beginTurn, closeSnapshot, discardWrites, findWrites, FOLDER_FILE, ignoredEntries, openSnapshot, removeInside, removeSnapshot,
  snapshotSubfolder, sweepOrphans, validateSnapshotRoot, within, type FolderFacts, type GitFactory, type Orphan,
} from "./snapshot.js";

const folders: string[] = [];
const temp = () => { const folder = realpathSync(mkdtempSync(join(tmpdir(), "sa-snap-"))); folders.push(folder); return folder; };
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const put = (file: string, text: string) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
const link = (target: string, path: string) => symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
const quiet: (dir: string) => FolderFacts = () => ({ owner: "owner", writableByOthers: false });

describe("the snapshots folder", () => {
  it("marks an army by the first 12 hex digits of its folder's path, lower-cased on Windows", () => {
    expect(armyMark("/work/App")).toMatch(/^[0-9a-f]{12}$/);
    expect(armyMark("C:\\Work\\App", "win32")).toBe(armyMark("c:\\work\\app", "win32"));
    expect(armyMark("/work/App", "linux")).not.toBe(armyMark("/work/app", "linux"));
    expect(snapshotSubfolder("/snaps", "/work/App")).toContain(`App-${armyMark("/work/App")}`);
    expect([within("/a/b", "/a/b/c"), within("/a/b", "/a/bc")]).toEqual([true, false]);
  });

  const files = new Set<string>();
  const setup = () => {
    files.clear();
    const [home, folder, tree, outside] = [temp(), temp(), temp(), temp()];
    return { home, folder, tree, outside, ctx: { home, folder, workTrees: [tree], inspect: quiet, exists: (path: string) => files.has(path) } };
  };
  it("takes the default under the home, and an absolute folder outside the folder and every working tree", () => {
    const s = setup();
    expect(validateSnapshotRoot(undefined, s.ctx)).toEqual({ ok: true, root: join(s.home, ".shadow-army", "snapshots") });
    expect(validateSnapshotRoot(join(s.outside, "snaps"), s.ctx)).toEqual({ ok: true, root: join(s.outside, "snaps") });
  });
  it("refuses a relative path, one inside the folder or a working tree, and a link into either", () => {
    const s = setup();
    const entry = join(s.outside, "entry");
    link(s.folder, entry);
    const reasons = ["snaps", join(s.folder, "snaps"), join(s.tree, "a", "b"), join(entry, "snaps")].map((value) => validateSnapshotRoot(value, s.ctx));
    expect(reasons.map((r) => (r.ok ? "" : r.reason))).toEqual([expect.stringContaining("absolute"), expect.stringContaining("inside the folder"), expect.stringContaining("working tree"), expect.stringContaining("inside the folder")]);
  });
  it("refuses a folder, or a parent, that another user owns or can write", () => {
    const s = setup();
    const root = join(s.outside, "a", "snaps");
    mkdirSync(root, { recursive: true });
    const inspect = (bad: string, facts: FolderFacts) => (dir: string) => (dir === bad ? facts : quiet(dir));
    for (const [bad, facts, word] of [[root, { owner: "owner", writableByOthers: true }, "can write"], [dirname(root), { owner: "owner", writableByOthers: true }, "can write"], [dirname(root), { owner: "other", writableByOthers: false }, "owns"]] as const) {
      const result = validateSnapshotRoot(root, { ...s.ctx, inspect: inspect(bad, facts) });
      expect(result.ok ? "" : result.reason).toContain(word);
    }
  });
  it("refuses a folder under a parent outside the home that holds a CLAUDE.md or a .claude/AGENTS.md, but not one inside the home", () => {
    const s = setup();
    for (const guidance of ["CLAUDE.md", join(".claude", "AGENTS.md")]) {
      const parent = temp();
      files.add(join(parent, guidance));
      const result = validateSnapshotRoot(join(parent, "snaps"), s.ctx);
      expect(result.ok ? "" : result.reason).toContain("above it");
    }
    files.add(join(s.home, "CLAUDE.md"));
    expect(validateSnapshotRoot(join(s.home, "snaps"), s.ctx).ok).toBe(true);
  });
});

describe("removal stays inside the snapshots folder", () => {
  it("refuses a path outside it, the folder itself, and a link, and leaves what they point at", () => {
    const [root, outside] = [temp(), temp()];
    put(join(outside, "keep.txt"), "kept");
    mkdirSync(join(root, "s"), { recursive: true });
    link(outside, join(root, "link"));
    for (const path of [outside, root, join(root, "link"), join(root, "s", "..", "..")]) expect(() => removeInside(root, path)).toThrow(/refusing/);
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("kept");
  });
  it("deletes a snapshot holding a link to an outside folder without following it, and a missing one is no error", () => {
    const [root, outside] = [temp(), temp()];
    put(join(outside, "keep.txt"), "kept");
    put(join(root, "s", "file.txt"), "x");
    link(outside, join(root, "s", "escape"));
    removeInside(root, join(root, "s"));
    expect(existsSync(join(root, "s"))).toBe(false);
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("kept");
    expect(() => removeInside(root, join(root, "s"))).not.toThrow();
  });
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();
const factory: GitFactory = (repo) => new HarnessGit({ repo, hooksDir: temp() });
const repoOf = (workTree: string) => ({ gitDir: join(workTree, ".git"), workTree, commonDir: join(workTree, ".git") });
function makeRepo() {
  const folder = temp();
  git(folder, "init", "-q");
  git(folder, "config", "core.autocrlf", "false");
  put(join(folder, ".gitignore"), "dist/\n.claude/settings.local.json\n");
  put(join(folder, "src.txt"), "one\n");
  git(folder, "add", "."); git(folder, "commit", "-q", "-m", "first");
  return { folder, repo: repoOf(folder), root: temp() };
}

describe("a snapshot's life", () => {
  it("opens outside the folder, reports each write and a commit once, and is gone before the next turn", async () => {
    const r = makeRepo();
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    expect(snap.path).toBe(join(snapshotSubfolder(r.root, r.folder), "s1"));
    expect(within(r.folder, snap.path)).toBe(false);
    expect(readFileSync(join(snap.subfolder, FOLDER_FILE), "utf8")).toBe(r.folder);
    const start = await beginTurn(snap, factory);
    put(join(snap.path, "new.txt"), "w"); put(join(snap.path, "src.txt"), "two\n");
    put(join(snap.path, "dist", "out.js"), "built");                        // ignored output: discarded, not reported
    put(join(snap.path, ".claude", "settings.local.json"), "{}");           // ignored, but ARM-6 hashes it
    git(snap.path, "commit", "-q", "--allow-empty", "-m", "soldier's");
    const found = await findWrites(snap, start, factory);
    expect(found?.files).toEqual([".claude/settings.local.json", "new.txt", "src.txt"]);
    expect(found?.head?.from).toBe(start.head);
    await discardWrites(snap, start, factory);
    expect(existsSync(join(snap.path, "dist"))).toBe(false);
    expect(readFileSync(join(snap.path, "src.txt"), "utf8")).toBe("one\n");
    expect(await findWrites(snap, start, factory)).toBeUndefined();
    const seen: string[][] = [];
    put(join(snap.path, "late.txt"), "w");
    await closeSnapshot(snap, start, r.root, r.repo, factory, (violation) => { seen.push(violation.files); expect(existsSync(snap.path)).toBe(true); });
    expect(seen).toEqual([["late.txt"]]);
    expect(existsSync(snap.subfolder)).toBe(false);
    expect(git(r.folder, "worktree", "list")).not.toContain("s1");
  }, 60_000);
  it("reports a file hidden by a .gitignore the turn added or changed", async () => {
    const r = makeRepo();
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s2", repo: r.repo, git: factory });
    const start = await beginTurn(snap, factory);
    put(join(snap.path, ".gitignore"), "*\n"); put(join(snap.path, "sub", ".gitignore"), "*\n"); put(join(snap.path, "sub", "hidden.txt"), "w");
    expect((await findWrites(snap, start, factory))?.files).toEqual([".gitignore", "sub/.gitignore", "sub/hidden.txt"]);
  });
  it("refuses to start when the snapshot can't be made", async () => {
    const r = makeRepo();
    await expect(openSnapshot({ root: r.root, folder: r.folder, sessionId: "s3", repo: r.repo, git: factory, ref: "nope" })).rejects.toThrow(/snapshot could not be made/);
    await expect(openSnapshot({ root: r.root, folder: r.folder, sessionId: "../x", repo: r.repo, git: factory })).rejects.toThrow(/bad session id/);
  });
  it("lists ignored entries outside .shadow/ (W12-4)", async () => {
    const r = makeRepo();
    put(join(r.folder, "dist", "a.js"), "x"); put(join(r.folder, ".shadow", "v2", "log"), "x");
    git(r.folder, "config", "core.excludesFile", join(r.folder, ".gitignore"));
    put(join(r.folder, ".gitignore"), "dist/\n.shadow/\n");
    expect(await ignoredEntries((args, kind, cwd) => factory(r.repo).run(args, kind, cwd))).toEqual(["dist/a.js"]);
  });
});

describe("another army's snapshots", () => {
  it("are left while its working tree exists, and reported then removed once it is gone", async () => {
    const r = makeRepo();
    const other = join(temp(), "other");
    git(r.folder, "worktree", "add", "-q", "--detach", other);
    const otherSnap = await openSnapshot({ root: r.root, folder: other, sessionId: "o1", repo: { gitDir: git(other, "rev-parse", "--absolute-git-dir"), workTree: other, commonDir: r.repo.commonDir }, git: factory });
    put(join(otherSnap.path, "changed.txt"), "w");
    const mine = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "m1", repo: r.repo, git: factory });
    const orphans: Orphan[] = [];
    const sweep = () => sweepOrphans({ roots: [r.root], folder: r.folder, repo: r.repo, git: factory, report: (o) => void orphans.push(o) });
    await sweep();
    expect(existsSync(otherSnap.path) && existsSync(mine.path) && orphans.length === 0).toBe(true);
    git(r.folder, "worktree", "remove", "--force", other);
    await sweep();
    expect(orphans.map((o) => [o.folder, o.files, o.head])).toEqual([[other, ["changed.txt"], git(r.folder, "rev-parse", "HEAD")]]);
    expect(existsSync(otherSnap.subfolder)).toBe(false);
    expect(existsSync(mine.path)).toBe(true);
    await sweep();
    expect(orphans).toHaveLength(1);
  }, 60_000);
  it("leave a subfolder whose path file can't be read, and say so", async () => {
    const r = makeRepo();
    const bad = join(r.root, "gone-0123456789ab");
    mkdirSync(join(bad, FOLDER_FILE), { recursive: true });
    const result = await sweepOrphans({ roots: [r.root], folder: r.folder, repo: r.repo, git: factory, report: () => {} });
    expect(result.unreadable).toEqual([bad]);
    expect(existsSync(bad)).toBe(true);
  });
});

describe("Codex review 5", () => {
  const failing = (match: (args: string[]) => boolean, runFirst = false): GitFactory => (repo) => {
    const real = factory(repo);
    return { run: async (args, kind, cwd) => {
      if (!match(args)) return real.run(args, kind, cwd);
      if (runFirst) await real.run(args, kind, cwd);
      return { code: 128, stdout: "", stderr: "fake failure" };
    } };
  };
  it("C1: checks the default folder too, and refuses a root that is a file", () => {
    const [folder, tree] = [temp(), temp()];
    const ctx = { home: folder, folder, workTrees: [tree], inspect: quiet };
    expect(validateSnapshotRoot(undefined, ctx).ok).toBe(false);
    const file = join(temp(), "snaps");
    put(file, "x");
    expect(validateSnapshotRoot(file, { ...ctx, home: temp() }).ok).toBe(false);
  });
  it("C1: refuses a linked subfolder or marker, and writes nothing outside the root", async () => {
    const r = makeRepo(), outside = temp();
    const subfolder = snapshotSubfolder(r.root, r.folder);
    link(outside, subfolder);
    await expect(openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory })).rejects.toThrow(/snapshot could not be made/);
    expect(readdirSync(outside)).toEqual([]);
    rmSync(subfolder); mkdirSync(subfolder);
    put(join(outside, "marker"), "kept");
    linkSync(join(outside, "marker"), join(subfolder, FOLDER_FILE));
    await expect(openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory })).rejects.toThrow(/snapshot could not be made/);
    expect(readFileSync(join(outside, "marker"), "utf8")).toBe("kept");
  });
  it("C2: puts no ignore rule back through a link, and reports the file", async () => {
    const r = makeRepo();
    put(join(r.folder, "sub", ".gitignore"), "*.log\n");
    git(r.folder, "add", "."); git(r.folder, "commit", "-q", "-m", "sub");
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    const start = await beginTurn(snap, factory);
    const outside = temp();
    put(join(outside, "sub", ".gitignore"), "outside\n"); put(join(outside, "hard"), "outside\n");
    rmSync(join(snap.path, "sub"), { recursive: true }); link(join(outside, "sub"), join(snap.path, "sub"));
    rmSync(join(snap.path, ".gitignore")); linkSync(join(outside, "hard"), join(snap.path, ".gitignore"));
    const found = await findWrites(snap, start, factory);
    expect(found?.files).toEqual(expect.arrayContaining([".gitignore", "sub/.gitignore"]));
    expect([readFileSync(join(outside, "sub", ".gitignore"), "utf8"), readFileSync(join(outside, "hard"), "utf8")]).toEqual(["outside\n", "outside\n"]);
  }, 60_000);
  it("C3: a failed add leaves no folder or registration, and removal keeps another stale registration", async () => {
    const r = makeRepo();
    const add = failing((args) => args[0] === "worktree" && args[1] === "add", true);
    await expect(openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: add })).rejects.toThrow(/snapshot could not be made/);
    expect(existsSync(snapshotSubfolder(r.root, r.folder))).toBe(false);
    expect(git(r.folder, "worktree", "list", "--porcelain")).not.toContain("s1");
    const stale = join(temp(), "stale");
    git(r.folder, "worktree", "add", "-q", "--detach", stale);
    rmSync(stale, { recursive: true, force: true });
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s2", repo: r.repo, git: factory });
    await closeSnapshot(snap, await beginTurn(snap, factory), r.root, r.repo, factory, () => {});
    expect(git(r.folder, "worktree", "list", "--porcelain")).toContain("stale");
    expect(git(r.folder, "worktree", "list", "--porcelain")).not.toContain("s2");
  }, 60_000);
  it("C4: a failed worktree listing removes nothing", async () => {
    const r = makeRepo();
    const other = join(temp(), "other");
    git(r.folder, "worktree", "add", "-q", "--detach", other);
    const otherSnap = await openSnapshot({ root: r.root, folder: other, sessionId: "o1", repo: { gitDir: git(other, "rev-parse", "--absolute-git-dir"), workTree: other, commonDir: r.repo.commonDir }, git: factory });
    const list = failing((args) => args[0] === "worktree" && args[1] === "list");
    await expect(sweepOrphans({ roots: [r.root], folder: r.folder, repo: r.repo, git: list, report: () => {} })).rejects.toThrow();
    expect(existsSync(otherSnap.path)).toBe(true);
  }, 60_000);
  it("C5: keeps an untracked ignore file and info/exclude as the turn began", async () => {
    const r = makeRepo();
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    put(join(snap.path, "extra", ".gitignore"), "*\n"); put(join(snap.path, "extra", "x.txt"), "x");
    const start = await beginTurn(snap, factory);
    expect(await findWrites(snap, start, factory)).toBeUndefined();
    put(join(r.repo.commonDir, "info", "exclude"), "secret.txt\n"); put(join(snap.path, "secret.txt"), "w");
    expect((await findWrites(snap, start, factory))?.files).toEqual(["secret.txt"]);
  }, 60_000);
  it("C6: reports the files of a commit the turn made", async () => {
    const r = makeRepo();
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    const start = await beginTurn(snap, factory);
    put(join(snap.path, "committed.txt"), "w"); put(join(snap.path, "src.txt"), "two\n");
    git(snap.path, "add", "."); git(snap.path, "commit", "-q", "-m", "soldier's");
    expect((await findWrites(snap, start, factory))?.files).toEqual(["committed.txt", "src.txt"]);
  }, 60_000);
  it("C7: a failed audit command is an error, not a clean audit", async () => {
    const r = makeRepo();
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    await expect(beginTurn(snap, failing((args) => args[0] === "rev-parse"))).rejects.toThrow(/git/);
    const start = await beginTurn(snap, factory);
    for (const sub of ["ls-files", "diff", "rev-parse"]) await expect(findWrites(snap, start, failing((args) => args[0] === sub))).rejects.toThrow(/git/);
  }, 60_000);
});

describe("Codex review 14", () => {
  const recording = (calls: string[][]): GitFactory => (repo) => {
    const real = factory(repo);
    return { run: (args, kind, cwd) => { calls.push(args); return real.run(args, kind, cwd); } };
  };
  const listed = (folder: string) => git(folder, "worktree", "list", "--porcelain");
  it("C9: git removes an existing snapshot, locked too; a missing one loses only its own registration", async () => {
    const r = makeRepo(), calls: string[][] = [];
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    git(r.folder, "worktree", "lock", snap.path);
    await removeSnapshot(snap, r.root, r.repo, recording(calls));
    expect(calls).toContainEqual(["worktree", "remove", "--force", "--force", snap.path]);
    expect([existsSync(snap.path), listed(r.folder).includes("s1")]).toEqual([false, false]);
    const stale = join(temp(), "stale");
    git(r.folder, "worktree", "add", "-q", "--detach", stale);
    rmSync(stale, { recursive: true, force: true });
    const gone = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s2", repo: r.repo, git: factory });
    rmSync(gone.path, { recursive: true, force: true });
    calls.length = 0;
    await removeSnapshot(gone, r.root, r.repo, recording(calls));
    expect(calls.filter((args) => args[0] === "worktree" && args[1] !== "list")).toEqual([]);
    expect([listed(r.folder).includes("s2"), listed(r.folder).includes("stale")]).toEqual([false, true]);
  }, 60_000);
  it("C10: keeps git's ignore precedence and the global excludes the turn began with", async () => {
    const r = makeRepo();
    put(join(r.folder, "keep", ".gitignore"), "!*.out\n");
    git(r.folder, "add", "."); git(r.folder, "commit", "-q", "-m", "keep");
    put(join(r.repo.commonDir, "info", "exclude"), "*.out\n");
    const globalFile = join(temp(), "ignore");
    put(globalFile, "*.tmp\n");
    git(r.folder, "config", "core.excludesFile", globalFile);
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    const start = await beginTurn(snap, factory);
    put(join(snap.path, "a.tmp"), "w"); put(join(snap.path, "b.out"), "w"); put(join(snap.path, "keep", "c.out"), "w");
    put(globalFile, "");
    expect((await findWrites(snap, start, factory))?.files).toEqual(["keep/c.out"]);
  }, 60_000);
  it("#136 C9: a .gitignore that is itself a link to an outside folder is replaced, never written through", async () => {
    const r = makeRepo(), outside = temp();
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    const start = await beginTurn(snap, factory);
    rmSync(join(snap.path, ".gitignore")); link(outside, join(snap.path, ".gitignore"));
    expect((await findWrites(snap, start, factory))?.files).toContain(".gitignore");
    expect(readdirSync(outside)).toEqual([]);
    expect(readFileSync(join(snap.path, ".gitignore"), "utf8")).toBe("dist/\n.claude/settings.local.json\n");
  }, 60_000);
});
describe("Codex review 31", () => {
  it("C9: a registration that can't be read keeps the snapshot folder", async () => {
    const r = makeRepo();
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    rmSync(join(snap.gitDir, "gitdir")); mkdirSync(join(snap.gitDir, "gitdir"));
    await expect(removeSnapshot(snap, r.root, r.repo, factory)).rejects.toThrow(/can't read/);
    expect(existsSync(join(snap.path, "src.txt"))).toBe(true);
  }, 60_000);
  it("C11: worktree removal runs on the five-minute limit", async () => {
    const r = makeRepo(), kinds: (string | undefined)[] = [];
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    const spy: GitFactory = (repo) => { const real = factory(repo); return { run: (args, kind, cwd) => { if (args[1] === "remove") kinds.push(kind); return real.run(args, kind, cwd); } }; };
    await removeSnapshot(snap, r.root, r.repo, spy);
    expect(kinds).toEqual(["other"]);
  }, 60_000);
  it("C10: a .gitignore the turn added to the index hides nothing", async () => {
    const r = makeRepo();
    const snap = await openSnapshot({ root: r.root, folder: r.folder, sessionId: "s1", repo: r.repo, git: factory });
    const start = await beginTurn(snap, factory);
    put(join(snap.path, "sub", ".gitignore"), "*.out\n"); git(snap.path, "add", "sub/.gitignore");
    put(join(snap.path, "sub", "hidden.out"), "w");
    expect((await findWrites(snap, start, factory))?.files).toEqual(["sub/.gitignore", "sub/hidden.out"]);
  }, 60_000);
});
