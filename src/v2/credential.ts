import { readFile } from "node:fs/promises";
import type { Interface } from "node:readline";
import type { LeaseOptions } from "./lease.js";

/** PO-3: the Monarch's secret comes in on standard input only, as one line of JSON, and is never echoed back. */
export interface Bootstrap { credential: string; lease?: LeaseOptions; starter?: number }

const MAX_LINE = 512;
const BOOTSTRAP_WAIT_MS = 10_000;
const REFUSAL_WINDOW_MS = 60_000;

/** The one error for every bad bootstrap: it never carries the line, so a parse error cannot leak the secret. */
const invalid = () => new Error("invalid credential bootstrap");

/** At most the last four characters of a secret may be shown (PO-3). */
export function maskCredential(secret: string): string {
  return `…${secret.slice(-4)}`;
}

/** Reads the bootstrap line the mod writes once to the post office's standard input, then checks it. */
export async function readBootstrap(input: Interface, waitMs = BOOTSTRAP_WAIT_MS): Promise<Bootstrap> {
  const line = await new Promise<string>((done, fail) => {
    const timer = setTimeout(() => fail(new Error("post office requires its credential on stdin")), waitMs);
    input.once("line", (text) => { clearTimeout(timer); text.length <= MAX_LINE ? done(text) : fail(invalid()); });
    input.once("close", () => { clearTimeout(timer); fail(new Error("caller ended before post office bootstrap")); });
  });
  let parsed: unknown;
  try { parsed = JSON.parse(line); } catch { throw invalid(); }
  if (!parsed || typeof parsed !== "object") throw invalid();
  const { credential, lease, starter } = parsed as { credential?: unknown; lease?: unknown; starter?: unknown };
  if (typeof credential !== "string" || !/^[a-f0-9]{64}$/i.test(credential)) throw invalid();
  // `starter` is Claude Code's own pid (PO-1, PO-7), so a relay reloaded under the same Claude Code is the same starter.
  if (starter !== undefined && !(typeof starter === "number" && Number.isSafeInteger(starter) && starter > 0)) throw invalid();
  const boot: Bootstrap = starter === undefined ? { credential } : { credential, starter };
  if (lease === undefined) return boot;
  if (!lease || typeof lease !== "object" || typeof (lease as LeaseOptions).session !== "string") throw invalid();
  return { ...boot, lease: { session: (lease as LeaseOptions).session } };
}

/**
 * PO-3's `memory protection:` line, taken before the secret is read. Linux reads Yama's `ptrace_scope`,
 * macOS checks nothing. Windows's DACL waits for PO-19's script (M1b-17), so it says it has none.
 */
export async function memoryProtection(platform: NodeJS.Platform = process.platform, read: (path: string) => Promise<string> = (path) => readFile(path, "utf8")): Promise<string> {
  if (platform === "darwin") return "memory protection: not checked";
  if (platform === "win32") return "memory protection: none · process DACL not set (PO-19's script is not wired yet)";
  let text: string;
  try { text = await read("/proc/sys/kernel/yama/ptrace_scope"); } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "memory protection: none · no Yama" : "memory protection: none · ptrace_scope unreadable";
  }
  const scope = Number(text.trim());
  if (!Number.isInteger(scope) || scope < 0 || scope > 3) return "memory protection: none · ptrace_scope unreadable";
  return scope === 0 ? "memory protection: none · ptrace_scope 0" : `memory protection: Yama ptrace_scope ${scope}`;
}

/** Injected so tests run on a fake clock: schedules `fn` after `ms` of monotonic time and returns its cancel. */
export type After = (fn: () => void, ms: number) => () => void;

const realAfter: After = (fn, ms) => {
  const timer = setTimeout(fn, ms);
  timer.unref?.();
  return () => clearTimeout(timer);
};

/**
 * PO-3's refusal reports: the first refusal in full, then at most one report a minute with the count since
 * the last one. Refusals not yet reported are reported when their minute ends. A minute with none ends the window.
 */
export class RefusalReporter {
  private pending = 0;
  private cancel?: () => void;

  constructor(private readonly report: (count: number, first: boolean) => void, private readonly after: After = realAfter) {}

  refuse(): void {
    if (this.cancel) { this.pending++; return; }
    this.report(1, true);
    this.arm();
  }

  /**
   * Stops the timer at shutdown without an early report: PO-3 allows one count a minute, at the minute's end,
   * so refusals in a minute cut short by shutdown go unreported (a shutdown summary needs a spec decision).
   */
  stop(): void {
    this.cancel?.();
    this.cancel = undefined;
    this.pending = 0;
  }

  private arm(): void {
    this.cancel = this.after(() => {
      const count = this.pending;
      this.pending = 0;
      if (count) { this.report(count, false); this.arm(); } else this.cancel = undefined;
    }, REFUSAL_WINDOW_MS);
  }
}
