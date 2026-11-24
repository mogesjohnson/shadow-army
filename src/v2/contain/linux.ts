import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { constants as osConstants } from "node:os";
import { delimiter, join, resolve } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import type { ManagedProcess, ManagedProcessOptions, ProcessExit } from "./windows.js";

/** PO-9: the guardian's ready report and the CLI's start must come within 10 seconds. */
export const READY_LIMIT_MS = 10_000;
/** PO-10: `SIGTERM` 9.5 s after the CLI was asked to exit, the kill at 10 s, and the kill's own limit. */
export const TERM_AFTER_MS = 9_500;
export const KILL_AFTER_MS = 10_000;
export const EMPTY_LIMIT_MS = 10_000;

/** PO-11: a process in the tree. `startTime` is field 22 of `/proc/<pid>/stat`, so a reused pid can't match. */
export interface TreeProcess { pid: number; ppid: number; startTime: number }

export interface LinuxManagedProcess extends ManagedProcess {
  /** The guardian's pid: the root of the tree that `list` walks. */
  readonly guardianPid: number;
  list(): Promise<TreeProcess[]>;
  /** `grace: false` skips the exit and `SIGTERM` steps: the tree is killed at once (PO-10). */
  close(options?: { grace?: boolean }): Promise<void>;
}

/** PO-12's helper for this processor, in the package beside `dist/` and `src/`. */
export function helperPath(arch: string = process.arch): string {
  return fileURLToPath(new URL(`../../../native/linux-${arch}/sa-contain`, import.meta.url));
}

/** Parses `/proc/<pid>/stat`. The command name may hold any byte, so fields start after the last `)`. */
export function parseStat(pid: number, text: string): TreeProcess | null {
  const end = text.lastIndexOf(")");
  if (end < 0) return null;
  const fields = text.slice(end + 2).split(" ");
  // fields[0] is field 3 (state); field 4 is the parent, field 22 the start time.
  const ppid = Number(fields[1]);
  const startTime = Number(fields[19]);
  return Number.isInteger(ppid) && Number.isInteger(startTime) ? { pid, ppid, startTime } : null;
}

/** Every process whose chain of parents reaches `root`, the root left out (PO-11). */
export function treeOf(processes: readonly TreeProcess[], root: number): TreeProcess[] {
  const parent = new Map(processes.map((entry) => [entry.pid, entry.ppid]));
  return processes.filter((entry) => {
    const seen = new Set<number>();
    for (let pid = entry.ppid; pid > 0 && !seen.has(pid); pid = parent.get(pid) ?? 0) {
      if (pid === root) return true;
      seen.add(pid);
    }
    return false;
  });
}

export async function listTree(root: number, proc = "/proc"): Promise<TreeProcess[]> {
  const names = (await readdir(proc)).filter((name) => /^[1-9]\d*$/.test(name));
  const read = await Promise.all(names.map(async (name) => {
    try { return parseStat(Number(name), await readFile(join(proc, name, "stat"), "latin1")); } catch { return null; }
  }));
  return treeOf(read.filter((entry): entry is TreeProcess => entry !== null), root);
}

/** The helper starts only an absolute path and never searches PATH, so the driver does, as a direct start would. */
async function resolveCommand(file: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const candidates = file.includes("/") ? [resolve(cwd, file)] : (env.PATH ?? "").split(delimiter).filter(Boolean).map((dir) => resolve(cwd, dir, file));
  for (const candidate of candidates) {
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch { /* Try the next directory. */ }
  }
  throw Object.assign(new Error(`could not find executable ${file}`), { code: "ENOENT" });
}

const signalNames = new Map(Object.entries(osConstants.signals).map(([name, number]) => [number, name as NodeJS.Signals]));

interface Report { op?: string; event?: string; ok?: boolean; step?: string; errno?: number; pid?: number; code?: number; signal?: number; reason?: string }

/** Linux containment driver: the guardian of PO-9 and PO-10 is `sa-contain guard`, reached through the PO-12 table. */
export async function spawnManagedProcess(options: ManagedProcessOptions, helper: string = helperPath()): Promise<LinuxManagedProcess> {
  const env = options.env ?? process.env;
  const file = await resolveCommand(options.file, options.cwd, env);
  await access(helper, fsConstants.X_OK);
  const guardian = spawn(helper, ["guard", file, ...(options.args ?? [])], { cwd: options.cwd, env, stdio: ["pipe", "pipe", "pipe", "pipe"] });
  const control = guardian.stdio[3] as Duplex;
  guardian.stdin.on("error", () => {});
  control.on("error", () => {});

  const waiters = new Map<string, (report: Report) => void>();
  const waitFor = (event: string) => new Promise<Report>((done) => waiters.set(event, done));
  let settleExit!: (exit: ProcessExit) => void;
  const exited = new Promise<ProcessExit>((done) => { settleExit = done; });
  let cliPid = 0;
  let failure: Error | undefined;
  let fail!: (error: Error) => void;
  const failed = new Promise<never>((_, reject) => { fail = (error) => { failure ??= error; reject(error); }; });
  failed.catch(() => {});

  let buffer = "";
  control.setEncoding("utf8");
  control.on("data", (data: string) => {
    buffer += data;
    for (let end; (end = buffer.indexOf("\n")) >= 0;) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let report: Report;
      try { report = JSON.parse(line) as Report; } catch { continue; }
      if (report.ok === false) fail(new Error(`Linux containment failed at ${report.step ?? report.reason ?? "an unknown step"}${report.errno ? ` (errno ${report.errno})` : ""}`));
      else if (report.event === "exit" && report.pid === cliPid) {
        settleExit(report.signal === undefined ? { code: report.code ?? null, signal: null } : { code: null, signal: signalNames.get(report.signal) ?? null });
      }
      if (report.event) waiters.get(report.event)?.(report);
    }
  });
  const guardianClosed = new Promise<void>((done) => guardian.once("close", () => {
    settleExit({ code: guardian.exitCode, signal: guardian.signalCode });
    fail(new Error(`Linux guardian exited before the CLI started (status ${guardian.exitCode ?? guardian.signalCode})`));
    done();
  }));
  guardian.once("error", fail);

  const withinReadyLimit = async <T>(step: Promise<T>): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Linux guardian did not report ready within 10 seconds")), READY_LIMIT_MS); });
    try { return await Promise.race([step, failed, late]); } finally { clearTimeout(timer); }
  };
  try {
    const started = waitFor("started");
    await withinReadyLimit(waitFor("ready"));
    control.write("start\n");
    cliPid = (await withinReadyLimit(started)).pid!;
  } catch (error) {
    // PO-9: nothing starts uncontained. Ending the guardian kills whatever it started.
    if (guardian.exitCode === null && guardian.signalCode === null) guardian.kill("SIGKILL");
    await guardianClosed;
    throw error;
  }

  const ended = waitFor("ended");
  let cliExited = false;
  void exited.then(() => { cliExited = true; });
  let closing: Promise<void> | undefined;
  return {
    pid: cliPid, guardianPid: guardian.pid!, stdin: guardian.stdin, stdout: guardian.stdout, stderr: guardian.stderr, exited,
    list: () => listTree(guardian.pid!),
    close({ grace = true } = {}) {
      return closing ??= (async () => {
        const timers: NodeJS.Timeout[] = [];
        let killBegan = Date.now();
        const kill = () => { killBegan = Date.now(); control.write("kill\n"); };
        if (grace && !cliExited) {
          guardian.stdin.end();
          timers.push(setTimeout(() => control.write("term\n"), TERM_AFTER_MS), setTimeout(kill, KILL_AFTER_MS));
          await Promise.race([exited, guardianClosed]);
          timers.forEach(clearTimeout);
        }
        if (guardian.exitCode === null && guardian.signalCode === null) kill();
        let timer: NodeJS.Timeout | undefined;
        const late = new Promise<"late">((done) => { timer = setTimeout(() => done("late"), Math.max(0, EMPTY_LIMIT_MS - (Date.now() - killBegan))); });
        const outcome = await Promise.race([ended.then(() => guardianClosed), guardianClosed, late]);
        clearTimeout(timer);
        if (outcome === "late") {
          guardian.kill("SIGKILL");
          await guardianClosed;
          throw new Error("Linux containment failed: the tree was not empty 10 seconds after its kill began (PO-10, PO-15)");
        }
        control.destroy();
      })();
    },
  };
}
