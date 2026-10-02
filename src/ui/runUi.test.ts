import { afterEach, describe, expect, it, vi } from "vitest";
import { shippedRoster } from "../core/roster.testutil.js";
import { fakeArmy, monarchScript, planReply, synthesisReply } from "../monarch/fakes.testutil.js";
import { runGoal, type MonarchEvent } from "../monarch/monarch.js";
import type { PlanTask } from "../monarch/plan.js";
import { renderEvent, renderPlan } from "../monarch/render.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { liveScreensFor } from "./live.js";
import { createRunUi, type RunUiOptions } from "./runUi.js";
import { fakeTerminal, outcome, report, samplePlanned } from "./fixtures.testutil.js";

vi.setConfig({ testTimeout: 120_000 });

const planned = samplePlanned();
const [a, b, r] = planned.checked.plan.tasks as [PlanTask, PlanTask, PlanTask];
const events: MonarchEvent[] = [
  { type: "phase", message: "working on shadow/run/x" },
  { type: "branch", branch: "shadow/run/x" },
  { type: "start", task: a, soldier: "grok" },
  { type: "finish", task: a, outcome: outcome("a", { merged: true, durationMs: 2_000, report: report({ filesTouched: ["a.txt"] }) }) },
  { type: "start", task: b, soldier: "codex-sol" },
  { type: "finish", task: b, outcome: outcome("b", { soldier: "codex-sol", status: "error", reason: "it broke", durationMs: 1_000 }) },
  { type: "skip", task: r, reason: "b did not finish" },
];

/** A run UI drawing on a fake terminal, with the plan and plain lines written to the same terminal. */
function live(over: Partial<RunUiOptions> = {}) {
  const term = fakeTerminal();
  const ui = createRunUi({
    goal: "make two files and review them",
    live: true,
    log: term.writeLine,
    ask: async () => true,
    liveOptions: { stdout: term.stream, interactive: false, patchConsole: false },
    ...over,
  });
  return { ui, term };
}

describe("choosing live screens", () => {
  it("draws only on a terminal, and never with --plain or --json", () => {
    expect(liveScreensFor({ isTTY: true }, {})).toBe(true);
    expect(liveScreensFor({ isTTY: false }, {})).toBe(false);
    expect(liveScreensFor({}, {})).toBe(false);
    expect(liveScreensFor({ isTTY: true }, { plain: true })).toBe(false);
    expect(liveScreensFor({ isTTY: true }, { json: true })).toBe(false);
  });
});

describe("plain output", () => {
  it("prints the same lines as before, one per event, and the plan before asking", async () => {
    const lines: string[] = [];
    const asked: string[] = [];
    const ui = createRunUi({
      goal: "g",
      live: false,
      log: (l) => lines.push(l),
      ask: async () => {
        asked.push(lines.join("\n"));
        return true;
      },
    });
    ui.onEvent({ type: "phase", message: "codex-astra is planning" });
    expect(await ui.confirm(planned)).toBe(true);
    for (const e of events) ui.onEvent(e);
    await ui.finish();
    expect(asked[0]).toContain(renderPlan(planned));
    expect(lines).toEqual([
      ".. codex-astra is planning",
      `\n${renderPlan(planned)}`,
      ...events.map(renderEvent).filter((l) => l !== undefined),
    ]);
    // The branch is already in the phase line, so it adds none of its own.
    expect(lines.some((l) => l.includes("undefined"))).toBe(false);
  });
});

describe("live screens", () => {
  it("shows the steps, then the plan and the question, then the dashboard until finish", async () => {
    const { ui, term } = live();
    ui.onEvent({ type: "phase", message: "checking which soldiers are installed" });
    ui.onEvent({ type: "phase", message: "codex-astra is planning" });
    expect(await ui.confirm(planned)).toBe(true);
    for (const e of events) ui.onEvent(e);
    await ui.finish();

    const out = term.text();
    const steps = out.indexOf("✓ codex-astra is planning");
    const plan = out.indexOf("Plan by codex-astra");
    const dashboard = out.indexOf("SHADOW ARMY");
    expect(out).toContain("· checking which soldiers are installed");
    expect(steps).toBeGreaterThanOrEqual(0);
    expect(plan).toBeGreaterThan(steps);
    expect(dashboard).toBeGreaterThan(plan);
    const frame = out.slice(dashboard);
    expect(frame).toMatch(/Finished\s+3\/3 done/);
    expect(frame).toContain("Branch: shadow/run/x");
    expect(frame).toMatch(/a\s+grok\s+build\s+done\s+0:02\s+merged, 1 file/);
    expect(frame).toMatch(/b\s+codex-sol\s+build\s+failed\s+0:01\s+it broke/);
    expect(frame).toMatch(/r\s+claude-opus\s+review\s+skipped\s+b did not finish/);
  });

  it("asks before any dashboard appears, and draws none when the plan is declined", async () => {
    const { ui, term } = live({ ask: async () => false });
    ui.onEvent({ type: "phase", message: "codex-astra is planning" });
    expect(await ui.confirm(planned)).toBe(false);
    await ui.finish();
    expect(term.text()).toContain("Plan by codex-astra");
    expect(term.text()).not.toContain("SHADOW ARMY");
  });

  it("releases the terminal and says so when the run fails, before or after approval", async () => {
    const before = live();
    before.ui.onEvent({ type: "phase", message: "codex-astra is planning" });
    await before.ui.finish(true);
    expect(before.term.text()).toContain("✗ codex-astra is planning");

    const after = live();
    await after.ui.confirm(planned);
    after.ui.onEvent(events[2]!);
    await after.ui.finish(true);
    await after.ui.finish(true); // safe to call twice
    expect(after.term.text()).toContain("Stopped by an error");
    expect(after.term.text().match(/SHADOW ARMY/g)).toHaveLength(1);
  });

  it("redraws as time passes, without waiting for an event", async () => {
    let now = 0;
    const term = fakeTerminal();
    const ui = createRunUi({
      goal: "g",
      live: true,
      log: term.writeLine,
      ask: async () => true,
      liveOptions: { stdout: term.stream, interactive: true, patchConsole: false, tickMs: 10, clock: () => now },
    });
    await ui.confirm(planned);
    ui.onEvent(events[2]!);
    now = 7_000;
    await vi.waitFor(() => expect(term.text()).toMatch(/a\s+grok\s+build\s+running\s+0:07/), { timeout: 5_000, interval: 20 });
    await ui.finish();
  });
});

describe("a whole run on the dashboard", () => {
  const repos: ReturnType<typeof makeRepo>[] = [];
  afterEach(() => {
    while (repos.length) repos.pop()!.cleanup();
  });

  it("draws a real run's final state, failures included, after the plan is approved", async () => {
    const repo = makeRepo({ "README.md": "hello\n" });
    repos.push(repo);
    const roster = shippedRoster();
    const m = monarchScript({
      plans: [
        planReply([
          { id: "a", title: "one", role: "build", soldier: "grok", claims: ["one.txt"], brief: "write one.txt=1" },
          { id: "b", title: "two", role: "build", soldier: "codex-sol", claims: ["two.txt"], brief: "fail" },
          { id: "r", title: "review", role: "review", dependsOn: ["a", "b"], brief: "read one.txt" },
        ]),
      ],
      synthesis: synthesisReply({ summary: "one of two", followUps: [], noteDecisions: [] }),
    });
    const { ui, term } = live();
    const result = await runGoal({
      goal: "make two files and review them",
      cwd: repo.dir,
      roster,
      isInstalled: () => true,
      getAdapter: m.getAdapter,
      dispatch: fakeArmy(roster).dispatch,
      useVault: false,
      onEvent: ui.onEvent,
      confirm: ui.confirm,
    });
    await ui.finish();

    expect(result.outcomes.map((o) => [o.taskId, o.status])).toEqual([["a", "ok"], ["b", "error"], ["r", "skipped"]]);
    const out = term.text();
    expect(out.indexOf("✓ codex-astra is planning")).toBeLessThan(out.indexOf("Plan by codex-astra"));
    const frame = out.slice(out.indexOf("SHADOW ARMY"));
    expect(frame).toContain(`run ${result.runId}  Monarch codex-astra`);
    expect(frame).toContain(`Branch: ${result.integration!.branch}`);
    expect(frame).toMatch(/Finished\s+3\/3 done/);
    expect(frame).toMatch(/a\s+grok\s+build\s+done\s+\d+:\d\d\s+merged, 1 file/);
    expect(frame).toMatch(/b\s+codex-sol\s+build\s+failed\s+\d+:\d\d\s+it broke/);
    expect(frame).toMatch(/r\s+claude-opus\s+review\s+skipped/);
  });
});
