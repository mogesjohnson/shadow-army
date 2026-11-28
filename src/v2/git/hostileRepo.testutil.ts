import { execFileSync } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HarnessClock } from "./harness.js";

/**
 * A repository that names programs in its own config and hooks. Each program records that it ran by
 * writing a file in `markers`, so a test asserts `ran()` is empty after harness git, and non-empty
 * for plain git (the control that shows the traps are live). The pager is configured but a pager only
 * runs on a terminal, so a test can only check that `--no-pager` is passed.
 */
export interface HostileRepo {
  root: string;
  gitDir: string;
  /** The user's global git config, which the repository's git reads and the test may change. */
  globalConfig: string;
  /** Names of the traps that have run: `hook-<event>`, `config-hook`, `fsmonitor`, `pager`, `signing`, `external-diff`. */
  ran(): string[];
}

export const PLANTED_HOOKS = ["pre-commit", "post-commit", "post-checkout", "post-merge", "pre-push", "reference-transaction"];

const posix = (path: string) => path.replace(/\\/g, "/");

/** `base` must be an empty, existing folder. `tracked.txt` is left modified so that diff and status have work to do. */
export function createHostileRepo(base: string): HostileRepo {
  const root = join(base, "repo"), markers = join(base, "markers"), traps = join(base, "traps");
  for (const folder of [root, markers, traps]) mkdirSync(folder, { recursive: true });
  const globalConfig = join(base, "global-config");
  writeFileSync(globalConfig, "");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe", env: { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1" } });
  const trap = (name: string, file = join(traps, `${name}.sh`)) => {
    writeFileSync(file, `#!/bin/sh\necho ran >> "${posix(join(markers, name))}"\n`);
    chmodSync(file, 0o755);
    return posix(file);
  };
  git("init", "-q");
  git("config", "user.name", "t"); git("config", "user.email", "t@example.com");
  writeFileSync(join(root, "tracked.txt"), "one\n");
  git("add", "tracked.txt"); git("commit", "-q", "-m", "first");
  writeFileSync(join(root, "tracked.txt"), "two\n");
  const gitDir = join(root, ".git");
  for (const event of PLANTED_HOOKS) trap(`hook-${event}`, join(gitDir, "hooks", event));
  git("config", "hook.fmt.event", "post-checkout"); git("config", "hook.fmt.command", trap("config-hook"));
  git("config", "core.fsmonitor", trap("fsmonitor"));
  git("config", "core.pager", trap("pager"));
  git("config", "gpg.program", trap("signing")); git("config", "commit.gpgsign", "true"); git("config", "user.signingkey", "k");
  git("config", "diff.external", trap("external-diff"));
  return { root, gitDir, globalConfig, ran: () => readdirSync(markers).sort() };
}

/**
 * A fake monotonic clock. `advance` moves both clocks; `suspend` moves only the wall clock, as a
 * machine's sleep does: timers come due, but `now()` has not moved, so no limit has been reached.
 */
export function createFakeClock(): HarnessClock & { advance(ms: number): void; suspend(ms: number): void } {
  let mono = 0, wall = 0;
  let timers: { due: number; fn: () => void }[] = [];
  const fire = () => {
    for (;;) {
      const due = timers.find((timer) => timer.due <= wall);
      if (!due) return;
      timers = timers.filter((timer) => timer !== due);
      due.fn();
    }
  };
  return {
    now: () => mono,
    after(ms, fn) { const timer = { due: wall + ms, fn }; timers.push(timer); return () => { timers = timers.filter((other) => other !== timer); }; },
    advance(ms) { mono += ms; wall += ms; fire(); },
    suspend(ms) { wall += ms; fire(); },
  };
}

/** The changes M1-AC10 plants after the post office has started. Each returns a function that undoes it. */
export function plantChange(repo: HostileRepo, change: "config" | "hook" | "info" | "global-filter"): () => void {
  const filter = '[filter "evil"]\n\tclean = evil-clean\n';
  const file = { config: join(repo.gitDir, "config"), "global-filter": repo.globalConfig, hook: join(repo.gitDir, "hooks", "pre-rebase"), info: join(repo.gitDir, "info", "attributes") }[change];
  const before = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, change === "hook" || change === "info" ? "* filter=evil\n" : filter);
  return () => (before === undefined ? rmSync(file) : writeFileSync(file, before));
}

/** Plain git, as the owner runs it, with the test's global config: it runs the repository's traps. */
export function plainGit(repo: HostileRepo, cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: repo.globalConfig, GIT_CONFIG_NOSYSTEM: "1" } });
}

/** A repository inside `repo` that is a gitlink, with `.git` as a folder, or moved to `.git/modules/<name>` with a `.git` file. */
export function addSubmodule(repo: HostileRepo, name: string, absorb = false): string {
  const folder = join(repo.root, name), git = (cwd: string, ...args: string[]) => plainGit(repo, cwd, ...args);
  mkdirSync(folder, { recursive: true });
  git(folder, "init", "-q"); git(folder, "config", "user.name", "t"); git(folder, "config", "user.email", "t@example.com");
  writeFileSync(join(folder, "file.txt"), "sub\n");
  git(folder, "add", "file.txt"); git(folder, "commit", "-q", "-m", "sub");
  git(repo.root, "add", name);
  if (absorb) {
    for (const [key, value] of [["path", name], ["url", `./${name}`]]) git(repo.root, "config", "-f", ".gitmodules", `submodule.${name}.${key}`, value!);
    git(repo.root, "submodule", "absorbgitdirs", name);
  }
  return folder;
}
