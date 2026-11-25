import { randomBytes } from "node:crypto";
import { access, lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { GitResult, HarnessKind } from "../v2/git/harness.js";
import { assertSafe } from "../vault/vault.js";
import { auditWorktree, classify, commitAll, revertPaths } from "./audit.js";
import { validateClaims } from "./claims.js";
import { canonicalPath, git, GitError, repoRoot, splitZ } from "./git.js";
import { crossesLink, removeIfLink, removeWorktreeSafely, unlinkLinks, unlinkSoldierLinks } from "./links.js";
import { DEFAULT_TTL_MS, LockError, Locks } from "./locks.js";
import { createWorktree } from "./worktree.js";

/** One harness git call (WSP-10): reads use the audit's "guard" timeout policy, changes "other", the checkout "snapshot". */
export type SessionRun = (args: string[], kind: HarnessKind) => Promise<GitResult>;
/**
 * Harness git a caller (the post office) supplies, so a write session runs no legacy git. `repo` is git for the
 * repository; `worktree` binds git to the soldier's worktree identity, read when the worktree is made, before
 * any soldier runs in it. The caller checks its hold around `openWriteSession` and `finish`.
 */
export interface SessionGit { repo: SessionRun; worktree(path: string): SessionRun }

const must = (run: SessionRun) => async (args: string[], kind: HarnessKind = "guard") => {
  const result = await run(args, kind);
  if (result.code !== 0) throw new GitError(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim() || `exit ${result.code}`}`);
  return result.stdout;
};
const exitsZero = (run: SessionRun) => async (args: string[]) => (await run(args, "guard")).code === 0;

/** `finish`'s steps (links, audit, revert, commit) as audit.ts and links.ts take them, through harness git. */
async function finishByHarness(run: SessionRun, path: string, base: string, claims: string[], message: string) {
  const g = must(run), ok = exitsZero(run);
  // Links first, unfollowed; links the base tracks stay while git still sees them as those links (unlinkSoldierLinks).
  const keep = new Map<string, string>();
  if ((await g(["config", "--type=bool", "--default=true", "core.symlinks"])).trim() !== "false") {
    for (const entry of splitZ(await g(["ls-tree", "-r", "-z", "--full-tree", base]))) {
      if (entry.startsWith("120000 ")) keep.set(entry.slice(entry.indexOf("\t") + 1), await g(["cat-file", "blob", entry.split(" ")[2]!.split("\t")[0]!]));
    }
  }
  const linksRemoved = await unlinkLinks(path, keep);
  if (keep.size) {
    const changed = new Set(splitZ(await g(["diff", "--name-only", "-z", "--no-renames", base])));
    for (const rel of keep.keys()) if (changed.has(rel) && (await removeIfLink(join(path, rel)))) linksRemoved.push(rel);
  }
  linksRemoved.sort();
  const touched = [...new Set([...splitZ(await g(["diff", "--name-only", "-z", "--no-renames", base])), ...splitZ(await g(["ls-files", "--others", "--exclude-standard", "-z"]))])].sort();
  const { inScope, outOfScope } = classify(touched, claims);
  // revertPaths: never through a link, never outside the worktree.
  const root = resolve(path);
  for (const p of outOfScope) {
    if (await crossesLink(root, p)) throw new GitError(`refusing to revert ${p}: a folder on its path is a link that could lead outside the worktree`);
    const abs = resolve(path, p);
    if (abs.startsWith(root + sep)) await removeIfLink(abs);
    if (await ok(["cat-file", "-e", `${base}:${p}`])) await g(["checkout", base, "--", p], "other");
    else {
      await g(["rm", "-f", "-q", "--cached", "--ignore-unmatch", "--", p], "other");
      if (abs.startsWith(root + sep)) await rm(abs, { force: true });
    }
  }
  // commitAll, with identityFlags' fallback identity.
  await g(["add", "-A"], "other");
  if (!(await ok(["diff", "--cached", "--quiet"]))) {
    const flags: string[] = [];
    for (const [key, fallback] of [["user.name", "Shadow Army"], ["user.email", "shadow-army@users.noreply.github.com"]] as const) {
      if (!(await ok(["config", key]))) flags.push("-c", `${key}=${fallback}`);
    }
    await g([...flags, "commit", "-q", "--no-verify", "-m", message], "other");
  }
  const head = (await g(["rev-parse", "HEAD"])).trim();
  const commit = head === base ? undefined : (await g(["rev-parse", "--short", "HEAD"])).trim();
  return { linksRemoved, touched, inScope, outOfScope, commit };
}

/** Anything that stops a write run before the soldier starts: a bad claim, no git repo, a lease conflict. */
export class WorkspaceError extends Error {}

export interface WorkspaceInfo {
  branch: string;
  path: string;
  base: string;
  claims: string[];
  /** Everything the soldier changed, from git. */
  touched: string[];
  /** The part of `touched` that is inside the claims and kept. */
  inScope: string[];
  /** The part outside the claims; reverted. */
  outOfScope: string[];
  reverted: boolean;
  /** Short sha of the branch tip if the branch holds any change, else undefined. */
  commit?: string;
  /** The heartbeat failed to renew the lease, so the files may have changed hands mid-run. */
  leaseLost: boolean;
  /** The checkout had uncommitted changes, which the soldier's worktree (made from the last commit) does not contain. */
  uncommittedIgnored: boolean;
  /** Links (or Windows junctions) the soldier left in its worktree, removed unfollowed before the audit. */
  linksRemoved?: string[];
}

export interface WriteSession {
  /** Where the soldier runs: its worktree, mirroring the subdirectory it was summoned from. */
  cwd: string;
  claims: string[];
  branch: string;
  /**
   * Audit the worktree, revert edits outside the claims, and commit what is left, so the branch tip
   * never holds an out-of-scope edit (even after a failed run; the report's status says whether to use it).
   */
  finish(message: string): Promise<WorkspaceInfo>;
  /** Remove the worktree and branch. For a run that never started, so nothing is left behind. */
  discard(): Promise<void>;
  /** Free the lease. Safe to call twice; always call it, for example in a finally block. */
  release(): Promise<void>;
}

const newTaskId = () =>
  `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${randomBytes(2).toString("hex")}`;

/**
 * `.shadow/` is working memory, never source: give it a .gitignore so it cannot be committed, and so
 * worktrees made inside it never show up as the user's uncommitted changes.
 */
export async function ensureShadowRoot(shadowRoot: string): Promise<void> {
  await mkdir(shadowRoot, { recursive: true });
  const ignore = join(shadowRoot, ".gitignore");
  try {
    await access(ignore);
  } catch {
    await writeFile(ignore, "*\n", "utf8");
  }
}

/**
 * Prepare a safe write run: validate the claims, take a lease on them, and create the soldier's
 * worktree and branch. Nothing is left behind if any step fails.
 */
export async function openWriteSession(opts: {
  cwd: string;
  soldier: string;
  claims: string[];
  waitMs?: number;
  ttlMs?: number;
  /** Commit or branch the worktree starts from. Default: the current commit. `sa run` uses its integration branch. */
  baseRef?: string;
  /** Override for tests. Defaults to `<repo>/.shadow`. */
  shadowRoot?: string;
  /** WSP-10: harness git for every git call here; without it, v1's git. */
  git?: SessionGit;
}): Promise<WriteSession> {
  let claims: string[];
  try {
    claims = validateClaims(opts.claims);
  } catch (e) {
    throw new WorkspaceError((e as Error).message);
  }

  const harness = opts.git;
  let root: string;
  try {
    root = harness ? canonicalPath((await must(harness.repo)(["rev-parse", "--show-toplevel"])).trim()) : await repoRoot(opts.cwd);
  } catch (e) {
    throw new WorkspaceError(`--write needs a git repository, because each soldier works in its own worktree: ${(e as Error).message}`);
  }

  const shadowRoot = opts.shadowRoot ?? join(root, ".shadow");
  await ensureShadowRoot(shadowRoot);
  const locks = new Locks(shadowRoot);
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;

  let lease;
  try {
    lease = await locks.acquire({ owner: opts.soldier, claims, ttlMs: ttl, waitMs: opts.waitMs });
  } catch (e) {
    if (e instanceof LockError) throw new WorkspaceError(e.message);
    throw e;
  }

  let wt;
  let wtGit: SessionRun | undefined;
  let uncommittedIgnored = false;
  try {
    // .shadow/ ignores itself, so anything listed here is the user's own uncommitted work.
    if (harness) {
      const g = must(harness.repo);
      uncommittedIgnored = (await g(["status", "--porcelain"])).trim().length > 0;
      // createWorktree, through harness git.
      const taskId = newTaskId();
      assertSafe("soldier name", opts.soldier);
      assertSafe("task id", taskId);
      let base: string;
      try {
        base = (await g(["rev-parse", "--verify", `${opts.baseRef ?? "HEAD"}^{commit}`])).trim();
      } catch {
        throw new GitError("the repository has no commits yet; make one before running a soldier with --write");
      }
      const name = `${opts.soldier}-${taskId}`;
      wt = { name, branch: `shadow/${opts.soldier}/${taskId}`, path: join(shadowRoot, "worktrees", name), base };
      await g(["worktree", "add", "-q", "-b", wt.branch, wt.path, base], "snapshot");
      wtGit = harness.worktree(wt.path);
    } else {
      uncommittedIgnored = (await git(root, ["status", "--porcelain"])).trim().length > 0;
      wt = await createWorktree({
        repoRoot: root,
        shadowRoot,
        soldier: opts.soldier,
        taskId: newTaskId(),
        baseRef: opts.baseRef,
      });
    }
  } catch (e) {
    await locks.release(lease.id);
    if (e instanceof GitError) throw new WorkspaceError(e.message);
    throw e;
  }

  // Heartbeat: keep the lease alive while the soldier works. If this process dies, it stops and the
  // lease expires on its own. The in-flight renewal is tracked so release() can wait for it.
  let lost = false;
  let released = false;
  let inflight: Promise<void> = Promise.resolve();
  const timer = setInterval(
    () => {
      inflight = locks.renew(lease.id, ttl).then(
        (ok) => {
          if (!ok) lost = true;
        },
        () => {
          lost = true;
        },
      );
    },
    Math.max(1_000, Math.floor(ttl / 3)),
  );
  timer.unref();

  return {
    // Both sides canonical, or a symlinked or short-named path gives a nonsense relative path.
    cwd: join(wt.path, relative(root, canonicalPath(opts.cwd))),
    claims,
    branch: wt.branch,
    async finish(message) {
      clearInterval(timer);
      await inflight;
      // A worktree folder replaced by a link would aim the audit, the revert and the commit below at
      // whatever the link names, such as a folder in the owner's checkout, where git finds their repo.
      if ((await lstat(wt.path)).isSymbolicLink()) {
        throw new GitError(`refusing to finish ${wt.branch}: its worktree folder was replaced by a link`);
      }
      if (wtGit) {
        const done = await finishByHarness(wtGit, wt.path, wt.base, claims, message);
        return { branch: wt.branch, path: wt.path, base: wt.base, claims, touched: done.touched, inScope: done.inScope, outOfScope: done.outOfScope,
          reverted: done.outOfScope.length > 0, commit: done.commit, leaseLost: lost, uncommittedIgnored, linksRemoved: done.linksRemoved };
      }
      // A link the soldier left could point outside the worktree, and git and the revert below would
      // follow it, so links go first, unfollowed. Links the base itself tracks stay while git still
      // sees them as those links.
      const linksRemoved = await unlinkSoldierLinks(wt.path, wt.base);
      const audit = await auditWorktree(wt.path, wt.base, claims);
      if (audit.outOfScope.length) await revertPaths(wt.path, wt.base, audit.outOfScope);
      const sha = await commitAll(wt.path, message, wt.base);
      return {
        branch: wt.branch,
        path: wt.path,
        base: wt.base,
        claims,
        touched: audit.touched,
        inScope: audit.inScope,
        outOfScope: audit.outOfScope,
        reverted: audit.outOfScope.length > 0,
        commit: sha,
        leaseLost: lost,
        uncommittedIgnored,
        linksRemoved,
      };
    },
    async discard() {
      await removeWorktreeSafely(root, wt.path);
      if (harness) await harness.repo(["branch", "-D", wt.branch], "other").catch(() => undefined);
      else await git(root, ["branch", "-D", wt.branch]).catch(() => undefined);
    },
    async release() {
      if (released) return;
      released = true;
      clearInterval(timer);
      await inflight;
      await locks.release(lease.id);
    },
  };
}
