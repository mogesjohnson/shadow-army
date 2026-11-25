import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { redact } from "../logs.js";
import { parseStat } from "./linux.js";
import { endWindowsProcess, openSweepSession, ownedByCurrentUser, probeWindowsProcess } from "./windows.js";
import { compareStart, posixOwned, readTrees, treesDir, type Identity, type OwnerCheck, type TreeLine } from "./trees.js";

/** What the sweep needs from the machine: injected, so it runs on fake processes. */
export interface SweepOps {
  platform: NodeJS.Platform;
  /** Whether this user owns a tree folder or file: a record that fails is never acted on, and is kept (PO-16). */
  owned: OwnerCheck;
  /**
   * The process's start time (Linux's clock ticks, or Windows's exact FILETIME as a string), `undefined` when no
   * such process runs, or `null` when the probe failed: unknown, never read as absent.
   */
  startTimeOf(pid: number): Promise<number | string | undefined | null>;
  commandOf?(pid: number): Promise<string | undefined>;
  /**
   * Ends the process with this identity, never a bare pid: on Windows the creation time is checked on the handle
   * that ends it. `tree` also ends a harness git command's children (its process group on Linux). `"incomplete"`
   * when the tree's descendants could not all be listed, ended and confirmed: the entry is then kept (PO-16).
   */
  endProcess(target: Identity, tree: boolean): Promise<"ended" | "incomplete">;
  /** macOS (PO-17's operations): removes a launchd job, and ends the members of a coalition. */
  removeJob?(label: string): Promise<void>;
  endCoalition?(id: string): Promise<void>;
  wait(ms: number): Promise<void>;
  /** A monotonic clock in milliseconds (`performance.now` by default): each tree's deadline is read on it. */
  now?(): number;
  /** Releases what the operations hold (Windows's one helper session), once the sweep is over. */
  close?(): void | Promise<void>;
}

export interface SweptProcess { pid: number; command?: string }
export interface SweepReport {
  /** Entries whose post office still runs, or may (an old millisecond record on Windows): left alone. */
  running: number;
  /** Entries ended and removed. */
  swept: number;
  ended: SweptProcess[];
  /**
   * Processes still running after the limit, and processes an old millisecond record on Windows can't tell
   * from the recorded one (never ended on that evidence), and processes (a post office included) whose probe
   * failed. Their entries are kept.
   */
  left: SweptProcess[];
  /** Entries this machine can't handle: a job or coalition it can't end, or a record it couldn't verify. Kept. */
  unhandled: number;
  /** Of those, the records whose folders or file couldn't be verified as this user's own: nothing was ended on them. */
  unverified: number;
}

/** PO-10's limit for a tree to be empty. */
export const SWEEP_LIMIT_MS = 10_000;
/** The last check after the limit gets this share of it: a slow answer then reads as unknown, and the entry is kept. */
const LAST_CHECK_SHARE = 5;
/** An operation's answer, or `fallback` once the deadline on the sweep's clock passes (C10). A failure still throws. */
function within<T>(work: Promise<T>, fallback: T, until: number, now: () => number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((done) => { timer = setTimeout(() => done(fallback), Math.max(0, until - now())); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
/** An unknown probe result is never a match and never an absence. */
const judge = (line: Identity, now: number | string | undefined | null) => now === null ? "unsure" as const : compareStart(line, now);
const isProcess = (line: TreeLine): line is Extract<TreeLine, Identity> => "pid" in line && line.kind !== "post-office";

/**
 * PO-16's sweep: ends every tree whose entry belongs to a post office that is no longer running, judged by the
 * entry's pid and start time. A process is ended only while its recorded identity still matches, never for a
 * session or process-group id alone; a pid that another process now holds is left running.
 */
export async function sweepTrees(root: string, ops: SweepOps, limitMs = SWEEP_LIMIT_MS): Promise<SweepReport> {
  try { return await sweepAll(root, ops, limitMs); } finally { await ops.close?.(); }
}

async function sweepAll(root: string, ops: SweepOps, limitMs: number): Promise<SweepReport> {
  const now = ops.now ?? (() => performance.now());
  const report: SweepReport = { running: 0, swept: 0, ended: [], left: [], unhandled: 0, unverified: 0 };
  for (const { id, lines, verified } of await readTrees(root, ops.owned)) {
    // A record anyone else could have written or swapped is no evidence to end a process on (PO-5, PO-16).
    if (!verified) { report.unverified++; report.unhandled++; continue; }
    const postOffice = lines.find((line) => line.kind === "post-office");
    if (!postOffice || !("pid" in postOffice)) continue; // A file with no post office line can't be judged.
    // Each tree has its own deadline, and every operation on it, a pending one included, ends by then (PO-10, C10).
    const deadline = now() + limitMs;
    const bounded = <T>(work: () => Promise<T>, fallback: T, until = deadline) => within(Promise.resolve().then(work), fallback, until, now);
    const startTimeOf = (pid: number, until?: number) => bounded(() => ops.startTimeOf(pid), null, until);
    const commandOf = (pid: number) => bounded(async () => ops.commandOf?.(pid).catch(() => undefined), undefined);
    const office = await startTimeOf(postOffice.pid);
    if (office === null) { report.left.push({ pid: postOffice.pid }); continue; } // Unknown: kept and reported.
    if (compareStart(postOffice, office) !== "different") { report.running++; continue; }
    let unhandled = 0;
    for (const line of lines) {
      if (line.kind !== "job") continue;
      if (ops.removeJob && ops.endCoalition) { await bounded(() => ops.removeJob!(line.label).catch(() => {}), undefined); await bounded(() => ops.endCoalition!(line.coalition).catch(() => {}), undefined); } else unhandled++;
    }
    // Windows: nothing in the job is left; only a harness git command's entry runs outside it.
    const targets = lines.filter(isProcess).filter((line) => ops.platform !== "win32" || line.kind === "git")
      .filter((line, index, all) => all.findIndex((other) => other.pid === line.pid && other.startTime === line.startTime && other.creationTime === line.creationTime) === index);
    const compared = async (until?: number) => Promise.all(targets.map(async (target) => ({ target, match: judge(target, await startTimeOf(target.pid, until)) })));
    const matching = async () => (await compared()).filter(({ match }) => match === "same").map(({ target }) => target);
    const named = new Map<number, string | undefined>();
    // Trees whose last end left descendants unconfirmed: kept even once the checked parent has gone (C9).
    const incomplete = new Set<number>();
    for (let remaining = await matching(); remaining.length > 0 && now() < deadline; remaining = await matching()) {
      for (const target of remaining) {
        if (!named.has(target.pid)) named.set(target.pid, await commandOf(target.pid));
        // The identity is checked again just before the signal: the pid may have been reused since the listing.
        if (judge(target, await startTimeOf(target.pid)) !== "same") continue;
        const tree = target.kind === "git";
        const result = await bounded(() => ops.endProcess(target, tree).catch(() => "incomplete" as const), "incomplete" as const);
        if (tree && result === "incomplete") incomplete.add(target.pid); else incomplete.delete(target.pid);
      }
      await ops.wait(Math.min(100, Math.max(0, deadline - now())));
    }
    const last = await compared(Math.max(deadline, now()) + limitMs / LAST_CHECK_SHARE);
    const left = new Set([...last.filter(({ match }) => match !== "different").map(({ target }) => target.pid), ...incomplete]);
    for (const { target, match } of last) if (match === "unsure" && !named.has(target.pid)) named.set(target.pid, await bounded(async () => ops.commandOf?.(target.pid).catch(() => undefined), undefined, now() + limitMs / LAST_CHECK_SHARE));
    const swept = (pid: number): SweptProcess => ({ pid, ...(named.get(pid) === undefined ? {} : { command: redact(named.get(pid)) as string }) });
    for (const pid of named.keys()) (left.has(pid) ? report.left : report.ended).push(swept(pid));
    report.unhandled += unhandled;
    if (left.size === 0 && unhandled === 0) { await unlink(join(treesDir(root), `${id}.jsonl`)).catch(() => {}); report.swept++; }
  }
  return report;
}

/**
 * A Linux process's start time from its `/proc/<pid>/stat` text: `undefined` once it has ended (a zombie or dead
 * process, which only its parent has yet to collect), `null` when the text can't be read as a stat line (unknown).
 */
export function startTimeFromStat(pid: number, text: string): number | undefined | null {
  const stat = parseStat(pid, text);
  if (!stat) return null;
  const state = text[text.lastIndexOf(")") + 2];
  return state === "Z" || state === "X" ? undefined : stat.startTime;
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * The real machine's operations for one sweep: Linux through `/proc`; Windows through one PowerShell helper session,
 * started once and closed at the sweep's end, and one process handle per end. macOS needs PO-17's helper.
 */
export function systemOps(platform: NodeJS.Platform = process.platform): SweepOps {
  if (platform === "linux") {
    return {
      platform, wait: pause, owned: posixOwned,
      startTimeOf: async (pid) => {
        try { return startTimeFromStat(pid, await readFile(`/proc/${pid}/stat`, "latin1")); } catch (error) { return ["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "") ? undefined : null; }
      },
      commandOf: async (pid) => (await readFile(`/proc/${pid}/cmdline`, "latin1")).replaceAll("\0", " ").trim(),
      // Node has no pidfd: the identity is checked just before the signal (above), not on a handle.
      // A group's SIGKILL reaches every member at once; ESRCH means no member is left.
      endProcess: async ({ pid }, tree) => {
        try { process.kill(tree ? -pid : pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
        return "ended";
      },
    };
  }
  if (platform === "win32") {
    const session = openSweepSession();
    return {
      platform, wait: pause, owned: (path) => ownedByCurrentUser(path, session), close: () => session.close(),
      // The exact FILETIME from GetProcessTimes, as the supervisor's listing records it (PO-11).
      startTimeOf: (pid) => probeWindowsProcess(pid, session),
      // A tree is complete only when the helper ended and confirmed every descendant and the parent on their handles.
      endProcess: async ({ pid, creationTime }, tree) => (await endWindowsProcess(pid, creationTime, tree, session)) === "ended" || !tree ? "ended" : "incomplete",
    };
  }
  throw new Error(`The sweep has no operations for ${platform} yet: macOS needs PO-17's helper (M1b-18).`);
}
