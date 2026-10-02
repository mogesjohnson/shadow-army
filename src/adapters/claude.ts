import type { Adapter, RunRequest } from "./Adapter.js";
import { detectByVersion, finishRun, runCli } from "./exec.js";
import { parseClaudeRun } from "./runParsers.js";

/** Claude Code has no model-list command; it accepts these aliases or full model IDs. */
const ALIASES = [
  { id: "opus", label: "Opus 5.5" },
  { id: "sonnet", label: "Sonnet 5.5" },
  { id: "haiku", label: "Haiku 4.5" },
];

/** Claude Code's permission mode for each autonomy level. */
export function claudePermissionMode(req: RunRequest): string {
  switch (req.autonomy ?? "supervised") {
    case "full":
      return "bypassPermissions";
    case "auto":
      return "auto"; // Claude Code's own classifier decides each action
    default:
      return req.write ? "acceptEdits" : "plan";
  }
}

/** `-p` with no prompt argument: the brief goes in on stdin, never on the command line. */
export function claudeArgs(req: RunRequest): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    req.model,
    "--no-session-persistence",
    "--permission-mode",
    claudePermissionMode(req),
  ];
  if (req.effort) args.push("--effort", req.effort);
  return args;
}

export const claudeAdapter: Adapter = {
  id: "claude",
  label: "Claude Code",
  command: "claude",
  capabilities: { write: true, review: true },
  detect: () => detectByVersion("claude"),
  async listModels() {
    return { source: "static", models: ALIASES };
  },
  async run(req) {
    const r = await runCli("claude", claudeArgs(req), { cwd: req.cwd, timeoutMs: req.timeoutMs, input: req.prompt });
    return finishRun(r, "claude", req.timeoutMs, parseClaudeRun);
  },
};
