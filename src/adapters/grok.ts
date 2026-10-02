import type { Adapter, RunRequest } from "./Adapter.js";
import { capture, detectByVersion, finishRun, runCli, withPromptFile } from "./exec.js";
import { parseGrokModels } from "./parsers.js";
import { parseGrokRun } from "./runParsers.js";

/** Grok's permission flags for each autonomy level; `full` is its always-approve mode. */
export function grokAccess(req: RunRequest): string[] {
  switch (req.autonomy ?? "supervised") {
    case "full":
      return ["--always-approve"];
    case "auto":
      return ["--permission-mode", "auto"];
    default:
      return ["--permission-mode", req.write ? "acceptEdits" : "plan"];
  }
}

/** The brief is read from `promptFile` (`--prompt-file`), never passed on the command line. */
export function grokArgs(req: RunRequest, promptFile: string): string[] {
  const args = [
    "--prompt-file",
    promptFile,
    "--output-format",
    "json",
    "-m",
    req.model,
    ...grokAccess(req),
    "--cwd",
    req.cwd,
  ];
  if (req.effort) args.push("--reasoning-effort", req.effort);
  return args;
}

export const grokAdapter: Adapter = {
  id: "grok",
  label: "Grok Build",
  command: "grok",
  // Hard rule from orchestratorDelegate.md: Grok never reviews.
  capabilities: { write: true, review: false },
  detect: () => detectByVersion("grok"),
  async listModels() {
    const r = await capture("grok", ["models"]);
    return { source: "cli", models: r.ok ? parseGrokModels(r.stdout) : [] };
  },
  async run(req) {
    const r = await withPromptFile(req.prompt, (file) =>
      runCli("grok", grokArgs(req, file), { cwd: req.cwd, timeoutMs: req.timeoutMs }),
    );
    return finishRun(r, "grok", req.timeoutMs, parseGrokRun);
  },
};
