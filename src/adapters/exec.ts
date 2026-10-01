import { execa } from "execa";

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
