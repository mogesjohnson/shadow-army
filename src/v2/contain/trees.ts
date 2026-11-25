import { mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { redact } from "../logs.js";

/** PO-16: a process is named by its pid and its start time, so a reused pid never matches (PO-11). */
export interface Identity { pid: number; startTime: number }

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
  return kind && isCount(line.pid) && line.pid > 0 && isCount(line.startTime)
    ? { kind, pid: line.pid, startTime: line.startTime } : undefined;
}

/**
 * The line exactly as written: only the record's own fields, whatever else the caller's object carries, so no
 * secret or nonce reaches the file (PO-16). A line of the wrong shape throws.
 */
function serializeTreeLine(line: TreeLine): string {
  const own = line.kind === "job"
    ? { kind: line.kind, label: line.label, coalition: line.coalition }
    : { kind: line.kind, pid: line.pid, startTime: line.startTime };
  const text = JSON.stringify(own);
  if (parseTreeLine(text) === undefined) throw new Error("invalid tree line");
  return text;
}

/** A reader skips a line that doesn't parse, as for logs (PO-5). */
export function parseTreeFile(text: string): TreeLine[] {
  return text.split("\n").flatMap((line) => parseTreeLine(line) ?? []);
}

/** Every tree file under the folder, as `{ id, lines }`. A file that can't be read is skipped. */
export async function readTrees(root: string): Promise<{ id: string; lines: TreeLine[] }[]> {
  const directory = treesDir(root);
  let names: string[];
  try { names = await readdir(directory); } catch { return []; }
  const trees = await Promise.all(names.filter((name) => name.endsWith(".jsonl")).map(async (name) => {
    try { return { id: name.slice(0, -".jsonl".length), lines: parseTreeFile(await readFile(join(directory, name), "utf8")) }; } catch { return undefined; }
  }));
  return trees.filter((tree): tree is { id: string; lines: TreeLine[] } => tree !== undefined);
}

const sameIdentity = (a: Identity, b: Identity): boolean => a.pid === b.pid && a.startTime === b.startTime;

/** One tree's entry under `.shadow/v2/trees/`: one JSON Lines file, each line flushed as it is written (PO-16). */
export class TreeRecord {
  private readonly listed: Identity[] = [];
  /** Listed processes whose line couldn't be written yet: kept, so one that leaves the listing isn't lost. */
  private readonly pending: Identity[] = [];
  private reported = false;
  /** A write failed, so the file may end in a line cut short: the next write ends it first (PO-5). */
  private torn = false;

  private constructor(
    private readonly file: string, private readonly onListingFailure: (error: unknown) => void,
    private readonly wait: (ms: number) => Promise<void>,
  ) {}

  /**
   * Writes the post office's identity, and the guardian's if known, before the CLI starts. A failure
   * throws: the CLI must not start, and the caller reports the containment failure (PO-15).
   */
  static async create(
    root: string, id: string, postOffice: Identity, guardian?: Identity,
    onListingFailure: (error: unknown) => void = () => {},
    wait: (ms: number) => Promise<void> = (ms) => new Promise<void>((done) => setTimeout(done, ms)),
  ): Promise<TreeRecord> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id)) throw new Error("invalid tree id");
    await mkdir(treesDir(root), { recursive: true });
    const record = new TreeRecord(join(treesDir(root), `${id}.jsonl`), onListingFailure, wait);
    await record.append({ kind: "post-office", pid: postOffice.pid, startTime: postOffice.startTime }, "wx");
    if (guardian) await record.add({ kind: "guardian", pid: guardian.pid, startTime: guardian.startTime });
    return record;
  }

  private async append(line: TreeLine, flag: "a" | "wx" = "a"): Promise<void> {
    const text = `${this.torn ? "\n" : ""}${serializeTreeLine(line)}\n`;
    try {
      const handle = await open(this.file, flag, 0o600);
      try {
        await handle.appendFile(text, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      this.torn = true;
      throw error;
    }
    this.torn = false;
  }

  /** Adds a line, such as the CLI's identity once it has started, or a macOS job. A failure throws. */
  add(line: TreeLine): Promise<void> { return this.append(line); }

  /**
   * Adds each process of a listing that is not yet recorded (PO-11). As PO-5 says for a log write, a line that
   * fails is tried once more 100 ms later; if that fails too it is reported once, kept, and tried again at each
   * later listing, whether or not the process is still listed. It does not stop the session.
   */
  async listing(processes: readonly Identity[]): Promise<void> {
    for (const process of processes) {
      const identity = { pid: process.pid, startTime: process.startTime };
      if (![...this.listed, ...this.pending].some((known) => sameIdentity(known, identity))) this.pending.push(identity);
    }
    while (this.pending.length > 0) {
      const next = this.pending[0]!;
      const line: TreeLine = { kind: "process", ...next };
      try {
        try { await this.append(line); } catch { await this.wait(100); await this.append(line); }
      } catch (error) {
        if (!this.reported) { this.reported = true; this.onListingFailure(error); }
        return; // The disk is failing: the rest wait for the next listing.
      }
      this.listed.push(this.pending.shift()!);
    }
  }

  /** The entry is removed once the tree has ended. */
  async remove(): Promise<void> {
    try { await unlink(this.file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

/** The processes' state on this machine: injected, so the failure path runs on a fake clock and fake processes. */
export interface ProcessOps {
  /** The process's start time, or `undefined` when no such process runs. */
  startTimeOf(pid: number): Promise<number | undefined>;
  /** Ends each process (the caller's own signal or kill). A process that is already gone is not an error. */
  end(processes: readonly Identity[]): Promise<void>;
}

/** A process the post office could not end, named by identity and command line (PO-15). */
export interface Leftover extends Identity { command: string }

/** The leftovers whose pid still belongs to the same process. */
export async function stillRunning(ops: ProcessOps, leftovers: readonly Leftover[]): Promise<Leftover[]> {
  const running = await Promise.all(leftovers.map(async (leftover) => (await ops.startTimeOf(leftover.pid)) === leftover.startTime));
  return leftovers.filter((_, index) => running[index]);
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, 200);

/**
 * PO-15's line for the log and Claude's transcript. Each command line goes through `redact()` (WSP-8). Where the
 * post office can't tell which processes remain (`"unknown"`), it says processes the CLI started may still run,
 * and, with `turnCutShort` for a turn that was running and is cut short, that what they change won't be on the
 * turn's attribution card.
 */
export function containmentFailedMessage(
  soldier: string, what: { reason: string } | { leftovers: readonly Leftover[] | "unknown"; turnCutShort?: boolean },
  redactText: (text: string) => string = (text) => redact(text) as string,
): string {
  const named = "reason" in what ? undefined : what.leftovers;
  const detail = "reason" in what ? oneLine(redactText(what.reason))
    : named === "unknown" || named?.length === 0 ? "processes the CLI started may still be running"
      : `${named!.length} process${named!.length === 1 ? "" : "es"} couldn't be ended (${named!.map((one) => `${one.pid} ${oneLine(redactText(one.command))}`).join(", ")})`;
  const unknown = !("reason" in what) && (named === "unknown" || named?.length === 0);
  const card = unknown && "turnCutShort" in what && what.turnCutShort ? " What those processes change won't be on the turn's attribution card." : "";
  return `Containment failed for ${soldier}: ${detail}. ${soldier} is down and won't restart by itself.${card}`;
}

/** Soldiers whose containment failed. PO-1's crash count does not restart them (PO-15). */
export class DownSoldiers {
  /** Each failure is its own object, so a reconnect can tell whether a newer one came while it checked. */
  private readonly down = new Map<string, { leftovers: readonly Leftover[] }>();

  /** Marks the soldier down, naming the processes still running. Nothing restarts it by itself. */
  fail(soldier: string, leftovers: readonly Leftover[] = []): void { this.down.set(soldier, { leftovers }); }
  isDown(soldier: string): boolean { return this.down.has(soldier); }

  /**
   * A reconnect starts the CLI only once no process the error named still runs (PO-15). A failure recorded while
   * the check ran keeps the soldier down: that newer failure's processes weren't checked.
   */
  async mayStart(soldier: string, ops: ProcessOps): Promise<boolean> {
    const failure = this.down.get(soldier);
    if (!failure) return true;
    if ((await stillRunning(ops, failure.leftovers)).length > 0) return false;
    if (this.down.get(soldier) !== failure) return false;
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
    remaining = await stillRunning(ops, remaining);
    if (remaining.length === 0) return "ended";
    try { await ops.end(remaining); } catch { /* Tried again after the interval. */ }
    await wait(intervalMs);
  }
  return "cut-short";
}
