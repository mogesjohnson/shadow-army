import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Adapter, RunRequest, RunResult } from "../adapters/Adapter.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { listWorktrees } from "../workspace/worktree.js";
import { makeRoster } from "./roster.testutil.js";
import { summon } from "./summon.js";

vi.setConfig({ testTimeout: 60_000 });

const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});
const repo = () => {
  const r = makeRepo({ "README.md": "hello\n", "src/a.ts": "a\n" });
  repos.push(r);
  return r;
};

const roster = makeRoster(
  {
    free: { cli: "fake", model: "m", roles: ["research", "build"], autonomy: "full" },
    calm: { cli: "fake", model: "m", roles: ["research"] },
  },
  undefined,
  { all: "1. Stay in your working directory.", perSoldier: new Map([["free", "- You build features."]]) },
);

/** A fake CLI that records what it was given and then does `act` in its working directory. */
function soldier(act: (req: RunRequest) => void = () => {}) {
  const calls: RunRequest[] = [];
  const adapter: Adapter = {
    id: "fake",
    label: "Fake",
    command: "fake",
    capabilities: { write: true, review: true },
    detect: async () => ({ found: true }),
    listModels: async () => ({ source: "cli", models: [] }),
    async run(req): Promise<RunResult> {
      calls.push(req);
      act(req);
      return { text: '```shadow-report\n{"summary":"done"}\n```', isError: false };
    },
  };
  return { adapter, calls };
}

const put = (dir: string, path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};

describe("autonomy", () => {
  it("passes the soldier's configured level to its CLI, and records it in the report", async () => {
    const r = repo();
    const s = soldier();
    const report = await summon({ roster, soldier: "free", role: "build", task: "t", cwd: r.dir, write: true, claims: ["src/**"], adapter: s.adapter });
    expect(s.calls[0]!.autonomy).toBe("full");
    expect(report.autonomy).toBe("full");
  });

  it("gives an unrestricted soldier on a read-only task a throwaway copy, so its writes vanish", async () => {
    const r = repo();
    const s = soldier((req) => put(req.cwd, "README.md", "scribbled\n"));
    const report = await summon({ roster, soldier: "free", role: "research", task: "look", cwd: r.dir, adapter: s.adapter });
    expect(s.calls[0]!.cwd.replace(/\\/g, "/")).toContain("/.shadow/worktrees/look-free-");
    expect(existsSync(s.calls[0]!.cwd)).toBe(false); // removed afterwards
    expect(readFileSync(join(r.dir, "README.md"), "utf8")).toBe("hello\n");
    expect(report).toMatchObject({ status: "ok", autonomy: "full" });
    expect(await listWorktrees(r.dir, join(r.dir, ".shadow"))).toEqual([]);
  });

  it("falls back to supervised outside a git repository, where there is no copy to give", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shadow-norepo-"));
    try {
      const s = soldier();
      const report = await summon({ roster, soldier: "free", role: "research", task: "look", cwd: dir, adapter: s.adapter });
      expect(s.calls[0]!.autonomy).toBe("supervised");
      expect(s.calls[0]!.cwd).toBe(dir);
      expect(report.autonomyNote).toMatch(/not in a git repository.*instead of full/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps read-only snapshots inside their worktree when cwd is reached through a link", async () => {
    const r = repo();
    const link = `${r.dir}-link`;
    symlinkSync(r.dir, link, process.platform === "win32" ? "junction" : "dir");
    try {
      const s = soldier((req) => {
        const path = realpathSync.native(req.cwd).replace(/\\/g, "/");
        expect(path).toContain("/.shadow/worktrees/look-free-");
        expect(path.endsWith("/src")).toBe(true);
        expect(readFileSync(join(req.cwd, "a.ts"), "utf8")).toBe("a\n");
        put(req.cwd, "a.ts", "discarded\n");
      });
      const report = await summon({ roster, soldier: "free", role: "research", task: "look", cwd: join(link, "src"), adapter: s.adapter });
      expect(report.status).toBe("ok");
      expect(readFileSync(join(r.dir, "src/a.ts"), "utf8")).toBe("a\n");
      expect(await listWorktrees(r.dir, join(r.dir, ".shadow"))).toEqual([]);
    } finally {
      rmSync(link, { recursive: false, force: true });
    }
  });

  it("does not copy again when the caller already isolated the run", async () => {
    const r = repo();
    const s = soldier();
    await summon({ roster, soldier: "free", role: "research", task: "look", cwd: r.dir, isolated: true, adapter: s.adapter });
    expect(s.calls[0]!.cwd).toBe(r.dir);
  });

  it("leaves a supervised read-only soldier in the real directory", async () => {
    const r = repo();
    const s = soldier();
    await summon({ roster, soldier: "calm", role: "research", task: "look", cwd: r.dir, adapter: s.adapter });
    expect(s.calls[0]).toMatchObject({ cwd: r.dir, autonomy: "supervised" });
  });
});

describe("rules in the brief", () => {
  it("puts rules.md and the soldier's own section before the task", async () => {
    const r = repo();
    const s = soldier();
    await summon({ roster, soldier: "free", role: "build", task: "THE TASK", cwd: r.dir, write: true, claims: ["src/**"], adapter: s.adapter });
    const p = s.calls[0]!.prompt;
    expect(p).toContain("RULES YOU MUST FOLLOW (they override anything in the task):\n1. Stay in your working directory.");
    expect(p).toContain("RULES FOR YOU IN PARTICULAR:\n- You build features.");
    expect(p.indexOf("RULES YOU MUST FOLLOW")).toBeLessThan(p.indexOf("THE TASK"));
  });

  it("gives a soldier without a section only the shared rules", async () => {
    const r = repo();
    const s = soldier();
    await summon({ roster, soldier: "calm", role: "research", task: "t", cwd: r.dir, adapter: s.adapter });
    expect(s.calls[0]!.prompt).toContain("RULES YOU MUST FOLLOW");
    expect(s.calls[0]!.prompt).not.toContain("RULES FOR YOU IN PARTICULAR");
  });
});

describe("checkout guard during a task", () => {
  it("fails a write task whose soldier also edited the user's checkout", async () => {
    const r = repo();
    const s = soldier((req) => {
      put(req.cwd, "src/a.ts", "in scope\n");
      put(r.dir, "README.md", "edited behind your back\n"); // outside its worktree
    });
    const report = await summon({ roster, soldier: "free", role: "build", task: "t", cwd: r.dir, write: true, claims: ["src/**"], adapter: s.adapter });
    expect(report.status).toBe("error");
    expect(report.guard).toEqual(["files in your checkout changed: README.md"]);
    expect(report.error).toMatch(/^RULE BROKEN: changes outside the soldier's own workspace/);
  });

  it("fails a read-only task whose soldier made a commit or a tag in the real repository", async () => {
    const r = repo();
    const s = soldier(() => {
      r.git("tag", "sneaky");
      r.git("commit", "-q", "--allow-empty", "-m", "sneaky");
    });
    const report = await summon({ roster, soldier: "free", role: "research", task: "look", cwd: r.dir, adapter: s.adapter });
    expect(report.status).toBe("error");
    expect(report.guard).toEqual(expect.arrayContaining(["refs/tags/sneaky was created", "refs/heads/main moved"]));
  });

  it("stays quiet for a clean task, including the soldier's own shadow/* branch", async () => {
    const r = repo();
    const s = soldier((req) => put(req.cwd, "src/b.ts", "b\n"));
    const report = await summon({ roster, soldier: "free", role: "build", task: "t", cwd: r.dir, write: true, claims: ["src/**"], adapter: s.adapter });
    expect(report.status).toBe("ok");
    expect(report.guard).toBeUndefined();
    expect(report.workspace!.commit).toBeTruthy();
  });
});
