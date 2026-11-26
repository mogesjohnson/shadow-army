import { constants, type BigIntStats } from "node:fs";
import { lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { redact } from "../logs.js";

/**
 * PO-16: a process is named by its pid and its start time, so a reused pid never matches (PO-11).
 * `startTime` is Linux's clock ticks since boot (exact), or Windows's creation time in Unix milliseconds.
 * Milliseconds can't tell a reused pid from the original, so Windows also carries `creationTime`: the
 * exact FILETIME (100 ns since 1601) as a decimal string, which a float can't hold.
 */
export interface Identity { pid: number; startTime: number; creationTime?: string }

const FILETIME_UNIX_EPOCH = 116444736000000000n;
const isFiletime = (value: unknown): value is string => typeof value === "string" && /^[1-9]\d{0,19}$/.test(value) && BigInt(value) < 2n ** 63n;

/** A FILETIME's Unix milliseconds, rounded down as GetProcessTimes' callers always have. */
export const unixMsOfFiletime = (filetime: string): number => Number((BigInt(filetime) - FILETIME_UNIX_EPOCH) / 10000n);

/** An identity from a Windows FILETIME, or `undefined` when it is not one. */
export function windowsIdentity(pid: unknown, creationTime: unknown): Identity | undefined {
  return Number.isSafeInteger(pid) && (pid as number) > 0 && isFiletime(creationTime) && BigInt(creationTime) > FILETIME_UNIX_EPOCH
    ? { pid: pid as number, startTime: unixMsOfFiletime(creationTime), creationTime } : undefined;
}

/**
 * How a recorded identity compares with the process that holds its pid now. `now` is what the machine
 * reports: Linux's clock ticks as a number, Windows's FILETIME as a string, `undefined` for no process.
 * A Windows record in the old millisecond format can prove a difference but never a match: when its
 * millisecond agrees, the answer is "unsure", which must never lead to ending a process (PO-16).
 */
export function compareStart(recorded: Identity, now: number | string | undefined): "same" | "different" | "unsure" {
  if (now === undefined) return "different";
  if (recorded.creationTime !== undefined) {
    if (typeof now === "string") return now === recorded.creationTime ? "same" : "different";
    return now === recorded.startTime ? "unsure" : "different";
  }
  if (typeof now === "string") return isFiletime(now) && unixMsOfFiletime(now) !== recorded.startTime ? "different" : "unsure";
  return now === recorded.startTime ? "same" : "different";
}

/**
 * One line of a tree's file. It holds no secret and no nonce (PO-16). `git` is a harness git command's
 * entry (WSP-10): it runs in no job, so the sweep ends it by its own identity.
 */
export type TreeLine =
  | ({ kind: "post-office" } & Identity)
  | ({ kind: "guardian" } & Identity)
  | ({ kind: "cli" } & Identity)
  | ({ kind: "process" } & Identity)
  | ({ kind: "git" } & Identity)
  | { kind: "job"; label: string; coalition: string };

export const treesDir = (root: string): string => join(root, ".shadow", "v2", "trees");

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A parsed line, or `undefined` for one that is not a record this version writes. */
export function parseTreeLine(text: string): TreeLine | undefined {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return undefined; }
  if (typeof value !== "object" || value === null) return undefined;
  const line = value as Record<string, unknown>;
  if (line.kind === "job") {
    return typeof line.label === "string" && typeof line.coalition === "string"
      ? { kind: "job", label: line.label, coalition: line.coalition } : undefined;
  }
  const kinds = ["post-office", "guardian", "cli", "process", "git"] as const;
  const kind = kinds.find((candidate) => candidate === line.kind);
  if (!kind || !isCount(line.pid) || line.pid <= 0 || !isCount(line.startTime)) return undefined;
  // A record from before exact creation times, or with one that isn't a FILETIME, is read without it:
  // compareStart() then never lets it match (PO-16).
  return { kind, pid: line.pid, startTime: line.startTime, ...(isFiletime(line.creationTime) ? { creationTime: line.creationTime } : {}) };
}

/** A reader skips a line that doesn't parse, as for logs (PO-5). */
export function parseTreeFile(text: string): TreeLine[] {
  return text.split("\n").flatMap((line) => parseTreeLine(line) ?? []);
}

/** Whether this user owns a path (and, on POSIX, no one else can write it). The sweep acts only on records that pass (PO-16). */
export type OwnerCheck = (path: string, stats: BigIntStats) => Promise<boolean>;

/** POSIX's check: owned by this user, and not writable by its group or others. */
export const posixOwned: OwnerCheck = async (_path, stats) => process.getuid !== undefined && stats.uid === BigInt(process.getuid()) && (stats.mode & 0o022n) === 0n;

/** A tree file, and whether its folders and the opened file itself were verified as this user's own (PO-16). */
export interface TreeFile { id: string; lines: TreeLine[]; verified: boolean }

/** A real folder, not a link, that this user owns. */
async function ownFolder(path: string, owned: OwnerCheck): Promise<boolean> {
  try { const stats = await lstat(path, { bigint: true }); return stats.isDirectory() && !stats.isSymbolicLink() && await owned(path, stats); } catch { return false; }
}

/** Reads a file through one handle, and verifies that handle: the same file as the name (not a link), one link, this user's. */
async function readOwnFile(path: string, owned: OwnerCheck): Promise<{ text: string; verified: boolean }> {
  // Read as integers, never doubles: a 64-bit file index is compared whole (C6).
  const named = await lstat(path, { bigint: true });
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    const verified = !named.isSymbolicLink() && opened.isFile() && opened.nlink === 1n && opened.dev === named.dev && opened.ino === named.ino
      && await owned(path, opened).catch(() => false);
    return { text: await handle.readFile("utf8"), verified };
  } finally { await handle.close(); }
}

/**
 * Every tree file under the folder, as `{ id, lines, verified }`. A file that can't be read is skipped. A record is
 * verified only when `.shadow`, `.shadow/v2` and the trees folder are real folders this user owns, and the opened
 * file passes `readOwnFile`'s checks: the sweep never acts on an unverified record, and keeps it (PO-16).
 */
export async function readTrees(root: string, owned: OwnerCheck = posixOwned): Promise<TreeFile[]> {
  const directory = treesDir(root);
  let names: string[];
  try { names = await readdir(directory); } catch { return []; }
  const folders = [join(root, ".shadow"), join(root, ".shadow", "v2"), directory];
  const foldersOwned = (await Promise.all(folders.map((folder) => ownFolder(folder, owned)))).every(Boolean);
  const trees = await Promise.all(names.filter((name) => name.endsWith(".jsonl")).map(async (name) => {
    try {
      const { text, verified } = await readOwnFile(join(directory, name), owned);
      return { id: name.slice(0, -".jsonl".length), lines: parseTreeFile(text), verified: foldersOwned && verified };
    } catch { return undefined; }
  }));
  return trees.filter((tree): tree is TreeFile => tree !== undefined);
}

const sameIdentity = (a: Identity, b: Identity): boolean => a.pid === b.pid && a.startTime === b.startTime && a.creationTime === b.creationTime;
const identityOf = ({ pid, startTime, creationTime }: Identity): Identity => ({ pid, startTime, ...(creationTime === undefined ? {} : { creationTime }) });

/** One tree's entry under `.shadow/v2/trees/`: one JSON Lines file, each line flushed as it is written (PO-16). */
export class TreeRecord {
  private readonly listed: Identity[] = [];
  private reported = false;

  private constructor(private readonly file: string, private readonly onListingFailure: (error: unknown) => void) {}

  /**
   * Writes the post office's identity, and the guardian's if known, before the CLI starts. A failure
   * throws: the CLI must not start, and the caller reports the containment failure (PO-15).
   */
  static async create(
    root: string, id: string, postOffice: Identity, guardian?: Identity,
    onListingFailure: (error: unknown) => void = () => {},
  ): Promise<TreeRecord> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id)) throw new Error("invalid tree id");
    await mkdir(treesDir(root), { recursive: true });
    const record = new TreeRecord(join(treesDir(root), `${id}.jsonl`), onListingFailure);
    await record.append({ kind: "post-office", ...postOffice }, "wx");
    if (guardian) await record.add({ kind: "guardian", ...guardian });
    return record;
  }

  private async append(line: TreeLine, flag: "a" | "wx" = "a"): Promise<void> {
    const handle = await open(this.file, flag, 0o600);
    try {
      await handle.appendFile(`${JSON.stringify(line)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  /** Adds a line, such as the CLI's identity once it has started, or a macOS job. A failure throws. */
  add(line: TreeLine): Promise<void> { return this.append(line); }

  /**
   * Adds each process of a listing that is not yet recorded (PO-11). A line that can't be added is reported
   * once, as PO-5 says for a log write that fails; it does not stop the session.
   */
  async listing(processes: readonly Identity[]): Promise<void> {
    for (const process of processes) {
      if (this.listed.some((known) => sameIdentity(known, process))) continue;
      try {
        await this.append({ kind: "process", ...identityOf(process) });
        this.listed.push(identityOf(process));
      } catch (error) {
        if (!this.reported) { this.reported = true; this.onListingFailure(error); }
      }
    }
  }

  /** The entry is removed once the tree has ended. */
  async remove(): Promise<void> {
    try { await unlink(this.file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

/** The processes' state on this machine: injected, so the failure path runs on a fake clock and fake processes. */
export interface ProcessOps {
  /** The process's start time (Linux's clock ticks, or Windows's FILETIME as a string), or `undefined` when no such process runs. */
  startTimeOf(pid: number): Promise<number | string | undefined>;
  /** Ends each process (the caller's own signal or kill). A process that is already gone is not an error. */
  end(processes: readonly Identity[]): Promise<void>;
}

/** A process the post office could not end, named by identity and command line (PO-15). */
export interface Leftover extends Identity { command: string }

async function compareAll(ops: ProcessOps, leftovers: readonly Leftover[]) {
  return Promise.all(leftovers.map(async (leftover) => ({ leftover, match: compareStart(leftover, await ops.startTimeOf(leftover.pid)) })));
}

/** The leftovers whose pid may still belong to the same process: "unsure" counts as running (PO-15). */
export async function stillRunning(ops: ProcessOps, leftovers: readonly Leftover[]): Promise<Leftover[]> {
  return (await compareAll(ops, leftovers)).filter(({ match }) => match !== "different").map(({ leftover }) => leftover);
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, 200);

/**
 * PO-15's line for the log and Claude's transcript. Each command line goes through `redact()` (WSP-8). Where the
 * post office can't tell which processes remain (`"unknown"`), it says processes the CLI started may still run.
 */
export function containmentFailedMessage(
  soldier: string, what: { reason: string } | { leftovers: readonly Leftover[] | "unknown" }, redactText: (text: string) => string = (text) => redact(text) as string,
): string {
  const named = "reason" in what ? undefined : what.leftovers;
  const detail = "reason" in what ? oneLine(redactText(what.reason))
    : named === "unknown" || named?.length === 0 ? "processes the CLI started may still be running"
      : `${named!.length} process${named!.length === 1 ? "" : "es"} couldn't be ended (${named!.map((one) => `${one.pid} ${oneLine(redactText(one.command))}`).join(", ")})`;
  return `Containment failed for ${soldier}: ${detail}. ${soldier} is down and won't restart by itself.`;
}

/** Soldiers whose containment failed. PO-1's crash count does not restart them (PO-15). */
export class DownSoldiers {
  private readonly down = new Map<string, readonly Leftover[]>();

  /** Marks the soldier down, naming the processes still running. Nothing restarts it by itself. */
  fail(soldier: string, leftovers: readonly Leftover[] = []): void { this.down.set(soldier, leftovers); }
  isDown(soldier: string): boolean { return this.down.has(soldier); }

  /** A reconnect starts the CLI only once no process the error named still runs (PO-15). */
  async mayStart(soldier: string, ops: ProcessOps): Promise<boolean> {
    const named = this.down.get(soldier);
    if (!named) return true;
    if ((await stillRunning(ops, named)).length > 0) return false;
    this.down.delete(soldier);
    return true;
  }
}

/**
 * A turn's guard stays open while a process the post office named still runs: it tries to end them again
 * every 10 seconds, and returns `"ended"` once all have. With no process to wait for, the turn is cut short.
 */
export async function holdGuardOpen(
  leftovers: readonly Leftover[] | "unknown", ops: ProcessOps,
  options: { intervalMs?: number; wait?: (ms: number) => Promise<void>; signal?: AbortSignal } = {},
): Promise<"ended" | "cut-short"> {
  if (leftovers === "unknown" || leftovers.length === 0) return "cut-short";
  const { intervalMs = 10_000, wait = (ms) => new Promise<void>((done) => setTimeout(done, ms)), signal } = options;
  for (let remaining = [...leftovers]; !signal?.aborted;) {
    const compared = (await compareAll(ops, remaining)).filter(({ match }) => match !== "different");
    remaining = compared.map(({ leftover }) => leftover);
    if (remaining.length === 0) return "ended";
    // Only an exact match is ended; an "unsure" one is waited for, never signalled.
    const same = compared.filter(({ match }) => match === "same").map(({ leftover }) => leftover);
    if (same.length > 0) try { await ops.end(same); } catch { /* Tried again after the interval. */ }
    await wait(intervalMs);
  }
  return "cut-short";
}
