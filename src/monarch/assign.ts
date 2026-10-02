import type { Adapter, Effort } from "../adapters/Adapter.js";
import { route } from "../core/router.js";
import type { Roster } from "../core/roster.js";
import { ancestors, type CheckedPlan, type Parsed } from "./plan.js";

export interface TaskAssignment {
  taskId: string;
  soldier: string;
  effort: Effort;
  /** Why this soldier: the Monarch's pick, or why the router overrode it. */
  reason: string;
  /** Set when the Monarch preferred someone else and the rules said no. */
  overridden?: { wanted: string; because: string };
}

/**
 * Give every task a soldier. The Monarch's preference is used only when the router allows it: the
 * router has the final word, so the hard rules hold however the plan was written. A review task never
 * goes to a soldier that built any of the work it reviews.
 */
export function assignTasks(
  checked: CheckedPlan,
  roster: Roster,
  getAdapter: (cli: string) => Adapter | undefined,
  isInstalled: (cli: string) => boolean,
): Parsed<Map<string, TaskAssignment>> {
  const { plan, order } = checked;
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const assignments = new Map<string, TaskAssignment>();
  const errors: string[] = [];

  for (const id of order) {
    const task = byId.get(id)!;
    const authors =
      task.role === "review"
        ? [...ancestors(plan, id)]
            .filter((a) => byId.get(a)?.role === "build")
            .map((a) => assignments.get(a)?.soldier)
            .filter((s): s is string => Boolean(s))
        : [];
    const result = route(
      roster,
      getAdapter,
      { role: task.role, difficulty: task.difficulty, write: task.role === "build", authors },
      isInstalled,
    );
    const top = result.candidates[0];
    if (!top) {
      const why = result.excluded.map((e) => `${e.soldier}: ${e.reason}`).join("; ");
      errors.push(`nobody may take ${task.role} task "${id}" (${why})`);
      continue;
    }

    const wanted = task.soldier;
    const pick = wanted ? result.candidates.find((c) => c.soldier === wanted) : undefined;
    if (pick) {
      assignments.set(id, { taskId: id, soldier: pick.soldier, effort: pick.effort, reason: "the Monarch's choice" });
      continue;
    }
    let because = "";
    if (wanted) {
      const ex = result.excluded.find((e) => e.soldier === wanted);
      because = ex ? ex.reason : roster.soldiers.has(wanted) ? "not eligible" : "no such soldier";
    }
    assignments.set(id, {
      taskId: id,
      soldier: top.soldier,
      effort: top.effort,
      reason: `router's first choice: ${top.reasons.join("; ")}`,
      ...(wanted ? { overridden: { wanted, because } } : {}),
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: assignments };
}
