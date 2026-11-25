import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  containmentFailedMessage, DownSoldiers, holdGuardOpen, parseTreeFile, parseTreeLine, readTrees, stillRunning, TreeRecord, treesDir,
  type Leftover, type ProcessOps,
} from "./trees.js";

describe("tree records (PO-16, M1-AC16)", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "sa-trees-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  const file = (id: string) => join(treesDir(root), `${id}.jsonl`);

  it("writes the post office, guardian and CLI lines and no secret, then removes the entry", async () => {
    const record = await TreeRecord.create(root, "iron-1", { pid: 10, startTime: 100 }, { pid: 11, startTime: 110 });
    await record.add({ kind: "cli", pid: 12, startTime: 120 });
    await record.add({ kind: "job", label: "sa.job.1", coalition: "77" });
    expect(readFileSync(file("iron-1"), "utf8")).toBe([
      '{"kind":"post-office","pid":10,"startTime":100}', '{"kind":"guardian","pid":11,"startTime":110}',
      '{"kind":"cli","pid":12,"startTime":120}', '{"kind":"job","label":"sa.job.1","coalition":"77"}', "",
    ].join("\n"));
    expect(await readTrees(root)).toEqual([{ id: "iron-1", lines: parseTreeFile(readFileSync(file("iron-1"), "utf8")) }]);
    await record.remove();
    await record.remove(); // Removing twice is fine.
    expect(await readTrees(root)).toEqual([]);
  });

  it("skips a line that doesn't parse, and a record of the wrong shape", () => {
    const text = ['{"kind":"cli","pid":4,"startTime":9}', "not json", '{"kind":"cli","pid":-1,"startTime":9}', '{"kind":"cli","pid":"4","startTime":9}',
      '{"kind":"job","label":1,"coalition":"2"}', '{"kind":"other","pid":4,"startTime":9}', "null", '{"kind":"git","pid":5,"startTime":0}', ""].join("\n");
    expect(parseTreeFile(text)).toEqual([{ kind: "cli", pid: 4, startTime: 9 }, { kind: "git", pid: 5, startTime: 0 }]);
    expect(parseTreeLine("[]")).toBeUndefined();
  });

  it("reads no trees from a folder that has none, and skips files that are not tree files", async () => {
    expect(await readTrees(root)).toEqual([]);
    mkdirSync(treesDir(root), { recursive: true });
    writeFileSync(join(treesDir(root), "note.txt"), "x");
    mkdirSync(join(treesDir(root), "dir.jsonl")); // Unreadable as a file.
    expect(await readTrees(root)).toEqual([]);
  });

  it("refuses an id that is not a plain name, and a second entry under the same id", async () => {
    await expect(TreeRecord.create(root, "../escape", { pid: 1, startTime: 1 })).rejects.toThrow("invalid tree id");
    await TreeRecord.create(root, "same", { pid: 1, startTime: 1 });
    await expect(TreeRecord.create(root, "same", { pid: 2, startTime: 2 })).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("fails when the entry can't be written, so the CLI doesn't start", async () => {
    mkdirSync(join(root, ".shadow", "v2"), { recursive: true });
    writeFileSync(treesDir(root), "a file where the folder should be");
    await expect(TreeRecord.create(root, "iron", { pid: 1, startTime: 1 })).rejects.toThrow();
  });

  it("records each listed process once, and reports a listing line that can't be added once", async () => {
    const errors: unknown[] = [];
    const record = await TreeRecord.create(root, "t", { pid: 1, startTime: 1 }, undefined, (error) => errors.push(error));
    await record.listing([{ pid: 5, startTime: 50 }, { pid: 6, startTime: 60 }]);
    await record.listing([{ pid: 5, startTime: 50 }, { pid: 5, startTime: 51 }]); // Same pid, new start time: a new process.
    expect(parseTreeFile(readFileSync(file("t"), "utf8")).filter((line) => line.kind === "process")).toHaveLength(3);
    rmSync(file("t"));
    mkdirSync(file("t")); // The file can no longer be opened for appending.
    await record.listing([{ pid: 7, startTime: 70 }]);
    await record.listing([{ pid: 8, startTime: 80 }]);
    expect(errors).toHaveLength(1);
  });

  it("tries a listing line again 100 ms later, so a passing fault loses nothing (PO-5)", async () => {
    const errors: unknown[] = [];
    const waits: number[] = [];
    const record = await TreeRecord.create(root, "t", { pid: 1, startTime: 1 }, undefined, (error) => errors.push(error), async (ms) => {
      waits.push(ms);
      rmSync(file("t"), { recursive: true });
      writeFileSync(file("t"), '{"kind":"post-office","pid":1,"startTime":1}\n'); // The disk is writable again.
    });
    rmSync(file("t"));
    mkdirSync(file("t"));
    await record.listing([{ pid: 5, startTime: 50 }]);
    expect(waits).toEqual([100]);
    expect(errors).toEqual([]);
    expect(parseTreeFile(readFileSync(file("t"), "utf8"))).toContainEqual({ kind: "process", pid: 5, startTime: 50 });
  });

  it("keeps a line that failed twice for the next listing, and ends a line cut short before the next one", async () => {
    const errors: unknown[] = [];
    const record = await TreeRecord.create(root, "t", { pid: 1, startTime: 1 }, undefined, (error) => errors.push(error), async () => {});
    rmSync(file("t"));
    mkdirSync(file("t"));
    await record.listing([{ pid: 5, startTime: 50 }]);
    await record.listing([{ pid: 6, startTime: 60 }]);
    expect(errors).toHaveLength(1); // Reported once.
    rmSync(file("t"), { recursive: true });
    writeFileSync(file("t"), '{"kind":"post-office","pid":1,"startTime":1}\n{"kind":"process","pid":5,"sta'); // A write cut short.
    await record.listing([]); // Both processes have left the listing; their identities are still recorded.
    expect(parseTreeFile(readFileSync(file("t"), "utf8"))).toEqual([
      { kind: "post-office", pid: 1, startTime: 1 }, { kind: "process", pid: 5, startTime: 50 }, { kind: "process", pid: 6, startTime: 60 },
    ]);
  });

  it("writes only the record's own fields, whatever else the caller's identity carries (PO-16)", async () => {
    const extra = { pid: 10, startTime: 100, nonce: "n-123", env: { TOKEN: "sk-ant-secret" } };
    const record = await TreeRecord.create(root, "x", extra, extra);
    await record.add({ ...extra, kind: "cli" } as never);
    await record.add({ kind: "job", label: "sa.job.1", coalition: "77", secret: "s" } as never);
    await record.listing([extra]);
    const text = readFileSync(file("x"), "utf8");
    expect(text).not.toMatch(/nonce|TOKEN|secret/);
    expect(text.split("\n").filter(Boolean).every((line) => JSON.stringify(parseTreeLine(line)) === line)).toBe(true);
    await expect(record.add({ kind: "cli", pid: 0, startTime: 1 })).rejects.toThrow("invalid tree line");
  });
});

describe("the failure path (PO-15, M1-AC19)", () => {
  const sudo: Leftover = { pid: 4242, startTime: 9, command: "sudo make install --password=abc Bearer sk-ant-0123456789abcdef" };
  /** Fake processes by pid: `end` removes the ones named in `endable`, as a signal the owner's user may not send would not. */
  function fakeOps(alive: Record<number, number>, endable = true): ProcessOps & { ended: number[][] } {
    const ended: number[][] = [];
    return {
      ended,
      startTimeOf: async (pid) => alive[pid],
      end: async (processes) => { ended.push(processes.map((one) => one.pid)); if (endable) for (const one of processes) delete alive[one.pid]; },
    };
  }

  it("says what failed and names each leftover, with its command line redacted", () => {
    const message = containmentFailedMessage("Iron", { leftovers: [sudo] });
    expect(message).toBe("Containment failed for Iron: 1 process couldn't be ended (4242 sudo make install --password=[REDACTED] Bearer [REDACTED]). Iron is down and won't restart by itself.");
    expect(containmentFailedMessage("Iron", { leftovers: [sudo, { ...sudo, pid: 4243, command: "a\nb" }] })).toContain("2 processes couldn't be ended (4242 sudo");
    expect(containmentFailedMessage("Iron", { leftovers: [sudo, { ...sudo, pid: 4243, command: "a\nb" }] })).toContain(", 4243 a b)");
    expect(containmentFailedMessage("Iron", { leftovers: "unknown" })).toBe("Containment failed for Iron: processes the CLI started may still be running. Iron is down and won't restart by itself.");
    expect(containmentFailedMessage("Iron", { leftovers: [] })).toContain("may still be running");
    expect(containmentFailedMessage("Iron", { reason: "the tree entry couldn't be written: EACCES Bearer abc123" })).toBe("Containment failed for Iron: the tree entry couldn't be written: EACCES Bearer [REDACTED]. Iron is down and won't restart by itself.");
    expect(containmentFailedMessage("Iron", { leftovers: [{ ...sudo, command: "x".repeat(500) }] }).length).toBeLessThan(330);
  });

  it("counts a leftover as running only while its pid still has the recorded start time", async () => {
    const ops = fakeOps({ 4242: 9, 7: 1 });
    expect(await stillRunning(ops, [sudo, { ...sudo, pid: 7, startTime: 2 }, { ...sudo, pid: 8 }])).toEqual([sudo]);
  });

  it("keeps a failed soldier down, and lets a reconnect start the CLI only once the named processes are gone", async () => {
    const alive: Record<number, number> = { 4242: 9 };
    const ops = fakeOps(alive);
    const down = new DownSoldiers();
    expect(await down.mayStart("Iron", ops)).toBe(true);
    down.fail("Iron", [sudo]);
    expect(down.isDown("Iron")).toBe(true);
    expect(await down.mayStart("Iron", ops)).toBe(false);
    alive[4242] = 10; // The pid is now another process: the named one is gone.
    expect(await down.mayStart("Iron", ops)).toBe(true);
    expect(down.isDown("Iron")).toBe(false);
    down.fail("Igris"); // Nothing is named (unknown leftovers): the next reconnect runs the check and starts.
    expect(await down.mayStart("Igris", ops)).toBe(true);
  });

  it("keeps the soldier down when a newer failure is recorded while a reconnect's check runs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    const ops: ProcessOps = { startTimeOf: async () => { await gate; return undefined; }, end: async () => {} };
    const down = new DownSoldiers();
    down.fail("Iron", [sudo]);
    const reconnect = down.mayStart("Iron", ops); // The old named process is gone, but the probe is still pending.
    down.fail("Iron", [{ ...sudo, pid: 5151 }]); // A newer containment failure.
    release();
    expect(await reconnect).toBe(false);
    expect(down.isDown("Iron")).toBe(true);
  });

  it("says, for a running turn cut short, that what unknown processes change won't be on its attribution card", () => {
    const warning = "What those processes change won't be on the turn's attribution card.";
    expect(containmentFailedMessage("Iron", { leftovers: "unknown", turnCutShort: true })).toBe(
      `Containment failed for Iron: processes the CLI started may still be running. Iron is down and won't restart by itself. ${warning}`);
    expect(containmentFailedMessage("Iron", { leftovers: "unknown" })).not.toContain("attribution");
    expect(containmentFailedMessage("Iron", { leftovers: [sudo], turnCutShort: true })).not.toContain("attribution");
  });

  it("holds the guard open, ending the named processes again every 10 s, until they have all ended", async () => {
    const alive: Record<number, number> = { 4242: 9, 4243: 5 };
    const ops = fakeOps(alive, false);
    const waits: number[] = [];
    const held = holdGuardOpen([sudo, { ...sudo, pid: 4243, startTime: 5 }], ops, {
      wait: async (ms) => { waits.push(ms); if (waits.length === 2) delete alive[4242]; if (waits.length === 3) delete alive[4243]; },
    });
    expect(await held).toBe("ended");
    expect(waits).toEqual([10_000, 10_000, 10_000]);
    expect(ops.ended).toEqual([[4242, 4243], [4242, 4243], [4243]]);
  });

  it("cuts the turn short where it can't tell which processes remain, and when the hold is aborted", async () => {
    expect(await holdGuardOpen("unknown", fakeOps({}))).toBe("cut-short");
    expect(await holdGuardOpen([], fakeOps({}))).toBe("cut-short");
    const abort = new AbortController();
    const ops = fakeOps({ 4242: 9 }, false);
    ops.end = async () => { throw new Error("EPERM"); }; // A process run as another user through sudo can't be signalled.
    const held = holdGuardOpen([sudo], ops, { wait: async () => abort.abort(), signal: abort.signal });
    expect(await held).toBe("cut-short");
  });
});
