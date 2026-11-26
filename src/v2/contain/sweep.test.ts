import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTimeFromStat, sweepTrees, systemOps, type SweepOps } from "./sweep.js";
import { probeWindowsProcess } from "./windows.js";
import { main } from "../sweepMain.js";
import { readTrees, TreeRecord, treesDir } from "./trees.js";

/** Fake processes by pid → start time. Ending one removes it, unless its pid is in `stuck`. */
function fakeOps(alive: Record<number, number | string | null>, platform: NodeJS.Platform = "linux", stuck: number[] = []) {
  const calls: string[] = [];
  let clock = 0; // A fake monotonic clock: only the waits move it.
  const ops: SweepOps = {
    platform, now: () => clock,
    owned: async () => true,
    startTimeOf: async (pid) => alive[pid],
    commandOf: async (pid) => `cmd-${pid} Bearer abc123`,
    // Like the Windows handle: the end reaches only the process whose start time is the given identity's.
    endProcess: async ({ pid, startTime, creationTime }, tree) => {
      calls.push(`${tree ? "tree" : "end"} ${pid}`);
      if (alive[pid] === (creationTime ?? startTime) && !stuck.includes(pid)) delete alive[pid];
      return "ended";
    },
    removeJob: async (label) => { calls.push(`job ${label}`); },
    endCoalition: async (id) => { calls.push(`coalition ${id}`); },
    wait: async (ms) => { clock += ms; },
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
    expect(report).toMatchObject({ running: 1, swept: 1, left: [], unhandled: 0 });
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
    expect(await sweepTrees(root, stuck.ops)).toMatchObject({ swept: 0, left: [{ pid: 8 }] });
    expect(stuck.calls[0]).toBe("tree 8");
    expect((await readTrees(root)).map((tree) => tree.id)).toEqual(["git"]); // Kept for the next sweep.
    const reused = fakeOps({ 8: 81 });
    expect(await sweepTrees(root, reused.ops)).toMatchObject({ swept: 1, ended: [] });
    expect(reused.calls).toEqual([]);
  });

  it("on Windows ends only a git entry: what the job held ended with its last handle", async () => {
    const record = await TreeRecord.create(root, "w", { pid: 3, startTime: 30 }, { pid: 4, startTime: 40 });
    await record.add({ kind: "git", pid: 8, startTime: 80 });
    const { ops, calls } = fakeOps({ 4: 40, 8: 80 }, "win32");
    expect(await sweepTrees(root, ops)).toMatchObject({ swept: 1, ended: [{ pid: 8 }] });
    expect(calls).toEqual(["tree 8"]);
  });

  it("on Windows never takes a process created in the same millisecond for the recorded one", async () => {
    const ms = 1_795_000_000_007;
    const record = await TreeRecord.create(root, "w", { pid: 3, startTime: ms, creationTime: "134394736000070001" });
    await record.add({ kind: "git", pid: 8, startTime: ms, creationTime: "134394736000070001" });
    const { ops, calls } = fakeOps({ 3: "134394736000070002", 8: "134394736000070002" }, "win32");
    expect(await sweepTrees(root, ops)).toMatchObject({ running: 0, swept: 1, ended: [], left: [] });
    expect(calls).toEqual([]);
    expect(await readTrees(root)).toEqual([]);
  });

  it("gives the end operation the verified identity, so a pid reused after the last check is spared", async () => {
    const record = await TreeRecord.create(root, "w", { pid: 3, startTime: 30, creationTime: "134394736000030000" });
    await record.add({ kind: "git", pid: 8, startTime: 80, creationTime: "134394736000080000" });
    const { ops, alive } = fakeOps({ 8: "134394736000080000" }, "win32");
    const ended: unknown[] = [];
    let probes = 0;
    const racing: SweepOps = {
      ...ops,
      // The pid is reused just after the check before the end.
      startTimeOf: async (pid) => { const now = alive[pid]; if (pid === 8 && ++probes === 2) alive[8] = "134394736000090000"; return now; },
      endProcess: async (target, tree) => { ended.push(target); await ops.endProcess(target, tree); },
    };
    await sweepTrees(root, racing);
    expect(ended).toEqual([{ kind: "git", pid: 8, startTime: 80, creationTime: "134394736000080000" }]);
    expect(alive[8]).toBe("134394736000090000");
  });

  it("keeps and reports a tree whose post office or process could not be probed, never reading it as absent", async () => {
    await TreeRecord.create(root, "office", { pid: 3, startTime: 30, creationTime: "134394736000030000" });
    const record = await TreeRecord.create(root, "git", { pid: 4, startTime: 40, creationTime: "134394736000040000" });
    await record.add({ kind: "git", pid: 8, startTime: 80, creationTime: "134394736000080000" });
    const { ops, calls } = fakeOps({ 3: null, 8: null }, "win32");
    const report = await sweepTrees(root, ops);
    expect(report).toMatchObject({ running: 0, swept: 0, ended: [] });
    expect(report.left.map((one) => one.pid).sort()).toEqual([3, 8]);
    expect(calls).toEqual([]);
    expect((await readTrees(root)).map((tree) => tree.id).sort()).toEqual(["git", "office"]);
  });

  it("keeps a tree whose descendants weren't all confirmed ended, even once its checked parent has gone (C9)", async () => {
    const record = await TreeRecord.create(root, "git", { pid: 4, startTime: 40 });
    await record.add({ kind: "git", pid: 8, startTime: 80 });
    const { ops } = fakeOps({ 8: 80 });
    const failing: SweepOps = { ...ops, endProcess: async (target, tree) => { await ops.endProcess(target, tree); return "incomplete"; } };
    expect(await sweepTrees(root, failing)).toMatchObject({ swept: 0, ended: [], left: [{ pid: 8 }] });
    expect((await readTrees(root)).map((tree) => tree.id)).toEqual(["git"]);
    const throwing: SweepOps = { ...fakeOps({ 8: 80 }).ops, endProcess: async () => { throw new Error("EPERM"); } };
    expect(await sweepTrees(root, throwing)).toMatchObject({ swept: 0, left: [{ pid: 8 }] });
  });

  it.each(["probe", "end"])("ends the sweep near its limit when a %s never answers, and keeps the entry (C10)", async (stuck) => {
    await TreeRecord.create(root, "stuck", { pid: 3, startTime: 30 }, { pid: 4, startTime: 40 });
    const { ops } = fakeOps({ 4: 40 });
    let closed = 0;
    const hanging: SweepOps = {
      ...ops, now: () => performance.now(), wait: (ms) => new Promise((done) => setTimeout(done, ms)), close: () => { closed++; },
      startTimeOf: (pid) => stuck === "probe" && pid === 4 ? new Promise(() => {}) : ops.startTimeOf(pid),
      endProcess: (target, tree) => stuck === "end" ? new Promise(() => {}) : ops.endProcess(target, tree),
    };
    const began = performance.now();
    const report = await sweepTrees(root, hanging, 500);
    expect(performance.now() - began).toBeLessThan(500 + 100 + 1_000); // The limit, the last check's bound, slack.
    expect(report).toMatchObject({ swept: 0, left: [{ pid: 4 }] });
    expect((await readTrees(root)).map((tree) => tree.id)).toEqual(["stuck"]);
    expect(closed).toBe(1);
  });

  it("keeps a tree left incomplete across sweeps, until nothing it may have left still runs (C9)", async () => {
    const record = await TreeRecord.create(root, "git", { pid: 4, startTime: 40 });
    await record.add({ kind: "git", pid: 8, startTime: 80 });
    const { ops } = fakeOps({ 8: 80 });
    expect(await sweepTrees(root, { ...ops, endProcess: async (target, tree) => { await ops.endProcess(target, tree); return "incomplete"; } }))
      .toMatchObject({ swept: 0, left: [{ pid: 8 }] });
    // Later sweeps find the parent gone: that alone resolves nothing.
    const later = fakeOps({}).ops;
    const asked: unknown[] = [];
    for (const leftOf of [undefined, async () => 1, async () => null, async () => { throw new Error("no listing"); }]) {
      expect(await sweepTrees(root, { ...later, leftOf: leftOf && (async (target) => { asked.push(target); return leftOf(); }) })).toMatchObject({ swept: 0, left: [{ pid: 8 }] });
    }
    expect(asked).toEqual(Array(3).fill({ kind: "git", pid: 8, startTime: 80 }));
    expect(await sweepTrees(root, { ...later, leftOf: async () => 0 })).toMatchObject({ swept: 1, left: [] });
    expect([existsSync(join(treesDir(root), "git.incomplete")), (await readTrees(root)).length]).toEqual([false, 0]);
  });

  it("records a tree as unresolved before its end starts, so a crash after the start never forgets it (C9)", async () => {
    const record = await TreeRecord.create(root, "git", { pid: 4, startTime: 40 });
    await record.add({ kind: "git", pid: 8, startTime: 80 });
    const marker = join(treesDir(root), "git.incomplete");
    const { ops } = fakeOps({ 8: 80 });
    let onDisk: string | undefined;
    // The marker as a crash just after the start would leave it; the parent then goes, its descendants may not.
    const crashing: SweepOps = { ...ops, endProcess: async (target, tree) => { onDisk = existsSync(marker) ? readFileSync(marker, "utf8") : undefined; await ops.endProcess(target, tree); return "incomplete"; } };
    await sweepTrees(root, crashing);
    expect(onDisk).toBe(`${JSON.stringify({ kind: "git", pid: 8, startTime: 80 })}\n`);
    writeFileSync(marker, onDisk!);
    expect(await sweepTrees(root, fakeOps({}).ops)).toMatchObject({ swept: 0, left: [{ pid: 8 }] });
    // A marker that can't be written or read: no tree end starts, and the entry is kept.
    rmSync(marker); mkdirSync(marker);
    const { ops: unwritable, calls } = fakeOps({ 8: 80 });
    expect(await sweepTrees(root, unwritable)).toMatchObject({ swept: 0, left: [{ pid: 8 }] });
    expect(calls).toEqual([]);
    expect((await readTrees(root)).map((tree) => tree.id)).toEqual(["git"]);
  });

  it("starts no operation past its deadline, and gives each one the deadline it must stop by (C10)", async () => {
    const record = await TreeRecord.create(root, "git", { pid: 4, startTime: 40 });
    await record.add({ kind: "git", pid: 8, startTime: 80 });
    const { ops } = fakeOps({ 8: 80 });
    const started: string[] = [];
    const watched: SweepOps = {
      ...ops,
      owned: async (_path, _stats, until) => { started.push(`owned ${until}`); return true; },
      startTimeOf: async (pid, until) => { started.push(`probe ${pid} ${until}`); return ops.startTimeOf(pid); },
      endProcess: async (target, tree, until) => { started.push(`end ${target.pid} ${until}`); return ops.endProcess(target, tree); },
    };
    // An exhausted budget starts nothing, the listing and owner checks included: the record stays, unhandled.
    expect(await sweepTrees(root, watched, 0)).toMatchObject({ swept: 0, unhandled: 1, unverified: 0 });
    expect(started).toEqual([]);
    expect(await sweepTrees(root, watched, 1_000)).toMatchObject({ swept: 1, ended: [{ pid: 8 }] });
    expect(started).toEqual(["owned 1000", "owned 1000", "owned 1000", "owned 1000", "probe 4 1000", "probe 8 1000", "probe 8 1000", "end 8 1000", "probe 8 1000", "probe 8 1200"]);
  });

  it("never ends a process on a record it couldn't verify as the user's own, and keeps the record", async () => {
    const record = await TreeRecord.create(root, "foreign", { pid: 3, startTime: 30 });
    await record.add({ kind: "cli", pid: 5, startTime: 50 });
    const { ops, calls } = fakeOps({ 5: 50 });
    const report = await sweepTrees(root, { ...ops, owned: async () => false });
    expect(report).toEqual({ running: 0, swept: 0, ended: [], left: [], unhandled: 1, unverified: 1 });
    expect(calls).toEqual([]);
    expect((await readTrees(root)).map((tree) => tree.id)).toEqual(["foreign"]);
  });

  it("on Windows reads an old millisecond record, but never ends a process on its evidence alone", async () => {
    const ms = 1_795_000_000_007;
    await TreeRecord.create(root, "live", { pid: 1, startTime: ms }); // Same millisecond: maybe still running.
    const old = await TreeRecord.create(root, "old", { pid: 3, startTime: ms });
    await old.add({ kind: "git", pid: 8, startTime: ms });
    await old.add({ kind: "git", pid: 9, startTime: ms });
    const { ops, calls } = fakeOps({ 1: "134394736000070009", 3: "134394736000080000", 8: "134394736000070002" }, "win32");
    const report = await sweepTrees(root, ops);
    expect(report).toMatchObject({ running: 1, swept: 0, ended: [], left: [{ pid: 8 }] });
    expect(calls).toEqual([]);
    expect((await readTrees(root)).map((tree) => tree.id).sort()).toEqual(["live", "old"]); // Kept for the owner.
  });

  it("on macOS removes the job and ends the coalition, and keeps an entry this machine can't handle", async () => {
    const record = await TreeRecord.create(root, "m", { pid: 3, startTime: 30 }, { pid: 4, startTime: 40 });
    await record.add({ kind: "job", label: "sa.job.1", coalition: "77" });
    const { ops, calls } = fakeOps({}, "darwin");
    expect(await sweepTrees(root, ops)).toMatchObject({ swept: 1 });
    expect(calls).toEqual(["job sa.job.1", "coalition 77"]);
    await (await TreeRecord.create(root, "n", { pid: 3, startTime: 30 })).add({ kind: "job", label: "sa.job.2", coalition: "78" });
    expect(await sweepTrees(root, { ...ops, removeJob: undefined })).toMatchObject({ swept: 0, unhandled: 1 });
  });

  it("skips a file with no post office line, and reports nothing when there are no trees", async () => {
    expect(await sweepTrees(root, fakeOps({}).ops)).toMatchObject({ running: 0, swept: 0 });
    await TreeRecord.create(root, "torn", { pid: 3, startTime: 30 });
    rmSync(join(treesDir(root), "torn.jsonl"));
    expect(await sweepTrees(root, fakeOps({}).ops)).toMatchObject({ swept: 0 });
  });

  it("reads an unreadable identity as unknown, never as an ended process (C7)", async () => {
    const stat = (state: string) => `42 (a b) ${state} 1 42 42 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 777 0 0`;
    expect([startTimeFromStat(42, stat("S")), startTimeFromStat(42, stat("Z")), startTimeFromStat(42, stat("X"))]).toEqual([777, undefined, undefined]);
    for (const bad of ["", "42 (no end", "42 (a) S 1", "42 (a) Z"]) expect(startTimeFromStat(42, bad)).toBeNull();
    for (const pid of [0, -1, 2 ** 32, 1.5]) expect(await probeWindowsProcess(pid)).toBeNull();
  });

  it("has no operations for macOS until PO-17's helper exists", () => {
    expect(() => systemOps("darwin")).toThrow(/M1b-18/);
  });

  it.runIf(process.platform === "win32")("reads a Windows process's exact creation time, not milliseconds", async () => {
    const ops = systemOps();
    try {
      expect(await ops.startTimeOf(process.pid)).toMatch(/^[1-9]\d{17}$/);
      expect(await ops.startTimeOf(2 ** 31 - 2)).toBeUndefined();
    } finally { await ops.close?.(); }
  }, 30_000);

  const linux = it.runIf(process.platform === "linux");
  linux("ends a real orphaned process on Linux by its identity, and spares one with the wrong start time", async () => {
    const ops = systemOps();
    const orphan = spawn("sleep", ["30"], { stdio: "ignore" });
    const bystander = spawn("sleep", ["30"], { stdio: "ignore" });
    try {
      const orphanStart = (await ops.startTimeOf(orphan.pid!))!;
      const record = await TreeRecord.create(root, "real", { pid: 2 ** 22 - 1, startTime: 1 });
      await record.add({ kind: "cli", pid: orphan.pid!, startTime: orphanStart });
      await record.add({ kind: "cli", pid: bystander.pid!, startTime: 1 });
      const report = await sweepTrees(root, ops);
      expect(report.ended.map((one) => one.pid)).toEqual([orphan.pid]);
      expect(report.ended[0]!.command).toContain("sleep 30");
      expect(existsSync(join(treesDir(root), "real.jsonl"))).toBe(false);
      expect(await ops.startTimeOf(orphan.pid!)).toBeUndefined();
      expect(await ops.startTimeOf(bystander.pid!)).toBeDefined();
    } finally { orphan.kill("SIGKILL"); bystander.kill("SIGKILL"); }
  });
});

describe("the one-shot entry (PO-16)", () => {
  it("prints the report as one JSON line, and exits 1 while a process is left", async () => {
    const root = mkdtempSync(join(tmpdir(), "sa-sweepmain-"));
    try {
      const lines: string[] = [];
      expect(await main([root], (line) => lines.push(line), fakeOps({}).ops)).toBe(0);
      expect(JSON.parse(lines[0]!)).toEqual({ running: 0, swept: 0, ended: [], left: [], unhandled: 0, unverified: 0 });
      await (await TreeRecord.create(root, "t", { pid: 3, startTime: 30 })).add({ kind: "cli", pid: 5, startTime: 50 });
      expect(await main([root], (line) => lines.push(line), fakeOps({ 5: 50 }, "linux", [5]).ops)).toBe(1);
      expect(JSON.parse(lines[1]!).left).toEqual([{ pid: 5, command: "cmd-5 Bearer [REDACTED]" }]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a wrong number of arguments, and reports a machine it has no operations for", async () => {
    const lines: string[] = [];
    expect(await main([], (line) => lines.push(line))).toBe(2);
    expect(await main(["a", "b"], (line) => lines.push(line))).toBe(2);
    expect(JSON.parse(lines[0]!).error).toMatch(/usage/);
    const failing = { ...fakeOps({}).ops, startTimeOf: async () => { throw new Error("no /proc"); } };
    const root = mkdtempSync(join(tmpdir(), "sa-sweepmain-"));
    try {
      await TreeRecord.create(root, "t", { pid: 3, startTime: 30 });
      expect(await main([root], (line) => lines.push(line), failing)).toBe(2);
      expect(JSON.parse(lines[2]!)).toEqual({ error: "no /proc" });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
