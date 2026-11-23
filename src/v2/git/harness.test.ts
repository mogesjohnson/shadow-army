import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
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
    expect(found.git).toBe(join(first, gitName));
    expect(found.path).toBe([first, second].join(delimiter));
    expect(found.dropped.map((drop) => drop.reason)).toEqual(["relative or empty", "relative or empty", "relative or empty", "missing", "inside the folder, a worktree or a snapshot"]);
  });

  it("overrides hooks, fsmonitor, signing and credentials, and adds per-command flags", () => {
    const base = { hooksDir: "/empty", hookNames: ["fmt", "a=b"] };
    const diff = buildGitArgs(["diff", "HEAD"], { ...base, kind: "guard" });
    expect(diff.args).toEqual(expect.arrayContaining(["--no-pager", "--no-optional-locks", "core.hooksPath=/empty", "hook.fmt.enabled=false", "hook.pre-commit.enabled=false",
      "core.fsmonitor=false", "commit.gpgSign=false", "credential.interactive=false", "core.useReplaceRefs=false"].map((v) => (v.includes("=") ? expect.stringContaining(v) : v))));
    expect(diff.args.slice(diff.args.indexOf("diff"))).toEqual(["diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "HEAD"]);
    expect(buildGitArgs(["commit", "-m", "x"], { ...base, kind: "other" }).args.slice(-4)).toEqual(["commit", "--no-verify", "-m", "x"]);
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
