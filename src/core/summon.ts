import type { Adapter, Effort, Role } from "../adapters/Adapter.js";
import { getAdapter } from "../adapters/registry.js";
import { checkAssignment, defaultRole } from "./assign.js";
import { buildPrompt, parseReport } from "./brief.js";
import type { ShadowConfig } from "./config.js";
import type { Brief, Report } from "./types.js";

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

  const brief: Brief = {
    task: opts.task,
    role: verdict.role,
    constraints: opts.constraints ?? [],
    vaultNotes: opts.vaultNotes ?? [],
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

  if (result.isError) {
    return {
      ...base,
      status: "error",
      summary: result.text.trim(),
      filesTouched: [],
      openQuestions: [],
      notes: [],
      structured: false,
      error: result.errorMessage ?? "soldier reported an error",
    };
  }
  return { ...base, status: "ok", ...parseReport(result.text) };
}

export function renderReport(r: Report): string {
  const secs = (r.durationMs / 1000).toFixed(1);
  const lines = [`${r.soldier} [${r.role}] on ${r.resolvedModel ?? r.model} - ${r.status.toUpperCase()}`, ""];
  if (r.error) lines.push(`Error: ${r.error}`, "");
  if (r.summary) lines.push(r.summary, "");
  if (r.filesTouched.length) lines.push("Files touched:", ...r.filesTouched.map((f) => `  - ${f}`), "");
  if (r.openQuestions.length) lines.push("Open questions:", ...r.openQuestions.map((q) => `  - ${q}`), "");
  if (r.notes.length) lines.push("Notes for the Vault:", ...r.notes.map((n) => `  - ${n}`), "");
  if (!r.structured && r.status === "ok") lines.push("(no shadow-report block returned; showing the raw reply)", "");
  const stats = [`${secs}s`];
  if (r.inputTokens !== undefined) stats.push(`${r.inputTokens} in`);
  if (r.outputTokens !== undefined) stats.push(`${r.outputTokens} out`);
  if (r.costUsd !== undefined) stats.push(`$${r.costUsd.toFixed(4)}`);
  lines.push(stats.join(" | "));
  return lines.join("\n");
}
