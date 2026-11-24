import { createRequire } from "node:module";
import { arch as osArch, platform as osPlatform, release } from "node:os";
import { containmentFor, type ManagedProcess, type ManagedProcessOptions } from "./index.js";
import { failureMessage, type Failure, type Where } from "./messages.js";

/** PO-14's four steps, in order. */
export const STEPS = ["helper", "checksums", "mode", "probe"] as const;
export type StepName = (typeof STEPS)[number];

export type StepOutcome = { ok: true } | { ok: false; failure: Failure };
const PASS: StepOutcome = { ok: true };
const fail = (failure: Failure): StepOutcome => ({ ok: false, failure });

export interface StepContext {
  signal: AbortSignal;
  /** A process or tree to kill if the check fails or runs out of time ("anything it started is killed"). */
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
  /** Step 2: each file's SHA-256 matches the one in the post office's code (PO-13). */
  checksums(ctx: StepContext): Promise<StepOutcome>;
  /** Step 3: Linux subreaper mark; macOS lookups, structure sizes and audit token; Windows FullLanguage mode. */
  mode(ctx: StepContext): Promise<StepOutcome>;
  /** PO-11's listing of the tree under `rootPid`; on macOS also whether the coalition is new (PO-18). */
  listTree(ctx: StepContext, rootPid: number): Promise<{ pids: number[]; newCoalition?: boolean }>;
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
  /** Starts a CLI in containment; by default the one PO-12's table names for this system. */
  spawn?: (options: ManagedProcessOptions) => Promise<ManagedProcess>;
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
  | { ok: true; line: string }
  | { ok: false; step: StepName; failure: Failure; message: string };

const TIMEOUT_MS = 10_000;
const LONGEST_STEP_MS = 5_000;

const versionParts = (version: string) => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
function compareVersions(a: string, b: string): number {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

const SYSTEM_NAMES: Record<string, string> = { darwin: "macOS", linux: "Linux", win32: "Windows" };
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

  const controller = new AbortController();
  const killers: (() => void | Promise<void>)[] = [];
  const ctx: StepContext = { signal: controller.signal, killOnFail: (kill) => { killers.push(kill); }, after };
  const steps = options.systems[`${platform}-${arch}`];
  const need = (step: string): Failure => ({ cause: "not-built", step });
  const runners: Record<StepName, () => Promise<StepOutcome>> = {
    async helper() {
      try { (options.dispatch ?? containmentFor)(platform, arch); } catch { return fail({ cause: "no-helper" }); }
      return steps ? steps.helper(ctx) : fail(need("helper"));
    },
    checksums: async () => (steps ? steps.checksums(ctx) : fail(need("checksums"))),
    mode: async () => (steps ? steps.mode(ctx) : fail(need("mode"))),
    probe: async () => fail(need("probe")), // M1b-20 part 2 starts the probe here
  };

  let current: StepName = STEPS[0];
  let timedOut!: () => void;
  const deadline = new Promise<"timeout">((done) => { timedOut = () => done("timeout"); });
  after(options.timeoutMs ?? TIMEOUT_MS, timedOut);
  let result: { step: StepName; failure: Failure } | undefined;
  try {
    for (const step of STEPS) {
      current = step;
      const run = runners[step]().catch((error: unknown): StepOutcome => (
        controller.signal.aborted ? PASS
          : fail({ cause: "helper-failed", detail: `the ${step} step failed: ${error instanceof Error ? error.message : String(error)}` })));
      const outcome = await Promise.race([run, deadline]);
      if (outcome === "timeout") { result = { step, failure: { cause: "timeout", step } }; break; }
      if (!outcome.ok) { result = { step, failure: outcome.failure }; break; }
    }
  } finally {
    stopTicking();
  }
  if (!result) {
    const line = `Containment check passed on ${where.system} ${where.version} (${arch}) in ${((clock.now() - startedAt) / 1000).toFixed(1)} s: ${STEPS.join(", ")}.`;
    log(line);
    return { ok: true, line };
  }
  controller.abort();
  await Promise.allSettled(killers.map(async (kill) => kill()));
  const message = failureMessage(result.failure, where);
  log(message);
  return { ok: false, step: current, failure: result.failure, message };
}
