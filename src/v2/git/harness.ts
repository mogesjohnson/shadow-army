import { spawn } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative } from "node:path";
import { spawnManagedProcess, type ManagedProcess, type ManagedProcessOptions, type ProcessExit } from "../processTree.js";

/** WSP-10 harness git: git that runs nothing a repository names, on a limit, from a trusted PATH entry. */
export type HarnessKind = "snapshot" | "guard" | "other";
/** 30 min for a command that makes or brings a snapshot or worktree, 5 min for any other. */
export const LIMIT_MS: Record<HarnessKind, number> = { snapshot: 30 * 60_000, guard: 5 * 60_000, other: 5 * 60_000 };

/** Monotonic time. Tests pass a fake, so a limit never needs a real wait. */
export interface HarnessClock { now(): number; after(ms: number, fn: () => void): () => void }
export const realClock: HarnessClock = {
  now: () => performance.now(),
  after(ms, fn) { const timer = setTimeout(fn, ms); return () => clearTimeout(timer); },
};

export interface GitResult { code: number | null; stdout: string; stderr: string }
export class HarnessGitTimeout extends Error {
  constructor(readonly kind: HarnessKind, readonly limitMs: number) { super(`git took longer than ${limitMs / 60_000} min`); }
}
export class HarnessGitHeld extends Error {
  constructor(readonly reason: string) { super(`harness git held · ${reason}`); }
}

export interface HarnessGitOptions {
  /** The git folder, working tree and common folder Shadow Army knows (GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR). */
  repo: { gitDir: string; workTree: string; commonDir: string };
  /** An empty folder Shadow Army keeps, as `core.hooksPath`. */
  hooksDir: string;
  /** Names of hooks the config defines (`hook.<name>.command`), switched off one by one. */
  hookNames?: string[];
  /** The post office's environment. */
  env?: NodeJS.ProcessEnv;
  /** Folders PATH may not name: the checkout, worktrees, snapshots. Compared by real path. */
  untrusted?: string[];
  clock?: HarnessClock;
  spawn?: (options: ManagedProcessOptions) => Promise<ManagedProcess>;
  /** Test seam: run this instead of the git found on PATH. */
  git?: { file: string; prefix?: string[] };
  /** PO-16's entry for a running command: added before it starts, removed once it has ended. */
  trees?: { add(entry: { pid: number; startedAt: number }): Promise<void>; remove(): Promise<void> };
}

/** The first absolute PATH entry that has git. Relative, empty, missing and untrusted entries are dropped, and named. */
export function resolveGit(pathValue: string, untrusted: string[] = [], platform: NodeJS.Platform = process.platform) {
  const fold = (value: string) => (platform === "linux" ? value : value.toLowerCase());
  const real = (value: string) => { try { return fold(realpathSync(value)); } catch { return undefined; } };
  const roots = untrusted.map(real).filter((root): root is string => root !== undefined);
  const dropped: { entry: string; reason: string }[] = [];
  const kept: string[] = [];
  for (const entry of pathValue.split(delimiter)) {
    const resolved = isAbsolute(entry) ? real(entry) : undefined;
    const inside = resolved !== undefined && roots.some((root) => { const rel = relative(root, resolved); return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)); });
    if (!isAbsolute(entry)) dropped.push({ entry, reason: "relative or empty" });
    else if (resolved === undefined) dropped.push({ entry, reason: "missing" });
    else if (inside) dropped.push({ entry, reason: "inside the folder, a worktree or a snapshot" });
    else kept.push(entry);
  }
  const name = platform === "win32" ? "git.exe" : "git";
  const git = kept.map((entry) => join(entry, name)).find((file) => { try { return statSync(file).isFile(); } catch { return false; } });
  return { git, path: kept.join(delimiter), dropped };
}

const HOOK_EVENTS = ["applypatch-msg", "pre-applypatch", "post-applypatch", "pre-commit", "pre-merge-commit", "prepare-commit-msg",
  "commit-msg", "post-commit", "pre-rebase", "post-checkout", "post-merge", "pre-push", "pre-auto-gc", "post-rewrite", "post-index-change",
  "reference-transaction", "push-to-checkout", "fsmonitor-watchman", "pre-receive", "update", "post-receive", "post-update"];

/** Command-line overrides, so a hostile repository's config runs nothing. `args[0]` is the subcommand. */
export function buildGitArgs(args: string[], options: { hooksDir: string; hookNames?: string[]; kind: HarnessKind }) {
  const env: Record<string, string> = {};
  const head = ["--no-pager", "--no-optional-locks"];
  // A name holding "=" would be split by -c, so it goes through --config-env.
  const set = (key: string, value: string) => {
    if (!key.includes("=")) { head.push("-c", `${key}=${value}`); return; }
    const variable = `SA_GIT_CONFIG_${Object.keys(env).length}`;
    env[variable] = value; head.push(`--config-env=${key}=${variable}`);
  };
  set("core.hooksPath", options.hooksDir);
  for (const event of HOOK_EVENTS) set(`hook.${event}.enabled`, "false");
  for (const name of options.hookNames ?? []) set(`hook.${name}.enabled`, "false");
  for (const [key, value] of [["core.fsmonitor", "false"], ["core.useReplaceRefs", "false"], ["commit.gpgSign", "false"], ["tag.gpgSign", "false"],
    ["push.gpgSign", "false"], ["log.showSignature", "false"], ["credential.interactive", "false"], ["worktree.useRelativePaths", "false"]] as const) set(key, value);
  const [subcommand = "", ...rest] = args;
  const extra: string[] = [];
  if (["diff", "log", "show"].includes(subcommand)) extra.push("--no-ext-diff", "--no-textconv");
  if (subcommand === "commit") extra.push("--no-verify");
  if (options.kind === "guard" && ["diff", "status"].includes(subcommand)) extra.push("--ignore-submodules=none");
  return { args: [...head, subcommand, ...extra, ...rest], env };
}

async function spawnPosix(options: ManagedProcessOptions): Promise<ManagedProcess> {
  const child = spawn(options.file, options.args ?? [], { cwd: options.cwd, env: options.env, detached: true, stdio: "pipe" });
  await new Promise<void>((done, fail) => { child.once("spawn", done); child.once("error", fail); });
  const exited = new Promise<ProcessExit>((done) => child.once("exit", (code, signal) => done({ code, signal })));
  // The process group is the tree; killing it ends git and everything it started.
  const close = async () => { try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already gone */ } };
  return { pid: child.pid!, stdin: child.stdin, stdout: child.stdout, stderr: child.stderr, exited, close };
}

const collect = async (stream: AsyncIterable<Buffer | string>) => {
  const chunks: Buffer[] = [];
  try { for await (const chunk of stream) chunks.push(Buffer.from(chunk)); } catch { /* the stream ended with the process */ }
  return Buffer.concat(chunks).toString("utf8");
};

export class HarnessGit {
  /** Set after a guard or audit command timed out twice; every run throws until `retryHold()`. */
  held: string | undefined;
  readonly dropped: { entry: string; reason: string }[];
  private readonly file: string;
  private readonly prefix: string[];
  private readonly path: string;

  constructor(private readonly options: HarnessGitOptions) {
    const env = options.env ?? process.env;
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
    const found = resolveGit(pathKey ? env[pathKey] ?? "" : "", options.untrusted);
    this.dropped = found.dropped;
    this.path = found.path;
    const file = options.git?.file ?? found.git;
    if (!file) throw new Error("git was not found in any absolute PATH entry outside the repository");
    this.file = file;
    this.prefix = options.git?.prefix ?? [];
  }

  /** The next use of the army tries again (WSP-10). */
  retryHold() { this.held = undefined; }

  /** A guard or audit command ("guard") is tried once more after a timeout; a second timeout holds harness git. */
  async run(args: string[], kind: HarnessKind = "other", cwd = this.options.repo.workTree): Promise<GitResult> {
    if (this.held) throw new HarnessGitHeld(this.held);
    for (let attempt = 1; ; attempt++) {
      const result = await this.attempt(args, kind, cwd);
      if (result !== "timeout") return result;
      if (kind !== "guard") throw new HarnessGitTimeout(kind, LIMIT_MS[kind]);
      if (attempt === 2) { this.held = `git took longer than ${LIMIT_MS[kind] / 60_000} min, twice`; throw new HarnessGitHeld(this.held); }
    }
  }

  private async attempt(args: string[], kind: HarnessKind, cwd: string): Promise<GitResult | "timeout"> {
    const { repo, hooksDir, hookNames } = this.options;
    const clock = this.options.clock ?? realClock;
    const built = buildGitArgs(args, { hooksDir, hookNames, kind });
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(this.options.env ?? process.env)) if (!/^(path|git_external_diff|git_pager)$/i.test(key)) env[key] = value;
    Object.assign(env, built.env, { PATH: this.path, GIT_TERMINAL_PROMPT: "0", GIT_DIR: repo.gitDir, GIT_WORK_TREE: repo.workTree, GIT_COMMON_DIR: repo.commonDir });
    if (process.platform === "win32") env.NoDefaultCurrentDirectoryInExePath = "1";
    const spawnTree = this.options.spawn ?? (process.platform === "win32" ? spawnManagedProcess : spawnPosix);
    const proc = await spawnTree({ file: this.file, args: [...this.prefix, ...built.args], cwd, env });
    proc.stdin.end();
    const stdout = collect(proc.stdout), stderr = collect(proc.stderr);
    await this.options.trees?.add({ pid: proc.pid, startedAt: Date.now() });
    const started = clock.now();
    let cancel = () => {};
    const limit = new Promise<"timeout">((expired) => {
      const arm = (ms: number) => {
        cancel = clock.after(ms, () => { const left = LIMIT_MS[kind] - (clock.now() - started); if (left > 0) arm(left); else expired("timeout"); });
      };
      arm(LIMIT_MS[kind]);
    });
    try {
      const outcome = await Promise.race([proc.exited, limit]);
      await proc.close(); // ends git's whole tree, filters included
      if (outcome === "timeout") return "timeout";
      return { code: outcome.code, stdout: await stdout, stderr: await stderr };
    } finally {
      cancel();
      await this.options.trees?.remove();
    }
  }
}
