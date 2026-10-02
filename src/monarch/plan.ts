import { z } from "zod";
import { ClaimError, validateClaims } from "../workspace/claims.js";

export const PLAN_FENCE = "shadow-plan";
export const DEFAULT_MAX_TASKS = 6;

/** One task as the Monarch writes it. `orchestrate` is not a task role: planning is the Monarch's job. */
const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  role: z.enum(["build", "review", "research", "test"]),
  difficulty: z.enum(["routine", "hard"]).default("routine"),
  /** The Monarch's preferred soldier. The router may override it to respect the rules. */
  soldier: z.string().optional(),
  claims: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]),
  brief: z.string().min(1),
});

const PlanSchema = z.object({
  summary: z.string().default(""),
  tasks: z.array(TaskSchema),
});

export type PlanTask = z.infer<typeof TaskSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** The last fenced block of a given kind in a model's reply, or undefined. */
export function lastFencedBlock(text: string, fence: string): string | undefined {
  const re = new RegExp("```" + fence + "\\s*([\\s\\S]*?)```", "g");
  let last: string | undefined;
  for (const m of text.matchAll(re)) last = m[1];
  return last;
}

export function parsePlan(text: string): Parsed<Plan> {
  const block = lastFencedBlock(text, PLAN_FENCE);
  if (block === undefined) return { ok: false, errors: [`no \`\`\`${PLAN_FENCE} block in the reply`] };
  let raw: unknown;
  try {
    raw = JSON.parse(block);
  } catch (e) {
    return { ok: false, errors: [`the ${PLAN_FENCE} block is not valid JSON: ${(e as Error).message}`] };
  }
  const parsed = PlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`),
    };
  }
  return { ok: true, value: parsed.data };
}

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export interface CheckedPlan {
  plan: Plan;
  /** Task ids in an order where every task comes after the tasks it depends on. */
  order: string[];
}

/**
 * Structural checks the Monarch's plan must pass before anything runs: safe unique ids, known
 * dependencies, no cycles, claims exactly where writing happens, and a bounded size. Claims come
 * back normalized.
 */
export function checkPlan(plan: Plan, maxTasks = DEFAULT_MAX_TASKS): Parsed<CheckedPlan> {
  const errors: string[] = [];
  if (plan.tasks.length > maxTasks) {
    errors.push(`the plan has ${plan.tasks.length} tasks; the limit is ${maxTasks}. Combine tasks.`);
  }

  const ids = new Set<string>();
  for (const t of plan.tasks) {
    if (!TASK_ID.test(t.id)) errors.push(`task id ${JSON.stringify(t.id)} must be letters, digits, - or _ (max 32)`);
    if (ids.has(t.id)) errors.push(`task id "${t.id}" is used twice`);
    ids.add(t.id);
  }

  const tasks: PlanTask[] = [];
  for (const t of plan.tasks) {
    for (const d of t.dependsOn) {
      if (d === t.id) errors.push(`task "${t.id}" depends on itself`);
      else if (!ids.has(d)) errors.push(`task "${t.id}" depends on unknown task "${d}"`);
    }
    let claims = t.claims;
    if (t.role === "build") {
      if (claims.length === 0) {
        errors.push(`build task "${t.id}" must list the files it may change in "claims"`);
      } else {
        try {
          claims = validateClaims(claims);
        } catch (e) {
          if (!(e instanceof ClaimError)) throw e;
          errors.push(`build task "${t.id}": ${e.message}`);
        }
      }
    } else if (claims.length) {
      errors.push(`${t.role} task "${t.id}" changes no files, so it must not have "claims"`);
    }
    tasks.push({ ...t, claims });
  }

  // Kahn's algorithm, in plan order among the tasks that are ready.
  const order: string[] = [];
  const pending = new Map(tasks.map((t) => [t.id, new Set(t.dependsOn.filter((d) => ids.has(d) && d !== t.id))]));
  while (pending.size) {
    const ready = tasks.find((t) => pending.has(t.id) && pending.get(t.id)!.size === 0);
    if (!ready) {
      errors.push(`the dependencies form a cycle among: ${[...pending.keys()].join(", ")}`);
      break;
    }
    order.push(ready.id);
    pending.delete(ready.id);
    for (const deps of pending.values()) deps.delete(ready.id);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { plan: { ...plan, tasks }, order } };
}

/** Every task `id` depends on, directly or not. */
export function ancestors(plan: Plan, id: string): Set<string> {
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [...(byId.get(id)?.dependsOn ?? [])];
  while (stack.length) {
    const d = stack.pop()!;
    if (seen.has(d)) continue;
    seen.add(d);
    stack.push(...(byId.get(d)?.dependsOn ?? []));
  }
  return seen;
}
