import { createRequire } from "node:module";
import { arch as osArch, platform as osPlatform, release, tmpdir } from "node:os";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { containmentFor, spawnManagedProcess, type ManagedProcess, type ManagedProcessOptions } from "./index.js";
import { failureMessage, type Failure, type Where } from "./messages.js";

/** PO-14's four steps, in order. */
export const STEPS = ["helper", "checksums", "mode", "probe"] as const;
export type StepName = (typeof STEPS)[number];

export type StepOutcome = { ok: true } | { ok: false; failure: Failure };
/** A file step 2 checked, and the SHA-256 it found (PO-13). */
export interface FileDigest { file: string; sha256: string }
export type ChecksumsOutcome = { ok: true; files: readonly FileDigest[] } | { ok: false; failure: Failure };
/** A runner's outcome; a pass carries what the pass log names (AC18). */
type Outcome = { ok: true; files?: readonly FileDigest[]; containment?: string } | { ok: false; failure: Failure };
const PASS = { ok: true } as const;
const fail = (failure: Failure): { ok: false; failure: Failure } => ({ ok: false, failure });

export interface StepContext {
  signal: AbortSignal;
  /**
   * A process or tree to kill if the check fails or runs out of time ("anything it started is killed"). Register it
   * before awaiting the launch; one registered after the check failed runs at once.
   */
  killOnFail(kill: () => void | Promise<void>): void;
  /** Calls `fn` after `ms` of counted time, which leaves out time the post office did not run (PO-7). */
  after(ms: number, fn: () => void): () => void;
}

/**
 * The per-system parts of the check. M1b-15 and M1b-16 (the Linux and macOS helper) and M1b-19 (the Windows
 * script and its DLL) provide them; until a system's steps are in `CheckOptions.systems` its check fails closed.
 */
export interface SystemSteps {
  /** Step 1 after the dispatch table: the helper (Windows: the script and its DLL) is there and can be run. */
  helper(ctx: StepContext): Promise<StepOutcome>;
  /** Step 2: each file's SHA-256 matches the one in the post office's code (PO-13); a pass names each file checked. */
  checksums(ctx: StepContext): Promise<ChecksumsOutcome>;
  /** Step 3: Linux subreaper mark; macOS lookups, structure sizes and audit token; Windows FullLanguage mode. */
  mode(ctx: StepContext): Promise<StepOutcome>;
  /**
   * PO-11's listing of the tree under `rootPid`, and the containment it is in, named for the log (the job, the
   * subreaper or the coalition); on macOS also whether the coalition is new (PO-18).
   */
  listTree(ctx: StepContext, rootPid: number): Promise<{ pids: number[]; containment: string; newCoalition?: boolean }>;
}

/** Monotonic milliseconds, and a repeating timer. Faked in tests. */
export interface Clock { now(): number; every(ms: number, fn: () => void): () => void }
const realClock: Clock = {
  now: () => performance.now(),
  every(ms, fn) { const timer = setInterval(fn, ms); timer.unref(); return () => clearInterval(timer); },
};

export interface CheckOptions {
  /** Steps per `<platform>-<arch>`. A pair with none fails closed. */
  systems: Readonly<Record<string, SystemSteps>>;
  platform?: string;
  arch?: string;
  osVersion?: string;
  shadowArmy?: string;
  /** Starts a CLI in containment; by default the one PO-12's table names for this system. `signal` aborts a launch. */
  spawn?: (options: ManagedProcessOptions, signal: AbortSignal) => Promise<ManagedProcess>;
  /**
   * Step 4's kill of the probe's whole tree, with no grace (PO-14). By default the driver's `kill()`, not awaited;
   * a driver without one fails the check rather than fall back to the graceful `close()`.
   */
  killTree?: (child: ManagedProcess) => void;
  probePath?: string;
  /** PO-12's table lookup, which throws for a system with no helper. Tests replace it for pairs not built yet. */
  dispatch?: (platform: string, arch: string) => unknown;
  clock?: Clock;
  /** The post office's log. */
  log?: (line: string) => void;
  timeoutMs?: number;
  /** The macOS versions CI tested (PO-21); a version outside them is logged as untested, and still checked. */
  testedMacOS?: { oldest: string; newest: string };
  smartAppControlCanBeUndone?: boolean;
}

export type CheckResult =
  | { ok: true; line: string; containment: string; files: readonly FileDigest[] }
  | { ok: false; step: StepName; failure: Failure; message: string };

const TIMEOUT_MS = 10_000;
const LONGEST_STEP_MS = 5_000;
const PIPE_END_MS = 3_000;
const CLEANUP_MS = 5_000;
const DEFAULT_PROBE = fileURLToPath(new URL("../../../native/probe.mjs", import.meta.url));

const versionParts = (version: string) => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
function compareVersions(a: string, b: string): number {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

const SYSTEM_NAMES: Record<string, string> = { darwin: "macOS", linux: "Linux", win32: "Windows" };
const aborted = (signal: AbortSignal) => new Promise<never>((_, reject) => {
  if (signal.aborted) reject(new Error("check ended"));
  else signal.addEventListener("abort", () => reject(new Error("check ended")), { once: true });
});
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** How the probe's pipe ended: only end of file is the proof; an error or a close without it is not (AC18). */
type PipeEnd = { kind: "eof" } | { kind: "error"; message: string } | { kind: "closed" };
function watchPipe(stream: Readable): { seen(): PipeEnd | undefined; settled: Promise<PipeEnd> } {
  let seen: PipeEnd | undefined;
  const settled = new Promise<PipeEnd>((done) => {
    const settle = (end: PipeEnd) => { if (!seen) { seen = end; done(end); } };
    stream.once("end", () => settle({ kind: "eof" }));
    stream.on("error", (error: Error) => settle({ kind: "error", message: error.message }));
    stream.once("close", () => settle({ kind: "closed" }));
  });
  return { seen: () => seen, settled };
}
const pipeOutcome = (end: PipeEnd): Outcome => (end.kind === "eof" ? PASS : fail({
  cause: "helper-failed",
  detail: end.kind === "error" ? `the test process's pipe failed (${end.message})` : "the test process's pipe closed without reaching its end",
}));

/** Waits for the probe's two report lines; ends early if the pipe ends first. */
function readPids(child: ManagedProcess, ended: Promise<PipeEnd>): Promise<{ probe: number; grandchild: number }> {
  return new Promise((resolve, reject) => {
    const pids: Record<string, number> = {};
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        try { const { role, pid } = JSON.parse(line) as { role: string; pid: number }; pids[role] = pid; } catch { /* not a report */ }
      }
      if (pids.probe && pids.grandchild) resolve({ probe: pids.probe, grandchild: pids.grandchild });
    });
    void ended.then(() => reject(new Error("the test process ended before it reported")));
  });
}

type ProbeOptions = Required<Pick<CheckOptions, "platform" | "spawn" | "probePath" | "killTree">>;
async function probeStep(ctx: StepContext, o: ProbeOptions, steps: SystemSteps): Promise<Outcome> {
  // Owned from the moment it is asked for: a launch that completes after the check failed is closed then.
  const launching = o.spawn({ file: process.execPath, args: [o.probePath], cwd: tmpdir() }, ctx.signal);
  ctx.killOnFail(() => launching.then((started) => (started.kill ? started.kill() : started.close()), () => {}));
  let child: ManagedProcess;
  try {
    child = await Promise.race([launching, aborted(ctx.signal)]);
  } catch (error) {
    if (ctx.signal.aborted) throw error;
    return fail({ cause: "helper-failed", detail: `the test process would not start (${errorText(error)})` });
  }
  const pipe = watchPipe(child.stdout);
  let containment: string;
  try {
    const pids = await Promise.race([readPids(child, pipe.settled), aborted(ctx.signal)]);
    const listed = await steps.listTree(ctx, pids.probe);
    if (!listed.pids.includes(pids.probe) || !listed.pids.includes(pids.grandchild)) {
      return fail({ cause: "helper-failed", detail: "the listing did not show the test process and its grandchild" });
    }
    if (o.platform === "darwin" && listed.newCoalition !== true) {
      return fail({ cause: "helper-failed", detail: "the test process is not in a new coalition" });
    }
    if (!listed.containment) return fail({ cause: "helper-failed", detail: "the listing did not name the containment" });
    containment = listed.containment;
  } catch (error) {
    if (ctx.signal.aborted) throw error;
    return fail({ cause: "helper-failed", detail: errorText(error) });
  }
  // The pipe's end after the kill, not the listing, is the proof; an end seen before the kill proves nothing.
  if (pipe.seen()) return fail({ cause: "helper-failed", detail: "the test process's pipe ended before it was killed" });
  const outlived = new Promise<Outcome>((done) => { ctx.after(PIPE_END_MS, () => done(fail({ cause: "outlived" }))); });
  try {
    o.killTree(child);
  } catch (error) {
    return fail({ cause: "helper-failed", detail: `the test process could not be killed (${errorText(error)})` });
  }
  const end = await Promise.race([pipe.settled.then(pipeOutcome), outlived, aborted(ctx.signal)]);
  return end.ok ? { ok: true, containment } : end;
}

/** PO-14: the check, as the machine is now, within 10 seconds of counted time. It never throws. */
export async function checkContainment(options: CheckOptions): Promise<CheckResult> {
  const platform = options.platform ?? osPlatform();
  const arch = options.arch ?? osArch();
  const log = options.log ?? (() => {});
  const clock = options.clock ?? realClock;
  const where: Where = {
    platform, arch, system: SYSTEM_NAMES[platform] ?? platform, version: options.osVersion ?? release(),
    shadowArmy: options.shadowArmy ?? (createRequire(import.meta.url)("../../../package.json") as { version: string }).version,
    smartAppControlCanBeUndone: options.smartAppControlCanBeUndone,
  };
  const { testedMacOS } = options;
  if (platform === "darwin" && testedMacOS
    && (compareVersions(where.version, testedMacOS.oldest) < 0 || compareVersions(where.version, testedMacOS.newest) > 0)) {
    log(`macOS ${where.version} is untested by this Shadow Army; the containment check still decides.`);
  }

  // Counted time: a step of more than 5 s between two ticks means the post office did not run (PO-7).
  const startedAt = clock.now();
  let counted = 0;
  let last = startedAt;
  const timers: { at: number; fn: () => void }[] = [];
  const stopTicking = clock.every(1000, () => {
    const now = clock.now();
    let step = now - last;
    last = now;
    if (step > LONGEST_STEP_MS) {
      log(`The post office did not run for ${Math.round(step / 1000)} s during the containment check; 5 s of it count.`);
      step = LONGEST_STEP_MS;
    }
    counted += step;
    for (const timer of timers.splice(0)) if (timer.at <= counted) timer.fn(); else timers.push(timer);
  });
  const after = (ms: number, fn: () => void) => {
    const timer = { at: counted + ms, fn };
    timers.push(timer);
    return () => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); };
  };

  // Cleanup runs when the check fails without holding up its result. A kill that fails is logged; the ticking that
  // bounds the cleanup stops once every kill is done or CLEANUP_MS have counted.
  const controller = new AbortController();
  const killers: (() => void | Promise<void>)[] = [];
  const cleanups: Promise<void>[] = [];
  const cleanUp = (kill: () => void | Promise<void>) => {
    let done: Promise<unknown>;
    try { done = Promise.resolve(kill()); } catch (error) { done = Promise.reject(error); }
    cleanups.push(done.then(() => {}, (error: unknown) => { log(`Cleanup after the containment check failed: ${errorText(error)}`); }));
  };
  const ctx: StepContext = {
    signal: controller.signal,
    killOnFail: (kill) => { if (controller.signal.aborted) cleanUp(kill); else killers.push(kill); },
    after,
  };
  const steps = options.systems[`${platform}-${arch}`];
  const need = (step: string): Failure => ({ cause: "not-built", step });
  const spawn = options.spawn
    ?? ((spawnOptions: ManagedProcessOptions, signal: AbortSignal) => spawnManagedProcess({ ...spawnOptions, signal }, platform, arch));
  const killTree = options.killTree ?? ((child: ManagedProcess) => {
    if (!child.kill) throw new Error("its driver has no kill without grace");
    void child.kill().catch(() => {});
  });
  const runners: Record<StepName, () => Promise<Outcome>> = {
    async helper() {
      try { (options.dispatch ?? containmentFor)(platform, arch); } catch { return fail({ cause: "no-helper" }); }
      return steps ? steps.helper(ctx) : fail(need("helper"));
    },
    async checksums() {
      if (!steps) return fail(need("checksums"));
      const outcome = await steps.checksums(ctx);
      return outcome.ok && outcome.files.length === 0 ? fail({ cause: "helper-failed", detail: "the checksums step checked no file" }) : outcome;
    },
    mode: async () => (steps ? steps.mode(ctx) : fail(need("mode"))),
    probe: async () => (steps ? probeStep(ctx, { platform, spawn, probePath: options.probePath ?? DEFAULT_PROBE, killTree }, steps) : fail(need("probe"))),
  };

  let current: StepName = STEPS[0];
  let timedOut!: () => void;
  const deadline = new Promise<"timeout">((done) => { timedOut = () => done("timeout"); });
  after(options.timeoutMs ?? TIMEOUT_MS, timedOut);
  let result: { step: StepName; failure: Failure } | undefined;
  let files: readonly FileDigest[] = [];
  let containment = "";
  for (const step of STEPS) {
    current = step;
    const run = runners[step]().catch((error: unknown): Outcome => (
      controller.signal.aborted ? PASS : fail({ cause: "helper-failed", detail: `the ${step} step failed: ${errorText(error)}` })));
    const outcome = await Promise.race([run, deadline]);
    if (outcome === "timeout") { result = { step, failure: { cause: "timeout", step } }; break; }
    if (!outcome.ok) { result = { step, failure: outcome.failure }; break; }
    files = outcome.files ?? files;
    containment = outcome.containment ?? containment;
  }
  if (!result) {
    stopTicking();
    const digests = files.map((file) => `${file.file} SHA-256 ${file.sha256}`).join("; ");
    const line = `Containment check passed on ${where.system} ${where.version} (${arch}) in ${((clock.now() - startedAt) / 1000).toFixed(1)} s: `
      + `helper, checksums (${digests}), mode, probe (in ${containment}).`;
    log(line);
    return { ok: true, line, containment, files };
  }
  controller.abort();
  for (const kill of killers.splice(0)) cleanUp(kill);
  let bounded = false;
  after(CLEANUP_MS, () => {
    bounded = true;
    stopTicking();
    log(`Cleanup after the containment check did not finish within ${CLEANUP_MS / 1000} s.`);
  });
  void Promise.all(cleanups).then(() => { if (!bounded) stopTicking(); });
  const message = failureMessage(result.failure, where);
  log(message);
  return { ok: false, step: current, failure: result.failure, message };
}

/**
 * PO-14's rule for when to check: when the post office starts, and again before a soldier is started or
 * reconnected after a failed check or a failed containment (PO-15). Concurrent callers share one check, but only
 * one started after the latest reported failure: a check already running then cannot write its result back.
 */
export function createContainmentGate(options: CheckOptions) {
  let last: CheckResult | undefined;
  let generation = 0;
  let running: { generation: number; check: Promise<CheckResult>; result: Promise<CheckResult> } | undefined;
  const run = (): Promise<CheckResult> => {
    if (running?.generation === generation) return running.result;
    const started = generation;
    // One check at a time: the next waits on the check itself, never on a result that may wait on it (C8).
    const check = (running?.check ?? Promise.resolve()).then(() => checkContainment(options));
    const result: Promise<CheckResult> = check.then((outcome) => {
      if (started === generation) { last = outcome; return outcome; }
      // A failure was reported while this ran: its pass is stale, so its waiters get a check of the latest state.
      return outcome.ok ? run() : outcome;
    }).finally(() => { if (running?.result === result) running = undefined; });
    running = { generation: started, check, result };
    return result;
  };
  return {
    /** The check at start-up, before any soldier starts. */
    start: run,
    /** Before a soldier starts or reconnects: the last pass stands until a failure is reported. */
    ready: () => (last?.ok ? Promise.resolve(last) : run()),
    /** PO-15: a session's containment failed, so the next start checks again. */
    containmentFailed: () => { last = undefined; generation++; },
  };
}
