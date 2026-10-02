import { rm } from "node:fs/promises";
import { join } from "node:path";
import { assertSafe } from "../vault/vault.js";
import { CASE_INSENSITIVE_FS } from "./claims.js";
import { canonicalPath, git, GitError } from "./git.js";

export interface Worktree {
  /** `<soldier>-<taskId>`, the directory name under `<shadowRoot>/worktrees`. */
  name: string;
  /** `shadow/<soldier>/<taskId>`. The branch is left for merge-back. */
  branch: string;
  path: string;
  /** The commit the worktree was created from. Audits diff against this. */
  base: string;
}

const worktreesDir = (shadowRoot: string) => join(shadowRoot, "worktrees");

/** Create a worktree for one soldier's task on a new branch, from `baseRef` (default: the current commit). */
export async function createWorktree(opts: {
  repoRoot: string;
  shadowRoot: string;
  soldier: string;
  taskId: string;
  baseRef?: string;
}): Promise<Worktree> {
  assertSafe("soldier name", opts.soldier);
  assertSafe("task id", opts.taskId);

  let base: string;
  try {
    base = (await git(opts.repoRoot, ["rev-parse", "--verify", `${opts.baseRef ?? "HEAD"}^{commit}`])).trim();
  } catch {
    throw new GitError("the repository has no commits yet; make one before running a soldier with --write");
  }

  const name = `${opts.soldier}-${opts.taskId}`;
  const branch = `shadow/${opts.soldier}/${opts.taskId}`;
  const path = join(worktreesDir(opts.shadowRoot), name);
  await git(opts.repoRoot, ["worktree", "add", "-q", "-b", branch, path, base]);
  return { name, branch, path, base };
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch?: string;
}

/** Comparable form of a path: canonical (git lists real paths), forward slashes, case folded where the file system ignores case. */
const normalize = (p: string) => {
  const c = canonicalPath(p).replace(/\\/g, "/");
  return CASE_INSENSITIVE_FS ? c.toLowerCase() : c;
};

/** Soldier worktrees only: those under `<shadowRoot>/worktrees`. */
export async function listWorktrees(repoRoot: string, shadowRoot: string): Promise<WorktreeInfo[]> {
  const out = await git(repoRoot, ["worktree", "list", "--porcelain"]);
  const dir = normalize(worktreesDir(shadowRoot)) + "/";
  const found: WorktreeInfo[] = [];
  for (const block of out.split(/\r?\n\r?\n/)) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (!path || !normalize(path).startsWith(dir)) continue;
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
    found.push({ name: path.replace(/\\/g, "/").split("/").pop()!, path, branch });
  }
  return found;
}

/**
 * Remove a soldier's worktree. The branch, which holds the soldier's committed work, is kept unless
 * `deleteBranch` is set.
 */
export async function removeWorktree(opts: {
  repoRoot: string;
  shadowRoot: string;
  name: string;
  deleteBranch?: boolean;
}): Promise<WorktreeInfo> {
  assertSafe("worktree name", opts.name);
  const target = (await listWorktrees(opts.repoRoot, opts.shadowRoot)).find((w) => w.name === opts.name);
  if (!target) throw new GitError(`no soldier worktree named "${opts.name}"`);
  await git(opts.repoRoot, ["worktree", "remove", "--force", target.path]);
  await rm(target.path, { recursive: true, force: true });
  if (opts.deleteBranch && target.branch) await git(opts.repoRoot, ["branch", "-D", target.branch]);
  return target;
}
