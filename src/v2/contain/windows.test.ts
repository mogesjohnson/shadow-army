import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { windowsOnly } from "../windowsOnly.testutil.js";
import { DEFAULT_EXIT_GRACE_MS, exitGraceFor, listingFrom, spawnManagedProcess, supervisorBinary, type ManagedProcess, type TreeListing } from "./windows.js";

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

  // A harmless descendant that also ignores EOF: the bound must hold for the whole tree, not just the root.
  const stubbornTree = "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log('child:'+c.pid);process.stdin.resume();setInterval(()=>{},1000);";
  async function descendant(session: ManagedProcess) {
    let text = "";
    return new Promise<number>((done, fail) => {
      session.stdout.on("data", (chunk: Buffer) => { text += chunk.toString(); const match = /child:(\d+)/.exec(text); if (match) done(Number(match[1])); });
      setTimeout(() => fail(new Error("the CLI did not report its child")), 15_000);
    });
  }

  windowsOnly("ends the CLI and its descendant within PO-10's default ten seconds, not before the CLI had its grace", async () => {
    const session = await spawnManagedProcess({ file: process.execPath, args: ["-e", stubbornTree], cwd: await directory() });
    sessions.push(session); session.stderr.resume();
    const child = await descendant(session);
    session.stdout.resume();
    expect(alive(child)).toBe(true);
    const began = Date.now();
    await session.close();
    const elapsed = Date.now() - began;
    expect(elapsed).toBeGreaterThanOrEqual(9_800);
    expect(elapsed).toBeLessThan(10_000 + 2_000); // The grace plus the job's teardown and the pipe round trip.
    expect(alive(session.pid)).toBe(false);
    expect(alive(child)).toBe(false);
  }, 40_000);

  windowsOnly("ends the tree at once, with no grace, when closed with grace: false (a lost connection)", async () => {
    const session = await spawnManagedProcess({ file: process.execPath, args: ["-e", stubbornTree], cwd: await directory(), exitGraceMs: 60_000 });
    sessions.push(session); session.stderr.resume();
    const child = await descendant(session);
    session.stdout.resume();
    const began = Date.now();
    await session.close({ grace: false });
    expect(Date.now() - began).toBeLessThan(3_000);
    expect(alive(session.pid)).toBe(false);
    expect(alive(child)).toBe(false);
  }, 30_000);

  windowsOnly("escalates a graceful close in progress when the connection is then lost", async () => {
    const session = await launch("process.stdin.resume();setInterval(()=>{},1000);", 60_000);
    const began = Date.now();
    const graceful = session.close();
    await new Promise((done) => setTimeout(done, 300));
    await session.close({ grace: false });
    await graceful;
    expect(Date.now() - began).toBeLessThan(3_500);
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
      // The grace is 60 s; ending within 3 s of the owner's death shows the control-pipe loss skipped it.
      expect(await gone(pid, 3_000)).toBe(true);
    } finally { child.kill(); }
  }, 60_000);
});

/** A second, independent read of a creation time: the sweep's own Windows read (Unix milliseconds). */
const creationTimeOf = (pid: number) => execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc()`], { encoding: "utf8", windowsHide: true }).trim();

describe("Windows tree listing (PO-11) and guardian identity (PO-9)", () => {
  windowsOnly("lists the CLI and its child with stable identities, names the guardian, and drops an ended process", async () => {
    const session = await spawnManagedProcess({
      file: process.execPath, cwd: await directory(), exitGraceMs: 0,
      args: ["-e", "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log('child:'+c.pid);process.stdin.resume();setInterval(()=>{},1000);"],
    });
    sessions.push(session); session.stderr.resume();
    const childPid = await new Promise<number>((done, fail) => {
      let text = "";
      session.stdout.on("data", (chunk: Buffer) => { text += chunk.toString(); const match = /child:(\d+)/.exec(text); if (match) done(Number(match[1])); });
      setTimeout(() => fail(new Error("the CLI did not start its child")), 15_000);
    });
    stray.push(childPid);

    const processes = async () => {
      const listing = await session.list!() as TreeListing;
      expect(listing.status).toBe("listed");
      return listing.status === "listed" ? listing.processes : [];
    };
    const first = await processes();
    const second = await processes();
    const byPid = (pid: number) => first.find((entry) => entry.pid === pid);
    expect(byPid(session.pid)).toBeDefined();
    expect(byPid(childPid)).toBeDefined();
    expect(second).toEqual(expect.arrayContaining([byPid(session.pid), byPid(childPid)]));
    for (const pid of [session.pid, childPid]) expect(byPid(pid)!.creationTime).toBe(creationTimeOf(pid));

    const guardian = session.guardian!;
    expect(guardian).toBeDefined();
    expect(alive(guardian.pid)).toBe(true);
    expect(guardian.creationTime).toBe(creationTimeOf(guardian.pid));
    expect(first.some((entry) => entry.pid === guardian.pid)).toBe(false); // It holds the job; it is not in it.

    process.kill(childPid);
    expect(await gone(childPid, 10_000)).toBe(true);
    stray.splice(stray.indexOf(childPid), 1); // Confirmed gone: cleanup must never signal a reused pid.
    const third = await processes();
    expect(third.some((entry) => entry.pid === childPid)).toBe(false);
    expect(third.some((entry) => entry.pid === session.pid)).toBe(true);

    await session.close();
    expect(await session.list!()).toEqual({ status: "ended" });
  }, 60_000);

  windowsOnly("ends the tree at once on close({grace:false}) while a listing is still running", async () => {
    const session = await spawnManagedProcess({ file: process.execPath, args: ["-e", "process.stdin.resume();setInterval(()=>{},1000);"], cwd: await directory(), exitGraceMs: 60_000, listDelayMs: 5_000 });
    sessions.push(session); session.stdout.resume(); session.stderr.resume();
    const listing = session.list!();
    await new Promise((done) => setTimeout(done, 300));
    const began = Date.now();
    await session.close({ grace: false });
    expect(Date.now() - began).toBeLessThan(3_000);
    expect(alive(session.pid)).toBe(false);
    expect(await listing).toEqual({ status: "ended" });
  }, 30_000);

  windowsOnly("loss of the owner ends the tree at once while a listing is still running", async () => {
    const cwd = await directory();
    const owner = join(cwd, "owner.mts");
    const driver = pathToFileURL(join(process.cwd(), "src", "v2", "contain", "windows.ts")).href;
    await writeFile(owner, [
      `import { spawnManagedProcess } from ${JSON.stringify(driver)};`,
      `const session = await spawnManagedProcess({ file: process.execPath, args: ["-e", "process.stdin.resume();setInterval(()=>{},1000);"], cwd: process.cwd(), exitGraceMs: 60000, listDelayMs: 5000 });`,
      "session.stdout.resume(); session.stderr.resume();",
      "void session.list();",
      "setTimeout(() => console.log(`pid:${session.pid}`), 300);",
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
      // The owner disappears with its listing still held by the supervisor. Node (libuv) holds its
      // children in a kill-on-close job, so the owner's death also ends the supervisor: this guards
      // the result, while the close test above is the one that shows the control thread stays free.
      child.kill();
      expect(await gone(pid, 3_000)).toBe(true);
    } finally { child.kill(); }
  }, 60_000);
});

describe("reading the supervisor's listing reply (PO-11)", () => {
  const last = [{ pid: 7, startTime: 1_795_000_000_007, creationTime: "134394736000070000" }];
  it("returns a successful query with each exact creation time, empty only when the job is", () => {
    expect(listingFrom({ processes: [{ pid: 8, creationTime: "134394736000080001", extra: 1 }, { pid: 9, creationTime: "134394736000080002" }], unverified: [] }, last))
      .toEqual({ status: "listed", processes: [
        { pid: 8, startTime: 1_795_000_000_008, creationTime: "134394736000080001" },
        { pid: 9, startTime: 1_795_000_000_008, creationTime: "134394736000080002" },
      ] });
    expect(listingFrom({ processes: [], unverified: [] }, last)).toEqual({ status: "listed", processes: [] });
  });
  it("reports a failed query as incomplete with the last verified identities", () => {
    expect(listingFrom({ message: "Access is denied" }, last)).toEqual({ status: "incomplete", reason: expect.stringContaining("Access is denied"), lastVerified: last });
  });
  it("never strips a malformed entry from a reply, nor accepts a creation time that is not exact", () => {
    for (const bad of [{ pid: "9", creationTime: "134394736000080001" }, { pid: 9, creationTime: 134394736000080001 }, { pid: 9, startTime: 1_795_000_000_008 }, { pid: 9, creationTime: "0" }]) {
      expect(listingFrom({ processes: [{ pid: 8, creationTime: "134394736000080001" }, bad], unverified: [] }, last))
        .toEqual({ status: "incomplete", reason: expect.stringContaining("malformed"), lastVerified: last });
    }
  });
  it("never reads a process whose identity could not be read as absent", () => {
    expect(listingFrom({ processes: [{ pid: 8, creationTime: "134394736000080001" }], unverified: [9] }, last))
      .toEqual({ status: "incomplete", reason: expect.stringContaining("pid 9"), lastVerified: last });
  });
});

describe("Windows supervisor cache (compiled once, verified on every spawn)", () => {
  const hashOf = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");

  windowsOnly("compiles once, then reuses the verified binary", async () => {
    const cache = await directory();
    const first = await supervisorBinary(cache);
    expect(first.compiled).toBe(true);
    expect(first.path.endsWith(`-${await hashOf(first.path)}.exe`)).toBe(true);
    expect(await supervisorBinary(cache)).toEqual({ path: first.path, compiled: false });
  }, 120_000);

  windowsOnly("recompiles a tampered, missing or misrecorded binary instead of running it", async () => {
    const cache = await directory();
    const first = await supervisorBinary(cache);
    await writeFile(first.path, "MZ planted, not the supervisor");
    const repaired = await supervisorBinary(cache);
    expect(repaired.compiled).toBe(true);
    expect(repaired.path).not.toBe(first.path);
    expect(repaired.path.endsWith(`-${await hashOf(repaired.path)}.exe`)).toBe(true);
    expect(await readdir(cache)).not.toContain(basename(first.path)); // The tampered file is gone.

    await rm(repaired.path);
    const missing = await supervisorBinary(cache);
    expect(missing.compiled).toBe(true);

    // A record for another source, or one pointing at a planted binary under a self-chosen hash, is not trusted.
    const record = (await readdir(cache)).find((name) => name.endsWith(".json"))!;
    const planted = join(cache, "planted.exe");
    await writeFile(planted, "MZ planted");
    await writeFile(join(cache, record), JSON.stringify({ source: "0".repeat(64), sha256: await hashOf(planted) }));
    const again = await supervisorBinary(cache);
    expect(again.compiled).toBe(true);
    expect(await hashOf(again.path)).not.toBe(await hashOf(planted));
  }, 240_000);

  windowsOnly("runs containment from the verified cached binary, which still kills the whole tree", async () => {
    const session = await spawnManagedProcess({
      file: process.execPath, cwd: await directory(), exitGraceMs: 0,
      args: ["-e", "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log('child:'+c.pid);process.stdin.resume();setInterval(()=>{},1000);"],
    });
    sessions.push(session); session.stderr.resume();
    const child = await new Promise<number>((done, fail) => {
      let text = "";
      session.stdout.on("data", (chunk: Buffer) => { text += chunk.toString(); const match = /child:(\d+)/.exec(text); if (match) done(Number(match[1])); });
      setTimeout(() => fail(new Error("the CLI did not start its child")), 15_000);
    });
    stray.push(child);
    const guardianPath = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${session.guardian!.pid}).Path`], { encoding: "utf8", windowsHide: true }).trim();
    const cached = await supervisorBinary();
    expect(cached.compiled).toBe(false);
    expect(guardianPath.toLowerCase()).toBe(cached.path.toLowerCase());
    await session.close({ grace: false });
    expect(await gone(session.pid, 5_000)).toBe(true);
    expect(await gone(child, 5_000)).toBe(true);
  }, 60_000);
});
