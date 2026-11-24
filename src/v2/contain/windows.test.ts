import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { windowsOnly } from "../windowsOnly.testutil.js";
import { DEFAULT_EXIT_GRACE_MS, exitGraceFor, spawnManagedProcess, type ManagedProcess } from "./windows.js";

const sessions: ManagedProcess[] = [];
const directories: string[] = [];
const stray: number[] = [];
afterEach(async () => {
  for (const pid of stray.splice(0)) { try { process.kill(pid); } catch { /* Already gone. */ } }
  await Promise.all(sessions.splice(0).map((session) => session.close().catch(() => {})));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function directory() {
  const path = await mkdtemp(join(tmpdir(), "shadow-grace-test-"));
  directories.push(path); return path;
}
async function launch(script: string, exitGraceMs: number) {
  const session = await spawnManagedProcess({ file: process.execPath, args: ["-e", script], cwd: await directory(), exitGraceMs });
  sessions.push(session); session.stdout.resume(); session.stderr.resume();
  return session;
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function gone(pid: number, withinMs: number) {
  for (const started = Date.now(); Date.now() - started < withinMs;) {
    if (!alive(pid)) return true;
    await new Promise((done) => setTimeout(done, 50));
  }
  return !alive(pid);
}

describe("Windows exit grace (PO-10: ten seconds after the CLI was asked to exit)", () => {
  it("is ten seconds by default and takes an injected limit", () => {
    expect(DEFAULT_EXIT_GRACE_MS).toBe(10_000);
    expect(exitGraceFor({})).toBe(10_000);
    expect(exitGraceFor({ exitGraceMs: 250 })).toBe(250);
    expect(exitGraceFor({ exitGraceMs: 0 })).toBe(0);
  });

  it("rejects a limit that is not a whole, non-negative number of milliseconds", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => exitGraceFor({ exitGraceMs: bad })).toThrow(RangeError);
  });

  windowsOnly("ends a CLI that ignores stdin EOF only after the injected limit, not after the old two seconds", async () => {
    const session = await launch("process.stdin.resume();setInterval(()=>{},1000);", 3_000);
    const began = Date.now();
    await session.close();
    const elapsed = Date.now() - began;
    expect(elapsed).toBeGreaterThanOrEqual(2_800);
    expect(elapsed).toBeLessThan(9_000);
    expect(alive(session.pid)).toBe(false);
  }, 30_000);

  windowsOnly("does not wait out the limit when the CLI exits on its own after EOF", async () => {
    const session = await launch("process.stdin.resume();process.stdin.once('end',()=>setTimeout(()=>process.exit(0),200));setInterval(()=>{},1000);", 20_000);
    const began = Date.now();
    await session.close();
    expect(Date.now() - began).toBeLessThan(10_000);
    expect(await session.exited).toEqual({ code: 0, signal: null });
  }, 30_000);

  windowsOnly("loss of the owner's control pipe still ends the tree at once, bypassing even a long grace", async () => {
    const cwd = await directory();
    const owner = join(cwd, "owner.mts");
    const driver = pathToFileURL(join(process.cwd(), "src", "v2", "contain", "windows.ts")).href;
    await writeFile(owner, [
      `import { spawnManagedProcess } from ${JSON.stringify(driver)};`,
      `const session = await spawnManagedProcess({ file: process.execPath, args: ["-e", "process.stdin.resume();setInterval(()=>{},1000);"], cwd: process.cwd(), exitGraceMs: 60000 });`,
      "session.stdout.resume(); session.stderr.resume();",
      "console.log(`pid:${session.pid}`);",
      "setInterval(() => {}, 1000);",
    ].join("\n"), "utf8");
    const child = spawn(process.execPath, ["--import", "tsx", owner], { cwd: process.cwd(), stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
    try {
      const pid = await new Promise<number>((done, fail) => {
        let text = "";
        child.stdout.on("data", (chunk: Buffer) => { text += chunk.toString(); const match = /pid:(\d+)/.exec(text); if (match) done(Number(match[1])); });
        child.once("exit", () => fail(new Error("owner exited before launching the CLI")));
        setTimeout(() => fail(new Error("owner did not launch the CLI in time")), 20_000);
      });
      stray.push(pid);
      expect(alive(pid)).toBe(true);
      child.kill(); // The owner disappears without ever asking the session to close.
      // The grace is 60 s; ending within 15 s shows the control-pipe loss skipped it.
      expect(await gone(pid, 15_000)).toBe(true);
    } finally { child.kill(); }
  }, 60_000);
});
