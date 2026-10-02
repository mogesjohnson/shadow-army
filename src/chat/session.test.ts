import { afterEach, describe, expect, it, vi } from "vitest";
import { shippedRoster } from "../core/roster.testutil.js";
import { fakeArmy, monarchScript, planReply, synthesisReply } from "../monarch/fakes.testutil.js";
import { buildPlanPrompt, HISTORY_TURNS } from "../monarch/prompts.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { ChatSession, EXIT_WINDOW_MS, type ChatDeps } from "./session.js";

vi.setConfig({ testTimeout: 120_000 });

const roster = shippedRoster();
const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

const oneFile = (name: string) => planReply([{ id: "a", title: `write ${name}`, role: "build", claims: [name], brief: `write ${name}=1` }], `make ${name}`);

/** A session on a temp repo with a scripted Monarch and fake soldiers. */
function session(plans: string[], over: Partial<ChatDeps> = {}) {
  const repo = makeRepo({ "README.md": "hello\n" });
  repos.push(repo);
  const m = monarchScript({ plans, synthesis: synthesisReply({ summary: "The file is there.", followUps: [], noteDecisions: [] }) });
  const deps: ChatDeps = {
    cwd: repo.dir,
    roster,
    runCommand: vi.fn(async (args: string[]) => ({ output: `ran sa ${args.join(" ")}\n`, ok: true })),
    exit: vi.fn(),
    clearScreen: vi.fn(),
    goalOptions: { getAdapter: m.getAdapter, dispatch: fakeArmy(roster).dispatch, isInstalled: () => true, useVault: false },
    ...over,
  };
  return { s: new ChatSession(deps), deps, m, repo };
}

const kinds = (s: ChatSession) => s.getState().entries.map((e) => e.kind);
const texts = (s: ChatSession) => s.getState().entries.flatMap((e) => (e.kind === "text" ? [e.text] : []));

describe("a goal in the chat", () => {
  it("in ask mode, shows the plan, waits for yes, runs, and puts the dashboard and report in the transcript", async () => {
    const { s, repo } = session([oneFile("one.txt")]);
    const done = s.submit("make one file");
    await vi.waitFor(() => expect(s.getState().confirm).toEqual({ tasks: 1, choice: 0 }));
    expect(s.idle).toBe(false);
    expect(texts(s).at(-1)).toContain("Plan by codex-astra: make one.txt");
    s.decide(true);
    await done;

    expect(kinds(s)).toEqual(["welcome", "user", "steps", "text", "dashboard", "text"]);
    const steps = s.getState().entries[2]!;
    expect(steps.kind === "steps" && steps.steps.current).toMatchObject({ label: "codex-astra is planning", done: "ok" });
    const dash = s.getState().entries[4]!;
    expect(dash.kind === "dashboard" && dash.view).toMatchObject({ ended: "done", tasks: [{ id: "a", status: "ok" }] });
    expect(texts(s).at(-1)).toContain("Report from codex-astra:");
    expect(s.getState()).toMatchObject({ busy: undefined, confirm: undefined });
    expect(repo.git("branch", "--list", "shadow/run/*")).not.toBe("");
    expect(s.turns()).toEqual([{ goal: "make one file", outcome: expect.stringContaining("The file is there. (tasks: 1 ok).") }]);
  });

  it("runs nothing when the plan is declined", async () => {
    const { s, repo } = session([oneFile("one.txt")]);
    const done = s.submit("make one file");
    await vi.waitFor(() => expect(s.getState().confirm).toBeDefined());
    s.moveChoice();
    expect(s.getState().confirm!.choice).toBe(1);
    s.decide(false);
    await done;
    expect(kinds(s)).toEqual(["welcome", "user", "steps", "text", "text"]);
    expect(texts(s).at(-1)).toBe("Not run.");
    expect(repo.git("branch", "--list", "shadow/*")).toBe("");
    expect(s.turns()[0]!.outcome).toMatch(/^the owner declined the plan/);
  });

  it("runs without asking in auto mode, and only plans in plan mode or with /plan", async () => {
    const auto = session([oneFile("one.txt")]);
    auto.s.cycleMode();
    expect(auto.s.getState().mode).toBe("auto");
    await auto.s.submit("make one file");
    expect(kinds(auto.s)).toContain("dashboard");

    const plan = session([oneFile("one.txt"), oneFile("two.txt")]);
    plan.s.cycleMode();
    plan.s.cycleMode();
    expect(plan.s.getState().mode).toBe("plan");
    await plan.s.submit("make one file");
    plan.s.cycleMode();
    expect(plan.s.getState().mode).toBe("ask");
    await plan.s.submit("/plan make two");
    expect(kinds(plan.s)).not.toContain("dashboard");
    expect(texts(plan.s).filter((t) => t.startsWith("Plan by codex-astra"))).toHaveLength(2);
    expect(plan.repo.git("branch", "--list", "shadow/*")).toBe("");
    expect(plan.s.turns().map((t) => t.outcome)).toEqual(["planned only, not run. Plan: make one.txt", "planned only, not run. Plan: make two.txt"]);
  });

  it("tells the Monarch about the session's earlier goals, and forgets them after /clear", async () => {
    const { s, m, deps } = session([oneFile("one.txt"), oneFile("two.txt"), oneFile("three.txt")]);
    s.cycleMode(); // auto
    await s.submit("make one file");
    await s.submit("now make another");
    const second = m.prompts.find((p) => p.prompt.includes("GOAL:\nnow make another"))!.prompt;
    expect(second).toContain("EARLIER IN THIS SESSION");
    expect(second).toContain("1. GOAL: make one file");
    expect(second).toMatch(/OUTCOME: The file is there\. \(tasks: 1 ok\)\. The work is on shadow\/run\//);

    await s.submit("/clear");
    expect(deps.clearScreen).toHaveBeenCalled();
    expect(kinds(s)).toEqual(["welcome"]);
    expect(s.getState().epoch).toBe(1);
    expect(s.turns()).toEqual([]);
    await s.submit("a fresh start");
    expect(m.prompts.find((p) => p.prompt.includes("GOAL:\na fresh start"))!.prompt).not.toContain("EARLIER IN THIS SESSION");
  });

  it("keeps the session going when the Monarch fails, and says why", async () => {
    const { s } = session(["no plan here"]);
    await s.submit("make one file");
    expect(texts(s).at(-1)).toMatch(/^error: no valid plan/);
    const steps = s.getState().entries.find((e) => e.kind === "steps")!;
    expect(steps.kind === "steps" && steps.steps.current.done).toBe("error");
    expect(s.turns()[0]!.outcome).toMatch(/^failed: no valid plan/);
    expect(s.idle).toBe(true);
  });

  it("adds up the session's reported cost", async () => {
    const { s } = session([oneFile("one.txt"), oneFile("two.txt")]);
    s.cycleMode();
    await s.submit("one");
    await s.submit("two");
    expect(s.getState().sessionCostUsd).toBeCloseTo(0.02);
  });
});

describe("commands in the chat", () => {
  it("hands pass-through commands to sa and shows what they print", async () => {
    const { s, deps } = session([]);
    await s.submit("/army");
    await s.submit("/summon grok look at the README");
    expect(deps.runCommand).toHaveBeenNthCalledWith(1, ["army"]);
    expect(deps.runCommand).toHaveBeenNthCalledWith(2, ["summon", "grok", "look", "at", "the", "README"]);
    expect(texts(s)).toEqual(["ran sa army", "ran sa summon grok look at the README"]);
  });

  it("shows a failing command's output as an error and bad arguments as usage", async () => {
    const { s } = session([], { runCommand: async () => ({ output: "error: unknown soldier\n", ok: false }) });
    await s.submit("/summon nobody do it");
    await s.submit("/route");
    const entries = s.getState().entries.filter((e) => e.kind === "text");
    expect(entries.map((e) => e.kind === "text" && [e.text, e.tone])).toEqual([
      ["error: unknown soldier", "error"],
      ["Usage: /route <role>  (build, review, research, test or orchestrate)", "error"],
    ]);
  });

  it("answers /help, /mode and typos, and leaves on /exit", async () => {
    const { s, deps } = session([]);
    await s.submit("/help");
    expect(texts(s).at(-1)).toContain("/summon <soldier> <task>");
    await s.submit("/mode plan");
    expect(s.getState().mode).toBe("plan");
    await s.submit("/mode fast");
    expect(texts(s).at(-1)).toBe('Unknown mode "fast". The modes are ask, auto, plan.');
    await s.submit("/amry");
    expect(texts(s).at(-1)).toBe("Unknown command /amry. Did you mean /army? Type /help for the list.");
    await s.submit("/exit");
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  it("ignores input while something runs", async () => {
    let finish!: () => void;
    const { s, deps } = session([], { runCommand: vi.fn(() => new Promise<{ output: string; ok: boolean }>((r) => (finish = () => r({ output: "x", ok: true })))) });
    const first = s.submit("/army");
    expect(s.getState().busy).toMatchObject({ kind: "command", work: { label: "/army" } });
    await s.submit("/locks");
    finish();
    await first;
    expect(deps.runCommand).toHaveBeenCalledTimes(1);
  });
});

describe("leaving", () => {
  it("exits on a second Ctrl+C within the window, and warns differently mid-run", () => {
    let now = 0;
    const { s, deps } = session([], { clock: () => now });
    s.interrupt();
    expect(s.getState().notice).toBe("Press Ctrl+C again to exit.");
    now = EXIT_WINDOW_MS + 1;
    s.interrupt(); // too late: warns again instead of exiting
    expect(deps.exit).not.toHaveBeenCalled();
    now += 500;
    s.interrupt();
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  it("forgets a first Ctrl+C once anything else happens", () => {
    const { s, deps } = session([]);
    s.interrupt();
    s.clearNotice();
    expect(s.getState().notice).toBeUndefined();
    s.interrupt();
    expect(deps.exit).not.toHaveBeenCalled();
  });
});

describe("the Monarch's view of the session", () => {
  it("shows only the last few turns, clipped", () => {
    const history = Array.from({ length: HISTORY_TURNS + 2 }, (_, i) => ({ goal: `goal ${i}`, outcome: "x".repeat(5000) }));
    const prompt = buildPlanPrompt({ goal: "next", roster, isInstalled: () => true, maxTasks: 6, history });
    expect(prompt).not.toContain("GOAL: goal 0");
    expect(prompt).not.toContain("GOAL: goal 1\n");
    expect(prompt).toContain(`1. GOAL: goal 2`);
    expect(prompt).toContain(`${HISTORY_TURNS}. GOAL: goal ${HISTORY_TURNS + 1}`);
    expect(prompt).not.toContain("x".repeat(1300));
  });
});
