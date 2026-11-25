import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
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
/** The registrations under `<commonDir>/worktrees` whose `gitdir` file names `path`'s `.git`. */
function registrationsOf(commonDir: string, path: string) {
  const base = join(commonDir, "worktrees"), want = fold(realish(join(path, ".git")));
  let names: string[] = [];
  try { names = readdirSync(base); } catch { return []; }
  return names.map((n) => join(base, n)).filter((admin) => {
    try { return fold(realish(readFileSync(join(admin, "gitdir"), "utf8").trim())) === want; } catch { return false; }
  });
}
/** Removes one worktree: its folder inside `root` and its own registration, then checks git no longer lists it. Nothing else is pruned. */
async function dropWorktree(root: string, repo: OpenOptions["repo"], git: GitFactory, path: string) {
  removeInside(root, path);
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
/** Paths changed against HEAD, and untracked files not ignored by the `.gitignore` files on disk and `exclude` (no other ignore source). */
async function auditPaths(run: RunGit, exclude: string[]) {
  const tracked = entries(await must(run, ["diff", "--name-only", "-z", "--no-renames", "HEAD"]));
  const others = entries(await must(run, ["ls-files", "-z", "--others", "--exclude-per-directory=.gitignore", ...exclude.map((p) => `--exclude=${p}`)]));
  return [...tracked, ...others];
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

/** What a turn began with: the HEAD, its ignore rules (every `.gitignore` on disk, base64, and info/exclude's patterns) and every audited file's hash. */
export interface TurnStart { head: string; ignores: Record<string, string>; exclude: string[]; prints: Record<string, string> }
export interface ReadViolation { files: string[]; head?: { from: string; to: string } }

export async function beginTurn(snapshot: Snapshot, git: GitFactory): Promise<TurnStart> {
  const run = own(snapshot, git);
  const head = await headOf(run);
  const ignores: Record<string, string> = {};
  for (const path of entries(await must(run, ["ls-files", "-z", "--cached", "--others"])).filter((p) => basename(p) === ".gitignore")) {
    const file = join(snapshot.path, path);
    if (lstatSync(file, { throwIfNoEntry: false })?.isFile()) ignores[path] = readFileSync(file).toString("base64");
  }
  let exclude: string[] = [];
  try { exclude = readFileSync(join(snapshot.commonDir, "info", "exclude"), "utf8").split(/\r?\n/).filter((l) => l.trim() !== "" && !l.startsWith("#")); } catch { /* none */ }
  return { head, ignores, exclude, prints: await fingerprint(snapshot, run, exclude) };
}

/**
 * The turn's writes: files git doesn't ignore by the rules the turn began with, ARM-6's paths even where git ignores them,
 * the files of commits the turn made, and a moved HEAD. `.gitignore` files the turn changed or added are put back first,
 * so they hide nothing; one behind a linked folder is reported and left. Other ignored output is not a write.
 */
export async function findWrites(snapshot: Snapshot, start: TurnStart, git: GitFactory): Promise<ReadViolation | undefined> {
  const run = own(snapshot, git);
  const files = new Set<string>();
  for (const path of entries(await must(run, ["ls-files", "-z", "--others"]))) {
    if (basename(path) === ".gitignore" && !(path in start.ignores)) { files.add(path); replaceable(snapshot, path); }
  }
  for (const [path, data] of Object.entries(start.ignores)) {
    const file = join(snapshot.path, path), bytes = Buffer.from(data, "base64");
    const info = lstatSync(file, { throwIfNoEntry: false });
    if (info?.isFile() && !info.isSymbolicLink() && info.nlink === 1 && within(realpathSync(snapshot.path), realpathSync(file)) && readFileSync(file).equals(bytes)) continue;
    files.add(path);
    const target = replaceable(snapshot, path);
    if (target) writeFileSync(target, bytes, { flag: "wx" });
  }
  const now = await fingerprint(snapshot, run, start.exclude);
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
        if (!registrationsOf(options.repo.commonDir, path).some((admin) => fold(realish(admin)) === fold(realish(gitDir)))) continue; // not this repository's
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
