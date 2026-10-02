#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command, Option } from "commander";
import React from "react";
import { render } from "ink";
import { Banner } from "./ui/Banner.js";
import { plainBanner } from "./ui/art.js";
import { ConfigError } from "./core/config.js";
import { DelegateError } from "./core/delegate.js";
import { loadRoster, RosterError, type Roster } from "./core/roster.js";
import { checkArmy, renderArmy } from "./core/army.js";
import { renderRoute, route, type TaskProfile } from "./core/router.js";
import { summon, renderReport, SummonError } from "./core/summon.js";
import { Vault } from "./vault/vault.js";
import { registerVaultCommands } from "./vault/cli.js";
import { registerWorkspaceCommands } from "./workspace/cli.js";
import { getAdapter } from "./adapters/registry.js";
import type { Effort, Role } from "./adapters/Adapter.js";

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
  .option("--plain", "plain text output (automatic when not a TTY)")
  .action((opts: { plain?: boolean }) => {
    if (opts.plain || !process.stdout.isTTY) {
      console.log(plainBanner(pkg.version));
      return;
    }
    const app = render(React.createElement(Banner, { version: pkg.version }));
    app.unmount();
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
  .option("--json", "machine-readable report")
  .action(async (soldier: string, task: string[], opts: SummonCliOptions) => {
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
    try {
      const report = await summon({
        roster,
        soldier,
        task: task.join(" "),
        role: opts.role as Role | undefined,
        cwd: opts.cwd,
        write: opts.write,
        claims: opts.claim,
        waitMs,
        effort: opts.effort as Effort | undefined,
        timeoutMs,
        vault: opts.vault ? Vault.forCwd(opts.cwd) : undefined,
      });
      console.log(opts.json ? JSON.stringify(report, null, 2) : renderReport(report));
      if (report.status === "error") process.exitCode = 1;
    } catch (e) {
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

await program.parseAsync(process.argv);
