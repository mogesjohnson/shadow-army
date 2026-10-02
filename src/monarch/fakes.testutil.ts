import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Adapter, RunRequest, RunResult } from "../adapters/Adapter.js";
import type { Roster } from "../core/roster.js";
import { summon } from "../core/summon.js";
import type { Vault } from "../vault/vault.js";
import type { Dispatch } from "./schedule.js";

/**
 * A fake soldier for tests, driven by its brief: `write path=content;` writes a file, `fail` fails,
 * `read path` reports the file's content, `slow` waits a little, `note:<text>` proposes a vault note.
 * It records what each run saw and how many ran at once. Test use only.
 */
export function fakeArmy(roster: Roster, vault?: Vault, guardRoot?: string) {
  let active = 0;
  let maxActive = 0;
  const seen: { brief: string; cwd: string; context: string }[] = [];
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
        seen.push({ brief: task, cwd: req.cwd, context });
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
      guardRoot,
      adapter,
      vault,
    });
  return { dispatch, seen, maxActive: () => maxActive };
}
