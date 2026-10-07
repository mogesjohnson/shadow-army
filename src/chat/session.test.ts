import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shippedRoster } from "../core/roster.testutil.js";
import { fakeArmy, monarchScript, planReply, synthesisReply } from "../monarch/fakes.testutil.js";
import { buildPlanPrompt, HISTORY_TURNS } from "../monarch/prompts.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { ChatSession, EXIT_WINDOW_MS, suggestMonarchEffort, tokenSummary, type ChatDeps } from "./session.js";

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
    await vi.waitFor(
      () => expect(s.getState().confirm).toMatchObject({ row: 1, tasks: [{ id: "a", suggested: "medium", effort: "medium" }] }),
      { timeout: 10_000 },
    );
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
    await vi.waitFor(() => expect(s.getState().confirm).toBeDefined(), { timeout: 10_000 });
    // From Yes, down to No, and Enter.
    s.moveChoice();
    expect(s.getState().confirm!.row).toBe(2);
    s.choose();
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
    const { s, m, deps, repo } = session([oneFile("one.txt"), oneFile("two.txt"), oneFile("three.txt")]);
    s.cycleMode(); // auto
    await s.submit("make one file");
    expect(repo.git("status", "--short")).toContain("one.txt"); // applied to the folder, uncommitted
    await s.submit("now make another");
    const second = m.prompts.find((p) => p.prompt.includes("GOAL:\nnow make another"))!.prompt;
    expect(second).toContain("EARLIER IN THIS SESSION");
    expect(second).toContain("1. GOAL: make one file");
    // The changes are in the folder now, not only on the branch, and the Monarch is told which files.
    expect(second).toMatch(
      /OUTCOME: The file is there\. \(tasks: 1 ok\)\. The changes were applied to the owner's folder as uncommitted edits \(added one\.txt\); the work is also on shadow\/run\//,
    );

    await s.submit("/clear");
    expect(deps.clearScreen).toHaveBeenCalled();
    expect(kinds(s)).toEqual(["welcome"]);
    expect(s.getState().epoch).toBe(1);
    expect(s.turns()).toEqual([]);
    await s.submit("a fresh start");
    expect(m.prompts.find((p) => p.prompt.includes("GOAL:\na fresh start"))!.prompt).not.toContain("EARLIER IN THIS SESSION");
  });

  it("tells the Monarch the work is only on the branch when it could not be applied to the folder", async () => {
    const { s, m, repo } = session([oneFile("one.txt"), oneFile("two.txt")]);
    repo.write("one.txt", "my own work\n"); // a local change to a file the run will also add
    s.cycleMode(); // auto
    await s.submit("make one file");
    expect(repo.git("status", "--short")).toBe("?? one.txt"); // still only the owner's own file
    await s.submit("now make another");
    const second = m.prompts.find((p) => p.prompt.includes("GOAL:\nnow make another"))!.prompt;
    expect(second).toMatch(
      /OUTCOME: The file is there\. \(tasks: 1 ok\)\. The work is on shadow\/run\/\S+\. It was not applied to the folder: you have uncommitted changes to files the run also changed\./,
    );
    expect(second).not.toContain("The changes were applied");
  });

  it("shows a question the Monarch answered itself as its answer, with no plan and no soldiers", async () => {
    const answer = "The CLI starts in src/cli.ts.\nIt uses commander.";
    const { s, m, repo } = session([planReply([], answer), planReply([], "Yes, it does.")]);
    await s.submit("where does the CLI start?");

    // Ask mode, yet nothing to approve: the answer is plain transcript text, then a dim note.
    expect(kinds(s)).toEqual(["welcome", "user", "steps", "text", "text"]);
    const [said, note] = s.getState().entries.slice(-2);
    expect(said).toMatchObject({ kind: "text", text: answer, tone: "normal" });
    expect(note).toMatchObject({ kind: "text", text: "answered by codex-astra at low effort; no soldiers were needed", tone: "dim" });
    expect(texts(s).join("\n")).not.toContain("Nothing to do.");
    expect(texts(s).join("\n")).not.toContain("Plan by");
    const steps = s.getState().entries[2]!;
    expect(steps.kind === "steps" && steps.steps.current.done).toBe("ok");
    expect(s.getState()).toMatchObject({ busy: undefined, confirm: undefined });
    expect(m.prompts).toHaveLength(1); // only the plan call: no soldier, no final report
    expect(repo.git("branch", "--list", "shadow/*")).toBe("");

    // The next goal's plan prompt knows the answer.
    expect(s.turns()).toEqual([{ goal: "where does the CLI start?", outcome: expect.stringContaining(`Answer: ${answer}`) }]);
    await s.submit("does it use anything else?");
    const second = m.prompts.find((p) => p.prompt.includes("GOAL:\ndoes it use anything else?"))!.prompt;
    expect(second).toContain("1. GOAL: where does the CLI start?");
    expect(second).toContain("OUTCOME: the Monarch answered it directly, with no soldiers. Answer: The CLI starts in src/cli.ts. It uses commander.");
  });

  it("shows the answer in plan mode too, and still shows a plan with tasks as a plan", async () => {
    const { s } = session([planReply([], "It is in src/cli.ts."), oneFile("one.txt")]);
    s.cycleMode();
    s.cycleMode();
    expect(s.getState().mode).toBe("plan");
    await s.submit("where is the CLI?");
    expect(texts(s)).toEqual(["It is in src/cli.ts.", "answered by codex-astra at low effort; no soldiers were needed"]);
    await s.submit("make one file");
    expect(texts(s).at(-1)).toContain("Plan by codex-astra: make one.txt");
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

  it("passes quoted claims as one argument and refuses incomplete quoting", async () => {
    const { s, deps } = session([]);
    await s.submit('/summon grok --write --claim "src/my file.ts" "fix it"');
    expect(deps.runCommand).toHaveBeenCalledWith(["summon", "grok", "--write", "--claim", "src/my file.ts", "fix it"]);
    await s.submit('/summon grok "unfinished');
    expect(deps.runCommand).toHaveBeenCalledTimes(1);
    expect(texts(s).at(-1)).toBe("Unclosed quote in /summon arguments.");
    expect(s.idle).toBe(true);
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

  it("/diff says so when the folder has no uncommitted changes", async () => {
    const { s, deps, m } = session([]);
    await s.submit("/diff");
    expect(texts(s)).toEqual(["No uncommitted changes."]);
    expect(deps.runCommand).not.toHaveBeenCalled(); // git runs in the chat itself: no `sa`, no Monarch, no soldier
    expect(m.prompts).toEqual([]);
    expect(s.idle).toBe(true);
  });

  it("/diff shows git status and git diff, new files marked intent-to-add included", async () => {
    const { s, deps, m, repo } = session([]);
    repo.write("README.md", "hello\nworld\n");
    repo.write("new.txt", "brand new\n");
    repo.git("add", "-N", "new.txt");
    await s.submit("/diff");
    const out = texts(s).at(-1)!;
    expect(out).toMatch(/^ M README\.md\n A new\.txt\n\ndiff --git a\/README\.md b\/README\.md/);
    expect(out).toContain("+world");
    expect(out).toContain("diff --git a/new.txt b/new.txt");
    expect(out).toContain("+brand new");
    expect(out).not.toContain("\x1b"); // no colors, whatever the user's git config says
    expect(deps.runCommand).not.toHaveBeenCalled();
    expect(m.prompts).toEqual([]);
  });

  it("/diff cuts very long output and says how to see the rest", async () => {
    const { s, repo } = session([]);
    repo.write("README.md", Array.from({ length: 700 }, (_, i) => `line ${i}`).join("\n") + "\n");
    await s.submit("/diff");
    const lines = texts(s).at(-1)!.split("\n");
    expect(lines).toHaveLength(401);
    expect(lines[0]).toBe(" M README.md");
    expect(lines.at(-1)).toMatch(/^… \d+ more lines; run git diff to see them all$/);
    // The count in the last line is what was left out: status, a blank line, and the diff, less the 400 shown.
    const all = repo.git("status", "--short").split("\n").length + 1 + repo.git("diff").split("\n").length;
    expect(lines.at(-1)).toBe(`… ${all - 400} more lines; run git diff to see them all`);
  });

  it("/diff says when the folder is not in a git repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sa-nogit-"));
    try {
      const { s } = session([], { cwd: dir });
      await s.submit("/diff");
      const entry = s.getState().entries.at(-1)!;
      expect(entry).toMatchObject({ kind: "text", tone: "error" });
      expect(entry.kind === "text" && entry.text).toMatch(/^\/diff failed: .* is not inside a git repository/);
      expect(s.idle).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
  it("is told to answer a plain question itself, with no tasks and the whole answer in the summary", () => {
    const prompt = buildPlanPrompt({ goal: "where does the CLI start?", roster, isInstalled: () => true, maxTasks: 6 });
    expect(prompt).toContain("only a question that you can answer by reading the repository yourself, plan no tasks");
    expect(prompt).toContain('put the complete answer in "summary" as plain text');
    // The example block no longer limits the summary to a sentence or two.
    expect(prompt).toContain("or, when you plan no tasks because you are answering a question, the whole answer");
    expect(prompt).not.toContain('{"summary": "the plan in one or two sentences", ');
  });

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

describe("effort and tokens", () => {
  /** A session whose Monarch is named, so the effort picker shows. */
  const named = (plans: string[], usage?: { inputTokens: number; outputTokens: number }) => {
    const repo = makeRepo({ "README.md": "hello\n" });
    repos.push(repo);
    const m = monarchScript({ plans, synthesis: synthesisReply({ summary: "The file is there.", followUps: [], noteDecisions: [] }), usage });
    const army = fakeArmy(roster);
    const s = new ChatSession({
      cwd: repo.dir,
      roster,
      monarch: "codex-astra",
      runCommand: vi.fn(async () => ({ output: "", ok: true })),
      exit: vi.fn(),
      clearScreen: vi.fn(),
      goalOptions: { getAdapter: m.getAdapter, dispatch: army.dispatch, isInstalled: () => true, useVault: false },
    });
    return { s, m, army };
  };

  it("suggests low effort for a short question, and high for anything else", () => {
    expect(suggestMonarchEffort("what does src/chat do?")).toBe("low");
    expect(suggestMonarchEffort("Explain the guard")).toBe("low");
    expect(suggestMonarchEffort("add a /tokens command and test it")).toBe("high");
    expect(suggestMonarchEffort(`why ${"so ".repeat(100)}?`)).toBe("high");
  });

  it("asks for the Monarch's effort first, from the suggestion, and plans at the one chosen", async () => {
    const { s, m } = named([planReply([], "It draws the chat.")]);
    const done = s.submit("what does src/chat do?");
    expect(s.getState().pickEffort).toEqual({ soldier: "codex-astra", model: expect.any(String), suggested: "low", choice: "low" });
    expect(s.idle).toBe(false);
    expect(m.prompts).toEqual([]);
    s.moveEffort(1);
    s.decideEffort(true);
    await done;
    expect(m.prompts.map((p) => p.effort)).toEqual(["medium"]);
    expect(texts(s)).toContain("It draws the chat.");
    expect(texts(s)).toContain("answered by codex-astra at medium effort; no soldiers were needed");
  });

  it("cancels the goal from the effort picker, calling no model", async () => {
    const { s, m } = named([planReply([], "x")]);
    const done = s.submit("what is this?");
    s.decideEffort(false);
    await done;
    expect(m.prompts).toEqual([]);
    expect(texts(s).at(-1)).toBe("Cancelled.");
    expect(s.idle).toBe(true);
  });

  it("in auto mode uses the suggested effort without asking, and says so", async () => {
    const { s, m } = named([planReply([], "x")]);
    s.cycleMode(); // ask -> auto
    await s.submit("what is this?");
    expect(s.getState().pickEffort).toBeUndefined();
    expect(texts(s)).toContain("codex-astra plans at low effort (suggested)");
    expect(m.prompts.map((p) => p.effort)).toEqual(["low"]);
  });

  it("lets the owner change a task's effort before running, and the soldier runs at it", async () => {
    const { s, army } = named([oneFile("one.txt")]);
    const done = s.submit("make one file");
    s.decideEffort(true); // high, as suggested
    await vi.waitFor(() => expect(s.getState().confirm).toBeDefined(), { timeout: 10_000 });
    s.moveChoice(-1); // from Yes up to the task
    s.moveEffort(1); // medium -> high
    s.moveEffort(1); // high -> max
    s.moveEffort(1); // stays at max
    expect(s.getState().confirm!.tasks[0]).toMatchObject({ suggested: "medium", effort: "max" });
    s.choose(); // Enter on a task line runs the plan
    await done;
    expect(army.seen.map((x) => x.effort)).toEqual(["max"]);
  });

  it("adds each run's tokens to the session's totals by soldier", async () => {
    const { s } = named([planReply([], "x")], { inputTokens: 1200, outputTokens: 300 });
    s.cycleMode(); // auto: no picker
    await s.submit("what is this?");
    await s.submit("what is that?");
    expect(s.getState().tokens).toEqual([{ soldier: "codex-astra", model: expect.any(String), efforts: [], inputTokens: 2400, outputTokens: 600 }]);
    expect(tokenSummary(s.getState().tokens)).toBe("codex-astra 3k");
    // The answer's turn names what the Monarch used.
    expect(texts(s).some((t) => /Tokens:\n {2}codex-astra .* effort low\s+1\.2k in · 300 out/.test(t))).toBe(true);
  });

  it("counts and shows the tokens of a turn whose planning failed", async () => {
    // No valid plan: each Monarch tries twice, then runGoal gives up and throws.
    const { s } = named(["not a plan"], { inputTokens: 1200, outputTokens: 300 });
    s.cycleMode(); // auto: no picker
    await s.submit("make one file");
    expect(texts(s).some((t) => t.startsWith("error: no valid plan"))).toBe(true);
    const tokens = s.getState().tokens;
    expect(tokens[0]).toMatchObject({ soldier: "codex-astra", inputTokens: 2400, outputTokens: 600 });
    expect(tokens.every((t) => t.inputTokens === 2400 && t.outputTokens === 600)).toBe(true);
    expect(texts(s).at(-1)).toMatch(/^Tokens:\n {2}codex-astra .* effort high\s+2\.4k in · 600 out/);
  });

  it("keeps one soldier's different models apart in the status line", () => {
    expect(
      tokenSummary([
        { soldier: "codex-astra", model: "model-A", efforts: [], inputTokens: 100, outputTokens: 10 },
        { soldier: "codex-astra", model: "model-B", efforts: [], inputTokens: 200, outputTokens: 20 },
        { soldier: "grok", model: "grok-4.7", efforts: [], inputTokens: 1000, outputTokens: 0 },
      ]),
    ).toBe("codex-astra (model-A) 110 · codex-astra (model-B) 220 · grok 1k");
  });
});
