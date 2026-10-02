import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import type { RunResult } from "./Adapter.js";

export interface CaptureResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Run a command to completion without a shell; never throws. */
export async function capture(
  command: string,
  args: string[],
  timeoutMs = 20_000,
): Promise<CaptureResult> {
  try {
    const r = await execa(command, args, {
      timeout: timeoutMs,
      reject: false,
      stdin: "ignore",
      windowsHide: true,
    });
    return {
      ok: !r.failed && r.exitCode === 0,
      stdout: String(r.stdout ?? ""),
      stderr: String(r.stderr ?? ""),
    };
  } catch {
    return { ok: false, stdout: "", stderr: "" };
  }
}

export interface CliRun {
  exitCode: number | undefined;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** The process could not be started at all (e.g. not on PATH). */
  spawnFailed: boolean;
}

/**
 * Run a soldier CLI in `cwd` with a hard timeout. `input`, when given, is written to the CLI's stdin
 * and stdin is then closed; otherwise stdin is closed at once so no CLI waits for input.
 *
 * Send briefs through `input` (or a file), not as an argument: on Windows a CLI installed as a `.cmd`
 * shim (npm's way) cannot be given an argument that contains a line break, and every brief has one.
 */
export async function runCli(
  command: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; input?: string },
): Promise<CliRun> {
  try {
    const r = await execa(command, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs,
      reject: false,
      ...(opts.input === undefined ? { stdin: "ignore" as const } : { input: opts.input }),
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024,
    });
    return {
      exitCode: r.exitCode,
      stdout: String(r.stdout ?? ""),
      stderr: String(r.stderr ?? ""),
      timedOut: r.timedOut === true,
      spawnFailed: false,
    };
  } catch (e) {
    return { exitCode: undefined, stdout: "", stderr: String(e), timedOut: false, spawnFailed: true };
  }
}

/**
 * Write `text` to a private temporary file for the duration of `fn`, then delete it, even if `fn` throws.
 * For CLIs that read their prompt from a file.
 */
export async function withPromptFile<T>(text: string, fn: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "shadow-prompt-"));
  const path = join(dir, "prompt.txt");
  try {
    await writeFile(path, text, "utf8");
    return await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Common failure shapes shared by every adapter's run(). */
export function failureFor(r: CliRun, command: string, timeoutMs: number): string | undefined {
  if (r.spawnFailed) return `could not start "${command}": ${r.stderr}`;
  if (r.timedOut) return `${command} timed out after ${Math.round(timeoutMs / 1000)}s`;
  return undefined;
}

/** Turn a finished process into a RunResult: spawn/timeout/exit-code failures win over parsing. */
export function finishRun(
  r: CliRun,
  command: string,
  timeoutMs: number,
  parse: (stdout: string) => RunResult,
): RunResult {
  const failure = failureFor(r, command, timeoutMs);
  if (failure) return { text: "", isError: true, errorMessage: failure };
  const parsed = parse(r.stdout);
  if (r.exitCode !== 0 && !parsed.isError) {
    const tail = r.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0];
    return { ...parsed, isError: true, errorMessage: `${command} exited with code ${r.exitCode}${tail ? `: ${tail}` : ""}` };
  }
  return parsed;
}

/** Parse the JSON object in CLI output, tolerating banner or log lines around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error("no JSON object in output");
  return JSON.parse(text.slice(start, end + 1));
}

export async function detectByVersion(
  command: string,
  versionArgs: string[] = ["--version"],
): Promise<{ found: boolean; version?: string }> {
  const r = await capture(command, versionArgs, 10_000);
  if (!r.ok && !r.stdout && !r.stderr) return { found: false };
  const text = (r.stdout || r.stderr).split(/\r?\n/).find((l) => l.trim()) ?? "";
  const match = text.match(/\d+\.\d+\.\d+/);
  return { found: r.ok, version: match?.[0] ?? (text.trim() || undefined) };
}
