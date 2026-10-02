import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shippedRoster } from "../core/roster.testutil.js";
import type { Report } from "../core/types.js";
import { Locks } from "../workspace/locks.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { listWorktrees } from "../workspace/worktree.js";
import type { TaskAssignment } from "./assign.js";
import { createIntegration } from "./integration.js";
import { checkPlan, parsePlan, type CheckedPlan } from "./plan.js";
import { fakeArmy } from "./fakes.testutil.js";
import { execute, type Dispatch, type RunEvent } from "./schedule.js";

vi.setConfig({ testTimeout: 120_000 });

const roster = shippedRoster();
const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

function checked(tasks: Record<string, unknown>[]): CheckedPlan {
  const p = parsePlan("```shadow-plan\n" + JSON.stringify({ summary: "s", tasks }) + "\n```");
  if (!p.ok) throw new Error(p.errors.join());
  const c = checkPlan(p.value);
  if (!c.ok) throw new Error(c.errors.join());
  return c.value;
}

const assign = (plan: CheckedPlan, who: Record<string, string>) =>
  new Map<string, TaskAssignment>(plan.order.map((id) => [id, { taskId: id, soldier: who[id] ?? "claude-sonnet", effort: "medium", reason: "test" }]));

const fakeArmyFor = () => fakeArmy(roster);

async function setup(tasks: Record<string, unknown>[], who: Record<string, string> = {}) {
  const r = makeRepo({ "README.md": "hello\n", "src/a.txt": "a\n" });
  repos.push(r);
  const shadowRoot = join(r.dir, ".shadow");
  const plan = checked(tasks);
  const integration = await createIntegration(r.dir, shadowRoot, "t");
  return { r, shadowRoot, plan, integration, assignments: assign(plan, who) };
}

const build = (id: string, brief: string, claims: string[], over: Record<string, unknown> = {}) => ({ id, title: id, role: "build", claims, brief, ...over });

describe("execute", () => {
  it("runs independent tasks in parallel and merges each into the integration branch", async () => {
    const { r, shadowRoot, plan, integration, assignments } = await setup([
      build("a", "slow write one.txt=1", ["one.txt"]),
      build("b", "slow write two.txt=2", ["two.txt"]),
    ]);
    const army = fakeArmyFor();
    const events: RunEvent[] = [];
    const out = await execute({ runId: "t", checked: plan, assignments, integration, repoRoot: r.dir, shadowRoot, parallel: 2, dispatch: army.dispatch, onEvent: (e) => events.push(e) });

    expect(out.map((o) => [o.taskId, o.status, o.merged])).toEqual([["a", "ok", true], ["b", "ok", true]]);
    expect(army.maxActive()).toBe(2);
    expect(r.git("show", `${integration.branch}:one.txt`)).toBe("1");
    expect(r.git("show", `${integration.branch}:two.txt`)).toBe("2");
    expect(events.filter((e) => e.type === "start")).toHaveLength(2);
    // Merged task branches are gone (the run branch holds their commits); only the run branch is left.
    expect(r.git("branch", "--list", "shadow/*", "--format=%(refname:short)")).toBe(integration.branch);
    expect(await listWorktrees(r.dir, shadowRoot)).toEqual([{ name: "run-t", path: expect.any(String), branch: integration.branch }]);
    expect(await new Locks(shadowRoot).list()).toEqual([]);
  });

  it("never runs two writers with overlapping claims at the same time, even with room to", async () => {
    const { r, shadowRoot, plan, integration, assignments } = await setup([
      build("a", "slow write src/x.txt=1", ["src/**"]),
      build("b", "slow write src/y.txt=2", ["src/y.txt"]),
    ]);
    const army = fakeArmyFor();
    const out = await execute({ runId: "t", checked: plan, assignments, integration, repoRoot: r.dir, shadowRoot, parallel: 4, dispatch: army.dispatch });
    expect(out.every((o) => o.status === "ok" && o.merged)).toBe(true);
    expect(army.maxActive()).toBe(1);
  });

  it("respects the parallel limit", async () => {
    const { r, shadowRoot, plan, integration, assignments } = await setup([
      build("a", "slow write a1.txt=1", ["a1.txt"]),
      build("b", "slow write b1.txt=1", ["b1.txt"]),
      build("c", "slow write c1.txt=1", ["c1.txt"]),
    ]);
    const army = fakeArmyFor();
    await execute({ runId: "t", checked: plan, assignments, integration, repoRoot: r.dir, shadowRoot, parallel: 1, dispatch: army.dispatch });
    expect(army.maxActive()).toBe(1);
  });

  it("starts a dependent task from the merged work it depends on, with that task's report", async () => {
    const { r, shadowRoot, plan, integration, assignments } = await setup([
      build("a", "write src/base.txt=from-a", ["src/base.txt"]),
      build("b", "read src/base.txt and write src/next.txt=from-b", ["src/next.txt"], { dependsOn: ["a"] }),
    ]);
    const army = fakeArmyFor();
    const out = await execute({ runId: "t", checked: plan, assignments, integration, repoRoot: r.dir, shadowRoot, parallel: 2, dispatch: army.dispatch });
    expect(out[1]!.report!.summary).toBe("saw src/base.txt: from-a");
    expect(army.seen[1]!.context).toContain("[a] a (build by claude-sonnet): done");
    expect(r.git("show", `${integration.branch}:src/next.txt`)).toBe("from-b");
  });

  it("gives readers a snapshot of the merged work, and never a worktree of their own", async () => {
    const { r, shadowRoot, plan, integration, assignments } = await setup(
      [build("a", "write src/made.txt=yes", ["src/made.txt"]), { id: "r", title: "review", role: "review", brief: "read src/made.txt", dependsOn: ["a"] }],
      { r: "claude-opus" },
    );
    const army = fakeArmyFor();
    const out = await execute({ runId: "t", checked: plan, assignments, integration, repoRoot: r.dir, shadowRoot, parallel: 2, dispatch: army.dispatch });
    expect(out[1]).toMatchObject({ status: "ok", merged: false });
    expect(out[1]!.report!.summary).toBe("saw src/made.txt: yes");
    expect(army.seen[1]!.cwd.replace(/\\/g, "/")).toContain("/.shadow/worktrees/read-t-r");
    expect(existsSync(army.seen[1]!.cwd)).toBe(false); // the snapshot is removed afterwards
  });

  it("skips everything downstream of a failure and carries on with the rest", async () => {
    const { r, shadowRoot, plan, integration, assignments } = await setup([
      build("a", "fail", ["a.txt"]),
      build("b", "write b.txt=b", ["b.txt"], { dependsOn: ["a"] }),
      build("c", "write c.txt=c", ["c.txt"], { dependsOn: ["b"] }),
      build("d", "write d.txt=d", ["d.txt"]),
    ]);
    const army = fakeArmyFor();
    const events: RunEvent[] = [];
    const out = await execute({ runId: "t", checked: plan, assignments, integration, repoRoot: r.dir, shadowRoot, parallel: 2, dispatch: army.dispatch, onEvent: (e) => events.push(e) });
    const byId = Object.fromEntries(out.map((o) => [o.taskId, o]));
    expect(byId.a).toMatchObject({ status: "error", reason: "it broke", merged: false });
    expect(byId.b).toMatchObject({ status: "skipped", reason: "depends on a, which ended error" });
    expect(byId.c).toMatchObject({ status: "skipped", reason: "depends on b, which was skipped" });
    expect(byId.d).toMatchObject({ status: "ok", merged: true });
    expect(events.filter((e) => e.type === "skip")).toHaveLength(2);
    // The failed task's branch is kept for inspection; the merged one is not.
    expect(r.git("branch", "--list", byId.a!.report!.workspace!.branch)).toContain(byId.a!.report!.workspace!.branch);
    expect(r.git("branch", "--list", byId.d!.report!.workspace!.branch)).toBe("");
  });

  it("fails a task whose branch conflicts with the integration branch, aborting the merge cleanly", async () => {
    const { r, shadowRoot, plan, integration, assignments } = await setup([
      build("a", "write README.md=from-a", ["README.md"]),
      build("b", "conflicting", ["README.md"], { dependsOn: ["a"] }),
      build("c", "write c.txt=c", ["c.txt"], { dependsOn: ["b"] }),
    ]);
    // Task b's soldier works from the run's starting commit (not from a's merged work), so its edit to
    // the same file cannot merge.
    r.git("checkout", "-q", "-b", "stale", integration.base);
    r.write("README.md", "from-b\n");
    r.git("commit", "-qam", "stale edit");
    r.git("checkout", "-q", "main");
    const army = fakeArmyFor();
    const dispatch: Dispatch = async (task, a, ctx) => {
      if (task.id !== "b") return army.dispatch(task, a, ctx);
      const report: Report = {
        soldier: a.soldier, role: "build", model: "m", status: "ok", summary: "edited", filesTouched: ["README.md"],
        openQuestions: [], notes: [], structured: true, durationMs: 1,
        workspace: { branch: "stale", path: join(shadowRoot, "worktrees", "none"), base: integration.base, claims: ["README.md"], touched: ["README.md"], inScope: ["README.md"], outOfScope: [], reverted: false, commit: "abc1234", leaseLost: false, uncommittedIgnored: false },
      };
      return report;
    };
    const before = () => r.git("rev-parse", integration.branch);
    const out = await execute({ runId: "t", checked: plan, assignments, integration, repoRoot: r.dir, shadowRoot, parallel: 1, dispatch });
    expect(out[0]).toMatchObject({ status: "ok", merged: true });
    expect(out[1]).toMatchObject({ status: "conflict", reason: "merge conflict in README.md", merged: false });
    expect(out[2]).toMatchObject({ status: "skipped" });
    expect(r.git("show", `${integration.branch}:README.md`)).toBe("from-a");
    expect(r.git("-C", integration.path, "status", "--porcelain")).toBe("");
    expect(before()).toBe(r.git("rev-parse", integration.branch));
  });

  it("records a refused task (for example, a lease held outside the run) and skips its dependents", async () => {
    const { r, shadowRoot, plan, integration, assignments } = await setup([
      build("a", "write src/a.txt=x", ["src/a.txt"]),
      build("b", "write b.txt=b", ["b.txt"], { dependsOn: ["a"] }),
    ]);
    const outside = await new Locks(shadowRoot).acquire({ owner: "someone-else", claims: ["src/**"] });
    const army = fakeArmyFor();
    const out = await execute({ runId: "t", checked: plan, assignments, integration, repoRoot: r.dir, shadowRoot, parallel: 1, dispatch: army.dispatch });
    expect(out[0]!.status).toBe("refused");
    expect(out[0]!.reason).toMatch(/someone-else's lease/);
    expect(out[1]!.status).toBe("skipped");
    await new Locks(shadowRoot).release(outside.id);
  });
});
