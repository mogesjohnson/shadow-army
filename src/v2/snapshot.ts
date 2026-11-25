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
/** `SHADOW_ARMY_SNAPSHOTS` (or the default in `home`), checked as WSP-11 says. A failure starts no soldier. */
export function validateSnapshotRoot(value: string | undefined, ctx: { home: string; folder: string; workTrees: string[]; inspect: (dir: string) => FolderFacts; exists?: (path: string) => boolean }) {
  // The default gets the same checks as a set value (WSP-11): a home inside the folder or a working tree is no exception.
  const unset = value === undefined || value === "";
  const bad = (reason: string) => ({ ok: false as const, reason: `${unset ? "the default snapshot root" : "SHADOW_ARMY_SNAPSHOTS"} ${reason}` });
  const chosen = unset ? join(ctx.home, ".shadow-army", "snapshots") : value!;
  if (!isAbsolute(chosen)) return bad("must be an absolute path");
  const root = realish(chosen);
  if (within(realish(ctx.folder), root)) return bad("is inside the folder");
  if (ctx.workTrees.some((tree) => within(realish(tree), root))) return bad("is inside a working tree of the repository");
  const home = realish(ctx.home);
  for (let dir = root, past = ""; dir !== past; past = dir, dir = dirname(dir)) {
    if (existsSync(dir)) {
      const facts = ctx.inspect(dir);
      if (facts.owner === "other") return bad(`has ${dir}, which another user owns`);
      if (facts.writableByOthers) return bad(`has ${dir}, which another user can write`);
    }
    if (dir !== root && !within(home, dir)) {
      const found = GUIDANCE.find((name) => (ctx.exists ?? existsSync)(join(dir, name)));
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
export interface Snapshot { path: string; subfolder: string; gitDir: string; commonDir: string }
export interface OpenOptions { root: string; folder: string; sessionId: string; repo: { gitDir: string; workTree: string; commonDir: string }; git: GitFactory; ref?: string }
const gitDirOf = (path: string) => resolve(path, readFileSync(join(path, ".git"), "utf8").replace(/^gitdir:\s*/, "").trim());
/** Opens a session's snapshot of `ref` (HEAD) under `root`. A failure means the soldier does not start. */
export async function openSnapshot(options: OpenOptions): Promise<Snapshot> {
  if (!/^[\w][\w.-]*$/.test(options.sessionId)) throw new SnapshotError(`snapshot could not be made: bad session id ${options.sessionId}`);
  const subfolder = snapshotSubfolder(options.root, options.folder), path = join(subfolder, options.sessionId);
  try {
    mkdirSync(subfolder, { recursive: true });
    writeFileSync(join(subfolder, FOLDER_FILE), options.folder);
    const made = await runIn(options.git, options.repo)(["worktree", "add", "-q", "--detach", path, options.ref ?? "HEAD"], "snapshot");
    if (made.code !== 0) throw new Error(made.stderr.trim() || `git exited with ${made.code}`);
  } catch (error) {
    throw new SnapshotError(`snapshot could not be made: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { path, subfolder, gitDir: gitDirOf(path), commonDir: options.repo.commonDir };
}
const runIn = (git: GitFactory, repo: OpenOptions["repo"]): RunGit => { const handle = git(repo); return (args, kind, cwd) => handle.run(args, kind, cwd); };
const own = (snapshot: Snapshot, git: GitFactory) => runIn(git, { gitDir: snapshot.gitDir, workTree: snapshot.path, commonDir: snapshot.commonDir });
const hashOf = (file: string) => {
  const info = lstatSync(file);
  return info.isSymbolicLink() ? `link:${readlinkSync(file)}` : createHash("sha256").update(readFileSync(file)).digest("hex");
};
async function changedPaths(run: RunGit) {
  const out = (await run(["status", "--porcelain=v1", "-z", "--untracked-files=all"], "guard")).stdout.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i].length < 4) continue;
    paths.push(out[i].slice(3));
    if (/[RC]/.test(out[i].slice(0, 2))) i++; // the original name of a rename
  }
  return paths;
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
async function fingerprint(snapshot: Snapshot, run: RunGit) {
  const prints: Record<string, string> = {};
  for (const path of new Set([...await changedPaths(run), ...hashedPaths(snapshot.path)])) {
    const file = join(snapshot.path, path);
    prints[path] = lstatSync(file, { throwIfNoEntry: false }) ? hashOf(file) : "gone";
  }
  return prints;
}

/** What a turn began with: the HEAD, the `.gitignore` files it saw (base64) and every audited file's hash. */
export interface TurnStart { head: string; ignores: Record<string, string>; prints: Record<string, string> }
export interface ReadViolation { files: string[]; head?: { from: string; to: string } }

export async function beginTurn(snapshot: Snapshot, git: GitFactory): Promise<TurnStart> {
  const run = own(snapshot, git);
  const head = (await run(["rev-parse", "HEAD"], "guard")).stdout.trim();
  const ignores: Record<string, string> = {};
  for (const path of (await run(["ls-files", "-z", "--cached"], "guard")).stdout.split("\0").filter((p) => basename(p) === ".gitignore")) {
    ignores[path] = readFileSync(join(snapshot.path, path)).toString("base64");
  }
  return { head, ignores, prints: await fingerprint(snapshot, run) };
}

/**
 * The turn's writes: files git doesn't ignore by the rules the turn began with, ARM-6's paths even where
 * git ignores them, and a moved HEAD. Rules the turn changed or added are put back first, so they hide nothing.
 * Other ignored output is not a write.
 */
export async function findWrites(snapshot: Snapshot, start: TurnStart, git: GitFactory): Promise<ReadViolation | undefined> {
  const run = own(snapshot, git);
  const files = new Set<string>();
  for (const path of (await run(["ls-files", "-z", "--others"], "guard")).stdout.split("\0")) {
    if (basename(path) === ".gitignore" && !(path in start.ignores)) { files.add(path); rmSync(join(snapshot.path, path), { force: true }); }
  }
  for (const [path, data] of Object.entries(start.ignores)) {
    const file = join(snapshot.path, path), bytes = Buffer.from(data, "base64");
    if (!existsSync(file) || !readFileSync(file).equals(bytes)) { files.add(path); writeFileSync(file, bytes); }
  }
  const now = await fingerprint(snapshot, run);
  for (const path of new Set([...Object.keys(now), ...Object.keys(start.prints)])) if (now[path] !== start.prints[path]) files.add(path);
  const head = (await run(["rev-parse", "HEAD"], "guard")).stdout.trim();
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

/** Removes the snapshot, and its subfolder once nothing but the path file is left. */
export async function removeSnapshot(snapshot: Snapshot, root: string, repo: OpenOptions["repo"], git: GitFactory) {
  removeInside(root, snapshot.path);
  await runIn(git, repo)(["worktree", "prune"], "other");
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
 * A subfolder whose path file can't be read, or that is this army's own, is left as it is.
 */
export async function sweepOrphans(options: { roots: string[]; folder: string; repo: OpenOptions["repo"]; git: GitFactory; report: (orphan: Orphan) => void | Promise<void> }) {
  const main = runIn(options.git, options.repo);
  const listed = (await main(["worktree", "list", "--porcelain"], "other")).stdout.split(/\r?\n/).filter((l) => l.startsWith("worktree ")).map((l) => fold(realish(l.slice(9))));
  const mine = snapshotSubfolder("", options.folder), unreadable: string[] = [];
  for (const root of new Set(options.roots)) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const subfolder = join(root, entry.name);
      if (!entry.isDirectory() || !/-[0-9a-f]{12}$/.test(entry.name) || entry.name === basename(mine)) continue;
      let armyFolder: string;
      try { armyFolder = readFileSync(join(subfolder, FOLDER_FILE), "utf8"); } catch { unreadable.push(subfolder); continue; }
      if (existsSync(armyFolder) && listed.includes(fold(realish(armyFolder)))) continue;
      for (const session of readdirSync(subfolder, { withFileTypes: true }).filter((e) => e.isDirectory())) {
        const path = join(subfolder, session.name);
        let gitDir: string;
        try { gitDir = gitDirOf(path); } catch { continue; }
        if (!within(realish(options.repo.commonDir), realish(gitDir))) continue; // another repository's
        const run = runIn(options.git, { gitDir, workTree: path, commonDir: options.repo.commonDir });
        const head = (await run(["rev-parse", "HEAD"], "guard")).stdout.trim();
        await options.report({ folder: armyFolder, snapshot: path, files: await changedPaths(run), head });
        removeInside(root, path);
      }
      await main(["worktree", "prune"], "other");
      dropEmptySubfolder(subfolder);
    }
  }
  return { unreadable };
}
