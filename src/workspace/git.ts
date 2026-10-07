import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { execa } from "execa";

export class GitError extends Error {}

/** Run git in `cwd`; preserve a blob's final newline when requested. Throws GitError on failure. */
export async function git(cwd: string, args: string[], opts: { stripFinalNewline?: boolean } = {}): Promise<string> {
  let r;
  try {
    r = await execa("git", args, {
      cwd,
      reject: false,
      stdin: "ignore",
      windowsHide: true,
      stripFinalNewline: opts.stripFinalNewline ?? true,
    });
  } catch (e) {
    throw new GitError(`could not run git: ${(e as Error).message}`);
  }
  if (r.exitCode !== 0) {
    throw new GitError(`git ${args.join(" ")} failed: ${String(r.stderr || r.stdout).trim()}`);
  }
  return String(r.stdout);
}

/** Like git(), but returns whether it exited 0 instead of throwing. */
export async function gitOk(cwd: string, args: string[]): Promise<boolean> {
  try {
    const r = await execa("git", args, { cwd, reject: false, stdin: "ignore", windowsHide: true });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

/** NUL-separated git output (the -z flag) to a list; avoids git's quoting of unusual file names. */
export const splitZ = (out: string): string[] => out.split("\0").filter(Boolean);

/**
 * The real, absolute form of a path: symlinks resolved (on macOS the temp folder /var is really
 * /private/var) and Windows 8.3 short names expanded (RUNNER~1 is runneradmin). Git reports real paths,
 * so anything compared with git's paths must go through this first. A path that does not exist yet
 * is just made absolute.
 */
export function canonicalPath(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return resolve(p);
  }
}

/** The top of the repository containing `cwd`, in canonical form. */
export async function repoRoot(cwd: string): Promise<string> {
  let top: string;
  try {
    top = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    throw new GitError(`${cwd} is not inside a git repository`);
  }
  return canonicalPath(top);
}
