import type { Adapter, RunRequest } from "./Adapter.js";
import { capture, detectByVersion, finishRun, runCli } from "./exec.js";
import { parseCodexModels } from "./parsers.js";
import { parseCodexRun } from "./runParsers.js";

/**
 * Codex's sandbox and approvals for each autonomy level: supervised keeps the read-only or
 * workspace-write sandbox; auto adds Codex's own automatic review of approval requests; full is Codex's
 * "full access" (no sandbox, never asks).
 */
export function codexAccess(req: RunRequest): string[] {
  switch (req.autonomy ?? "supervised") {
    case "full":
      return ["-s", "danger-full-access", "-c", 'approval_policy="never"'];
    case "auto":
      return ["-s", "workspace-write", "--approve-for-me"];
    default:
      return ["-s", req.write ? "workspace-write" : "read-only"];
  }
}

/** The final `-` makes `codex exec` read the brief from stdin, so it is never on the command line. */
export function codexArgs(req: RunRequest): string[] {
  const args = [
    "exec",
    "--json",
    "-m",
    req.model,
    ...codexAccess(req),
    "--skip-git-repo-check",
    "--ephemeral",
    "-C",
    req.cwd,
  ];
  if (req.effort) args.push("-c", `model_reasoning_effort="${req.effort === "max" ? "xhigh" : req.effort}"`);
  args.push("-");
  return args;
}

export const codexAdapter: Adapter = {
  id: "codex",
  label: "Codex CLI",
  command: "codex",
  capabilities: { write: true, review: true },
  detect: () => detectByVersion("codex"),
  async listModels() {
    const r = await capture("codex", ["debug", "models"]);
    return { source: "cli", models: r.ok ? parseCodexModels(r.stdout) : [] };
  },
  async run(req) {
    const r = await runCli("codex", codexArgs(req), { cwd: req.cwd, timeoutMs: req.timeoutMs, input: req.prompt });
    return finishRun(r, "codex", req.timeoutMs, parseCodexRun);
  },
};
