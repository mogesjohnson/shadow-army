import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  compareStart, containmentFailedMessage, DownSoldiers, holdGuardOpen, parseTreeFile, parseTreeLine, readTrees, stillRunning, TreeRecord, treesDir,
  unixMsOfFiletime, type Leftover, type ProcessOps,
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
    const owned = async () => true;
    expect(await readTrees(root, owned)).toEqual([{ id: "iron-1", lines: parseTreeFile(readFileSync(file("iron-1"), "utf8")), verified: true }]);
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

  it("verifies a record only when the opened file is this user's, has one link and is the named file (PO-16)", async () => {
    await TreeRecord.create(root, "own", { pid: 1, startTime: 1 });
    const verified = async (owned: () => Promise<boolean>) => Object.fromEntries((await readTrees(root, owned)).map((tree) => [tree.id, tree.verified]));
    expect(await verified(async () => true)).toEqual({ own: true });
    expect(await verified(async () => false)).toEqual({ own: false });
    linkSync(file("own"), file("linked")); // A second name for the file: either may be swapped.
    expect(await verified(async () => true)).toEqual({ own: false, linked: false });
  });

  const posix = it.runIf(process.platform !== "win32");
  posix("on POSIX refuses a record that is a link, or that others can write, or in a folder others can write", async () => {
    const record = await TreeRecord.create(root, "own", { pid: 1, startTime: 1 });
    expect((await readTrees(root)).map((tree) => tree.verified)).toEqual([true]);
    symlinkSync(file("own"), file("pointer"));
    expect(Object.fromEntries((await readTrees(root)).map((tree) => [tree.id, tree.verified]))).toEqual({ own: true }); // O_NOFOLLOW refuses to open the link: never read, never acted on.
    await record.remove(); rmSync(file("pointer"));
    await TreeRecord.create(root, "open", { pid: 1, startTime: 1 });
    chmodSync(file("open"), 0o666);
    expect((await readTrees(root)).map((tree) => tree.verified)).toEqual([false]);
    chmodSync(file("open"), 0o600); chmodSync(treesDir(root), 0o777);
    expect((await readTrees(root)).map((tree) => tree.verified)).toEqual([false]);
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
});

// Two Windows creation times in the same millisecond (FILETIME, 100 ns since 1601). As floats they would be equal.
const MS = 1_795_000_000_007;
const FIRST = "134394736000070001";
const SECOND = "134394736000070002";

describe("exact Windows creation times (PO-11, PO-16)", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "sa-trees-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("converts a FILETIME to Unix milliseconds without a float", () => {
    expect(Number(FIRST) === Number(SECOND)).toBe(true); // Why it is carried as a string.
    expect(unixMsOfFiletime(FIRST)).toBe(MS);
    expect(unixMsOfFiletime(SECOND)).toBe(MS);
  });

  it("records and reads back two processes created in the same millisecond as different processes", async () => {
    const record = await TreeRecord.create(root, "t", { pid: 1, startTime: MS, creationTime: FIRST });
    await record.listing([{ pid: 5, startTime: MS, creationTime: FIRST }, { pid: 5, startTime: MS, creationTime: SECOND }]);
    const lines = parseTreeFile(readFileSync(join(treesDir(root), "t.jsonl"), "utf8"));
    expect(lines).toEqual([
      { kind: "post-office", pid: 1, startTime: MS, creationTime: FIRST },
      { kind: "process", pid: 5, startTime: MS, creationTime: FIRST },
      { kind: "process", pid: 5, startTime: MS, creationTime: SECOND },
    ]);
  });

  it("still reads a record in the old millisecond format, and drops a creation time that is not a whole number", () => {
    expect(parseTreeLine(`{"kind":"cli","pid":5,"startTime":${MS}}`)).toEqual({ kind: "cli", pid: 5, startTime: MS });
    for (const bad of ['1.3439473600007e17', '"-1"', '"12x"', '134394736000070001', '""']) {
      expect(parseTreeLine(`{"kind":"cli","pid":5,"startTime":${MS},"creationTime":${bad.startsWith('"') ? bad : JSON.stringify(Number(bad))}}`))
        .toEqual({ kind: "cli", pid: 5, startTime: MS });
    }
  });

  it("matches only an exact creation time, and lets a millisecond record prove only a difference", () => {
    const exact = { pid: 5, startTime: MS, creationTime: FIRST };
    expect(compareStart(exact, FIRST)).toBe("same");
    expect(compareStart(exact, SECOND)).toBe("different"); // Same millisecond, another process.
    expect(compareStart(exact, undefined)).toBe("different");
    const old = { pid: 5, startTime: MS };
    expect(compareStart(old, SECOND)).toBe("unsure"); // The old format can't tell these apart.
    expect(compareStart(old, "134394736000080000")).toBe("different");
    expect(compareStart(old, undefined)).toBe("different");
    // Linux's clock ticks are exact as recorded.
    expect(compareStart({ pid: 5, startTime: 77 }, 77)).toBe("same");
    expect(compareStart({ pid: 5, startTime: 77 }, 78)).toBe("different");
  });

  it("counts a leftover in the same millisecond as gone, and never ends one it is unsure of", async () => {
    const alive: Record<number, string> = { 5: SECOND, 6: FIRST };
    const ended: number[][] = [];
    const ops: ProcessOps = { startTimeOf: async (pid) => alive[pid], end: async (processes) => { ended.push(processes.map((one) => one.pid)); } };
    const exact: Leftover = { pid: 5, startTime: MS, creationTime: FIRST, command: "a" };
    const old: Leftover = { pid: 6, startTime: MS, command: "b" };
    expect(await stillRunning(ops, [exact])).toEqual([]);
    expect(await stillRunning(ops, [old])).toEqual([old]); // Kept as running: the soldier stays down.
    const aborted = new AbortController();
    const held = holdGuardOpen([old], ops, { wait: async () => { aborted.abort(); }, signal: aborted.signal });
    expect(await held).toBe("cut-short");
    expect(ended).toEqual([]);
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
