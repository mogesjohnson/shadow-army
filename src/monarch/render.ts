import { renderApply } from "../workspace/apply.js";
import type { MonarchEvent, PlannedRun, RunResult } from "./monarch.js";

const secs = (ms?: number) => (ms === undefined ? "" : ` in ${(ms / 1000).toFixed(0)}s`);

/** A token count, short: 950, 12.3k, 1.2M. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  // Below 10k one decimal is kept; 999,500 and up would round to 1000k, so it is 1M.
  if (n < 999_500) {
    const k = n / 1000;
    return `${k < 9.95 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
  }
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** One model's share of a run: who, which model, at what effort, and the tokens it used. */
export interface ModelUsage {
  soldier: string;
  model: string;
  efforts: string[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Collects usage by soldier and the model that actually answered: one soldier can resolve to
 * different models (an alias, a fallback), and each keeps its own totals.
 */
export class UsageTally {
  private readonly rows = new Map<string, ModelUsage>();

  add(soldier: string, model: string, effort: string | undefined, input = 0, output = 0): void {
    const key = `${soldier}\u0000${model}`;
    const row = this.rows.get(key) ?? { soldier, model, efforts: [], inputTokens: 0, outputTokens: 0 };
    if (effort && !row.efforts.includes(effort)) row.efforts.push(effort);
    row.inputTokens += input;
    row.outputTokens += output;
    this.rows.set(key, row);
  }

  list(): ModelUsage[] {
    return [...this.rows.values()].map((u) => ({ ...u, efforts: [...u.efforts] }));
  }
}

/** Tokens by soldier and model over a run: the Monarch's calls first, then each soldier's tasks. */
export function usageByModel(r: RunResult): ModelUsage[] {
  const tally = new UsageTally();
  for (const m of r.monarchUsage ?? []) tally.add(m.soldier, m.model, m.effort, m.inputTokens, m.outputTokens);
  const effortOf = new Map(r.assignments.map((a) => [a.taskId, a.effort]));
  for (const o of r.outcomes) {
    if (!o.report) continue;
    tally.add(o.soldier, o.report.resolvedModel ?? o.report.model, effortOf.get(o.taskId), o.report.inputTokens, o.report.outputTokens);
  }
  return tally.list();
}

/** The token lines of a run's report, or none when no CLI reported tokens. */
export function renderUsage(r: RunResult): string[] {
  return renderUsageRows(usageByModel(r));
}

/** Token lines for usage rows: a heading, then one line per soldier and model that used tokens. */
export function renderUsageRows(all: ModelUsage[]): string[] {
  const rows = all.filter((u) => u.inputTokens || u.outputTokens);
  if (!rows.length) return [];
  const width = Math.max(...rows.map((u) => `${u.soldier} (${u.model})`.length));
  return [
    "Tokens:",
    ...rows.map(
      (u) =>
        `  ${`${u.soldier} (${u.model})`.padEnd(width)}  effort ${(u.efforts.join("/") || "?").padEnd(6)}  ${formatTokens(u.inputTokens)} in · ${formatTokens(u.outputTokens)} out`,
    ),
  ];
}

/** The plan inside a run's result, in the shape `renderPlan` takes. */
export const planOf = (r: RunResult): Pick<PlannedRun, "monarch" | "checked" | "assignments" | "rejected"> => ({
  monarch: r.monarch,
  checked: { plan: r.plan, order: r.order },
  assignments: new Map(r.assignments.map((a) => [a.taskId, a])),
  rejected: r.rejected,
});

export function renderPlan(planned: Pick<PlannedRun, "monarch" | "checked" | "assignments" | "rejected">): string {
  const { plan, order } = planned.checked;
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const lines = [`Plan by ${planned.monarch}: ${plan.summary || "(no summary)"}`];
  if (planned.rejected.length) {
    lines.push(`(${planned.rejected.length} earlier plan${planned.rejected.length === 1 ? " was" : "s were"} rejected and corrected)`);
  }
  if (!order.length) return [...lines, "", "Nothing to do."].join("\n");
  lines.push("");
  for (const id of order) {
    const t = byId.get(id)!;
    const a = planned.assignments.get(id)!;
    const after = t.dependsOn.length ? ` after ${t.dependsOn.join(", ")}` : "";
    const claims = t.claims.length ? ` claims ${t.claims.join(", ")}` : "";
    lines.push(`  ${id.padEnd(4)} ${t.role.padEnd(8)} ${a.soldier.padEnd(14)} ${a.effort.padEnd(6)} ${t.title}${t.difficulty === "hard" ? " [hard]" : ""}`);
    if (claims || after) lines.push(`       ${[claims.trim(), after.trim()].filter(Boolean).join(";  ")}`);
    if (a.overridden) lines.push(`       (the Monarch wanted ${a.overridden.wanted}: ${a.overridden.because})`);
  }
  return lines.join("\n");
}

/** One line of plain progress, or undefined for events the plain output does not show (the branch is in the phase line). */
export function renderEvent(e: MonarchEvent): string | undefined {
  switch (e.type) {
    case "branch":
    case "usage":
      return undefined;
    case "phase":
      return `.. ${e.message}`;
    case "start":
      return `>> ${e.task.id} ${e.soldier}: ${e.task.title}`;
    case "skip":
      return `-- ${e.task.id} skipped: ${e.reason}`;
    case "finish": {
      const o = e.outcome;
      if (o.status === "ok") {
        const files = o.report?.filesTouched.length ?? 0;
        const merged = o.merged ? `, merged (${files} file${files === 1 ? "" : "s"})` : e.task.role === "build" ? ", no changes" : "";
        const scope = o.report?.workspace?.outOfScope.length ? `, reverted out-of-scope edits: ${o.report.workspace.outOfScope.join(", ")}` : "";
        const links = o.report?.workspace?.linksRemoved?.length ? `, removed links: ${o.report.workspace.linksRemoved.join(", ")}` : "";
        return `ok ${e.task.id} ${o.soldier}${secs(o.durationMs)}${merged}${scope}${links}`;
      }
      return `!! ${e.task.id} ${o.soldier} ${o.status}${secs(o.durationMs)}: ${o.reason ?? ""}`;
    }
  }
}

export function renderResult(r: RunResult): string {
  // Planning used the Monarch even when nothing ran, so its tokens are reported too.
  if (r.status === "planned") return ["Plan only; nothing was run.", ...renderUsage(r)].join("\n");
  if (r.status === "declined") return ["Not run.", ...renderUsage(r)].join("\n");
  const lines: string[] = [];
  if (r.synthesis) {
    lines.push(`Report from ${r.synthesis.fromMonarch ? r.monarch : "the soldiers' reports (the Monarch could not write one)"}:`, "", r.synthesis.summary.trim(), "");
    if (r.synthesis.followUps.length) lines.push("Follow-ups:", ...r.synthesis.followUps.map((f) => `  - ${f}`), "");
  }
  const counts = new Map<string, number>();
  for (const o of r.outcomes) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  lines.push(`Tasks: ${[...counts].map(([s, n]) => `${n} ${s}`).join(", ") || "none"}`);
  if (r.integration) {
    if (!r.integration.kept) {
      lines.push("No changes were made, so no branch was kept.");
    } else if (r.applied?.applied) {
      lines.push(renderApply(r.applied, r.integration.branch));
    } else {
      lines.push(
        `Branch: ${r.integration.branch} (${r.integration.commits} commit${r.integration.commits === 1 ? "" : "s"}, ${r.integration.files.length} file${r.integration.files.length === 1 ? "" : "s"} changed)`,
        `  Review it:   git diff ${r.integration.base.slice(0, 7)} ${r.integration.branch}`,
        `  Take it:     git merge ${r.integration.branch}`,
      );
      if (r.applied) lines.push(renderApply(r.applied, r.integration.branch));
    }
  }
  if (r.notes.length) {
    lines.push("", r.notes.some((n) => n.applied) ? "Vault notes (decided by the Monarch):" : "Vault notes the Monarch recommends (apply with --accept-notes, or `sa vault accept/reject`):");
    for (const n of r.notes) lines.push(`  ${n.decision.padEnd(6)} ${n.id}  ${n.text}${n.reason ? `  (${n.reason})` : ""}`);
  }
  if (r.uncommittedIgnored) {
    lines.push("Note: your checkout had uncommitted changes; the run worked from the last commit and did not see them.");
  }
  lines.push(...renderUsage(r));
  if (r.costUsd) lines.push(`Reported cost: $${r.costUsd.toFixed(4)} (CLIs that report it)`);
  if (r.recordPath) lines.push(`Record: ${r.recordPath}`);
  return lines.join("\n");
}
