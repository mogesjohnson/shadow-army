import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { redact } from "../logs.js";
import { parseStat } from "./linux.js";
import { endWindowsProcess, probeWindowsProcess } from "./windows.js";
import { compareStart, readTrees, treesDir, type Identity, type TreeLine } from "./trees.js";

/** What the sweep needs from the machine: injected, so it runs on fake processes. */
export interface SweepOps {
  platform: NodeJS.Platform;
  /**
   * The process's start time (Linux's clock ticks, or Windows's exact FILETIME as a string), `undefined` when no
   * such process runs, or `null` when the probe failed: unknown, never read as absent.
   */
  startTimeOf(pid: number): Promise<number | string | undefined | null>;
  commandOf?(pid: number): Promise<string | undefined>;
  /**
   * Ends the process with this identity, never a bare pid: on Windows the creation time is checked on the handle
   * that ends it. `tree` also ends a harness git command's children (its process group on Linux).
   */
  endProcess(target: Identity, tree: boolean): Promise<void>;
  /** macOS (PO-17's operations): removes a launchd job, and ends the members of a coalition. */
  removeJob?(label: string): Promise<void>;
  endCoalition?(id: string): Promise<void>;
  wait(ms: number): Promise<void>;
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
  /** Entries with a job or coalition this machine can't end. */
  unhandled: number;
}

/** PO-10's limit for a tree to be empty. */
export const SWEEP_LIMIT_MS = 10_000;
/** An unknown probe result is never a match and never an absence. */
const judge = (line: Identity, now: number | string | undefined | null) => now === null ? "unsure" as const : compareStart(line, now);
const isProcess = (line: TreeLine): line is Extract<TreeLine, Identity> => "pid" in line && line.kind !== "post-office";

/**
 * PO-16's sweep: ends every tree whose entry belongs to a post office that is no longer running, judged by the
 * entry's pid and start time. A process is ended only while its recorded identity still matches, never for a
 * session or process-group id alone; a pid that another process now holds is left running.
 */
export async function sweepTrees(root: string, ops: SweepOps): Promise<SweepReport> {
  const report: SweepReport = { running: 0, swept: 0, ended: [], left: [], unhandled: 0 };
  for (const { id, lines } of await readTrees(root)) {
    const postOffice = lines.find((line) => line.kind === "post-office");
    if (!postOffice || !("pid" in postOffice)) continue; // A file with no post office line can't be judged.
    const office = await ops.startTimeOf(postOffice.pid);
    if (office === null) { report.left.push({ pid: postOffice.pid }); continue; } // Unknown: kept and reported.
    if (compareStart(postOffice, office) !== "different") { report.running++; continue; }
    let unhandled = 0;
    for (const line of lines) {
      if (line.kind !== "job") continue;
      if (ops.removeJob && ops.endCoalition) { await ops.removeJob(line.label).catch(() => {}); await ops.endCoalition(line.coalition).catch(() => {}); } else unhandled++;
    }
    // Windows: nothing in the job is left; only a harness git command's entry runs outside it.
    const targets = lines.filter(isProcess).filter((line) => ops.platform !== "win32" || line.kind === "git")
      .filter((line, index, all) => all.findIndex((other) => other.pid === line.pid && other.startTime === line.startTime && other.creationTime === line.creationTime) === index);
    const compared = async () => Promise.all(targets.map(async (target) => ({ target, match: judge(target, await ops.startTimeOf(target.pid)) })));
    const matching = async () => (await compared()).filter(({ match }) => match === "same").map(({ target }) => target);
    const named = new Map<number, string | undefined>();
    for (let remaining = await matching(), waited = 0; remaining.length > 0 && waited <= SWEEP_LIMIT_MS; remaining = await matching(), waited += 100) {
      for (const target of remaining) {
        if (!named.has(target.pid)) named.set(target.pid, await ops.commandOf?.(target.pid).catch(() => undefined));
        // The identity is checked again just before the signal: the pid may have been reused since the listing.
        if (judge(target, await ops.startTimeOf(target.pid)) === "same") await ops.endProcess(target, target.kind === "git").catch(() => {});
      }
      await ops.wait(100);
    }
    const last = await compared();
    const left = new Set(last.filter(({ match }) => match !== "different").map(({ target }) => target.pid));
    for (const { target, match } of last) if (match === "unsure" && !named.has(target.pid)) named.set(target.pid, await ops.commandOf?.(target.pid).catch(() => undefined));
    const swept = (pid: number): SweptProcess => ({ pid, ...(named.get(pid) === undefined ? {} : { command: redact(named.get(pid)) as string }) });
    for (const pid of named.keys()) (left.has(pid) ? report.left : report.ended).push(swept(pid));
    report.unhandled += unhandled;
    if (left.size === 0 && unhandled === 0) { await unlink(join(treesDir(root), `${id}.jsonl`)).catch(() => {}); report.swept++; }
  }
  return report;
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** The real machine's operations: Linux through `/proc`, Windows through PowerShell and one process handle per end. macOS needs PO-17's helper. */
export function systemOps(platform: NodeJS.Platform = process.platform): SweepOps {
  if (platform === "linux") {
    return {
      platform, wait: pause,
      startTimeOf: async (pid) => {
        try {
          const text = await readFile(`/proc/${pid}/stat`, "latin1");
          // A zombie (Z) or dead (X) process has ended: only its parent has yet to collect it.
          return "ZX".includes(text[text.lastIndexOf(")") + 2] ?? "?") ? undefined : parseStat(pid, text)?.startTime;
        } catch (error) { return ["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "") ? undefined : null; }
      },
      commandOf: async (pid) => (await readFile(`/proc/${pid}/cmdline`, "latin1")).replaceAll("\0", " ").trim(),
      // Node has no pidfd: the identity is checked just before the signal (above), not on a handle.
      endProcess: async ({ pid }, tree) => { try { process.kill(tree ? -pid : pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; } },
    };
  }
  if (platform === "win32") {
    return {
      platform, wait: pause,
      // The exact FILETIME from GetProcessTimes, as the supervisor's listing records it (PO-11).
      startTimeOf: probeWindowsProcess,
      endProcess: async ({ pid, creationTime }, tree) => { await endWindowsProcess(pid, creationTime, tree); },
    };
  }
  throw new Error(`The sweep has no operations for ${platform} yet: macOS needs PO-17's helper (M1b-18).`);
}
