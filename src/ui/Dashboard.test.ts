import React from "react";
import { renderToString } from "ink";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { RunDashboard, StepsView, WorkingLine } from "./Dashboard.js";
import { applyEvent, viewFromPlan, type RunView, type ViewStatus } from "./runView.js";
import { outcome, report, samplePlanned } from "./fixtures.testutil.js";

const draw = (view: RunView, now: number, columns = 100) =>
  stripVTControlCharacters(renderToString(React.createElement(RunDashboard, { view, now, tick: 0 }), { columns }));

/** The sample run partway: a merged, b running for 5s, r waiting. */
function midRun(): RunView {
  const planned = samplePlanned();
  const [a, b] = planned.checked.plan.tasks;
  let view = viewFromPlan(planned, "make two files and review them", 0);
  view = applyEvent(view, { type: "phase", message: "working on shadow/run/20261002-abc123" }, 0);
  view = applyEvent(view, { type: "branch", branch: "shadow/run/20261002-abc123" }, 0);
  view = applyEvent(view, { type: "start", task: a!, soldier: "grok" }, 0);
  view = applyEvent(view, { type: "start", task: b!, soldier: "codex-sol" }, 1_000);
  view = applyEvent(view, { type: "finish", task: a!, outcome: outcome("a", { merged: true, durationMs: 3_000, report: report({ filesTouched: ["a.txt", "x.txt"], costUsd: 0.0123 }) }) }, 3_000);
  return view;
}

const row = (frame: string, id: string) => frame.split("\n").find((l) => new RegExp(`^│ \\S\\s+${id}\\s`).test(l)) ?? "";

describe("the run dashboard", () => {
  it("shows the header, goal, branch, progress, elapsed time, cost, task rows and activity", () => {
    const frame = draw(midRun(), 6_000);
    expect(frame).toContain("SHADOW ARMY");
    expect(frame).toContain("run 20261002-abc123  Monarch codex-astra");
    expect(frame).toContain("Goal: make two files and review them");
    expect(frame).toContain("Branch: shadow/run/20261002-abc123");
    expect(frame).toMatch(/working\s+1\/3 done {2}0:06 {2}\$0\.0123/);
    expect(row(frame, "a")).toMatch(/✓\s+a\s+grok\s+build\s+done\s+0:03\s+merged, 2 files/);
    expect(row(frame, "b")).toMatch(/b\s+codex-sol\s+build\s+running\s+0:05\s+write the second file/);
    expect(row(frame, "r")).toMatch(/·\s+r\s+claude-opus\s+review\s+waiting\s+review both files/);
    expect(frame).toContain("Activity");
    expect(frame).toContain(">> b codex-sol: write the second file");
    expect(frame).toContain("ok a grok in 3s, merged (2 files)");
    // A rounded border around all of it.
    expect(frame.split("\n")[0]).toMatch(/^╭─+╮$/);
  });

  it("puts every status into words beside its mark", () => {
    const statuses: ViewStatus[] = ["waiting", "running", "ok", "error", "refused", "conflict", "skipped"];
    const view = viewFromPlan(samplePlanned(), "g", 0);
    view.tasks = statuses.map((status, i) => ({ id: `t${i}`, title: "x", role: "build", soldier: "grok", status }));
    const frame = draw(view, 0);
    const words = statuses.map((_, i) => row(frame, `t${i}`).split(/\s+/)[5]);
    expect(words).toEqual(["waiting", "running", "done", "failed", "refused", "conflict", "skipped"]);
  });

  it("says how the run ended", () => {
    expect(draw({ ...midRun(), ended: "done" }, 9_000)).toMatch(/Finished\s+1\/3 done {2}0:09/);
    expect(draw({ ...midRun(), ended: "failed" }, 9_000)).toContain("Stopped by an error");
  });

  it("fits a narrow terminal by cutting long text, never by wrapping past the edge", () => {
    const view = { ...midRun(), goal: "a very long goal ".repeat(20) };
    const frame = draw(view, 6_000, 60);
    for (const line of frame.split("\n")) expect(line.length).toBeLessThanOrEqual(60);
    expect(frame).toContain("…");
    expect(frame.split("\n").filter((l) => l.includes("Goal:"))).toHaveLength(1);
  });
});

describe("the waiting lines", () => {
  it("shows a spinner while waiting and a mark once done, with the time taken", () => {
    const line = (done?: "ok" | "error") =>
      stripVTControlCharacters(renderToString(React.createElement(WorkingLine, { work: { label: "grok [build] is working", startedAt: 0, done }, now: 65_000, tick: 3 })));
    expect(line()).toBe("⠸ grok [build] is working  1:05");
    expect(line("ok")).toBe("✓ grok [build] is working  1:05");
    expect(line("error")).toBe("✗ grok [build] is working  1:05");
  });

  it("keeps the steps already passed above the current one", () => {
    const steps = { past: ["checking which soldiers are installed", "reading the delegation guide"], current: { label: "codex-astra is planning", startedAt: 0 } };
    const frame = stripVTControlCharacters(renderToString(React.createElement(StepsView, { steps, now: 2_000, tick: 0 })));
    expect(frame.split("\n")).toEqual([
      "· checking which soldiers are installed",
      "· reading the delegation guide",
      "⠋ codex-astra is planning  0:02",
    ]);
  });
});
