import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { HarnessGitHeld, type GitResult, type HarnessKind } from "./harness.js";

/**
 * WSP-10's hold. Harness git compares what git reads for each repository it runs in (config, `hooks/`, `info/`,
 * a worktree's `.git` file, `gitdir` and `commondir`, and the same for every checked-out submodule, at any depth)
 * with the state Shadow Army last trusted. Any other change, or anything the scan can't inspect, holds harness
 * git, across restarts, until it is gone. `branch.*` and `remote.*` are left out, as `git push -u` writes them.
 * Not here: the copies of trusted files a card diffs from (M2).
 */

/** Hash of each watched thing, by a label that names the file the way the transcript line shows it. */
export type TrustedState = Record<string, string>;

/** Where git for a repository is: what harness git is given as GIT_DIR, GIT_WORK_TREE and GIT_COMMON_DIR. */
export interface GitRepo { gitDir: string; workTree: string; commonDir: string }
export interface GitRunner { run(args: string[], kind?: HarnessKind): Promise<GitResult> }

export interface HoldEvent { event: "trusted" | "held" | "released"; files?: string[]; hashes?: TrustedState; reason?: string }

export interface HarnessHoldOptions {
  /** The folder's own checkout. This army's snapshots and worktrees join it with `register`. */
  repo: GitRepo;
  /**
   * Harness git for any repository, a submodule's included (it gets that submodule's own git folder).
   * `config` is command-line config it must add, with `withConfig` on its environment: git passes that on
   * to the git it runs inside each submodule, at any depth.
   */
  gitFor(repo: GitRepo, config?: [string, string][]): GitRunner;
  /** The post office's own file for this repository's hold, kept beside its log. */
  statePath: string;
  log?: (event: HoldEvent) => void;
  /** The scan's bounds: entries in one repository's metadata, its submodules' included, and bytes in one file. */
  limits?: { entries?: number; bytes?: number };
}

interface Persisted {
  version: 2;
  repos: GitRepo[];
  /** By repository (`keyOf`). */
  trusted: Record<string, TrustedState>;
  held?: { files: string[] };
  turnOpen?: boolean;
  /** A harness git command had started and its after-check hadn't finished. */
  running?: boolean;
  /** A guard or audit command timed out twice (WSP-10). */
  timeout?: string;
}

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const slash = (path: string) => path.replace(/\\/g, "/");
const real = (path: string) => { try { return realpathSync.native(path); } catch { return resolve(path); } };
const canon = (path: string) => { const out = slash(real(path)); return process.platform === "linux" ? out : out.toLowerCase(); };
const keyOf = (repo: GitRepo) => canon(repo.gitDir);
/** One repository is the whole tuple git is given: its administration folder, working tree and common folder (C9). */
const same = (a: GitRepo, b: GitRepo) => keyOf(a) === keyOf(b) && canon(a.workTree) === canon(b.workTree) && canon(a.commonDir) === canon(b.commonDir);
const flat = (byRepo: Record<string, TrustedState>): TrustedState => Object.assign({}, ...Object.values(byRepo));
const uncounted = /^(branch|remote)\./i;
const LIMITS = { entries: 10_000, bytes: 16 * 1024 * 1024, repos: 1_000 };

/** Something the scan can't inspect: a special file, an unreadable one, too many entries, a failed listing. */
export class Uninspectable extends Error {
  /** `fatal`: a bound was passed, so the rest of the scan can't be relied on either. */
  constructor(readonly path: string, why: string, readonly fatal = false) { super(`${path} can't be inspected: ${why}`); }
}

/** `env` with `pairs` added as command-line config (GIT_CONFIG_COUNT), after any it already has. A key may hold `=`. */
export function withConfig(env: NodeJS.ProcessEnv, pairs: [string, string][]): NodeJS.ProcessEnv {
  if (!pairs.length) return env;
  const out = { ...env }, start = Number(env.GIT_CONFIG_COUNT) || 0;
  pairs.forEach(([key, value], i) => { out[`GIT_CONFIG_KEY_${start + i}`] = key; out[`GIT_CONFIG_VALUE_${start + i}`] = value; });
  out.GIT_CONFIG_COUNT = String(start + pairs.length);
  return out;
}

/** A regular file's bytes, opened without blocking and checked once open, so a FIFO or a swapped file can't stall it. */
function readRegular(path: string, maxBytes: number): Buffer {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0)); } catch (error) { throw new Uninspectable(path, (error as Error).message); }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Uninspectable(path, "not a regular file");
    if (stat.size > maxBytes) throw new Uninspectable(path, `larger than ${maxBytes} bytes`);
    return readFileSync(fd);
  } catch (error) {
    throw error instanceof Uninspectable ? error : new Uninspectable(path, (error as Error).message);
  } finally { closeSync(fd); }
}

/** What `path` is, without following a link; undefined when it is missing. */
function typeOf(path: string): "file" | "folder" | "link" | "other" | undefined {
  try {
    const stat = lstatSync(path);
    return stat.isFile() ? "file" : stat.isDirectory() ? "folder" : stat.isSymbolicLink() ? "link" : "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Uninspectable(path, (error as Error).message);
  }
}

/** One repository's walk: everything git reads there, its checked-out submodules' included, at any depth. */
class Scan {
  readonly state: TrustedState = {};
  readonly names = new Set<string>();
  /** What couldn't be inspected. The scan goes on past each, so a change elsewhere is still named. */
  readonly problems = new Set<string>();
  private entries = 0;
  private readonly seen = new Set<string>();
  private readonly limits: typeof LIMITS;

  constructor(private readonly main: GitRepo, private readonly gitFor: HarnessHoldOptions["gitFor"], limits: HarnessHoldOptions["limits"] = {}) {
    this.limits = { ...LIMITS, ...limits };
  }

  where(path: string) {
    const rel = relative(this.main.workTree, path);
    return slash(rel.startsWith("..") || isAbsolute(rel) ? path : rel);
  }

  private count(path: string) {
    if (++this.entries > this.limits.entries) throw new Uninspectable(path, `more than ${this.limits.entries} entries`, true);
  }

  /** One step of the walk: a problem in it is recorded, and the walk goes on, unless it is fatal. */
  private async step(work: () => unknown) {
    try { await work(); } catch (error) {
      if (!(error instanceof Uninspectable) || error.fatal) throw error;
      this.problems.add(this.where(error.path));
    }
  }

  /** A file's hash, or a link's target and its file's hash. Anything else can't be inspected. */
  private hashFile(path: string, label = this.where(path)) {
    const type = typeOf(path);
    if (type === undefined) return;
    if (type === "folder" || type === "other") throw new Uninspectable(path, "not a regular file");
    let target = "";
    if (type === "link") { try { target = `link:${readlinkSync(path)}\0`; } catch (error) { throw new Uninspectable(path, (error as Error).message); } }
    this.state[label] = sha(Buffer.concat([Buffer.from(target), readRegular(path, this.limits.bytes)]));
  }

  private hashFolder(folder: string) {
    const type = typeOf(folder);
    if (type === undefined) return;
    if (type !== "folder") { this.hashFile(folder); return; }
    let names: string[];
    try { names = readdirSync(folder); } catch (error) { throw new Uninspectable(folder, (error as Error).message); }
    for (const name of names.sort()) {
      this.count(folder);
      const path = join(folder, name);
      if (typeOf(path) === "folder") this.hashFolder(path); else this.hashFile(path);
    }
  }

  /** The config git reads, every scope but the command line, includes followed, one hash per file it came from. */
  private async hashConfig(git: GitRunner, repo: GitRepo) {
    const result = await git.run(["config", "--list", "--show-origin", "--show-scope", "-z"]);
    if (result.code !== 0) throw new Uninspectable(join(repo.gitDir, "config"), `git config --list failed: ${result.stderr.trim()}`);
    const fields = result.stdout.split("\0");
    const groups = new Map<string, string[]>();
    for (let i = 0; i + 2 < fields.length; i += 3) {
      const [scope, origin, entry] = [fields[i]!, fields[i + 1]!, fields[i + 2]!];
      this.addName(entry);
      if (scope === "command" || !origin.startsWith("file:") || uncounted.test(entry)) continue;
      const key = this.where(resolve(repo.workTree, origin.slice("file:".length)));
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    for (const [key, entries] of groups) this.state[`config ${key}`] = sha(entries.join("\0"));
  }

  /** A submodule name from a `submodule.<name>.<variable>` entry, for a guard command's `ignore` overrides. */
  private addName(entry: string) {
    const key = entry.split("\n", 1)[0]!, last = key.lastIndexOf(".");
    if (/^submodule\./i.test(key) && last > "submodule.".length) this.names.add(key.slice("submodule.".length, last));
  }

  /** The names this working tree's `.gitmodules` gives. */
  private async gitmodules(git: GitRunner, repo: GitRepo) {
    const file = join(repo.workTree, ".gitmodules");
    if (typeOf(file) === undefined) return;
    readRegular(file, this.limits.bytes); // a special file can't be read by git config either
    const result = await git.run(["config", "--file", file, "--list", "-z"]);
    if (result.code !== 0) throw new Uninspectable(file, `git config --file failed: ${result.stderr.trim()}`);
    for (const entry of result.stdout.split("\0")) this.addName(entry);
  }

  async walk(repo: GitRepo) {
    if (this.seen.size >= this.limits.repos) throw new Uninspectable(repo.workTree, `more than ${this.limits.repos} repositories`, true);
    this.seen.add(keyOf(repo));
    const git = this.gitFor(repo);
    // A worktree's or a submodule's own pointers: its `.git` file, and its git folder's `gitdir` and `commondir`.
    const dotGit = join(repo.workTree, ".git");
    await this.step(() => { if (typeOf(dotGit) !== "folder") this.hashFile(dotGit, `submodule ${this.where(dotGit)}`); });
    for (const name of ["commondir", "gitdir"]) await this.step(() => this.hashFile(join(repo.gitDir, name), `submodule ${this.where(join(repo.gitDir, name))}`));
    await this.step(() => this.hashConfig(git, repo));
    for (const folder of new Set([repo.commonDir, repo.gitDir])) for (const name of ["hooks", "info"]) await this.step(() => this.hashFolder(join(folder, name)));
    await this.step(() => this.gitmodules(git, repo));
    await this.step(() => this.submodules(git, repo));
  }

  /** Each gitlink in the index whose folder is checked out, followed. */
  private async submodules(git: GitRunner, repo: GitRepo) {
    const listed = await git.run(["ls-files", "--stage", "-z"]);
    if (listed.code !== 0) throw new Uninspectable(join(repo.gitDir, "index"), `git ls-files failed: ${listed.stderr.trim()}`);
    const paths = new Set<string>();
    for (const record of listed.stdout.split("\0")) {
      if (!record) continue;
      const match = /^(\d{6}) [0-9a-f]+ \d\t([\s\S]+)$/.exec(record);
      if (!match) throw new Uninspectable(join(repo.gitDir, "index"), "a record git ls-files gave can't be parsed");
      if (match[1] === "160000") paths.add(match[2]!);
    }
    for (const path of paths) await this.step(() => this.submodule(repo, path));
  }

  private async submodule(parent: GitRepo, path: string) {
    this.names.add(path);
    const folder = join(parent.workTree, path), dotGit = join(folder, ".git");
    const type = typeOf(dotGit);
    if (type === undefined) return; // not checked out
    let gitDir = dotGit;
    if (type !== "folder") {
      this.hashFile(dotGit, `submodule ${this.where(dotGit)}`);
      const named = /^gitdir:\s*(.+?)\s*$/m.exec(readRegular(dotGit, this.limits.bytes).toString("utf8"))?.[1];
      if (!named) return; // git can't run there either; the file's hash is compared
      gitDir = resolve(folder, named);
    }
    if (typeOf(gitDir) !== "folder") { this.state[`submodule ${this.where(gitDir)}`] = "missing"; return; }
    const repo: GitRepo = { gitDir, workTree: folder, commonDir: gitDir };
    if (this.seen.has(keyOf(repo))) return; // a cycle, or two gitlinks sharing a git folder
    const commondir = join(gitDir, "commondir");
    if (typeOf(commondir) !== undefined) repo.commonDir = resolve(gitDir, readRegular(commondir, this.limits.bytes).toString("utf8").trim());
    this.state[`submodule ${this.where(gitDir)}`] = "present";
    await this.walk(repo);
  }
}

/** What git reads for `repo`, labelled from `main`'s working tree, and the submodule names a guard command must not let `ignore` hide. */
export async function readState(main: GitRepo, repo: GitRepo, gitFor: HarnessHoldOptions["gitFor"], limits?: HarnessHoldOptions["limits"]) {
  const scan = new Scan(main, gitFor, limits);
  try { await scan.walk(repo); } catch (error) {
    if (!(error instanceof Uninspectable)) throw error;
    return { state: scan.state, names: [...scan.names].sort(), problems: [scan.where(error.path)], fatal: true };
  }
  return { state: scan.state, names: [...scan.names].sort(), problems: [...scan.problems].sort(), fatal: false };
}

/** Labels that differ: added, removed or changed. The same label as in the transcript line. */
export function changedFiles(trusted: TrustedState, current: TrustedState): string[] {
  const names = new Set([...Object.keys(trusted), ...Object.keys(current)]);
  return [...names].filter((name) => trusted[name] !== current[name]).map((name) => name.replace(/^(config|submodule) /, "")).sort();
}

export type HoldCheck = { held: false } | { held: true; files: string[]; line: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isRepo = (value: unknown) => isObject(value) && ["gitDir", "workTree", "commonDir"].every((key) => typeof value[key] === "string");
const isStrings = (value: unknown) => isObject(value) && Object.values(value).every((item) => typeof item === "string");

/** The record's shape, checked before any of it is trusted. */
function valid(value: unknown): value is Persisted {
  return isObject(value) && value.version === 2 && Array.isArray(value.repos) && value.repos.every(isRepo)
    && isObject(value.trusted) && Object.values(value.trusted).every(isStrings)
    && (value.held === undefined || (isObject(value.held) && Array.isArray(value.held.files) && value.held.files.every((file) => typeof file === "string")))
    && ["turnOpen", "running"].every((key) => value[key] === undefined || typeof value[key] === "boolean")
    && (value.timeout === undefined || typeof value.timeout === "string");
}

const UNREADABLE = ["can't be read, so what the last post office trusted is unknown", "accept the folder as it is to go on"] as const;

export class HarnessHold {
  private repos: GitRepo[];
  /** Undefined until a state could be read and trusted; nothing is recorded before then. */
  private trusted: Record<string, TrustedState> | undefined;
  private files: string[] | undefined;
  private turnOpen = false;
  /** Harness git commands started whose after-check hasn't finished: the record says `running` while any is (C10). */
  private active = 0;
  private timeout: string | undefined;
  /** Submodule names, at any depth, from the last scan. */
  private names: string[] = [];
  /** The last record exists but can't be read or checked: held, and the record left as it is, until the owner accepts. */
  private unverified = false;

  constructor(private readonly options: HarnessHoldOptions) { this.repos = [options.repo]; }

  get held() { return this.files !== undefined || this.timeout !== undefined; }

  /**
   * The post office's start. Where the last one ended held, with a turn or a command still open, or after a
   * timeout, the state that log last trusted is kept; otherwise the state as it is now is the trusted one.
   * A change since then can't be told from the owner's, and the line says so.
   */
  async start(): Promise<HoldCheck> {
    const saved = this.load();
    if (saved === "unreadable") { this.unverified = true; return this.check(); }
    if (saved) this.repos = [this.options.repo, ...saved.repos.filter((repo) => keyOf(repo) !== keyOf(this.options.repo))];
    if (!saved || !(saved.held || saved.turnOpen || saved.running || saved.timeout)) return this.check();
    this.trusted = saved.trusted;
    this.turnOpen = saved.turnOpen === true;
    const { files, why } = this.compare(await this.read());
    if (!files.length) { this.files = undefined; this.save(); return { held: false }; }
    return this.hold(files, `${why === "changed" ? "differs from" : `${why}, or differs from`} what the last post office trusted · can't be told from your own edit`);
  }

  /** Before and after a command, and at each later use of the army: held while anything differs, and goes on once nothing does. */
  async check(): Promise<HoldCheck> {
    if (this.unverified) return this.hold([this.label(this.options.statePath)], ...UNREADABLE);
    const current = await this.read();
    if (!this.trusted && !current.problems.length) { this.trust(current.state); return { held: false }; }
    const { files, why } = this.compare(current);
    if (files.length) return this.hold(files, why);
    if (this.files) { this.files = undefined; this.save(); this.options.log?.({ event: "released" }); }
    return { held: false };
  }

  /** The owner answered y on the guard's card, or Shadow Army's own command changed these files: this is the trusted state. */
  async accept(): Promise<void> {
    const current = await this.read();
    if (current.problems.length) throw new Uninspectable(current.problems.join(", "), "the state can't be accepted");
    this.unverified = false;
    this.trust(current.state);
  }

  /**
   * A snapshot or worktree this army made: its own metadata and submodules as they are now are trusted, and
   * harness git may run in it. What another covered repository also reads (the shared config, hooks, info, the
   * user's config) keeps the hash already trusted, so a change to it is still held (C13). A repository already
   * trusted is checked against that baseline, never trusted again: a change holds.
   */
  async register(repo: GitRepo): Promise<void> {
    const key = keyOf(repo), known = this.repos.find((other) => keyOf(other) === key);
    if (known && !same(known, repo)) throw new Error(`harness git: ${repo.gitDir} is already registered with another working tree or common folder`);
    if (!this.trusted) throw new Error("harness git: a repository registers only once the folder's own state is trusted");
    const { state, problems } = await readState(this.options.repo, known ?? repo, this.options.gitFor, this.options.limits);
    if (problems.length) throw new Uninspectable(problems.join(", "), "the repository can't be trusted");
    if (!known && !this.repos.some((other) => keyOf(other) === key)) this.repos.push(repo);
    const baseline = this.trusted?.[key];
    if (known && baseline) {
      const files = changedFiles(baseline, state);
      if (files.length) throw new HarnessGitHeld(this.hold(files, "changed since it was trusted").line);
      return;
    }
    // Its own: inside its git folder, or its working tree (its `.git` file, its submodules) but not the common folder.
    const inside = (path: string, folder: string) => (path + "/").startsWith(canon(folder).replace(/\/?$/, "/"));
    const isOwn = (label: string) => {
      const name = label.replace(/^(config|submodule) /, ""), full = isAbsolute(name) ? name : resolve(this.options.repo.workTree, name);
      const leaf = basename(full), path = `${canon(dirname(full))}/${process.platform === "linux" ? leaf : leaf.toLowerCase()}`; // where it sits, not where a link points
      return inside(path, repo.gitDir) || (inside(path, repo.workTree) && !inside(path, repo.commonDir));
    };
    const others = Object.entries(this.trusted ?? {}).filter(([other]) => other !== key).map(([, hashes]) => hashes);
    const own: TrustedState = {};
    for (const [label, hash] of Object.entries(state)) {
      const before = isOwn(label) ? hash : others.find((hashes) => label in hashes)?.[label];
      if (before !== undefined) own[label] = before; // shared state no other repository trusted is left out, so it holds
    }
    this.trusted = { ...this.trusted, [key]: own };
    this.save();
    this.options.log?.({ event: "trusted", hashes: own });
    // Shared state that already differs is held now, and recorded, so a restart before the next check keeps it.
    const files = changedFiles(own, state);
    if (files.length) throw new HarnessGitHeld(this.hold(files, "changed before it was registered").line);
  }

  /** Shadow Army's own command removed it. */
  async unregister(repo: GitRepo): Promise<void> {
    if (keyOf(repo) === keyOf(this.options.repo) || !this.repos.some((other) => same(other, repo))) return;
    this.repos = this.repos.filter((other) => !same(other, repo));
    if (this.trusted) delete this.trusted[keyOf(repo)];
    this.save();
  }

  /** The next use of the army tries again after a timeout (WSP-10). */
  retry() { this.timeout = undefined; this.save(); }

  /**
   * Run harness git in `repo`, one this hold covers (all three paths), with the paths it was registered with,
   * between a check before and one after. The after-check runs
   * whether the command succeeded or not, and a change on either side holds; the command's own error is the one thrown.
   */
  async run(repo: GitRepo, args: string[], kind: HarnessKind = "other"): Promise<GitResult> {
    const covered = this.repos.find((other) => same(other, repo));
    if (!covered) throw new Error(`harness git: ${repo.gitDir} isn't a repository this hold covers`);
    if (this.timeout) throw new HarnessGitHeld(this.timeout);
    const before = await this.check();
    if (before.held) throw new HarnessGitHeld(before.line);
    // A guard command sees into every submodule: no `ignore`, in a config or a `.gitmodules`, at any depth (WSP-10).
    const config: [string, string][] = kind !== "guard" ? []
      : [["diff.ignoreSubmodules", "none"], ...this.names.map((name): [string, string] => [`submodule.${name}.ignore`, "none"])];
    this.active++; this.save();
    let result: GitResult | undefined, failure: unknown;
    try { result = await this.options.gitFor(covered, config).run(args, kind); } catch (error) {
      failure = error;
      if (error instanceof HarnessGitHeld) this.timeout = error.reason;
    }
    const after = await this.check();
    this.active--; this.save();
    if (failure !== undefined) throw failure;
    if (after.held) throw new HarnessGitHeld(after.line);
    return result!;
  }

  /** A turn's guard is open until it has closed (PO-8): a restart then trusts the saved state, not the current one. */
  setTurnOpen(open: boolean) { this.turnOpen = open; this.save(); }

  /** Every covered repository's state, or the first thing that can't be inspected. */
  private async read(): Promise<{ state: Record<string, TrustedState>; problems: string[]; fatal: boolean }> {
    const state: Record<string, TrustedState> = {}, names = new Set<string>(), problems = new Set<string>();
    let fatal = false;
    for (const repo of this.repos) {
      const read = await readState(this.options.repo, repo, this.options.gitFor, this.options.limits);
      state[keyOf(repo)] = read.state;
      for (const name of read.names) names.add(name);
      for (const problem of read.problems) problems.add(problem);
      fatal ||= read.fatal;
    }
    this.names = [...names].sort();
    return { state, problems: [...problems].sort(), fatal };
  }

  /**
   * What differs from the trusted state, with what couldn't be inspected. Where something couldn't be, a label
   * the scan didn't reach isn't counted as removed; after a fatal problem only the problem is named. Each
   * repository is compared with its own trusted state, and only the labels are merged, for the line (C13).
   */
  private compare(current: { state: Record<string, TrustedState>; problems: string[]; fatal: boolean }) {
    if (current.fatal || !this.trusted) return { files: current.problems, why: "can't be inspected" };
    const changed = new Set<string>();
    for (const key of new Set([...Object.keys(this.trusted), ...Object.keys(current.state)])) {
      const trusted = this.trusted[key] ?? {}, now = current.state[key] ?? {};
      // With a problem, a label missing now may only be unreached: it counts as unchanged.
      for (const file of changedFiles(trusted, current.problems.length ? { ...trusted, ...now } : now)) changed.add(file);
    }
    const files = [...new Set([...changed, ...current.problems])].sort();
    const why = !current.problems.length ? "changed" : changed.size ? "changed or can't be inspected" : "can't be inspected";
    return { files, why };
  }

  private label(path: string) { return new Scan(this.options.repo, this.options.gitFor).where(path); }

  private hold(files: string[], why: string, how = "undo it to go on"): HoldCheck & { held: true } {
    const line = `Shadow Army: harness git held · ${files.join(", ")} ${why} · ${how}`;
    const fresh = !this.files || this.files.join("\0") !== files.join("\0");
    this.files = files;
    this.save();
    if (fresh) this.options.log?.({ event: "held", files, reason: why });
    return { held: true, files, line };
  }

  private trust(state: Record<string, TrustedState>) {
    this.trusted = state; this.files = undefined; this.save();
    this.options.log?.({ event: "trusted", hashes: flat(state) });
  }

  /** The last record; undefined when there is none, "unreadable" when one exists but can't be read or checked. */
  private load(): Persisted | "unreadable" | undefined {
    let text: string;
    try { text = readFileSync(this.options.statePath, "utf8"); } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? undefined : "unreadable";
    }
    try { const record: unknown = JSON.parse(text); return valid(record) ? record : "unreadable"; } catch { return "unreadable"; }
  }

  /** Written whole: to a file beside it, then renamed over it. */
  private save() {
    if (this.unverified || !this.trusted) return;
    const record: Persisted = { version: 2, repos: this.repos, trusted: this.trusted,
      ...(this.files ? { held: { files: this.files } } : {}), ...(this.turnOpen ? { turnOpen: true } : {}),
      ...(this.active > 0 ? { running: true } : {}), ...(this.timeout ? { timeout: this.timeout } : {}) };
    const path = this.options.statePath, temp = `${path}.${process.pid}.tmp`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temp, JSON.stringify(record));
    renameSync(temp, path);
  }
}
