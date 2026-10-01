#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { Banner } from "./ui/Banner.js";
import { plainBanner } from "./ui/art.js";

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

await program.parseAsync(process.argv);
