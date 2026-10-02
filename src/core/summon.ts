import { randomBytes } from "node:crypto";
import { join, relative } from "node:path";
import type { Adapter, Autonomy, Effort, Role } from "../adapters/Adapter.js";
import { getAdapter } from "../adapters/registry.js";
import { repoRoot } from "../workspace/git.js";
import { captureState, diffState } from "../workspace/guard.js";
import { createSnapshot } from "../workspace/worktree.js";
import { checkAssignment, defaultRole } from "./assign.js";
import { buildPrompt, parseReport } from "./brief.js";
import type { Roster } from "./roster.js";
import type { Brief, Report } from "./types.js";
import type { Vault } from "../vault/vault.js";
import { ensureShadowRoot, openWriteSession, WorkspaceError, type WriteSession } from "../workspace/session.js";

export interface SummonOptions {
  roster: Roster;
  soldier: string;
  task: string;
  role?: Role;
  cwd: string;
  write?: boolean;
  /** Files a writing soldier may touch: paths or globs relative to the repo root. Required with `write`. */
  claims?: string[];
  /** How long a write run queues for a conflicting lease before giving up. Default: fail immediately. */
  waitMs?: number;
  effort?: Effort;
  constraints?: string[];
  vaultNotes?: string[];
  /** Reports from the tasks this one depends on, shown to the soldier as context (F7). */
  context?: string[];
  /** For write runs: what the soldier's worktree starts from. Default: the current commit. */
  baseRef?: string;
  timeoutMs?: number;
  /**
   * When set, accepted vault notes go into the brief, the run is recorded, and the report's notes
   * are proposed back to the vault.
   */
  vault?: Vault;
  /** The working directory is already a throwaway copy (the Monarch's read-only snapshots). */
  isolated?: boolean;
  /** The repository the checkout guard watches. Default: the one containing `cwd`. */
  guardRoot?: string;
  /** Overrides for tests. */
  adapter?: Adapter;
  autonomy?: Autonomy;
  shadowRoot?: string;
  leaseTtlMs?: number;
}

export class SummonError extends Error {}

/** Send one brief to one soldier and return its report. Throws SummonError for refused assignments. */
export async function summon(opts: SummonOptions): Promise<Report> {
  const soldier = opts.roster.soldiers.get(opts.soldier);
  if (!soldier) {
    throw new SummonError(
      `unknown soldier "${opts.soldier}" (known: ${[...opts.roster.soldiers.keys()].join(", ")})`,
    );
  }
  const adapter = opts.adapter ?? getAdapter(soldier.cli);
  if (!adapter) throw new SummonError(`no adapter for CLI "${soldier.cli}"`);

  const role = opts.role ?? defaultRole(soldier);
  const verdict = checkAssignment(soldier, adapter, role, opts.write ?? false);
  if (!verdict.ok) throw new SummonError(verdict.reason);

  // A writing soldier gets its own worktree and a lease on the files it claims. Read-only runs take
  // neither: reading is never blocked.
  let session: WriteSession | undefined;
  if (verdict.write) {
    try {
      session = await openWriteSession({
        cwd: opts.cwd,
        soldier: opts.soldier,
        claims: opts.claims ?? [],
        waitMs: opts.waitMs,
        ttlMs: opts.leaseTtlMs,
        baseRef: opts.baseRef,
        shadowRoot: opts.shadowRoot,
      });
    } catch (e) {
      if (e instanceof WorkspaceError) throw new SummonError(e.message);
      throw e;
    }
  }

  // Set just before the soldier starts. A write run that fails before that point leaves nothing behind.
  let started = false;
  let lookCopy: { path: string; remove: () => Promise<void> } | undefined;
  try {
    const root = opts.guardRoot ?? (await repoRoot(opts.cwd).catch(() => undefined));

    // An unrestricted soldier on a read-only task could still write, so it gets a throwaway copy of the
    // last commit and whatever it writes is discarded. Outside a repository there is no copy to give,
    // so that run falls back to supervised mode.
    let autonomy: Autonomy = opts.autonomy ?? soldier.autonomy;
    let autonomyNote: string | undefined;
    let cwd = session?.cwd ?? opts.cwd;
    if (!verdict.write && autonomy !== "supervised" && !opts.isolated) {
      if (root) {
        const shadowRoot = opts.shadowRoot ?? join(root, ".shadow");
        await ensureShadowRoot(shadowRoot);
        lookCopy = await createSnapshot(root, shadowRoot, "HEAD", `look-${opts.soldier}-${randomBytes(3).toString("hex")}`);
        cwd = join(lookCopy.path, relative(root, opts.cwd));
      } else {
        autonomyNote = `not in a git repository, so this read-only run used supervised mode instead of ${autonomy}`;
        autonomy = "supervised";
      }
    }

    let vaultError: string | undefined;
    let acceptedNotes: string[] = [];
    if (opts.vault) {
      try {
        acceptedNotes = await opts.vault.acceptedNotes();
      } catch (e) {
        vaultError = `could not read the vault: ${(e as Error).message}`;
      }
    }

    const constraints = [...(opts.constraints ?? [])];
    if (session) {
      constraints.push(
        `You may only create or change files matching: ${session.claims.join(", ")}. Edits to anything else are automatically reverted.`,
      );
    }
    const brief: Brief = {
      task: opts.task,
      role: verdict.role,
      constraints,
      vaultNotes: [...acceptedNotes, ...(opts.vaultNotes ?? [])],
      context: opts.context,
      rules: opts.roster.rules.all,
      soldierRules: opts.roster.rules.perSoldier.get(opts.soldier),
      write: verdict.write,
    };
    let prompt: string;
    try {
      prompt = buildPrompt(brief);
    } catch (e) {
      throw new SummonError((e as Error).message);
    }

    // The checkout guard: the repository as it is now, to compare with afterwards. Only Shadow Army's
    // own shadow/* branches may change while a soldier works.
    const before = root ? await captureState(root) : undefined;

    const timeoutMs = opts.timeoutMs ?? 600_000;
    const startedAt = Date.now();
    started = true;
    const result = await adapter.run({
      prompt,
      model: soldier.model,
      cwd,
      write: verdict.write,
      autonomy,
      effort: opts.effort,
      timeoutMs,
    });
    const durationMs = Date.now() - startedAt;
    const guard = before && root ? diffState(before, await captureState(root)) : [];

    const base = {
      soldier: opts.soldier,
      role: verdict.role,
      model: soldier.model,
      durationMs,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      costUsd: result.costUsd,
      resolvedModel: result.resolvedModel,
    };

    const report: Report = result.isError
      ? {
          ...base,
          status: "error",
          summary: result.text.trim(),
          filesTouched: [],
          openQuestions: [],
          notes: [],
          structured: false,
          error: result.errorMessage ?? "soldier reported an error",
        }
      : { ...base, status: "ok", ...parseReport(result.text) };
    report.autonomy = autonomy;
    if (autonomyNote) report.autonomyNote = autonomyNote;
    if (guard.length) {
      // Something outside the soldier's own workspace changed while it ran. That breaks the rules
      // whatever the task's outcome, so the task fails and the changes are listed for the user.
      const msg = `RULE BROKEN: changes outside the soldier's own workspace while it ran: ${guard.join("; ")}`;
      report.guard = guard;
      report.status = "error";
      report.error = report.error ? `${report.error}; ${msg}` : msg;
    }

    if (session) {
      // The audit, not the soldier's own account, decides what was touched. Edits outside the claims
      // are reverted and what is left is committed to the soldier's branch, whether or not the run
      // succeeded; the report's status says whether that branch is worth merging.
      const firstLine = opts.task.trim().split("\n")[0]!.slice(0, 72);
      const failed = report.status === "error" ? " [failed run]" : "";
      try {
        const workspace = await session.finish(`shadow(${opts.soldier})${failed}: ${firstLine}`);
        report.workspace = workspace;
        report.filesTouched = workspace.inScope;
      } catch (e) {
        // Without a completed audit nothing can be said about scope, so the run cannot count as ok.
        const msg = `workspace audit failed, so the soldier's branch was not checked: ${(e as Error).message}`;
        report.status = "error";
        report.error = report.error ? `${report.error}; ${msg}` : msg;
      }
    }

    if (vaultError) report.vaultError = vaultError;
    if (opts.vault) await record(opts.vault, report, brief, opts.soldier);
    return report;
  } finally {
    if (session && !started) await session.discard();
    await session?.release();
    await lookCopy?.remove();
  }
}

/** Save the run and propose the report's notes. A vault failure is attached to the report, never thrown. */
async function record(vault: Vault, report: Report, brief: Brief, soldier: string): Promise<void> {
  try {
    const run = await vault.saveRun({
      soldier,
      task: brief.task,
      role: brief.role,
      write: brief.write,
      report,
    });
    report.runId = run.id;
    if (report.status === "ok") {
      for (const text of report.notes) {
        await vault.addNote({ text, source: soldier, status: "proposed", runId: run.id });
      }
    }
  } catch (e) {
    const msg = `could not write to the vault: ${(e as Error).message}`;
    report.vaultError = report.vaultError ? `${report.vaultError}; ${msg}` : msg;
  }
}

export function renderReport(r: Report): string {
  const secs = (r.durationMs / 1000).toFixed(1);
  const mode = r.autonomy && r.autonomy !== "supervised" ? ` (${r.autonomy} autonomy)` : "";
  const lines = [`${r.soldier} [${r.role}] on ${r.resolvedModel ?? r.model}${mode} - ${r.status.toUpperCase()}`, ""];
  if (r.error) lines.push(`Error: ${r.error}`, "");
  if (r.autonomyNote) lines.push(`Note: ${r.autonomyNote}`, "");
  if (r.summary) lines.push(r.summary, "");
  if (r.filesTouched.length) lines.push("Files touched:", ...r.filesTouched.map((f) => `  - ${f}`), "");
  if (r.workspace) {
    const w = r.workspace;
    lines.push(`Branch: ${w.branch} ${w.commit ? `(at ${w.commit})` : "(no changes)"}`);
    lines.push(`Worktree: ${w.path}`);
    lines.push(`Claims: ${w.claims.join(", ")}`);
    if (w.outOfScope.length) {
      lines.push(`SCOPE VIOLATION: edited outside its claims; reverted: ${w.outOfScope.join(", ")}`);
    }
    if (w.leaseLost) lines.push("WARNING: the lease could not be renewed, so the claimed files may have changed hands mid-run");
    if (w.uncommittedIgnored) {
      lines.push("Note: your checkout had uncommitted changes; the soldier worked from the last commit and did not see them");
    }
    lines.push("");
  }
  if (r.openQuestions.length) lines.push("Open questions:", ...r.openQuestions.map((q) => `  - ${q}`), "");
  if (r.notes.length) {
    const hint = r.runId && !r.vaultError ? " (proposed; review with `sa vault`)" : "";
    lines.push(`Notes for the Vault${hint}:`, ...r.notes.map((n) => `  - ${n}`), "");
  }
  if (!r.structured && r.status === "ok") lines.push("(no shadow-report block returned; showing the raw reply)", "");
  if (r.vaultError) lines.push(`Vault warning: ${r.vaultError}`, "");
  if (r.runId) lines.push(`Run: ${r.runId}`);
  const stats = [`${secs}s`];
  if (r.inputTokens !== undefined) stats.push(`${r.inputTokens} in`);
  if (r.outputTokens !== undefined) stats.push(`${r.outputTokens} out`);
  if (r.costUsd !== undefined) stats.push(`$${r.costUsd.toFixed(4)}`);
  lines.push(stats.join(" | "));
  return lines.join("\n");
}
