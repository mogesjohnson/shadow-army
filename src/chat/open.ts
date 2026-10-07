import React from "react";
import { render, type Instance } from "ink";
import { execa } from "execa";
import { getAdapter } from "../adapters/registry.js";
import type { Roster } from "../core/roster.js";
import { route } from "../core/router.js";
import { git } from "../workspace/git.js";
import { ChatApp, type StatusInfo } from "./ChatApp.js";
import { ChatSession } from "./session.js";

/**
 * Clear the screen and the scrollback, and put the cursor at the top, like `cls`. Clearing only the
 * visible screen leaves the old output behind it: in Windows Terminal it just slides up. The chat
 * clears like this when it starts and on /clear.
 */
export const CLEAR_ALL = "\x1b[2J\x1b[3J\x1b[H";

/** Run `sa <args> --plain` as a child of this same CLI, the way it was started, and capture its output. */
export function runSaCommand(cwd: string) {
  return async (args: string[]): Promise<{ output: string; ok: boolean }> => {
    const r = await execa(process.execPath, [...process.execArgv, process.argv[1]!, ...args, "--plain"], {
      cwd,
      reject: false,
      stdin: "ignore",
      all: true,
      windowsHide: true,
      env: { FORCE_COLOR: "0" },
    });
    return { output: String(r.all ?? ""), ok: r.exitCode === 0 };
  };
}

/** The branch and how many soldiers' CLIs are installed. Only cheap checks: no model listing. */
async function loadStatus(cwd: string, roster: Roster): Promise<StatusInfo> {
  const branch = await git(cwd, ["branch", "--show-current"]).then((b) => b.trim() || "(detached)", () => undefined);
  const soldiers = [...roster.soldiers.values()];
  const found = await Promise.all(soldiers.map(async (s) => (await getAdapter(s.cli)?.detect().catch(() => undefined))?.found ?? false));
  return { branch, ready: { found: found.filter(Boolean).length, total: soldiers.length } };
}

/** `sa` in a terminal: clear the screen and chat until the owner exits. */
export async function openChat(opts: { version: string; roster: Roster; cwd: string }): Promise<void> {
  const stdout = process.stdout;
  stdout.write(CLEAR_ALL);
  let app: Instance | undefined;
  const session = new ChatSession({
    cwd: opts.cwd,
    roster: opts.roster,
    runCommand: runSaCommand(opts.cwd),
    exit: () => app?.unmount(),
    clearScreen: () => {
      app?.clear();
      stdout.write(CLEAR_ALL);
    },
  });
  const monarch = route(opts.roster, getAdapter, { role: "orchestrate" }).candidates[0]?.soldier;
  app = render(
    React.createElement(ChatApp, {
      session,
      info: { version: opts.version, cwd: opts.cwd, monarch, soldiers: opts.roster.soldiers.size },
      loadStatus: () => loadStatus(opts.cwd, opts.roster),
    }),
    { exitOnCtrlC: false },
  );
  await app.waitUntilExit();
  // Leaving mid-run: end now, which also stops the soldiers' processes.
  if (!session.idle) process.exit(130);
}
