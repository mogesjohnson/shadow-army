import { describe, expect, it } from "vitest";
import type { PlanTask } from "../monarch/plan.js";
import { applyEvent, doneCount, formatElapsed, MAX_ACTIVITY, STATUS_WORD, viewFromPlan, type RunView } from "./runView.js";
import { outcome, report, samplePlanned } from "./fixtures.testutil.js";

const planned = samplePlanned();
const [a, b, r] = planned.checked.plan.tasks as [PlanTask, PlanTask, PlanTask];
const start = () => viewFromPlan(planned, "make two files and review them", 1_000);

describe("the run view", () => {
  it("starts with every task waiting, in run order, with its soldier", () => {
    const view = start();
    expect(view).toMatchObject({ runId: "20261002-abc123", monarch: "codex-astra", goal: "make two files and review them", phase: "starting", startedAt: 1_000, costUsd: 0, activity: [] });
    expect(view.ended).toBeUndefined();
    expect(view.tasks.map((t) => [t.id, t.soldier, t.role, t.status])).toEqual([
      ["a", "grok", "build", "waiting"],
      ["b", "codex-sol", "build", "waiting"],
      ["r", "claude-opus", "review", "waiting"],
    ]);
  });

  it("follows a run's events: branch, phase, start, finish, skip", () => {
    let view = start();
    view = applyEvent(view, { type: "phase", message: "working on shadow/run/x" }, 1_100);
    view = applyEvent(view, { type: "branch", branch: "shadow/run/x" }, 1_100);
    expect(view).toMatchObject({ phase: "working on shadow/run/x", branch: "shadow/run/x" });
    // The branch has no plain line of its own; only the phase line is activity.
    expect(view.activity).toEqual([".. working on shadow/run/x"]);

    view = applyEvent(view, { type: "start", task: a, soldier: "grok" }, 2_000);
    expect(view.tasks[0]).toMatchObject({ status: "running", startedAt: 2_000 });
    expect(view.phase).toBe("working");

    view = applyEvent(view, { type: "finish", task: a, outcome: outcome("a", { merged: true, durationMs: 4_000, report: report({ filesTouched: ["a.txt", "b.txt"], costUsd: 0.02 }) }) }, 6_000);
    view = applyEvent(view, { type: "finish", task: b, outcome: outcome("b", { soldier: "codex-sol", status: "error", reason: "it broke", durationMs: 500, report: report({ status: "error", costUsd: 0.01 }) }) }, 6_000);
    view = applyEvent(view, { type: "skip", task: r, reason: "b did not finish" }, 6_000);

    expect(view.tasks.map((t) => [t.id, t.status, t.detail])).toEqual([
      ["a", "ok", "merged, 2 files"],
      ["b", "error", "it broke"],
      ["r", "skipped", "b did not finish"],
    ]);
    expect(view.tasks[0]!.durationMs).toBe(4_000);
    expect(view.costUsd).toBeCloseTo(0.03);
    expect(doneCount(view)).toBe(3);
    expect(view.activity.at(-1)).toBe("-- r skipped: b did not finish");
  });

  it("says what an ok task did: merged, no changes, reverted edits, or its summary", () => {
    const finish = (t: PlanTask, o: Parameters<typeof outcome>[1]) =>
      applyEvent(start(), { type: "finish", task: t, outcome: outcome(t.id, o) }, 2_000).tasks.find((x) => x.id === t.id)!.detail;
    expect(finish(a, { merged: true, report: report({ filesTouched: ["a.txt"] }) })).toBe("merged, 1 file");
    expect(finish(a, { report: report() })).toBe("no changes");
    expect(finish(a, { merged: true, report: report({ filesTouched: ["a.txt"], workspace: { outOfScope: ["README.md"] } as never }) })).toBe(
      "merged, 1 file; reverted out-of-scope: README.md",
    );
    expect(finish(r, { report: report({ summary: "both files\n  look right" }) })).toBe("both files look right");
    expect(finish(a, { status: "refused", reason: `${"x".repeat(200)}` })).toHaveLength(120);
  });

  it("never changes the view it was given", () => {
    const before = start();
    const copy = structuredClone(before);
    applyEvent(before, { type: "start", task: a, soldier: "grok" }, 2_000);
    applyEvent(before, { type: "phase", message: "x" }, 2_000);
    expect(before).toEqual(copy);
  });

  it(`keeps only the last ${MAX_ACTIVITY} activity lines`, () => {
    let view: RunView = start();
    for (let i = 0; i < MAX_ACTIVITY + 3; i++) view = applyEvent(view, { type: "phase", message: `step ${i}` }, 1_000);
    expect(view.activity).toHaveLength(MAX_ACTIVITY);
    expect(view.activity[0]).toBe(".. step 3");
    expect(view.activity.at(-1)).toBe(`.. step ${MAX_ACTIVITY + 2}`);
  });

  it("names every status in a different word, so color is never the only signal", () => {
    const words = Object.values(STATUS_WORD);
    expect(new Set(words).size).toBe(words.length);
    expect(STATUS_WORD).toMatchObject({ waiting: "waiting", running: "running", ok: "done", error: "failed", refused: "refused", conflict: "conflict", skipped: "skipped" });
  });

  it("formats elapsed time as m:ss, and h:mm:ss past an hour", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(-5)).toBe("0:00");
    expect(formatElapsed(61_900)).toBe("1:01");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
  });
});
