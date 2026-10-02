import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Adapter, RunRequest, RunResult } from "../adapters/Adapter.js";
import { Locks } from "../workspace/locks.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { listWorktrees } from "../workspace/worktree.js";
import { MAX_PROMPT_CHARS } from "./brief.js";
import { shippedRoster } from "./roster.testutil.js";
import { renderReport, summon, SummonError } from "./summon.js";

vi.setConfig({ testTimeout: 60_000 });

const roster = shippedRoster();
const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});
const repo = () => {
  const r = makeRepo({ "README.md": "hello\n", "src/a.ts": "a\n" });
  repos.push(r);
  return r;
};

const ok: RunResult = { text: '```shadow-report\n{"summary":"did it","filesTouched":["made-up.ts"]}\n```', isError: false };

/** A soldier that writes `files` into the directory it is run in, then answers with `result`. */
function writer(files: Record<string, string>, result: RunResult = ok, gate?: Promise<void>) {
  const calls: RunRequest[] = [];
  const adapter: Adapter = {
    id: "fake",
    label: "Fake",
    command: "fake",
    capabilities: { write: true, review: true },
    detect: async () => ({ found: true }),
    listModels: async () => ({ source: "cli", models: [] }),
    async run(req) {
      calls.push(req);
      if (gate) await gate;
      for (const [p, content] of Object.entries(files)) {
        mkdirSync(dirname(join(req.cwd, p)), { recursive: true });
        writeFileSync(join(req.cwd, p), content);
      }
      return result;
    },
  };
  return { adapter, calls };
}

const shadow = (dir: string) => join(dir, ".shadow");

describe("summon --write", () => {
  it("runs the soldier in its own worktree, keeps claimed edits, reverts the rest, and frees the lease", async () => {
    const r = repo();
    const { adapter, calls } = writer({ "src/a.ts": "changed\n", "src/new.ts": "new\n", "README.md": "vandalized\n" });
    const report = await summon({
      roster,
      soldier: "claude-sonnet",
      role: "build",
      task: "improve src",
      cwd: r.dir,
      write: true,
      claims: ["src/**"],
      adapter,
    });

    // The soldier ran in a worktree, not the user's checkout, and was told its claims.
    expect(calls[0]!.write).toBe(true);
    expect(calls[0]!.cwd.replace(/\\/g, "/")).toContain("/.shadow/worktrees/claude-sonnet-");
    expect(calls[0]!.prompt).toContain("You may only create or change files matching: src/**");
    expect(readFileSync(join(r.dir, "README.md"), "utf8")).toBe("hello\n");
    expect(readFileSync(join(r.dir, "src/a.ts"), "utf8")).toBe("a\n");

    // The audit, not the soldier's own claim ("made-up.ts"), says what was touched.
    const w = report.workspace!;
    expect(report.status).toBe("ok");
    expect(report.filesTouched).toEqual(["src/a.ts", "src/new.ts"]);
    expect(w.outOfScope).toEqual(["README.md"]);
    expect(w.reverted).toBe(true);
    expect(w.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(r.git("diff", "--name-only", w.base, w.branch).split("\n")).toEqual(["src/a.ts", "src/new.ts"]);
    expect(r.git("log", "-1", "--format=%s", w.branch)).toBe("shadow(claude-sonnet): improve src");

    expect(await new Locks(shadow(r.dir)).list()).toEqual([]);
    const text = renderReport(report);
    expect(text).toContain(`Branch: ${w.branch}`);
    expect(text).toContain("SCOPE VIOLATION");
  });

  it("still reverts and commits when the soldier fails, and marks the commit as a failed run", async () => {
    const r = repo();
    const { adapter } = writer({ "src/a.ts": "half done\n", "README.md": "x\n" }, { text: "", isError: true, errorMessage: "timed out" });
    const report = await summon({ roster, soldier: "grok", task: "do it", cwd: r.dir, write: true, claims: ["src/"], adapter });
    expect(report.status).toBe("error");
    expect(report.workspace!.outOfScope).toEqual(["README.md"]);
    expect(r.git("log", "-1", "--format=%s", report.workspace!.branch)).toBe("shadow(grok) [failed run]: do it");
    expect(r.git("diff", "--name-only", report.workspace!.base, report.workspace!.branch)).toBe("src/a.ts");
    expect(await new Locks(shadow(r.dir)).list()).toEqual([]);
  });

  it("refuses a second soldier on overlapping files while the first is working", async () => {
    const r = repo();
    let open!: () => void;
    const gate = new Promise<void>((res) => (open = res));
    const first = writer({ "src/a.ts": "first\n" }, ok, gate);
    const running = summon({ roster, soldier: "grok", task: "first", cwd: r.dir, write: true, claims: ["src/**"], adapter: first.adapter });

    // Wait until the first soldier holds its lease.
    for (let i = 0; i < 200 && (await new Locks(shadow(r.dir)).list()).length === 0; i++) await new Promise((res) => setTimeout(res, 25));

    const second = writer({ "src/a.ts": "second\n" });
    await expect(
      summon({ roster, soldier: "codex-sol", task: "second", cwd: r.dir, write: true, claims: ["src/a.ts"], adapter: second.adapter }),
    ).rejects.toThrow(/grok's lease on src\/\*\*/);
    expect(second.calls).toHaveLength(0);

    open();
    expect((await running).status).toBe("ok");
    expect(await new Locks(shadow(r.dir)).list()).toEqual([]);
  });

  it("leaves no worktree, branch or lease behind when the run fails before the soldier starts", async () => {
    const r = repo();
    const { adapter, calls } = writer({});
    await expect(
      summon({ roster, soldier: "grok", task: "x".repeat(MAX_PROMPT_CHARS), cwd: r.dir, write: true, claims: ["src/**"], adapter }),
    ).rejects.toBeInstanceOf(SummonError);
    expect(calls).toHaveLength(0);
    expect(await listWorktrees(r.dir, shadow(r.dir))).toEqual([]);
    expect(r.git("branch", "--list", "shadow/*")).toBe("");
    expect(await new Locks(shadow(r.dir)).list()).toEqual([]);
  });

  it("checks the hard rules before touching the repository: agy never gets a worktree", async () => {
    const r = repo();
    const { adapter, calls } = writer({});
    const readOnly = { ...adapter, capabilities: { write: false, review: false } };
    await expect(
      summon({ roster, soldier: "agy", role: "research", task: "x", cwd: r.dir, write: true, claims: ["src/**"], adapter: readOnly }),
    ).rejects.toThrow(/read-only/);
    expect(calls).toHaveLength(0);
    expect(existsSync(shadow(r.dir))).toBe(false);
  });
});

describe("read-only summon", () => {
  it("for a supervised soldier, takes no lease and makes no worktree", async () => {
    const r = repo();
    const { adapter, calls } = writer({});
    await summon({ roster, soldier: "claude-sonnet", task: "look", cwd: r.dir, autonomy: "supervised", adapter });
    expect(calls[0]!.cwd).toBe(r.dir);
    expect(existsSync(shadow(r.dir))).toBe(false);
  });
});
