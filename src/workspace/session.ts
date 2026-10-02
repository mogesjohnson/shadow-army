import { randomBytes } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { auditWorktree, commitAll, revertPaths } from "./audit.js";
import { validateClaims } from "./claims.js";
import { canonicalPath, git, GitError, repoRoot } from "./git.js";
import { DEFAULT_TTL_MS, LockError, Locks } from "./locks.js";
import { snapshotFolder } from "./snapshot.js";
import { createWorktree } from "./worktree.js";

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
  /** Commit or branch the worktree starts from. Default: a snapshot of the folder as it is. `sa run` uses its integration branch. */
  baseRef?: string;
  /** Override for tests. Defaults to `<repo>/.shadow`. */
  shadowRoot?: string;
}): Promise<WriteSession> {
  let claims: string[];
  try {
    claims = validateClaims(opts.claims);
  } catch (e) {
    throw new WorkspaceError((e as Error).message);
  }

  let root: string;
  try {
    root = await repoRoot(opts.cwd);
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
  try {
    // The soldier starts from the folder as it is, uncommitted work included, not from the last commit.
    wt = await createWorktree({
      repoRoot: root,
      shadowRoot,
      soldier: opts.soldier,
      taskId: newTaskId(),
      baseRef: opts.baseRef ?? (await snapshotFolder(root)),
    });
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
      };
    },
    async discard() {
      await git(root, ["worktree", "remove", "--force", wt.path]).catch(() => undefined);
      await rm(wt.path, { recursive: true, force: true });
      await git(root, ["branch", "-D", wt.branch]).catch(() => undefined);
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
