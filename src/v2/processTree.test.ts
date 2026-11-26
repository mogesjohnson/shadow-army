import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { spawnManagedProcess, verifiedRoots, verifyExecutable, type ManagedProcess } from "./processTree.js";

const sessions: ManagedProcess[] = [];
const directories: string[] = [];
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "shadow-process-test-"));
  directories.push(path); return path;
}
async function launch(file: string, args: string[], cwd: string) {
  const session = await spawnManagedProcess({ file, args, cwd }); sessions.push(session);
  // Keep the OS's bounded pipes drained, even when a test only cares about process containment.
  session.stdout.resume(); session.stderr.resume(); return session;
}
async function waitForFile(path: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await readFile(path)).length) return; } catch {}
    await pause(20);
  }
  throw new Error("fake descendant never wrote its marker");
}
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const windows = process.platform === "win32";

// M1a containment is Windows only. Linux and macOS are "Not tested" (D-34): they fail clearly.
describe.skipIf(windows)("session process containment off Windows", () => {
  it("fails clearly and starts nothing: Not tested here (D-34)", async () => {
    await expect(spawnManagedProcess({ file: process.execPath, args: ["-e", "0"], cwd: await directory() }))
      .rejects.toThrow(/Windows only.*not tested.*D-34/);
  });
});

describe("CH-1 executable check", () => {
  it("refuses an executable whose real path cannot be read instead of using its lexical path (C17)", async () => {
    const root = join(tmpdir(), "sa-c17-checkout"); const outside = join(tmpdir(), "sa-c17-tools", "claude.exe");
    const failing = async (path: string) => { throw Object.assign(new Error(`EPERM: realpath ${path}`), { code: "EPERM" }); };
    await expect(verifyExecutable(outside, [root.toLowerCase()], failing)).rejects.toMatchObject({ code: "EACCES", message: expect.stringMatching(/could not verify the real path/) });
    await expect(verifyExecutable(outside, [root.toLowerCase()], async () => join(root, "bin", "claude.exe"))).rejects.toThrow(/inside the soldier's repository/);
    await expect(verifyExecutable(outside, [root.toLowerCase()], async (path) => path)).resolves.toBeUndefined();
  });

  it("refuses a repository folder whose real path cannot be read, and keeps a missing one by its lexical path (C17)", async () => {
    const stale = join(tmpdir(), "sa-c17-stale-worktree");
    const fail = (code: string) => async (path: string) => { throw Object.assign(new Error(`${code}: realpath ${path}`), { code }); };
    await expect(verifiedRoots([stale], fail("EPERM"))).rejects.toMatchObject({ code: "EACCES", message: expect.stringMatching(/could not verify the real path of repository folder/) });
    const comparable = windows ? stale.toLowerCase() : stale;
    await expect(verifiedRoots([stale], fail("ENOENT"))).resolves.toEqual([comparable]);
  });
});

describe.skipIf(!windows)("session process containment (Windows; Not tested on other systems, D-34)", () => {
  it("allows asynchronous native EOF cleanup before stopping retained descendants", async () => {
    const cwd = await directory(); const marker = join(cwd, "cleanup-writes"); const cleanup = join(cwd, "native-cleanup");
    const writer = "const fs=require('node:fs');setInterval(()=>fs.appendFileSync(process.argv[1],'x'),20);";
    const native = "const fs=require('node:fs');const child=require('node:child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore',detached:process.platform==='win32'});child.unref();process.stdin.resume();process.stdin.once('end',()=>setTimeout(()=>{fs.writeFileSync(process.argv[3],'native EOF cleanup\\n');process.stdout.write('cleanup complete\\n');process.exit(0);},200));";
    const session = await launch(process.execPath, ["-e", native, writer, marker, cleanup], cwd);
    let output = ""; session.stdout.on("data", (chunk) => { output += chunk; });
    await waitForFile(marker);
    // This is the channel's actual close ordering: EOF immediately followed by close().
    session.stdin.end(); await session.close();
    expect(await readFile(cleanup, "utf8")).toBe("native EOF cleanup\n");
    expect(await session.exited).toEqual({ code: 0, signal: null });
    expect(output).toContain("cleanup complete\n");
    const stopped = await readFile(marker, "utf8"); await pause(150);
    expect(await readFile(marker, "utf8")).toBe(stopped);
  }, 30_000);

  it("preserves native argv and raw stdin/stdout/stderr without leaking bootstrap", async () => {
    const cwd = await directory();
    const args = ["plain", "with spaces", "quote\"inside", "tail\\", "&%literal", "日本語"];
    const fake = "process.stdout.write(JSON.stringify(process.argv.slice(1))+'\\n'); process.stderr.write('native stderr\\n'); process.stdin.once('data',data=>{process.stdout.write(data);process.exit(3)});";
    const session = await launch(process.execPath, ["-e", fake, ...args], cwd);
    let output = "", error = "";
    session.stdout.on("data", (chunk) => { output += chunk; });
    session.stderr.on("data", (chunk) => { error += chunk; });
    session.stdin.write("only native input\n");
    expect(await session.exited).toEqual({ code: 3, signal: null });
    await session.close();
    expect(output).toBe(`${JSON.stringify(args)}\nonly native input\n`);
    expect(error).toBe("native stderr\n");
  }, 30_000);

  it("retains descendants after root CLI exit and stops them before close resolves", async () => {
    const cwd = await directory(); const marker = join(cwd, "writes");
    const child = "const fs=require('node:fs');setInterval(()=>fs.appendFileSync(process.argv[1],'x'),20);";
    const parent = "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore',windowsHide:true,detached:process.platform==='win32'});child.unref();child.once('spawn',()=>process.exit(7));";
    const session = await launch(process.execPath, ["-e", parent, child, marker], cwd);
    expect((await session.exited).code).toBe(7);
    await waitForFile(marker);
    await session.close();
    const stopped = await readFile(marker, "utf8"); await pause(150);
    expect(await readFile(marker, "utf8")).toBe(stopped);
    await session.close(); // Idempotent shutdown cannot target a later, unrelated PID.
  }, 30_000);

  it("closes a still-running root and the child service it owns", async () => {
    const cwd = await directory(); const marker = join(cwd, "writes");
    const child = "const fs=require('node:fs');setInterval(()=>fs.appendFileSync(process.argv[1],'x'),20);";
    const parent = "require('node:child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore',windowsHide:true});setInterval(()=>{},1000);";
    const session = await launch(process.execPath, ["-e", parent, child, marker], cwd);
    await waitForFile(marker); await session.close();
    const stopped = await readFile(marker, "utf8"); await pause(150);
    expect(await readFile(marker, "utf8")).toBe(stopped);
    await expect(session.exited).resolves.toBeDefined();
  }, 30_000);

  it("fails a missing executable without launching an unmanaged fallback", async () => {
    await expect(spawnManagedProcess({ file: "shadow-definitely-missing-executable", cwd: await directory() })).rejects.toThrow();
  }, 30_000);

  it("launches a Windows npm-style cmd shim without a visible window", async () => {
    // The shim lives outside the soldier's folder: an executable inside it is refused (C11).
    const cwd = await directory(); const bin = await directory(); const script = join(bin, "echo.cjs"); const shim = join(bin, "fake.cmd");
    await writeFile(script, "console.log(JSON.stringify(process.argv.slice(2)));process.stdin.once('data',data=>{process.stdout.write(data);process.exit(0)});", "utf8");
    await writeFile(shim, `@echo off\r\n"${process.execPath}" "%~dp0echo.cjs" %*\r\n`, "utf8");
    const args = ["with spaces", "literal&value", "percent%value", "%PATH%", "quote\"inside", "trailing\\"];
    const session = await launch(shim, args, cwd); let output = "";
    session.stdout.on("data", (chunk) => { output += chunk; }); session.stdin.write("shim input\n");
    expect((await session.exited).code).toBe(0); await session.close();
    expect(output).toBe(`${JSON.stringify(args)}\nshim input\n`);
  }, 30_000);

  it("starts a bare name only from trusted PATH entries and gives the child that cleaned PATH (CH-1, C4)", async () => {
    const repo = makeRepo(); const trusted = await directory(); const worktree = join(await directory(), "snapshot");
    try {
      repo.git("worktree", "add", "-q", "--detach", worktree);
      const shim = (word: string) => `@echo off\r\necho ${word}\r\necho %PATH%\r\necho %NoDefaultCurrentDirectoryInExePath%\r\n`;
      repo.write("bin/sa-c4-cli.cmd", shim("checkout"));
      await mkdir(join(worktree, "tools"));
      await writeFile(join(worktree, "tools", "sa-c4-cli.cmd"), shim("snapshot-tools"));
      await writeFile(join(worktree, "sa-c4-cli.cmd"), shim("snapshot-folder"));
      await writeFile(join(trusted, "sa-c4-cli.cmd"), shim("trusted"));
      const untrusted = [join(repo.dir, "bin"), join(worktree, "tools"), "relative", ""];
      const inherited = Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path");
      const env = { ...Object.fromEntries(inherited), PATH: [...untrusted, trusted, process.env.Path ?? process.env.PATH ?? ""].join(";") };
      const session = await spawnManagedProcess({ file: "sa-c4-cli", cwd: worktree, env }); sessions.push(session);
      let output = ""; session.stdout.on("data", (chunk) => { output += chunk; }); session.stderr.resume();
      expect((await session.exited).code).toBe(0); await session.close();
      const [word, path, flag] = output.split(/\r?\n/);
      expect(word).toBe("trusted");
      expect(path!.split(";")).toContain(trusted);
      for (const entry of untrusted.filter(Boolean)) expect(path!.split(";")).not.toContain(entry);
      expect(flag).toBe("1");
      // The machine's own PATH may add empty or missing entries after these.
      expect(session.droppedPath.slice(0, untrusted.length)).toEqual(untrusted);
      expect(session.droppedPath).not.toContain(trusted);
    } finally { try { repo.git("worktree", "remove", "--force", worktree); } catch {} repo.cleanup(); }
  }, 30_000);

  it("treats a checkout folder named with two leading dots as inside, and refuses an executable in the checkout (CH-1, C11)", async () => {
    const repo = makeRepo(); const trusted = await directory();
    try {
      const shim = (word: string) => `@echo off\r\necho ${word}\r\n`;
      repo.write("..bin/sa-c11-cli.cmd", shim("dotdot"));
      await writeFile(join(trusted, "sa-c11-cli.cmd"), shim("trusted"));
      const inherited = Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path");
      const env = { ...Object.fromEntries(inherited), PATH: [join(repo.dir, "..bin"), trusted, process.env.Path ?? process.env.PATH ?? ""].join(";") };
      const session = await spawnManagedProcess({ file: "sa-c11-cli", cwd: repo.dir, env }); sessions.push(session);
      let output = ""; session.stdout.on("data", (chunk) => { output += chunk; }); session.stderr.resume();
      expect((await session.exited).code).toBe(0); await session.close();
      expect(output.trim()).toBe("trusted");
      expect(session.droppedPath[0]).toBe(join(repo.dir, "..bin"));
      await expect(spawnManagedProcess({ file: join(repo.dir, "..bin", "sa-c11-cli.cmd"), cwd: repo.dir, env }))
        .rejects.toThrow(/inside the soldier's repository/);
    } finally { repo.cleanup(); }
  }, 30_000);

  it("refuses a relative configured command instead of taking it from the soldier's folder (CH-1, C4)", async () => {
    await expect(spawnManagedProcess({ file: "bin/claude.cmd", cwd: await directory() })).rejects.toThrow(/bare name or an absolute path/);
  }, 30_000);
});
