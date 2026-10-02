import { z } from "zod";
import type { Report } from "../core/types.js";
import type { Roster } from "../core/roster.js";
import { lastFencedBlock, PLAN_FENCE, type Parsed, type Plan } from "./plan.js";

const clip = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** One line per soldier the Monarch can plan for, saying what the rules let it do. */
export function describeRoster(roster: Roster, isInstalled: (cli: string) => boolean): string[] {
  const lines: string[] = [];
  for (const s of roster.soldiers.values()) {
    const roles = s.roles.filter((r) => r !== "orchestrate");
    if (!roles.length) continue;
    const parts = [`roles ${roles.join(", ")}`, `cost ${s.cost}`];
    if (s.buildFor) parts.push(`builds only ${s.buildFor.join("/")} tasks`);
    if (s.forbidden.length) parts.push(`never does ${s.forbidden.join("/")}`);
    if (!s.write) parts.push("read-only");
    const missing = isInstalled(s.cli) ? "" : " (NOT INSTALLED: do not plan for it)";
    lines.push(`- ${s.key}: ${parts.join("; ")}${missing}`);
  }
  return lines;
}

export function buildPlanPrompt(opts: {
  goal: string;
  roster: Roster;
  isInstalled: (cli: string) => boolean;
  maxTasks: number;
  vaultNotes?: string[];
  previousErrors?: string[];
}): string {
  const lines = [
    "You are the Monarch of Shadow Army. You plan; soldiers do the work.",
    "Your working directory is the repository. Read whatever you need to plan well, but change nothing.",
    "",
    "GOAL:",
    opts.goal.trim(),
    "",
    "YOUR SOLDIERS (code enforces who may do what; anything else is overridden):",
    ...describeRoster(opts.roster, opts.isInstalled),
  ];
  if (opts.roster.guide) lines.push("", "DELEGATION GUIDE:", opts.roster.guide.trim());
  if (opts.roster.rules.all.trim()) {
    lines.push(
      "",
      "RULES EVERY SOLDIER MUST FOLLOW (never plan a task that needs breaking one):",
      opts.roster.rules.all.trim(),
    );
  }
  if (opts.vaultNotes?.length) lines.push("", "SHARED NOTES FROM THE VAULT:", ...opts.vaultNotes.map((n) => `- ${n}`));
  lines.push(
    "",
    "HOW TO PLAN:",
    `- Split the goal into at most ${opts.maxTasks} tasks. Fewer is better; one task is fine for a small goal.`,
    "- A soldier sees only its own task's brief, plus the reports of the tasks it depends on. Write each brief so a capable engineer with no other context can do it: name the files, the exact behavior wanted, and how to check it.",
    "- role: build (changes files), review (reads and judges the work of the tasks it depends on), research (reads and reports), test (runs tests and reports; changes nothing).",
    '- A build task must list "claims": the files or globs it may change, relative to the repository root, as narrow as possible. It cannot change anything else.',
    "- Tasks without a dependency between them may run at the same time. If two tasks need the same file, make one depend on the other.",
    '- dependsOn: ids of the tasks that must succeed first. The task then starts from their merged work and sees their reports. A review task should depend on the build tasks it reviews.',
    '- difficulty: "hard" only for genuinely hard or risky changes.',
    '- soldier: optional; your preferred soldier for the task.',
  );
  if (opts.previousErrors?.length) {
    lines.push("", "YOUR PREVIOUS PLAN WAS REJECTED. Fix every one of these and return a corrected plan:", ...opts.previousErrors.map((e) => `- ${e}`));
  }
  lines.push(
    "",
    "Reply with a short explanation of your plan, then end with exactly one fenced block in this form:",
    "```" + PLAN_FENCE,
    '{"summary": "the plan in one or two sentences", "tasks": [{"id": "t1", "title": "short title", "role": "build", "difficulty": "routine", "soldier": "grok", "claims": ["src/example.ts"], "dependsOn": [], "brief": "complete instructions for the soldier"}]}',
    "```",
  );
  return lines.join("\n");
}

const SYNTHESIS_FENCE = "shadow-synthesis";

const SynthesisSchema = z.object({
  summary: z.string().min(1),
  followUps: z.array(z.string()).default([]),
  noteDecisions: z
    .array(z.object({ text: z.string(), decision: z.enum(["accept", "reject"]), reason: z.string().default("") }))
    .default([]),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;

/** What the Monarch is told about one task when writing the final report. */
export interface OutcomeForSynthesis {
  id: string;
  title: string;
  role: string;
  soldier: string;
  status: string;
  reason?: string;
  merged: boolean;
  report?: Report;
}

export function buildSynthesisPrompt(opts: {
  goal: string;
  plan: Plan;
  outcomes: OutcomeForSynthesis[];
  branch: string;
  changedFiles: string[];
  proposedNotes: string[];
}): string {
  const lines = [
    "You are the Monarch of Shadow Army. Your soldiers have finished. Write the final report for the person who set the goal.",
    "Your working directory holds the merged result of the run. You may read it; change nothing.",
    "",
    "GOAL:",
    opts.goal.trim(),
    "",
    `PLAN: ${opts.plan.summary || "(no summary)"}`,
    "",
    "RESULTS:",
  ];
  for (const o of opts.outcomes) {
    lines.push(`[${o.id}] ${o.title}: ${o.role} by ${o.soldier}: ${o.status}${o.merged ? ", merged" : ""}${o.reason ? ` (${clip(o.reason, 300)})` : ""}`);
    const r = o.report;
    if (!r) continue;
    if (r.summary) lines.push(`  summary: ${clip(r.summary, 800)}`);
    if (r.filesTouched.length) lines.push(`  files: ${r.filesTouched.join(", ")}`);
    if (r.workspace?.outOfScope.length) lines.push(`  reverted, outside its claims: ${r.workspace.outOfScope.join(", ")}`);
    if (r.openQuestions.length) lines.push(`  open questions: ${r.openQuestions.map((q) => clip(q, 200)).join(" | ")}`);
    if (r.notes.length) lines.push(`  proposed notes: ${r.notes.map((n) => clip(n, 500)).join(" | ")}`);
  }
  lines.push(
    "",
    `INTEGRATION BRANCH: ${opts.branch} (files changed: ${opts.changedFiles.length ? opts.changedFiles.join(", ") : "none"})`,
  );
  if (opts.proposedNotes.length) {
    lines.push(
      "",
      "NOTES THE SOLDIERS PROPOSED FOR THE SHARED VAULT (every future soldier would see an accepted note):",
      ...opts.proposedNotes.map((n) => `- ${n}`),
    );
  }
  lines.push(
    "",
    "Say plainly what was done, what was not, and anything the person should check before merging the branch.",
    "Decide each proposed note: accept it only if it is a durable, true fact that every future soldier should know; otherwise reject it.",
    "End with exactly one fenced block in this form:",
    "```" + SYNTHESIS_FENCE,
    '{"summary": "the final report", "followUps": ["anything left to do"], "noteDecisions": [{"text": "the note, copied exactly", "decision": "accept", "reason": "why"}]}',
    "```",
  );
  return lines.join("\n");
}

export function parseSynthesis(text: string): Parsed<Synthesis> {
  const block = lastFencedBlock(text, SYNTHESIS_FENCE);
  if (block === undefined) return { ok: false, errors: [`no \`\`\`${SYNTHESIS_FENCE} block in the reply`] };
  try {
    const parsed = SynthesisSchema.safeParse(JSON.parse(block));
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  } catch (e) {
    return { ok: false, errors: [`the ${SYNTHESIS_FENCE} block is not valid JSON: ${(e as Error).message}`] };
  }
}

/** The fallback when the Monarch cannot write the final report: built from the soldiers' reports alone. */
export function mechanicalSynthesis(outcomes: OutcomeForSynthesis[], branch: string, changedFiles: string[]): Synthesis {
  const ok = outcomes.filter((o) => o.status === "ok").length;
  const lines = [
    `${ok} of ${outcomes.length} tasks succeeded. ${changedFiles.length ? `${changedFiles.length} files changed on ${branch}.` : "No files changed."}`,
    ...outcomes.map((o) => `[${o.id}] ${o.status}: ${clip(o.report?.summary || o.reason || o.title, 200)}`),
  ];
  return {
    summary: lines.join("\n"),
    followUps: outcomes.filter((o) => o.status !== "ok").map((o) => `Task ${o.id} (${o.title}) did not succeed: ${o.status}`),
    noteDecisions: [],
  };
}
