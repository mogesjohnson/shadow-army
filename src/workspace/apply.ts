import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, GitError, joinZ, splitZ, statusCodes } from "./git.js";
import { changedSince } from "./snapshot.js";

export interface AppliedFile {
  /** As git's --name-status says it: A added, M modified, D deleted, T type changed. */
  change: string;
  path: string;
}

export type ApplyResult =
  | { applied: true; files: AppliedFile[] }
  | { applied: false; reason: string; clashes: string[] };

/** The files that differ between two commits, with how each changed. Renames show as a delete and an add. */
export async function changedFiles(root: string, from: string, to: string): Promise<AppliedFile[]> {
  const parts = splitZ(await git(root, ["diff", "--name-status", "-z", "--no-renames", from, to]));
  const files: AppliedFile[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) files.push({ change: parts[i]!, path: parts[i + 1]! });
  return files;
}

/**
 * Put the changes from `base` to `branch` into the checkout at `root` as uncommitted, unstaged edits, so
 * they can be reviewed with `git diff` and committed by hand. New files are marked intent-to-add so
 * `git status` and `git diff` show them too. Nothing is committed and HEAD does not move.
 *
 * `base` is what the run started from: HEAD, or the snapshot of the folder with its uncommitted work.
 * Changes nothing, and says why, when a file the branch changed has changed in the folder since then
 * (a clash), when the changes no longer apply to the checkout (it moved on), or when git fails. Never
 * throws for a git failure, since a run's work is done by then; the branch is never touched either way.
 */
export async function applyToCheckout(root: string, base: string, branch: string): Promise<ApplyResult> {
  const files: AppliedFile[] = [];
  const dir = await mkdtemp(join(tmpdir(), "sa-apply-"));
  try {
    files.push(...(await changedFiles(root, base, branch)));
    if (!files.length) return { applied: true, files };

    // A file the owner changed while the run worked is left alone: mixing the run's edits into theirs
    // would make both hard to review and impossible to undo cleanly. Only changes since the run started
    // count; the uncommitted work it started from is part of its base.
    const clashes = await changedSince(root, base, files.map((f) => f.path));
    if (clashes.length) {
      return { applied: false, reason: "your folder changed, since the run started, in files the run also changed", clashes };
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
    // An earlier applied run may have left index entries that this one makes wrong. A file it added
    // (intent-to-add) and this run deletes would stay in `git status` as a ghost, so drop that entry.
    // A tracked file an earlier run deleted and this one adds back would have its entry replaced by an
    // intent-to-add one, so put the entry back afterwards.
    const codes = await statusCodes(root);
    const ghosts = files.filter((f) => f.change === "D" && codes.get(f.path) === " A").map((f) => f.path);
    const readded = files.filter((f) => f.change === "A" && codes.get(f.path) === " D").map((f) => f.path);
    if (ghosts.length) await git(root, ["update-index", "--force-remove", "-z", "--stdin"], { input: joinZ(ghosts) });

    // git apply is all or nothing: if it fails, no file has changed.
    // Add new paths to the index as intent-to-add within the same operation. This includes ignored
    // additions and acquires the index lock before editing files, so an index failure changes nothing.
    await git(root, ["apply", "--intent-to-add", "--whitespace=nowarn", patch]);
    // The work is in the folder by now, so putting the entries back is best effort and never fails the apply.
    if (readded.length) {
      await git(root, ["--literal-pathspecs", "reset", "-q", "--pathspec-from-file=-", "--pathspec-file-nul", "HEAD"], { input: joinZ(readded) }).catch(() => undefined);
    }
  } catch (e) {
    if (!(e instanceof GitError)) throw e;
    return { applied: false, reason: e.message, clashes: [] };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return { applied: true, files };
}

export type Shell = "powershell" | "posix";
/** A path as a shell argument: bare when it is plainly safe, quoted otherwise. */
export const shellArg = (p: string, shell: Shell) =>
  /^[\w./+-]+$/.test(p) ? p : `'${p.replace(/'/g, shell === "powershell" ? "''" : "'\"'\"'")}'`;

/**
 * What to say after applying: the files, and how to review, keep or undo them. After declining to: why,
 * and which files clashed; the work is still on `branch`. `id` is what `sa undo` takes for this apply.
 */
export function renderApply(result: ApplyResult, branch: string, id: string, shell: Shell = process.platform === "win32" ? "powershell" : "posix"): string {
  if (!result.applied) {
    const lines = [`Not applied to your folder: ${result.reason}.`];
    if (result.clashes.length) lines.push(...result.clashes.map((p) => `  ${p}`));
    lines.push(`Your folder is unchanged; the work is on ${branch}.`);
    return lines.join("\n");
  }
  if (!result.files.length) return "Nothing to apply to your folder.";
  const paths = result.files.map((f) => shellArg(f.path, shell)).join(" ");
  // Git pathspec metacharacters are valid filename characters, so this command addresses literal paths.
  const keep = `git --literal-pathspecs add -- ${paths}`;
  return [
    "Applied to your folder (not committed):",
    ...result.files.map((f) => `  ${f.change.padEnd(2)} ${f.path}`),
    "  Review it:   git diff",
    `  Keep it:     ${keep}${shell === "powershell" ? "; if ($?) { git commit }" : " && git commit"}`,
    `  Undo it:     sa undo ${shellArg(id, shell)}`,
    `  Backup:      ${branch}`,
  ].join("\n");
}
