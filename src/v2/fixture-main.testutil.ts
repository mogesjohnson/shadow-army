import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeRoster } from "../core/roster.testutil.js";
import { ClaudeChannel } from "./claude.js";
import type { ChannelFactory } from "./channel.js";
import { runPostOffice } from "./main.js";

export const credential = "ab".repeat(32);
export const roster = makeRoster({ scout: { cli: "claude", model: "synthetic", roles: ["review"], write: false } });
const fake = fileURLToPath(new URL("../../test/fakes/claude.mjs", import.meta.url));
export const factory: ChannelFactory = (options) => new ClaudeChannel({ ...options, interruptTimeoutMs: 500, command: { file: process.execPath, args: [fake] } });
export async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  for (let i = 0; i < 600; i++) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error("expected integration event did not arrive");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--launcher")) {
    const cwd = process.argv[process.argv.indexOf("--cwd") + 1]!;
    const diagnostic = openSync(resolve(cwd, "launcher-stderr.log"), "a");
    const child = spawn(process.execPath, ["--import", new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href, fileURLToPath(import.meta.url), "--cwd", cwd], { cwd, detached: true, windowsHide: true, stdio: ["pipe", "inherit", diagnostic] });
    closeSync(diagnostic);
    child.stdin.end(`${JSON.stringify({ credential })}\n`);
    // Abrupt exit skips all launcher cleanup without an OS command that might kill its tree.
    process.stdin.once("data", () => process.exit(99));
    setInterval(() => {}, 1000);
  } else await runPostOffice({ roster, channelFactory: factory });
}
