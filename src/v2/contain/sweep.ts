import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { redact } from "../logs.js";
import { parseStat } from "./linux.js";
import { readTrees, treesDir, type Identity, type TreeLine } from "./trees.js";

const run = promisify(execFile);

/** What the sweep needs from the machine: injected, so it runs on fake processes. */
export interface SweepOps {
  platform: NodeJS.Platform;
  /** The process's start time (creation time on Windows, in Unix milliseconds), or `undefined` when no such process runs. */
  startTimeOf(pid: number): Promise<number | undefined>;
  commandOf?(pid: number): Promise<string | undefined>;
  /** Ends a process; `tree` ends the harness git command's whole process group (`taskkill /t /f` on Windows). */
  endProcess(pid: number, tree: boolean): Promise<void>;
  /** macOS (PO-17's operations): removes a launchd job, and ends the members of a coalition. */
  removeJob?(label: string): Promise<void>;
  endCoalition?(id: string): Promise<void>;
  wait(ms: number): Promise<void>;
}

export interface SweptProcess { pid: number; command?: string }
export interface SweepReport {
  /** Entries whose post office still runs: left alone. */
  running: number;
  /** Entries ended and removed. */
  swept: number;
  ended: SweptProcess[];
  /** Processes still running after the limit, and entries with a job or coalition this machine can't end. */
  left: SweptProcess[];
  unhandled: number;
}

/** PO-10's limit for a tree to be empty. */
export const SWEEP_LIMIT_MS = 10_000;
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
    if (await ops.startTimeOf(postOffice.pid) === postOffice.startTime) { report.running++; continue; }
    let unhandled = 0;
    for (const line of lines) {
      if (line.kind !== "job") continue;
      if (ops.removeJob && ops.endCoalition) { await ops.removeJob(line.label).catch(() => {}); await ops.endCoalition(line.coalition).catch(() => {}); } else unhandled++;
    }
    // Windows: nothing in the job is left; only a harness git command's entry runs outside it.
    const targets = lines.filter(isProcess).filter((line) => ops.platform !== "win32" || line.kind === "git")
      .filter((line, index, all) => all.findIndex((other) => other.pid === line.pid && other.startTime === line.startTime) === index);
    const matching = async () => (await Promise.all(targets.map(async (target) => (await ops.startTimeOf(target.pid)) === target.startTime ? target : undefined)))
      .filter((target): target is (typeof targets)[number] => target !== undefined);
    const named = new Map<number, string | undefined>();
    for (let remaining = await matching(), waited = 0; remaining.length > 0 && waited <= SWEEP_LIMIT_MS; remaining = await matching(), waited += 100) {
      for (const target of remaining) {
        if (!named.has(target.pid)) named.set(target.pid, await ops.commandOf?.(target.pid).catch(() => undefined));
        // The identity is checked again just before the signal: the pid may have been reused since the listing.
        if (await ops.startTimeOf(target.pid) === target.startTime) await ops.endProcess(target.pid, target.kind === "git").catch(() => {});
      }
      await ops.wait(100);
    }
    const left = new Set((await matching()).map((target) => target.pid));
    const swept = (pid: number): SweptProcess => ({ pid, ...(named.get(pid) === undefined ? {} : { command: redact(named.get(pid)) as string }) });
    for (const pid of named.keys()) (left.has(pid) ? report.left : report.ended).push(swept(pid));
    report.unhandled += unhandled;
    if (left.size === 0 && unhandled === 0) { await unlink(join(treesDir(root), `${id}.jsonl`)).catch(() => {}); report.swept++; }
  }
  return report;
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** The real machine's operations: Linux through `/proc`, Windows through PowerShell and `taskkill`. macOS needs PO-17's helper. */
export function systemOps(platform: NodeJS.Platform = process.platform): SweepOps {
  if (platform === "linux") {
    return {
      platform, wait: pause,
      startTimeOf: async (pid) => {
        try {
          const text = await readFile(`/proc/${pid}/stat`, "latin1");
          // A zombie (Z) or dead (X) process has ended: only its parent has yet to collect it.
          return "ZX".includes(text[text.lastIndexOf(")") + 2] ?? "?") ? undefined : parseStat(pid, text)?.startTime;
        } catch { return undefined; }
      },
      commandOf: async (pid) => (await readFile(`/proc/${pid}/cmdline`, "latin1")).replaceAll("\0", " ").trim(),
      endProcess: async (pid, tree) => { try { process.kill(tree ? -pid : pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; } },
    };
  }
  if (platform === "win32") {
    const taskkill = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
    return {
      platform, wait: pause,
      startTimeOf: async (pid) => {
        try {
          const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `([DateTimeOffset](Get-Process -Id ${pid} -ErrorAction Stop).StartTime).ToUnixTimeMilliseconds()`]);
          return Number(stdout.trim());
        } catch { return undefined; }
      },
      endProcess: async (pid) => { await run(taskkill, ["/t", "/f", "/pid", String(pid)]); },
    };
  }
  throw new Error(`The sweep has no operations for ${platform} yet: macOS needs PO-17's helper (M1b-18).`);
}
