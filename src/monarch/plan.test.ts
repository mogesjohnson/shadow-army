import { describe, expect, it } from "vitest";
import { ancestors, checkPlan, parsePlan, type Plan } from "./plan.js";

const block = (obj: unknown) => "Here is my plan.\n```shadow-plan\n" + JSON.stringify(obj) + "\n```";

const task = (over: Record<string, unknown>) => ({
  id: "t1",
  title: "Do it",
  role: "build",
  claims: ["src/a.ts"],
  brief: "Change src/a.ts so it does the thing.",
  ...over,
});

const plan = (tasks: Record<string, unknown>[]): Plan => {
  const p = parsePlan(block({ summary: "s", tasks }));
  if (!p.ok) throw new Error(p.errors.join("; "));
  return p.value;
};

describe("parsePlan", () => {
  it("reads the last shadow-plan block and fills defaults", () => {
    const p = parsePlan("```shadow-plan\n{\"tasks\": []}\n```\nnope, this one:\n" + block({ summary: "x", tasks: [task({})] }));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.summary).toBe("x");
    expect(p.value.tasks[0]).toMatchObject({ id: "t1", difficulty: "routine", dependsOn: [] });
  });

  it("explains what is wrong with a reply that is not a plan", () => {
    expect(parsePlan("no block here")).toMatchObject({ ok: false, errors: [expect.stringMatching(/no ```shadow-plan block/)] });
    expect(parsePlan("```shadow-plan\n{not json\n```")).toMatchObject({ ok: false, errors: [expect.stringMatching(/not valid JSON/)] });
    const bad = parsePlan(block({ tasks: [task({ role: "orchestrate" })] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join()).toMatch(/tasks\.0\.role/);
  });
});

describe("checkPlan", () => {
  it("accepts a valid plan and orders tasks after their dependencies, normalizing claims", () => {
    const c = checkPlan(
      plan([
        task({ id: "review", role: "review", claims: [], dependsOn: ["b", "a"] }),
        task({ id: "a", claims: ["./src/a.ts"] }),
        task({ id: "b", claims: ["docs/"] }),
      ]),
    );
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.value.order).toEqual(["a", "b", "review"]);
    expect(c.value.plan.tasks.find((t) => t.id === "a")!.claims).toEqual(["src/a.ts"]);
    expect(c.value.plan.tasks.find((t) => t.id === "b")!.claims).toEqual(["docs/**"]);
  });

  it("finds every structural problem in one pass", () => {
    const c = checkPlan(
      plan([
        task({ id: "a", dependsOn: ["ghost"] }),
        task({ id: "a" }),
        task({ id: "bad id!", claims: [] }),
        task({ id: "r", role: "review", claims: ["src/**"] }),
        task({ id: "x", claims: ["../escape"] }),
        task({ id: "self", dependsOn: ["self"] }),
      ]),
    );
    expect(c.ok).toBe(false);
    if (c.ok) return;
    const all = c.errors.join("\n");
    expect(all).toMatch(/unknown task "ghost"/);
    expect(all).toMatch(/"a" is used twice/);
    expect(all).toMatch(/task id "bad id!"/);
    expect(all).toMatch(/build task "bad id!" must list the files/);
    expect(all).toMatch(/review task "r" changes no files/);
    expect(all).toMatch(/build task "x": .*\.\./);
    expect(all).toMatch(/"self" depends on itself/);
  });

  it("rejects cycles and oversized plans", () => {
    const cyc = checkPlan(plan([task({ id: "a", dependsOn: ["b"] }), task({ id: "b", claims: ["x"], dependsOn: ["a"] })]));
    expect(cyc.ok).toBe(false);
    if (!cyc.ok) expect(cyc.errors.join()).toMatch(/cycle among: a, b/);

    const big = checkPlan(plan([task({ id: "a" }), task({ id: "b" }), task({ id: "c" })]), 2);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.errors.join()).toMatch(/3 tasks; the limit is 2/);
  });

  it("finds a task's ancestors through any depth", () => {
    const p = plan([task({ id: "a" }), task({ id: "b", dependsOn: ["a"] }), task({ id: "c", role: "review", claims: [], dependsOn: ["b"] })]);
    expect([...ancestors(p, "c")].sort()).toEqual(["a", "b"]);
    expect([...ancestors(p, "a")]).toEqual([]);
  });
});
