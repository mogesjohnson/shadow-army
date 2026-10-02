import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { execa } from "execa";

export class GitError extends Error {}

export interface GitOptions {
  /** Extra environment variables for this call, for example `GIT_INDEX_FILE` to work on a private index. */
  env?: Record<string, string>;
  /** Text to send on git's standard input (for `--stdin` flags). Without it, git gets no input. */
  input?: string;
}

/** Run git in `cwd`; returns stdout, throws GitError with git's own message on failure. */
export async function git(cwd: string, args: string[], opts: GitOptions = {}): Promise<string> {
  let r;
  try {
    r = await execa("git", args, {
      cwd,
      reject: false,
      windowsHide: true,
      ...(opts.input === undefined ? { stdin: "ignore" as const } : { input: opts.input }),
      ...(opts.env ? { env: opts.env } : {}),
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

/** Paths as input for a `-z --stdin` flag: each one ends with a NUL. */
export const joinZ = (paths: string[]): string => paths.map((p) => `${p}\0`).join("");

/**
 * The index entries (mode, object id and stage) of `paths`, as path -> a short string that is equal
 * exactly when the entry is. A path with no entry is left out. An intent-to-add entry shows as the empty file.
 */
export async function indexEntries(cwd: string, paths: string[]): Promise<Record<string, string>> {
  const want = new Set(paths);
  const entries: Record<string, string> = {};
  for (const line of splitZ(await git(cwd, ["ls-files", "--stage", "-z"]))) {
    const tab = line.indexOf("\t");
    const path = line.slice(tab + 1);
    if (want.has(path)) entries[path] = `${entries[path] ?? ""}${line.slice(0, tab)};`;
  }
  return entries;
}

/**
 * What `git status` says about every changed path, as path -> its two-letter code (index column, then
 * work-tree column): ` M` edited, `??` untracked, ` A` intent-to-add, `A ` staged, and so on. A rename
 * is listed under its new path. Read-only: it never writes the index.
 */
export async function statusCodes(cwd: string): Promise<Map<string, string>> {
  const parts = splitZ(await git(cwd, ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  const codes = new Map<string, string>();
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]!;
    codes.set(entry.slice(3), entry.slice(0, 2));
    if (entry[0] === "R" || entry[0] === "C") i++; // a rename is followed by its old path
  }
  return codes;
}

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
