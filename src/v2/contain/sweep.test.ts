import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { endThroughHelper, OP_LIMIT_MS, readVerifiedTrees, sweepTrees, systemOps, SWEEP_LIMIT_MS, windowsTrust, type Probe, type SweepOps } from "./sweep.js";
import { main } from "../sweepMain.js";
import { readTrees, TreeRecord, treesDir } from "./trees.js";

/** Fake processes by pid → start time. Ending one removes it, unless its pid is in `stuck`. */
function fakeOps(alive: Record<number, number | "unknown">, platform: NodeJS.Platform = "linux", stuck: number[] = []) {
  const calls: string[] = [];
  const ops: SweepOps = {
    platform,
    probe: async (pid): Promise<Probe> => alive[pid] ?? "absent",
    commandOf: async (pid) => `cmd-${pid} Bearer abc123`,
    endIdentity: async (target, tree) => {
      calls.push(`${tree ? "tree" : "end"} ${target.pid}`);
      if (alive[target.pid] === target.startTime && !stuck.includes(target.pid)) delete alive[target.pid];
      return "ended";
    },
    removeJob: async (label) => { calls.push(`job ${label}`); },
    endCoalition: async (id) => { calls.push(`coalition ${id}`); },
    wait: async () => {},
    trust: null, // Fake processes: the real folder checks are tested on their own below.
  };
  return { ops, calls, alive };
}

describe("the sweep (PO-16, M1-AC16)", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "sa-sweep-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("leaves a tree whose post office still runs, and ends a dead post office's tree, removing its entry", async () => {
    await TreeRecord.create(root, "live", { pid: 1, startTime: 10 }, { pid: 2, startTime: 20 });
    const dead = await TreeRecord.create(root, "dead", { pid: 3, startTime: 30 }, { pid: 4, startTime: 40 });
    await dead.add({ kind: "cli", pid: 5, startTime: 50 });
    await dead.listing([{ pid: 6, startTime: 60 }]);
    const { ops, calls } = fakeOps({ 1: 10, 2: 20, 4: 40, 5: 50, 6: 60 });
    const report = await sweepTrees(root, ops);
    expect(report).toMatchObject({ running: 1, swept: 1, left: [], unhandled: 0, kept: [] });
    expect(report.ended.map((one) => one.pid).sort()).toEqual([4, 5, 6]);
    expect(report.ended[0]!.command).toBe(`cmd-${report.ended[0]!.pid} Bearer [REDACTED]`);
    expect(calls.sort()).toEqual(["end 4", "end 5", "end 6"]);
    expect((await readTrees(root)).map((tree) => tree.id)).toEqual(["live"]);
  });

  it("leaves a process that has since taken a recorded pid with another start time", async () => {
    const record = await TreeRecord.create(root, "t", { pid: 3, startTime: 30 }, { pid: 4, startTime: 40 });
    await record.add({ kind: "cli", pid: 5, startTime: 50 });
    const { ops, calls } = fakeOps({ 4: 41, 5: 50 });
    expect((await sweepTrees(root, ops)).ended.map((one) => one.pid)).toEqual([5]);
    expect(calls).toEqual(["end 5"]);
  });

  it("ends a harness git command's whole group only while its identity matches, and keeps an entry whose process won't die", async () => {
    const record = await TreeRecord.create(root, "git", { pid: 3, startTime: 30 });
    await record.add({ kind: "git", pid: 8, startTime: 80 });
    const stuck = fakeOps({ 8: 80 }, "linux", [8]);
    expect(await sweepTrees(root, stuck.ops)).toMatchObject({ swept: 0, left: [{ pid: 8 }], kept: [{ id: "git" }] });
    expect(stuck.calls[0]).toBe("tree 8");
    expect((await readTrees(root)).map((tree) => tree.id)).toEqual(["git"]); // Kept for the next sweep.
    const reused = fakeOps({ 8: 81 });
    expect(await sweepTrees(root, reused.ops)).toMatchObject({ swept: 1, ended: [] });
    expect(reused.calls).toEqual([]);
  }, 20_000); // The stuck process holds the sweep for its whole 10 s.

  it("on Windows ends only a git entry: what the job held ended with its last handle", async () => {
    const record = await TreeRecord.create(root, "w", { pid: 3, startTime: 30 }, { pid: 4, startTime: 40 });
    await record.add({ kind: "git", pid: 8, startTime: 80 });
    const { ops, calls } = fakeOps({ 4: 40, 8: 80 }, "win32");
    expect(await sweepTrees(root, ops)).toMatchObject({ swept: 1, ended: [{ pid: 8 }] });
    expect(calls).toEqual(["tree 8"]);
  });

  it("on macOS removes the job and ends the coalition, and keeps an entry this machine can't handle", async () => {
    const record = await TreeRecord.create(root, "m", { pid: 3, startTime: 30 }, { pid: 4, startTime: 40 });
    await record.add({ kind: "job", label: "sa.job.1", coalition: "77" });
    const { ops, calls } = fakeOps({}, "darwin");
    expect(await sweepTrees(root, ops)).toMatchObject({ swept: 1 });
    expect(calls).toEqual(["job sa.job.1", "coalition 77"]);
    await (await TreeRecord.create(root, "n", { pid: 3, startTime: 30 })).add({ kind: "job", label: "sa.job.2", coalition: "78" });
    expect(await sweepTrees(root, { ...ops, removeJob: undefined })).toMatchObject({ swept: 0, unhandled: 1, kept: [{ id: "n" }] });
  });

  it("keeps an entry whose job or coalition operation fails, and one whose removal fails (C4)", async () => {
    await (await TreeRecord.create(root, "m", { pid: 3, startTime: 30 })).add({ kind: "job", label: "sa.job.1", coalition: "77" });
    const { ops } = fakeOps({}, "darwin");
    const report = await sweepTrees(root, { ...ops, endCoalition: async () => { throw new Error("EPERM"); } });
    expect(report).toMatchObject({ swept: 0, kept: [{ id: "m", reason: "coalition 77 couldn't be ended" }] });
    expect((await readTrees(root)).map((tree) => tree.id)).toEqual(["m"]);
  });

  it("keeps an entry whose post office or process can't be told apart from a gone one (C3)", async () => {
    await TreeRecord.create(root, "po", { pid: 3, startTime: 30 }, { pid: 4, startTime: 40 });
    const unsure = fakeOps({ 3: "unknown", 4: 40 });
    expect(await sweepTrees(root, unsure.ops)).toMatchObject({ swept: 0, running: 0, kept: [{ id: "po", reason: "the post office's state couldn't be told" }] });
    expect(unsure.calls).toEqual([]);
    const child = fakeOps({ 4: "unknown" });
    expect(await sweepTrees(root, child.ops)).toMatchObject({ swept: 0, kept: [{ id: "po", reason: "1 process whose state couldn't be told" }] });
    const throwing = { ...fakeOps({}).ops, probe: async (): Promise<Probe> => { throw new Error("EIO"); } };
    expect(await sweepTrees(root, throwing)).toMatchObject({ swept: 0, kept: [{ id: "po" }] });
    expect((await readTrees(root)).map((tree) => tree.id)).toEqual(["po"]);
  });

  it("keeps the entry and sends nothing where this machine can't bind the end to the identity (C2)", async () => {
    await (await TreeRecord.create(root, "t", { pid: 3, startTime: 30 })).add({ kind: "cli", pid: 5, startTime: 50 });
    const { ops } = fakeOps({ 5: 50 });
    let calls = 0;
    const report = await sweepTrees(root, { ...ops, endIdentity: async () => { calls++; return "declined"; } });
    expect(calls).toBe(1); // Declined once, not retried for the rest of the limit.
    expect(report).toMatchObject({ swept: 0, left: [{ pid: 5 }], kept: [{ id: "t", reason: "1 process couldn't be ended by identity on this machine; left running" }] });
  });

  it("ends nothing on an entry the trust check fails, and keeps it with the reason (review 15 C1)", async () => {
    await (await TreeRecord.create(root, "open", { pid: 3, startTime: 30 })).add({ kind: "cli", pid: 5, startTime: 50 });
    const { ops, calls } = fakeOps({ 5: 50 });
    const asked: { path: string; acl: boolean }[][] = [];
    const trust = async (paths: { path: string; acl: boolean }[]) => { asked.push(paths); return paths.map((one) => one.path.endsWith(".jsonl") ? "writable by S-1-1-0" : undefined); };
    expect(await sweepTrees(root, { ...ops, trust })).toMatchObject({ swept: 0, ended: [], kept: [{ id: "open", reason: expect.stringContaining("writable by S-1-1-0") }] });
    expect(calls).toEqual([]);
    expect(asked[0]!.map((one) => one.acl)).toEqual([false, true, true]); // `.shadow/` keeps the checkout's ACL.
    await expect(readVerifiedTrees(root, async (paths) => paths.map((_, index) => index === 1 ? "owned by S-1-5-32-544" : undefined))).rejects.toThrow(/owned by S-1-5-32-544/);
  });

  it("reports a process whose last probe couldn't tell as left, never as ended (review 15 C8)", async () => {
    await (await TreeRecord.create(root, "t", { pid: 3, startTime: 30 })).add({ kind: "cli", pid: 5, startTime: 50 });
    const { ops } = fakeOps({ 5: 50 });
    let probes = 0;
    const report = await sweepTrees(root, { ...ops, endIdentity: async () => "ended", probe: async (pid) => pid === 5 && probes++ > 0 ? "unknown" : ops.probe(pid) });
    expect(report).toMatchObject({ swept: 0, ended: [], left: [{ pid: 5 }], kept: [{ id: "t", reason: "1 process whose state couldn't be told" }] });
  });

  it("keeps to 10 s on a monotonic clock, gives every entry its first attempt, and bounds an operation that hangs (C5)", async () => {
    await (await TreeRecord.create(root, "a", { pid: 3, startTime: 30 })).add({ kind: "cli", pid: 5, startTime: 50 });
    await (await TreeRecord.create(root, "b", { pid: 3, startTime: 30 })).add({ kind: "cli", pid: 6, startTime: 60 });
    let clock = 0;
    const tried: number[] = [];
    const { ops } = fakeOps({ 5: 50, 6: 60 });
    const report = await sweepTrees(root, {
      ...ops, now: () => clock, wait: async (ms) => { clock += ms; },
      endIdentity: async (target) => { tried.push(target.pid); clock += 700; return "ended"; }, // Slow, and never ends either.
    });
    expect(tried.slice(0, 2).sort()).toEqual([5, 6]);
    expect(clock).toBeLessThan(SWEEP_LIMIT_MS + 2 * 700 + 100);
    expect(report).toMatchObject({ swept: 0, kept: [{ id: "a" }, { id: "b" }] });
    const hang = fakeOps({ 5: 50 });
    const started = Date.now();
    await sweepTrees(root, { ...hang.ops, endIdentity: () => new Promise(() => {}), commandOf: () => new Promise(() => {}), wait: async () => { throw new Error("stop"); } }).catch(() => {});
    expect(Date.now() - started).toBeLessThan(3 * OP_LIMIT_MS);
  }, 20_000);

  it("keeps a file with no post office line, and reports nothing when there are no trees (C7)", async () => {
    expect(await sweepTrees(root, fakeOps({}).ops)).toMatchObject({ running: 0, swept: 0, kept: [] });
    mkdirSync(treesDir(root), { recursive: true });
    writeFileSync(join(treesDir(root), "torn.jsonl"), '{"kind":"cli","pid":5,"startTime":50}\n{"kind":"post-off');
    const { ops, calls } = fakeOps({ 5: 50 });
    expect(await sweepTrees(root, ops)).toMatchObject({ swept: 0, kept: [{ id: "torn", reason: "no post office line" }] });
    expect(calls).toEqual([]);
  });

  const posixOnly = it.runIf(process.platform !== "win32");
  posixOnly("reads entries only through checked folders: a linked folder fails, a linked or foreign entry is skipped (C1)", async () => {
    const other = mkdtempSync(join(tmpdir(), "sa-sweep-other-"));
    try {
      await TreeRecord.create(other, "elsewhere", { pid: 3, startTime: 30 });
      await TreeRecord.create(root, "mine", { pid: 3, startTime: 30 });
      symlinkSync(join(treesDir(other), "elsewhere.jsonl"), join(treesDir(root), "linked.jsonl"));
      const trusted = async () => (await readVerifiedTrees(root)).filter((tree) => !tree.untrusted).map((tree) => tree.id);
      expect(await trusted()).toEqual(["mine"]);
      expect((await readVerifiedTrees(root)).find((tree) => tree.id === "linked")).toMatchObject({ lines: [], untrusted: "a link or not a file" });
      linkSync(join(treesDir(root), "mine.jsonl"), join(other, "second-name")); // Another name could change it.
      expect((await readVerifiedTrees(root)).find((tree) => tree.id === "mine")?.untrusted).toBe("has another link");
      rmSync(join(other, "second-name"));
      chmodSync(join(treesDir(root), "mine.jsonl"), 0o666); // Review 15 C1: writable by others.
      expect((await readVerifiedTrees(root)).find((tree) => tree.id === "mine")?.untrusted).toBe("not the owner's alone");
      rmSync(join(root, ".shadow"), { recursive: true });
      mkdirSync(join(root, ".shadow"));
      symlinkSync(join(other, ".shadow", "v2"), join(root, ".shadow", "v2"));
      await expect(readVerifiedTrees(root)).rejects.toThrow(/is a link/);
      rmSync(join(root, ".shadow"), { recursive: true });
      mkdirSync(join(root, ".shadow", "v2", "trees"), { recursive: true, mode: 0o777 });
      spawnSync("chmod", ["777", join(root, ".shadow", "v2")]);
      await expect(readVerifiedTrees(root)).rejects.toThrow(/owner's alone/);
    } finally { rmSync(other, { recursive: true, force: true }); }
  });

  it("has no operations for macOS until PO-17's helper exists", () => {
    expect(() => systemOps("darwin")).toThrow(/M1b-18/);
  });

  it("declines, sending nothing, when the Linux helper is missing", async () => {
    expect(await endThroughHelper({ pid: 5, startTime: 50 }, false, join(root, "no-helper"))).toBe("declined");
    expect(await systemOps("linux", join(root, "no-helper")).endIdentity({ pid: 5, startTime: 50 }, true)).toBe("declined");
  });

  const linux = it.runIf(process.platform === "linux");
  /** A real orphan: its shell exits at once, so `sleep` is handed to a subreaper or init, as after a dead post office. */
  const orphan = () => Number(spawnSync("sh", ["-c", "sleep 30 >/dev/null 2>&1 & echo $!"], { encoding: "utf8" }).stdout.trim());
  linux("ends a real orphan on Linux through the helper's pidfd only while its start time matches (C2)", async () => {
    const ops = systemOps();
    const pid = orphan();
    try {
      const start = await ops.probe(pid);
      expect(typeof start).toBe("number");
      expect(await ops.endIdentity({ pid, startTime: (start as number) + 1 }, false)).toBe("ended"); // Another process: nothing sent.
      expect(await ops.probe(pid)).toBe(start);
      const record = await TreeRecord.create(root, "real", { pid: 2 ** 22 - 1, startTime: 1 });
      await record.add({ kind: "cli", pid, startTime: start as number });
      const report = await sweepTrees(root, ops);
      expect(report).toMatchObject({ swept: 1, ended: [{ pid, command: "sleep 30" }], left: [], kept: [] });
      expect(existsSync(join(treesDir(root), "real.jsonl"))).toBe(false);
      expect(await ops.probe(pid)).toBe("absent");
      expect(await ops.probe(2 ** 22 - 1)).toBe("absent");
    } finally { try { process.kill(pid, "SIGKILL"); } catch { /* Gone. */ } }
  }, 20_000);

  posixOnly("declines a group end without running the helper: a group id can't be bound to its leader (review 15 C2)", async () => {
    expect(await endThroughHelper({ pid: 5, startTime: 50 }, true, "/bin/true")).toBe("declined"); // A helper that would exit 0.
  });

  linux("declines a real git-like group leader's group on Linux, leaving every member running (review 15 C2)", async () => {
    const ops = systemOps();
    const leader = spawn("sh", ["-c", "sleep 30 & echo $!; wait"], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
    const member = Number(await new Promise<string>((done) => leader.stdout!.once("data", (data) => done(String(data)))));
    try {
      const start = await ops.probe(leader.pid!);
      expect(await ops.endIdentity({ pid: leader.pid!, startTime: start as number }, true)).toBe("declined");
      await new Promise((done) => setTimeout(done, 200));
      expect(typeof await ops.probe(member)).toBe("number");
      expect(typeof await ops.probe(leader.pid!)).toBe("number");
    } finally {
      for (const one of [member, leader.pid!]) { try { process.kill(one, "SIGKILL"); } catch { /* Gone. */ } }
    }
  }, 20_000);

  const windows = it.runIf(process.platform === "win32");
  windows("on Windows passes the owner's own tree and fails a file or folder others can write (review 15 C1)", async () => {
    await TreeRecord.create(root, "mine", { pid: 3, startTime: 30 });
    const file = join(treesDir(root), "mine.jsonl");
    // PO-5's ACL, as the folders operation makes it: inheritance off, only this user, SYSTEM and Administrators.
    const me = spawnSync("powershell.exe", ["-NoProfile", "-Command", "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { encoding: "utf8" }).stdout.trim();
    const narrow = (path: string, inherit: string) => spawnSync("icacls", [path, "/inheritance:r", "/grant:r", ...[me, "S-1-5-18", "S-1-5-32-544"].map((sid) => `*${sid}:${inherit}F`)]).status;
    expect([narrow(join(root, ".shadow", "v2"), "(OI)(CI)"), narrow(treesDir(root), "(OI)(CI)"), narrow(file, "")]).toEqual([0, 0, 0]);
    expect(await windowsTrust([{ path: join(root, ".shadow", "v2"), acl: true }, { path: file, acl: true }])).toEqual([undefined, undefined]);
    expect((await readVerifiedTrees(root)).map((tree) => [tree.id, tree.untrusted])).toEqual([["mine", undefined]]);
    expect(spawnSync("icacls", [file, "/grant", "*S-1-1-0:(M)"]).status).toBe(0); // Everyone may modify it.
    expect((await readVerifiedTrees(root))[0]).toMatchObject({ lines: [], untrusted: "writable by S-1-1-0" });
    expect(await windowsTrust([{ path: join(root, "missing"), acl: true }])).toEqual(["unreadable"]);
    expect(spawnSync("icacls", [treesDir(root), "/grant", "*S-1-1-0:(M)"]).status).toBe(0);
    await expect(readVerifiedTrees(root)).rejects.toThrow(/writable by S-1-1-0/);
  }, 30_000);
  windows("ends a real process on Windows through its handle, and only while its creation time matches", async () => {
    const ops = systemOps();
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
    const exited = new Promise((done) => child.once("exit", done));
    try {
      const start = await ops.probe(child.pid!);
      expect(typeof start).toBe("number");
      expect(await ops.endIdentity({ pid: child.pid!, startTime: (start as number) + 1 }, false)).toBe("ended"); // Not the same process.
      expect(await ops.probe(child.pid!)).toBe(start);
      expect(await ops.endIdentity({ pid: child.pid!, startTime: start as number }, false)).toBe("ended");
      await exited;
      expect(await ops.probe(child.pid!)).toBe("absent");
    } finally { child.kill(); }
  }, 30_000);
});

describe("the one-shot entry (PO-16)", () => {
  it("prints the report as one JSON line, and exits 1 while a process is left", async () => {
    const root = mkdtempSync(join(tmpdir(), "sa-sweepmain-"));
    try {
      const lines: string[] = [];
      expect(await main([root], (line) => lines.push(line), fakeOps({}).ops)).toBe(0);
      expect(JSON.parse(lines[0]!)).toEqual({ running: 0, swept: 0, ended: [], left: [], unhandled: 0, kept: [] });
      await (await TreeRecord.create(root, "t", { pid: 3, startTime: 30 })).add({ kind: "cli", pid: 5, startTime: 50 });
      expect(await main([root], (line) => lines.push(line), fakeOps({ 5: 50 }, "linux", [5]).ops)).toBe(1);
      expect(JSON.parse(lines[1]!).left).toEqual([{ pid: 5, command: "cmd-5 Bearer [REDACTED]" }]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 20_000);

  it("refuses a wrong number of arguments, and makes no process call when the folder check fails (C6)", async () => {
    const lines: string[] = [];
    expect(await main([], (line) => lines.push(line))).toBe(2);
    expect(await main(["a", "b"], (line) => lines.push(line))).toBe(2);
    expect(JSON.parse(lines[0]!).error).toMatch(/usage/);
    const root = mkdtempSync(join(tmpdir(), "sa-sweepmain-"));
    try {
      mkdirSync(join(root, ".shadow"));
      writeFileSync(join(root, ".shadow", "v2"), "a file where the folder should be");
      const { ops, calls } = fakeOps({ 3: 31 });
      let probes = 0;
      expect(await main([root], (line) => lines.push(line), { ...ops, probe: async (pid) => { probes++; return ops.probe(pid); } })).toBe(2);
      expect(JSON.parse(lines[2]!).error).toMatch(/not a folder/);
      expect([probes, calls]).toEqual([0, []]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
