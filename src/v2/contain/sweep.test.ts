import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sweepTrees, systemOps, type SweepOps } from "./sweep.js";
import { main } from "../sweepMain.js";
import { readTrees, TreeRecord, treesDir } from "./trees.js";

/** Fake processes by pid → start time. Ending one removes it, unless its pid is in `stuck`. */
function fakeOps(alive: Record<number, number>, platform: NodeJS.Platform = "linux", stuck: number[] = []) {
  const calls: string[] = [];
  const ops: SweepOps = {
    platform,
    startTimeOf: async (pid) => alive[pid],
    commandOf: async (pid) => `cmd-${pid} Bearer abc123`,
    endProcess: async (pid, tree) => { calls.push(`${tree ? "tree" : "end"} ${pid}`); if (!stuck.includes(pid)) delete alive[pid]; },
    removeJob: async (label) => { calls.push(`job ${label}`); },
    endCoalition: async (id) => { calls.push(`coalition ${id}`); },
    wait: async () => {},
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

  it("has no operations for macOS until PO-17's helper exists", () => {
    expect(() => systemOps("darwin")).toThrow(/M1b-18/);
  });

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
      await new Promise((done) => orphan.once("exit", done));
      expect(bystander.exitCode).toBeNull();
    } finally { orphan.kill("SIGKILL"); bystander.kill("SIGKILL"); }
  });
});

describe("the one-shot entry (PO-16)", () => {
  it("prints the report as one JSON line, and exits 1 while a process is left", async () => {
    const root = mkdtempSync(join(tmpdir(), "sa-sweepmain-"));
    try {
      const lines: string[] = [];
      expect(await main([root], (line) => lines.push(line), fakeOps({}).ops)).toBe(0);
      expect(JSON.parse(lines[0]!)).toEqual({ running: 0, swept: 0, ended: [], left: [], unhandled: 0 });
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
