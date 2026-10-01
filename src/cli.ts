#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command, Option } from "commander";
import React from "react";
import { render } from "ink";
import { Banner } from "./ui/Banner.js";
import { plainBanner } from "./ui/art.js";
import { loadConfig } from "./core/config.js";
import { checkArmy, renderArmy } from "./core/army.js";
import { summon, renderReport, SummonError } from "./core/summon.js";
import type { Effort, Role } from "./adapters/Adapter.js";

interface SummonCliOptions {
  role?: string;
  cwd: string;
  write?: boolean;
  effort?: string;
  timeout: string;
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
    const rows = await checkArmy(loadConfig());
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
  .option("--write", "allow the soldier to modify files (build role only)")
  .addOption(new Option("--effort <level>", "reasoning effort").choices(["low", "medium", "high", "max"]))
  .option("--timeout <seconds>", "give up after this many seconds", "600")
  .option("--json", "machine-readable report")
  .action(async (soldier: string, task: string[], opts: SummonCliOptions) => {
    const timeoutMs = Number(opts.timeout) * 1000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      console.error("error: --timeout must be a positive number of seconds");
      process.exitCode = 2;
      return;
    }
    try {
      const report = await summon({
        config: loadConfig(),
        soldier,
        task: task.join(" "),
        role: opts.role as Role | undefined,
        cwd: opts.cwd,
        write: opts.write,
        effort: opts.effort as Effort | undefined,
        timeoutMs,
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

await program.parseAsync(process.argv);
