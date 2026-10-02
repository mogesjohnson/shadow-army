import { git, gitOk, splitZ } from "./git.js";

/**
 * What a soldier must not change: everything in the repository outside its own worktree. A snapshot of
 * that, taken before a task and compared after, is the checkout guard.
 */
export interface RepoState {
  head: string;
  branch: string;
  /** path -> git status code and a hash of its content, for every file `git status` lists. */
  dirty: Map<string, string>;
  /** path -> tracked mode, blob ids and merge stages; catches changes to staged content. */
  index: Map<string, string>;
  /** ref -> object id, for every ref except Shadow Army's own `shadow/*` branches. */
  refs: Map<string, string>;
}

export const MAX_HASHED = 500;

/** Shadow Army's own branches change during a run by design; nothing else may. */
const OURS = /^refs\/heads\/shadow\//;

export async function captureState(root: string): Promise<RepoState> {
  const head = (await git(root, ["rev-parse", "-q", "--verify", "HEAD"]).catch(() => "")).trim();
  const branch = (await git(root, ["symbolic-ref", "-q", "--short", "HEAD"]).catch(() => "")).trim();

  // Status lists which files differ; hashing each one also catches further edits to a file that was
  // already modified, which leaves its status line unchanged.
  const dirty = new Map<string, string>();
  const entries = splitZ(await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (code.startsWith("R") || code.startsWith("C")) i++; // a rename is followed by its old path
    // Past MAX_HASHED files (a repo with a big unignored folder), compare status lines only: one git
    // call per file would make every task slow.
    const hash = dirty.size < MAX_HASHED ? (await git(root, ["hash-object", "--", path]).catch(() => "gone")).trim() : "";
    dirty.set(path, `${code} ${hash}`);
  }

  const index = new Map<string, string>();
  for (const entry of splitZ(await git(root, ["ls-files", "--stage", "-z"]))) {
    const tab = entry.indexOf("\t");
    const path = entry.slice(tab + 1);
    const metadata = entry.slice(0, tab);
    index.set(path, `${index.get(path) ?? ""}${metadata}\n`);
  }

  const refs = new Map<string, string>();
  for (const line of (await git(root, ["for-each-ref", "--format=%(refname) %(objectname)"])).split("\n")) {
    const [name, oid] = line.trim().split(" ");
    if (name && oid && !OURS.test(name)) refs.set(name, oid);
  }
  return { head, branch, dirty, index, refs };
}

/** Plain-language differences between two states; empty when nothing outside Shadow Army's own branches changed. */
export function diffState(before: RepoState, after: RepoState): string[] {
  const changes: string[] = [];
  if (before.branch !== after.branch) {
    changes.push(`your checkout switched from ${before.branch || "a detached HEAD"} to ${after.branch || "a detached HEAD"}`);
  } else if (before.head !== after.head) {
    changes.push(`${before.branch || "HEAD"} moved from ${before.head.slice(0, 7) || "nothing"} to ${after.head.slice(0, 7)}`);
  }

  const files = new Set([...before.dirty.keys(), ...after.dirty.keys(), ...before.index.keys(), ...after.index.keys()]);
  const touched = [...files].filter((f) => before.dirty.get(f) !== after.dirty.get(f) || before.index.get(f) !== after.index.get(f)).sort();
  if (touched.length) changes.push(`files in your checkout changed: ${touched.join(", ")}`);

  for (const [name, oid] of after.refs) {
    const was = before.refs.get(name);
    if (was === undefined) changes.push(`${name} was created`);
    else if (was !== oid) changes.push(`${name} moved`);
  }
  for (const name of before.refs.keys()) {
    if (!after.refs.has(name)) changes.push(`${name} was deleted`);
  }
  return changes;
}

/** Whether `cwd` is in a git repository at all (the guard and snapshots need one). */
export const inRepo = (cwd: string) => gitOk(cwd, ["rev-parse", "--is-inside-work-tree"]);
