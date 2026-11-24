import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { HarnessGitHeld, type GitResult, type HarnessKind } from "./harness.js";

/**
 * WSP-10's hold. Harness git compares what git reads for a repository (config, `hooks/`, `info/`, and the
 * same for every checked-out submodule) with the state Shadow Army last trusted. Any other change holds
 * harness git, across restarts, until the change is gone. `branch.*` and `remote.*` are left out, as
 * `git push -u` writes them. Not here: worktree metadata, and the copies of trusted files a card diffs from (M2).
 */

/** Hash of each watched thing, by a label that names the file the way the transcript line shows it. */
export type TrustedState = Record<string, string>;

/** Where git for a repository is: what harness git is given as GIT_DIR, GIT_WORK_TREE and GIT_COMMON_DIR. */
export interface GitRepo { gitDir: string; workTree: string; commonDir: string }
export interface GitRunner { run(args: string[], kind?: HarnessKind): Promise<GitResult> }

export interface HoldEvent { event: "trusted" | "held" | "released"; files?: string[]; hashes?: TrustedState; reason?: string }

export interface HarnessHoldOptions {
  repo: GitRepo;
  /** Harness git for any repository, a submodule's included (it gets that submodule's own git folder). */
  gitFor(repo: GitRepo): GitRunner;
  /** The post office's own file for this repository's hold, kept beside its log. */
  statePath: string;
  log?: (event: HoldEvent) => void;
  /** How deep to follow submodules inside submodules. */
  maxDepth?: number;
}

interface Persisted { trusted: TrustedState; held?: { files: string[] }; turnOpen?: boolean }

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const slash = (path: string) => path.replace(/\\/g, "/");
const isFile = (path: string) => { try { return statSync(path).isFile(); } catch { return false; } };
const isFolder = (path: string) => { try { return statSync(path).isDirectory(); } catch { return false; } };
const real = (path: string) => { try { return realpathSync(path); } catch { return path; } };
const uncounted = /^(branch|remote)\./i;

/** Each file under `folder`, hashed. A missing folder has none. */
function hashFolder(folder: string, label: string, into: TrustedState) {
  if (!isFolder(folder)) return;
  for (const name of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, name.name);
    if (name.isDirectory()) hashFolder(path, `${label}/${name.name}`, into);
    else { try { into[`${label}/${name.name}`] = sha(readFileSync(path)); } catch { into[`${label}/${name.name}`] = "unreadable"; } }
  }
}

/** The config git reads, every scope but the command line, includes followed, one hash per file it came from. */
async function hashConfig(git: GitRunner, label: (origin: string) => string, into: TrustedState) {
  const result = await git.run(["config", "--list", "--show-origin", "--show-scope", "-z"]);
  if (result.code !== 0) throw new Error(`git config --list failed: ${result.stderr.trim()}`);
  const fields = result.stdout.split("\0");
  const groups = new Map<string, string[]>();
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const [scope, origin, entry] = [fields[i]!, fields[i + 1]!, fields[i + 2]!];
    if (scope === "command" || !origin.startsWith("file:") || uncounted.test(entry)) continue;
    const key = label(origin.slice("file:".length));
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  for (const [key, entries] of groups) into[`config ${key}`] = sha(entries.join("\0"));
}

/** What a repository's git reads, and the same for each submodule checked out in it, at any depth. */
export async function readState(options: Pick<HarnessHoldOptions, "repo" | "gitFor" | "maxDepth">): Promise<TrustedState> {
  const state: TrustedState = {};
  const seen = new Set<string>();
  const walk = async (repo: GitRepo, depth: number) => {
    const where = (path: string) => {
      const rel = relative(options.repo.workTree, path);
      return slash(rel.startsWith("..") || isAbsolute(rel) ? path : rel);
    };
    const git = options.gitFor(repo);
    await hashConfig(git, (origin) => where(resolve(repo.workTree, origin)), state);
    for (const folder of new Set([repo.commonDir, repo.gitDir])) {
      for (const name of ["hooks", "info"]) hashFolder(join(folder, name), where(join(folder, name)), state);
    }
    if (depth >= (options.maxDepth ?? 8)) return;
    const listed = await git.run(["ls-files", "-s", "-z"]);
    if (listed.code !== 0) return;
    for (const entry of listed.stdout.split("\0")) {
      const match = /^160000 [0-9a-f]+ \d\t(.+)$/.exec(entry);
      if (!match) continue;
      const folder = join(repo.workTree, match[1]!);
      const dotGit = join(folder, ".git");
      let gitDir: string | undefined;
      if (isFile(dotGit)) {
        const text = readFileSync(dotGit, "utf8");
        state[`submodule ${where(dotGit)}`] = sha(text);
        const named = /^gitdir:\s*(.+?)\s*$/m.exec(text)?.[1];
        if (named) gitDir = resolve(folder, named);
      } else if (isFolder(dotGit)) gitDir = dotGit;
      if (!gitDir || !isFolder(gitDir) || seen.has(real(gitDir))) continue;
      seen.add(real(gitDir));
      let commonDir = gitDir;
      const commondir = join(gitDir, "commondir");
      if (isFile(commondir)) {
        const text = readFileSync(commondir, "utf8");
        state[`submodule ${where(commondir)}`] = sha(text);
        commonDir = resolve(gitDir, text.trim());
      }
      state[`submodule ${where(gitDir)}`] = "present";
      await walk({ gitDir, workTree: folder, commonDir }, depth + 1);
    }
  };
  await walk(options.repo, 0);
  return state;
}

/** Labels that differ: added, removed or changed. The same label as in the transcript line. */
export function changedFiles(trusted: TrustedState, current: TrustedState): string[] {
  const names = new Set([...Object.keys(trusted), ...Object.keys(current)]);
  return [...names].filter((name) => trusted[name] !== current[name]).map((name) => name.replace(/^(config|submodule) /, "")).sort();
}

export type HoldCheck = { held: false } | { held: true; files: string[]; line: string };

export class HarnessHold {
  private trusted: TrustedState = {};
  private files: string[] | undefined;
  private turnOpen = false;

  constructor(private readonly options: HarnessHoldOptions) {}

  get held() { return this.files !== undefined; }

  /**
   * The post office's start. Where the last one ended held, or with a turn still open, the state that
   * log last trusted is kept; otherwise the state as it is now is the trusted one. A change since then
   * can't be told from the owner's, and the line says so.
   */
  async start(): Promise<HoldCheck> {
    const saved = this.load();
    const current = await readState(this.options);
    if (!saved || (!saved.held && !saved.turnOpen)) { this.trust(current); return { held: false }; }
    this.trusted = saved.trusted;
    this.turnOpen = saved.turnOpen === true;
    const files = changedFiles(this.trusted, current);
    if (!files.length) { this.files = undefined; this.save(); return { held: false }; }
    return this.hold(files, "differs from what the last post office trusted · can't be told from your own edit");
  }

  /** Before and after a command, and at each later use of the army: held while anything differs, and goes on once nothing does. */
  async check(): Promise<HoldCheck> {
    const files = changedFiles(this.trusted, await readState(this.options));
    if (files.length) return this.hold(files, "changed");
    if (this.held) { this.files = undefined; this.save(); this.options.log?.({ event: "released" }); }
    return { held: false };
  }

  /** The owner answered y on the guard's card, or Shadow Army's own command changed these files: this is the trusted state. */
  async accept(): Promise<void> { this.trust(await readState(this.options)); }

  /** Run harness git between a check before and one after. A change on either side holds, and throws. */
  async run(git: GitRunner, args: string[], kind: HarnessKind = "other"): Promise<GitResult> {
    const before = await this.check();
    if (before.held) throw new HarnessGitHeld(before.line);
    const result = await git.run(args, kind);
    const after = await this.check();
    if (after.held) throw new HarnessGitHeld(after.line);
    return result;
  }

  /** A turn's guard is open until it has closed (PO-8): a restart then trusts the saved state, not the current one. */
  setTurnOpen(open: boolean) { this.turnOpen = open; this.save(); }

  private hold(files: string[], why: string): HoldCheck {
    const line = `Shadow Army: harness git held · ${files.join(", ")} ${why} · undo it to go on`;
    const fresh = !this.files || this.files.join("\0") !== files.join("\0");
    this.files = files;
    this.save();
    if (fresh) this.options.log?.({ event: "held", files, reason: why });
    return { held: true, files, line };
  }

  private trust(state: TrustedState) {
    this.trusted = state; this.files = undefined; this.save();
    this.options.log?.({ event: "trusted", hashes: state });
  }

  private load(): Persisted | undefined {
    try { return JSON.parse(readFileSync(this.options.statePath, "utf8")) as Persisted; } catch { return undefined; }
  }

  private save() {
    const record: Persisted = { trusted: this.trusted, ...(this.files ? { held: { files: this.files } } : {}), ...(this.turnOpen ? { turnOpen: true } : {}) };
    if (!existsSync(dirname(this.options.statePath))) mkdirSync(dirname(this.options.statePath), { recursive: true });
    writeFileSync(this.options.statePath, JSON.stringify(record));
  }
}
