// The shadow app's keys as a pure reducer, so they are tested without Ink. Fixtures only: no post office, no processes.
// From the frames: esc returns to live, ctrl+x tab moves focus, 1-3 answer the card, t shows the ledger.
// Chosen (the frames do not show them): n shows the needs-you card, r opens the replay.

export type Screen = "work" | "needs" | "summary" | "ledger" | "replay";
export type Focus = "pane" | "claude";

export interface KeyState {
  screen: Screen;
  focus: Focus;
  /** ctrl+x was pressed; the next tab moves focus. */
  prefix: boolean;
  /** Fixture answers recorded from the needs-you card (1-3). */
  answers: number[];
  quit?: boolean;
}

/** The parts of Ink's Key this reducer reads. */
export interface Keys { ctrl?: boolean; escape?: boolean; tab?: boolean }

export const INITIAL: KeyState = { screen: "work", focus: "pane", prefix: false, answers: [] };

export function press(state: KeyState, input: string, key: Keys): KeyState {
  if (key.ctrl && input === "c") return { ...state, quit: true };
  if (key.ctrl && input === "x") return { ...state, prefix: true };
  if (state.prefix) {
    const base = { ...state, prefix: false };
    return key.tab ? { ...base, focus: state.focus === "pane" ? "claude" : "pane" } : base;
  }
  if (state.focus !== "pane") return state;
  if (input === "q") return { ...state, quit: true };
  if (key.escape) {
    if (state.screen === "ledger") return { ...state, screen: "summary" };
    return state.screen === "work" || state.screen === "summary" ? state : { ...state, screen: "work" };
  }
  if (state.screen === "needs" && (input === "1" || input === "2" || input === "3")) {
    return { ...state, screen: "summary", answers: [...state.answers, Number(input)] };
  }
  if (input === "n" && state.screen === "work") return { ...state, screen: "needs" };
  if (input === "t" && state.screen === "summary") return { ...state, screen: "ledger" };
  if (input === "t" && state.screen === "ledger") return { ...state, screen: "summary" };
  if (input === "r" && state.screen !== "needs" && state.screen !== "replay") return { ...state, screen: "replay" };
  return state;
}
