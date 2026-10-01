import type { Note, RunRecord } from "./vault.js";

const one = (s: string, max = 90) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export function renderNotes(notes: Note[]): string {
  if (!notes.length) return "(no notes)";
  return notes.map((n) => `${n.id}  [${n.status}] (${n.source})  ${n.text}`).join("\n");
}

export function renderRuns(runs: RunRecord[]): string {
  if (!runs.length) return "(no runs)";
  return runs
    .map((r) => {
      const cost = r.report.costUsd !== undefined ? `  $${r.report.costUsd.toFixed(4)}` : "";
      return `${r.id}  ${r.soldier} [${r.role}]  ${r.report.status}${cost}  ${one(r.task, 60)}`;
    })
    .join("\n");
}

export function renderOverview(root: string, notes: Note[], runs: RunRecord[]): string {
  const count = (s: Note["status"]) => notes.filter((n) => n.status === s).length;
  const proposed = notes.filter((n) => n.status === "proposed");
  const lines = [
    `Shadow Vault: ${root}`,
    `Notes: ${count("accepted")} accepted, ${count("proposed")} proposed, ${count("rejected")} rejected`,
  ];
  if (proposed.length) {
    lines.push("", "Waiting for review (sa vault accept <id> / sa vault reject <id>):");
    lines.push(...proposed.map((n) => `  ${n.id}  (${n.source})  ${one(n.text)}`));
  }
  lines.push("", `Recent runs (${Math.min(runs.length, 5)} of ${runs.length}):`);
  lines.push(runs.length ? renderRuns(runs.slice(0, 5)).split("\n").map((l) => `  ${l}`).join("\n") : "  (none yet)");
  return lines.join("\n");
}
