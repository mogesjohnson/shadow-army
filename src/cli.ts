#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command, Option } from "commander";
import React from "react";
import { openChat } from "./chat/open.js";
import { closestName } from "./core/closest.js";
import { WorkingLine, type Working } from "./ui/Dashboard.js";
import { liveScreensFor, startLive } from "./ui/live.js";
import { plainBanner } from "./ui/art.js";
import { ConfigError } from "./core/config.js";
import { DelegateError } from "./core/delegate.js";
import { loadRoster, RosterError, type Roster } from "./core/roster.js";
import { checkArmy, renderArmy } from "./core/army.js";
import { defaultRole } from "./core/assign.js";
import { renderRoute, route, type TaskProfile } from "./core/router.js";
import { summon, renderReport, SummonError } from "./core/summon.js";
import { Vault } from "./vault/vault.js";
import { applyToCheckout, renderApply } from "./workspace/apply.js";
import { repoRoot } from "./workspace/git.js";
import { registerVaultCommands } from "./vault/cli.js";
import { registerWorkspaceCommands } from "./workspace/cli.js";
import { registerRunCommand } from "./monarch/cli.js";
import { getAdapter } from "./adapters/registry.js";
import type { Effort, Role } from "./adapters/Adapter.js";
import { registerLiveCommand } from "./v2/cli.js";

/** Load config + delegate; a bad file is a clean one-screen error, not a stack trace. */
function rosterOrExit(): Roster | undefined {
  try {
    return loadRoster();
  } catch (e) {
    if (e instanceof ConfigError || e instanceof DelegateError || e instanceof RosterError) {
      console.error(`error: ${e.message}`);
      process.exitCode = 2;
      return undefined;
    }
    throw e;
  }
}

interface SummonCliOptions {
  role?: string;
  cwd: string;
  write?: boolean;
  claim: string[];
  wait: string;
  effort?: string;
  timeout: string;
  vault: boolean;
  apply: boolean;
  json?: boolean;
}

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const program = new Command();

program
  .name("sa")
  .description("Shadow Army: command other AI CLIs as an army with isolated context")
  .version(pkg.version)
  .configureHelp({ showGlobalOptions: true })
  .option("--plain", "plain text output, no banner art or live screens (automatic when not a TTY)")
  // The banner is the root command's action, so commander would report a mistyped command as
  // "too many arguments". Accept the extra word here and report it as the unknown command it is.
  .allowExcessArguments(true)
  .action(async (opts: { plain?: boolean }, cmd: Command) => {
    if (cmd.args.length) {
      const hint = closestName(cmd.args[0]!, cmd.commands.map((c) => c.name()));
      cmd.error(`error: unknown command '${cmd.args[0]}'${hint ? ` (Did you mean ${hint}?)` : ""}\nRun "sa --help" to see the commands.`);
    }
    // The chat needs a terminal both ways: one to draw on and one to read keys from.
    if (opts.plain || !process.stdout.isTTY || !process.stdin.isTTY) {
      console.log(plainBanner(pkg.version));
      return;
    }
    const roster = rosterOrExit();
    if (!roster) return;
    await openChat({ version: pkg.version, roster, cwd: process.cwd() });
  });

program
  .command("army")
  .description("detect each soldier's CLI, show its version, and verify its configured model")
  .option("--json", "machine-readable output")
  .action(async (opts: { json?: boolean }) => {
    const roster = rosterOrExit();
    if (!roster) return;
    const rows = await checkArmy(roster);
    if (opts.json) {
      console.log(JSON.stringify(rows, null, 2));
    } else {
      console.log(renderArmy(rows));
    }
    // A missing CLI or a model the CLI does not list is a real problem worth a non-zero exit.
    if (rows.some((r) => !r.found || r.modelStatus === "unknown")) process.exitCode = 1;
  });

program
  .command("summon <soldier> <task...>")
  .description("send one brief to one soldier and print its report")
  .addOption(
    new Option("--role <role>", "default: the soldier's first non-orchestrate role").choices([
      "build",
      "review",
      "research",
      "test",
    ]),
  )
  .option("--cwd <dir>", "directory the soldier works in", process.cwd())
  .option("--write", "let the soldier modify files, in its own worktree and branch (build role only)")
  .option(
    "--claim <path-or-glob>",
    "a file, directory or glob the writing soldier may change, relative to the repo root (repeatable; required with --write)",
    (value: string, previous: string[]) => [...previous, value],
    [] as string[],
  )
  .option("--wait <seconds>", "with --write, queue this long for another soldier's lease on the same files", "0")
  .addOption(new Option("--effort <level>", "reasoning effort").choices(["low", "medium", "high", "max"]))
  .option("--timeout <seconds>", "give up after this many seconds", "600")
  .option("--no-vault", "do not read from or write to the Shadow Vault")
  .option("--no-apply", "with --write, leave the work only on its branch instead of applying it to your folder as uncommitted edits")
  .option("--json", "machine-readable report")
  .action(async (soldier: string, task: string[], opts: SummonCliOptions, cmd: Command) => {
    const timeoutMs = Number(opts.timeout) * 1000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      console.error("error: --timeout must be a positive number of seconds");
      process.exitCode = 2;
      return;
    }
    const waitMs = Number(opts.wait) * 1000;
    if (!Number.isFinite(waitMs) || waitMs < 0) {
      console.error("error: --wait must be zero or a positive number of seconds");
      process.exitCode = 2;
      return;
    }
    if (opts.claim.length && !opts.write) {
      console.error("error: --claim only applies to --write runs");
      process.exitCode = 2;
      return;
    }
    const roster = rosterOrExit();
    if (!roster) return;
    // One live line while the soldier works.
    const spec = roster.soldiers.get(soldier);
    const role = (opts.role as Role | undefined) ?? (spec ? defaultRole(spec) : undefined);
    const working: Working = { label: `${soldier}${role ? ` [${role}]` : ""} is working`, startedAt: Date.now() };
    const live = liveScreensFor(process.stdout, { plain: cmd.optsWithGlobals<{ plain?: boolean }>().plain, json: opts.json })
      ? startLive(working, (w, now, tick) => React.createElement(WorkingLine, { work: w, now, tick }))
      : undefined;
    let done: Working["done"] = "error";
    try {
      const report = await summon({
        roster,
        soldier,
        task: task.join(" "),
        role,
        cwd: opts.cwd,
        write: opts.write,
        claims: opts.claim,
        waitMs,
        effort: opts.effort as Effort | undefined,
        timeoutMs,
        vault: opts.vault ? Vault.forCwd(opts.cwd) : undefined,
      });
      if (report.status !== "error") done = "ok";
      await live?.stop({ ...working, done });
      // A good write run's changes go into the folder as uncommitted edits; its branch stays.
      const w = report.workspace;
      const applied =
        opts.apply && report.status === "ok" && w?.commit ? await applyToCheckout(await repoRoot(opts.cwd), w.base, w.branch) : undefined;
      if (opts.json) {
        console.log(JSON.stringify(applied ? { ...report, applied } : report, null, 2));
      } else {
        console.log(renderReport(report));
        if (applied && w) console.log(`\n${renderApply(applied, w.branch)}`);
      }
      if (report.status === "error") process.exitCode = 1;
    } catch (e) {
      await live?.stop({ ...working, done });
      if (e instanceof SummonError) {
        console.error(`refused: ${e.message}`);
        process.exitCode = 2;
        return;
      }
      throw e;
    }
  });

program
  .command("route")
  .description("preview who may take a task and in what order (no soldier is run)")
  .addOption(
    new Option("--role <role>", "the kind of task")
      .choices(["build", "review", "research", "test", "orchestrate"])
      .makeOptionMandatory(),
  )
  .option("--hard", "treat a build task as hard")
  .option("--write", "the task needs write access (default: only for build)")
  .option("--author <soldier>", "who wrote the change under review; they never review their own work")
  .option("--json", "machine-readable output")
  .action((opts: { role: string; hard?: boolean; write?: boolean; author?: string; json?: boolean }) => {
    const roster = rosterOrExit();
    if (!roster) return;
    if (opts.author && !roster.soldiers.has(opts.author)) {
      console.error(`error: unknown soldier "${opts.author}" (known: ${[...roster.soldiers.keys()].join(", ")})`);
      process.exitCode = 2;
      return;
    }
    const profile: TaskProfile = {
      role: opts.role as Role,
      difficulty: opts.hard ? "hard" : "routine",
      write: opts.write,
      author: opts.author,
    };
    const result = route(roster, getAdapter, profile);
    console.log(opts.json ? JSON.stringify({ profile, ...result }, null, 2) : renderRoute(profile, result));
    if (!result.candidates.length) process.exitCode = 1;
  });

registerVaultCommands(program);
registerWorkspaceCommands(program);
registerRunCommand(program, rosterOrExit);
registerLiveCommand(program);

await program.parseAsync(process.argv);
