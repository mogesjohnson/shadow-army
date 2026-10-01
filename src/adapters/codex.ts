import type { Adapter, RunRequest } from "./Adapter.js";
import { capture, detectByVersion, finishRun, runCli } from "./exec.js";
import { parseCodexModels } from "./parsers.js";
import { parseCodexRun } from "./runParsers.js";

export function codexArgs(req: RunRequest): string[] {
  const args = [
    "exec",
    "--json",
    "-m",
    req.model,
    "-s",
    req.write ? "workspace-write" : "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "-C",
    req.cwd,
  ];
  if (req.effort) args.push("-c", `model_reasoning_effort="${req.effort === "max" ? "xhigh" : req.effort}"`);
  args.push(req.prompt);
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
    const r = await runCli("codex", codexArgs(req), { cwd: req.cwd, timeoutMs: req.timeoutMs });
    return finishRun(r, "codex", req.timeoutMs, parseCodexRun);
  },
};
