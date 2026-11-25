import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redact } from "../logs.js";
import { parseStat } from "./linux.js";
import { endWindowsProcess, openSweepSession, ownedByCurrentUser, probeWindowsProcess } from "./windows.js";
import { compareStart, parseTreeLine, posixOwned, readTrees, treesDir, type Identity, type OwnerCheck, type TreeLine } from "./trees.js";

/**
 * What the sweep needs from the machine: injected, so it runs on fake processes. An operation's `until` is the
 * deadline on `now`: the sweep never starts one past it, and the operation must not keep working after it (C10).
 */
export interface SweepOps {
  platform: NodeJS.Platform;
  /** Whether this user owns a tree folder or file: a record that fails is never acted on, and is kept (PO-16). */
  owned(path: Parameters<OwnerCheck>[0], stats: Parameters<OwnerCheck>[1], until?: number): Promise<boolean>;
  /**
   * The process's start time (Linux's clock ticks, or Windows's exact FILETIME as a string), `undefined` when no
   * such process runs, or `null` when the probe failed: unknown, never read as absent.
   */
  startTimeOf(pid: number, until?: number): Promise<number | string | undefined | null>;
  commandOf?(pid: number): Promise<string | undefined>;
  /**
   * Ends the process with this identity, never a bare pid: on Windows the creation time is checked on the handle
   * that ends it. `tree` also ends a harness git command's children (its process group on Linux). `"incomplete"`
   * when the tree's descendants could not all be listed, ended and confirmed: the entry is then kept (PO-16).
   */
  endProcess(target: Identity, tree: boolean, until?: number): Promise<"ended" | "incomplete">;
  /**
   * For a tree an earlier sweep left incomplete, once its parent has gone: how many processes it may have left (0
   * resolves it), or `null` when unknown. Without it such a tree is never resolved, and its entry is kept (C9).
   */
  leftOf?(target: Identity, until?: number): Promise<number | null>;
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

/** An operation run only before `until`, and bounded by it; past it, `fallback` and the operation is never started (C10). */
function boundedBy(now: () => number) {
  return <T>(work: (until: number) => Promise<T>, fallback: T, until: number): Promise<T> =>
    now() < until ? within(Promise.resolve(until).then(work), fallback, until, now) : Promise.resolve(fallback);
}

/** Identities an earlier sweep couldn't confirm the descendants of; `null` when that file can't be read (kept). */
async function readIncomplete(path: string): Promise<Identity[] | null> {
  let text: string;
  try { text = await readFile(path, "utf8"); } catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : null; }
  const lines = text.split("\n").filter((line) => line.trim() !== "").map(parseTreeLine);
  return lines.every((line): line is Extract<TreeLine, Identity> => line !== undefined && isProcess(line)) ? lines : null;
}

async function sweepAll(root: string, ops: SweepOps, limitMs: number): Promise<SweepReport> {
  const now = ops.now ?? (() => performance.now());
  const report: SweepReport = { running: 0, swept: 0, ended: [], left: [], unhandled: 0, unverified: 0 };
  const bounded = boundedBy(now);
  // Reading and verifying the records has a limit of its own, like each tree (C10).
  const readUntil = now() + limitMs;
  for (const { id, lines, verified } of await readTrees(root, (path, stats) => bounded((until) => ops.owned(path, stats, until), false, readUntil))) {
    // A record anyone else could have written or swapped is no evidence to end a process on (PO-5, PO-16).
    if (!verified) { report.unverified++; report.unhandled++; continue; }
    const postOffice = lines.find((line) => line.kind === "post-office");
    if (!postOffice || !("pid" in postOffice)) continue; // A file with no post office line can't be judged.
    // Each tree has its own deadline, and every operation on it, a pending one included, ends by then (PO-10, C10).
    const deadline = now() + limitMs;
    const startTimeOf = (pid: number, until = deadline) => bounded((by) => ops.startTimeOf(pid, by), null, until);
    const commandOf = (pid: number, until = deadline) => bounded(async () => ops.commandOf?.(pid).catch(() => undefined), undefined, until);
    const office = await startTimeOf(postOffice.pid);
    if (office === null) { report.left.push({ pid: postOffice.pid }); continue; } // Unknown: kept and reported.
    if (compareStart(postOffice, office) !== "different") { report.running++; continue; }
    let unhandled = 0;
    for (const line of lines) {
      if (line.kind !== "job") continue;
      if (ops.removeJob && ops.endCoalition) { await bounded(() => ops.removeJob!(line.label).catch(() => {}), undefined, deadline); await bounded(() => ops.endCoalition!(line.coalition).catch(() => {}), undefined, deadline); } else unhandled++;
    }
    // Windows: nothing in the job is left; only a harness git command's entry runs outside it.
    const targets = lines.filter(isProcess).filter((line) => ops.platform !== "win32" || line.kind === "git")
      .filter((line, index, all) => all.findIndex((other) => other.pid === line.pid && other.startTime === line.startTime && other.creationTime === line.creationTime) === index);
    const compared = async (until?: number) => Promise.all(targets.map(async (target) => ({ target, match: judge(target, await startTimeOf(target.pid, until)) })));
    const matching = async () => (await compared()).filter(({ match }) => match === "same").map(({ target }) => target);
    const named = new Map<number, string | undefined>();
    // Trees whose end left descendants unconfirmed, and trees ended and confirmed whole, in this sweep.
    const incomplete = new Map<number, Identity>();
    const complete = new Set<number>();
    for (let remaining = await matching(); remaining.length > 0 && now() < deadline; remaining = await matching()) {
      for (const target of remaining) {
        if (!named.has(target.pid)) named.set(target.pid, await commandOf(target.pid));
        // The identity is checked again just before the signal: the pid may have been reused since the listing.
        if (judge(target, await startTimeOf(target.pid)) !== "same") continue;
        const tree = target.kind === "git";
        const result = await bounded((until) => ops.endProcess(target, tree, until).catch(() => "incomplete" as const), "incomplete" as const, deadline);
        if (tree && result === "incomplete") { incomplete.set(target.pid, target); complete.delete(target.pid); } else { incomplete.delete(target.pid); complete.add(target.pid); }
      }
      await ops.wait(Math.min(100, Math.max(0, deadline - now())));
    }
    const lastUntil = Math.max(deadline, now()) + limitMs / LAST_CHECK_SHARE;
    const last = await compared(lastUntil);
    // A tree an earlier sweep left incomplete stays unresolved, its entry kept, until this sweep ends it whole or
    // nothing it may have left still runs: its parent having gone proves nothing about its descendants (C9).
    const marker = join(treesDir(root), `${id}.incomplete`);
    const earlier = await readIncomplete(marker);
    const unresolved = new Map(incomplete);
    for (const target of earlier ?? []) {
      if (unresolved.has(target.pid) || complete.has(target.pid)) continue;
      if (await bounded(async (until) => ops.leftOf ? ops.leftOf(target, until).catch(() => null) : null, null, lastUntil) !== 0) unresolved.set(target.pid, target);
    }
    if (earlier === null) unhandled++; // An unreadable marker: nothing can resolve it here.
    for (const pid of unresolved.keys()) if (!named.has(pid)) named.set(pid, undefined);
    const left = new Set([...last.filter(({ match }) => match !== "different").map(({ target }) => target.pid), ...unresolved.keys()]);
    for (const { target, match } of last) if (match === "unsure" && !named.has(target.pid)) named.set(target.pid, await commandOf(target.pid, lastUntil));
    const swept = (pid: number): SweptProcess => ({ pid, ...(named.get(pid) === undefined ? {} : { command: redact(named.get(pid)) as string }) });
    for (const pid of named.keys()) (left.has(pid) ? report.left : report.ended).push(swept(pid));
    if (earlier !== null) {
      // Kept for the next sweep; a marker that can't be written leaves the entry unhandled, never forgotten.
      const lines = [...unresolved.values()].map((target) => `${JSON.stringify({ kind: "git", pid: target.pid, startTime: target.startTime, ...(target.creationTime === undefined ? {} : { creationTime: target.creationTime }) })}\n`);
      const saved = lines.length > 0 ? writeFile(marker, lines.join(""), { mode: 0o600 }) : unlink(marker).catch((error) => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
      if (!await saved.then(() => true, () => false)) unhandled++;
    }
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
      // An earlier incomplete group: none left once no process is in it. Still in use, its pid can't be reused (C9).
      leftOf: async ({ pid }) => {
        try { process.kill(-pid, 0); return 1; } catch (error) { const code = (error as NodeJS.ErrnoException).code; return code === "ESRCH" ? 0 : code === "EPERM" ? 1 : null; }
      },
    };
  }
  if (platform === "win32") {
    // Each call takes its tree's deadline: work not sent by then never is, and work in flight then is cancelled (C10).
    const session = openSweepSession();
    return {
      platform, wait: pause, owned: (path, stats, until) => ownedByCurrentUser(path, stats, session, until), close: () => session.close(),
      // The exact FILETIME from GetProcessTimes, as the supervisor's listing records it (PO-11).
      startTimeOf: (pid, until) => probeWindowsProcess(pid, session, until),
      // A tree is complete only when the helper ended and confirmed every descendant and the parent on their handles.
      endProcess: async ({ pid, creationTime }, tree, until) => (await endWindowsProcess(pid, creationTime, tree, session, until)) === "ended" || !tree ? "ended" : "incomplete",
      // No leftOf yet: its live test still reads 0 while an orphan runs, so an incomplete tree stays kept (C9).
    };
  }
  throw new Error(`The sweep has no operations for ${platform} yet: macOS needs PO-17's helper (M1b-18).`);
}
