import { lstat, readdir, readFile, readlink, rm, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { CASE_INSENSITIVE_FS } from "./claims.js";
import { canonicalPath, git, splitZ } from "./git.js";

/*
 * A soldier can replace a folder in its worktree with a symbolic link or a Windows junction that
 * points outside the repository. git (`worktree remove --force`, `checkout`) and lexical path checks
 * follow such links, so Shadow Army clears them, without following them, before it touches a
 * worktree itself.
 */

/**
 * The symbolic links `ref` itself tracks: each path, relative to the worktree with forward slashes,
 * and the target it records.
 */
export async function trackedLinks(worktree: string, ref: string): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  for (const entry of splitZ(await git(worktree, ["ls-tree", "-r", "-z", "--full-tree", ref]))) {
    if (!entry.startsWith("120000 ")) continue;
    const oid = entry.split(" ")[2]!.split("\t")[0]!;
    links.set(entry.slice(entry.indexOf("\t") + 1), await git(worktree, ["cat-file", "blob", oid]));
  }
  return links;
}

/** Remove one link without following it. A directory link or junction on Windows needs rmdir. */
async function removeLink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EISDIR") throw e;
    await rmdir(path);
  }
}

/** Remove `path` if it is itself a link, without following it. Says whether it was one. */
export async function removeIfLink(path: string): Promise<boolean> {
  const stats = await lstat(path).catch(() => undefined);
  if (!stats?.isSymbolicLink()) return false;
  await removeLink(path);
  return true;
}

/** Whether the link at `path` still points where its base records, compared with forward slashes. */
async function pointsAt(path: string, target: string): Promise<boolean> {
  const actual = await readlink(path).catch(() => undefined);
  return actual !== undefined && actual.replace(/\\/g, "/") === target.replace(/\\/g, "/");
}

/**
 * Unlink every symbolic link and junction under `dir`, never following one. A link at a path in
 * `keep` stays only while it points at the target `keep` records for it, since a soldier can swap a
 * tracked link for a junction that leads outside. Returns what was removed, relative to `dir` with
 * forward slashes.
 */
export async function unlinkLinks(dir: string, keep: ReadonlyMap<string, string> = new Map()): Promise<string[]> {
  const removed: string[] = [];
  const walk = async (abs: string): Promise<void> => {
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      const path = join(abs, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) {
        const rel = relative(dir, path).split(sep).join("/");
        const target = keep.get(rel);
        if (target !== undefined && (await pointsAt(path, target))) continue;
        await removeLink(path);
        removed.push(rel);
      } else if (stats.isDirectory()) {
        await walk(path);
      }
    }
  };
  await walk(dir);
  return removed.sort();
}

/**
 * Unlink the links a soldier left in its worktree before the claim audit, never following one. A link
 * at a path `base` tracks as a symbolic link stays only where git checks links out as links
 * (`core.symlinks`), while it points at the base's target and git still sees the base's entry there.
 * Anything else there is a substitute. Where links check out as plain files, every link is one. Git
 * for Windows reads a junction as a folder whatever its target, so it would commit the files behind
 * it. Returns what was removed, relative to `worktree` with forward slashes.
 */
export async function unlinkSoldierLinks(worktree: string, base: string): Promise<string[]> {
  const checksOutLinks =
    (await git(worktree, ["config", "--type=bool", "--default=true", "core.symlinks"])).trim() !== "false";
  const keep = checksOutLinks ? await trackedLinks(worktree, base) : new Map<string, string>();
  const removed = await unlinkLinks(worktree, keep);
  if (!keep.size) return removed;
  // Only links matching the base are left, so git reads through no other link here.
  const changed = new Set(splitZ(await git(worktree, ["diff", "--name-only", "-z", "--no-renames", base])));
  for (const rel of keep.keys()) {
    if (changed.has(rel) && (await removeIfLink(join(worktree, rel)))) removed.push(rel);
  }
  return removed.sort();
}

/** Whether `root` itself, or any existing folder between it and `rel` (not `rel` itself), is a link. */
export async function crossesLink(root: string, rel: string): Promise<boolean> {
  // A worktree folder replaced by a link leads wherever the link points.
  try {
    if ((await lstat(root)).isSymbolicLink()) return true;
  } catch {
    return false; // no root, nothing to follow
  }
  const parts = rel.split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) return true;
    } catch {
      return false; // the rest of the path does not exist
    }
  }
  return false;
}

/**
 * A worktree path in comparable form: its parent folder canonical (git records real paths), its own
 * name as written, forward slashes, case folded where the file system ignores case. The worktree
 * itself is never resolved: a soldier can replace its worktree folder with a link to another
 * worktree, and resolving that link would match the other worktree's record.
 */
const comparableWorktree = (p: string) => {
  const c = `${canonicalPath(dirname(p)).replace(/\\/g, "/")}/${basename(p)}`;
  return CASE_INSENSITIVE_FS ? c.toLowerCase() : c;
};

/**
 * git's record of the worktree at `path`: the folders under the common git dir's `worktrees/` whose
 * `gitdir` file names `<path>/.git`. Found through those files, never through the worktree's own
 * `.git` file, which a soldier can rewrite.
 */
async function worktreeRecords(repoRoot: string, path: string): Promise<string[]> {
  const common = resolve(repoRoot, (await git(repoRoot, ["rev-parse", "--git-common-dir"])).trim());
  const dir = join(common, "worktrees");
  const want = comparableWorktree(path);
  const found: string[] = [];
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const record = join(dir, name);
    const gitdir = (await readFile(join(record, "gitdir"), "utf8").catch(() => "")).trim();
    // With worktree.useRelativePaths, gitdir is relative to the record's own folder.
    if (gitdir && comparableWorktree(dirname(resolve(record, gitdir))) === want) found.push(record);
  }
  return found;
}

/**
 * Delete a Shadow Army worktree without following links: unlink every link inside it, delete it with
 * Node (whose rm never follows links either), then delete git's record of it. `git worktree remove
 * --force` follows a junction and empties its target, and `git worktree prune` would also drop the
 * records of the owner's other worktrees whose folders are missing, so neither is used.
 */
export async function removeWorktreeSafely(repoRoot: string, path: string): Promise<void> {
  const records = await worktreeRecords(repoRoot, path).catch(() => [] as string[]);
  const root = await lstat(path).catch(() => undefined);
  if (root?.isSymbolicLink()) {
    // The worktree folder itself was replaced by a link: remove the link, never what it points to.
    await removeLink(path);
  } else if (root) {
    await unlinkLinks(path).catch(() => undefined);
    await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
  for (const record of records) await rm(record, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
