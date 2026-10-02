import { basename } from "node:path";
import { SummonError } from "../core/summon.js";
import type { Report } from "../core/types.js";
import { claimsOverlap } from "../workspace/claims.js";
import { removeWorktree } from "../workspace/worktree.js";
import type { TaskAssignment } from "./assign.js";
import { createSnapshot, mergeInto, type Integration } from "./integration.js";
import type { CheckedPlan, PlanTask } from "./plan.js";

export type TaskStatus = "ok" | "error" | "refused" | "conflict" | "skipped";

export interface TaskOutcome {
  taskId: string;
  soldier: string;
  status: TaskStatus;
  /** Why it is not ok: the soldier's error, the refusal, the conflict, or the failed dependency. */
  reason?: string;
  report?: Report;
  /** The task's branch was merged into the integration branch. */
  merged: boolean;
  mergeCommit?: string;
  durationMs?: number;
}

export interface DispatchContext {
  /** Where the soldier runs: the repo (write tasks get their own worktree from it) or a read-only snapshot. */
  cwd: string;
  /** For write tasks: the integration branch, so the soldier starts from the work it depends on. */
  baseRef?: string;
  /** The reports of the tasks this one depends on. */
  context: string[];
}

/** Run one task through a soldier; in production this is `summon`. Throwing SummonError means refused. */
export type Dispatch = (task: PlanTask, assignment: TaskAssignment, ctx: DispatchContext) => Promise<Report>;

export type RunEvent =
  | { type: "start"; task: PlanTask; soldier: string }
  | { type: "finish"; task: PlanTask; outcome: TaskOutcome }
  | { type: "skip"; task: PlanTask; reason: string };

const clip = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

interface Finished {
  id: string;
  report?: Report;
  error?: unknown;
  durationMs: number;
}

/**
 * Run a checked plan. Tasks start once every task they depend on has succeeded, up to `parallel` at a
 * time, and two writing tasks whose claims could overlap never run together. Each successful write
 * task is merged into the integration branch before anything that depends on it starts, so dependent
 * tasks build on that work. A task that does not succeed skips everything downstream of it; the rest
 * of the run carries on.
 */
export async function execute(opts: {
  runId: string;
  checked: CheckedPlan;
  assignments: Map<string, TaskAssignment>;
  integration: Integration;
  repoRoot: string;
  shadowRoot: string;
  parallel: number;
  dispatch: Dispatch;
  onEvent?: (e: RunEvent) => void;
  keepWorktrees?: boolean;
}): Promise<TaskOutcome[]> {
  const { plan, order } = opts.checked;
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const outcomes = new Map<string, TaskOutcome>();
  const running = new Map<string, Promise<Finished>>();
  const emit = (e: RunEvent) => opts.onEvent?.(e);
  const parallel = Math.max(1, opts.parallel);

  const contextFor = (task: PlanTask): string[] =>
    task.dependsOn.flatMap((d) => {
      const o = outcomes.get(d);
      const t = byId.get(d)!;
      if (!o?.report) return [];
      const files = o.report.filesTouched.length ? ` Files: ${o.report.filesTouched.join(", ")}.` : "";
      return [`[${d}] ${t.title} (${t.role} by ${o.soldier}): ${clip(o.report.summary, 600)}${files}`];
    });

  const start = (task: PlanTask) => {
    const assignment = opts.assignments.get(task.id)!;
    emit({ type: "start", task, soldier: assignment.soldier });
    const started = Date.now();
    const run = async (): Promise<Finished> => {
      let snapshot: { path: string; remove: () => Promise<void> } | undefined;
      try {
        let ctx: DispatchContext;
        if (task.role === "build") {
          ctx = { cwd: opts.repoRoot, baseRef: opts.integration.branch, context: contextFor(task) };
        } else {
          // Readers get their own detached copy of the run's work so far, which no merge can change under them.
          snapshot = await createSnapshot(opts.repoRoot, opts.shadowRoot, opts.integration.branch, `read-${opts.runId}-${task.id}`);
          ctx = { cwd: snapshot.path, context: contextFor(task) };
        }
        const report = await opts.dispatch(task, assignment, ctx);
        return { id: task.id, report, durationMs: Date.now() - started };
      } catch (error) {
        return { id: task.id, error, durationMs: Date.now() - started };
      } finally {
        await snapshot?.remove().catch(() => undefined);
      }
    };
    running.set(task.id, run());
  };

  const finish = async (f: Finished) => {
    const task = byId.get(f.id)!;
    const soldier = opts.assignments.get(f.id)!.soldier;
    let outcome: TaskOutcome;
    if (f.error !== undefined) {
      const refused = f.error instanceof SummonError;
      outcome = {
        taskId: f.id,
        soldier,
        status: refused ? "refused" : "error",
        reason: refused ? (f.error as Error).message : `unexpected failure: ${(f.error as Error)?.message ?? String(f.error)}`,
        merged: false,
        durationMs: f.durationMs,
      };
    } else {
      const report = f.report!;
      outcome = { taskId: f.id, soldier, status: report.status === "ok" ? "ok" : "error", report, merged: false, durationMs: f.durationMs };
      if (report.status !== "ok") outcome.reason = report.error ?? "the soldier reported an error";
      const ws = report.workspace;
      if (outcome.status === "ok" && ws?.commit) {
        const merged = await mergeInto(opts.integration, ws.branch, `shadow run ${opts.runId}: ${task.id} ${task.title} (${soldier})`);
        if (merged.ok) {
          outcome.merged = true;
          outcome.mergeCommit = merged.commit;
        } else {
          outcome.status = "conflict";
          outcome.reason = merged.reason;
        }
      }
      if (ws && !opts.keepWorktrees) {
        // The worktree is only scaffolding. A merged task branch goes too, since the run branch now holds
        // its commits; a branch that did not merge is kept so its work can still be inspected.
        await removeWorktree({
          repoRoot: opts.repoRoot,
          shadowRoot: opts.shadowRoot,
          name: basename(ws.path),
          deleteBranch: outcome.merged,
        }).catch(() => undefined);
      }
    }
    outcomes.set(f.id, outcome);
    emit({ type: "finish", task, outcome });
  };

  const pending = () => order.filter((id) => !outcomes.has(id) && !running.has(id));

  for (;;) {
    // Anything downstream of a task that did not succeed is skipped.
    for (const id of pending()) {
      const task = byId.get(id)!;
      const failed = task.dependsOn.find((d) => outcomes.has(d) && outcomes.get(d)!.status !== "ok");
      if (failed) {
        const reason = `depends on ${failed}, which ${outcomes.get(failed)!.status === "skipped" ? "was skipped" : `ended ${outcomes.get(failed)!.status}`}`;
        outcomes.set(id, { taskId: id, soldier: opts.assignments.get(id)!.soldier, status: "skipped", reason, merged: false });
        emit({ type: "skip", task, reason });
      }
    }

    // Start whatever is ready, in plan order, within the limits.
    for (const id of pending()) {
      if (running.size >= parallel) break;
      const task = byId.get(id)!;
      if (!task.dependsOn.every((d) => outcomes.get(d)?.status === "ok")) continue;
      if (task.role === "build") {
        const writers = [...running.keys()].map((r) => byId.get(r)!).filter((t) => t.role === "build");
        if (writers.some((w) => claimsOverlap(w.claims, task.claims))) continue;
      }
      start(task);
    }

    if (running.size === 0) break;
    const done = await Promise.race(running.values());
    running.delete(done.id);
    await finish(done);
  }

  // Validation rules out cycles, so this only catches a scheduling bug; never leave a task unaccounted for.
  for (const id of order) {
    if (!outcomes.has(id)) {
      outcomes.set(id, { taskId: id, soldier: opts.assignments.get(id)!.soldier, status: "skipped", reason: "could not be scheduled", merged: false });
    }
  }
  return order.map((id) => outcomes.get(id)!);
}
