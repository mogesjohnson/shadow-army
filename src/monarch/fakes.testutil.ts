import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Adapter, RunRequest, RunResult } from "../adapters/Adapter.js";
import { getAdapter as realAdapter } from "../adapters/registry.js";
import type { Roster } from "../core/roster.js";
import { summon } from "../core/summon.js";
import type { Vault } from "../vault/vault.js";
import type { Dispatch } from "./schedule.js";

export const planReply = (tasks: unknown[], summary = "the plan") => "My plan.\n```shadow-plan\n" + JSON.stringify({ summary, tasks }) + "\n```";
export const synthesisReply = (obj: unknown) => "Done.\n```shadow-synthesis\n" + JSON.stringify(obj) + "\n```";

/**
 * Fake CLIs with the real adapters' capabilities (so the hard rules are the real ones). Monarch calls
 * are answered from a script; a CLI listed in `failing` returns an error instead. Each call records the
 * effort it was asked for, and reports `usage` when the script gives one.
 */
export function monarchScript(script: { plans: string[]; synthesis?: string; failing?: string[]; usage?: RunResult["usage"] }) {
  const prompts: { cli: string; prompt: string; cwd: string; effort?: string }[] = [];
  let planIndex = 0;
  const getAdapter = (cli: string): Adapter | undefined => {
    const real = realAdapter(cli);
    if (!real) return undefined;
    return {
      ...real,
      detect: async () => ({ found: true }),
      async run(req: RunRequest): Promise<RunResult> {
        prompts.push({ cli, prompt: req.prompt, cwd: req.cwd, effort: req.effort });
        if (script.failing?.includes(cli)) return { text: "", isError: true, errorMessage: `${cli} is down` };
        if (req.prompt.includes("Your soldiers have finished")) return { text: script.synthesis ?? "no block", isError: false, usage: script.usage };
        return { text: script.plans[Math.min(planIndex++, script.plans.length - 1)]!, isError: false, usage: script.usage };
      },
    };
  };
  return { getAdapter, prompts };
}

/**
 * A fake soldier for tests, driven by its brief: `write path=content;` writes a file, `fail` fails,
 * `read path` reports the file's content, `slow` waits a little, `note:<text>` proposes a vault note.
 * It records what each run saw and how many ran at once. Test use only.
 */
export function fakeArmy(roster: Roster, vault?: Vault, guardRoot?: string) {
  let active = 0;
  let maxActive = 0;
  const seen: { brief: string; cwd: string; context: string; effort?: string }[] = [];
  const adapter: Adapter = {
    id: "fake",
    label: "Fake",
    command: "fake",
    capabilities: { write: true, review: true },
    detect: async () => ({ found: true }),
    listModels: async () => ({ source: "cli", models: [] }),
    async run(req: RunRequest): Promise<RunResult> {
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        const task = /TASK:\n([\s\S]*?)\n\n/.exec(req.prompt + "\n\n")?.[1] ?? "";
        const context = /REPORTED[^\n]*\n([\s\S]*?)(\n\n|$)/.exec(req.prompt)?.[1] ?? "";
        seen.push({ brief: task, cwd: req.cwd, context, effort: req.effort });
        if (task.includes("slow")) await new Promise((r) => setTimeout(r, 400));
        if (task.includes("fail")) return { text: "", isError: true, errorMessage: "it broke" };
        for (const m of task.matchAll(/write ([^=\s]+)=([^;\n]*)/g)) {
          mkdirSync(dirname(join(req.cwd, m[1]!)), { recursive: true });
          writeFileSync(join(req.cwd, m[1]!), m[2]! + "\n");
        }
        let summary = "done";
        const read = /read (\S+)/.exec(task);
        if (read) {
          const p = join(req.cwd, read[1]!);
          summary = existsSync(p) ? `saw ${read[1]}: ${readFileSync(p, "utf8").trim()}` : `no ${read[1]}`;
        }
        const notes = [...task.matchAll(/note:([^;\n]+)/g)].map((m) => m[1]!.trim());
        return { text: "```shadow-report\n" + JSON.stringify({ summary, notes }) + "\n```", isError: false, costUsd: 0.01 };
      } finally {
        active--;
      }
    },
  };
  const dispatch: Dispatch = (task, a, ctx) =>
    summon({
      roster,
      soldier: a.soldier,
      task: task.brief,
      role: task.role,
      cwd: ctx.cwd,
      write: task.role === "build",
      claims: task.role === "build" ? task.claims : undefined,
      baseRef: ctx.baseRef,
      context: ctx.context,
      isolated: task.role !== "build",
      effort: a.effort,
      guardRoot,
      adapter,
      vault,
    });
  return { dispatch, seen, maxActive: () => maxActive };
}
