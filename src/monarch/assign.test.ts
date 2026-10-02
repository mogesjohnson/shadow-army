import { describe, expect, it } from "vitest";
import { getAdapter } from "../adapters/registry.js";
import { shippedRoster } from "../core/roster.testutil.js";
import { assignTasks } from "./assign.js";
import { checkPlan, parsePlan } from "./plan.js";

// The shipped roster and the real adapters' capabilities: the real hard rules.
const roster = shippedRoster();
const all = () => true;

function checked(tasks: Record<string, unknown>[]) {
  const p = parsePlan("```shadow-plan\n" + JSON.stringify({ tasks }) + "\n```");
  if (!p.ok) throw new Error(p.errors.join());
  const c = checkPlan(p.value);
  if (!c.ok) throw new Error(c.errors.join());
  return c.value;
}
const build = (id: string, over: Record<string, unknown> = {}) => ({ id, title: id, role: "build", claims: [`${id}/**`], brief: "b", ...over });

describe("assignTasks", () => {
  it("uses the Monarch's pick when the rules allow it", () => {
    const r = assignTasks(checked([build("a", { soldier: "codex-sol" })]), roster, getAdapter, all);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.get("a")).toMatchObject({ soldier: "codex-sol", reason: "the Monarch's choice" });
  });

  it("overrides a pick the rules forbid, and says why: Grok never reviews", () => {
    const r = assignTasks(
      checked([build("a"), { id: "r", title: "review", role: "review", soldier: "grok", dependsOn: ["a"], brief: "b" }]),
      roster,
      getAdapter,
      all,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.get("r")!.soldier).toBe("claude-opus");
    expect(r.value.get("r")!.overridden).toEqual({ wanted: "grok", because: "grok (Grok Build) never takes review tasks" });
  });

  it("never lets a soldier review work it built, at any depth", () => {
    // claude-opus is the only reviewer and builds hard tasks; if it built anything upstream, nobody may review.
    const r = assignTasks(
      checked([
        build("a", { difficulty: "hard", soldier: "claude-opus" }),
        build("b", { dependsOn: ["a"] }),
        { id: "r", title: "review", role: "review", dependsOn: ["b"], brief: "b" },
      ]),
      roster,
      getAdapter,
      all,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/nobody may take review task "r".*claude-opus: wrote the change/);
  });

  it("leaves out soldiers whose CLI is not installed", () => {
    const noClaude = (cli: string) => cli !== "claude";
    const r = assignTasks(checked([build("a", { soldier: "claude-sonnet" })]), roster, getAdapter, noClaude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.get("a")!.soldier).toBe("grok");
    expect(r.value.get("a")!.overridden?.because).toMatch(/not installed/);
  });

  it("reports an unknown preferred soldier and still assigns the task", () => {
    const r = assignTasks(checked([build("a", { soldier: "ghost" })]), roster, getAdapter, all);
    expect(r.ok && r.value.get("a")!.overridden).toEqual({ wanted: "ghost", because: "no such soldier" });
  });

  it("agy can research but can never be given a build", () => {
    const r = assignTasks(
      checked([{ id: "q", title: "q", role: "research", brief: "b" }, build("a", { soldier: "agy" })]),
      roster,
      getAdapter,
      all,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.get("q")!.soldier).toBe("agy");
    expect(r.value.get("a")!.soldier).not.toBe("agy");
  });
});
