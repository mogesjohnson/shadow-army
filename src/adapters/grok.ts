import type { Adapter, RunRequest } from "./Adapter.js";
import { capture, detectByVersion, finishRun, runCli } from "./exec.js";
import { parseGrokModels } from "./parsers.js";
import { parseGrokRun } from "./runParsers.js";

export function grokArgs(req: RunRequest): string[] {
  const args = [
    "-p",
    req.prompt,
    "--output-format",
    "json",
    "-m",
    req.model,
    "--permission-mode",
    req.write ? "acceptEdits" : "plan",
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
    const r = await runCli("grok", grokArgs(req), { cwd: req.cwd, timeoutMs: req.timeoutMs });
    return finishRun(r, "grok", req.timeoutMs, parseGrokRun);
  },
};
