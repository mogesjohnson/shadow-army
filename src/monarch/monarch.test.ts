import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Adapter, RunRequest, RunResult } from "../adapters/Adapter.js";
import { getAdapter as realAdapter } from "../adapters/registry.js";
import { shippedRoster } from "../core/roster.testutil.js";
import { Vault } from "../vault/vault.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { listWorktrees } from "../workspace/worktree.js";
import { fakeArmy } from "./fakes.testutil.js";
import { MonarchError, runGoal, type RunGoalOptions } from "./monarch.js";

vi.setConfig({ testTimeout: 120_000 });

const roster = shippedRoster();
const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

const planReply = (tasks: unknown[], summary = "the plan") => "My plan.\n```shadow-plan\n" + JSON.stringify({ summary, tasks }) + "\n```";
const synthesisReply = (obj: unknown) => "Done.\n```shadow-synthesis\n" + JSON.stringify(obj) + "\n```";

/**
 * Fake CLIs with the real adapters' capabilities (so the hard rules are the real ones). Monarch calls
 * are answered from a script; a CLI listed in `failing` returns an error instead.
 */
function monarchScript(script: { plans: string[]; synthesis?: string; failing?: string[] }) {
  const prompts: { cli: string; prompt: string; cwd: string }[] = [];
  let planIndex = 0;
  const getAdapter = (cli: string): Adapter | undefined => {
    const real = realAdapter(cli);
    if (!real) return undefined;
    return {
      ...real,
      detect: async () => ({ found: true }),
      async run(req: RunRequest): Promise<RunResult> {
        prompts.push({ cli, prompt: req.prompt, cwd: req.cwd });
        if (script.failing?.includes(cli)) return { text: "", isError: true, errorMessage: `${cli} is down` };
        if (req.prompt.includes("Your soldiers have finished")) return { text: script.synthesis ?? "no block", isError: false };
        return { text: script.plans[Math.min(planIndex++, script.plans.length - 1)]!, isError: false };
      },
    };
  };
  return { getAdapter, prompts };
}

function repo() {
  const r = makeRepo({ "README.md": "hello\n", "src/a.txt": "a\n" });
  repos.push(r);
  return r;
}

const base = (r: ReturnType<typeof repo>, over: Partial<RunGoalOptions>): RunGoalOptions => ({
  goal: "make two files and review them",
  cwd: r.dir,
  roster,
  confirm: async () => true,
  isInstalled: () => true,
  ...over,
});

const twoBuildsAndReview = [
  { id: "a", title: "one", role: "build", soldier: "grok", claims: ["one.txt"], brief: "write one.txt=1; note:the repo uses txt files" },
  { id: "b", title: "two", role: "build", soldier: "codex-sol", claims: ["two.txt"], brief: "write two.txt=2" },
  { id: "r", title: "review", role: "review", soldier: "grok", dependsOn: ["a", "b"], brief: "read one.txt" },
];

describe("planning", () => {
  it("--plan-only shows a checked, assigned plan and runs nothing", async () => {
    const r = repo();
    const m = monarchScript({ plans: [planReply(twoBuildsAndReview)] });
    const result = await runGoal(base(r, { planOnly: true, getAdapter: m.getAdapter }));
    expect(result.status).toBe("planned");
    expect(result.monarch).toBe("codex-astra");
    expect(result.order).toEqual(["a", "b", "r"]);
    // Grok never reviews: the router overrides the Monarch's pick.
    expect(result.assignments.find((a) => a.taskId === "r")).toMatchObject({ soldier: "claude-opus", overridden: { wanted: "grok" } });
    expect(m.prompts).toHaveLength(1);
    expect(m.prompts[0]!.prompt).toContain("make two files and review them");
    expect(m.prompts[0]!.prompt).toContain("- grok: roles build; cost 1; never does review");
    expect(m.prompts[0]!.prompt).toContain("DELEGATION GUIDE");
    expect(m.prompts[0]!.prompt).toContain("RULES EVERY SOLDIER MUST FOLLOW (never plan a task that needs breaking one):");
    expect(m.prompts[0]!.prompt).toContain("Leave git alone");
    expect(r.git("branch", "--list", "shadow/*")).toBe("");
  });

  it("feeds an invalid plan's problems back for one corrected attempt", async () => {
    const r = repo();
    const cyclic = [
      { id: "a", title: "a", role: "build", claims: ["x"], dependsOn: ["b"], brief: "b" },
      { id: "b", title: "b", role: "build", claims: ["y"], dependsOn: ["a"], brief: "b" },
    ];
    const m = monarchScript({ plans: [planReply(cyclic), planReply(twoBuildsAndReview)] });
    const result = await runGoal(base(r, { planOnly: true, getAdapter: m.getAdapter }));
    expect(result.status).toBe("planned");
    expect(result.rejected).toHaveLength(1);
    expect(m.prompts[1]!.prompt).toContain("YOUR PREVIOUS PLAN WAS REJECTED");
    expect(m.prompts[1]!.prompt).toMatch(/cycle among: a, b/);
  });

  it("falls back to the second Monarch when the first is unavailable", async () => {
    const r = repo();
    const m = monarchScript({ plans: [planReply(twoBuildsAndReview)], failing: ["codex"] });
    const result = await runGoal(base(r, { planOnly: true, getAdapter: m.getAdapter }));
    expect(result.monarch).toBe("claude-opus");
    expect(m.prompts.map((p) => p.cli)).toEqual(["codex", "claude"]);
  });

  it("gives up with a clear error when no Monarch can plan", async () => {
    const r = repo();
    const bad = monarchScript({ plans: ["no plan here"] });
    await expect(runGoal(base(r, { planOnly: true, getAdapter: bad.getAdapter }))).rejects.toThrow(/no valid plan: codex-astra returned an invalid plan twice; claude-opus returned an invalid plan twice/);

    const none = monarchScript({ plans: [] });
    await expect(
      runGoal(base(r, { planOnly: true, getAdapter: none.getAdapter, isInstalled: (cli) => cli !== "codex" && cli !== "claude" })),
    ).rejects.toThrow(/no Monarch is available.*not installed/);
  });

  it("plans from the last commit, like the soldiers, and says when uncommitted changes are left out", async () => {
    const r = repo();
    r.write("src/a.txt", "uncommitted edit\n");
    r.write("scratch.txt", "untracked\n");
    let planCwd = "";
    let sawEdit: boolean | undefined;
    const m = monarchScript({ plans: [planReply(twoBuildsAndReview)] });
    const getAdapter = (cli: string) => {
      const a = m.getAdapter(cli);
      if (!a) return a;
      return {
        ...a,
        async run(req: RunRequest) {
          planCwd = req.cwd;
          sawEdit = readFileSync(join(req.cwd, "src", "a.txt"), "utf8").includes("uncommitted") || existsSync(join(req.cwd, "scratch.txt"));
          return a.run(req);
        },
      };
    };
    const events: string[] = [];
    const result = await runGoal(base(r, { planOnly: true, getAdapter, onEvent: (e) => e.type === "phase" && events.push(e.message) }));
    expect(planCwd.replace(/\\/g, "/")).toContain("/.shadow/worktrees/plan-");
    expect(sawEdit).toBe(false);
    expect(existsSync(planCwd)).toBe(false); // the planning snapshot is removed
    expect(result.uncommittedIgnored).toBe(true);
    expect(events.join("\n")).toMatch(/uncommitted changes; the run works from the last commit/);
  });

  it("refuses a Monarch the rules do not allow", async () => {
    const r = repo();
    const m = monarchScript({ plans: [planReply(twoBuildsAndReview)] });
    await expect(runGoal(base(r, { planOnly: true, monarch: "grok", getAdapter: m.getAdapter }))).rejects.toBeInstanceOf(MonarchError);
  });

  it("runs nothing when the plan is declined", async () => {
    const r = repo();
    const m = monarchScript({ plans: [planReply(twoBuildsAndReview)] });
    const army = fakeArmy(roster);
    const result = await runGoal(base(r, { confirm: async () => false, getAdapter: m.getAdapter, dispatch: army.dispatch }));
    expect(result.status).toBe("declined");
    expect(army.seen).toHaveLength(0);
    expect(r.git("branch", "--list", "shadow/*")).toBe("");
  });
});

describe("a whole run", () => {
  it("keeps the planned base when the checkout advances while confirming", async () => {
    const r = repo();
    const plannedBase = r.git("rev-parse", "HEAD");
    const m = monarchScript({ plans: [planReply([
      { id: "a", title: "one", role: "build", claims: ["one.txt"], brief: "write one.txt=1" },
    ])] });
    const result = await runGoal(base(r, {
      getAdapter: m.getAdapter,
      dispatch: fakeArmy(roster).dispatch,
      confirm: async () => {
        r.write("src/a.txt", "new checkout commit\n");
        r.git("commit", "-qam", "advance checkout");
        return true;
      },
    }));
    expect(result.integration!.base).toBe(plannedBase);
    expect(r.git("show", `${result.integration!.branch}:src/a.txt`)).toBe("a");
    expect(r.git("show", "HEAD:src/a.txt")).toBe("new checkout commit");
    expect(result.outcomes[0]!.status).toBe("ok");
  });

  it("includes each report's notes in synthesis even without a vault", async () => {
    const r = repo();
    const m = monarchScript({ plans: [planReply([
      { id: "a", title: "one", role: "build", claims: ["one.txt"], brief: "write one.txt=1; note:the repo uses txt files" },
    ])] });
    await runGoal(base(r, { getAdapter: m.getAdapter, dispatch: fakeArmy(roster).dispatch, useVault: false }));
    expect(m.prompts.at(-1)!.prompt).toContain("the repo uses txt files");
  });

  it("plans, builds in parallel, reviews the merged work, reports, and leaves one branch", async () => {
    const r = repo();
    const head = r.git("rev-parse", "HEAD");
    const m = monarchScript({
      plans: [planReply(twoBuildsAndReview)],
      synthesis: synthesisReply({
        summary: "Both files exist and were reviewed.",
        followUps: ["merge it"],
        noteDecisions: [{ text: "the repo uses txt files", decision: "accept", reason: "true and useful" }],
      }),
    });
    const vault = new Vault(join(r.dir, ".shadow"));
    const army = fakeArmy(roster, vault);
    const result = await runGoal(base(r, { getAdapter: m.getAdapter, dispatch: army.dispatch }));

    expect(result.status).toBe("completed");
    expect(result.outcomes.map((o) => [o.taskId, o.status])).toEqual([["a", "ok"], ["b", "ok"], ["r", "ok"]]);
    expect(result.outcomes.find((o) => o.taskId === "r")!.report!.summary).toBe("saw one.txt: 1");

    const branch = result.integration!.branch;
    expect(result.integration).toMatchObject({ kept: true, files: ["one.txt", "two.txt"] });
    expect(r.git("show", `${branch}:one.txt`)).toBe("1");
    expect(r.git("rev-parse", "HEAD")).toBe(head); // the user's branch never moves
    expect(await listWorktrees(r.dir, join(r.dir, ".shadow"))).toEqual([]);

    expect(result.synthesis).toMatchObject({ fromMonarch: true, summary: "Both files exist and were reviewed.", followUps: ["merge it"] });
    const synthesisPrompt = m.prompts.at(-1)!;
    expect(synthesisPrompt.prompt).toContain("[a] one: build by grok: ok, merged");
    expect(synthesisPrompt.prompt).toContain("- the repo uses txt files");
    expect(synthesisPrompt.cwd.replace(/\\/g, "/")).toContain("/.shadow/worktrees/final-");

    // The Monarch's note decision is a recommendation only, without --accept-notes.
    expect(result.notes).toMatchObject([{ text: "the repo uses txt files", decision: "accept", applied: false }]);
    expect((await vault.listNotes("proposed")).map((n) => n.text)).toEqual(["the repo uses txt files"]);

    // .shadow/ is ignored from the start, so the run never looks like uncommitted work.
    expect(r.git("status", "--porcelain")).toBe("");
    expect(result.uncommittedIgnored).toBe(false);
    expect(result.outcomes.some((o) => o.report?.workspace?.uncommittedIgnored)).toBe(false);

    const record = JSON.parse(readFileSync(result.recordPath!, "utf8"));
    expect(record).toMatchObject({ runId: result.runId, goal: "make two files and review them", status: "completed" });
    expect(result.costUsd).toBeCloseTo(0.03);
  });

  it("applies the Monarch's note decisions only with --accept-notes, and only to this run's notes", async () => {
    const r = repo();
    const vault = new Vault(join(r.dir, ".shadow"));
    await vault.addNote({ text: "an older proposal", source: "grok", status: "proposed", runId: "someone-else" });
    const m = monarchScript({
      plans: [planReply(twoBuildsAndReview)],
      synthesis: synthesisReply({
        summary: "ok",
        noteDecisions: [
          { text: "The repo uses TXT files", decision: "accept", reason: "" },
          { text: "an older proposal", decision: "accept", reason: "" },
        ],
      }),
    });
    const result = await runGoal(base(r, { getAdapter: m.getAdapter, dispatch: fakeArmy(roster, vault).dispatch, acceptNotes: true }));
    expect(result.notes).toMatchObject([{ text: "the repo uses txt files", decision: "accept", applied: true }]);
    expect((await vault.listNotes("accepted")).map((n) => n.text)).toEqual(["the repo uses txt files"]);
    expect((await vault.listNotes("proposed")).map((n) => n.text)).toEqual(["an older proposal"]);
  });

  it("falls back to a report built from the soldiers when the Monarch cannot write one", async () => {
    const r = repo();
    const m = monarchScript({
      plans: [planReply([{ id: "a", title: "one", role: "build", claims: ["one.txt"], brief: "fail" }])],
      synthesis: "I forgot the block",
    });
    const result = await runGoal(base(r, { getAdapter: m.getAdapter, dispatch: fakeArmy(roster).dispatch }));
    expect(result.outcomes[0]!.status).toBe("error");
    expect(result.synthesis!.fromMonarch).toBe(false);
    expect(result.synthesis!.summary).toMatch(/0 of 1 tasks succeeded/);
    expect(result.integration).toMatchObject({ kept: false, commits: 0 });
    expect(r.git("branch", "--list", "shadow/run/*")).toBe(""); // nothing to keep
  });

  it("finishes at once when the Monarch plans nothing", async () => {
    const r = repo();
    const m = monarchScript({ plans: [planReply([], "already done")] });
    const result = await runGoal(base(r, { getAdapter: m.getAdapter, confirm: async () => { throw new Error("should not ask"); } }));
    expect(result.status).toBe("completed");
    expect(result.outcomes).toEqual([]);
    // No worktree is left behind: not registered with git, and nothing on disk.
    const dir = join(r.dir, ".shadow", "worktrees");
    expect(await listWorktrees(r.dir, join(r.dir, ".shadow"))).toEqual([]);
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
    expect(r.git("branch", "--list", "shadow/*")).toBe("");
  });
});
