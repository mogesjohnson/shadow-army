import type { MonarchEvent, PlannedRun, RunResult } from "./monarch.js";

const secs = (ms?: number) => (ms === undefined ? "" : ` in ${(ms / 1000).toFixed(0)}s`);

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
    lines.push(`  ${id.padEnd(4)} ${t.role.padEnd(8)} ${a.soldier.padEnd(14)} ${t.title}${t.difficulty === "hard" ? " [hard]" : ""}`);
    if (claims || after) lines.push(`       ${[claims.trim(), after.trim()].filter(Boolean).join(";  ")}`);
    if (a.overridden) lines.push(`       (the Monarch wanted ${a.overridden.wanted}: ${a.overridden.because})`);
  }
  return lines.join("\n");
}

/** One line of plain progress, or undefined for events the plain output does not show (the branch is in the phase line). */
export function renderEvent(e: MonarchEvent): string | undefined {
  switch (e.type) {
    case "branch":
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
        return `ok ${e.task.id} ${o.soldier}${secs(o.durationMs)}${merged}${scope}`;
      }
      return `!! ${e.task.id} ${o.soldier} ${o.status}${secs(o.durationMs)}: ${o.reason ?? ""}`;
    }
  }
}

export function renderResult(r: RunResult): string {
  if (r.status === "planned") return "Plan only; nothing was run.";
  if (r.status === "declined") return "Not run.";
  const lines: string[] = [];
  if (r.synthesis) {
    lines.push(`Report from ${r.synthesis.fromMonarch ? r.monarch : "the soldiers' reports (the Monarch could not write one)"}:`, "", r.synthesis.summary.trim(), "");
    if (r.synthesis.followUps.length) lines.push("Follow-ups:", ...r.synthesis.followUps.map((f) => `  - ${f}`), "");
  }
  const counts = new Map<string, number>();
  for (const o of r.outcomes) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  lines.push(`Tasks: ${[...counts].map(([s, n]) => `${n} ${s}`).join(", ") || "none"}`);
  if (r.integration) {
    if (r.integration.kept) {
      lines.push(
        `Branch: ${r.integration.branch} (${r.integration.commits} commit${r.integration.commits === 1 ? "" : "s"}, ${r.integration.files.length} file${r.integration.files.length === 1 ? "" : "s"} changed)`,
        `  Review it:   git diff ${r.integration.base.slice(0, 7)} ${r.integration.branch}`,
        `  Take it:     git merge ${r.integration.branch}`,
      );
    } else {
      lines.push("No changes were made, so no branch was kept.");
    }
  }
  if (r.notes.length) {
    lines.push("", r.notes.some((n) => n.applied) ? "Vault notes (decided by the Monarch):" : "Vault notes the Monarch recommends (apply with --accept-notes, or `sa vault accept/reject`):");
    for (const n of r.notes) lines.push(`  ${n.decision.padEnd(6)} ${n.id}  ${n.text}${n.reason ? `  (${n.reason})` : ""}`);
  }
  if (r.uncommittedIgnored) {
    lines.push("Note: your checkout had uncommitted changes; the run worked from the last commit and did not see them.");
  }
  if (r.costUsd) lines.push(`Reported cost: $${r.costUsd.toFixed(4)} (CLIs that report it)`);
  if (r.recordPath) lines.push(`Record: ${r.recordPath}`);
  return lines.join("\n");
}
