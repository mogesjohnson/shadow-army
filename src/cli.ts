import { readFileSync } from "node:fs";
import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { Banner } from "./ui/Banner.js";
import { plainBanner } from "./ui/art.js";
import { loadConfig } from "./core/config.js";
import { checkArmy, renderArmy } from "./core/army.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const program = new Command();

program
  .name("shadow")
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

await program.parseAsync(process.argv);
