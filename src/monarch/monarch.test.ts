import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunRequest } from "../adapters/Adapter.js";
import { shippedRoster } from "../core/roster.testutil.js";
import { Vault } from "../vault/vault.js";
import { readLedger } from "../workspace/ledger.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { undoApplied } from "../workspace/undo.js";
import { listWorktrees } from "../workspace/worktree.js";
import { fakeArmy, monarchScript, planReply, synthesisReply } from "./fakes.testutil.js";
import { MonarchError, runGoal, type RunGoalOptions } from "./monarch.js";
import { renderResult } from "./render.js";

vi.setConfig({ testTimeout: 120_000 });

const roster = shippedRoster();
const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

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
    expect(result.applied).toBeUndefined();
    expect(r.git("status", "--porcelain")).toBe("");
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

  it("plans from the folder as it is: uncommitted edits and untracked files are seen, ignored files are not", async () => {
    const r = repo();
    r.write(".gitignore", "secret.txt\n");
    r.write("src/a.txt", "uncommitted edit\n");
    r.write("scratch.txt", "untracked\n");
    r.write("secret.txt", "ignored\n");
    const head = r.git("rev-parse", "HEAD");
    const status = r.git("status", "--porcelain");
    let planCwd = "";
    let saw: Record<string, string | undefined> = {};
    const m = monarchScript({ plans: [planReply(twoBuildsAndReview)] });
    const getAdapter = (cli: string) => {
      const a = m.getAdapter(cli);
      if (!a) return a;
      return {
        ...a,
        async run(req: RunRequest) {
          planCwd = req.cwd;
          const look = (p: string) => (existsSync(join(req.cwd, p)) ? readFileSync(join(req.cwd, p), "utf8") : undefined);
          saw = { edit: look("src/a.txt"), untracked: look("scratch.txt"), ignored: look("secret.txt"), unchanged: look("README.md") };
          return a.run(req);
        },
      };
    };
    const events: string[] = [];
    await runGoal(base(r, { planOnly: true, getAdapter, onEvent: (e) => e.type === "phase" && events.push(e.message) }));
    expect(planCwd.replace(/\\/g, "/")).toContain("/.shadow/worktrees/plan-");
    expect(saw).toEqual({ edit: "uncommitted edit\n", untracked: "untracked\n", ignored: undefined, unchanged: "hello\n" });
    expect(existsSync(planCwd)).toBe(false); // the planning snapshot is removed
    // Nothing says the run ignored the owner's work any more, and the folder is exactly as it was.
    expect(events.join("\n")).not.toMatch(/uncommitted/);
    expect(r.git("rev-parse", "HEAD")).toBe(head);
    expect(r.git("status", "--porcelain")).toBe(status);
    expect(readFileSync(join(r.dir, "src/a.txt"), "utf8")).toBe("uncommitted edit\n");
    expect(readFileSync(join(r.dir, "secret.txt"), "utf8")).toBe("ignored\n");
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
    expect(result.applied).toBeUndefined();
    expect(r.git("status", "--porcelain")).toBe("");
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
    // The checkout moved on in another file, so the run's change still applies on top of it.
    expect(result.applied).toMatchObject({ applied: true });
    expect(readFileSync(join(r.dir, "one.txt"), "utf8")).toBe("1\n");
    expect(readFileSync(join(r.dir, "src/a.txt"), "utf8")).toBe("new checkout commit\n");
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

    // The work is in the checkout as unstaged edits, HEAD unmoved. .shadow/ ignores itself, so it never shows.
    expect(result.applied).toEqual({ applied: true, files: [{ change: "A", path: "one.txt" }, { change: "A", path: "two.txt" }] });
    expect(r.git("diff", "--name-status")).toBe("A\tone.txt\nA\ttwo.txt");
    expect(r.git("diff", "--cached", "--name-only")).toBe("");
    expect(r.git("status", "--porcelain", "--untracked-files=all")).not.toContain(".shadow");
    expect(readFileSync(join(r.dir, "one.txt"), "utf8")).toBe("1\n");
    expect(renderResult(result)).toContain("Applied to your folder (not committed):\n  A  one.txt\n  A  two.txt");
    expect(renderResult(result)).toContain(`Backup:      ${branch}`);
    expect(renderResult(result)).toContain(`Undo it:     sa undo ${result.runId}`);
    expect(renderResult(result)).not.toContain("uncommitted changes; the run");
    // Applied, so recorded for `sa undo`, by run id.
    expect(await readLedger(join(r.dir, ".shadow"))).toEqual([
      {
        type: "applied", id: result.runId, kind: "run", base: head, branch, tip: r.git("rev-parse", branch), head,
        index: expect.objectContaining({ "one.txt": expect.stringContaining("100644 ") }),
        files: result.applied && result.applied.applied ? result.applied.files : [],
        at: expect.any(String),
      },
    ]);

    const record = JSON.parse(readFileSync(result.recordPath!, "utf8"));
    expect(record).toMatchObject({ runId: result.runId, goal: "make two files and review them", status: "completed", applied: { applied: true } });
    expect(result.costUsd).toBeCloseTo(0.03);
  });

  const oneFile = () => monarchScript({ plans: [planReply([{ id: "a", title: "one", role: "build", claims: ["one.txt"], brief: "write one.txt=1" }])] });

  it("leaves the work only on its branch with --no-apply", async () => {
    const r = repo();
    const result = await runGoal(base(r, { getAdapter: oneFile().getAdapter, dispatch: fakeArmy(roster).dispatch, apply: false }));
    expect(result.applied).toBeUndefined();
    expect(result.integration!.kept).toBe(true);
    expect(r.git("status", "--porcelain")).toBe("");
    expect(renderResult(result)).toContain(`Take it:     git merge ${result.integration!.branch}`);
    expect(await readLedger(join(r.dir, ".shadow"))).toEqual([]); // nothing was applied, so nothing to undo
  });

  it("does not apply over a file the owner edits while the run is under way, and says where the work is", async () => {
    const r = repo();
    const result = await runGoal(base(r, {
      getAdapter: oneFile().getAdapter,
      dispatch: fakeArmy(roster).dispatch,
      confirm: async () => {
        r.write("one.txt", "mine\n"); // after the run's snapshot of the folder was taken
        return true;
      },
    }));
    expect(result.outcomes[0]!.status).toBe("ok");
    expect(result.applied).toEqual({ applied: false, reason: "your folder changed, since the run started, in files the run also changed", clashes: ["one.txt"] });
    expect(readFileSync(join(r.dir, "one.txt"), "utf8")).toBe("mine\n");
    const text = renderResult(result);
    expect(text).toContain(`Take it:     git merge ${result.integration!.branch}`);
    expect(text).toContain("Not applied to your folder: your folder changed, since the run started, in files the run also changed.\n  one.txt");
    expect(await readLedger(join(r.dir, ".shadow"))).toEqual([]);
  });

  it("applies over edits the owner made before the run, because the run started from them", async () => {
    const r = repo();
    r.write("src/a.txt", "uncommitted edit\n");
    r.write("scratch.txt", "untracked\n");
    r.write("one.txt", "mine\n"); // the very file the run goes on to change
    const head = r.git("rev-parse", "HEAD");
    const m = monarchScript({ plans: [planReply([
      { id: "a", title: "extend", role: "build", claims: ["one.txt", "src/a.txt"], brief: "append one.txt=the run's line; append src/a.txt=also the run's; read scratch.txt" },
    ])] });
    const result = await runGoal(base(r, { getAdapter: m.getAdapter, dispatch: fakeArmy(roster).dispatch }));

    // The soldier worked on the owner's uncommitted work, untracked files included.
    expect(result.outcomes[0]!.report!.summary).toBe("saw scratch.txt: untracked");
    expect(result.integration!.base).not.toBe(head);
    expect(r.git("rev-parse", `${result.integration!.base}^`)).toBe(head);
    expect(r.git("show", `${result.integration!.branch}:one.txt`)).toBe("mine\nthe run's line");

    // Applied on top of the owner's edits, not over them.
    expect(result.applied).toEqual({ applied: true, files: [{ change: "M", path: "one.txt" }, { change: "M", path: "src/a.txt" }] });
    expect(readFileSync(join(r.dir, "one.txt"), "utf8")).toBe("mine\nthe run's line\n");
    expect(readFileSync(join(r.dir, "src/a.txt"), "utf8")).toBe("uncommitted edit\nalso the run's\n");
    expect(readFileSync(join(r.dir, "scratch.txt"), "utf8")).toBe("untracked\n");
    expect(r.git("rev-parse", "HEAD")).toBe(head);
    expect(r.git("diff", "--cached", "--name-only")).toBe("");

    // And undo puts the owner's own work back exactly as it was before the run.
    expect(await undoApplied(r.dir, join(r.dir, ".shadow"))).toMatchObject({ undone: true, id: result.runId });
    expect(readFileSync(join(r.dir, "one.txt"), "utf8")).toBe("mine\n");
    expect(readFileSync(join(r.dir, "src/a.txt"), "utf8")).toBe("uncommitted edit\n");
  });

  it("builds a follow-up run on the earlier run's applied, uncommitted work", async () => {
    const r = repo();
    const head = r.git("rev-parse", "HEAD");

    // Run 1 creates bye.txt, which lands in the folder uncommitted.
    const first = await runGoal(base(r, {
      goal: "make bye.txt",
      useVault: false,
      dispatch: fakeArmy(roster).dispatch,
      getAdapter: monarchScript({ plans: [planReply([{ id: "a", title: "bye", role: "build", claims: ["bye.txt"], brief: "write bye.txt=bye" }])] }).getAdapter,
    }));
    expect(first.applied).toEqual({ applied: true, files: [{ change: "A", path: "bye.txt" }] });
    expect(r.git("rev-parse", "HEAD")).toBe(head);
    expect(r.git("ls-tree", "--name-only", "HEAD")).not.toContain("bye.txt");

    // Run 2 is "now make bye.txt say goodbye forever": its brief changes the existing file, and what it
    // makes of it depends on starting from run 1's content. The Monarch plans from that content too.
    let planSaw: string | undefined;
    const m = monarchScript({ plans: [planReply([{ id: "a", title: "goodbye", role: "build", claims: ["bye.txt"], brief: "append bye.txt=goodbye forever; read bye.txt" }])] });
    const second = await runGoal(base(r, {
      goal: "now make bye.txt say goodbye forever",
      useVault: false,
      dispatch: fakeArmy(roster).dispatch,
      getAdapter: (cli) => {
        const a = m.getAdapter(cli);
        return a && { ...a, run: async (req: RunRequest) => { planSaw ??= readFileSync(join(req.cwd, "bye.txt"), "utf8"); return a.run(req); } };
      },
    }));
    expect(planSaw).toBe("bye\n");
    expect(second.outcomes[0]!.report!.summary).toBe("saw bye.txt: bye\ngoodbye forever");
    expect(second.integration!.base).not.toBe(head); // a snapshot of the folder, with bye.txt in it
    expect(second.integration!.files).toEqual(["bye.txt"]); // the run changed the file; it did not make it again

    // Applied on top: the folder ends with both, still uncommitted, and the file is still a new one for git.
    expect(second.applied).toEqual({ applied: true, files: [{ change: "M", path: "bye.txt" }] });
    expect(readFileSync(join(r.dir, "bye.txt"), "utf8")).toBe("bye\ngoodbye forever\n");
    expect(r.git("status", "--porcelain").split("\n")).toEqual(["A bye.txt"]);
    expect(r.git("rev-parse", "HEAD")).toBe(head);
    expect(renderResult(second)).toContain(`Undo it:     sa undo ${second.runId}`);

    // `sa undo` takes the runs back one at a time, newest first.
    const shadow = join(r.dir, ".shadow");
    expect(await undoApplied(r.dir, shadow)).toMatchObject({ undone: true, id: second.runId });
    expect(readFileSync(join(r.dir, "bye.txt"), "utf8")).toBe("bye\n");
    expect(await undoApplied(r.dir, shadow)).toMatchObject({ undone: true, id: first.runId });
    expect(existsSync(join(r.dir, "bye.txt"))).toBe(false);
    expect(r.git("status", "--porcelain")).toBe("");
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
    expect(result.applied).toBeUndefined();
    // No worktree is left behind: not registered with git, and nothing on disk.
    const dir = join(r.dir, ".shadow", "worktrees");
    expect(await listWorktrees(r.dir, join(r.dir, ".shadow"))).toEqual([]);
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
    expect(r.git("branch", "--list", "shadow/*")).toBe("");
  });
});
