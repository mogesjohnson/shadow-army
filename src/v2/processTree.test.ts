import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnManagedProcess, type ManagedProcess } from "./processTree.js";

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

// Linux and macOS have no containment driver yet (M1b): PO-14 says so and nothing starts.
describe.skipIf(windows)("session process containment off Windows", () => {
  it("fails with the no-helper message and starts nothing", async () => {
    await expect(spawnManagedProcess({ file: process.execPath, args: ["-e", "0"], cwd: await directory() }))
      .rejects.toThrow(/No containment helper for .*, so no soldier can start/);
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
    const cwd = await directory(); const script = join(cwd, "echo.cjs"); const shim = join(cwd, "fake.cmd");
    await writeFile(script, "console.log(JSON.stringify(process.argv.slice(2)));process.stdin.once('data',data=>{process.stdout.write(data);process.exit(0)});", "utf8");
    await writeFile(shim, `@echo off\r\n"${process.execPath}" "%~dp0echo.cjs" %*\r\n`, "utf8");
    const args = ["with spaces", "literal&value", "percent%value", "%PATH%", "quote\"inside", "trailing\\"];
    const session = await launch(shim, args, cwd); let output = "";
    session.stdout.on("data", (chunk) => { output += chunk; }); session.stdin.write("shim input\n");
    expect((await session.exited).code).toBe(0); await session.close();
    expect(output).toBe(`${JSON.stringify(args)}\nshim input\n`);
  }, 30_000);
});
