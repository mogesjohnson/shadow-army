import type { ReactElement } from "react";
import { render, type RenderOptions } from "ink";

export type LiveOptions = Pick<RenderOptions, "stdout" | "patchConsole" | "interactive"> & {
  /** How often to redraw for spinners and clocks, in ms. */
  tickMs?: number;
  clock?: () => number;
};

/** Live screens need a terminal on stdout, and --plain and --json turn them off. */
export const liveScreensFor = (stdout: { isTTY?: boolean }, flags: { plain?: boolean; json?: boolean }): boolean =>
  Boolean(stdout.isTTY) && !flags.plain && !flags.json;

export interface Live<S> {
  update(state: S): void;
  /** Draw the last frame, leave it on screen, and release the terminal. Safe to call twice. */
  stop(final?: S): Promise<void>;
}

/**
 * Keep `draw(state)` on screen until `stop`, redrawing on every update and every tick. Ink owns the
 * terminal meanwhile, so nothing else may write to this stdout until `stop` resolves.
 */
export function startLive<S>(
  initial: S,
  draw: (state: S, now: number, tick: number) => ReactElement,
  opts: LiveOptions = {},
): Live<S> {
  const clock = opts.clock ?? Date.now;
  let state = initial;
  let tick = 0;
  let stopped = false;
  const frame = () => draw(state, clock(), tick);
  // Ink spreads these over its defaults, so an undefined value would replace a default: leave unset keys out.
  const inkOptions: RenderOptions = {};
  if (opts.stdout) inkOptions.stdout = opts.stdout;
  if (opts.patchConsole !== undefined) inkOptions.patchConsole = opts.patchConsole;
  if (opts.interactive !== undefined) inkOptions.interactive = opts.interactive;
  const app = render(frame(), inkOptions);
  const timer = setInterval(() => {
    tick++;
    app.rerender(frame());
  }, opts.tickMs ?? 120);
  timer.unref();
  return {
    update(next) {
      if (stopped) return;
      state = next;
      app.rerender(frame());
    },
    async stop(final) {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      if (final !== undefined) state = final;
      app.rerender(frame());
      app.unmount();
      await app.waitUntilExit();
    },
  };
}
