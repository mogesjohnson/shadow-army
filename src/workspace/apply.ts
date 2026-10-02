import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, GitError, gitOk, splitZ } from "./git.js";

export interface AppliedFile {
  /** As git's --name-status says it: A added, M modified, D deleted, T type changed. */
  change: string;
  path: string;
}

export type ApplyResult =
  | { applied: true; files: AppliedFile[] }
  | { applied: false; reason: string; clashes: string[] };

/** Every path `git status --porcelain=v1 -z` mentions, both sides of a rename included. */
function changedPaths(out: string): string[] {
  const parts = splitZ(out);
  const paths: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]!;
    paths.push(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C") paths.push(parts[++i] ?? "");
  }
  return paths.filter(Boolean);
}

/**
 * Put the changes from `base` to `branch` into the checkout at `root` as uncommitted, unstaged edits, so
 * they can be reviewed with `git diff` and committed by hand. New files are marked intent-to-add so
 * `git status` and `git diff` show them too. Nothing is committed and HEAD does not move.
 *
 * Changes nothing, and says why, when a file the branch changed has local changes (a clash), when the
 * changes no longer apply to the checkout (it moved on), or when git fails. Never throws for a git
 * failure, since a run's work is done by then; the branch is never touched either way.
 */
export async function applyToCheckout(root: string, base: string, branch: string): Promise<ApplyResult> {
  const files: AppliedFile[] = [];
  const dir = await mkdtemp(join(tmpdir(), "sa-apply-"));
  try {
    const nameStatus = splitZ(await git(root, ["diff", "--name-status", "-z", "--no-renames", base, branch]));
    for (let i = 0; i + 1 < nameStatus.length; i += 2) files.push({ change: nameStatus[i]!, path: nameStatus[i + 1]! });
    if (!files.length) return { applied: true, files };

    // A file with local changes is left alone: mixing the run's edits into the owner's would make both
    // hard to review and impossible to undo cleanly. Compared case-insensitively, as on Windows and macOS.
    const touched = new Set(files.map((f) => f.path.toLowerCase()));
    const local = changedPaths(await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
    const clashes = [...new Set(local.filter((p) => touched.has(p.toLowerCase())))].sort();
    if (clashes.length) {
      return { applied: false, reason: "you have uncommitted changes to files the run also changed", clashes };
    }

    const patch = join(dir, "changes.patch");
    await git(root, ["diff", "--binary", "--no-renames", "--no-color", "--no-ext-diff", `--output=${patch}`, base, branch]);
    try {
      await git(root, ["apply", "--check", "--whitespace=nowarn", patch]);
    } catch (e) {
      if (!(e instanceof GitError)) throw e;
      // git's last error line names the file, e.g. "keep.txt: patch does not apply".
      const why = [...e.message.matchAll(/error:\s*([^\n]+)/g)].at(-1)?.[1]?.trim();
      return {
        applied: false,
        reason: `the changes no longer apply to your checkout, which has moved on since the run started${why ? ` (${why})` : ""}`,
        clashes: [],
      };
    }
    // git apply is all or nothing: if it fails, no file has changed.
    await git(root, ["apply", "--whitespace=nowarn", patch]);
  } catch (e) {
    if (!(e instanceof GitError)) throw e;
    return { applied: false, reason: e.message, clashes: [] };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  // The edits are in. Marking new files only lets `git diff` show them; not worth failing the apply over.
  const added = files.filter((f) => f.change === "A").map((f) => f.path);
  if (added.length) await gitOk(root, ["add", "--intent-to-add", "--", ...added]);
  return { applied: true, files };
}

/** A path as a shell argument: bare when it is plainly safe, quoted otherwise. */
const shellArg = (p: string) => (/^[\w./@+-]+$/.test(p) ? p : `"${p.replace(/(["\\$`])/g, "\\$1")}"`);

/**
 * What to say after applying: the files, and how to review, keep or undo them. After declining to: why,
 * and which files clashed; the work is still on `branch`.
 */
export function renderApply(result: ApplyResult, branch: string): string {
  if (!result.applied) {
    const lines = [`Not applied to your folder: ${result.reason}.`];
    if (result.clashes.length) lines.push(...result.clashes.map((p) => `  ${p}`));
    lines.push(`Your folder is unchanged; the work is on ${branch}.`);
    return lines.join("\n");
  }
  if (!result.files.length) return "Nothing to apply to your folder.";
  const paths = result.files.map((f) => shellArg(f.path)).join(" ");
  return [
    "Applied to your folder (not committed):",
    ...result.files.map((f) => `  ${f.change.padEnd(2)} ${f.path}`),
    "  Review it:   git diff",
    `  Keep it:     git add -- ${paths} && git commit`,
    `  Undo it:     git restore --source=HEAD --staged --worktree -- ${paths}`,
    `  Backup:      ${branch}`,
  ].join("\n");
}
