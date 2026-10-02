import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import type { Roster } from "../core/roster.js";
import { GitError } from "../workspace/git.js";
import { MonarchError, runGoal, type PlannedRun } from "./monarch.js";
import { DEFAULT_MAX_TASKS } from "./plan.js";
import { renderEvent, renderPlan, renderResult } from "./render.js";

interface RunCliOptions {
  cwd: string;
  yes?: boolean;
  planOnly?: boolean;
  parallel: string;
  maxTasks: string;
  monarch?: string;
  timeout: string;
  wait: string;
  acceptNotes?: boolean;
  keepWorktrees?: boolean;
  vault: boolean;
  json?: boolean;
}

const positive = (v: string, name: string, allowZero = false): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error(`${name} must be a ${allowZero ? "non-negative" : "positive"} number`);
  return n;
};

/** Ask once, on the terminal. Without a terminal there is nobody to ask, so the run needs --yes. */
async function askToRun(planned: PlannedRun, opts: RunCliOptions): Promise<boolean> {
  if (opts.yes) return true;
  if (!process.stdin.isTTY) {
    console.error("Not run: there is no terminal to confirm the plan on. Re-run with --yes to approve it.");
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`\nRun these ${planned.checked.order.length} tasks? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export function registerRunCommand(program: Command, loadRoster: () => Roster | undefined): void {
  program
    .command("run <goal...>")
    .description("the Monarch plans the goal, soldiers carry it out, and the work lands on one branch")
    .option("--cwd <dir>", "a directory inside the repository", process.cwd())
    .option("-y, --yes", "run the plan without asking")
    .option("--plan-only", "show the plan and stop")
    .option("--parallel <n>", "tasks at once", "2")
    .option("--max-tasks <n>", "the most tasks a plan may have", String(DEFAULT_MAX_TASKS))
    .option("--monarch <soldier>", "who plans (default: the configured Monarch, then its fallback)")
    .option("--timeout <seconds>", "per task", "900")
    .option("--wait <seconds>", "how long a task queues for files another process holds", "120")
    .option("--accept-notes", "apply the Monarch's accept/reject decisions to this run's proposed vault notes")
    .option("--keep-worktrees", "keep the worktrees after the run (branches are always kept)")
    .option("--no-vault", "do not read from or record into the Shadow Vault")
    .option("--json", "print the whole result as JSON")
    .action(async (goalWords: string[], opts: RunCliOptions) => {
      const roster = loadRoster();
      if (!roster) return;
      let parallel: number, maxTasks: number, taskTimeoutMs: number, waitMs: number;
      try {
        parallel = positive(opts.parallel, "--parallel");
        maxTasks = positive(opts.maxTasks, "--max-tasks");
        taskTimeoutMs = positive(opts.timeout, "--timeout") * 1000;
        waitMs = positive(opts.wait, "--wait", true) * 1000;
      } catch (e) {
        console.error(`error: ${(e as Error).message}`);
        process.exitCode = 2;
        return;
      }
      const log = (line: string) => (opts.json ? console.error(line) : console.log(line));
      try {
        const result = await runGoal({
          goal: goalWords.join(" "),
          cwd: opts.cwd,
          roster,
          monarch: opts.monarch,
          maxTasks,
          parallel,
          taskTimeoutMs,
          waitMs,
          planOnly: opts.planOnly,
          acceptNotes: opts.acceptNotes,
          keepWorktrees: opts.keepWorktrees,
          useVault: opts.vault,
          onEvent: (e) => log(renderEvent(e)),
          confirm: async (planned) => {
            log(`\n${renderPlan(planned)}`);
            return askToRun(planned, opts);
          },
        });
        if (result.status === "planned") log(`\n${renderPlan({ monarch: result.monarch, checked: { plan: result.plan, order: result.order }, assignments: new Map(result.assignments.map((a) => [a.taskId, a])), rejected: result.rejected })}`);
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else console.log(`\n${renderResult(result)}`);
        if (result.status === "declined") process.exitCode = 2;
        if (result.outcomes.some((o) => o.status !== "ok")) process.exitCode = 1;
      } catch (e) {
        if (e instanceof MonarchError || e instanceof GitError) {
          console.error(`error: ${e.message}`);
          process.exitCode = 2;
          return;
        }
        throw e;
      }
    });
}
