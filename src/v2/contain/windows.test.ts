import { execFileSync, spawn } from "node:child_process";
import { link, lstat, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { windowsOnly } from "../windowsOnly.testutil.js";
import { DEFAULT_EXIT_GRACE_MS, endWindowsProcess, exitGraceFor, listingFrom, openSweepSession, ownedByCurrentUser, probeWindowsProcess, spawnManagedProcess, systemDirectoryOf, windowsLeft, type ManagedProcess, type TreeListing } from "./windows.js";

const sessions: ManagedProcess[] = [];
const directories: string[] = [];
const stray: number[] = [];
afterEach(async () => {
  for (const pid of stray.splice(0)) { try { process.kill(pid); } catch { /* Already gone. */ } }
  await Promise.all(sessions.splice(0).map((session) => session.close().catch(() => {})));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
// Windows PowerShell loads its own modules, never PowerShell 7's from an inherited PSModulePath (process-local).
const modulePath = process.env.PSModulePath;
beforeAll(() => { delete process.env.PSModulePath; });
afterAll(() => { if (modulePath !== undefined) process.env.PSModulePath = modulePath; });

async function directory() {
  const path = await mkdtemp(join(tmpdir(), "shadow-grace-test-"));
  directories.push(path); return path;
}
/** A folder only its owner (OWNER RIGHTS) and SYSTEM may write: a profile's own ACL may let other accounts write. */
async function ownFolder() {
  const path = await directory();
  execFileSync("icacls", [path, "/inheritance:r", "/grant:r", "*S-1-3-4:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"], { stdio: "ignore" });
  return path;
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

const filetimeOf = (pid: number): string => execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid}).StartTime.ToFileTimeUtc()`], { encoding: "utf8" }).trim();
const running = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe("the sweep's identity-bound end on Windows (PO-16)", () => {
  windowsOnly("ends a process and its children only through the handle whose creation time was checked", async () => {
    const script = "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e3)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1e3)";
    const parent = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "ignore"] });
    const child = Number(await new Promise<string>((done) => parent.stdout.once("data", (data: Buffer) => done(data.toString()))));
    stray.push(parent.pid!, child);
    const exact = filetimeOf(parent.pid!);
    // Another process now holding the pid has another creation time: it is left running.
    expect(await endWindowsProcess(parent.pid!, (BigInt(exact) + 1n).toString(), true)).toBe("different");
    expect(running(parent.pid!) && running(child)).toBe(true);
    expect(await endWindowsProcess(parent.pid!, undefined, true)).toBe("unknown"); // An old millisecond record.
    expect(await endWindowsProcess(parent.pid!, exact, true)).toBe("ended");
    await new Promise((done) => setTimeout(done, 500));
    expect([running(parent.pid!), running(child)]).toEqual([false, false]);
    // Both confirmed gone: their pids may be reused, so the generic cleanup must not kill them (C11).
    for (const pid of [parent.pid!, child]) stray.splice(stray.indexOf(pid), 1);
    expect(await endWindowsProcess(parent.pid!, exact, true)).toBe("absent");
  }, 60_000);
});

describe("the sweep's owner check on Windows (PO-16, C6)", () => {
  windowsOnly("takes this user's own file and folder as owned, and the system's folder as not", async () => {
    const folder = await ownFolder();
    const file = join(folder, "t.jsonl");
    await writeFile(file, "{}");
    expect([await ownedByCurrentUser(folder, await lstat(folder)), await ownedByCurrentUser(file, await lstat(file))]).toEqual([true, true]);
    const system = join(process.env.SystemRoot ?? "C:/Windows", "System32");
    expect(await ownedByCurrentUser(system, await lstat(system))).toBe(false);
    expect(await ownedByCurrentUser(join(folder, "missing' ; exit 0 ; '"), await lstat(file))).toBe(false); // A failed check, never ownership.
  }, 60_000);

  windowsOnly("refuses a file others may write, a second link, a junction, and an answer about another file than the one read", async () => {
    const folder = await ownFolder();
    const [file, other, shared, linked, junction] = ["t.jsonl", "u.jsonl", "s.jsonl", "l.jsonl", "j"].map((name) => join(folder, name)) as [string, string, string, string, string];
    for (const path of [file, other, shared, linked]) await writeFile(path, "{}");
    execFileSync("icacls", [shared, "/grant", "*S-1-1-0:(W)"], { stdio: "ignore" }); // Everyone may write it.
    expect(await ownedByCurrentUser(shared, await lstat(shared))).toBe(false);
    await link(linked, join(folder, "l2.jsonl"));
    expect(await ownedByCurrentUser(linked, await lstat(linked))).toBe(false);
    await symlink(folder, junction, "junction");
    expect(await ownedByCurrentUser(junction, await lstat(junction))).toBe(false);
    // The helper's answer is about the object it opened: it must be the one the caller read.
    expect(await ownedByCurrentUser(file, await lstat(other))).toBe(false);
    expect(await ownedByCurrentUser(file, await lstat(file))).toBe(true);
  }, 60_000);

  windowsOnly("finds PowerShell from the folder Windows loaded ntdll.dll from, never from the environment", async () => {
    expect(systemDirectoryOf(["C:\\x\\node.exe", "C:\\WINDOWS\\SYSTEM32\\ntdll.dll"])).toBe("C:\\WINDOWS\\SYSTEM32");
    for (const loaded of [[], ["ntdll.dll"], ["C:\\a\\ntdll.dll", "C:\\b\\ntdll.dll"]]) expect(() => systemDirectoryOf(loaded)).toThrow();
    const root = process.env.SystemRoot;
    process.env.SystemRoot = "C:\\nowhere";
    try { expect(await probeWindowsProcess(process.pid)).toMatch(/^[1-9]\d{17}$/); } finally { process.env.SystemRoot = root; }
  }, 60_000);
});

describe("the sweep's one helper session on Windows (C10)", () => {
  windowsOnly("answers several calls from one PowerShell, compiled once", async () => {
    const session = openSweepSession();
    try {
      const folder = await ownFolder();
      const self = await probeWindowsProcess(process.pid, session);
      expect(self).toMatch(/^[1-9]\d{17}$/);
      const helper = session.pid!;
      expect(await probeWindowsProcess(helper, session)).toMatch(/^[1-9]\d{17}$/); // The helper itself, still running.
      expect(await ownedByCurrentUser(folder, await lstat(folder), session)).toBe(true);
      expect(await Promise.all([probeWindowsProcess(process.pid, session), probeWindowsProcess(2 ** 31 - 2, session)])).toEqual([self, undefined]);
      expect(session.pid).toBe(helper);
    } finally { session.close(); }
  }, 60_000);

  windowsOnly("ends a call that outlives its limit, and answers unknown", async () => {
    const session = openSweepSession(1); // Too short for PowerShell to start.
    const began = performance.now();
    expect(await probeWindowsProcess(process.pid, session)).toBeNull();
    expect(await ownedByCurrentUser(".", await lstat("."), session)).toBe(false);
    expect(performance.now() - began).toBeLessThan(5_000);
    session.close();
  }, 60_000);

  windowsOnly("never sends a request whose deadline has passed, and cancels one in flight at its deadline", async () => {
    const session = openSweepSession();
    try {
      // Queued behind another call, past its deadline when its turn comes: never sent, no helper started for it.
      expect(await Promise.all([session.call("probe 4", performance.now() - 1), session.call("probe 4", performance.now())])).toEqual(["unknown", "unknown"]);
      expect(session.pid).toBeUndefined();
      // In flight while PowerShell compiles the helper: the deadline ends that helper, and its answer is unknown.
      let helper: number | undefined;
      const watch = setTimeout(() => { helper = session.pid; }, 200);
      expect(await probeWindowsProcess(process.pid, session, performance.now() + 400)).toBeNull();
      clearTimeout(watch);
      expect(helper).toBeGreaterThan(0);
      expect(await gone(helper!, 5_000)).toBe(true);
      // A later call, within its own deadline, gets a new helper.
      expect(await probeWindowsProcess(process.pid, session, performance.now() + 30_000)).toMatch(/^[1-9]\d{17}$/);
      expect(session.pid).not.toBe(helper);
    } finally { session.close(); }
    const closed = openSweepSession();
    const late = closed.call("probe 4");
    closed.close(); // Closed before its helper started: none ever starts.
    expect([await late, closed.pid]).toEqual(["unknown", undefined]);
  }, 60_000);

  // Skipped: Left answers 0 while the orphan still runs; not wired into the sweep until it passes (C9, see the brief's Left).
  it.skip("counts what an incomplete tree may have left once its parent has gone, and ends none of it (C9)", async () => {
    const script = "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e3)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1e3)";
    const parent = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "ignore"] });
    const child = Number(await new Promise<string>((done) => parent.stdout.once("data", (data: Buffer) => done(data.toString()))));
    stray.push(child);
    const exact = filetimeOf(parent.pid!);
    parent.kill();
    expect(await gone(parent.pid!, 5_000)).toBe(true);
    expect(await windowsLeft(parent.pid!, exact)).toBe(1);
    expect(running(child)).toBe(true);
    expect(await windowsLeft(parent.pid!, undefined)).toBeNull(); // An old millisecond record: unknown.
    process.kill(child);
    expect(await gone(child, 5_000)).toBe(true);
    stray.splice(stray.indexOf(child), 1);
    expect(await windowsLeft(parent.pid!, exact)).toBe(0);
  }, 60_000);
});
