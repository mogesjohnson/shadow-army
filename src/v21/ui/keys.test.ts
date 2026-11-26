import { describe, expect, it } from "vitest";
import { INITIAL, press, type Keys, type KeyState } from "./keys.js";

const none: Keys = {};
const run = (s: KeyState, ...inputs: [string, Keys?][]): KeyState => inputs.reduce((a, [i, k]) => press(a, i, k ?? none), s);

describe("v2.1 key reducer", () => {
  it("starts on the work screen with the pane focused", () => {
    expect(INITIAL).toEqual({ screen: "work", focus: "pane", prefix: false, answers: [] });
  });
  it("n shows the needs-you card and 1-3 record the choice then show the summary", () => {
    const s = run(INITIAL, ["n"], ["2"]);
    expect(s.screen).toBe("summary");
    expect(s.answers).toEqual([2]);
  });
  it("ignores 1-3 outside the card, and 4 on it", () => {
    expect(press(INITIAL, "1", none)).toBe(INITIAL);
    expect(press(press(INITIAL, "n", none), "4", none).screen).toBe("needs");
  });
  it("t flips summary and ledger; esc leaves the ledger for the summary", () => {
    const s = run(INITIAL, ["n"], ["1"], ["t"]);
    expect(s.screen).toBe("ledger");
    expect(press(s, "t", none).screen).toBe("summary");
    expect(press(s, "", { escape: true }).screen).toBe("summary");
  });
  it("r opens the replay and esc returns to live", () => {
    const s = run(INITIAL, ["r"]);
    expect(s.screen).toBe("replay");
    expect(press(s, "", { escape: true }).screen).toBe("work");
  });
  it("esc on the card goes back to live; on live it does nothing", () => {
    expect(run(INITIAL, ["n"], ["", { escape: true }]).screen).toBe("work");
    expect(press(INITIAL, "", { escape: true })).toBe(INITIAL);
  });
  it("ctrl+x then tab moves focus to the pane or back; other keys are ignored while away", () => {
    const away = run(INITIAL, ["x", { ctrl: true }], ["", { tab: true }]);
    expect(away.focus).toBe("claude");
    expect(press(away, "r", none)).toBe(away);
    expect(run(away, ["x", { ctrl: true }], ["", { tab: true }]).focus).toBe("pane");
    expect(run(INITIAL, ["x", { ctrl: true }], ["r"]).prefix).toBe(false);
  });
  it("q and ctrl+c quit", () => {
    expect(press(INITIAL, "q", none).quit).toBe(true);
    expect(press(INITIAL, "c", { ctrl: true }).quit).toBe(true);
  });
});
