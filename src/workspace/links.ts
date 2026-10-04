import { lstat, readdir, readFile, rm, rmdir, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { CASE_INSENSITIVE_FS } from "./claims.js";
import { canonicalPath, git, splitZ } from "./git.js";

/*
 * A soldier can replace a folder in its worktree with a symbolic link or a Windows junction that
 * points outside the repository. git (`worktree remove --force`, `checkout`) and lexical path checks
 * follow such links, so Shadow Army clears them, without following them, before it touches a
 * worktree itself.
 */

/** Paths, relative to the worktree with forward slashes, that `ref` itself tracks as symbolic links. */
export async function trackedLinks(worktree: string, ref: string): Promise<Set<string>> {
  const links = new Set<string>();
  for (const entry of splitZ(await git(worktree, ["ls-tree", "-r", "-z", "--full-tree", ref]))) {
    if (entry.startsWith("120000 ")) links.add(entry.slice(entry.indexOf("\t") + 1));
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

/**
 * Unlink every symbolic link and junction under `dir`, never following one, except the paths in
 * `keep`. Returns what was removed, relative to `dir` with forward slashes.
 */
export async function unlinkLinks(dir: string, keep: ReadonlySet<string> = new Set()): Promise<string[]> {
  const removed: string[] = [];
  const walk = async (abs: string): Promise<void> => {
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      const path = join(abs, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) {
        const rel = relative(dir, path).split(sep).join("/");
        if (keep.has(rel)) continue;
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

/** Whether any existing folder between `root` and `rel` (not `rel` itself) is a link. */
export async function crossesLink(root: string, rel: string): Promise<boolean> {
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

/** A path in comparable form: canonical, forward slashes, case folded where the file system ignores case. */
const comparable = (p: string) => {
  const c = canonicalPath(p).replace(/\\/g, "/");
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
  const want = comparable(path);
  const found: string[] = [];
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const gitdir = (await readFile(join(dir, name, "gitdir"), "utf8").catch(() => "")).trim();
    if (gitdir && comparable(dirname(gitdir)) === want) found.push(join(dir, name));
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
  // Look the record up while the worktree exists, so both paths compare in canonical form.
  const records = await worktreeRecords(repoRoot, path).catch(() => [] as string[]);
  await unlinkLinks(path).catch(() => undefined);
  await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  for (const record of records) await rm(record, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
