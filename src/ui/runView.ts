import type { MonarchEvent, PlannedRun } from "../monarch/monarch.js";
import { renderEvent } from "../monarch/render.js";

/** A task's state as the dashboard shows it. */
export type ViewStatus = "waiting" | "running" | "ok" | "error" | "refused" | "conflict" | "skipped";

/** Every status in words, so the dashboard reads the same without color. */
export const STATUS_WORD: Record<ViewStatus, string> = {
  waiting: "waiting",
  running: "running",
  ok: "done",
  error: "failed",
  refused: "refused",
  conflict: "conflict",
  skipped: "skipped",
};

export interface TaskRow {
  id: string;
  title: string;
  role: string;
  soldier: string;
  status: ViewStatus;
  startedAt?: number;
  durationMs?: number;
  /** What happened, once it has: merged files, the failure reason, why it was skipped. */
  detail?: string;
}

export interface RunView {
  runId: string;
  goal: string;
  monarch: string;
  branch?: string;
  phase: string;
  startedAt: number;
  tasks: TaskRow[];
  /** The latest activity lines, oldest first. */
  activity: string[];
  costUsd: number;
  /** Set once the run is over: it finished, or an error stopped it. */
  ended?: "done" | "failed";
}

export const MAX_ACTIVITY = 6;

const clip = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** m:ss, or h:mm:ss past an hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The view at the moment a plan is approved: every task waiting, in the order it will run. */
export function viewFromPlan(
  planned: Pick<PlannedRun, "runId" | "monarch" | "checked" | "assignments">,
  goal: string,
  now: number,
): RunView {
  const byId = new Map(planned.checked.plan.tasks.map((t) => [t.id, t]));
  return {
    runId: planned.runId,
    goal,
    monarch: planned.monarch,
    phase: "starting",
    startedAt: now,
    tasks: planned.checked.order.map((id) => ({
      id,
      title: byId.get(id)!.title,
      role: byId.get(id)!.role,
      soldier: planned.assignments.get(id)!.soldier,
      status: "waiting",
    })),
    activity: [],
    costUsd: 0,
  };
}

const withActivity = (activity: string[], line: string | undefined) =>
  line ? [...activity, line].slice(-MAX_ACTIVITY) : activity;

/** Apply one run event. Pure: returns a new view and never changes the old one. */
export function applyEvent(view: RunView, e: MonarchEvent, now: number): RunView {
  const activity = withActivity(view.activity, renderEvent(e));
  const update = (id: string, change: Partial<TaskRow>) =>
    view.tasks.map((t) => (t.id === id ? { ...t, ...change } : t));

  switch (e.type) {
    case "usage":
      // Tokens are totalled in the report and the status line, not on the dashboard.
      return view;
    case "branch":
      return { ...view, branch: e.branch, activity };
    case "phase":
      return { ...view, phase: e.message, activity };
    case "start":
      return { ...view, phase: "working", tasks: update(e.task.id, { status: "running", startedAt: now }), activity };
    case "skip":
      return { ...view, tasks: update(e.task.id, { status: "skipped", detail: clip(e.reason, 120) }), activity };
    case "finish": {
      const o = e.outcome;
      let detail: string;
      if (o.status === "ok") {
        const files = o.report?.filesTouched.length ?? 0;
        const scope = o.report?.workspace?.outOfScope.length ? `; reverted out-of-scope: ${o.report.workspace.outOfScope.join(", ")}` : "";
        detail = o.merged
          ? `merged, ${files} file${files === 1 ? "" : "s"}${scope}`
          : e.task.role === "build"
            ? `no changes${scope}`
            : clip(o.report?.summary ?? "", 120);
      } else {
        detail = clip(o.reason ?? "", 120);
      }
      return {
        ...view,
        tasks: update(o.taskId, { status: o.status, durationMs: o.durationMs, detail }),
        costUsd: view.costUsd + (o.report?.costUsd ?? 0),
        activity,
      };
    }
  }
}

export const doneCount = (view: RunView) => view.tasks.filter((t) => t.status !== "waiting" && t.status !== "running").length;
