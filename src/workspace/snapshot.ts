import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { identityFlags } from "./audit.js";
import { git, GitError, joinZ, splitZ } from "./git.js";

/** Shadow Army's own working memory, which is never part of the folder's content. */
const OUTSIDE = [".", ":(exclude).shadow"];

/**
 * Run `fn` with the environment for a private, throwaway index file, so the owner's real index (and
 * the intent-to-add entries in it) is never read for content or written to. The file goes when `fn` ends.
 */
export async function withTempIndex<T>(fn: (env: Record<string, string>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "sa-index-"));
  try {
    return await fn({ GIT_INDEX_FILE: join(dir, "index") });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * A commit holding the folder exactly as it is now: HEAD plus the uncommitted edits, the deleted files
 * and the new files that are not ignored. A run starts from this, so it builds on earlier work that is
 * not committed yet, the way a person editing the folder would.
 *
 * A clean folder is its own HEAD, so that sha is returned. Otherwise the commit is made in a private
 * index (`git add` there applies the usual ignore rules and line-ending filters), so the folder, the
 * real index and HEAD are not touched. The commit is not on any branch; the branches that start from it
 * keep it alive.
 */
export async function snapshotFolder(root: string): Promise<string> {
  let head: string;
  try {
    head = (await git(root, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
  } catch {
    throw new GitError("the repository has no commits yet; make one first");
  }
  // --no-optional-locks: only looking, so do not even refresh the index file.
  const status = await git(root, ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...OUTSIDE]);
  if (!status) return head;

  return withTempIndex(async (env) => {
    await git(root, ["read-tree", head], { env });
    await git(root, ["add", "-A", "--", ...OUTSIDE], { env });
    const tree = (await git(root, ["write-tree"], { env })).trim();
    // Dirty in git's eyes but identical in content (a staged removal of a file that is still there).
    if (tree === (await git(root, ["rev-parse", `${head}^{tree}`])).trim()) return head;
    const flags = await identityFlags(root);
    return (await git(root, [...flags, "-c", "commit.gpgsign=false", "commit-tree", tree, "-p", head, "-m", "shadow: snapshot of the working folder"])).trim();
  });
}

/**
 * Which of `paths` have different content in the folder than at `ref`. A path that exists on one side
 * only counts as different. Content is compared as git would commit it (line-ending filters applied, and
 * mode and symlinks included), in a private index, so the real one is not touched.
 */
export async function changedSince(root: string, ref: string, paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  return withTempIndex(async (env) => {
    await git(root, ["read-tree", ref], { env });
    // Bring the folder's version of each path into the private index: added, updated or, when the file
    // is gone, removed. Then whatever differs from `ref` is a change.
    await git(root, ["update-index", "--add", "--remove", "-z", "--stdin"], { env, input: joinZ(paths) });
    return splitZ(await git(root, ["diff", "--cached", "--name-only", "-z", "--no-renames", ref], { env })).sort();
  });
}
