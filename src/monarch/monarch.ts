import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter } from "../adapters/Adapter.js";
import { getAdapter as defaultGetAdapter } from "../adapters/registry.js";
import { route } from "../core/router.js";
import type { Roster } from "../core/roster.js";
import { summon } from "../core/summon.js";
import { Vault, type Note } from "../vault/vault.js";
import { applyToCheckout, type ApplyResult } from "../workspace/apply.js";
import { git, GitError, repoRoot as findRepoRoot } from "../workspace/git.js";
import { ensureShadowRoot } from "../workspace/session.js";
import { assignTasks, type TaskAssignment } from "./assign.js";
import {
  closeIntegration,
  createIntegration,
  createSnapshot,
  integrationCommits,
  integrationFiles,
  type Integration,
} from "./integration.js";
import { checkPlan, DEFAULT_MAX_TASKS, parsePlan, type CheckedPlan } from "./plan.js";
import {
  buildPlanPrompt,
  buildSynthesisPrompt,
  mechanicalSynthesis,
  parseSynthesis,
  type OutcomeForSynthesis,
  type SessionTurn,
  type Synthesis,
} from "./prompts.js";
import { execute, type Dispatch, type RunEvent, type TaskOutcome } from "./schedule.js";

/** Everything a run reports while it works: task events, phase changes, and the branch it works on. */
export type MonarchEvent = RunEvent | { type: "phase"; message: string } | { type: "branch"; branch: string };

/** The run cannot go ahead: no Monarch is available, or none produced a valid plan. */
export class MonarchError extends Error {}

export interface PlannedRun {
  runId: string;
  monarch: string;
  checked: CheckedPlan;
  assignments: Map<string, TaskAssignment>;
  /** Plans the Monarch(s) had to make before one was valid; problems with earlier ones. */
  rejected: string[][];
}

export interface RunResult {
  runId: string;
  goal: string;
  status: "planned" | "declined" | "completed";
  monarch: string;
  plan: CheckedPlan["plan"];
  order: string[];
  assignments: TaskAssignment[];
  rejected: string[][];
  outcomes: TaskOutcome[];
  integration?: { branch: string; base: string; commits: number; files: string[]; kept: boolean };
  synthesis?: Synthesis & { fromMonarch: boolean };
  /** Notes the Monarch decided on, and whether its decision was applied (`--accept-notes`). */
  notes: { id: string; text: string; decision: "accept" | "reject"; reason: string; applied: boolean }[];
  costUsd: number;
  /** The checkout had uncommitted changes, which the run (working from the last commit) did not see. */
  uncommittedIgnored: boolean;
  /** Whether the branch's changes were put into the checkout as uncommitted edits; absent when not tried. */
  applied?: ApplyResult;
  recordPath?: string;
}

export interface RunGoalOptions {
  goal: string;
  cwd: string;
  roster: Roster;
  /** Use this soldier as Monarch instead of the configured order. */
  monarch?: string;
  maxTasks?: number;
  parallel?: number;
  taskTimeoutMs?: number;
  monarchTimeoutMs?: number;
  /** How long a write task queues for a lease held outside this run. */
  waitMs?: number;
  /** Show the plan and stop. */
  planOnly?: boolean;
  /** Asked once, with the plan, before anything runs. */
  confirm: (planned: PlannedRun) => Promise<boolean>;
  /** Apply the Monarch's accept/reject decisions to this run's proposed vault notes. */
  acceptNotes?: boolean;
  keepWorktrees?: boolean;
  /** Read accepted notes into briefs and record each task in the vault. Default true. */
  useVault?: boolean;
  /** Earlier goals of the same chat session and how they ended, for the Monarch's plan. */
  history?: SessionTurn[];
  /** At the end, put the run's changes into the checkout as uncommitted edits. Default true. */
  apply?: boolean;
  onEvent?: (e: MonarchEvent) => void;
  /** Overrides for tests. */
  getAdapter?: (cli: string) => Adapter | undefined;
  isInstalled?: (cli: string) => boolean;
  dispatch?: Dispatch;
}

class MonarchCallFailed extends Error {}

const newRunId = () =>
  `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${randomBytes(2).toString("hex")}`;

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Which CLIs are installed, asking each adapter once. */
async function detectInstalled(roster: Roster, getAdapter: (cli: string) => Adapter | undefined): Promise<Set<string>> {
  const clis = [...new Set([...roster.soldiers.values()].map((s) => s.cli))];
  const found = await Promise.all(clis.map(async (cli) => ((await getAdapter(cli)?.detect())?.found ? cli : undefined)));
  return new Set(found.filter((c): c is string => Boolean(c)));
}

/**
 * Plan, approve, execute and report one goal. Everything a soldier does goes through `summon`, so the
 * hard rules, leases and claim audits of F3 to F6 apply unchanged; the Monarch only decides what to ask.
 */
export async function runGoal(opts: RunGoalOptions): Promise<RunResult> {
  const getAdapter = opts.getAdapter ?? defaultGetAdapter;
  const phase = (message: string) => opts.onEvent?.({ type: "phase", message });
  const maxTasks = opts.maxTasks ?? DEFAULT_MAX_TASKS;
  const root = await findRepoRoot(opts.cwd);
  const shadowRoot = join(root, ".shadow");
  const vault = opts.useVault === false ? undefined : new Vault(shadowRoot);

  let isInstalled = opts.isInstalled;
  if (!isInstalled) {
    phase("checking which soldiers are installed");
    const installed = await detectInstalled(opts.roster, getAdapter);
    isInstalled = (cli) => installed.has(cli);
  }

  // The Monarch order: --monarch, or the configured default then fallback, among installed orchestrators.
  const orchestrators = route(opts.roster, getAdapter, { role: "orchestrate" }, isInstalled);
  let monarchs = orchestrators.candidates.map((c) => c.soldier);
  if (opts.monarch) {
    if (!monarchs.includes(opts.monarch)) {
      const why = orchestrators.excluded.find((e) => e.soldier === opts.monarch)?.reason ?? "it is not a soldier";
      throw new MonarchError(`${opts.monarch} cannot be the Monarch: ${why}`);
    }
    monarchs = [opts.monarch];
  }
  if (!monarchs.length) {
    throw new MonarchError(
      `no Monarch is available (${orchestrators.excluded.map((e) => `${e.soldier}: ${e.reason}`).join("; ")})`,
    );
  }

  // Everything in the run, the Monarch's planning included, works from the last commit. Say so when
  // the checkout has uncommitted changes, because nobody in the run will see them.
  await ensureShadowRoot(shadowRoot);
  let startBase: string;
  try {
    startBase = (await git(root, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
  } catch {
    throw new GitError("the repository has no commits yet; make one before `sa run`");
  }
  const uncommittedIgnored = (await git(root, ["status", "--porcelain"])).trim().length > 0;
  if (uncommittedIgnored) {
    phase("your checkout has uncommitted changes; the run works from the last commit and will not see them");
  }
  const runId = newRunId();

  const acceptedNotes = vault ? await vault.acceptedNotes().catch(() => []) : [];
  const callMonarch = async (soldierKey: string, prompt: string, cwd: string): Promise<{ text: string; cost: number }> => {
    const spec = opts.roster.soldiers.get(soldierKey)!;
    const adapter = getAdapter(spec.cli)!;
    const r = await adapter.run({
      prompt,
      model: spec.model,
      cwd,
      write: false,
      effort: "high",
      timeoutMs: opts.monarchTimeoutMs ?? 600_000,
    });
    if (r.isError) throw new MonarchCallFailed(`${soldierKey}: ${r.errorMessage ?? "error"}`);
    return { text: r.text, cost: r.costUsd ?? 0 };
  };

  // Plan: each Monarch gets two attempts (the second with the first's problems); then the next Monarch.
  // It plans in a snapshot of the last commit: exactly what the soldiers will start from.
  let costUsd = 0;
  let planned: PlannedRun | undefined;
  const rejected: string[][] = [];
  const failures: string[] = [];
  const planView = await createSnapshot(root, shadowRoot, startBase, `plan-${runId}`);
  try {
  for (const m of monarchs) {
    let previousErrors: string[] | undefined;
    try {
      for (let attempt = 0; attempt < 2 && !planned; attempt++) {
        phase(`${m} is planning${attempt ? " (second attempt)" : ""}`);
        const prompt = buildPlanPrompt({
          goal: opts.goal,
          roster: opts.roster,
          isInstalled,
          maxTasks,
          vaultNotes: acceptedNotes,
          previousErrors,
          history: opts.history,
        });
        const reply = await callMonarch(m, prompt, planView.path);
        costUsd += reply.cost;
        const parsed = parsePlan(reply.text);
        const checked = parsed.ok ? checkPlan(parsed.value, maxTasks) : parsed;
        const assigned = checked.ok ? assignTasks(checked.value, opts.roster, getAdapter, isInstalled) : checked;
        if (checked.ok && assigned.ok) {
          planned = { runId, monarch: m, checked: checked.value, assignments: assigned.value, rejected };
        } else {
          previousErrors = assigned.ok ? [] : assigned.errors;
          rejected.push(previousErrors);
        }
      }
      if (planned) break;
      failures.push(`${m} returned an invalid plan twice`);
    } catch (e) {
      if (!(e instanceof MonarchCallFailed)) throw e;
      failures.push(e.message);
    }
  }
  } finally {
    await planView.remove().catch(() => undefined);
  }
  if (!planned) {
    const last = rejected.at(-1);
    throw new MonarchError(`no valid plan: ${failures.join("; ")}${last?.length ? `. Last problems: ${last.join("; ")}` : ""}`);
  }

  const base: RunResult = {
    runId: planned.runId,
    goal: opts.goal,
    status: "planned",
    monarch: planned.monarch,
    plan: planned.checked.plan,
    order: planned.checked.order,
    assignments: planned.checked.order.map((id) => planned!.assignments.get(id)!),
    rejected,
    outcomes: [],
    notes: [],
    costUsd,
    uncommittedIgnored,
  };
  if (opts.planOnly) return base;
  if (planned.checked.plan.tasks.length === 0) return { ...base, status: "completed" };
  if (!(await opts.confirm(planned))) return { ...base, status: "declined" };

  // Execute on a fresh integration branch. The user's checkout is not changed until the very end, when
  // the result is applied to it as uncommitted edits.
  const integration: Integration = await createIntegration(root, shadowRoot, planned.runId, startBase);
  phase(`working on ${integration.branch}`);
  opts.onEvent?.({ type: "branch", branch: integration.branch });
  try {
    return await executeAndReport(opts, planned, base, integration, root, shadowRoot, vault, callMonarch);
  } catch (e) {
    // Unexpected failure: keep whatever work the branch holds, but do not leave the worktree behind.
    if (!opts.keepWorktrees) await closeIntegration(root, integration, false).catch(() => undefined);
    throw e;
  }
}

async function executeAndReport(
  opts: RunGoalOptions,
  planned: PlannedRun,
  base: RunResult,
  integration: Integration,
  root: string,
  shadowRoot: string,
  vault: Vault | undefined,
  callMonarch: (soldierKey: string, prompt: string, cwd: string) => Promise<{ text: string; cost: number }>,
): Promise<RunResult> {
  const phase = (message: string) => opts.onEvent?.({ type: "phase", message });
  let costUsd = base.costUsd;
  const taskTimeoutMs = opts.taskTimeoutMs ?? 900_000;
  const dispatch: Dispatch =
    opts.dispatch ??
    ((task, assignment, ctx) =>
      summon({
        roster: opts.roster,
        soldier: assignment.soldier,
        task: `${task.title}\n\n${task.brief}`,
        role: task.role,
        cwd: ctx.cwd,
        write: task.role === "build",
        claims: task.role === "build" ? task.claims : undefined,
        baseRef: ctx.baseRef,
        context: ctx.context,
        // Readers already run in a throwaway snapshot; the guard watches the real repository.
        isolated: task.role !== "build",
        guardRoot: root,
        effort: assignment.effort,
        timeoutMs: taskTimeoutMs,
        waitMs: opts.waitMs ?? 120_000,
        vault,
      }));

  const outcomes = await execute({
    runId: planned.runId,
    checked: planned.checked,
    assignments: planned.assignments,
    integration,
    repoRoot: root,
    shadowRoot,
    parallel: opts.parallel ?? 2,
    dispatch,
    onEvent: opts.onEvent,
    keepWorktrees: opts.keepWorktrees,
  });
  costUsd += outcomes.reduce((sum, o) => sum + (o.report?.costUsd ?? 0), 0);

  const files = await integrationFiles(integration);
  const commits = await integrationCommits(integration);
  const byId = new Map(planned.checked.plan.tasks.map((t) => [t.id, t]));
  const forSynthesis: OutcomeForSynthesis[] = outcomes.map((o) => ({
    id: o.taskId,
    title: byId.get(o.taskId)!.title,
    role: byId.get(o.taskId)!.role,
    soldier: o.soldier,
    status: o.status,
    reason: o.reason,
    merged: o.merged,
    report: o.report,
  }));

  // Notes this run's soldiers proposed (and that the vault still has as proposed).
  const runIds = new Set(outcomes.map((o) => o.report?.runId).filter(Boolean));
  const proposed: Note[] = vault
    ? (await vault.listNotes("proposed").catch(() => [])).filter((n) => n.runId && runIds.has(n.runId))
    : [];

  // Synthesis: the Monarch reads the reports, in a snapshot of the merged result.
  phase(`${planned.monarch} is writing the final report`);
  let synthesis: RunResult["synthesis"];
  const snapshot = await createSnapshot(root, shadowRoot, integration.branch, `final-${planned.runId}`);
  try {
    const reply = await callMonarch(
      planned.monarch,
      buildSynthesisPrompt({
        goal: opts.goal,
        plan: planned.checked.plan,
        outcomes: forSynthesis,
        branch: integration.branch,
        changedFiles: files,
        proposedNotes: proposed.map((n) => n.text),
      }),
      snapshot.path,
    );
    costUsd += reply.cost;
    const parsed = parseSynthesis(reply.text);
    if (parsed.ok) synthesis = { ...parsed.value, fromMonarch: true };
  } catch (e) {
    if (!(e instanceof MonarchCallFailed)) throw e;
  } finally {
    await snapshot.remove().catch(() => undefined);
  }
  synthesis ??= { ...mechanicalSynthesis(forSynthesis, integration.branch, files), fromMonarch: false };

  // Note decisions: only for notes this run proposed, and only applied with --accept-notes.
  const notes: RunResult["notes"] = [];
  for (const d of synthesis.noteDecisions) {
    const note = proposed.find((n) => normalize(n.text) === normalize(d.text));
    if (!note || notes.some((x) => x.id === note.id)) continue;
    let applied = false;
    if (opts.acceptNotes && vault) {
      await vault.setNoteStatus(note.id, d.decision === "accept" ? "accepted" : "rejected");
      applied = true;
    }
    notes.push({ id: note.id, text: note.text, decision: d.decision, reason: d.reason, applied });
  }

  // Keep the branch if it holds work; remove the scaffolding worktree unless asked to keep it.
  const keepBranch = commits > 0;
  if (!opts.keepWorktrees) await closeIntegration(root, integration, !keepBranch);

  // Bring the work into the owner's folder as uncommitted edits to review and commit; the branch stays.
  let applied: ApplyResult | undefined;
  if (keepBranch && opts.apply !== false) {
    phase("applying the changes to your folder");
    applied = await applyToCheckout(root, integration.base, integration.branch);
  }

  const result: RunResult = {
    ...base,
    status: "completed",
    outcomes,
    integration: { branch: integration.branch, base: integration.base, commits, files, kept: keepBranch },
    synthesis,
    notes,
    costUsd,
    applied,
  };

  // The record of the run lives with the vault: goal, plan, assignments, outcomes and the final report.
  try {
    const dir = join(shadowRoot, "monarch");
    await mkdir(dir, { recursive: true });
    result.recordPath = join(dir, `${planned.runId}.json`);
    await writeFile(result.recordPath, JSON.stringify(result, null, 2), "utf8");
  } catch {
    result.recordPath = undefined;
  }
  return result;
}
