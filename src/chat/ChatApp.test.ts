import React from "react";
import { render } from "ink";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shippedRoster } from "../core/roster.testutil.js";
import { fakeArmy, monarchScript, planReply } from "../monarch/fakes.testutil.js";
import type { RunGoalOptions, RunResult } from "../monarch/monarch.js";
import { fakeTerminal, samplePlanned } from "../ui/fixtures.testutil.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { ChatApp } from "./ChatApp.js";
import { ChatSession, type ChatDeps } from "./session.js";

vi.setConfig({ testTimeout: 120_000 });

const roster = shippedRoster();
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const KEY = { enter: "\r", up: "\x1b[A", down: "\x1b[B", shiftTab: "\x1b[Z", tab: "\t", backspace: "\x7f", ctrlC: "\x03" };

/** The chat on a fake terminal and keyboard. `press` sends one key or one piece of typed text. */
function chat(over: Partial<ChatDeps> = {}) {
  const term = fakeTerminal(100);
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, { isTTY: true, setRawMode: () => stdin, ref: () => stdin, unref: () => stdin });
  const deps: ChatDeps = {
    cwd: "C:/work/project",
    roster,
    runCommand: vi.fn(async (args: string[]) => ({ output: `ran sa ${args.join(" ")}`, ok: true })),
    exit: vi.fn(),
    clearScreen: vi.fn(),
    ...over,
  };
  const session = new ChatSession(deps);
  const app = render(
    React.createElement(ChatApp, {
      session,
      info: { version: "9.9.9", cwd: deps.cwd, monarch: "codex-astra", soldiers: 6 },
      loadStatus: async () => ({ branch: "main", ready: { found: 5, total: 6 } }),
    }),
    { stdout: term.stream, stdin, exitOnCtrlC: false, patchConsole: false, interactive: true },
  );
  cleanups.push(() => app.unmount());
  const press = async (...keys: string[]) => {
    for (const k of keys) {
      (stdin as unknown as PassThrough).write(k);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const sees = (text: string | RegExp) =>
    vi.waitFor(() => (typeof text === "string" ? expect(term.text()).toContain(text) : expect(term.text()).toMatch(text)), { timeout: 10_000, interval: 25 });
  return { session, deps, term, press, sees };
}

/** A runGoal stand-in that asks to confirm the sample plan and reports what it was told. */
function confirmingRun(seen: { ok?: boolean }) {
  return async (opts: RunGoalOptions): Promise<RunResult> => {
    const planned = samplePlanned();
    seen.ok = await opts.confirm(planned);
    return {
      runId: planned.runId, goal: opts.goal, status: seen.ok ? "completed" : "declined", monarch: planned.monarch,
      plan: planned.checked.plan, order: planned.checked.order, assignments: [...planned.assignments.values()],
      rejected: [], outcomes: [], notes: [], costUsd: 0.5, uncommittedIgnored: false,
    };
  };
}

describe("the chat screen", () => {
  it("opens with the banner, a welcome box, the prompt and the status line", async () => {
    const { sees } = chat();
    await sees("Welcome to Shadow Army");
    await sees("cwd: C:/work/project");
    await sees("Monarch: codex-astra · 6 soldiers");
    await sees("Give the Monarch a goal, or type / for commands");
    await sees("⏵⏵ ask before running (shift+tab to cycle)");
    await sees("main · 5/6 soldiers ready");
    await sees("v9.9.9");
  });

  it("types, edits and submits a line, and recalls it with Up", async () => {
    const { press, sees, deps } = chat();
    await press("/arn", KEY.backspace, "my");
    await sees("> /army");
    await press(KEY.enter);
    await sees("ran sa army");
    expect(deps.runCommand).toHaveBeenCalledWith(["army"]);
    await press(KEY.up);
    await vi.waitFor(() => expect(deps.runCommand).toHaveBeenCalledTimes(1));
    await press(KEY.enter);
    await vi.waitFor(() => expect(deps.runCommand).toHaveBeenCalledTimes(2));
  });

  it("keeps Up and Down on earlier inputs while browsing them, though a recalled command opens the menu", async () => {
    const { press, sees, deps } = chat();
    await press("/locks", KEY.enter);
    await sees("ran sa locks");
    await press("/army", KEY.enter);
    await sees("ran sa army");
    // Up recalls /army, whose menu opens; Up, Down and Up still walk the history (/locks, /army,
    // /locks) with no need to clear the box, so Enter runs /locks.
    await press(KEY.up, KEY.up, KEY.down, KEY.up, KEY.enter);
    await vi.waitFor(() => expect(deps.runCommand).toHaveBeenCalledTimes(3));
    expect(deps.runCommand).toHaveBeenLastCalledWith(["locks"]);
  });

  it("gives the arrows back to the menu once a recalled input is edited", async () => {
    const { press, sees, deps } = chat();
    await press("/locks", KEY.enter);
    await sees("ran sa locks");
    // Recall /locks, erase it back to "/", and pick from the menu with Down: /help, /plan, then /mode.
    await press(KEY.up, KEY.backspace, KEY.backspace, KEY.backspace, KEY.backspace, KEY.backspace);
    await press(KEY.down, KEY.down, KEY.tab);
    await sees("> /mode");
    expect(deps.runCommand).toHaveBeenCalledTimes(1);
  });

  it("shows the / menu, completes with Tab, and runs a no-argument command straight from Enter", async () => {
    const { press, sees, deps, term } = chat();
    await press("/");
    await sees("/summon <soldier> <task>  send one brief to one soldier");
    await sees(/\/diff\s+your folder's uncommitted changes/);
    await press("pl", KEY.tab);
    await sees("> /plan");
    await press(KEY.ctrlC);
    await press("/wo", KEY.enter);
    await vi.waitFor(() => expect(deps.runCommand).toHaveBeenCalledWith(["worktrees"]));
    expect(term.text()).toContain("ran sa worktrees");
  });

  it("deletes the character under the cursor with Delete", async () => {
    const { press, deps } = chat();
    await press("/arxmy", "\x1b[D", "\x1b[D", "\x1b[D", "\x1b[3~", KEY.enter);
    await vi.waitFor(() => expect(deps.runCommand).toHaveBeenCalledWith(["army"]));
  });

  it("cycles the mode with Shift+Tab", async () => {
    const { press, sees, session } = chat();
    await press(KEY.shiftTab);
    await sees("⏵⏵ run plans without asking");
    await press(KEY.shiftTab);
    await sees("⏵⏵ plan only");
    expect(session.getState().mode).toBe("plan");
  });

  it("asks before running a plan: y runs it, n does not", async () => {
    const seen: { ok?: boolean } = {};
    const { press, sees } = chat({ runGoal: confirmingRun(seen) });
    await press("make two files", KEY.enter);
    await sees("Run these 3 tasks?");
    await sees("❯ 1. Yes, run it");
    await press("y");
    await vi.waitFor(() => expect(seen.ok).toBe(true));
    await sees("$0.5000");

    const no: { ok?: boolean } = {};
    const second = chat({ runGoal: confirmingRun(no) });
    await second.press("make two files", KEY.enter);
    await second.sees("Run these 3 tasks?");
    await second.press(KEY.down, KEY.enter);
    await vi.waitFor(() => expect(no.ok).toBe(false));
    await second.sees("Not run.");
  });

  it("clears the input on Ctrl+C, and exits on two presses at an empty prompt", async () => {
    const { press, sees, deps, term } = chat();
    const placeholders = () => term.text().split("Give the Monarch a goal").length;
    await press("half a thought");
    await sees("> half a thought");
    const before = placeholders();
    await press(KEY.ctrlC);
    // The empty prompt, with its placeholder, is drawn again.
    await vi.waitFor(() => expect(placeholders()).toBeGreaterThan(before));
    expect(deps.exit).not.toHaveBeenCalled();
    await press(KEY.ctrlC);
    await sees("Press Ctrl+C again to exit.");
    await press(KEY.ctrlC);
    await vi.waitFor(() => expect(deps.exit).toHaveBeenCalledTimes(1));
  });

  it("plays a whole run with fake soldiers: plan, approval, live dashboard, report in the transcript", async () => {
    const repo = makeRepo({ "README.md": "hello\n" });
    cleanups.push(() => repo.cleanup());
    const m = monarchScript({
      plans: [planReply([{ id: "a", title: "write one.txt", role: "build", soldier: "grok", claims: ["one.txt"], brief: "slow; write one.txt=1" }], "make one.txt")],
    });
    const { press, sees, session } = chat({
      cwd: repo.dir,
      goalOptions: { getAdapter: m.getAdapter, dispatch: fakeArmy(roster).dispatch, isInstalled: () => true, useVault: false },
    });
    await press("make one file", KEY.enter);
    await sees("> make one file");
    await sees("Plan by codex-astra: make one.txt");
    await sees("Run this task?");
    await press(KEY.enter);
    await sees(/a\s+grok\s+build\s+running/);
    await sees(/Finished\s+1\/1 done/);
    await sees("Report from the soldiers' reports");
    await vi.waitFor(() => expect(session.idle).toBe(true));
    expect(session.getState().entries.map((e) => e.kind)).toEqual(["welcome", "user", "steps", "text", "dashboard", "text"]);
  });
});
