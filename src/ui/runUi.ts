import React from "react";
import type { MonarchEvent, PlannedRun } from "../monarch/monarch.js";
import { renderEvent, renderPlan } from "../monarch/render.js";
import { RunDashboard, StepsView, type Steps } from "./Dashboard.js";
import { startLive, type Live, type LiveOptions } from "./live.js";
import { applyEvent, viewFromPlan, type RunView } from "./runView.js";

export interface RunUiOptions {
  goal: string;
  /** Draw live screens. Otherwise every event is one plain line, as before. */
  live: boolean;
  /** Where plain lines and the plan go. */
  log: (line: string) => void;
  /** Ask whether to run the plan; it has been printed by then. */
  ask: (planned: PlannedRun) => Promise<boolean>;
  liveOptions?: LiveOptions;
}

export interface RunUi {
  onEvent(e: MonarchEvent): void;
  confirm(planned: PlannedRun): Promise<boolean>;
  /**
   * Take any live screen down, leaving its last frame. Call it before printing the result, and after
   * an error too, so the terminal is released either way. Safe to call twice.
   */
  finish(failed?: boolean): Promise<void>;
}

/**
 * `sa run`'s screen. Before approval: the steps so far with a spinner on the current one. The plan and
 * the question are plain text. After approval: the dashboard, until `finish`.
 */
export function createRunUi(opts: RunUiOptions): RunUi {
  const clock = opts.liveOptions?.clock ?? Date.now;
  let steps: { live: Live<Steps>; state: Steps } | undefined;
  let dashboard: { live: Live<RunView>; view: RunView } | undefined;

  const stopSteps = async (failed: boolean) => {
    if (!steps) return;
    const { live, state } = steps;
    steps = undefined;
    await live.stop({ ...state, current: { ...state.current, done: failed ? "error" : "ok" } });
  };

  const onStep = (message: string) => {
    if (!steps) {
      const state: Steps = { past: [], current: { label: message, startedAt: clock() } };
      steps = { live: startLive(state, (s, now, tick) => React.createElement(StepsView, { steps: s, now, tick }), opts.liveOptions), state };
      return;
    }
    steps.state = { past: [...steps.state.past, steps.state.current.label], current: { label: message, startedAt: clock() } };
    steps.live.update(steps.state);
  };

  return {
    onEvent(e) {
      if (!opts.live) {
        const line = renderEvent(e);
        if (line) opts.log(line);
        return;
      }
      if (dashboard) {
        dashboard.view = applyEvent(dashboard.view, e, clock());
        dashboard.live.update(dashboard.view);
      } else if (e.type === "phase") {
        onStep(e.message);
      }
    },

    async confirm(planned) {
      await stopSteps(false);
      opts.log(`\n${renderPlan(planned)}`);
      const ok = await opts.ask(planned);
      if (ok && opts.live) {
        opts.log("");
        const view = viewFromPlan(planned, opts.goal, clock());
        dashboard = {
          live: startLive(view, (v, now, tick) => React.createElement(RunDashboard, { view: v, now, tick }), opts.liveOptions),
          view,
        };
      }
      return ok;
    },

    async finish(failed = false) {
      await stopSteps(failed);
      if (!dashboard) return;
      const { live, view } = dashboard;
      dashboard = undefined;
      await live.stop({ ...view, ended: failed ? "failed" : "done" });
    },
  };
}
