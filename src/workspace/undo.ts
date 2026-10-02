import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedFiles, type AppliedFile } from "./apply.js";
import { git, GitError, indexEntries, joinZ, splitZ, statusCodes } from "./git.js";
import { notUndone, readLedger, recordUndone, type AppliedEntry } from "./ledger.js";
import { changedSince } from "./snapshot.js";

export type UndoResult =
  | { undone: true; id: string; kind: AppliedEntry["kind"]; branch: string; files: AppliedFile[]; warning?: string }
  | { undone: false; reason: string; files: string[] };

const refuse = (reason: string, files: string[] = []): UndoResult => ({ undone: false, reason, files });

/**
 * Take back an applied run or summon: the most recent one not yet undone, or the one called `id` (its id,
 * or the name of its branch). Puts modified and deleted files back, removes added files and their
 * intent-to-add entries, and leaves every other file alone. The branch stays as a backup.
 *
 * It only reverses what the apply left. If a file it would touch has changed since (so the undo would
 * overwrite someone's later work), if one was staged, or if any was committed, it changes nothing and
 * says which. Never throws for a git failure.
 */
export async function undoApplied(root: string, shadowRoot: string, id?: string): Promise<UndoResult> {
  const entries = await readLedger(shadowRoot);
  let entry: AppliedEntry | undefined;
  if (id === undefined) {
    entry = notUndone(entries).at(-1);
    if (!entry) return refuse("no applied run or summon is left to undo");
  } else {
    entry = entries.filter((e): e is AppliedEntry => e.type === "applied" && (e.id === id || e.branch === id)).at(-1);
    if (!entry) return refuse(`no applied run or summon called ${id}`);
    if (!notUndone(entries).includes(entry)) return refuse(`${entry.id} was already undone`);
  }

  const dir = await mkdtemp(join(tmpdir(), "sa-undo-"));
  try {
    // What the apply put in the folder, read from the commits so it does not depend on the branch name.
    let files: AppliedFile[];
    try {
      files = await changedFiles(root, entry.base, entry.tip);
    } catch (e) {
      if (!(e instanceof GitError)) throw e;
      return refuse(`its commits are no longer in the repository (${e.message})`);
    }
    const paths = files.map((f) => f.path);

    // Every file must still be exactly as the apply left it, or undoing would throw later work away.
    const changed = await changedSince(root, entry.tip, paths);
    if (changed.length) return refuse("these files have changed since the run was applied", changed);

    // Nor may they have been committed, which is a job for git revert, or staged: the owner's index is
    // theirs, so a change to the entry the apply left (new files are intent-to-add) is not guessed at.
    const moved = new Set(splitZ(await git(root, ["diff", "--name-only", "-z", "--no-renames", entry.head, "HEAD"])));
    const committed = paths.filter((p) => moved.has(p));
    if (committed.length) return refuse("these files were committed since the run was applied, so use git revert for them", committed);
    const index = await indexEntries(root, paths);
    const staged = paths.filter((p) => (index[p] ?? "") !== (entry.index[p] ?? ""));
    if (staged.length) return refuse("you have staged changes to files the run changed; unstage them first", staged);

    const patch = join(dir, "undo.patch");
    await git(root, ["diff", "--binary", "--no-renames", "--no-color", "--no-ext-diff", `--output=${patch}`, entry.base, entry.tip]);
    try {
      await git(root, ["apply", "-R", "--check", "--whitespace=nowarn", patch]);
    } catch (e) {
      if (!(e instanceof GitError)) throw e;
      const why = [...e.message.matchAll(/error:\s*([^\n]+)/g)].at(-1)?.[1]?.trim();
      return refuse(`the changes no longer reverse cleanly${why ? ` (${why})` : ""}`);
    }

    // Removing a new file leaves its intent-to-add entry behind as a ghost in `git status`; drop it first,
    // so a locked index stops the undo before any file changes.
    const codes = await statusCodes(root);
    const ghosts = files.filter((f) => f.change === "A" && codes.get(f.path) === " A").map((f) => f.path);
    if (ghosts.length) await git(root, ["update-index", "--force-remove", "-z", "--stdin"], { input: joinZ(ghosts) });
    await git(root, ["apply", "-R", "--whitespace=nowarn", patch]);

    try {
      await recordUndone(shadowRoot, entry.id);
    } catch (e) {
      return { undone: true, id: entry.id, kind: entry.kind, branch: entry.branch, files, warning: `could not record the undo in the ledger: ${(e as Error).message}` };
    }
    return { undone: true, id: entry.id, kind: entry.kind, branch: entry.branch, files };
  } catch (e) {
    if (!(e instanceof GitError)) throw e;
    return refuse(e.message);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** What to say after an undo, or after refusing to. */
export function renderUndo(r: UndoResult): string {
  if (!r.undone) {
    return [`Not undone: ${r.reason}.`, ...r.files.map((p) => `  ${p}`), "Nothing was changed."].join("\n");
  }
  const verb: Record<string, string> = { A: "removed", D: "put back" };
  return [
    `Undone ${r.id}: your folder no longer has its changes.`,
    ...r.files.map((f) => `  ${(verb[f.change] ?? "restored").padEnd(8)} ${f.path}`),
    `The work is still on ${r.branch}.`,
    ...(r.warning ? [`Warning: ${r.warning}`] : []),
  ].join("\n");
}
