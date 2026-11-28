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
  /** Held events this record holds that the log may not have yet: logged at the next successful write, or at the start (C29). */
  unlogged?: { files: string[]; reason: string }[];
  /** An inspection had started and its outcome wasn't written: a restart compares with the trusted state (C27). */
  checking?: boolean;
  turnOpen?: boolean;
  /** A harness git command had started and its after-check hadn't finished. */
  running?: boolean;
  /** A guard or audit command timed out twice (WSP-10). */
  timeout?: string;
  /** Repositories (`keyOf`) whose removal Shadow Army's own command began: a folder of one gone isn't held (C21). */
  removing?: string[];
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

/** A pointer file that doesn't match the tuple its repository registered with (WSP-10). */
class PointerError extends Error {
  constructor(readonly path: string, message: string) { super(message); }
}

/** A pointer slot the scan hashes nothing for: the file is missing, or `.git` is a folder. */
const ABSENT = "absent";

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
    && (value.unlogged === undefined || (Array.isArray(value.unlogged) && value.unlogged.every((item) => isObject(item) && typeof item.reason === "string"
      && Array.isArray(item.files) && item.files.every((file) => typeof file === "string"))))
    && ["turnOpen", "running", "checking"].every((key) => value[key] === undefined || typeof value[key] === "boolean")
    && (value.timeout === undefined || typeof value.timeout === "string")
    && (value.removing === undefined || (Array.isArray(value.removing) && value.removing.every((key) => typeof key === "string")));
}

const UNREADABLE = ["can't be read, so what the last post office trusted is unknown", "accept the folder as it is to go on"] as const;
const UNRECORDED = "a harness git command stopped before its outcome was recorded, so it may have timed out";

export class HarnessHold {
  private repos: GitRepo[];
  /** Undefined until a state could be read and trusted; nothing is recorded before then. */
  private trusted: Record<string, TrustedState> | undefined;
  private files: string[] | undefined;
  private turnOpen = false;
  /** Harness git commands started whose after-check hasn't finished: the record says `running` while any is (C10). */
  private active = 0;
  /** Inspections started whose outcome isn't written yet: the record says `checking` while any is (C27). */
  private checks = 0;
  private timeout: string | undefined;
  /** Submodule names, at any depth, from the last scan. */
  private names: string[] = [];
  /** The last record exists but can't be read or checked: held, and the record left as it is, until the owner accepts. */
  private unverified = false;
  /** The registration or unregistration running now, if any: the next waits for it (C16). */
  private registering: Promise<void> = Promise.resolve();
  /** Repositories (`keyOf`) whose removal began (C21). */
  private removing: string[] = [];
  /** Held events not logged yet: written with the record first, then logged, once, after a write succeeds (C29). */
  private pending: { files: string[]; reason: string }[] = [];
  /** The line of the hold `files` is, for a command whose gate is checked again after its check (C28). */
  private heldLine: string | undefined;

  constructor(private readonly options: HarnessHoldOptions) { this.repos = [options.repo]; }

  get held() { return this.files !== undefined || this.timeout !== undefined; }

  /**
   * The post office's start. Where the last one ended held, with a turn or a command still open, or after a
   * timeout, the state that log last trusted is kept; otherwise the state as it is now is the trusted one, but
   * only where the scan finds no problem: one that does is compared with the saved state, and held with it, so
   * nothing but that saved state releases the hold (C22). A change since then can't be told from the owner's.
   */
  async start(): Promise<HoldCheck> {
    const saved = this.load();
    if (saved === "unreadable") { this.unverified = true; return this.check(); }
    if (!saved) return this.check();
    this.repos = [this.options.repo, ...saved.repos.filter((repo) => keyOf(repo) !== keyOf(this.options.repo))];
    this.trusted = saved.trusted;
    this.turnOpen = saved.turnOpen === true;
    this.pending = saved.unlogged ?? []; // logged with the first write below (C29)
    // A timeout's hold outlives the restart, until g tries again. So does a command whose outcome no write recorded:
    // its timeout may be the write that failed, and unchanged metadata can't say it wasn't (C25).
    this.timeout = saved.timeout ?? (saved.running ? UNRECORDED : undefined);
    // No removal runs across a restart: a mark whose folder is still there is one that stopped, so it's dropped,
    // and a removal that goes on marks it again (C21).
    // Memory only: a write here would come before `held` is restored. A stop before the next write drops it again.
    this.removing = (saved.removing ?? []).filter((key) => { const repo = this.repos.find((other) => keyOf(other) === key); return repo !== undefined && typeOf(repo.workTree) === undefined; });
    const current = await this.read();
    if (!(saved.held || saved.turnOpen || saved.running || saved.timeout || saved.checking) && !current.problems.length) { this.trust(current.state); return { held: false }; }
    const { files, why } = this.compare(current);
    if (!files.length) {
      this.update(() => { this.files = undefined; this.heldLine = undefined; });
      // Held by a timeout, or an outcome no write recorded, alone: still held, and said so with its line (M1-AC10).
      return this.timeout ? { held: true, files: [], line: this.line([], this.timeout, "g tries again") } : { held: false };
    }
    return this.hold(files, `${why === "changed" ? "differs from" : `${why}, or differs from`} what the last post office trusted · can't be told from your own edit`);
  }

  /** Before and after a command, and at each later use of the army: held while anything differs, and goes on once nothing does. */
  async check(): Promise<HoldCheck> {
    if (this.unverified) return this.hold([this.label(this.options.statePath)], ...UNREADABLE);
    // Write-ahead (C27): the record says an inspection is pending before the scan, so a restart before its outcome is
    // written compares with the trusted state. A failed write here scans nothing, so nothing is known that disk lacks.
    this.update(() => { this.checks++; });
    let current: Awaited<ReturnType<HarnessHold["read"]>>;
    try { current = await this.read(); } finally { this.checks--; } // in memory now; the outcome's write records it
    if (!this.trusted && !current.problems.length) { this.trust(current.state); return { held: false }; }
    const { files, why } = this.compare(current);
    if (files.length) return this.hold(files, why);
    if (!this.files) { this.update(() => {}); return { held: false }; }
    this.update(() => { this.files = undefined; this.heldLine = undefined; });
    this.options.log?.({ event: "released" });
    return { held: false };
  }

  /** The owner answered y on the guard's card, or Shadow Army's own command changed these files: this is the trusted state. */
  async accept(): Promise<void> {
    const current = await this.read();
    if (current.problems.length) throw new Uninspectable(current.problems.join(", "), "the state can't be accepted");
    this.trust(current.state, true);
  }

  /**
   * A snapshot or worktree this army made: its own metadata and submodules as they are now are trusted, and
   * harness git may run in it. What another covered repository also reads (the shared config, hooks, info, the
   * user's config) keeps the hash already trusted, so a change to it is still held (C13). A repository already
   * trusted is checked against that baseline, never trusted again: a change holds.
   */
  register(repo: GitRepo): Promise<void> {
    // One at a time: two overlapping registrations would each see no baseline and the later replace the first (C16).
    const next = this.registering.then(() => this.registerNow(repo));
    this.registering = next.catch(() => {});
    return next;
  }

  private async registerNow(repo: GitRepo): Promise<void> {
    const key = keyOf(repo), find = () => this.repos.find((other) => keyOf(other) === key);
    if (find() && !same(find()!, repo)) throw new Error(`harness git: ${repo.gitDir} is already registered with another working tree or common folder`);
    if (!this.trusted) throw new Error("harness git: a repository registers only once the folder's own state is trusted");
    // Every slot, present or absent, checked before the scan. A known repository's pointer that no longer matches
    // isn't refused but held, by the comparison with its baseline below, as a check would hold it.
    let pointers: TrustedState = {};
    try { pointers = this.pointers(repo); } catch (error) { if (!(error instanceof PointerError) || !(find() && this.trusted[key])) throw error; }
    const { state, problems } = await readState(this.options.repo, find() ?? repo, this.options.gitFor, this.options.limits);
    if (problems.length) throw new Uninspectable(problems.join(", "), "the repository can't be trusted");
    // The pointers the scan read are the ones checked against the tuple, not ones swapped in or added meanwhile (C15, C19).
    const moved = find() && this.trusted?.[key] ? [] : this.drift(pointers, state); // a known one: its baseline holds
    if (moved.length) throw new Error(`harness git: ${moved.join(", ")} changed while ${repo.gitDir} registered`);
    // Looked up again after the scan: a registration that finished meanwhile set the baseline this one is checked against (C16).
    const known = find(), baseline = this.trusted?.[key];
    if (known && !same(known, repo)) throw new Error(`harness git: ${repo.gitDir} is already registered with another working tree or common folder`);
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
    // Shared state that already differs is held, in the same write as the baseline, so no restart trusts it (C17).
    const files = changedFiles(own, state), why = "changed before it was registered";
    // A record that can't be written leaves nothing registered, in memory either.
    this.update(() => {
      this.repos = known ? this.repos : [...this.repos, repo];
      this.trusted = { ...this.trusted, [key]: own };
      if (files.length) this.files = [...new Set([...this.files ?? [], ...files])].sort();
    });
    // Recorded now. A held repository stays registered though this throws: the caller unregisters it to remove it.
    try { this.options.log?.({ event: "trusted", hashes: own }); } finally {
      if (files.length) this.options.log?.({ event: "held", files, reason: why });
    }
    if (files.length) throw new HarnessGitHeld(this.line(files, why));
  }

  /**
   * A new repository's pointers, checked against the tuple it registers with (WSP-10): its `.git` (a file naming
   * `gitDir`, or `gitDir` itself), its `commondir` (required unless `gitDir` is the common folder) and any `gitdir`
   * (naming its `.git`). Gives every slot under the scan's label: the file's hash, or ABSENT where the scan hashes
   * nothing, so a slot that appears, goes or changes before the scan reads it differs (C19). Run before every scan.
   */
  private pointers(repo: GitRepo): TrustedState {
    const label = (path: string) => `submodule ${this.label(path)}`;
    const dotGit = join(repo.workTree, ".git"), commondir = join(repo.gitDir, "commondir"), gitdir = join(repo.gitDir, "gitdir");
    const out: TrustedState = { [label(dotGit)]: ABSENT, [label(commondir)]: ABSENT, [label(gitdir)]: ABSENT };
    const read = (path: string, what: string) => {
      const type = typeOf(path);
      if (type !== "file") throw new PointerError(path, `harness git: ${path} ${type === undefined ? "is missing" : "isn't a regular file"}, so ${what} can't be checked`);
      const text = readRegular(path, this.options.limits?.bytes ?? LIMITS.bytes);
      out[label(path)] = sha(text);
      return text.toString("utf8").trim();
    };
    const expect = (path: string, named: string, want: string) => {
      if (canon(named) !== canon(want)) throw new PointerError(path, `harness git: ${path} names ${named}, not the registered ${want}`);
    };
    if (typeOf(dotGit) === "folder") expect(dotGit, dotGit, repo.gitDir);
    else {
      const named = /^gitdir:\s*(.+)$/.exec(read(dotGit, "the working tree's git folder"))?.[1];
      if (!named) throw new PointerError(dotGit, `harness git: ${dotGit} names no git folder`);
      expect(dotGit, resolve(repo.workTree, named), repo.gitDir);
    }
    if (typeOf(commondir) !== undefined || canon(repo.gitDir) !== canon(repo.commonDir)) expect(commondir, resolve(repo.gitDir, read(commondir, "the common folder")), repo.commonDir);
    if (typeOf(gitdir) !== undefined) expect(gitdir, resolve(repo.gitDir, read(gitdir, "the working tree")), dotGit);
    return out;
  }

  /** The pointer slots the scan read differently from `pointers`: present for an absent slot, absent, or another hash. */
  private drift(pointers: TrustedState, state: TrustedState) {
    return Object.entries(pointers).filter(([label, hash]) => (state[label] ?? ABSENT) !== hash).map(([label]) => label.replace(/^submodule /, ""));
  }

  /**
   * Shadow Army's own command is about to remove it: recorded before anything goes, so a folder of it found gone,
   * now or after a restart, is that removal's and not held (C21, WSP-10). `unregister` finishes it; `endRemoval`
   * ends one that failed or stopped.
   */
  beginRemoval(repo: GitRepo) {
    const key = keyOf(repo);
    if (key === keyOf(this.options.repo) || !this.repos.some((other) => same(other, repo)) || this.removing.includes(key)) return;
    this.update(() => { this.removing = [...this.removing, key]; });
  }

  /** The removal `beginRemoval` recorded failed or stopped: a folder of it found gone after this is held (C21). */
  endRemoval(repo: GitRepo) {
    const key = keyOf(repo);
    if (!this.removing.includes(key)) return;
    this.update(() => { this.removing = this.removing.filter((other) => other !== key); }); // a failed write leaves it to retry (C23)
  }

  /** Shadow Army's own command removed it. */
  unregister(repo: GitRepo): Promise<void> {
    // In the registrations' queue, so no baseline goes away while a registration is checked against it.
    const next = this.registering.then(() => this.unregisterNow(repo));
    this.registering = next.catch(() => {});
    return next;
  }

  private async unregisterNow(repo: GitRepo): Promise<void> {
    if (keyOf(repo) === keyOf(this.options.repo) || !this.repos.some((other) => same(other, repo))) return;
    this.update(() => { // copies, not edits in place, so a failed write leaves it registered to retry (C23)
      this.repos = this.repos.filter((other) => !same(other, repo));
      this.removing = this.removing.filter((key) => key !== keyOf(repo));
      if (this.trusted) { const { [keyOf(repo)]: _gone, ...rest } = this.trusted; this.trusted = rest; }
    });
  }

  /** The next use of the army tries again after a timeout (WSP-10). */
  retry() { this.update(() => { this.timeout = undefined; }); }

  /**
   * Run harness git in `repo`, one this hold covers (all three paths), with the paths it was registered with,
   * between a check before and one after. The after-check runs
   * whether the command succeeded or not, and a change on either side holds; the command's own error is the one thrown.
   */
  async run(repo: GitRepo, args: string[], kind: HarnessKind = "other"): Promise<GitResult> {
    const covered = this.repos.find((other) => same(other, repo));
    if (!covered) throw new Error(`harness git: ${repo.gitDir} isn't a repository this hold covers`);
    const gate = (checked: boolean) => {
      if (this.timeout) throw new HarnessGitHeld(this.timeout);
      // Its folder is gone in a removal recorded as begun, which no scan covers, so nothing runs there (C20, C21).
      // Gone with none recorded, the check below holds and names it.
      if (this.removing.includes(keyOf(covered)) && typeOf(covered.workTree) === undefined) throw new Error(`harness git: ${covered.workTree} is being removed`);
      if (checked && this.files) throw new HarnessGitHeld(this.heldLine ?? this.line(this.files, "changed"));
    };
    gate(false);
    const before = await this.check();
    if (before.held) throw new HarnessGitHeld(before.line);
    // Every gate again after the await, just before git starts: another command's timeout or hold may have landed (C28).
    gate(true);
    // A guard command sees into every submodule: no `ignore`, in a config or a `.gitmodules`, at any depth (WSP-10).
    const config: [string, string][] = kind !== "guard" ? []
      : [["diff.ignoreSubmodules", "none"], ...this.names.map((name): [string, string] => [`submodule.${name}.ignore`, "none"])];
    this.update(() => { this.active++; });
    let result: GitResult | undefined, failure: unknown, after: HoldCheck | undefined;
    try {
      try { result = await this.options.gitFor(covered, config).run(args, kind); } catch (error) {
        failure = error;
        // Held in memory first, then saved as it's caught, with the running marker still set, before the after-check
        // is awaited (C24). If that write fails, the hold still stands here, and the next write records it.
        if (error instanceof HarnessGitHeld) { this.timeout = error.reason; try { this.update(() => {}); } catch (written) { failure = written; } }
      }
      after = await this.check();
    } finally {
      // An after-check that failed leaves the outcome unknown: held here as a restart holds the `running` record,
      // until g tries again (C25). The decrement stays in memory; disk says running until a write records the
      // outcome with it, so a failed write here leaves the record on the safe side (C26).
      if (after === undefined && !this.held) this.timeout = UNRECORDED;
      this.active--;
      this.update(() => {});
    }
    if (failure !== undefined) throw failure;
    if (after!.held) throw new HarnessGitHeld(after!.line);
    return result!;
  }

  /** A turn's guard is open until it has closed (PO-8): a restart then trusts the saved state, not the current one. */
  setTurnOpen(open: boolean) { this.update(() => { this.turnOpen = open; }); }

  /** Every covered repository's state, or the first thing that can't be inspected. */
  private async read(): Promise<{ state: Record<string, TrustedState>; problems: string[]; fatal: boolean }> {
    const state: Record<string, TrustedState> = {}, names = new Set<string>(), problems = new Set<string>();
    let fatal = false;
    for (const repo of this.repos) {
      // Every tuple's pointers, at startup, each check and an accept too, before any baseline is set from the scan (C20).
      // A worktree whose folder is gone isn't scanned, and its trusted state stands, compared again if the folder
      // comes back. Only a removal the record says began, which WSP-10 finishes and unregisters, leaves it unheld;
      // any other is held, naming the folder (C21).
      let pointers: TrustedState | undefined, gone = false;
      try {
        gone = keyOf(repo) !== keyOf(this.options.repo) && typeOf(repo.workTree) === undefined;
        if (!gone && typeOf(repo.gitDir) !== undefined) pointers = this.pointers(repo);
      } catch (error) {
        if (!(error instanceof PointerError || error instanceof Uninspectable)) throw error;
        problems.add(this.label(error.path));
      }
      if (gone) {
        if (!this.removing.includes(keyOf(repo))) problems.add(this.label(repo.workTree));
        state[keyOf(repo)] = this.trusted?.[keyOf(repo)] ?? {};
        continue;
      }
      const read = await readState(this.options.repo, repo, this.options.gitFor, this.options.limits);
      for (const label of pointers ? this.drift(pointers, read.state) : []) problems.add(label);
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
    const line = this.line(files, why, how);
    // Fail closed: the hold stands in memory first, with its event pending, and the write records both; if the write
    // fails, both stay, and the first write that succeeds records the hold and logs its event (C26, C29).
    if (!this.files || this.files.join("\0") !== files.join("\0")) this.pending = [...this.pending, { files, reason: why }];
    this.files = files; this.heldLine = line;
    this.update(() => {});
    return { held: true, files, line };
  }

  private line(files: string[], why: string, how = "undo it to go on") { return `Shadow Army: harness git held · ${files.length ? `${files.join(", ")} ` : ""}${why} · ${how}`; }

  private trust(state: Record<string, TrustedState>, accepted = false) {
    this.update(() => { this.trusted = state; this.files = undefined; this.heldLine = undefined; if (accepted) this.unverified = false; });
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

  /**
   * Persist first (C23, C24): `change` is applied and the record written in one step, with nothing awaited
   * between; if the write fails, every field `change` set is put back as it was, so the caller's retry writes it
   * again. What makes it more held is set before, not in `change`, so a failed write keeps it (C27). Every change
   * to what the record holds goes through here. Once a write succeeds, the held events it holds are logged (C29).
   */
  private update(change: () => void) {
    const before = { repos: this.repos, trusted: this.trusted, files: this.files, heldLine: this.heldLine, turnOpen: this.turnOpen,
      active: this.active, checks: this.checks, timeout: this.timeout, removing: this.removing, unverified: this.unverified, pending: this.pending };
    change();
    try { this.save(); } catch (error) { Object.assign(this, before); throw error; }
    if (!this.pending.length) return;
    const events = this.pending;
    for (const event of events) this.options.log?.({ event: "held", files: event.files, reason: event.reason });
    this.pending = [];
    // The record still lists them until this write: a failure leaves that to the next one, and a restart before it logs them again.
    try { this.save(); } catch { /* left to the next write */ }
  }

  /** Written whole: to a file beside it, then renamed over it. */
  private save() {
    if (this.unverified || !this.trusted) return;
    const record: Persisted = { version: 2, repos: this.repos, trusted: this.trusted,
      ...(this.files ? { held: { files: this.files } } : {}), ...(this.turnOpen ? { turnOpen: true } : {}),
      ...(this.pending.length ? { unlogged: this.pending } : {}), ...(this.checks > 0 ? { checking: true } : {}),
      ...(this.active > 0 ? { running: true } : {}), ...(this.timeout ? { timeout: this.timeout } : {}),
      ...(this.removing.length ? { removing: this.removing } : {}) };
    const path = this.options.statePath, temp = `${path}.${process.pid}.tmp`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temp, JSON.stringify(record));
    renameSync(temp, path);
  }
}
