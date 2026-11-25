import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { helperPath, listTree, parseStat, resolveCommand, spawnManagedProcess, treeOf, type LinuxManagedProcess } from "./linux.js";

const fake = fileURLToPath(new URL("../../../test/fakes/tree-writer.mjs", import.meta.url));
// Linux only (D-34: Not tested off Linux). On Linux a missing helper fails its own test below rather than skipping the suite.
const linux = it.runIf(process.platform === "linux");

/** A fake guardian speaking the fd 3 protocol, for the failure paths the real helper can't be made to take. */
const fakeGuardian = `
import { appendFileSync } from "node:fs";
import { Socket } from "node:net";
const mode = process.env.FAKE_GUARD ?? "";
const io = new Socket({ fd: 3, readable: true, writable: true });
const say = (report) => io.write(JSON.stringify({ op: "guard", ...report }) + "\\n");
const cli = 424242;
if (mode !== "silent") setTimeout(() => say({ event: "ready", pid: process.pid }), mode === "slow-ready" ? 700 : 0);
let buffer = "";
io.setEncoding("utf8");
io.on("data", (data) => {
  buffer += data;
  for (let end; (end = buffer.indexOf("\\n")) >= 0;) { const command = buffer.slice(0, end); buffer = buffer.slice(end + 1); on(command); }
});
function on(command) {
  appendFileSync(process.env.FAKE_LOG, command + "\\n");
  if (command === "start" && mode !== "late-start") setTimeout(() => say({ event: "started", pid: cli }), mode === "slow-ready" ? 600 : 0);
  if (command === "start" && mode === "die") setTimeout(() => process.exit(3), 50);
  if (command === "kill" && mode === "no-ended") process.exit(0);
  if (command === "kill" && mode !== "hang") { say({ event: "exit", pid: cli, signal: 9 }); say({ event: "ended", reaped: 0 }); io.end(() => process.exit(0)); }
}
setInterval(() => {}, 1_000);
`;

describe("Linux tree listing (PO-11)", () => {
  it("reads the parent and start time after the last ')' of the command name", () => {
    const fields = Array.from({ length: 50 }, (_, index) => String(index + 3));
    fields[0] = "S"; fields[1] = "41"; fields[19] = "123456";
    expect(parseStat(42, `42 (a) b) (c) ${fields.join(" ")}`)).toEqual({ pid: 42, ppid: 41, startTime: 123456 });
    expect(parseStat(42, "42 no-paren")).toBeNull();
    expect(parseStat(42, "42 (x) S")).toBeNull();
  });

  it("keeps each process whose chain of parents reaches the root, and survives a cycle", () => {
    const entry = (pid: number, ppid: number) => ({ pid, ppid, startTime: pid * 10 });
    const all = [entry(1, 0), entry(10, 1), entry(11, 10), entry(12, 11), entry(20, 1), entry(30, 31), entry(31, 30)];
    expect(treeOf(all, 10).map((process) => process.pid)).toEqual([11, 12]);
    expect(treeOf(all, 99)).toEqual([]);
  });
});

describe("Linux guardian driver (PO-9, PO-10, M1-AC15 on Linux)", () => {
  let dir: string;
  const open: LinuxManagedProcess[] = [];
  afterEach(async () => {
    await Promise.allSettled(open.splice(0).map((managed) => managed.close({ grace: false })));
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function start(...flags: string[]) {
    dir = mkdtempSync(join(tmpdir(), "sa-linux-"));
    const out = join(dir, "writer.log");
    const managed = await spawnManagedProcess({ file: "node", args: [fake, out, ...flags], cwd: dir, env: { ...process.env, SA_PROBE: "probe" } });
    open.push(managed);
    let stdout = "";
    managed.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    const writer = await waitFor(() => existsSync(out) && Number(readFileSync(out, "utf8").split("\n")[0]));
    return { managed, out, writer, stdout: () => stdout };
  }

  async function waitFor<T>(probe: () => T, ms = 5_000): Promise<T> {
    for (const began = Date.now(); Date.now() - began < ms; await new Promise((done) => setTimeout(done, 20))) {
      const value = probe();
      if (value) return value;
    }
    throw new Error("timed out");
  }

  /** The file has stopped growing: it is the same size 200 ms apart. */
  async function stoppedGrowing(file: string) {
    const before = statSync(file).size;
    await new Promise((done) => setTimeout(done, 200));
    return statSync(file).size === before;
  }

  linux("passes streams, cwd, args and env, hears the exit while the writer runs, lists the writer and ends it", async () => {
    const { managed, out, writer, stdout } = await start();
    const listed = await managed.list();
    expect(listed.map((process) => process.pid)).toEqual(expect.arrayContaining([managed.pid, writer]));
    expect(listed.find((process) => process.pid === writer)!.startTime).toBeGreaterThan(0);
    managed.stdin.write("bytes é\n");
    await waitFor(() => stdout().includes("bytes é\n"));
    expect(JSON.parse(stdout().split("\n")[0]!)).toEqual({ argv: [out], cwd: dir, probe: "probe" });
    managed.stdin.end(); // The CLI's own exit, as close() asks for it.
    expect(await managed.exited).toEqual({ code: 7, signal: null });
    expect(await stoppedGrowing(out)).toBe(false); // The writer still runs after the CLI's own exit...
    const began = Date.now();
    await managed.close(); // ...until the tree is killed, at once since the CLI has exited.
    expect(Date.now() - began).toBeLessThan(2_000);
    expect(await stoppedGrowing(out)).toBe(true);
  }, 20_000);

  linux("sends SIGTERM 9.5 s after asking a CLI that ignores its input to exit", async () => {
    const { managed, out } = await start("ignore-stdin");
    const began = Date.now();
    const closed = managed.close();
    expect(await managed.exited).toEqual({ code: null, signal: "SIGTERM" });
    expect(Date.now() - began).toBeGreaterThanOrEqual(9_400);
    await closed;
    expect(await stoppedGrowing(out)).toBe(true);
  }, 20_000);

  linux("kills the tree at 10 s when the CLI ignores its input and SIGTERM", async () => {
    const { managed, out } = await start("ignore-stdin", "ignore-term");
    const began = Date.now();
    await managed.close();
    expect(await managed.exited).toEqual({ code: null, signal: "SIGKILL" });
    expect(Date.now() - began).toBeGreaterThanOrEqual(9_900);
    expect(Date.now() - began).toBeLessThan(15_000);
    expect(await stoppedGrowing(out)).toBe(true);
  }, 25_000);

  linux("kills at once without grace, and spares a process outside the session", async () => {
    const outside = spawn("sleep", ["30"], { stdio: "ignore" });
    try {
      const { managed, out } = await start("ignore-stdin", "ignore-term");
      const began = Date.now();
      await managed.close({ grace: false });
      expect(Date.now() - began).toBeLessThan(2_000);
      expect(await managed.exited).toEqual({ code: null, signal: "SIGKILL" });
      expect(await stoppedGrowing(out)).toBe(true);
      expect(outside.exitCode).toBeNull();
      expect(() => process.kill(outside.pid!, 0)).not.toThrow();
    } finally { outside.kill("SIGKILL"); }
  }, 20_000);

  linux("kills the tree at once when the guardian learns the post office is gone", async () => {
    const { managed, out } = await start("ignore-stdin", "ignore-term");
    process.kill(managed.guardianPid, "SIGTERM"); // The guardian treats SIGTERM as the post office being gone.
    expect(await managed.exited).toEqual({ code: null, signal: "SIGKILL" });
    await managed.close();
    expect(await stoppedGrowing(out)).toBe(true);
  }, 20_000);

  linux("finds the built helper for this processor (a missing build fails, not skips)", () => {
    expect(existsSync(helperPath())).toBe(true);
  });

  linux("refuses a listing once the guardian is gone, so a reused pid can't lend its tree", async () => {
    const { managed } = await start();
    await managed.close({ grace: false });
    await expect(managed.list()).rejects.toThrow(/gone or its pid names another process/);
    await expect(listTree(process.pid, "/proc", 1)).rejects.toThrow(/discarded/);
  }, 20_000);

  linux("starts nothing for a missing executable or helper", async () => {
    await expect(spawnManagedProcess({ file: "no-such-cli-sa", cwd: tmpdir() })).rejects.toThrow(/could not find executable/);
    await expect(spawnManagedProcess({ file: "node", cwd: tmpdir() }, "/nonexistent/sa-contain")).rejects.toThrow(/ENOENT/);
  });
});

describe("Linux driver failure paths, with a fake guardian (PO-9, PO-10, PO-15)", () => {
  let dir: string;
  const guardians: number[] = [];
  afterEach(() => {
    for (const pid of guardians.splice(0)) try { process.kill(pid, "SIGKILL"); } catch { /* Already gone. */ }
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function setup(mode: string) {
    dir = mkdtempSync(join(tmpdir(), "sa-linux-fake-"));
    const helper = join(dir, "fake-guard.mjs");
    writeFileSync(helper, `#!${process.execPath}\n${fakeGuardian}`);
    chmodSync(helper, 0o755);
    const log = join(dir, "commands.log");
    const spawnIt = (limits: Parameters<typeof spawnManagedProcess>[2] = {}) =>
      spawnManagedProcess({ file: process.execPath, cwd: dir, env: { ...process.env, FAKE_GUARD: mode, FAKE_LOG: log } }, helper, limits);
    const commands = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []);
    return { spawnIt, commands };
  }

  linux("fails a guardian that never reports ready, and never sends start", async () => {
    const { spawnIt, commands } = setup("silent");
    const began = performance.now();
    await expect(spawnIt({ ready: 300 })).rejects.toThrow(/report ready within 300 ms/);
    expect(performance.now() - began).toBeLessThan(2_000);
    expect(commands()).not.toContain("start");
  });

  linux("counts one handshake deadline: a slow ready leaves only the rest for the start", async () => {
    // Ready at 700 ms, started 600 ms after start: each fits 1 s alone, together they don't. Under load a late
    // ready may fail first; either way the launch fails inside the one window, never after a second one.
    const { spawnIt, commands } = setup("slow-ready");
    const began = performance.now();
    await expect(spawnIt({ ready: 1_000 })).rejects.toThrow(/within 1000 ms of its launch/);
    expect(performance.now() - began).toBeLessThan(1_600);
    expect(commands().at(-1)).toBe("kill");
  });

  linux("fails a late start and has the guardian end what it started", async () => {
    const { spawnIt, commands } = setup("late-start");
    await expect(spawnIt({ ready: 300 })).rejects.toThrow(/start the CLI within 300 ms/);
    expect(commands()).toEqual(["start", "kill"]);
  });

  linux("fails close when the guardian ends without its ended report", async () => {
    const { spawnIt } = setup("no-ended");
    const managed = await spawnIt();
    await expect(managed.close({ grace: false })).rejects.toThrow(/containment failed: the guardian/);
    await expect(managed.exited).rejects.toThrow(/containment failed/);
  });

  linux("reports an unexpected guardian exit as a containment failure, not as the CLI's exit", async () => {
    const { spawnIt } = setup("die");
    const managed = await spawnIt();
    await expect(managed.exited).rejects.toThrow(/containment failed: the guardian( ended \(status 3\)|'s control channel closed)/);
  });

  linux("keeps a guardian whose tree is not reported empty in time, and fails close (PO-15)", async () => {
    const { spawnIt } = setup("hang");
    const managed = await spawnIt({ empty: 300 });
    guardians.push(managed.guardianPid);
    await expect(managed.close({ grace: false })).rejects.toThrow(/not reported empty 300 ms after its kill began/);
    expect(() => process.kill(managed.guardianPid, 0)).not.toThrow();
  });

  linux("counts the empty-tree limit from the first kill, even if the CLI's exit never comes", async () => {
    const { spawnIt, commands } = setup("hang");
    const managed = await spawnIt({ termAfter: 100, killAfter: 200, empty: 300 });
    guardians.push(managed.guardianPid);
    const began = performance.now();
    await expect(managed.close()).rejects.toThrow(/not reported empty/);
    expect(performance.now() - began).toBeLessThan(1_500);
    expect(commands()).toEqual(["start", "term", "kill"]);
  });

  linux("lets an immediate close hurry a graceful close that is waiting", async () => {
    const { spawnIt, commands } = setup("");
    const managed = await spawnIt();
    const began = performance.now();
    const graceful = managed.close();
    await managed.close({ grace: false });
    await graceful;
    expect(performance.now() - began).toBeLessThan(2_000);
    expect(commands()).toEqual(["start", "kill"]);
  });
});

describe("Linux command search, as Node's own start does it (PO-9)", () => {
  linux("searches /usr/bin:/bin without PATH, an empty entry as cwd, and skips directories", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sa-linux-path-"));
    try {
      expect(await resolveCommand("true", dir, {})).toMatch(/^\/(usr\/)?bin\/true$/);
      writeFileSync(join(dir, "tool"), "#!/bin/sh\n");
      chmodSync(join(dir, "tool"), 0o755);
      expect(await resolveCommand("tool", dir, { PATH: "/nonexistent::/usr/bin" })).toBe(join(dir, "tool"));
      mkdirSync(join(dir, "sub", "true"), { recursive: true });
      expect(await resolveCommand("true", dir, { PATH: `${join(dir, "sub")}:/usr/bin:/bin` })).toMatch(/^\/(usr\/)?bin\/true$/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
