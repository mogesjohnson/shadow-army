import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants as osConstants } from "node:os";
import { join, resolve } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import type { ManagedProcess, ManagedProcessOptions, ProcessExit } from "./windows.js";

/** PO-9: the guardian's ready report and the CLI's start must come within 10 seconds, counted once. */
export const READY_LIMIT_MS = 10_000;
/** PO-10: `SIGTERM` 9.5 s after the CLI was asked to exit, the kill at 10 s, and the kill's own limit. */
export const TERM_AFTER_MS = 9_500;
export const KILL_AFTER_MS = 10_000;
export const EMPTY_LIMIT_MS = 10_000;

/** The limits above; tests shorten them. */
export interface Limits { ready: number; termAfter: number; killAfter: number; empty: number }
const defaultLimits: Limits = { ready: READY_LIMIT_MS, termAfter: TERM_AFTER_MS, killAfter: KILL_AFTER_MS, empty: EMPTY_LIMIT_MS };

/** PO-11: a process in the tree. `startTime` is field 22 of `/proc/<pid>/stat`, so a reused pid can't match. */
export interface TreeProcess { pid: number; ppid: number; startTime: number }

export interface LinuxManagedProcess extends ManagedProcess {
  /** The guardian's pid: the root of the tree that `list` walks. */
  readonly guardianPid: number;
  /** Fails, rather than listing a stranger's tree, once the guardian is gone or its pid names another process. */
  list(): Promise<TreeProcess[]>;
  /**
   * `grace: false` skips the exit and `SIGTERM` steps: the tree is killed at once (PO-10), also during a graceful close.
   * Resolves only on the guardian's `ended` report (wait() gave ECHILD); otherwise rejects as a containment failure
   * (PO-15) and leaves a live guardian to go on ending its tree.
   */
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

async function readStat(pid: number, proc: string): Promise<TreeProcess | null> {
  try { return parseStat(pid, await readFile(join(proc, String(pid), "stat"), "latin1")); } catch { return null; }
}

/** The tree under `root`. With `rootStart`, the root's start time is checked before and after, so a reused pid fails. */
export async function listTree(root: number, proc = "/proc", rootStart?: number): Promise<TreeProcess[]> {
  const sameRoot = async () => {
    if (rootStart !== undefined && (await readStat(root, proc))?.startTime !== rootStart) {
      throw new Error(`Linux containment failed: the guardian (pid ${root}) is gone or its pid names another process; the listing was discarded (PO-11)`);
    }
  };
  await sameRoot();
  const names = (await readdir(proc)).filter((name) => /^[1-9]\d*$/.test(name));
  const read = await Promise.all(names.map((name) => readStat(Number(name), proc)));
  await sameRoot();
  return treeOf(read.filter((entry): entry is TreeProcess => entry !== null), root);
}

/**
 * The helper starts only an absolute path and never searches PATH, so the driver does, as Node's own start would
 * (libuv's execvp): PATH from the CLI's environment or `/usr/bin:/bin` without one, an empty entry meaning `cwd`.
 */
export async function resolveCommand(file: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const candidates = file.includes("/") ? [resolve(cwd, file)] : (env.PATH ?? "/usr/bin:/bin").split(":").map((dir) => resolve(cwd, dir, file));
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) { await access(candidate, fsConstants.X_OK); return candidate; }
    } catch { /* Try the next directory. */ }
  }
  throw Object.assign(new Error(`could not find executable ${file}`), { code: "ENOENT" });
}

const signalNames = new Map(Object.entries(osConstants.signals).map(([name, number]) => [number, name as NodeJS.Signals]));

interface Report { op?: string; event?: string; ok?: boolean; step?: string; errno?: number; pid?: number; code?: number; signal?: number; reason?: string; reaped?: number }

function deferred<T>() {
  let resolveIt!: (value: T) => void;
  let rejectIt!: (error: Error) => void;
  let settled = false;
  const promise = new Promise<T>((done, failIt) => { resolveIt = done; rejectIt = failIt; });
  promise.catch(() => {});
  return {
    promise,
    get settled() { return settled; },
    resolve(value: T) { if (!settled) { settled = true; resolveIt(value); } },
    reject(error: Error) { if (!settled) { settled = true; rejectIt(error); } },
  };
}

/** Linux containment driver: the guardian of PO-9 and PO-10 is `sa-contain guard`, reached through the PO-12 table. */
export async function spawnManagedProcess(options: ManagedProcessOptions, helper: string = helperPath(), limitsIn: Partial<Limits> = {}, proc = "/proc"): Promise<LinuxManagedProcess> {
  const limits = { ...defaultLimits, ...limitsIn };
  const env = options.env ?? process.env;
  const file = await resolveCommand(options.file, options.cwd, env);
  await access(helper, fsConstants.X_OK);
  const handshakeEnds = performance.now() + limits.ready;
  const guardian = spawn(helper, ["guard", file, ...(options.args ?? [])], { cwd: options.cwd, env, stdio: ["pipe", "pipe", "pipe", "pipe"] });
  const control = guardian.stdio[3] as Duplex;
  guardian.stdin.on("error", () => {});
  control.on("error", () => {});
  const send = (command: string) => { if (control.writable) control.write(`${command}\n`); };

  const ready = deferred<Report>();
  const started = deferred<Report>();
  const ended = deferred<void>();
  const exit = deferred<ProcessExit>();
  const failed = deferred<never>();
  let cliPid = 0;
  let failure: Error | undefined;
  const fail = (error: Error) => { failure ??= error; failed.reject(error); };

  let buffer = "";
  control.setEncoding("utf8");
  control.on("data", (data: string) => {
    buffer += data;
    for (let end; (end = buffer.indexOf("\n")) >= 0;) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let report: Report;
      try { report = JSON.parse(line) as Report; } catch { continue; }
      if (report.ok === false) fail(new Error(`Linux containment failed at ${report.step ?? report.reason ?? "an unknown step"}${report.errno ? ` (errno ${report.errno})` : ""}`));
      else if (report.event === "ready") ready.resolve(report);
      else if (report.event === "started" && Number.isInteger(report.pid)) started.resolve(report);
      else if (report.event === "exit" && cliPid > 0 && report.pid === cliPid) {
        exit.resolve(report.signal === undefined ? { code: report.code ?? null, signal: null } : { code: null, signal: signalNames.get(report.signal) ?? null });
      } else if (report.event === "ended" && Number.isInteger(report.reaped)) ended.resolve();
    }
  });
  // PO-15: losing the guardian or its channel before the tree is reported empty is a containment failure, never the CLI's exit.
  const lost = (what: string) => {
    if (ended.settled) return;
    const error = new Error(`Linux containment failed: ${what} before the tree was reported empty (PO-10, PO-15)`);
    fail(error);
    exit.reject(error);
  };
  control.once("close", () => lost("the guardian's control channel closed"));
  const guardianClosed = new Promise<void>((done) => guardian.once("close", (code, signal) => {
    lost(`the guardian ended (status ${code ?? signal})`);
    done();
  }));
  guardian.once("error", fail);
  const guardianAlive = () => guardian.exitCode === null && guardian.signalCode === null;

  // PO-10: one kill, one deadline. The first request starts the empty-tree limit; later requests change nothing.
  let killRequested = false;
  let lateTimer: NodeJS.Timeout | undefined;
  const late = deferred<void>();
  const killAsked = deferred<void>();
  const requestKill = () => {
    if (killRequested) return;
    killRequested = true;
    send("kill");
    lateTimer = setTimeout(() => late.resolve(), limits.empty);
    killAsked.resolve();
  };
  /** Waits, within the kill's limit, for the guardian's `ended` report; anything else is a containment failure. */
  const confirmEmpty = async (startSent: boolean): Promise<void> => {
    requestKill();
    await Promise.race([ended.promise, guardianClosed, late.promise]);
    if (ended.settled) {
      clearTimeout(lateTimer);
      await Promise.race([guardianClosed, late.promise]);
      clearTimeout(lateTimer);
      return;
    }
    clearTimeout(lateTimer);
    if (!startSent && guardianAlive()) { guardian.kill("SIGKILL"); await guardianClosed; return; } // Nothing was started.
    if (!guardianAlive()) {
      if (!startSent) return;
      throw failure ?? new Error("Linux containment failed: the guardian ended without reporting an empty tree (PO-10, PO-15)");
    }
    // The guardian is kept: as the tree's subreaper it goes on killing and reaping what is left.
    throw new Error(`Linux containment failed: the tree was not reported empty ${limits.empty} ms after its kill began; guardian ${guardian.pid} still holds it (PO-10, PO-15)`);
  };

  const within = <T>(step: Promise<T>, what: string): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const tooLate = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Linux guardian did not ${what} within ${limits.ready} ms of its launch (PO-9)`)), Math.max(0, handshakeEnds - performance.now()));
    });
    return Promise.race([step, failed.promise, tooLate]).finally(() => clearTimeout(timer));
  };
  let startSent = false;
  let guardianStart = 0;
  try {
    await within(ready.promise, "report ready");
    const identity = await readStat(guardian.pid!, proc);
    if (!identity) throw new Error(`Linux containment failed: could not read guardian ${guardian.pid}'s identity (PO-11)`);
    guardianStart = identity.startTime;
    // PO-9: the CLI is authorized to start only inside the one handshake window.
    if (performance.now() >= handshakeEnds) throw new Error(`Linux guardian did not report ready within ${limits.ready} ms of its launch (PO-9)`);
    startSent = true;
    send("start");
    cliPid = (await within(started.promise, "start the CLI")).pid!;
  } catch (error) {
    // PO-9: nothing starts uncontained. The guardian's own kill ends whatever it started.
    try { await confirmEmpty(startSent); } catch (cleanup) {
      throw new Error(`${(error as Error).message}; ${(cleanup as Error).message}`);
    }
    throw error;
  }

  let cliExited = false;
  void exit.promise.then(() => { cliExited = true; }, () => { cliExited = true; });
  let closing: Promise<void> | undefined;
  return {
    pid: cliPid, guardianPid: guardian.pid!, stdin: guardian.stdin, stdout: guardian.stdout, stderr: guardian.stderr, exited: exit.promise,
    list: () => listTree(guardian.pid!, proc, guardianStart),
    close({ grace = true } = {}) {
      if (!grace || cliExited) requestKill(); // Also hurries a graceful close that is already waiting.
      return closing ??= (async () => {
        if (!killRequested) {
          guardian.stdin.end();
          const timers = [setTimeout(() => send("term"), limits.termAfter), setTimeout(requestKill, limits.killAfter)];
          await Promise.race([exit.promise.catch(() => {}), guardianClosed, killAsked.promise]);
          timers.forEach(clearTimeout);
        }
        await confirmEmpty(true);
        control.destroy();
      })();
    },
  };
}
