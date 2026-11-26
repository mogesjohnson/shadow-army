import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { GitResult, HarnessKind } from "./git/harness.js";

export type RunGit = (args: string[], kind?: HarnessKind, cwd?: string) => Promise<GitResult>;
export type GitFactory = (repo: { gitDir: string; workTree: string; commonDir: string }) => { run: RunGit };
export class SnapshotError extends Error {}
export const FOLDER_FILE = "folder-path";
const GUIDANCE = ["CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md", "AGENTS.md", ".claude/AGENTS.md"];
/** ARM-6's paths, hashed even where git ignores them: root files, `.env*`, and everything under these folders. */
const HASHED_FILES = [".mcp.json", "AGENTS.md", "CLAUDE.md", "shadow.config.json", "orchestratorDelegate.md", "rules.md", "agent.md"];
const HASHED_DIRS = [".claude", ".githooks"];
const fold = (path: string) => (process.platform === "linux" ? path : path.toLowerCase());
export function within(root: string, path: string) {
  const rel = relative(fold(root), fold(path));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
/** The real path of the nearest existing ancestor, with the rest appended: a link anywhere in it is followed. */
export function realish(path: string): string {
  const full = resolve(path);
  try { return realpathSync(full); } catch { const up = dirname(full); return up === full ? full : join(realish(up), basename(full)); }
}
/** The first 12 hex digits of the SHA-256 of the folder's path, lower-cased on Windows. */
export const armyMark = (folder: string, platform: NodeJS.Platform = process.platform) =>
  createHash("sha256").update(platform === "win32" ? folder.toLowerCase() : folder, "utf8").digest("hex").slice(0, 12);
export const snapshotSubfolder = (root: string, folder: string) => join(root, `${basename(folder)}-${armyMark(folder)}`);
export interface FolderFacts { owner: "owner" | "trusted" | "other"; writableByOthers: boolean }
/** POSIX facts. Windows needs an ACL reader (M1b-17); it is not tested here. */
export function posixInspect(dir: string): FolderFacts {
  const info = lstatSync(dir);
  return { owner: info.uid === process.getuid?.() ? "owner" : info.uid === 0 ? "trusted" : "other", writableByOthers: (info.mode & 0o022) !== 0 };
}
/** `SHADOW_ARMY_SNAPSHOTS`, or the default in `home`, checked as WSP-11 says: the default gets every check too. A failure starts no soldier. */
export function validateSnapshotRoot(value: string | undefined, ctx: { home: string; folder: string; workTrees: string[]; inspect: (dir: string) => FolderFacts; exists?: (path: string) => boolean }) {
  const name = value ? "SHADOW_ARMY_SNAPSHOTS" : "the default snapshots folder";
  const bad = (reason: string) => ({ ok: false as const, reason: `${name} ${reason}` });
  if (value && !isAbsolute(value)) return bad("must be an absolute path");
  const root = realish(value || join(ctx.home, ".shadow-army", "snapshots"));
  if (within(realish(ctx.folder), root)) return bad("is inside the folder");
  if (ctx.workTrees.some((tree) => within(realish(tree), root))) return bad("is inside a working tree of the repository");
  const home = realish(ctx.home);
  for (let dir = root, past = ""; dir !== past; past = dir, dir = dirname(dir)) {
    const info = lstatSync(dir, { throwIfNoEntry: false });
    if (info) {
      if (!info.isDirectory()) return bad(`has ${dir}, which is not a folder`);
      const facts = ctx.inspect(dir);
      if (facts.owner === "other") return bad(`has ${dir}, which another user owns`);
      if (facts.writableByOthers) return bad(`has ${dir}, which another user can write`);
    }
    if (dir !== root && !within(home, dir)) {
      const found = GUIDANCE.find((guide) => (ctx.exists ?? existsSync)(join(dir, guide)));
      if (found) return bad(`has ${join(dir, found)} above it, which soldiers' CLIs would load`);
    }
  }
  return { ok: true as const, root };
}
/** Deletes `path` only if it lies strictly inside `root` once links are resolved, and is no link itself. A path already gone is no error. */
export function removeInside(root: string, path: string) {
  const link = (() => { try { return lstatSync(path).isSymbolicLink(); } catch { return undefined; } })();
  if (link === undefined) return;
  const real = realish(path);
  if (link || real === realish(root) || !within(realish(root), real)) throw new SnapshotError(`refusing to remove ${path}: not a folder inside ${root}`);
  rmSync(real, { recursive: true, force: true, maxRetries: 3 });
}
/** True when `path` is a real folder (no link) directly inside the real folder `parent`. */
function plainChild(parent: string, path: string) {
  const info = lstatSync(path, { throwIfNoEntry: false });
  return !!info && info.isDirectory() && !info.isSymbolicLink() && fold(dirname(realpathSync(path))) === fold(realpathSync(parent));
}
export interface Snapshot { path: string; subfolder: string; gitDir: string; commonDir: string }
export interface OpenOptions { root: string; folder: string; sessionId: string; repo: { gitDir: string; workTree: string; commonDir: string }; git: GitFactory; ref?: string }
const gitDirOf = (path: string) => resolve(path, readFileSync(join(path, ".git"), "utf8").replace(/^gitdir:\s*/, "").trim());
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";
/**
 * The registrations under `<commonDir>/worktrees` whose `gitdir` file names `path`'s `.git`. A missing folder or
 * `gitdir` file is no registration; any other read failure throws, since then registration can't be established.
 */
function registrationsOf(commonDir: string, path: string) {
  const base = join(commonDir, "worktrees"), want = fold(realish(join(path, ".git")));
  const cannot = (what: string, error: unknown) => new SnapshotError(`can't read ${what}: ${error instanceof Error ? error.message : String(error)}`);
  let names: string[] = [];
  try { names = readdirSync(base); } catch (error) { if (missing(error)) return []; throw cannot(base, error); }
  return names.map((n) => join(base, n)).filter((admin) => {
    const file = join(admin, "gitdir");
    try { return fold(realish(readFileSync(file, "utf8").trim())) === want; } catch (error) { if (missing(error)) return false; throw cannot(file, error); }
  });
}
/**
 * Removes one worktree (WSP-10): while its folder exists, a real folder inside `root`, through `git worktree remove --force --force`;
 * once the folder is gone, only its own registration. An unregistered folder (a failed add's leftover) is deleted inside `root`.
 * Then checks git no longer lists it. Nothing else is pruned. Removal is an `other` command: WSP-10's five-minute limit.
 * A registration that can't be read deletes nothing.
 */
async function dropWorktree(root: string, repo: OpenOptions["repo"], git: GitFactory, path: string) {
  const info = lstatSync(path, { throwIfNoEntry: false });
  if (info && registrationsOf(repo.commonDir, path).length > 0) {
    const real = realish(path);
    if (info.isSymbolicLink() || !info.isDirectory() || real === realish(root) || !within(realish(root), real)) throw new SnapshotError(`refusing to remove ${path}: not a folder inside ${root}`);
    const removed = await runIn(git, repo)(["worktree", "remove", "--force", "--force", path], "other");
    if (removed.code !== 0) throw new SnapshotError(`git worktree remove failed: ${removed.stderr.trim() || `exit ${removed.code}`}`);
  } else if (info) removeInside(root, path);
  if (lstatSync(path, { throwIfNoEntry: false })) throw new SnapshotError(`snapshot ${path} is still there`);
  for (const admin of registrationsOf(repo.commonDir, path)) removeInside(join(repo.commonDir, "worktrees"), admin);
  if ((await listWorktrees(runIn(git, repo))).includes(fold(realish(path)))) throw new SnapshotError(`snapshot ${path} is still registered`);
}
/** Opens a session's snapshot of `ref` (HEAD) under `root`. A failure means the soldier does not start, and leaves nothing behind. */
export async function openSnapshot(options: OpenOptions): Promise<Snapshot> {
  if (!/^[\w][\w.-]*$/.test(options.sessionId)) throw new SnapshotError(`snapshot could not be made: bad session id ${options.sessionId}`);
  const subfolder = snapshotSubfolder(options.root, options.folder), path = join(subfolder, options.sessionId);
  let made = false;
  try {
    mkdirSync(subfolder, { recursive: true });
    if (!plainChild(options.root, subfolder)) throw new Error(`${subfolder} is not a folder inside ${options.root}`);
    const marker = join(subfolder, FOLDER_FILE), info = lstatSync(marker, { throwIfNoEntry: false });
    if (info && (!info.isFile() || info.nlink !== 1 || readFileSync(marker, "utf8") !== options.folder)) throw new Error(`${marker} is not this army's`);
    if (!info) writeFileSync(marker, options.folder, { flag: "wx" });
    if (lstatSync(path, { throwIfNoEntry: false })) throw new Error(`${path} already exists`);
    made = true;
    const added = await runIn(options.git, options.repo)(["worktree", "add", "-q", "--detach", path, options.ref ?? "HEAD"], "snapshot");
    if (added.code !== 0) throw new Error(added.stderr.trim() || `git exited with ${added.code}`);
    if (!plainChild(subfolder, path)) throw new Error(`${path} is not a folder inside ${subfolder}`);
    const gitDir = gitDirOf(path);
    if (!registrationsOf(options.repo.commonDir, path).some((admin) => fold(realish(admin)) === fold(realish(gitDir)))) throw new Error(`${path} is not registered`);
    return { path, subfolder, gitDir, commonDir: options.repo.commonDir };
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    if (made) await dropWorktree(options.root, options.repo, options.git, path).catch((undo) => { message += `; cleanup failed: ${undo instanceof Error ? undo.message : String(undo)}`; });
    if (made || !lstatSync(subfolder, { throwIfNoEntry: false })?.isSymbolicLink()) dropEmptySubfolder(subfolder);
    throw new SnapshotError(`snapshot could not be made: ${message}`);
  }
}
const runIn = (git: GitFactory, repo: OpenOptions["repo"]): RunGit => { const handle = git(repo); return (args, kind, cwd) => handle.run(args, kind, cwd); };
const own = (snapshot: Snapshot, git: GitFactory) => runIn(git, { gitDir: snapshot.gitDir, workTree: snapshot.path, commonDir: snapshot.commonDir });
/** A git command's output; a nonzero exit is an error, never empty data. */
async function must(run: RunGit, args: string[], kind: HarnessKind = "guard") {
  const result = await run(args, kind);
  if (result.code !== 0) throw new SnapshotError(`git ${args.slice(0, 2).join(" ")} failed: ${result.stderr.trim() || `exit ${result.code}`}`);
  return result.stdout;
}
const entries = (out: string) => out.split("\0").filter(Boolean);
async function headOf(run: RunGit) {
  const head = (await must(run, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(head)) throw new SnapshotError(`git rev-parse gave no commit: ${head}`);
  return head;
}
async function listWorktrees(run: RunGit) {
  return entries(await must(run, ["worktree", "list", "--porcelain", "-z"], "other")).filter((l) => l.startsWith("worktree ")).map((l) => fold(realish(l.slice(9))));
}
const hashOf = (file: string) => {
  const info = lstatSync(file);
  return info.isSymbolicLink() ? `link:${readlinkSync(file)}` : createHash("sha256").update(readFileSync(file)).digest("hex");
};
async function changedPaths(run: RunGit) {
  const out = (await must(run, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).split("\0");
  const paths: string[] = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i].length < 4) continue;
    paths.push(out[i].slice(3));
    if (/[RC]/.test(out[i].slice(0, 2))) i++; // the original name of a rename
  }
  return paths;
}
/**
 * Paths changed against HEAD, and untracked files not ignored by the `.gitignore` files on disk and the saved `excludes`
 * (global excludes, then `info/exclude`). `--exclude-from` ranks them below per-directory rules, the later one higher, as git does.
 */
async function auditPaths(run: RunGit, excludes: string[]) {
  const tracked = entries(await must(run, ["diff", "--name-only", "-z", "--no-renames", "HEAD"]));
  const dir = mkdtempSync(join(tmpdir(), "sa-excludes-"));
  try {
    const from = excludes.map((text, i) => { const file = join(dir, String(i)); writeFileSync(file, text); return `--exclude-from=${file}`; });
    return [...tracked, ...entries(await must(run, ["ls-files", "-z", "--others", "--exclude-per-directory=.gitignore", ...from]))];
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** What `git status --ignored` lists as ignored, less `.shadow/` (W12-4: the guard compares these too). */
export async function ignoredEntries(run: RunGit) {
  const out = (await run(["status", "--porcelain=v1", "-z", "--ignored=traditional", "--untracked-files=all"], "guard")).stdout.split("\0");
  return out.filter((entry) => entry.startsWith("!! ")).map((entry) => entry.slice(3)).filter((path) => !path.startsWith(".shadow/"));
}
function hashedPaths(root: string) {
  const found: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(path); else found.push(path);
    }
  };
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (HASHED_DIRS.includes(entry.name) && entry.isDirectory()) walk(entry.name);
    else if (!entry.isDirectory() && (HASHED_FILES.includes(entry.name) || entry.name.startsWith(".env"))) found.push(entry.name);
  }
  return found;
}
async function fingerprint(snapshot: Snapshot, run: RunGit, exclude: string[]) {
  const prints: Record<string, string> = {};
  for (const path of new Set([...await auditPaths(run, exclude), ...hashedPaths(snapshot.path)])) {
    const file = join(snapshot.path, path);
    prints[path] = lstatSync(file, { throwIfNoEntry: false }) ? hashOf(file) : "gone";
  }
  return prints;
}
/**
 * `rel` inside the snapshot, made safe to replace: every folder above it is a real folder (made if missing), and whatever
 * is at `rel` is unlinked, so a link or hard link there is never written through. Undefined when a folder above it is a link.
 */
function replaceable(snapshot: Snapshot, rel: string) {
  let dir = snapshot.path;
  for (const part of rel.split("/").slice(0, -1)) {
    dir = join(dir, part);
    const info = lstatSync(dir, { throwIfNoEntry: false });
    if (!info) mkdirSync(dir);
    else if (!info.isDirectory() || info.isSymbolicLink()) return undefined;
  }
  const file = join(dir, basename(rel));
  if (!within(realpathSync(snapshot.path), realish(dir))) return undefined;
  const info = lstatSync(file, { throwIfNoEntry: false });
  if (info?.isDirectory() && !info.isSymbolicLink()) return undefined;
  if (info) rmSync(file, { force: true });
  return file;
}

/**
 * What a turn began with: the HEAD, its ignore rules (every `.gitignore` on disk, base64; the global excludes file's and
 * info/exclude's text, in that order) and every audited file's hash.
 */
export interface TurnStart { head: string; ignores: Record<string, string>; excludes: string[]; prints: Record<string, string> }
export interface ReadViolation { files: string[]; head?: { from: string; to: string } }

/** Whether anything is at `file` (a dangling link counts); only a missing path, or a file where a folder should be, is absent. */
function onDisk(file: string) {
  try { return lstatSync(file, { throwIfNoEntry: false }) !== undefined; } catch (error) { return (error as NodeJS.ErrnoException).code !== "ENOTDIR"; }
}
const readText = (file: string) => { try { return readFileSync(file, "utf8"); } catch { return ""; } };
/** The text of `core.excludesFile`, or of git's default `$XDG_CONFIG_HOME/git/ignore` when it is unset; a missing file is empty. */
async function globalExcludes(run: RunGit, workTree: string) {
  const result = await run(["config", "--path", "--get", "core.excludesFile"], "guard");
  if (result.code !== 0 && result.code !== 1) throw new SnapshotError(`git config failed: ${result.stderr.trim() || `exit ${result.code}`}`);
  const set = result.code === 0 ? result.stdout.trim() : "";
  const xdg = process.env.XDG_CONFIG_HOME || join(process.env.HOME || homedir(), ".config");
  return readText(set ? resolve(workTree, set) : join(xdg, "git", "ignore"));
}
export async function beginTurn(snapshot: Snapshot, git: GitFactory): Promise<TurnStart> {
  const run = own(snapshot, git);
  const head = await headOf(run);
  const ignores: Record<string, string> = {};
  for (const path of entries(await must(run, ["ls-files", "-z", "--cached", "--others"])).filter((p) => basename(p) === ".gitignore")) {
    const file = join(snapshot.path, path);
    if (lstatSync(file, { throwIfNoEntry: false })?.isFile()) ignores[path] = readFileSync(file).toString("base64");
  }
  const excludes = [await globalExcludes(run, snapshot.path), readText(join(snapshot.commonDir, "info", "exclude"))];
  return { head, ignores, excludes, prints: await fingerprint(snapshot, run, excludes) };
}

/**
 * The turn's writes: files git doesn't ignore by the rules the turn began with, ARM-6's paths even where git ignores them,
 * the files of commits the turn made, and a moved HEAD. `.gitignore` files the turn changed or added (untracked or indexed)
 * are put back first, so they hide nothing; one behind a linked folder is reported and left. Other ignored output is not a write.
 */
export async function findWrites(snapshot: Snapshot, start: TurnStart, git: GitFactory): Promise<ReadViolation | undefined> {
  const run = own(snapshot, git);
  const files = new Set<string>();
  for (const path of entries(await must(run, ["ls-files", "-z", "--cached", "--others"]))) {
    // A path absent from disk at the start and still absent hides nothing and is no write; nothing is made for it.
    if (basename(path) === ".gitignore" && !(path in start.ignores) && onDisk(join(snapshot.path, path))) { files.add(path); replaceable(snapshot, path); }
  }
  for (const [path, data] of Object.entries(start.ignores)) {
    const file = join(snapshot.path, path), bytes = Buffer.from(data, "base64");
    const info = lstatSync(file, { throwIfNoEntry: false });
    if (info?.isFile() && !info.isSymbolicLink() && info.nlink === 1 && within(realpathSync(snapshot.path), realpathSync(file)) && readFileSync(file).equals(bytes)) continue;
    files.add(path);
    const target = replaceable(snapshot, path);
    if (target) writeFileSync(target, bytes, { flag: "wx" });
  }
  const now = await fingerprint(snapshot, run, start.excludes);
  for (const path of new Set([...Object.keys(now), ...Object.keys(start.prints)])) if (now[path] !== start.prints[path]) files.add(path);
  const head = await headOf(run);
  if (head !== start.head) for (const path of entries(await must(run, ["diff", "--name-only", "-z", "--no-renames", start.head, head]))) files.add(path);
  if (files.size === 0 && head === start.head) return undefined;
  return { files: [...files].sort(), ...(head === start.head ? {} : { head: { from: start.head, to: head } }) };
}

/** Puts the snapshot back as the turn began, ignored output included, before its next turn. */
export async function discardWrites(snapshot: Snapshot, start: TurnStart, git: GitFactory) {
  const run = own(snapshot, git);
  for (const args of [["checkout", "-q", "--force", "--detach", start.head], ["reset", "-q", "--hard", start.head], ["clean", "-q", "-ffdx"]]) {
    const result = await run(args, "snapshot");
    if (result.code !== 0) throw new SnapshotError(`snapshot could not be put back: ${result.stderr.trim()}`);
  }
}

/** Removes the snapshot and its own registration, and its subfolder once nothing but the path file is left. */
export async function removeSnapshot(snapshot: Snapshot, root: string, repo: OpenOptions["repo"], git: GitFactory) {
  await dropWorktree(root, repo, git, snapshot.path);
  dropEmptySubfolder(snapshot.subfolder);
}
function dropEmptySubfolder(subfolder: string) {
  try {
    if (readdirSync(subfolder).every((name) => name === FOLDER_FILE)) { rmSync(join(subfolder, FOLDER_FILE), { force: true }); rmdirSync(subfolder); }
  } catch { /* not there, or not empty */ }
}

/** Closes a session: its writes are reported (and discarded with it) before the snapshot goes. */
export async function closeSnapshot(snapshot: Snapshot, start: TurnStart, root: string, repo: OpenOptions["repo"], git: GitFactory, report: (violation: ReadViolation) => void | Promise<void>) {
  const violation = await findWrites(snapshot, start, git);
  if (violation) await report(violation);
  await removeSnapshot(snapshot, root, repo, git);
}

export interface Orphan { folder: string; snapshot: string; files: string[]; head: string }
/**
 * Handles snapshots of another army whose folder is gone from disk or from `git worktree list`: each is reported, then removed.
 * The listing must succeed. A subfolder whose path file can't be read or doesn't match its name, or that is this army's own,
 * is left as it is; so is a session that isn't a registered worktree of this repository.
 */
export async function sweepOrphans(options: { roots: string[]; folder: string; repo: OpenOptions["repo"]; git: GitFactory; report: (orphan: Orphan) => void | Promise<void> }) {
  const listed = await listWorktrees(runIn(options.git, options.repo));
  const mine = snapshotSubfolder("", options.folder), unreadable: string[] = [];
  for (const root of new Set(options.roots)) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const subfolder = join(root, entry.name);
      if (!entry.isDirectory() || !/-[0-9a-f]{12}$/.test(entry.name) || entry.name === basename(mine)) continue;
      let armyFolder: string;
      try { armyFolder = readFileSync(join(subfolder, FOLDER_FILE), "utf8"); } catch { unreadable.push(subfolder); continue; }
      if (basename(snapshotSubfolder("", armyFolder)) !== entry.name) { unreadable.push(subfolder); continue; }
      if (existsSync(armyFolder) && listed.includes(fold(realish(armyFolder)))) continue;
      for (const session of readdirSync(subfolder, { withFileTypes: true }).filter((e) => e.isDirectory())) {
        const path = join(subfolder, session.name);
        let gitDir: string;
        try { gitDir = gitDirOf(path); } catch { continue; }
        let ours: boolean;
        try { ours = registrationsOf(options.repo.commonDir, path).some((admin) => fold(realish(admin)) === fold(realish(gitDir))); } catch { unreadable.push(path); continue; }
        if (!ours) continue; // not this repository's
        const run = runIn(options.git, { gitDir, workTree: path, commonDir: options.repo.commonDir });
        const head = await headOf(run);
        await options.report({ folder: armyFolder, snapshot: path, files: await changedPaths(run), head });
        await dropWorktree(root, options.repo, options.git, path);
      }
      dropEmptySubfolder(subfolder);
    }
  }
  return { unreadable };
}
