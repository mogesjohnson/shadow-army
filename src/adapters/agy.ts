import type { Adapter, RunRequest } from "./Adapter.js";
import { capture, detectByVersion, finishRun, runCli } from "./exec.js";
import { parseAgyModels } from "./parsers.js";
import { parseAgyRun } from "./runParsers.js";

/** Hard rule: agy is research and testing only, so it always runs in plan mode regardless of req.write. */
export function agyArgs(req: RunRequest): string[] {
  const args = ["-p", req.prompt, "--output-format", "json", "--mode", "plan", "--model", req.model];
  if (req.effort) args.push("--effort", req.effort);
  return args;
}

export const agyAdapter: Adapter = {
  id: "agy",
  label: "Antigravity",
  command: "agy",
  // Hard rule from orchestratorDelegate.md: research and testing only, no writes.
  capabilities: { write: false, review: false },
  detect: () => detectByVersion("agy"),
  async listModels() {
    const r = await capture("agy", ["models"]);
    return { source: "cli", models: r.ok ? parseAgyModels(r.stdout) : [] };
  },
  async run(req) {
    const r = await runCli("agy", agyArgs(req), { cwd: req.cwd, timeoutMs: req.timeoutMs });
    return finishRun(r, "agy", req.timeoutMs, parseAgyRun);
  },
};
