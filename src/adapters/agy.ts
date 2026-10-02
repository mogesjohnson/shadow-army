import type { Adapter, RunRequest } from "./Adapter.js";
import { capture, detectByVersion, finishRun, runCli } from "./exec.js";
import { parseAgyModels } from "./parsers.js";
import { parseAgyRun } from "./runParsers.js";

/**
 * agy's permission flags. It has no classifier mode, so `auto` stays supervised (plan mode); `full` is
 * its skip-permissions mode. agy never gets a write task (a hard rule), so under `full` Shadow Army runs
 * it in a throwaway copy and anything it writes is discarded.
 */
export function agyAccess(req: RunRequest): string[] {
  return req.autonomy === "full" ? ["--dangerously-skip-permissions"] : ["--mode", "plan"];
}

/**
 * Unlike the other adapters, the brief is passed as an argument: agy only accepts a prompt as the value
 * of `-p` (it does not read one from stdin). That is safe because agy ships as a native executable, not
 * a Windows `.cmd` shim, which is what cannot take a multi-line argument. The `-p=` form keeps a brief
 * that starts with `-` from being read as a flag.
 */
export function agyArgs(req: RunRequest): string[] {
  const args = [`-p=${req.prompt}`, "--output-format", "json", ...agyAccess(req), "--model", req.model];
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
