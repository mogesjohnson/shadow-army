import type { Adapter, Effort, Role } from "../adapters/Adapter.js";
import { getAdapter } from "../adapters/registry.js";
import { checkAssignment, defaultRole } from "./assign.js";
import { buildPrompt, parseReport } from "./brief.js";
import type { ShadowConfig } from "./config.js";
import type { Brief, Report } from "./types.js";
import type { Vault } from "../vault/vault.js";

export interface SummonOptions {
  config: ShadowConfig;
  soldier: string;
  task: string;
  role?: Role;
  cwd: string;
  write?: boolean;
  effort?: Effort;
  constraints?: string[];
  vaultNotes?: string[];
  timeoutMs?: number;
  /**
   * When set, accepted vault notes go into the brief, the run is recorded, and the report's notes
   * are proposed back to the vault.
   */
  vault?: Vault;
  /** Override for tests. */
  adapter?: Adapter;
}

export class SummonError extends Error {}

/** Send one brief to one soldier and return its report. Throws SummonError for refused assignments. */
export async function summon(opts: SummonOptions): Promise<Report> {
  const soldier = opts.config.soldiers[opts.soldier];
  if (!soldier) {
    throw new SummonError(
      `unknown soldier "${opts.soldier}" (known: ${Object.keys(opts.config.soldiers).join(", ")})`,
    );
  }
  const adapter = opts.adapter ?? getAdapter(soldier.cli);
  if (!adapter) throw new SummonError(`no adapter for CLI "${soldier.cli}"`);

  const role = opts.role ?? defaultRole(soldier);
  const verdict = checkAssignment(opts.soldier, soldier, adapter, role, opts.write ?? false);
  if (!verdict.ok) throw new SummonError(verdict.reason);

  let vaultError: string | undefined;
  let acceptedNotes: string[] = [];
  if (opts.vault) {
    try {
      acceptedNotes = await opts.vault.acceptedNotes();
    } catch (e) {
      vaultError = `could not read the vault: ${(e as Error).message}`;
    }
  }

  const brief: Brief = {
    task: opts.task,
    role: verdict.role,
    constraints: opts.constraints ?? [],
    vaultNotes: [...acceptedNotes, ...(opts.vaultNotes ?? [])],
    write: verdict.write,
  };
  let prompt: string;
  try {
    prompt = buildPrompt(brief);
  } catch (e) {
    throw new SummonError((e as Error).message);
  }

  const timeoutMs = opts.timeoutMs ?? 600_000;
  const started = Date.now();
  const result = await adapter.run({
    prompt,
    model: soldier.model,
    cwd: opts.cwd,
    write: verdict.write,
    effort: opts.effort,
    timeoutMs,
  });
  const durationMs = Date.now() - started;

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

  if (vaultError) report.vaultError = vaultError;
  if (opts.vault) await record(opts.vault, report, brief, opts.soldier);
  return report;
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
  const lines = [`${r.soldier} [${r.role}] on ${r.resolvedModel ?? r.model} - ${r.status.toUpperCase()}`, ""];
  if (r.error) lines.push(`Error: ${r.error}`, "");
  if (r.summary) lines.push(r.summary, "");
  if (r.filesTouched.length) lines.push("Files touched:", ...r.filesTouched.map((f) => `  - ${f}`), "");
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
