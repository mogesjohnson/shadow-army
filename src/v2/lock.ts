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

/**
 * A generation this start published but couldn't take back. It stays this start's own, and live to
 * other starts, until `retry` resolves; `retry` rejects while it still can't be taken back.
 */
export interface PendingRollback { path: string; error: string; retry(): Promise<void> }

export type AcquireResult =
  | { ok: true; lock: HeldLock; replaced?: { reason: StaleReason; previous?: LockRecord; logLine: string } }
  | { ok: false; kind: "running" | "closing" | "not-written"; message: string; holder?: LockRecord; rollback?: PendingRollback };

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
  const notWritten = (error: unknown): AcquireResult => ({ ok: false, kind: "not-written", message: lockMessages.notWritten(writeReason(error)) });
  let staged = false;
  try {
    try { await mkdir(dir, { recursive: true }); } catch (error) { return notWritten(error); }
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      let existing: number[];
      try { existing = await generations(dir); } catch (error) { return notWritten(error); }
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
      // Staged only once no live holder is found, so a write failure never hides a live lock.
      if (!staged) {
        try { await writeFile(tmp, body, { flag: "wx", mode: 0o600 }); } catch (error) { return notWritten(error); }
        staged = true;
      }
      const mine = join(dir, `${top + 1}.lock`);
      try { await link(tmp, mine); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        return notWritten(error);
      }
      // A start that read an old generation can fill a hole below the top; it loses to the top.
      // If that check fails, this start takes back only the generation it published, and keeps it
      // (with the cleanup error) when it can't, so the caller can retry rather than meet its own lock.
      let after: number[];
      try { after = await generations(dir); } catch (error) {
        try { await takeBack(dir, mine); } catch (cleanup) {
          const reason = (cleanup as Error).message;
          return { ok: false, kind: "not-written", rollback: { path: mine, error: reason, retry: once(() => takeBack(dir, mine, true)) },
            message: `${lockMessages.notWritten(writeReason(error))}; its own lock ${top + 1}.lock can't be taken back: ${reason}` };
        }
        return notWritten(error);
      }
      if (after.some((n) => n > top + 1)) { await takeBack(dir, mine).catch(() => undefined); continue; }
      for (const n of existing) await unlink(join(dir, `${n}.lock`)).catch(() => undefined);
      const lock: HeldLock = { record, release: () => release(dir, mine) };
      if (!replaced) return { ok: true, lock };
      const who = replaced.previous ? `pid ${replaced.previous.pid}, start ${replaced.previous.startTime}` : `${top}.lock`;
      return { ok: true, lock, replaced: { ...replaced, logLine: `lock: replaced a stale lock (${who}): ${replaced.reason}` } };
    }
    return notWritten(new Error(`still contended after ${ATTEMPTS} tries`));
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

/**
 * Removes this start's own generation, or else marks it released; throws when neither works.
 * With `keepNumber` (a retry handed to the caller) it marks first, so the number stays used and no
 * later start can take it while a handle still names it (C6).
 */
async function takeBack(dir: string, path: string, keepNumber = false): Promise<void> {
  const remove = async () => { await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); };
  const steps = keepNumber ? [() => release(dir, path), remove] : [remove, () => release(dir, path)];
  let first: unknown;
  try { await steps[0]!(); return; } catch (error) { first = error; }
  try { await steps[1]!(); } catch (error) { throw new Error(`${writeReason(first)}, then ${writeReason(error)}`); }
}

/** A retry that runs one attempt at a time and, once one succeeds, does nothing more. */
function once(run: () => Promise<void>): () => Promise<void> {
  let done = false;
  let running: Promise<void> | undefined;
  return () => {
    if (done) return Promise.resolve();
    running ??= run().then(() => { done = true; }, (error: unknown) => { running = undefined; throw error; });
    return running;
  };
}

async function release(dir: string, path: string): Promise<void> {
  const tmp = join(dir, `.tmp-release-${randomBytes(6).toString("hex")}`);
  await writeFile(tmp, RELEASED, { flag: "wx", mode: 0o600 });
  try { await rename(tmp, path); } catch (error) { await unlink(tmp).catch(() => undefined); throw error; }
}
