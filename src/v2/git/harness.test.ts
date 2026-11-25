import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGitArgs, HarnessGit, HarnessGitHeld, HarnessGitTimeout, LIMIT_MS, resolveGit } from "./harness.js";
import { createFakeClock, createHostileRepo } from "./hostileRepo.testutil.js";

const hang = fileURLToPath(new URL("../../../test/fakes/git-hang.mjs", import.meta.url));
const folders: string[] = [];
const temp = () => { const folder = mkdtempSync(join(tmpdir(), "sa-harness-")); folders.push(folder); return folder; };
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const gitName = process.platform === "win32" ? "git.exe" : "git";
const until = async (ok: () => boolean) => { for (let i = 0; i < 600 && !ok(); i++) await new Promise((r) => setTimeout(r, 50)); expect(ok()).toBe(true); };
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe("harness git PATH and overrides", () => {
  it("takes git from the first absolute entry that has it, dropping and naming the rest", () => {
    const [snapshot, first, second] = [temp(), temp(), temp()];
    for (const folder of [snapshot, first, second]) writeFileSync(join(folder, gitName), "");
    const found = resolveGit(["", ".", "node_modules/.bin", join(first, "missing"), snapshot, first, second].join(delimiter), [snapshot]);
    expect(found.git).toBe(realpathSync.native(join(first, gitName)));
    expect(found.path).toBe([first, second].join(delimiter));
    expect(found.dropped.map((drop) => drop.reason)).toEqual(["not fully qualified", "not fully qualified", "not fully qualified", "missing", "inside the folder, a worktree or a snapshot"]);
  });

  it("drops entries inside the checkout and its worktrees, compared by whole components, and unqualified entries", () => {
    const base = temp(), work = join(base, "work"), tree = join(base, "tree"), dotted = join(work, "..bin"), outside = temp();
    for (const folder of [join(work, ".git", "worktrees", "t"), dotted, tree, outside]) mkdirSync(folder, { recursive: true });
    writeFileSync(join(work, ".git", "worktrees", "t", "gitdir"), `${join(tree, ".git")}\n`);
    for (const folder of [dotted, tree, outside]) writeFileSync(join(folder, gitName), "");
    const env = { PATH: [dotted, tree, outside].join(delimiter) };
    const harness = new HarnessGit({ repo: { gitDir: join(work, ".git"), workTree: work, commonDir: join(work, ".git") }, hooksDir: base, env });
    expect(harness.file).toBe(realpathSync.native(join(outside, gitName)));
    expect(harness.dropped.map((drop) => drop.entry)).toEqual([dotted, tree]);
    if (process.platform === "win32") expect(resolveGit(`\\${outside.slice(3)}`, []).dropped[0]?.reason).toBe("not fully qualified");
  });

  it("drops an entry whose git is a link into the checkout (needs symlink rights; skipped on Windows without them)", (ctx) => {
    const work = temp(), link = join(temp(), gitName);
    writeFileSync(join(work, gitName), "");
    try { symlinkSync(join(work, gitName), link); } catch { ctx.skip(); }
    expect(resolveGit(join(link, ".."), [work]).git).toBeUndefined();
  });

  it("overrides hooks, fsmonitor, signing and credentials, and adds per-command flags", () => {
    const base = { hooksDir: "/empty", hookNames: ["fmt", "a=b"] };
    const diff = buildGitArgs(["diff", "HEAD"], { ...base, kind: "guard" });
    expect(diff.args).toEqual(expect.arrayContaining(["--no-pager", "--no-optional-locks", "core.hooksPath=/empty", "hook.fmt.enabled=false", "hook.pre-commit.enabled=false",
      "commit.gpgSign=false", "credential.interactive=false", "core.useReplaceRefs=false"].map((v) => (v.includes("=") ? expect.stringContaining(v) : v))));
    expect(diff.args.slice(diff.args.indexOf("diff"))).toEqual(["diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "HEAD"]);
    expect(buildGitArgs(["commit", "-m", "x"], { ...base, kind: "other" }).args.slice(-4)).toEqual(["commit", "--no-verify", "-m", "x"]);
    expect(diff.args).toContain("core.fsmonitor="); // empty: off on Git 2.34 (a hook path there) and later (a boolean)
    expect(diff.args).toContain("--config-env=hook.a=b.enabled=SA_GIT_CONFIG_0");
    expect(diff.env).toEqual({ SA_GIT_CONFIG_0: "false" });
  });
});

describe("a hostile repository", () => {
  it("runs its hooks, programs and signing under plain git (the control)", () => {
    const repo = createHostileRepo(temp());
    const plain = (...args: string[]) => { try { execFileSync("git", args, { cwd: repo.root, stdio: "pipe" }); } catch { /* signing fails */ } };
    plain("checkout", "-q", "-b", "x"); plain("status"); plain("diff"); plain("commit", "-q", "--allow-empty", "-m", "c");
    expect(repo.ran()).toEqual(expect.arrayContaining(["hook-post-checkout", "fsmonitor", "external-diff", "signing", "hook-pre-commit"]));
  });

  it("runs none of them under harness git", async () => {
    const base = temp(), repo = createHostileRepo(base), hooksDir = join(base, "empty-hooks");
    mkdirSync(hooksDir);
    const harness = new HarnessGit({ repo: { gitDir: repo.gitDir, workTree: repo.root, commonDir: repo.gitDir }, hooksDir, hookNames: ["fmt"] });
    for (const [args, kind] of [[["checkout", "-q", "-b", "x"], "snapshot"], [["status", "--porcelain"], "guard"], [["diff"], "guard"], [["commit", "-q", "--allow-empty", "-m", "c"], "other"]] as const) {
      const result = await harness.run([...args], kind);
      expect(result.code, result.stderr).toBe(0);
    }
    expect((await harness.run(["diff"])).stdout).toContain("+two");
    expect(repo.ran()).toEqual([]);
  }, 60_000);
});

const fakeProcess = (close: () => Promise<void>) => {
  const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough();
  stdout.end(); stderr.end();
  return { pid: 1, stdin, stdout, stderr, exited: new Promise<never>(() => {}), close: vi.fn(close) };
};

describe("process tree registration", () => {
  const repo = { gitDir: "/g", workTree: tmpdir(), commonDir: "/c" };
  it("ends git when registration fails, and keeps the sweep record when teardown is unconfirmed", async () => {
    const proc = fakeProcess(async () => {});
    const trees = { add: vi.fn(async () => { throw new Error("store down"); }), remove: vi.fn(async () => {}) };
    const harness = new HarnessGit({ repo, hooksDir: repo.workTree, trees, git: { file: "git" }, spawn: async () => proc });
    await expect(harness.run(["status"])).rejects.toThrow("store down");
    expect(proc.close).toHaveBeenCalled();
    const stuck = fakeProcess(async () => { throw new Error("tree still running"); });
    const kept = { add: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
    const clock = createFakeClock();
    const second = new HarnessGit({ repo, hooksDir: repo.workTree, trees: kept, clock, git: { file: "git" }, spawn: async () => stuck });
    const result = second.run(["status"]).catch((error: unknown) => error);
    await until(() => kept.add.mock.calls.length === 1);
    clock.advance(LIMIT_MS.other);
    expect(String(await result)).toContain("tree still running");
    expect(kept.remove).not.toHaveBeenCalled();
  });
});

describe("limits on a monotonic clock", () => {
  const setup = () => {
    const base = temp(), pids = join(base, "pids.jsonl"), clock = createFakeClock();
    writeFileSync(pids, "");
    const lines = () => readFileSync(pids, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as { pid: number; child: boolean; term: string; dir: string });
    const env = { ...process.env, GIT_HANG_PIDS: pids };
    const harness = new HarnessGit({ repo: { gitDir: "/g", workTree: base, commonDir: "/c" }, hooksDir: base, env, clock, git: { file: process.execPath, prefix: [hang] } });
    return { harness, clock, lines };
  };

  it("ends a git that never exits, with its child, at the limit and not before", async () => {
    const { harness, clock, lines } = setup();
    const result = harness.run(["status"], "snapshot").then(() => "done", (error: unknown) => error);
    await until(() => lines().length === 2);
    clock.suspend(60 * 60_000); // an hour of sleep is not an hour of the monotonic clock
    clock.advance(LIMIT_MS.snapshot - 1);
    expect(await Promise.race([result, new Promise((r) => setTimeout(() => r("running"), 300))])).toBe("running");
    clock.advance(1);
    const error = await result;
    expect(error).toBeInstanceOf(HarnessGitTimeout);
    expect((error as Error).message).toBe("git took longer than 30 min");
    expect(lines()[0]).toMatchObject({ term: "0", dir: "/g" });
    await until(() => lines().every((line) => !alive(line.pid)));
  }, 60_000);

  it("lets git that runs past the stdin grace finish with its output", async () => {
    const base = temp();
    const harness = new HarnessGit({ repo: { gitDir: "/g", workTree: base, commonDir: "/c" }, hooksDir: base, env: { ...process.env, GIT_HANG_EXIT_MS: "3500" }, git: { file: process.execPath, prefix: [hang] } });
    expect(await harness.run(["status"])).toMatchObject({ code: 0, stdout: "finished\n" });
  }, 30_000);

  it("tries a guard command once more, then holds harness git until the next use retries", async () => {
    const { harness, clock, lines } = setup();
    const result = harness.run(["status"], "guard").catch((error: unknown) => error);
    await until(() => lines().length === 2);
    clock.advance(LIMIT_MS.guard);
    await until(() => lines().length === 4); // the second try
    clock.advance(LIMIT_MS.guard);
    const error = await result;
    expect(error).toBeInstanceOf(HarnessGitHeld);
    expect(harness.held).toBe("git took longer than 5 min, twice");
    await expect(harness.run(["status"], "guard")).rejects.toBeInstanceOf(HarnessGitHeld);
    expect(lines()).toHaveLength(4);
    harness.retryHold();
    expect(harness.held).toBeUndefined();
    await until(() => lines().every((line) => !alive(line.pid)));
  }, 90_000);
});
