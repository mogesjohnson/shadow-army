import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppliedFile, ApplyResult } from "../workspace/apply.js";
import { splitZ } from "../workspace/git.js";
import type { WriteOutcome } from "./channel.js";
import { HarnessGitHeld, HarnessGitTimeout } from "./git/harness.js";
import { HarnessGitHeldAfter } from "./git/hold.js";
import type { RunGit } from "./snapshot.js";

class GitFailed extends Error {}
const FULL_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * M1-AC28: after a turn that passed its claim audit and the checkout guard, put the soldier's audited change
 * into the owner's folder as uncommitted edits (new files intent-to-add, nothing committed, HEAD unmoved).
 * A turn that was cut short, failed, lost its lease or changed nothing is not applicable, so nothing is
 * applied and the soldier's branch keeps the work. A clash with the owner's own edits, or a checkout that
 * moved on, applies nothing and says why. Never throws for a git failure.
 *
 * WSP-10: every command is the office's hold-aware harness git (`run`, in the owner's folder), and what is applied
 * is the commit the audit checked, by its full id: the branch may have moved since, and is never read.
 */
export async function applyAudited(run: RunGit, write: WriteOutcome, since?: string): Promise<ApplyResult> {
  if (!write.applicable) return { applied: false, reason: write.reason ?? "the turn is not applicable", clashes: [] };
  // A later turn on the same session applies only what is new since the last audited commit that reached the folder.
  const from = since ?? write.base, to = write.commit;
  const git = async (args: string[]) => {
    const result = await run(args);
    if (result.code !== 0) throw new GitFailed(result.stderr.trim() || `git ${args[0]} exited ${result.code}`);
    return result.stdout;
  };
  const files: AppliedFile[] = [];
  const dir = await mkdtemp(join(tmpdir(), "sa-apply-"));
  try {
    for (const id of [from, to]) {
      const found = id && FULL_ID.test(id) ? (await run(["rev-parse", "-q", "--verify", `${id}^{commit}`])).stdout.trim() : "";
      if (!id || found !== id) return { applied: false, reason: `the audited commit ${id || "(none)"} is not a commit in the repository by that id; nothing is applied`, clashes: [] };
    }
    const nameStatus = splitZ(await git(["diff", "--name-status", "-z", "--no-renames", from, to!]));
    for (let i = 0; i + 1 < nameStatus.length; i += 2) files.push({ change: nameStatus[i]!, path: nameStatus[i + 1]! });
    if (!files.length) return { applied: true, files };
    // A file with local changes is left alone. Compared case-insensitively, as on Windows and macOS.
    const touched = new Set(files.map((file) => file.path.toLowerCase()));
    const status = splitZ(await git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
    const local: string[] = [];
    for (let i = 0; i < status.length; i++) {
      local.push(status[i]!.slice(3));
      if (/^[RC]/.test(status[i]!)) local.push(status[++i] ?? "");
    }
    const clashes = [...new Set(local.filter((path) => path && touched.has(path.toLowerCase())))].sort();
    if (clashes.length) return { applied: false, reason: "you have uncommitted changes to files the run also changed", clashes };
    const patch = join(dir, "changes.patch");
    await git(["diff", "--binary", "--no-renames", "--no-color", `--output=${patch}`, from, to!]);
    const check = await run(["apply", "--check", "--whitespace=nowarn", patch]);
    if (check.code !== 0) {
      const why = [...check.stderr.matchAll(/error:\s*([^\n]+)/g)].at(-1)?.[1]?.trim();
      return { applied: false, reason: `the changes no longer apply to your checkout, which has moved on since the run started${why ? ` (${why})` : ""}`, clashes: [] };
    }
    // New paths are then marked intent-to-add, by literal pathspec; if that fails, the edits come back out.
    // A failure, a hold seen after git apply ran, or its time limit can leave edits in the folder: the outcome says what is there.
    const partial = (error: unknown) => ({ applied: false as const, reason: `${(error as Error).message}; part of the run's changes may be in your folder: ${files.map((file) => file.path).join(", ")}`, clashes: [] });
    try { await git(["apply", "--whitespace=nowarn", patch]); }
    catch (error) {
      const where = await landed(run, patch, error, false);
      if (where === "none") throw error;
      if (where === "some") return partial(error);
    }
    const added = files.filter((file) => file.change === "A").map((file) => `:(literal)${file.path}`);
    if (added.length) {
      try { await git(["add", "-N", "-f", "--", ...added]); }
      catch (error) {
        // Not applied only if the edits came back out; a held harness git can't take them out, so they are reported as applied.
        let where: "all" | "none" | "some" = "none";
        try { await git(["apply", "-R", "--whitespace=nowarn", patch]); }
        catch (undo) {
          if (!(undo instanceof GitFailed || undo instanceof HarnessGitHeld || undo instanceof HarnessGitTimeout)) throw undo;
          where = await landed(run, patch, undo, true);
        }
        if (where === "none") throw error;
        if (where === "some") return partial(error);
      }
    }
  } catch (error) {
    if (!(error instanceof GitFailed || error instanceof HarnessGitHeld || error instanceof HarnessGitTimeout)) throw error;
    return { applied: false, reason: error.message, clashes: [] };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return { applied: true, files };
}

/**
 * How much of the patch is in the folder after a git apply (`reverse`: apply -R) that ended in `error`: all, none, or some
 * (or it can't be told). Only a command that never ran, or one that ran and succeeded, is known without asking git:
 * a failed write or a stopped process can leave part of it.
 */
async function landed(run: RunGit, patch: string, error: unknown, reverse: boolean): Promise<"all" | "none" | "some"> {
  const ran = error instanceof HarnessGitHeldAfter, succeeded = ran && error.result.code === 0;
  if (succeeded) return reverse ? "none" : "all";
  if (!ran && error instanceof HarnessGitHeld) return reverse ? "all" : "none"; // the check before it held: it never ran
  if (!(ran || error instanceof GitFailed || error instanceof HarnessGitTimeout)) return reverse ? "all" : "none";
  const fits = async (args: string[]) => (await run(["apply", ...args, "--check", "--whitespace=nowarn", patch]).catch(() => undefined))?.code === 0;
  if (await fits(["-R"])) return "all";
  return await fits([]) ? "none" : "some";
}
