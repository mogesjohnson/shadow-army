import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { git, gitOk, splitZ } from "./git.js";
import { matchesClaims } from "./claims.js";

export interface AuditResult {
  /** Every file the soldier changed relative to the base commit, from git, not from its own account. */
  touched: string[];
  inScope: string[];
  outOfScope: string[];
}

/**
 * Files that differ from `base` in a worktree: committed or not, modified, deleted or new. Taken from
 * git so it does not depend on what the soldier says it did.
 */
export async function touchedFiles(worktree: string, base: string): Promise<string[]> {
  const changed = splitZ(await git(worktree, ["diff", "--name-only", "-z", "--no-renames", base]));
  const untracked = splitZ(await git(worktree, ["ls-files", "--others", "--exclude-standard", "-z"]));
  return [...new Set([...changed, ...untracked])].sort();
}

export function classify(touched: string[], claims: string[]): Pick<AuditResult, "inScope" | "outOfScope"> {
  const inScope: string[] = [];
  const outOfScope: string[] = [];
  for (const f of touched) (matchesClaims(f, claims) ? inScope : outOfScope).push(f);
  return { inScope, outOfScope };
}

export async function auditWorktree(worktree: string, base: string, claims: string[]): Promise<AuditResult> {
  const touched = await touchedFiles(worktree, base);
  return { touched, ...classify(touched, claims) };
}

/**
 * `-c user.name=... -c user.email=...` for whichever of the two the repository does not configure,
 * so a commit the tool makes cannot fail for want of an identity. The repository's own identity wins.
 */
export async function identityFlags(cwd: string): Promise<string[]> {
  const flags: string[] = [];
  for (const [key, fallback] of [
    ["user.name", "Shadow Army"],
    ["user.email", "shadow-army@users.noreply.github.com"],
  ] as const) {
    if (!(await gitOk(cwd, ["config", key]))) flags.push("-c", `${key}=${fallback}`);
  }
  return flags;
}

/** Undo edits outside the claims: restore files that existed at `base`, delete ones that did not. */
export async function revertPaths(worktree: string, base: string, paths: string[]): Promise<void> {
  const root = resolve(worktree);
  for (const p of paths) {
    if (await gitOk(worktree, ["cat-file", "-e", `${base}:${p}`])) {
      await git(worktree, ["checkout", base, "--", p]);
    } else {
      await git(worktree, ["rm", "-f", "-q", "--cached", "--ignore-unmatch", "--", p]);
      const abs = resolve(worktree, p);
      // paths come from git so are relative and inside the worktree; never delete anything outside it
      if (abs.startsWith(root + sep)) await rm(abs, { force: true });
    }
  }
}

/**
 * Commit whatever is left in the worktree (all of it in scope by now). Returns the short sha of the
 * branch tip if the branch now differs from `base` (including commits the soldier made itself), or
 * undefined if the soldier changed nothing.
 */
export async function commitAll(worktree: string, message: string, base: string): Promise<string | undefined> {
  await git(worktree, ["add", "-A"]);
  if (!(await gitOk(worktree, ["diff", "--cached", "--quiet"]))) {
    // --no-verify: these are intermediate commits the tool makes on the soldier's own branch. The
    // target repo's commit hooks apply when that branch is merged back, which is reviewed.
    await git(worktree, [...(await identityFlags(worktree)), "commit", "-q", "--no-verify", "-m", message]);
  }
  const head = (await git(worktree, ["rev-parse", "HEAD"])).trim();
  if (head === base) return undefined;
  return (await git(worktree, ["rev-parse", "--short", "HEAD"])).trim();
}
