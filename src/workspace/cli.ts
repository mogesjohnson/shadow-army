import { join } from "node:path";
import { Command } from "commander";
import { GitError, repoRoot } from "./git.js";
import { Locks, type Lease } from "./locks.js";
import { listWorktrees, removeWorktree } from "./worktree.js";
import { VaultError } from "../vault/vault.js";

/** The repo whose `.shadow/` holds the leases and worktrees: the git repository containing `cwd`. */
async function shadowOf(cwd: string): Promise<{ root: string; shadowRoot: string }> {
  const root = await repoRoot(cwd);
  return { root, shadowRoot: join(root, ".shadow") };
}

/** Turn expected failures into a clean message and a non-zero exit. */
async function guarded(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof GitError || e instanceof VaultError) {
      console.error(`error: ${e.message}`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}

export function renderLeases(leases: Lease[], now = Date.now()): string {
  if (!leases.length) return "(no live leases)";
  return leases
    .map((l) => {
      const secs = Math.max(0, Math.round((l.expiresAt - now) / 1000));
      return `${l.owner}  ${l.claims.join(", ")}  (expires in ${secs}s unless renewed, pid ${l.pid}, ${l.id})`;
    })
    .join("\n");
}

export function registerWorkspaceCommands(program: Command): void {
  const locks = program
    .command("locks")
    .description("show which soldier holds which files (leases taken by write runs)")
    .option("--cwd <dir>", "a directory inside the repository", process.cwd());

  const cwdOf = (cmd: Command) => cmd.optsWithGlobals().cwd as string;

  locks.action((_opts, cmd: Command) =>
    guarded(async () => {
      const { shadowRoot } = await shadowOf(cwdOf(cmd));
      console.log(renderLeases(await new Locks(shadowRoot).list()));
    }),
  );

  locks
    .command("release <soldier>")
    .description("free every lease a soldier holds (for a run that was killed)")
    .action((soldier: string, _opts: unknown, cmd: Command) =>
      guarded(async () => {
        const { shadowRoot } = await shadowOf(cwdOf(cmd));
        const n = await new Locks(shadowRoot).releaseOwner(soldier);
        console.log(n ? `released ${n} lease${n === 1 ? "" : "s"} held by ${soldier}` : `${soldier} holds no leases`);
      }),
    );

  const worktrees = program
    .command("worktrees")
    .description("list the soldiers' worktrees and the branches they work on")
    .option("--cwd <dir>", "a directory inside the repository", process.cwd());

  worktrees.action((_opts, cmd: Command) =>
    guarded(async () => {
      const { root, shadowRoot } = await shadowOf(cwdOf(cmd));
      const list = await listWorktrees(root, shadowRoot);
      console.log(list.length ? list.map((w) => `${w.name}  ${w.branch ?? "(detached)"}  ${w.path}`).join("\n") : "(no soldier worktrees)");
    }),
  );

  worktrees
    .command("remove <name>")
    .description("delete a soldier's worktree; its branch is kept unless --delete-branch")
    .option("--delete-branch", "also delete the branch, discarding the soldier's committed work")
    .action((name: string, opts: { deleteBranch?: boolean }, cmd: Command) =>
      guarded(async () => {
        const { root, shadowRoot } = await shadowOf(cwdOf(cmd));
        const removed = await removeWorktree({ repoRoot: root, shadowRoot, name, deleteBranch: opts.deleteBranch });
        console.log(
          `removed worktree ${removed.name}` +
            (removed.branch ? (opts.deleteBranch ? ` and branch ${removed.branch}` : `; branch ${removed.branch} kept`) : ""),
        );
      }),
    );
}
