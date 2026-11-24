import { randomBytes } from "node:crypto";
import { link, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** A process told apart from a later one with its pid by its creation stamp (PO-1). */
export interface ProcessId { pid: number; startTime: string }

/** PO-1's lock record: the post office, its port, and the process that started it (PO-7's watch). */
export interface LockRecord extends ProcessId { port: number; starter: ProcessId }

/**
 * The process's own creation stamp, or null when no process has that pid. Supplied by the
 * containment code (/proc on Linux, the helper on macOS, the script on Windows); tests fake it.
 */
export type StartTimeOf = (pid: number) => Promise<string | null>;

export type StaleReason = "no process has its pid" | "its pid now has another start time" | "it is empty" | "it can't be read";

export interface HeldLock { record: LockRecord; release(): Promise<void> }

export type AcquireResult =
  | { ok: true; lock: HeldLock; replaced?: { reason: StaleReason; previous?: LockRecord; logLine: string } }
  | { ok: false; kind: "running" | "closing" | "not-written"; message: string; holder?: LockRecord };

export const lockMessages = {
  running: (pid: number) => `the army is already running in this folder (pid ${pid})`,
  closing: () => "the army is still closing",
  notWritten: (reason: string) => `the army can't start: lock not written · ${reason}`,
};

const GENERATION = /^(\d+)\.lock$/;
const RELEASED = JSON.stringify({ released: true });
const ATTEMPTS = 16;

type Read = { record: LockRecord } | { released: true } | { stale: "it is empty" | "it can't be read" };

function sameProcess(a: ProcessId, b: ProcessId): boolean {
  return a.pid === b.pid && a.startTime === b.startTime;
}

function isProcessId(value: unknown): value is ProcessId {
  const v = value as ProcessId;
  return typeof v === "object" && v !== null && Number.isSafeInteger(v.pid) && v.pid > 0 && typeof v.startTime === "string" && v.startTime.length > 0;
}

function writeReason(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOSPC") return "disk full";
  if (code === "EACCES" || code === "EPERM") return "permission denied";
  if (code === "EROFS") return "read-only file system";
  return code ?? (error instanceof Error ? error.message : String(error));
}

async function generations(dir: string): Promise<number[]> {
  const names = await readdir(dir);
  return names.flatMap((name) => { const m = GENERATION.exec(name); return m ? [Number(m[1])] : []; }).sort((a, b) => a - b);
}

async function readGeneration(path: string): Promise<Read> {
  let text: string;
  try { text = await readFile(path, "utf8"); } catch { return { stale: "it can't be read" }; }
  if (!text.trim()) return { stale: "it is empty" };
  try {
    const value = JSON.parse(text) as LockRecord & { released?: boolean };
    if (value.released === true) return { released: true };
    if (isProcessId(value) && isProcessId(value.starter) && Number.isInteger(value.port)) return { record: value };
  } catch { /* fall through */ }
  return { stale: "it can't be read" };
}

/**
 * Takes PO-1's lock in `dir`. The lock is the highest-numbered `<n>.lock` file there. A start
 * creates generation n+1 with `link`, which fails if the name exists, so of any number of starts
 * that find the same stale generation n, exactly one wins, and each file is written whole before
 * it appears. Numbers only grow: a release empties its file to a released record, never deletes it.
 */
export async function acquireLock(dir: string, record: LockRecord, startTimeOf: StartTimeOf): Promise<AcquireResult> {
  if (!isProcessId(record) || !isProcessId(record.starter) || !Number.isInteger(record.port)) throw new Error("lock record needs pid, start time, port and starter");
  const body = JSON.stringify(record);
  const tmp = join(dir, `.tmp-${record.pid}-${randomBytes(6).toString("hex")}`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(tmp, body, { flag: "wx", mode: 0o600 });
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    return { ok: false, kind: "not-written", message: lockMessages.notWritten(writeReason(error)) };
  }
  try {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const existing = await generations(dir);
      const top = existing.at(-1) ?? 0;
      let replaced: { reason: StaleReason; previous?: LockRecord } | undefined;
      if (top > 0) {
        const read = await readGeneration(join(dir, `${top}.lock`));
        if ("record" in read) {
          const now = await startTimeOf(read.record.pid);
          if (now === read.record.startTime) return await refusal(read.record, record.starter, startTimeOf);
          replaced = { reason: now === null ? "no process has its pid" : "its pid now has another start time", previous: read.record };
        } else if ("stale" in read) replaced = { reason: read.stale };
      }
      const mine = join(dir, `${top + 1}.lock`);
      try { await link(tmp, mine); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        return { ok: false, kind: "not-written", message: lockMessages.notWritten(writeReason(error)) };
      }
      // A start that read an old generation can fill a hole below the top; it loses to the top.
      if ((await generations(dir)).some((n) => n > top + 1)) { await unlink(mine).catch(() => undefined); continue; }
      for (const n of existing) await unlink(join(dir, `${n}.lock`)).catch(() => undefined);
      const lock: HeldLock = { record, release: () => release(dir, mine) };
      if (!replaced) return { ok: true, lock };
      const who = replaced.previous ? `pid ${replaced.previous.pid}, start ${replaced.previous.startTime}` : `${top}.lock`;
      return { ok: true, lock, replaced: { ...replaced, logLine: `lock: replaced a stale lock (${who}): ${replaced.reason}` } };
    }
    return { ok: false, kind: "not-written", message: lockMessages.notWritten(`still contended after ${ATTEMPTS} tries`) };
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

async function refusal(holder: LockRecord, starter: ProcessId, startTimeOf: StartTimeOf): Promise<AcquireResult> {
  const ours = sameProcess(holder.starter, starter);
  const starterAlive = ours || (await startTimeOf(holder.starter.pid)) === holder.starter.startTime;
  if (ours || !starterAlive) return { ok: false, kind: "closing", message: lockMessages.closing(), holder };
  return { ok: false, kind: "running", message: lockMessages.running(holder.pid), holder };
}

async function release(dir: string, path: string): Promise<void> {
  const tmp = join(dir, `.tmp-release-${randomBytes(6).toString("hex")}`);
  await writeFile(tmp, RELEASED, { flag: "wx", mode: 0o600 });
  try { await rename(tmp, path); } catch (error) { await unlink(tmp).catch(() => undefined); throw error; }
}
