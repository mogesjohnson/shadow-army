import { rm } from "node:fs/promises";
import { join } from "node:path";
import { identityFlags } from "../workspace/audit.js";
import { git, GitError, gitOk, splitZ } from "../workspace/git.js";

/** The branch a run merges its soldiers' work into. The user's own branch is never touched. */
export interface Integration {
  branch: string;
  path: string;
  /** The commit the run started from. */
  base: string;
}

export async function createIntegration(repoRoot: string, shadowRoot: string, runId: string): Promise<Integration> {
  let base: string;
  try {
    base = (await git(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
  } catch {
    throw new GitError("the repository has no commits yet; make one before `sa run`");
  }
  const branch = `shadow/run/${runId}`;
  const path = join(shadowRoot, "worktrees", `run-${runId}`);
  await git(repoRoot, ["worktree", "add", "-q", "-b", branch, path, base]);
  return { branch, path, base };
}

export type MergeResult = { ok: true; commit: string } | { ok: false; reason: string };

/**
 * Merge a soldier's branch into the integration branch with a merge commit. On a conflict the merge
 * is aborted, so the integration branch is exactly as it was before.
 */
export async function mergeInto(integration: Integration, branch: string, message: string): Promise<MergeResult> {
  const flags = await identityFlags(integration.path);
  try {
    // --no-verify: the run's own branch; the repo's hooks apply when the user merges the run.
    await git(integration.path, [...flags, "merge", "--no-ff", "--no-verify", "-m", message, branch]);
  } catch (e) {
    // Read the conflicted files before aborting: the abort clears them.
    const conflicted = splitZ(await git(integration.path, ["diff", "--name-only", "-z", "--diff-filter=U"]).catch(() => ""));
    await gitOk(integration.path, ["merge", "--abort"]);
    return {
      ok: false,
      reason: conflicted.length ? `merge conflict in ${conflicted.join(", ")}` : (e as Error).message,
    };
  }
  return { ok: true, commit: (await git(integration.path, ["rev-parse", "--short", "HEAD"])).trim() };
}

/** Files the run has changed so far, relative to where it started. */
export async function integrationFiles(integration: Integration): Promise<string[]> {
  return splitZ(await git(integration.path, ["diff", "--name-only", "-z", integration.base, "HEAD"]));
}

export async function integrationCommits(integration: Integration): Promise<number> {
  return Number((await git(integration.path, ["rev-list", "--count", `${integration.base}..HEAD`])).trim());
}

/**
 * A read-only copy of `ref` in its own detached worktree, for soldiers that read but do not write
 * (and for the Monarch's final look). Remove it when done.
 */
export async function createSnapshot(
  repoRoot: string,
  shadowRoot: string,
  ref: string,
  name: string,
): Promise<{ path: string; remove: () => Promise<void> }> {
  const path = join(shadowRoot, "worktrees", name);
  await git(repoRoot, ["worktree", "add", "-q", "--detach", path, ref]);
  return {
    path,
    async remove() {
      await gitOk(repoRoot, ["worktree", "remove", "--force", path]);
      await rm(path, { recursive: true, force: true });
    },
  };
}

/** Remove the integration worktree. The branch stays, unless the run produced nothing. */
export async function closeIntegration(repoRoot: string, integration: Integration, deleteBranch: boolean): Promise<void> {
  await gitOk(repoRoot, ["worktree", "remove", "--force", integration.path]);
  await rm(integration.path, { recursive: true, force: true });
  if (deleteBranch) await gitOk(repoRoot, ["branch", "-D", integration.branch]);
}
