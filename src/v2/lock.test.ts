import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireLock, lockMessages, type LockRecord, type StartTimeOf } from "./lock.js";

/** Faults armed by a test: the lock's temporary writes, and the Nth folder scan, fail. */
const fault = vi.hoisted(() => ({ tmpWrite: null as string | null, scanCall: 0, scans: 0, lockUnlink: null as string | null, lockRename: null as string | null, lockRenames: 0 }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const failure = (code: string) => Object.assign(new Error(code), { code });
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (fault.tmpWrite && String(args[0]).includes(".tmp-")) throw failure(fault.tmpWrite);
      return actual.writeFile(...args);
    },
    unlink: async (...args: Parameters<typeof actual.unlink>) => {
      if (fault.lockUnlink && String(args[0]).endsWith(".lock")) throw failure(fault.lockUnlink);
      return actual.unlink(...args);
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (String(args[1]).endsWith(".lock")) fault.lockRenames++;
      if (fault.lockRename && String(args[1]).endsWith(".lock")) throw failure(fault.lockRename);
      return actual.rename(...args);
    },
    readdir: async (...args: Parameters<typeof actual.readdir>) => {
      if (fault.scanCall && ++fault.scans === fault.scanCall) throw failure("EIO");
      return actual.readdir(...args);
    },
  };
});

let dir: string;
beforeEach(async () => { dir = join(await mkdtemp(join(tmpdir(), "sa-lock-")), "lock"); });
afterEach(async () => {
  Object.assign(fault, { tmpWrite: null, scanCall: 0, scans: 0, lockUnlink: null, lockRename: null, lockRenames: 0 });
  await rm(join(dir, ".."), { recursive: true, force: true });
});

/** A fake process table: pid to start time. A pid not in it has no process. */
function processes(table: Record<number, string>): StartTimeOf {
  return async (pid) => table[pid] ?? null;
}

const claude = { pid: 900, startTime: "5000" };
const otherClaude = { pid: 901, startTime: "5001" };
const office = (pid: number, starter = claude, port = 4000 + pid): LockRecord => ({ pid, startTime: `${pid}00`, port, starter });

async function lockFiles(): Promise<string[]> {
  return (await readdir(dir)).filter((name) => name.endsWith(".lock")).sort();
}

describe("PO-1's lock", () => {
  it("records the post office's pid, start time and port and its starter's pid and start time, whole", async () => {
    const result = await acquireLock(dir, office(10), processes({}));
    expect(result.ok && result.replaced).toBe(undefined);
    expect(await lockFiles()).toEqual(["1.lock"]);
    expect(JSON.parse(await readFile(join(dir, "1.lock"), "utf8"))).toEqual({ pid: 10, startTime: "1000", port: 4010, starter: claude });
    expect((await readdir(dir)).filter((n) => n.startsWith(".tmp"))).toEqual([]);
  });

  it("refuses a start while its owner lives, with the owner's pid, and leaves the lock as it was", async () => {
    const live = processes({ 10: "1000", [otherClaude.pid]: otherClaude.startTime });
    expect((await acquireLock(dir, office(10, otherClaude), live)).ok).toBe(true);
    const before = await readFile(join(dir, "1.lock"), "utf8");
    const result = await acquireLock(dir, office(20), live);
    expect(result).toMatchObject({ ok: false, kind: "running", message: "the army is already running in this folder (pid 10)" });
    expect(await lockFiles()).toEqual(["1.lock"]);
    expect(await readFile(join(dir, "1.lock"), "utf8")).toBe(before);
  });

  it("says the army is still closing to the Claude Code process that started the live post office, as after a mod reload", async () => {
    const live = processes({ 10: "1000", [claude.pid]: claude.startTime });
    await acquireLock(dir, office(10), live);
    expect(await acquireLock(dir, office(20), live)).toMatchObject({ ok: false, kind: "closing", message: "the army is still closing" });
  });

  it("says the army is still closing when the live post office's starter has ended", async () => {
    await acquireLock(dir, office(10, otherClaude), processes({}));
    const starterGone = processes({ 10: "1000", [otherClaude.pid]: "9999" });
    expect(await acquireLock(dir, office(20), starterGone)).toMatchObject({ ok: false, kind: "closing" });
  });

  it.each([
    ["a dead pid", {}, "no process has its pid"],
    ["a living pid with another start time", { 10: "777" }, "its pid now has another start time"],
  ])("replaces a lock with %s, and says so for the log", async (_name, table, reason) => {
    await acquireLock(dir, office(10), processes({}));
    const result = await acquireLock(dir, office(20), processes(table));
    expect(result).toMatchObject({ ok: true, replaced: { reason, previous: { pid: 10 } } });
    expect(result.ok && result.replaced?.logLine).toBe(`lock: replaced a stale lock (pid 10, start 1000): ${reason}`);
    expect(await lockFiles()).toEqual(["2.lock"]);
    expect(JSON.parse(await readFile(join(dir, "2.lock"), "utf8")).pid).toBe(20);
  });

  it.each([["empty", "", "it is empty"], ["unreadable", "{not json", "it can't be read"]])("replaces an %s lock, and says so for the log", async (_name, text, reason) => {
    await acquireLock(dir, office(10), processes({}));
    await writeFile(join(dir, "1.lock"), text);
    const result = await acquireLock(dir, office(20), processes({}));
    expect(result).toMatchObject({ ok: true, replaced: { reason } });
    expect(result.ok && result.replaced?.logLine).toBe(`lock: replaced a stale lock (1.lock): ${reason}`);
  });

  it("is free again after a release, with no stale line, and its numbers only grow", async () => {
    const first = await acquireLock(dir, office(10), processes({}));
    if (!first.ok) throw new Error(first.message);
    await first.lock.release();
    const second = await acquireLock(dir, office(20), processes({ 10: "1000" }));
    expect(second).toMatchObject({ ok: true });
    expect(second.ok && second.replaced).toBe(undefined);
    expect(await lockFiles()).toEqual(["2.lock"]);
  });

  it("gives the three messages word for word", () => {
    expect(lockMessages.running(4120)).toBe("the army is already running in this folder (pid 4120)");
    expect(lockMessages.closing()).toBe("the army is still closing");
    expect(lockMessages.notWritten("disk full")).toBe("the army can't start: lock not written · disk full");
  });

  it("starts nothing when the lock can't be written, and says why", async () => {
    // The lock's folder would be under a file, so it can't be made.
    const blocked = join(dir, "..", "a-file");
    await writeFile(blocked, "");
    const result = await acquireLock(join(blocked, "lock"), office(10), processes({}));
    expect(result).toMatchObject({ ok: false, kind: "not-written" });
    expect(!result.ok && result.message).toMatch(/^the army can't start: lock not written · \S/);
  });

  it("gives the live lock's message, not a write failure, when the disk is full", async () => {
    const live = processes({ 10: "1000", [otherClaude.pid]: otherClaude.startTime });
    await acquireLock(dir, office(10, otherClaude), live);
    fault.tmpWrite = "ENOSPC";
    expect(await acquireLock(dir, office(20), live)).toMatchObject({ ok: false, kind: "running", message: lockMessages.running(10) });
  });

  it("takes back its own published lock when the check after publishing fails, and says the lock wasn't written", async () => {
    fault.scanCall = 2; // the first scan finds the folder empty; the one after publishing fails
    const result = await acquireLock(dir, office(10), processes({}));
    expect(result).toEqual({ ok: false, kind: "not-written", message: lockMessages.notWritten("EIO") });
    fault.scanCall = 0;
    expect(await lockFiles()).toEqual([]);
    expect(await acquireLock(dir, office(20), processes({ 10: "1000" }))).toMatchObject({ ok: true });
  });

  it("takes back its published lock by marking it released when the unlink after a failed check fails", async () => {
    Object.assign(fault, { scanCall: 2, lockUnlink: "EBUSY" });
    const result = await acquireLock(dir, office(10), processes({}));
    expect(result).toEqual({ ok: false, kind: "not-written", message: lockMessages.notWritten("EIO") });
    Object.assign(fault, { scanCall: 0, lockUnlink: null });
    expect(JSON.parse(await readFile(join(dir, "1.lock"), "utf8"))).toEqual({ released: true });
    expect(await acquireLock(dir, office(20), processes({ 10: "1000" }))).toMatchObject({ ok: true });
  });

  it("keeps the generation and the cleanup error when it can't take back its lock, until a retry does", async () => {
    Object.assign(fault, { scanCall: 2, lockUnlink: "EBUSY", lockRename: "EPERM" });
    const live = processes({ 10: "1000" });
    const result = await acquireLock(dir, office(10), live);
    expect(result).toMatchObject({
      ok: false, kind: "not-written",
      message: `${lockMessages.notWritten("EIO")}; its own lock 1.lock can't be taken back: EBUSY, then permission denied`,
      rollback: { path: join(dir, "1.lock"), error: "EBUSY, then permission denied" },
    });
    if (result.ok || !result.rollback) throw new Error("expected a pending rollback");
    fault.scanCall = 0;
    // While the rollback is pending, its own live generation still answers a start, as the army closing.
    expect(await acquireLock(dir, office(20), live)).toMatchObject({ ok: false, kind: "closing" });
    await expect(result.rollback.retry()).rejects.toThrow();
    Object.assign(fault, { lockUnlink: null, lockRename: null, lockRenames: 0 });
    await result.rollback.retry();
    expect(JSON.parse(await readFile(join(dir, "1.lock"), "utf8"))).toEqual({ released: true });
    expect(await acquireLock(dir, office(20), live)).toMatchObject({ ok: true });
  });

  it("never lets a retained rollback retry touch a later start's lock (Codex review 107, C6)", async () => {
    Object.assign(fault, { scanCall: 2, lockUnlink: "EBUSY", lockRename: "EPERM" });
    const live = processes({ 10: "1000", 20: "2000", [claude.pid]: claude.startTime });
    const result = await acquireLock(dir, office(10), live);
    if (result.ok || !result.rollback) throw new Error("expected a pending rollback");
    Object.assign(fault, { scanCall: 0, lockUnlink: null, lockRename: null, lockRenames: 0 });
    // Two retries at once share one take-back; the generation's number stays used.
    await Promise.all([result.rollback.retry(), result.rollback.retry()]);
    expect(fault.lockRenames).toBe(1);
    const later = await acquireLock(dir, office(20), live);
    if (!later.ok) throw new Error(later.message);
    await result.rollback.retry();
    expect(await lockFiles()).toEqual(["2.lock"]);
    expect(JSON.parse(await readFile(join(dir, "2.lock"), "utf8")).pid).toBe(20);
    expect(await acquireLock(dir, office(30), live)).toMatchObject({ ok: false, kind: "closing", holder: { pid: 20 } });
  });

  describe("two starts on one stale lock", () => {
    // The stale lock's pid 10 is gone; starts A (pid 20) and B (pid 30) both find it.
    async function race(interrupted: "A" | "B") {
      await acquireLock(dir, office(10, otherClaude), processes({}));
      const table: Record<number, string> = { [claude.pid]: claude.startTime, [otherClaude.pid]: otherClaude.startTime };
      const results: Record<string, Awaited<ReturnType<typeof acquireLock>>> = {};
      const plain = processes(table);
      const other = interrupted === "A" ? "B" : "A";
      const pids = { A: 20, B: 30 };
      const starters = { A: claude, B: otherClaude };
      // The interrupted start's check of the stale pid runs after its read and before its
      // replacement; the other start's whole read and replacement are forced in between.
      let forced = false;
      const slow: StartTimeOf = async (pid) => {
        if (pid === 10 && !forced) {
          forced = true;
          results[other] = await acquireLock(dir, office(pids[other], starters[other]), plain);
          table[pids[other]] = `${pids[other]}00`;
        }
        return plain(pid);
      };
      results[interrupted] = await acquireLock(dir, office(pids[interrupted], starters[interrupted]), slow);
      return { winner: results[other]!, loser: results[interrupted]!, winnerPid: pids[other] };
    }

    it.each(["A", "B"] as const)("ends with one post office when %s is interrupted, and the other start gets the live lock's message", async (interrupted) => {
      const { winner, loser, winnerPid } = await race(interrupted);
      expect(winner).toMatchObject({ ok: true, replaced: { reason: "no process has its pid" } });
      expect(loser).toMatchObject({ ok: false, kind: "running", message: `the army is already running in this folder (pid ${winnerPid})` });
      expect(await lockFiles()).toEqual(["2.lock"]);
      expect(JSON.parse(await readFile(join(dir, "2.lock"), "utf8")).pid).toBe(winnerPid);
    });
  });

  it("a start that read an old generation loses to the newer lock even when its number has been freed", async () => {
    await acquireLock(dir, office(10), processes({}));
    const table: Record<number, string> = {};
    let forced = false;
    const slow: StartTimeOf = async (pid) => {
      if (pid === 10 && !forced) {
        forced = true;
        // Meanwhile post office 20 takes generation 2 and releases it, and 30 takes 3 and cleans up 2.
        const twenty = await acquireLock(dir, office(20), processes({}));
        if (twenty.ok) await twenty.lock.release();
        expect(await acquireLock(dir, office(30, otherClaude), processes({}))).toMatchObject({ ok: true });
        expect(await lockFiles()).toEqual(["3.lock"]);
        table[30] = "3000";
        table[otherClaude.pid] = otherClaude.startTime;
      }
      return table[pid] ?? null;
    };
    const late = await acquireLock(dir, office(40), slow);
    expect(late).toMatchObject({ ok: false, kind: "running", message: "the army is already running in this folder (pid 30)" });
    expect(await lockFiles()).toEqual(["3.lock"]);
  });
});
