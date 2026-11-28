import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { delimiter, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGitArgs, HarnessGit, HarnessGitHeld, HarnessGitTimeout, LIMIT_MS, osStartStamp, resolveGit, spawnPosix, type SweepEntry } from "./harness.js";
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

  it("resolves a relative worktree link against its registration folder, and fails closed on one it cannot read", () => {
    const base = temp(), work = join(base, "work"), admin = join(work, ".git", "worktrees", "t"), tree = join(base, "tree"), outside = temp();
    for (const folder of [admin, tree, outside]) mkdirSync(folder, { recursive: true });
    // Git writes this form under worktree.useRelativePaths: relative to the registration folder, not to anyone's cwd.
    writeFileSync(join(admin, "gitdir"), `${relative(realpathSync.native(admin), join(realpathSync.native(tree), ".git")).split("\\").join("/")}
`);
    for (const folder of [tree, outside]) writeFileSync(join(folder, gitName), "");
    const repo = { gitDir: join(work, ".git"), workTree: work, commonDir: join(work, ".git") };
    const harness = new HarnessGit({ repo, hooksDir: base, env: { PATH: [tree, outside].join(delimiter) } });
    expect(harness.dropped.map((drop) => drop.entry)).toEqual([tree]);
    mkdirSync(join(work, ".git", "worktrees", "unread"));
    expect(() => new HarnessGit({ repo, hooksDir: base, env: { PATH: outside } })).toThrow("the worktree inventory could not be checked");
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
  const stamp = async () => "test:1";
  const repo = { gitDir: "/g", workTree: tmpdir(), commonDir: "/c" };
  it("ends git when registration fails, and keeps the sweep record when teardown is unconfirmed", async () => {
    const proc = fakeProcess(async () => {});
    const trees = { add: vi.fn(async () => { throw new Error("store down"); }), remove: vi.fn(async () => {}) };
    const harness = new HarnessGit({ repo, hooksDir: repo.workTree, trees, stamp, git: { file: "git" }, spawn: async () => proc });
    await expect(harness.run(["status"])).rejects.toThrow("store down");
    expect(proc.close).toHaveBeenCalled();
    const stuck = fakeProcess(async () => { throw new Error("tree still running"); });
    const kept = { add: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
    const clock = createFakeClock();
    const second = new HarnessGit({ repo, hooksDir: repo.workTree, trees: kept, stamp, clock, git: { file: "git" }, spawn: async () => stuck });
    const result = second.run(["status"]).catch((error: unknown) => error);
    await until(() => kept.add.mock.calls.length === 1);
    run(clock, LIMIT_MS.other);
    expect(String(await result)).toContain("tree still running");
    expect(kept.remove).not.toHaveBeenCalled();
  });

  it("bounds a registration that never finishes by the same limit", async () => {
    const proc = fakeProcess(async () => {});
    const trees = { add: vi.fn(() => new Promise<void>(() => {})), remove: vi.fn(async () => {}) };
    const clock = createFakeClock();
    const harness = new HarnessGit({ repo, hooksDir: repo.workTree, trees, stamp, clock, git: { file: "git" }, spawn: async () => proc });
    const result = harness.run(["status"]).catch((error: unknown) => error);
    await until(() => trees.add.mock.calls.length === 1);
    run(clock, LIMIT_MS.other);
    expect(await result).toBeInstanceOf(HarnessGitTimeout);
    expect(proc.close).toHaveBeenCalled();
  });
});

describe("git starts behind a gate until its sweep entry is recorded (C30)", () => {
  const repo = { gitDir: "/g", workTree: tmpdir(), commonDir: "/c" };
  it("spawns the gate, stamps the pid with the OS start stamp, registers it, and only then releases git", async () => {
    const order: string[] = [], stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough();
    stdout.end(); stderr.end();
    let exit!: (value: { code: number; signal: null }) => void;
    const exited = new Promise<{ code: number; signal: null }>((done) => { exit = done; });
    stdin.on("data", (chunk) => { order.push(`released ${String(chunk).trim()}`); exit({ code: 0, signal: null }); });
    const proc = { pid: 7, stdin, stdout, stderr, exited, close: vi.fn(async () => {}), droppedPath: [] };
    let started: { file: string; args?: string[] } | undefined;
    const trees = { add: vi.fn(async (entry: { pid: number; startedAt: string }) => { order.push(`added ${entry.pid} ${entry.startedAt}`); }), remove: vi.fn(async () => {}) };
    const stamp = async (pid: number) => { order.push(`stamp ${pid}`); return "linux:4242"; };
    const harness = new HarnessGit({ repo, hooksDir: repo.workTree, trees, stamp, clock: createFakeClock(), git: { file: "git" },
      spawn: async (options) => { started = options; order.push("spawned"); return proc; } });
    expect((await harness.run(["status"])).code).toBe(0);
    expect(order).toEqual(["spawned", "stamp 7", "added 7 linux:4242", "released go"]);
    expect(started!.file).not.toBe("git"); // the gate, with git after it
    expect(started!.args).toContain("git");
    expect(trees.remove).toHaveBeenCalled();
  });

  it("runs nothing when the registration fails, and runs git once it is recorded, with the real gate and stamp", async () => {
    const base = temp(), marker = join(base, "ran"), script = join(base, "git.mjs");
    writeFileSync(script, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "x");\n`);
    const git = { file: process.execPath, prefix: [script] };
    const refused = new HarnessGit({ repo: { gitDir: base, workTree: base, commonDir: base }, hooksDir: base, git,
      trees: { add: async () => { await new Promise((r) => setTimeout(r, 500)); throw new Error("store down"); }, remove: async () => {} } });
    await expect(refused.run(["status"])).rejects.toThrow("store down");
    await new Promise((r) => setTimeout(r, 500));
    expect(existsSync(marker)).toBe(false); // git never ran
    const entries: { pid: number; startedAt: string }[] = [];
    const harness = new HarnessGit({ repo: { gitDir: base, workTree: base, commonDir: base }, hooksDir: base, git, trees: {
      add: async (entry) => { await new Promise((r) => setTimeout(r, 500)); expect(existsSync(marker)).toBe(false); entries.push(entry); }, remove: async () => {} } });
    expect((await harness.run(["status"])).code).toBe(0);
    expect(existsSync(marker)).toBe(true);
    expect(entries[0]!.startedAt).toMatch(new RegExp(`^${process.platform}:\\S`));
  }, 60_000);

  it.runIf(process.platform !== "darwin")("reads the OS start stamp, the same for the same process", async () => {
    const stamp = await osStartStamp(process.pid);
    expect(stamp).toMatch(new RegExp(`^${process.platform}:\\S`));
    expect(await osStartStamp(process.pid)).toBe(stamp);
  }, 60_000);
});

/** Runs the fake clock in one-second steps, as a post office that never stops does. */
const run = (clock: ReturnType<typeof createFakeClock>, ms: number) => { for (let left = ms; left > 0; left -= 1_000) clock.advance(Math.min(1_000, left)); };

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
    clock.suspend(60 * 60_000); // an hour of Linux suspend is not an hour of the monotonic clock
    clock.advance(60 * 60_000); // an hour of Windows or macOS sleep is one long step, of which 5 s count
    expect(await Promise.race([result, new Promise((r) => setTimeout(() => r("running"), 5_000))])).toBe("running");
    expect(lines().every((line) => alive(line.pid))).toBe(true);
    run(clock, LIMIT_MS.snapshot - 5_000 - 1);
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
    run(clock, LIMIT_MS.guard);
    await until(() => lines().length === 4); // the second try
    run(clock, LIMIT_MS.guard);
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

describe("each attempt's own sweep entry, gone only once its tree is (C34, C35, C38)", () => {
  const stamp = async () => "test:1";
  const repo = { gitDir: "/g", workTree: tmpdir(), commonDir: "/c" };

  it("lands a timed-out attempt's late add, and its removal, before the retry's add (C34)", async () => {
    // Codex's probe: a sweep slot scoped to the command, whose remove takes no identity.
    let slot: SweepEntry | undefined, release!: () => void, exit!: (exit: { code: number; signal: null }) => void;
    const late = new Promise<void>((done) => { release = done; });
    const trees = { add: vi.fn(async (entry: SweepEntry) => { if (entry.pid === 100) await late; slot = entry; }), remove: vi.fn(async () => { slot = undefined; }) };
    const first = { ...fakeProcess(async () => {}), pid: 100 };
    const retry = { ...fakeProcess(async () => {}), pid: 200, exited: new Promise<{ code: number; signal: null }>((done) => { exit = done; }) };
    const spawned = [first, retry], clock = createFakeClock();
    const harness = new HarnessGit({ repo, hooksDir: repo.workTree, trees, stamp, clock, git: { file: "git" }, spawn: async () => spawned.shift()! });
    const result = harness.run(["status"], "guard").catch((error: unknown) => error);
    await until(() => trees.add.mock.calls.length === 1);
    run(clock, LIMIT_MS.guard); // the first attempt times out with its add still pending
    await until(() => spawned.length === 0);
    await new Promise((done) => setTimeout(done, 50));
    expect(trees.add).toHaveBeenCalledTimes(1); // the retry's add, and so its git, waits behind the late one
    release(); // the late add lands, and is removed, before the retry's
    await until(() => trees.add.mock.calls.length === 2);
    await new Promise((done) => setTimeout(done, 50));
    expect(slot?.pid).toBe(200); // the running retry is in the sweep
    exit({ code: 0, signal: null });
    expect(await result).toMatchObject({ code: 0 });
    expect(slot).toBeUndefined();
    expect(trees.add.mock.calls.map(([entry]) => entry.pid)).toEqual([100, 200]);
  });

  it.skipIf(process.platform === "win32")("resolves close() only once the whole process group is gone (C35)", async () => {
    const proc = await spawnPosix({ file: "/bin/sh", args: ["-c", "sleep 30 & sleep 30"], cwd: tmpdir(), env: process.env });
    await new Promise((done) => setTimeout(done, 200)); // the background sleep has started
    await proc.close();
    let code: string | undefined;
    try { process.kill(-proc.pid, 0); } catch (error) { code = (error as NodeJS.ErrnoException).code; }
    expect(code).toBe("ESRCH");
  });

  // Not tested: no Mac runs here (C38). It checks the exact, unrendered start time a time zone can't change.
  it.runIf(process.platform === "darwin")("stamps a macOS pid with its start time in seconds and microseconds, the same in any time zone (C38)", async () => {
    const stamp = await osStartStamp(process.pid);
    expect(stamp).toMatch(/^darwin:\d+\.\d{6}$/);
    const zone = process.env.TZ;
    try {
      for (const tz of ["UTC", "Pacific/Honolulu"]) { process.env.TZ = tz; expect(await osStartStamp(process.pid)).toBe(stamp); }
    } finally { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; }
  });
});
