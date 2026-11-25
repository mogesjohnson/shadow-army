import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HarnessGit } from "./git/harness.js";
import {
  armyMark, beginTurn, closeSnapshot, discardWrites, findWrites, FOLDER_FILE, ignoredEntries, openSnapshot, removeInside,
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
  it("checks the default as it checks a set value: a home inside the folder or a working tree, or a writable parent, is refused", () => {
    const s = setup();
    const reasons = [{ ...s.ctx, home: join(s.folder, "home") }, { ...s.ctx, home: s.tree }, { ...s.ctx, inspect: (dir: string) => (dir === s.home ? { owner: "other" as const, writableByOthers: false } : quiet(dir)) }]
      .map((ctx) => validateSnapshotRoot(undefined, ctx)).map((r) => (r.ok ? "" : r.reason));
    expect(reasons).toEqual([expect.stringMatching(/^the default snapshot root is inside the folder/), expect.stringContaining("working tree"), expect.stringContaining("owns")]);
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
