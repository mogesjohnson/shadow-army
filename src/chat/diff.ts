import { git, repoRoot } from "../workspace/git.js";

/** How many lines of /diff the chat shows before pointing at `git diff`. */
export const DIFF_LINES = 400;

/**
 * The uncommitted changes of the repository containing `cwd`: `git status --short`, then `git diff`
 * (which shows new files the run applied, as they are marked intent-to-add). Runs git itself; no
 * soldier is involved. Throws GitError when `cwd` is not in a repository.
 */
export async function folderChanges(cwd: string, maxLines = DIFF_LINES): Promise<string> {
  const root = await repoRoot(cwd);
  // color.ui=false keeps a user's "always" setting from putting escape codes in the transcript.
  const status = (await git(root, ["-c", "color.ui=false", "status", "--short"])).trimEnd();
  if (!status) return "No uncommitted changes.";
  // A carriage return from a CRLF file would move the cursor in the middle of the screen.
  const diff = (await git(root, ["diff", "--no-color", "--no-ext-diff"])).replace(/\r/g, "").trimEnd();
  const lines = [...status.split("\n"), ...(diff ? ["", ...diff.split("\n")] : [])];
  if (lines.length <= maxLines) return lines.join("\n");
  return [...lines.slice(0, maxLines), `… ${lines.length - maxLines} more lines; run git diff to see them all`].join("\n");
}
