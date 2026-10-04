import { lstat, readdir, rm, rmdir, unlink } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { git, gitOk, splitZ } from "./git.js";

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

/**
 * Delete a Shadow Army worktree without following links: unlink every link inside it, delete it with
 * Node (whose rm never follows links either), then let git forget it. `git worktree remove --force`
 * follows a junction and empties its target, so it is not used.
 */
export async function removeWorktreeSafely(repoRoot: string, path: string): Promise<void> {
  await unlinkLinks(path).catch(() => undefined);
  await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  await gitOk(repoRoot, ["worktree", "prune"]);
}
