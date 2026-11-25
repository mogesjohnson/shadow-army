import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { loadRoster, type Roster, type SoldierSpec } from "../core/roster.js";
import { applyAudited } from "./apply.js";
import { diffState, MAX_HASHED, type RepoState } from "../workspace/guard.js";
import { splitZ } from "../workspace/git.js";
import { Locks } from "../workspace/locks.js";
import { ensureShadowRoot, openWriteSession, type SessionGit, type WriteSession } from "../workspace/session.js";
import { HarnessGit, HarnessGitHeld } from "./git/harness.js";
import { HarnessHold, type GitRepo } from "./git/hold.js";
import { beginTurn, discardWrites, findWrites, FOLDER_FILE, openSnapshot, posixInspect, realish, removeInside, snapshotSubfolder, validateSnapshotRoot, within, type GitFactory, type RunGit, type Snapshot, type TurnStart } from "./snapshot.js";
import type { ChannelEvent, ChannelFactory, NativeChannel, TurnResult, WriteOutcome } from "./channel.js";
import { ClaudeChannel } from "./claude.js";
import { buildStandingInstructions, shadowName } from "./instructions.js";
import { redact, SessionLogs } from "./logs.js";
import { containmentFailedMessage, DownSoldiers, holdGuardOpen, parseTreeLine, readTrees, stillRunning, TreeRecord, treesDir, type TreeLine, type Identity, type Leftover, type ProcessOps } from "./contain/trees.js";
import { sweepTrees, systemOps, type SweepOps } from "./contain/sweep.js";
import { parseStat } from "./contain/linux.js";

/**
 * A channel that names its tree's processes (PO-11): the guardian and CLI it started, and a listing of the rest.
 * The Claude channel exposes neither yet (#138); its record then holds the post office's identity alone.
 */
type ListedChannel = NativeChannel & { list?(): Promise<Identity[]>; identities?(): Promise<{ guardian?: Identity; cli?: Identity }> };
/** PO-1: each turn's checkout baseline is kept on disk while the turn runs, so a later post office can close its guard. */
const turnsDir = (root: string) => join(root, ".shadow", "v2", "turns");
/** WSP-11: each snapshot's path and git folder as read when it was made, so a later start never reads them from the snapshot. */
const snapshotsDir = (root: string) => join(root, ".shadow", "v2", "snapshots");
const stateToJson = (state: RepoState) => ({ ...state, dirty: [...state.dirty], index: [...state.index], refs: [...state.refs] });
const stateFromJson = (value: ReturnType<typeof stateToJson>): RepoState => ({ head: value.head, branch: value.branch, dirty: new Map(value.dirty), index: new Map(value.index), refs: new Map(value.refs) });
/**
 * What automatic termination needs beyond the sweep's operations (PO-15, PO-16): a probe that says "gone" only when the
 * machine says no such process runs and throws when it can't tell, and an end bound to the process's identity.
 */
export interface OfficeOps extends SweepOps {
  probe(pid: number): Promise<number | "gone">;
  /** Ends the process (its tree with `tree`) only while it is still that identity, in one step bound to it. */
  endIdentity(identity: Identity, tree?: boolean): Promise<void>;
}
/** An injected `SweepOps` (tests, the server's fakes) is trusted to report absence as `undefined`; the machine's never is. */
const asOfficeOps = (ops: SweepOps | OfficeOps): OfficeOps => "probe" in ops && "endIdentity" in ops ? ops : {
  ...ops,
  probe: async (pid) => (await ops.startTimeOf(pid)) ?? "gone",
  endIdentity: async (identity, tree = false) => { if ((await ops.startTimeOf(identity.pid)) === identity.startTime) await ops.endProcess(identity.pid, tree); },
};
const run = promisify(execFile);
/** Windows' own PowerShell and taskkill by absolute path, never a PATH lookup. */
const system32 = (...parts: string[]) => join(process.env.SystemRoot ?? "C:\\Windows", "System32", ...parts);
async function powershell(script: string): Promise<string> {
  return (await run(system32("WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true })).stdout.trim();
}
/** The machine's operations for the office: Linux through `/proc`, Windows through a process handle held across check and end. */
function machineOps(): OfficeOps | undefined {
  let base: SweepOps;
  try { base = systemOps(); } catch { return undefined; }
  if (process.platform === "linux") {
    const probe = async (pid: number): Promise<number | "gone"> => {
      let text: string;
      try { text = await readFile(`/proc/${pid}/stat`, "latin1"); } catch (error) {
        if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) return "gone";
        throw error;
      }
      if ("ZX".includes(text[text.lastIndexOf(")") + 2] ?? "?")) return "gone";
      const startTime = parseStat(pid, text)?.startTime;
      if (startTime === undefined) throw new Error(`process ${pid}'s start time can't be read`);
      return startTime;
    };
    // Node has no pidfd: the identity is checked immediately before the signal, with nothing awaited between.
    return { ...base, probe, startTimeOf: async (pid) => { const time = await probe(pid); return time === "gone" ? undefined : time; },
      endIdentity: async ({ pid, startTime }, tree = false) => {
        if ((await probe(pid)) !== startTime) return;
        try { process.kill(tree ? -pid : pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      } };
  }
  if (process.platform === "win32") {
    const time = "([DateTimeOffset]$p.StartTime).ToUnixTimeMilliseconds()";
    const probe = async (pid: number): Promise<number | "gone"> => {
      const out = await powershell(`$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($null -eq $p) { 'gone' } else { ${time} }`);
      if (out === "gone") return "gone";
      if (!/^\d+$/.test(out)) throw new Error(`process ${pid}'s start time can't be read`);
      return Number(out);
    };
    // The handle opened before the check stays open through the end, so the pid can't pass to another process between.
    return { ...base, probe, startTimeOf: async (pid) => { const found = await probe(pid); return found === "gone" ? undefined : found; },
      endIdentity: async ({ pid, startTime }, tree = false) => {
        await powershell(`$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($null -ne $p) { $null = $p.Handle; if (${time} -eq ${startTime}) { ${tree ? `& '${system32("taskkill.exe")}' /t /f /pid ${pid} | Out-Null` : "$p.Kill()"} } }`);
      } };
  }
  return undefined;
}
/** PO-1: one line per finished turn, by turn ID, flushed before its baseline goes; a later start never reports it twice. */
const completedFile = (root: string) => join(root, ".shadow", "v2", "completed-turns.jsonl");
/** Writes a whole file or none of it: a flushed temporary file renamed over the target. */
async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temp, "w", 0o600);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, file).catch(async (error: unknown) => { await unlink(temp).catch(() => {}); throw error; });
}
/** The turn IDs whose completion is on disk; a line that doesn't parse is skipped (PO-5). */
async function completedTurns(root: string): Promise<Set<string>> {
  const text = await readFile(completedFile(root), "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return ""; throw error; });
  const done = new Set<string>();
  for (const line of text.split(/\r?\n/)) { try { const turn = (JSON.parse(line) as { turn?: unknown }).turn; if (typeof turn === "string") done.add(turn); } catch { /* skipped */ } }
  return done;
}
/** Appends a turn's completion, flushed, and reads it back: only a completion found on disk lets the baseline go. */
async function completeTurn(root: string, entry: { turn: string } & Record<string, unknown>): Promise<void> {
  await mkdir(dirname(completedFile(root)), { recursive: true });
  const handle = await open(completedFile(root), "a", 0o600);
  try { await handle.appendFile(`${JSON.stringify(entry)}\n`); await handle.sync(); } finally { await handle.close(); }
  if (!(await completedTurns(root)).has(entry.turn)) throw new Error(`turn ${entry.turn}'s completion is not on disk`);
}

export interface OfficeEvent { soldier?: string; type: string; data: unknown; }
export interface OfficeOptions {
  cwd: string;
  credential: string;
  roster?: Roster;
  channelFactory?: ChannelFactory;
  onEvent?: (event: OfficeEvent) => void;
  /** Waits before the first, second and third automatic restart (PO-1: 1, 5 and 30 seconds). */
  restartDelaysMs?: readonly number[];
  /** Harness git for a repository (WSP-10); tests pass their own. */
  gitFactory?: GitFactory;
  /** The machine's processes (PO-15, PO-16); tests pass fakes. `null` where the platform has none yet (macOS: M1b-18). */
  processOps?: SweepOps | OfficeOps | null;
}

/** The repository `cwd` is in, found from its `.git` as git finds it, so nothing the repository names runs to find it. */
export function findRepo(cwd: string): GitRepo {
  for (let dir = resolve(cwd), past = ""; dir !== past; past = dir, dir = dirname(dir)) {
    const dotGit = join(dir, ".git");
    let gitDir: string;
    try { gitDir = statSync(dotGit).isDirectory() ? dotGit : resolve(dir, readFileSync(dotGit, "utf8").replace(/^gitdir:\s*/, "").trim()); } catch { continue; }
    let commonDir = gitDir;
    try { commonDir = resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf8").trim()); } catch { /* the main working tree */ }
    return { gitDir, workTree: dir, commonDir };
  }
  throw new Error("the army runs only inside a git working tree");
}
/** v1's heartbeat stops at the first audit, so the office renews the claims lease for the session's whole life and at every turn (WSP-2). */
const WRITE_LEASE_MS = 60 * 60_000;
const RESTART_DELAYS_MS = [1_000, 5_000, 30_000];
/** PO-1: a fourth crash within 10 minutes of the first leaves a channel down; 10 minutes without a crash resets the count. */
const CRASH_WINDOW_MS = 10 * 60_000;
export interface TurnOptions { claims?: string[]; }
interface Session {
  spec: SoldierSpec;
  /** `applied` is the branch tip last put into the owner's folder, so a later turn applies only what is new. */
  /** `tip` is the branch tip after the last turn; `lease` is v1's claims lease, renewed here; `leaseLost` sticks once a renewal fails. */
  write?: { ws: WriteSession; repo: GitRepo; claims: string[]; applied?: string; tip?: string; lease?: { locks: Locks; id: string }; leaseLost?: boolean; heartbeat?: ReturnType<typeof setInterval> };
  /** The checkout state at the start of the running turn, carried past Shadow Army's own applies (W12-3). */
  guardBase?: RepoState;
  /** Times of the crashes counted toward PO-1's limit. */
  crashes: number[];
  loginNeeded?: boolean;
  /** Ends a restart's wait early when the session closes. */
  wake?: () => void;
  id: string;
  cwd: string;
  instructions: string;
  channel?: NativeChannel;
  generation: number;
  restarts: number;
  down: boolean;
  tainted: boolean;
  active?: Promise<TurnResult>;
  restart?: Promise<void>;
  restartPending: boolean;
  stopRequested?: boolean;
  containmentFailed?: boolean;
  /** WSP-11's throwaway snapshot of HEAD, outside the folder; a read-only session's working directory. */
  snapshot?: Snapshot;
  /** WSP-11: what the running read-only turn began with. */
  turnStart?: TurnStart;
  /** PO-16's record of the soldier's process tree, removed once the tree has ended. Created before start in M1b-26. */
  tree?: TreeRecord;
  /** The current channel's guardian and CLI are in the tree's record (PO-11). */
  identified?: boolean;
}

/**
 * After an apply, move each running turn's guard base past exactly what the apply changed: a path whose state the turn
 * started with is now expected in its applied state. A path the turn had already seen change is left, so the guard still names it.
 */
function carryApply(sessions: Session[], before: RepoState, after: RepoState, paths: string[]): void {
  for (const session of sessions) {
    const base = session.guardBase;
    if (!base) continue;
    for (const key of ["dirty", "index"] as const) {
      for (const path of paths) {
        if (base[key].get(path) !== before[key].get(path)) continue;
        const now = after[key].get(path);
        if (now === undefined) base[key].delete(path); else base[key].set(path, now);
      }
    }
  }
}

/**
 * Each path's `git hash-object`, "gone" where it can't be hashed (deleted, a folder), as guard.ts records it.
 * One call per chunk of paths: a harness git call costs about 440 ms on Windows. A chunk that fails is hashed path by path.
 */
async function hashAll(run: (args: string[]) => Promise<string>, root: string, all: string[]): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  // A deleted path would fail its whole chunk; it is "gone" without a call. One deleted later still falls back below.
  const paths: string[] = [];
  for (const path of all) if (existsSync(join(root, path))) paths.push(path); else hashes.set(path, "gone");
  for (let from = 0; from < paths.length;) {
    let to = from, length = 0;
    while (to < paths.length && (to === from || length + paths[to]!.length < 8000)) length += paths[to++]!.length + 1;
    const chunk = paths.slice(from, to);
    from = to;
    const lines = await run(["hash-object", "--", ...chunk]).then((out) => out.split("\n").map((line) => line.trim()).filter(Boolean), () => []);
    if (lines.length === chunk.length) { chunk.forEach((path, i) => hashes.set(path, lines[i]!)); continue; }
    for (const path of chunk) hashes.set(path, (await run(["hash-object", "--", path]).catch(() => "gone")).trim());
  }
  return hashes;
}

/** guard.ts's checkout state, read through harness git (WSP-10), so `diffState` compares the same fields. */
async function harnessState(run: (args: string[]) => Promise<string>, root: string): Promise<RepoState> {
  const head = (await run(["rev-parse", "-q", "--verify", "HEAD"]).catch(() => "")).trim();
  const branch = (await run(["symbolic-ref", "-q", "--short", "HEAD"]).catch(() => "")).trim();
  const dirty = new Map<string, string>();
  const listed: { path: string; code: string; hashed: boolean }[] = [];
  const seen = new Set<string>();
  const entries = splitZ(await run(["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!, code = entry.slice(0, 2), path = entry.slice(3);
    if (code.startsWith("R") || code.startsWith("C")) i++;
    listed.push({ path, code, hashed: seen.size < MAX_HASHED });
    seen.add(path);
  }
  const hashes = await hashAll(run, root, [...new Set(listed.filter((item) => item.hashed).map((item) => item.path))]);
  for (const { path, code, hashed } of listed) dirty.set(path, `${code} ${hashed ? hashes.get(path)! : ""}`);
  const index = new Map<string, string>();
  for (const entry of splitZ(await run(["ls-files", "--stage", "-z"]))) {
    const tab = entry.indexOf("\t"), path = entry.slice(tab + 1);
    index.set(path, `${index.get(path) ?? ""}${entry.slice(0, tab)}\n`);
  }
  const refs = new Map<string, string>();
  for (const line of (await run(["for-each-ref", "--format=%(refname) %(objectname)"])).split("\n")) {
    const [name, oid] = line.trim().split(" ");
    if (name && oid && !/^refs\/heads\/shadow\//.test(name)) refs.set(name, oid);
  }
  return { head, branch, dirty, index, refs };
}

/** M1 transport foundation. Routing, write claims, handoffs and background-job attribution are later milestones. */
export class PostOffice {
  readonly root: string;
  private readonly roster: Roster;
  private readonly logs: SessionLogs;
  private readonly sessions = new Map<string, Session>();
  /** PO-15: soldiers whose containment failed at their close; nothing restarts them by itself. */
  readonly downSoldiers = new DownSoldiers();
  private readonly opening = new Map<string, Promise<Session>>();
  private readonly factory: ChannelFactory;
  private closed = false;
  private closePromise?: Promise<void>;
  private logPending = Promise.resolve();
  private logFailure?: Error;
  private readonly secrets: string[];
  /** Applies and guard captures take turns, so no guard reads the owner's folder halfway through an apply. */
  private applying = Promise.resolve();
  /** WSP-10's hold on harness git, set at create. */
  private hold?: HarnessHold;
  /** One harness git for the folder, so a guard timed out twice stays held (WSP-10). */
  private readonly officeGit: { run: RunGit };
  private readonly ops: OfficeOps | undefined;
  /** C1: earlier trees verified and swept with nothing left; until then the recovery fails and no new soldier starts. */
  private swept = false;
  /** The post office's own identity for its tree records, read once. */
  private self?: Promise<Identity>;
  /** How many turns have their guard open (PO-8). */
  private openTurns = 0;
  /** PO-1's recovery: running, done, and what it reads once (the last log's end, earlier offices' tree records). */
  private recovery?: Promise<void>;
  private recovered = false;
  private holdStarted = false;
  private lastLogEnd?: string;
  private earlierTrees?: Awaited<ReturnType<typeof readTrees>>;

  private constructor(root: string, private readonly repo: GitRepo, private readonly git: GitFactory,
    private readonly snapshots: { ok: true; root: string } | { ok: false; reason: string }, private readonly options: OfficeOptions) {
    this.root = root;
    this.officeGit = git(repo);
    this.roster = options.roster ?? loadRoster(root);
    this.factory = options.channelFactory ?? ((settings) => new ClaudeChannel(settings));
    this.secrets = [options.credential];
    this.logs = new SessionLogs(join(root, ".shadow", "v2", "logs"), this.secrets);
    this.ops = options.processOps === undefined ? machineOps() : options.processOps ? asOfficeOps(options.processOps) : undefined;
  }

  /** The office with PO-1's recovery done, for callers that hold the folder themselves. A held recovery resumes at the next open. */
  static async create(options: OfficeOptions): Promise<PostOffice> {
    const office = await PostOffice.prepare(options);
    await office.recover().catch(() => {});
    return office;
  }

  /** The office before PO-1's recovery: it changes nothing an earlier post office left, so a caller that loses the folder lock touched none of it. */
  static async prepare(options: OfficeOptions): Promise<PostOffice> {
    if (!/^[a-f0-9]{64}$/i.test(options.credential)) throw new Error("post office requires a credential of 32 random bytes");
    const found = findRepo(options.cwd);
    // WSP-10: an empty hooks folder Shadow Army keeps; PATH may not name the folder or the snapshots.
    const hooksDir = join(found.workTree, ".shadow", "v2", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    // WSP-11: the snapshot root, the default one too, lies outside every linked working tree of the repository.
    const lister = options.gitFactory ?? ((repo) => new HarnessGit({ repo, hooksDir, untrusted: [found.workTree] }));
    const listed = await lister(found).run(["worktree", "list", "--porcelain"], "guard");
    if (listed.code !== 0) throw new Error(`the army can't list the repository's working trees: ${listed.stderr.trim()}`);
    const workTrees = listed.stdout.split(/\r?\n/).filter((line) => line.startsWith("worktree ")).map((line) => line.slice(9));
    // A bad root starts no soldier, so it is kept to name at each open. The Windows ACL reader is M1b-17.
    const snapshots = validateSnapshotRoot(process.env.SHADOW_ARMY_SNAPSHOTS || join(homedir(), ".shadow-army", "snapshots"), { home: homedir(), folder: found.workTree, workTrees,
      inspect: process.platform === "win32" ? () => ({ owner: "owner", writableByOthers: false }) : posixInspect });
    const untrusted = [found.workTree, ...workTrees, ...(snapshots.ok ? [snapshots.root] : [])];
    const gitFor: GitFactory = options.gitFactory ?? ((repo) => new HarnessGit({ repo, hooksDir, untrusted }));
    // The folder as `git rev-parse --show-toplevel` prints it: the army's mark is taken from this path (WSP-11).
    const top = await gitFor(found).run(["rev-parse", "--show-toplevel"]);
    if (top.code !== 0) throw new Error(`the army runs only inside a git working tree: ${top.stderr.trim()}`);
    const root = top.stdout.trim();
    const repo = { ...found, workTree: root };
    await ensureShadowRoot(join(root, ".shadow"));
    const office = new PostOffice(root, repo, gitFor, snapshots, options);
    office.lastLogEnd = await stat(join(root, ".shadow", "v2", "logs", "post-office.jsonl")).then((file) => file.mtime.toISOString(), () => undefined);
    await office.logs.write("post-office", { type: "started", time: new Date().toISOString(), pid: process.pid });
    if (!snapshots.ok) office.record({ type: "snapshot_root", data: { ok: false, reason: snapshots.reason } });
    // WSP-10: every office-side git call checks the repository's git state against the trusted one, before and after.
    office.hold = new HarnessHold({ repo, gitFor, statePath: join(root, ".shadow", "v2", "logs", "git-hold.json"), log: (event) => office.record({ type: "git_hold", data: event }) });
    return office;
  }

  /**
   * PO-1: the lock holder's one recovery of what earlier post offices left; channel opens wait for it. While harness git is
   * held (WSP-10) the rest stays pending, and the next call resumes it once a hold check passes.
   */
  recover(): Promise<void> {
    if (this.recovered) return Promise.resolve();
    return this.recovery ??= (async () => {
      try {
        if (!this.holdStarted) {
          const held = await this.hold!.start();
          this.holdStarted = true;
          if (held.held) this.record({ type: "git_hold", data: { held: true, line: held.line } });
        }
        await this.finishLast();
        this.recovered = true;
      } catch (error) {
        this.record({ type: "startup", data: { finished: false, pending: true, reason: String(error) } });
        throw error;
      } finally { this.recovery = undefined; }
    })();
  }

  /**
   * PO-1: before any channel opens, finish what earlier post offices left: their trees (PO-16), their open turns' guards and
   * their snapshots (WSP-11). An item is logged before its file goes, so nothing is reported twice. An item whose post office
   * can't be identified as stopped stays, reported; one whose check is held or refused stays pending, and nothing is destroyed.
   */
  private async finishLast(): Promise<void> {
    const ops = this.ops;
    if (!ops) { this.record({ type: "startup", data: { finished: false, reason: `no process operations on ${process.platform}; earlier trees, turns and snapshots are left` } }); return; }
    await this.unheld();
    if (!this.swept) {
      // C1: nothing is ended until the folder, every record, the helper and each identity are verified. A gap, a failed
      // probe or a process left running keeps every entry and fails the recovery, so no new soldier starts (PO-15).
      const message = (error: unknown) => error instanceof Error ? error.message : String(error);
      let verified: { id: string; lines: TreeLine[] }[];
      try { verified = await this.verifiedTrees(ops); } catch (error) { throw new Error(`earlier trees not swept, and no soldier starts: ${message(error)}`); }
      this.earlierTrees ??= verified;
      let swept: Awaited<ReturnType<typeof sweepTrees>>;
      try { swept = await sweepTrees(this.root, this.boundOps(ops, verified)); } catch (error) { throw new Error(`earlier trees not swept, and no soldier starts: a process check failed: ${message(error)}`); }
      if (swept.swept || swept.left.length || swept.unhandled) this.record({ type: "swept", data: swept });
      if (swept.left.length || swept.unhandled) {
        const named = swept.left.map((one) => `${one.pid}${one.command ? ` ${one.command}` : ""}`).join(", ");
        throw new Error(`earlier trees still run, and no soldier starts until they stop: ${named || "no process named"}${swept.unhandled ? `; ${swept.unhandled} job(s) this machine can't end` : ""}`);
      }
      this.swept = true;
    }
    const trees = this.earlierTrees ?? [];
    const identity = async (id: string): Promise<"running" | "stopped" | "unknown"> => {
      const office = trees.find((tree) => tree.id === id.replace(/-r\d+$/, ""))?.lines.find((line) => line.kind === "post-office");
      if (!office || !("pid" in office)) return "unknown";
      // A probe that can't tell is not absence.
      const now = await ops.probe(office.pid).catch(() => undefined);
      return now === undefined ? "unknown" : now === office.startTime ? "running" : "stopped";
    };
    const unresolved = (id: string, what: string) => this.record({ type: "startup", data: { session: id, unresolved: true, line: `${what} left: the post office that ran it can't be identified as stopped` } });
    let pending: unknown, done: Set<string> | undefined;
    for (const name of (await readdir(turnsDir(this.root)).catch(() => [] as string[])).filter((name) => name.endsWith(".json"))) {
      const id = name.slice(0, -".json".length), file = join(turnsDir(this.root), name);
      const state = await identity(id);
      if (state === "unknown") unresolved(id, `${id}'s turn`);
      if (state !== "stopped") continue;
      let turn: { turn?: string; soldier?: string; time?: string; base?: ReturnType<typeof stateToJson> } = {};
      try { turn = JSON.parse(await readFile(file, "utf8")); } catch { /* reported as missing below */ }
      // A turn whose completion is already on disk was reported; only its baseline is left to remove.
      const turnId = turn.turn ?? `${id}:unreadable`;
      if ((done ??= await completedTurns(this.root)).has(turnId)) { await unlink(file).catch(() => {}); continue; }
      const who = `${turn.soldier ? shadowName(turn.soldier) : id}'s turn at ${turn.time ? new Date(turn.time).toTimeString().slice(0, 5) : "an unknown time"}`;
      let line = `${who} not checked: baseline missing`;
      if (turn.base) {
        try {
          const changes = diffState(stateFromJson(turn.base), await this.exclusive(() => this.guardState()));
          line = `${who} checked after its post office stopped: this compares the checkout now with the turn's start; the last post office's log ends at ${this.lastLogEnd ?? "an unknown time"}, and changes made since then, the owner's own included, show too: ${changes.length ? changes.join("; ") : "no change"}`;
        } catch (error) {
          // WSP-10: a held or refused check keeps the baseline for the next attempt.
          pending ??= error;
          this.record({ ...(turn.soldier ? { soldier: turn.soldier } : {}), type: "late_guard", data: { session: id, pending: true, line: `${who} not checked yet: ${String(error)}` } });
          continue;
        }
      }
      this.record({ ...(turn.soldier ? { soldier: turn.soldier } : {}), type: "late_guard", data: { session: id, line } });
      await this.logPending;
      try {
        if (this.logFailure) throw this.logFailure;
        await completeTurn(this.root, { turn: turnId, session: id, late: true, line });
        done.add(turnId);
      } catch (error) {
        // The baseline stays as evidence; the next attempt reports the turn again rather than lose it.
        pending ??= error;
        continue;
      }
      await unlink(file).catch(() => {});
    }
    for (const name of (await readdir(snapshotsDir(this.root)).catch(() => [] as string[])).filter((name) => name.endsWith(".json"))) {
      const id = name.slice(0, -".json".length), file = join(snapshotsDir(this.root), name);
      const state = await identity(id);
      if (state === "unknown") unresolved(id, `${id}'s snapshot`);
      if (state !== "stopped") continue;
      let recorded: { path?: string; root?: string; gitDir?: string; head?: string } = {};
      try { recorded = JSON.parse(await readFile(file, "utf8")); } catch { /* reported below */ }
      // WSP-11: the root the snapshot was made under, as recorded; the current setting only for records older than that.
      const root = recorded.root ?? (this.snapshots.ok ? this.snapshots.root : undefined);
      if (!recorded.path || !root) { unresolved(id, `${id}'s snapshot (no usable record)`); continue; }
      const snapshot: Snapshot = { path: recorded.path, subfolder: dirname(recorded.path), gitDir: recorded.gitDir ?? "", commonDir: this.repo.commonDir };
      try {
        if (!recorded.gitDir) {
          // A snapshot started but not made: removed as one that timed out (WSP-10).
          removeInside(root, snapshot.path);
          this.record({ type: "snapshot", data: { session: id, removed: true, made: false } });
          await this.durable();
          await unlink(file).catch(() => {});
          continue;
        }
        if (!existsSync(snapshot.path)) {
          // An orphan: its folder is gone, its worktree entry may not be. Only that entry goes, never a repository-wide prune.
          const admin = resolve(snapshot.gitDir);
          const entry = within(resolve(this.repo.commonDir, "worktrees"), admin) && existsSync(admin);
          this.record({ type: "snapshot", data: { session: id, orphan: true, line: `${id}'s snapshot at ${snapshot.path} was gone; ${entry ? "its worktree entry is removed" : "it left no worktree entry"}` } });
          await this.durable();
          if (entry) rmSync(admin, { recursive: true, force: true });
          await unlink(file).catch(() => {});
          continue;
        }
        // The git identity recorded as the snapshot was made, never re-read from the snapshot (WSP-10).
        await this.unheld();
        const own = this.git({ gitDir: snapshot.gitDir, workTree: snapshot.path, commonDir: snapshot.commonDir });
        const status = await own.run(["status", "--porcelain", "--untracked-files=all"], "guard");
        if (status.code !== 0) throw new Error(`git status failed: ${status.stderr.trim() || `exit ${status.code}`}`);
        const headNow = recorded.head ? await own.run(["rev-parse", "HEAD"], "guard") : undefined;
        await this.unheld();
        if (headNow && headNow.code !== 0) throw new Error(`git rev-parse HEAD failed: ${headNow.stderr.trim() || `exit ${headNow.code}`}`);
        const files = status.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
        const head = headNow && headNow.stdout.trim() !== recorded.head ? { from: recorded.head!, to: headNow.stdout.trim() } : undefined;
        if (files.length || head) {
          const what = [...(files.length ? [`writes: ${files.join(", ")}`] : []), ...(head ? [`HEAD moved from ${head.from} to ${head.to}`] : [])];
          this.record({ type: "read_violation", data: { session: id, files, ...(head ? { head } : {}), line: `a read-only snapshot the last post office left had ${what.join("; ")}` } });
        }
        // The report is on disk before the snapshot it describes goes.
        await this.durable();
      } catch (error) {
        pending ??= error;
        this.record({ type: "snapshot", data: { session: id, pending: true, reason: String(error) } });
        continue;
      }
      if (!await this.dropSnapshot(snapshot, undefined, root)) pending ??= new Error(`the snapshot ${snapshot.path} could not be removed`);
    }
    await this.logPending;
    if (pending) throw pending;
  }

  /** Waits for the log's pending lines; throws if a write failed, so what they report is kept (PO-5). */
  private async durable(): Promise<void> {
    await this.logPending;
    if (this.logFailure) throw this.logFailure;
  }

  /** Throws while WSP-10's hold is on: nothing office-side runs git then. */
  private async unheld(): Promise<void> {
    const state = await this.hold?.check();
    if (state?.held) throw new HarnessGitHeld(state.line);
  }

  /** Runs `fn`'s harness git calls between two hold checks (WSP-10). */
  private async underHold<T>(fn: () => Promise<T>): Promise<T> {
    await this.unheld();
    const value = await fn();
    await this.unheld();
    return value;
  }

  /** Harness git for a write session: the folder's own, and each worktree's bound to the identity read as it is made. */
  private sessionGit(): SessionGit {
    return {
      repo: (args, kind) => this.officeGit.run(args, kind),
      worktree: (path) => { const git = this.git(findRepo(path)); return (args, kind) => git.run(args, kind, path); },
    };
  }

  /**
   * The folder's checkout state for the guard, by harness git between two hold checks (WSP-10).
   * `closeCheck: false` only where the caller's very next step is a hold check, which then closes this read.
   */
  private async guardState(closeCheck = true): Promise<RepoState> {
    await this.unheld();
    const state = await harnessState(async (args) => {
      const result = await this.officeGit.run(args, "guard");
      if (result.code !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
      return result.stdout;
    }, this.root);
    if (closeCheck) await this.unheld();
    return state;
  }

  private check(): void {
    if (this.closed) throw new Error("post office is closed");
    if (this.logFailure) throw new Error(`post office log failed: ${this.logFailure.message}`);
  }

  private record(event: OfficeEvent, session?: Session, toLogOnly = false): void {
    const safe = redact(event, this.secrets) as OfficeEvent;
    if (!toLogOnly) this.options.onEvent?.(safe);
    this.logPending = this.logPending.then(async () => {
      await this.logs.write(session ? session.id : "post-office", { ...safe, time: new Date().toISOString() });
    }).catch((error: unknown) => {
      this.logFailure = error instanceof Error ? error : new Error(String(error));
      // A broken audit must stop further work; close also resolves a turn waiting for native output.
      if (!this.closed) void this.close().catch(() => {});
    });
  }

  army(): unknown {
    this.check();
    return [...this.roster.soldiers.values()].map((spec) => {
      const session = this.sessions.get(spec.key);
      return { ...spec, name: shadowName(spec.key), supported: spec.cli === "claude", state: session?.down ? "down" : session?.active ? "working" : session ? "idle" : "closed", restarts: session?.restarts ?? 0 };
    });
  }

  async open(key: string, options: TurnOptions = {}): Promise<{ soldier: string; cwd: string; session: string; branch?: string }> {
    this.check();
    let existing = this.sessions.get(key);
    if (existing?.down) {
      if (existing.containmentFailed) {
        // PO-15: a reconnect starts the CLI only once no process the failure named still runs; unnamed ones keep it down.
        const left = await this.leftovers(existing);
        if (left !== "unknown" && !this.downSoldiers.isDown(key)) this.downSoldiers.fail(key, left);
        if (left === "unknown" || !this.ops || !(await this.downSoldiers.mayStart(key, this.processOps(this.ops, left)))) {
          throw new Error("native descendants were not confirmed stopped; end this caller and inspect them before starting another session");
        }
        await existing.tree?.remove().catch(() => {});
      }
      if (existing.active) throw new Error("cannot reconnect while the previous turn is finalizing");
      await existing.channel?.close();
      await this.releaseWrite(existing);
      // A tainted snapshot keeps the partial work its guard line names; an untainted one goes, logged, as at close.
      // A failed removal keeps the session down and its snapshot recorded: the next reconnect or close tries again,
      // and the logged intent lets a later start finish it (PO-1 startup).
      if (existing.snapshot && !existing.tainted && !await this.dropSnapshot(existing.snapshot, existing)) {
        throw new Error(`the old snapshot ${existing.snapshot.path} could not be removed; reconnect or close ${key} to try again`);
      }
      if (existing.snapshot && existing.tainted) this.record({ soldier: key, type: "snapshot", data: { path: existing.snapshot.path, retained: true } }, existing);
      // A fresh snapshot keeps partial work in the previous one, never silently repeats it.
      this.sessions.delete(key);
      existing = undefined;
    }
    const session = await this.session(key, options.claims);
    return { soldier: key, cwd: session.cwd, session: session.id, ...(session.write ? { branch: session.write.ws.branch } : {}) };
  }

  private async session(key: string, claims?: string[]): Promise<Session> {
    this.check();
    const wanted = claims?.length ? [...claims].sort() : undefined;
    const existing = this.sessions.get(key);
    if (existing) {
      await existing.restart;
      if (existing.down) throw new Error(`channel ${key} is down; reconnect explicitly`);
      // One process has one working directory, so a session's claims are fixed when it opens.
      const held = existing.write ? [...existing.write.claims].sort() : undefined;
      if (wanted && JSON.stringify(wanted) !== JSON.stringify(held)) {
        throw new Error(held ? `${key} holds claims ${held.join(", ")}; close its session before sending other claims` : `${key} has a read-only session; close it before sending claims`);
      }
      return existing;
    }
    const pending = this.opening.get(key);
    if (pending) return pending;
    const next = this.makeSession(key, claims);
    this.opening.set(key, next);
    try { return await next; } finally { this.opening.delete(key); }
  }

  private async makeSession(key: string, claims?: string[]): Promise<Session> {
    // PO-1: no channel opens before the recovery of earlier post offices is done.
    await this.recover();
    const spec = this.roster.soldiers.get(key);
    if (!spec) throw new Error(`unknown soldier ${key}`);
    if (spec.cli !== "claude") throw new Error(`${key}: ${spec.cli} live channels are not implemented in M1`);
    // Hard rule: writes need the build role and a soldier the roster lets write. Nothing starts otherwise.
    if (claims?.length && (!spec.write || !spec.roles.includes("build"))) throw new Error(`${key} cannot write: claims need the build role and write access in the roster`);
    // Bad or overlapping claims throw here, naming the holder, before any process starts (WSP-2).
    // WSP-10: the worktree is made by harness git under the hold, and its identity is recorded as it is made.
    if (claims?.length) await this.unheld();
    const ws = claims?.length ? await openWriteSession({ cwd: this.root, soldier: key, claims, ttlMs: WRITE_LEASE_MS, git: this.sessionGit() }) : undefined;
    if (ws) await this.unheld().catch(async (error: unknown) => { await ws.release(); throw error; });
    const instructions = buildStandingInstructions(this.roster, spec, { readOnly: !ws });
    const id = `session-${randomUUID()}`;
    let snapshot: Snapshot | undefined, tree: TreeRecord | undefined;
    let wsRepo: GitRepo | undefined;
    try {
      // WSP-10: the worktree's git identity is read now, before the soldier runs, and used for its audit.
      if (ws) wsRepo = findRepo(ws.cwd);
      // PO-16: the tree's record exists before anything of the session does; one that can't be written starts nothing (PO-15).
      tree = await this.treeRecord(key, id);
      // WSP-11: a soldier whose snapshot can't be made does not start, and never runs in the folder itself.
      if (!ws && !this.snapshots.ok) throw new Error(`${key} can't start: ${this.snapshots.reason}`);
      if (!ws && this.snapshots.ok) await this.unheld();
      if (!ws && this.snapshots.ok) snapshot = await this.openRecorded(this.snapshots.root, id);
    } catch (error) { await tree?.remove().catch(() => {}); await ws?.release(); throw error; }
    const cwd = ws ? ws.cwd : snapshot!.path;
    const session: Session = { spec, id, cwd, instructions, ...(snapshot ? { snapshot } : {}), ...(tree ? { tree } : {}), generation: 0, restarts: 0, crashes: [], down: false, tainted: false, restartPending: false, ...(ws ? { write: { ws, repo: wsRepo!, claims: [...claims!] } } : {}) };
    this.sessions.set(key, session);
    if (ws) await this.holdLease(session);
    if (this.closed) { session.down = true; await this.releaseWrite(session); throw new Error("post office closed while opening session"); }
    this.start(session);
    this.record({ soldier: key, type: "opened", data: { session: id, cwd, ...(ws ? { branch: ws.branch, claims: session.write!.claims } : {}) } }, session);
    return session;
  }

  /** WSP-11: a snapshot with its record: the path before it is made, its git folder once it is, for a later start. */
  private async openRecorded(root: string, sessionId: string): Promise<Snapshot> {
    const file = join(snapshotsDir(this.root), `${sessionId}.json`);
    // The snapshot root goes in the record too: a later start finds it even after SHADOW_ARMY_SNAPSHOTS changed.
    await writeAtomic(file, JSON.stringify({ path: join(snapshotSubfolder(root, this.root), sessionId), root }));
    const snapshot = await openSnapshot({ root, folder: this.root, sessionId, repo: this.repo, git: this.git });
    // The HEAD it was made at, so a later start can report a commit made in it (WSP-11).
    const head = (await this.git({ gitDir: snapshot.gitDir, workTree: snapshot.path, commonDir: snapshot.commonDir }).run(["rev-parse", "HEAD"], "guard")).stdout.trim();
    await writeAtomic(file, JSON.stringify({ path: snapshot.path, root, gitDir: snapshot.gitDir, head }));
    return snapshot;
  }

  /**
   * PO-16: the session's tree record, written and read back before anything of the session starts. With no process
   * operations, no readable own identity or a failed write, nothing starts: the soldier is down, on disk, with one owner line.
   */
  private async treeRecord(key: string, id: string): Promise<TreeRecord> {
    const fail = async (reason: string): Promise<never> => {
      const line = containmentFailedMessage(shadowName(key), { reason });
      this.downSoldiers.fail(key);
      this.record({ soldier: key, type: "containment_failed", data: { down: true, message: line } });
      await this.logPending;
      throw new Error(this.logFailure ? `${line} The post office's log can't be written either: ${String(this.logFailure)}` : line);
    };
    const ops = this.ops;
    if (!ops) return fail(`no process operations on ${process.platform}, so its tree can't be recorded`);
    const self = await this.ownIdentity(ops).catch((error: unknown) => fail(`the post office's own identity can't be verified: ${String(error)}`));
    let record: TreeRecord;
    try {
      record = await TreeRecord.create(this.root, id, self, undefined, (error) => this.record({ soldier: key, type: "tree_record", data: { listed: false, reason: String(error) } }));
    } catch (error) { return fail(`tree record not written: ${String(error)}`); }
    const back = await readFile(join(treesDir(this.root), `${id}.jsonl`), "utf8").then((text) => text.split(/\r?\n/).filter(Boolean).map(parseTreeLine), () => []);
    const first = back[0];
    if (back.length !== 1 || first?.kind !== "post-office" || !("pid" in first) || first.pid !== self.pid || first.startTime !== self.startTime) {
      await record.remove().catch(() => {});
      return fail("tree record not verified: it doesn't read back as written");
    }
    return record;
  }

  /** The helper's check (C1): the post office's own start time, read twice and the same, before it is trusted. */
  private ownIdentity(ops: OfficeOps): Promise<Identity> {
    return this.self ??= (async () => {
      const [first, second] = [await ops.probe(process.pid), await ops.probe(process.pid)];
      if (first === "gone" || first !== second) throw new Error(`the process helper reads the post office's own start time as ${first}, then ${second}`);
      return { pid: process.pid, startTime: first };
    })().catch((error: unknown) => { this.self = undefined; throw error; });
  }

  /**
   * C1: the earlier trees, before any is ended: a plain folder (owned by this user and not writable by others, on POSIX), plain
   * files, every line parsed and the post office's line first, and a helper that reads this process correctly. Throws otherwise.
   */
  private async verifiedTrees(ops: OfficeOps): Promise<{ id: string; lines: TreeLine[] }[]> {
    const dir = treesDir(this.root);
    const info = await lstat(dir).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error; });
    if (!info) return [];
    if (!info.isDirectory()) throw new Error(`${dir} is not a plain folder`);
    if (process.platform !== "win32" && (info.uid !== process.getuid?.() || (info.mode & 0o002) !== 0)) throw new Error(`${dir} is not owned by this user, or others can write to it`);
    await this.ownIdentity(ops);
    const trees: { id: string; lines: TreeLine[] }[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.name.endsWith(".jsonl")) continue;
      if (!entry.isFile()) throw new Error(`${entry.name} is not a plain file`);
      const lines = (await readFile(join(dir, entry.name), "utf8")).split(/\r?\n/).filter((line) => line.trim()).map(parseTreeLine);
      if (lines.some((line) => !line) || lines[0]?.kind !== "post-office") throw new Error(`${entry.name} is not a whole tree record`);
      trees.push({ id: entry.name.slice(0, -".jsonl".length), lines: lines as TreeLine[] });
    }
    return trees;
  }

  /**
   * The sweep's operations bound to the verified records (C1): a probe that can't tell throws, never reads as absence, and
   * a process is ended only as an identity a verified record names, by `endIdentity`, never by its pid alone.
   */
  private boundOps(ops: OfficeOps, trees: readonly { lines: readonly TreeLine[] }[]): SweepOps {
    const known = trees.flatMap((tree) => tree.lines.flatMap((line) => "pid" in line && line.kind !== "post-office" ? [{ pid: line.pid, startTime: line.startTime }] : []));
    return { ...ops,
      startTimeOf: async (pid) => { const time = await ops.probe(pid); return time === "gone" ? undefined : time; },
      endProcess: async (pid, tree) => {
        const named = known.filter((one) => one.pid === pid);
        if (named.length === 0) throw new Error(`process ${pid} is in no verified record`);
        for (const one of named) await ops.endIdentity(one, tree);
      } };
  }

  /**
   * PO-11: the guardian's and CLI's identities, as the channel names them, appended to the tree's record once per process.
   * A write that fails takes the soldier down, on disk, with one owner line (PO-15), and its turn sends nothing.
   */
  private async identify(session: Session): Promise<void> {
    const channel = session.channel as ListedChannel | undefined;
    if (session.identified || !channel?.identities || !session.tree) return;
    try {
      const { guardian, cli } = await channel.identities();
      if (guardian) await session.tree.add({ kind: "guardian", ...guardian });
      if (cli) await session.tree.add({ kind: "cli", ...cli });
      session.identified = true;
    } catch (error) {
      const key = session.spec.key, line = containmentFailedMessage(shadowName(key), { reason: `tree record not written: ${String(error)}` });
      session.down = true;
      this.downSoldiers.fail(key);
      // The owner line goes to post-office.jsonl, as treeRecord's does, not to the session's own log.
      this.record({ soldier: key, type: "containment_failed", data: { down: true, message: line } });
      await this.logPending;
      throw new Error(line);
    }
  }

  /** PO-15's checks bound to identity: a probe that can't tell counts the process as still running; an end is `endIdentity`. */
  private processOps(ops: OfficeOps, named: readonly Identity[] = []): ProcessOps {
    return {
      startTimeOf: async (pid) => {
        const time = await ops.probe(pid).catch(() => undefined);
        return time === undefined ? named.find((one) => one.pid === pid)?.startTime : time === "gone" ? undefined : time;
      },
      end: async (processes) => { for (const one of processes) await ops.endIdentity(one, false); },
    };
  }

  /** PO-15: the processes of the session's tree record that still run, named by their command lines; `"unknown"` when none was recorded. */
  private async leftovers(session: Session): Promise<Leftover[] | "unknown"> {
    const ops = this.ops;
    const lines = (await readTrees(this.root)).find((tree) => tree.id === session.id)?.lines ?? [];
    const named = lines.flatMap((line) => "pid" in line && line.kind !== "post-office" ? [{ pid: line.pid, startTime: line.startTime, command: "" }] : []);
    if (!ops || named.length === 0) return "unknown";
    const left = await stillRunning(this.processOps(ops, named), named);
    return Promise.all(left.map(async (one) => ({ ...one, command: (await ops.commandOf?.(one.pid).catch(() => undefined)) ?? "" })));
  }

  /** WSP-2: the lease must hold while the session is open, so keep renewing it until release. Owner, pid and claims name it: no two live leases overlap. */
  private async holdLease(session: Session): Promise<void> {
    const write = session.write!;
    const locks = new Locks(join(this.root, ".shadow"));
    const claims = JSON.stringify([...write.ws.claims].sort());
    const lease = (await locks.list()).filter((held) => held.owner === session.spec.key && held.pid === process.pid && JSON.stringify([...held.claims].sort()) === claims).at(-1);
    if (lease) write.lease = { locks, id: lease.id };
    write.heartbeat = setInterval(() => { void this.renewLease(session); }, WRITE_LEASE_MS / 3);
    write.heartbeat.unref?.();
  }

  private async renewLease(session: Session): Promise<void> {
    const write = session.write;
    if (!write) return;
    const kept = write.lease ? await write.lease.locks.renew(write.lease.id, WRITE_LEASE_MS).catch(() => false) : false;
    if (!kept) write.leaseLost = true;
  }

  private async releaseWrite(session: Session): Promise<void> {
    clearInterval(session.write?.heartbeat);
    await session.write?.ws.release();
  }

  private start(session: Session): void {
    const generation = ++session.generation;
    session.restartPending = false;
    session.identified = false;
    session.channel = this.factory({ cwd: session.cwd, model: session.spec.model, autonomy: session.spec.autonomy, instructions: session.instructions,
      onEvent: (event: ChannelEvent) => {
        if (generation !== session.generation) return;
        this.record({ soldier: session.spec.key, ...event }, session);
        if (event.type === "error" && (event.data as { kind?: string } | undefined)?.kind === "login_needed") session.loginNeeded = true;
        if (event.type === "closed") {
          if ((event.data as { containmentStopped?: boolean })?.containmentStopped === false) {
            session.containmentFailed = true;
            session.down = true;
            this.record({ soldier: session.spec.key, type: "down", data: { reason: "native descendants could not be confirmed stopped; inspect before reconnecting" } }, session);
            return;
          }
          if (this.closed || session.down) return;
          // PO-1: a login needed never restarts the channel; the soldier waits for the owner to log in and reconnect.
          if (session.loginNeeded) {
            session.down = true;
            this.record({ soldier: session.spec.key, type: "down", data: { reason: "log in: the CLI needs a login; reconnect after logging in" } }, session);
            return;
          }
          // A close while a restart is already pending is the same crash.
          if (!session.restartPending) {
            const now = Date.now();
            const last = session.crashes.at(-1);
            if (last !== undefined && now - last >= CRASH_WINDOW_MS) session.crashes = [];
            session.crashes.push(now);
          }
          session.restartPending = true;
          if (!session.active) this.restart(session);
        }
      },
    });
  }

  private restart(session: Session): void {
    if (session.restart || this.closed || session.down || !session.restartPending) return;
    session.restart = (async () => {
      await session.channel?.close();
      if (this.closed || session.down) return;
      const delays = this.options.restartDelaysMs ?? RESTART_DELAYS_MS;
      if (session.crashes.length > delays.length) {
        session.down = true;
        this.record({ soldier: session.spec.key, type: "down", data: { reason: `${session.crashes.length} crashes within 10 minutes; reconnect explicitly` } }, session);
        return;
      }
      // PO-1: wait 1, 5, then 30 seconds before each restart; closing the session ends the wait.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delays[session.crashes.length - 1] ?? 0);
        session.wake = () => { clearTimeout(timer); resolve(); };
      });
      session.wake = undefined;
      if (this.closed || session.down) return;
      session.restarts = session.crashes.length;
      // WSP-11: a fresh session gets a fresh snapshot; the old one's writes were reported when its turn's guard closed.
      if (session.snapshot && this.snapshots.ok) {
        if (!await this.dropSnapshot(session.snapshot, session)) throw new Error(`the old snapshot ${session.snapshot.path} could not be removed; reconnect explicitly`);
        await this.unheld();
        session.snapshot = await this.openRecorded(this.snapshots.root, `${session.id}-r${session.restarts}`);
        session.cwd = session.snapshot.path;
      }
      this.start(session);
      this.record({ soldier: session.spec.key, type: "restarted", data: { attempt: session.restarts, replayed: false } }, session);
    })().catch((error: unknown) => {
      session.down = true;
      this.record({ soldier: session.spec.key, type: "down", data: { reason: String(error) } }, session);
    }).finally(() => {
      session.restart = undefined;
      if (session.restartPending && !session.active && !session.down && !this.closed) this.restart(session);
    });
  }

  async send(key: string, text: string, options: TurnOptions = {}): Promise<TurnResult> {
    this.check();
    if (!text.trim()) throw new Error("message is empty");
    const session = await this.session(key, options.claims);
    if (session.active) throw new Error(`${key} already has a running turn`);
    session.stopRequested = false;
    // A copied credential in a brief must never enter a soldier's stdin/context either.
    const nativeText = text.replace(new RegExp(this.secrets[0]!, "gi"), "[REDACTED]");
    const next = this.run(session, nativeText);
    session.active = next;
    try { return await next; } finally {
      session.active = undefined;
      if (session.restartPending) this.restart(session);
    }
  }

  private async run(session: Session, text: string): Promise<TurnResult> {
    // Both checks run even after transport failure/cancellation. M2 extends this native result
    // boundary to actual background jobs; persistent session services must survive ordinary turns.
    // A write session has no read-only snapshot to guard: the claim audit takes its place.
    // WSP-11: a read-only turn begins with its snapshot's HEAD, ignore rules and audited hashes; its writes are found against them.
    let startFailure: string | undefined;
    if (session.snapshot) {
      session.turnStart = await this.unheld().then(() => beginTurn(session.snapshot!, this.git)).catch((error: unknown) => { startFailure = String(error); return undefined; });
    }
    session.guardBase = await this.exclusive(() => this.guardState()).catch((error: unknown) => { startFailure ??= String(error); return undefined; });
    // PO-1: the baseline, with the turn's ID as its open marker, is on disk whole before anything is sent.
    const turnFile = join(turnsDir(this.root), `${session.id}.json`), turnId = randomUUID();
    let baselineWritten = false;
    if (session.guardBase) {
      await writeAtomic(turnFile, JSON.stringify({ turn: turnId, soldier: session.spec.key, time: new Date().toISOString(), base: stateToJson(session.guardBase) }))
        .then(() => { baselineWritten = true; })
        .catch((error: unknown) => {
          startFailure ??= `the turn's baseline could not be written: ${String(error)}`;
          this.record({ soldier: session.spec.key, type: "turn_baseline", data: { written: false, reason: String(error) } }, session);
        });
    }
    // Nothing is sent without both baselines on hand and on disk: a turn the guard can't cover never runs.
    if (startFailure) session.stopRequested = true;
    // WSP-10: a post office that stops with a turn open leaves the next one the state trusted before it, not the state it finds.
    this.hold?.setTurnOpen(++this.openTurns > 0);
    // PO-11: the guardian and CLI the channel started go into the tree's record before its first turn; a failed write sends nothing.
    if (!session.stopRequested) await this.identify(session).catch((error: unknown) => { startFailure ??= String(error instanceof Error ? error.message : error); session.stopRequested = true; });
    // WSP-2: a lease that could not be renewed since the last turn may have changed hands.
    await this.renewLease(session);
    let result: TurnResult;
    try {
      this.check();
      result = session.stopRequested ? { status: "interrupted", text: "", refusal: false } : await session.channel!.send(text);
    } catch (error) {
      result = { status: "failed", text: "", refusal: false, error: { kind: "transport", message: String(error) } };
    }
    if (result.status === "completed") session.loginNeeded = false;
    else if (result.error?.kind === "login_needed") session.loginNeeded = true;
    // PO-11: the tree's processes as the channel lists them go into its record.
    const channel = session.channel as ListedChannel | undefined;
    if (channel?.list && session.tree) {
      await session.tree.listing(await channel.list().catch((error: unknown) => {
        this.record({ soldier: session.spec.key, type: "tree_record", data: { listed: false, reason: `the channel's listing failed: ${String(error)}` } }, session);
        return [];
      }));
    }
    // PO-15: while a process the failed containment named still runs, the guard stays open; with none named it is cut short,
    // and the turn says what it can't cover. Either way the turn is interrupted (PO-8) and nothing it did is applied.
    let containment: string | undefined;
    if (session.containmentFailed) {
      const left = this.ops ? await this.leftovers(session) : "unknown";
      const held = left !== "unknown" && left.length === 0 ? "ended" : this.ops ? await holdGuardOpen(left, this.processOps(this.ops, left === "unknown" ? [] : left), { wait: this.ops.wait }) : "cut-short";
      containment = held === "ended"
        ? "containment failed during the turn; the processes it named have stopped; nothing is applied"
        : "containment failed during the turn; processes the CLI started may still be running, and what they change won't be on the turn's attribution card; nothing is applied";
      result = { ...result, status: "interrupted", error: { kind: result.error?.kind ?? "transport", message: result.error ? `${result.error.message}\n${containment}` : containment } };
      this.record({ soldier: session.spec.key, type: "containment_turn", data: { ended: held === "ended", line: containment } }, session);
    }
    const changes: string[] = startFailure ? [`checkout guard could not start: ${startFailure}`] : [];
    const base = session.guardBase;
    session.guardBase = undefined;
    const start = session.turnStart;
    session.turnStart = undefined;
    const snapshotTurn = Boolean(session.snapshot && start);
    try {
      // A snapshot turn's hold check before findWrites, next, also closes this guard read (one check, not two back to back).
      if (base) changes.push(...await this.exclusive(async () => diffState(base, await this.guardState(!snapshotTurn))));
    } catch (error) { changes.push(`checkout guard could not complete: ${String(error)}`); }
    // WSP-11: the snapshot's writes are a read-violation, reported, then discarded before its next turn.
    // A failed guard keeps them instead, as the partial work its line names.
    if (session.snapshot && start) {
      try {
        await this.unheld();
        const violation = await findWrites(session.snapshot, start, this.git);
        if (violation) {
          const lines = [...violation.files.map((file) => `read-only snapshot: wrote ${file}`), ...(violation.head ? [`read-only snapshot: HEAD moved from ${violation.head.from} to ${violation.head.to}`] : [])];
          this.record({ soldier: session.spec.key, type: "read_violation", data: { ...violation, cwd: session.cwd } }, session);
          if (changes.length) changes.push(...lines);
          else { await this.logPending; await this.unheld(); await discardWrites(session.snapshot, start, this.git); }
        }
      } catch (error) { changes.push(`read-only snapshot could not be checked or put back: ${String(error)}`); }
    }
    // PO-1: the baseline goes only once the turn's guard outcome is on disk under its ID. If it can't be, the baseline stays
    // as evidence for the next start, and the session goes down so no later turn writes over it.
    if (baselineWritten) {
      try {
        await completeTurn(this.root, { turn: turnId, session: session.id, soldier: session.spec.key, changes });
        await unlink(turnFile).catch(() => {});
      } catch (error) { changes.push(`the turn's completion could not be recorded, so its baseline is kept at ${turnFile}: ${String(error)}`); }
    }
    this.hold?.setTurnOpen(--this.openTurns > 0);
    await this.renewLease(session);
    // The audit runs once, after the turn and the guard, also for a failed or cut-short turn (WSP-2).
    let write: WriteOutcome | undefined;
    if (session.write) {
      try { write = await this.audit(session, result, changes); }
      catch (error) { changes.push(`claim audit could not complete: ${String(error)}`); }
    }
    if (write && containment) write = { ...write, applicable: false, reason: containment };
    if (changes.length) {
      session.tainted = true;
      session.down = true;
      await session.channel!.close();
      const guard = `${session.write ? "checkout guard failed; nothing is applied" : "read-only guard failed"}; partial work is retained at ${session.cwd}: ${changes.join("; ")}`;
      // PO-8: the CLI's own error keeps its kind and words; the guard failure follows it.
      result = { ...result, status: "failed", error: result.error ? { ...result.error, message: `${result.error.message}\n${guard}` } : { kind: "other", message: guard } };
      if (write) write = { ...write, applicable: false, reason: changes.join("; ") };
    }
    // W12-1: a turn that is not applied but moved the branch leaves work the owner's folder never got. A later turn's
    // apply would carry it in, so the session goes down, as after a guard failure; reconnecting starts a fresh worktree.
    if (write && !write.applicable && write.commit && write.commit !== session.write!.tip && !session.down) {
      session.down = true;
      await session.channel!.close();
      write = { ...write, reason: `${write.reason}; the session is down so a later turn cannot carry this work in; reconnect to start fresh` };
      this.record({ soldier: session.spec.key, type: "down", data: { reason: write.reason } }, session);
    }
    if (session.write && write) session.write.tip = write.commit;
    // M1-AC28: only a completed turn that passed the guard and the audit reaches the owner's folder.
    if (write?.applicable) {
      const audited = write;
      const apply = await this.exclusive(async () => {
        const others = [...this.sessions.values()].filter((other) => other !== session && other.guardBase);
        const before = others.length ? await this.guardState() : undefined;
        const applied = await applyAudited(this.root, audited, session.write!.applied);
        // W12-3: Shadow Army's own apply is no change in another running turn's checkout guard; anything else still is.
        if (before && applied.applied && applied.files.length) carryApply(others, before, await this.guardState(), applied.files.map((file) => file.path));
        return applied;
      });
      if (apply.applied && write.commit) session.write!.applied = write.commit;
      write = { ...write, apply };
    }
    if (write) result = { ...result, write };
    this.record({ soldier: session.spec.key, type: "guard", data: { changes, cwd: session.cwd } }, session);
    if (write) this.record({ soldier: session.spec.key, type: "audit", data: { ...write, diff: undefined } }, session);
    result = { ...result, summary: result.text.split(/\r?\n/).slice(0, 5).join("\n") };
    this.record({ soldier: session.spec.key, type: "delivery", data: { state: result.status === "completed" ? "answered" : "interrupted", result } }, session);
    await this.logPending;
    if (this.logFailure) throw this.logFailure;
    return redact(result, this.secrets) as TurnResult;
  }

  /** v1's claim audit: revert edits outside the claims, commit the rest on the soldier's branch, and hand B4 the audited diff. */
  private async audit(session: Session, result: TurnResult, guardChanges: string[]): Promise<WriteOutcome> {
    const info = await this.underHold(() => session.write!.ws.finish(`${session.spec.key}: turn`));
    // WSP-10: the worktree's git identity recorded at open, the audit's timeout policy, and the commit the audit made, not a HEAD read now.
    let diff = "";
    if (info.commit) {
      await this.unheld();
      const result = await this.git(session.write!.repo).run(["diff", info.base, info.commit], "guard");
      if (result.code !== 0) throw new Error(`git diff of the audited commit failed: ${result.stderr.trim() || `exit ${result.code}`}`);
      diff = result.stdout;
    }
    let reason: string | undefined;
    if (guardChanges.length) reason = guardChanges.join("; ");
    else if (result.status !== "completed") reason = `the turn ${result.status}; its claimed work stays on ${info.branch}`;
    else if (info.leaseLost || session.write!.leaseLost) reason = "the claims lease was lost, so the files may have changed hands";
    else if (!info.commit) reason = "the soldier changed nothing";
    return { worktree: info.path, branch: info.branch, base: info.base, commit: info.commit, claims: info.claims, inScope: info.inScope, outOfScope: info.outOfScope,
      reverted: info.reverted, leaseLost: info.leaseLost || !!session.write!.leaseLost, uncommittedIgnored: info.uncommittedIgnored, diff, applicable: !reason, ...(reason ? { reason } : {}) };
  }

  async interrupt(key: string): Promise<void> {
    this.check();
    const session = this.sessions.get(key);
    if (!session) throw new Error(`no open session for ${key}`);
    if (session.active) session.stopRequested = true;
    await session.channel?.interrupt();
  }

  async approval(key: string, requestId: string, response: unknown): Promise<void> {
    this.check();
    if (new RegExp(this.secrets[0]!, "i").test(JSON.stringify({ requestId, response }))) throw new Error("Monarch credential cannot be forwarded to a soldier");
    const session = this.sessions.get(key);
    if (!session) throw new Error(`no open session for ${key}`);
    await session.channel!.respondApproval(requestId, response);
  }

  async closeSession(key: string): Promise<void> {
    await this.opening.get(key)?.catch(() => {});
    const session = this.sessions.get(key);
    if (!session) return;
    session.down = true;
    session.wake?.();
    let failure: string | undefined;
    try { await session.channel?.close(); } catch (error) {
      session.containmentFailed = true;
      failure = error instanceof Error ? error.message : String(error);
    }
    await session.active?.catch(() => {});
    await session.restart;
    if (session.containmentFailed) {
      // PO-15: the tree record stays for the next start's sweep (PO-16), and the soldier stays down.
      const leftovers = await this.leftovers(session);
      this.downSoldiers.fail(key, leftovers === "unknown" ? [] : leftovers);
      this.record({ soldier: key, type: "containment_failed", data: { message: containmentFailedMessage(shadowName(key), failure ? { reason: failure } : { leftovers }) } }, session);
      throw new Error(`native descendants for ${key} were not confirmed stopped`);
    }
    // PO-16: the tree has ended, so its entry goes. A failed removal is logged; the next sweep finds an empty tree.
    await session.tree?.remove().catch((error: unknown) => this.record({ soldier: key, type: "tree_record", data: { removed: false, reason: String(error) } }, session));
    await this.releaseWrite(session);
    // WSP-11: the snapshot goes with its session. A tainted one keeps the partial work its guard line names.
    const retained = !session.snapshot || session.tainted || !await this.dropSnapshot(session.snapshot, session);
    this.sessions.delete(key);
    this.record({ soldier: key, type: "session_closed", data: { cwd: session.cwd, retained } }, session);
  }

  /**
   * WSP-11: removes this session's snapshot alone, by `git worktree remove` on its own path (never a repository-wide prune), and
   * checks the result. The intent is logged before and the outcome after, so a later start can find an unfinished removal.
   */
  private async dropSnapshot(snapshot: Snapshot | undefined, session?: Session, root = this.snapshots.ok ? this.snapshots.root : undefined): Promise<boolean> {
    if (!snapshot || !root) return false;
    const note = (data: Record<string, unknown>) => this.record({ ...(session ? { soldier: session.spec.key } : {}), type: "snapshot", data: { path: snapshot.path, ...data } }, session);
    try {
      const real = realish(snapshot.path);
      if (lstatSync(snapshot.path, { throwIfNoEntry: false })?.isSymbolicLink() || real === realish(root) || !within(realish(root), real)) throw new Error(`refusing to remove ${snapshot.path}: not a folder inside ${root}`);
      note({ removing: true });
      await this.logPending;
      await this.unheld();
      const result = await this.officeGit.run(["worktree", "remove", "--force", snapshot.path], "snapshot");
      if (result.code !== 0) throw new Error(`git worktree remove failed: ${result.stderr.trim() || `exit ${result.code}`}`);
      try {
        if (readdirSync(snapshot.subfolder).every((name) => name === FOLDER_FILE)) { rmSync(join(snapshot.subfolder, FOLDER_FILE), { force: true }); rmdirSync(snapshot.subfolder); }
      } catch { /* not there, or not empty */ }
      note({ removed: true });
      await this.logPending;
      await unlink(join(snapshotsDir(this.root), `${basename(snapshot.path)}.json`)).catch(() => {});
      return true;
    } catch (error) {
      note({ removed: false, reason: String(error) });
      return false;
    }
  }

  /** Runs `fn` alone among applies and checkout-guard captures. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.applying.then(fn);
    this.applying = next.then(() => {}, () => {});
    return next;
  }

  /** Appends a record to post-office.jsonl through the office's one writer, redacted, without an event to the caller. */
  logRecord(record: Record<string, unknown>): void {
    const { type, ...rest } = record;
    this.record({ type: String(type), data: record.data ?? rest }, undefined, true);
  }

  refused(): void { this.record({ type: "command_refused", data: { reason: "wrong or missing Monarch credential" } }); }

  leaseEnded(session: string, reason: "expired" | "released"): void {
    this.record({ type: "lease_ended", data: { session, reason } });
  }

  close(): Promise<void> {
    return this.closePromise ??= (async () => {
      this.closed = true;
      await this.recovery?.catch(() => {});
      await Promise.allSettled(this.opening.values());
      const ended = await Promise.allSettled([...this.sessions.keys()].map((key) => this.closeSession(key)));
      this.record({ type: "closed", data: { retained: true } });
      await this.logPending;
      const failed = ended.filter((item): item is PromiseRejectedResult => item.status === "rejected");
      if (failed.length) throw new AggregateError(failed.map((item) => item.reason), "some native sessions could not be closed");
    })();
  }
}
