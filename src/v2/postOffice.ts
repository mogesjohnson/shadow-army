import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadRoster, type Roster, type SoldierSpec } from "../core/roster.js";
import { applyAudited } from "./apply.js";
import { diffState, MAX_HASHED, type RepoState } from "../workspace/guard.js";
import { splitZ } from "../workspace/git.js";
import { Locks } from "../workspace/locks.js";
import { ensureShadowRoot, openWriteSession, type SessionGit, type WriteSession } from "../workspace/session.js";
import { HarnessGit } from "./git/harness.js";
import { HarnessHold, type GitRepo } from "./git/hold.js";
import { beginTurn, discardWrites, findWrites, FOLDER_FILE, openSnapshot, realish, validateSnapshotRoot, within, type FolderFacts, type GitFactory, type RunGit, type Snapshot, type TurnStart } from "./snapshot.js";
import { platformInspect } from "./winAcl.js";
import type { ChannelEvent, ChannelFactory, NativeChannel, TurnResult, WriteOutcome } from "./channel.js";
import { ClaudeChannel } from "./claude.js";
import { buildStandingInstructions, shadowName } from "./instructions.js";
import { redact, SessionLogs } from "./logs.js";
import { containmentFailedMessage, DownSoldiers, type TreeRecord } from "./contain/trees.js";

export interface OfficeEvent { soldier?: string; type: string; data: unknown; }
export interface OfficeOptions {
  cwd: string;
  credential: string;
  roster?: Roster;
  channelFactory?: ChannelFactory;
  onEvent?: (event: OfficeEvent) => void;
  /** Waits before the first, second and third automatic restart (PO-1: 1, 5 and 30 seconds). */
  restartDelaysMs?: readonly number[];
  /** The snapshot root's owner and permission check (WSP-11); tests pass their own. */
  inspect?: (dir: string) => FolderFacts;
  /** Harness git for a repository (WSP-10); tests pass their own. */
  gitFactory?: GitFactory;
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
  /** WSP-10: harness git for any repository, each command between a hold check before and one after (once the hold is set). */
  private readonly held: GitFactory = (repo) => {
    const git = this.git(repo);
    return { run: (args, kind, cwd) => (this.hold ? this.hold.run(git, args, kind, cwd) : git.run(args, kind, cwd)) };
  };

  private constructor(root: string, private readonly repo: GitRepo, private readonly git: GitFactory,
    private readonly snapshots: { ok: true; root: string } | { ok: false; reason: string }, private readonly options: OfficeOptions) {
    this.root = root;
    this.officeGit = this.held(repo);
    this.roster = options.roster ?? loadRoster(root);
    this.factory = options.channelFactory ?? ((settings) => new ClaudeChannel(settings));
    this.secrets = [options.credential];
    this.logs = new SessionLogs(join(root, ".shadow", "v2", "logs"), this.secrets);
  }

  static async create(options: OfficeOptions): Promise<PostOffice> {
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
    // A bad root starts no soldier, so it is kept to name at each open. Windows reads real owners and ACLs, failing closed.
    const snapshots = validateSnapshotRoot(process.env.SHADOW_ARMY_SNAPSHOTS || join(homedir(), ".shadow-army", "snapshots"), { home: homedir(), folder: found.workTree, workTrees,
      inspect: options.inspect ?? platformInspect() });
    const untrusted = [found.workTree, ...workTrees, ...(snapshots.ok ? [snapshots.root] : [])];
    const gitFor: GitFactory = options.gitFactory ?? ((repo) => new HarnessGit({ repo, hooksDir, untrusted }));
    // The folder as `git rev-parse --show-toplevel` prints it: the army's mark is taken from this path (WSP-11).
    const top = await gitFor(found).run(["rev-parse", "--show-toplevel"]);
    if (top.code !== 0) throw new Error(`the army runs only inside a git working tree: ${top.stderr.trim()}`);
    const root = top.stdout.trim();
    const repo = { ...found, workTree: root };
    await ensureShadowRoot(join(root, ".shadow"));
    const office = new PostOffice(root, repo, gitFor, snapshots, options);
    await office.logs.write("post-office", { type: "started", time: new Date().toISOString(), pid: process.pid });
    if (!snapshots.ok) office.record({ type: "snapshot_root", data: { ok: false, reason: snapshots.reason } });
    // WSP-10: every office-side git call checks the repository's git state against the trusted one, before and after.
    office.hold = new HarnessHold({ repo, gitFor, statePath: join(root, ".shadow", "v2", "logs", "git-hold.json"), log: (event) => office.record({ type: "git_hold", data: event }) });
    const held = await office.hold.start();
    if (held.held) office.record({ type: "git_hold", data: { held: true, line: held.line } });
    return office;
  }

  /** Harness git for a write session: the folder's own, and each worktree's bound to the identity read as it is made. */
  private sessionGit(): SessionGit {
    return {
      repo: (args, kind) => this.officeGit.run(args, kind),
      worktree: (path) => { const git = this.held(findRepo(path)); return (args, kind) => git.run(args, kind, path); },
    };
  }

  /** The folder's checkout state for the guard, by harness git, each command between two hold checks (WSP-10). */
  private async guardState(): Promise<RepoState> {
    return harnessState(async (args) => {
      const result = await this.officeGit.run(args, "guard");
      if (result.code !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
      return result.stdout;
    }, this.root);
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
      if (existing.containmentFailed) throw new Error("native descendants were not confirmed stopped; end this caller and inspect them before starting another session");
      if (existing.active) throw new Error("cannot reconnect while the previous turn is finalizing");
      await existing.channel?.close();
      await this.releaseWrite(existing);
      // A tainted snapshot keeps the partial work its guard line names; an untainted one goes, logged, as at close.
      // A failed removal keeps the session down and its snapshot recorded: the next reconnect or close tries again,
      // and the logged intent lets a later start finish it (PO-1 startup).
      if (existing.snapshot && !existing.tainted && !await this.dropSnapshot(existing)) {
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
    const spec = this.roster.soldiers.get(key);
    if (!spec) throw new Error(`unknown soldier ${key}`);
    if (spec.cli !== "claude") throw new Error(`${key}: ${spec.cli} live channels are not implemented in M1`);
    // Hard rule: writes need the build role and a soldier the roster lets write. Nothing starts otherwise.
    if (claims?.length && (!spec.write || !spec.roles.includes("build"))) throw new Error(`${key} cannot write: claims need the build role and write access in the roster`);
    // Bad or overlapping claims throw here, naming the holder, before any process starts (WSP-2).
    // WSP-10: the worktree is made by harness git under the hold, and its identity is recorded as it is made.
    const ws = claims?.length ? await openWriteSession({ cwd: this.root, soldier: key, claims, ttlMs: WRITE_LEASE_MS, git: this.sessionGit() }) : undefined;
    const instructions = buildStandingInstructions(this.roster, spec, { readOnly: !ws });
    const id = `session-${randomUUID()}`;
    let snapshot: Snapshot | undefined;
    let wsRepo: GitRepo | undefined;
    try {
      // WSP-10: the worktree's git identity is read now, before the soldier runs, and used for its audit.
      if (ws) wsRepo = findRepo(ws.cwd);
      // WSP-11: a soldier whose snapshot can't be made does not start, and never runs in the folder itself.
      if (!ws && !this.snapshots.ok) throw new Error(`${key} can't start: ${this.snapshots.reason}`);
      if (!ws && this.snapshots.ok) snapshot = await openSnapshot({ root: this.snapshots.root, folder: this.root, sessionId: id, repo: this.repo, git: this.held });
    } catch (error) { await ws?.release(); throw error; }
    const cwd = ws ? ws.cwd : snapshot!.path;
    const session: Session = { spec, id, cwd, instructions, ...(snapshot ? { snapshot } : {}), generation: 0, restarts: 0, crashes: [], down: false, tainted: false, restartPending: false, ...(ws ? { write: { ws, repo: wsRepo!, claims: [...claims!] } } : {}) };
    this.sessions.set(key, session);
    if (ws) await this.holdLease(session);
    if (this.closed) { session.down = true; await this.releaseWrite(session); throw new Error("post office closed while opening session"); }
    this.start(session);
    this.record({ soldier: key, type: "opened", data: { session: id, cwd, ...(ws ? { branch: ws.branch, claims: session.write!.claims } : {}) } }, session);
    return session;
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
        if (!await this.dropSnapshot(session)) throw new Error(`the old snapshot ${session.snapshot.path} could not be removed; reconnect explicitly`);
        // Removed, so no longer this session's: a failed open below leaves nothing for reconnect to remove again.
        session.snapshot = undefined;
        session.snapshot = await openSnapshot({ root: this.snapshots.root, folder: this.root, sessionId: `${session.id}-r${session.restarts}`, repo: this.repo, git: this.held });
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
      session.turnStart = await beginTurn(session.snapshot!, this.held).catch((error: unknown) => { startFailure = String(error); return undefined; });
    }
    session.guardBase = await this.exclusive(() => this.guardState()).catch((error: unknown) => { startFailure ??= String(error); return undefined; });
    // Nothing is sent without both baselines: a turn the guard can't cover never runs.
    if (startFailure) session.stopRequested = true;
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
    const changes: string[] = startFailure ? [`checkout guard could not start: ${startFailure}`] : [];
    const start = session.turnStart;
    session.turnStart = undefined;
    try {
      // The baseline is read and cleared under the lock, so an apply queued ahead of this guard still carries into it (W12-3).
      if (session.guardBase) changes.push(...await this.exclusive(async () => {
        const base = session.guardBase;
        session.guardBase = undefined;
        return base ? diffState(base, await this.guardState()) : [];
      }));
    } catch (error) { changes.push(`checkout guard could not complete: ${String(error)}`); }
    // WSP-11: the snapshot's writes are a read-violation, reported, then discarded before its next turn.
    // A failed guard keeps them instead, as the partial work its line names.
    if (session.snapshot && start) {
      try {
        const violation = await findWrites(session.snapshot, start, this.held);
        if (violation) {
          const lines = [...violation.files.map((file) => `read-only snapshot: wrote ${file}`), ...(violation.head ? [`read-only snapshot: HEAD moved from ${violation.head.from} to ${violation.head.to}`] : [])];
          this.record({ soldier: session.spec.key, type: "read_violation", data: { ...violation, cwd: session.cwd } }, session);
          if (changes.length) changes.push(...lines);
          else { await this.logPending; await discardWrites(session.snapshot, start, this.held); }
        }
      } catch (error) { changes.push(`read-only snapshot could not be checked or put back: ${String(error)}`); }
    }
    await this.renewLease(session);
    // The audit runs once, after the turn and the guard, also for a failed or cut-short turn (WSP-2).
    let write: WriteOutcome | undefined;
    if (session.write) {
      try { write = await this.audit(session, result, changes); }
      catch (error) { changes.push(`claim audit could not complete: ${String(error)}`); }
    }
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
        const applied = await applyAudited(this.officeGit.run, audited, session.write!.applied);
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
    const info = await session.write!.ws.finish(`${session.spec.key}: turn`);
    // WSP-10: the worktree's git identity recorded at open, the audit's timeout policy, and the commit the audit made, not a HEAD read now.
    let diff = "";
    if (info.commit) {
      // The audit names its commit by a short id: resolve it once, now, so apply gets the exact full id (C1).
      const full = await this.held(session.write!.repo).run(["rev-parse", "-q", "--verify", `${info.commit}^{commit}`], "guard");
      if (full.code !== 0 || !full.stdout.trim()) throw new Error(`the audited commit ${info.commit} could not be resolved: ${full.stderr.trim() || `exit ${full.code}`}`);
      info.commit = full.stdout.trim();
      const result = await this.held(session.write!.repo).run(["diff", info.base, info.commit], "guard");
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
      this.downSoldiers.fail(key);
      this.record({ soldier: key, type: "containment_failed", data: { message: containmentFailedMessage(shadowName(key), failure ? { reason: failure } : { leftovers: "unknown" }) } }, session);
      throw new Error(`native descendants for ${key} were not confirmed stopped`);
    }
    // PO-16: the tree has ended, so its entry goes. A failed removal is logged; the next sweep finds an empty tree.
    await session.tree?.remove().catch((error: unknown) => this.record({ soldier: key, type: "tree_record", data: { removed: false, reason: String(error) } }, session));
    await this.releaseWrite(session);
    // WSP-11: the snapshot goes with its session. A tainted one keeps the partial work its guard line names.
    const retained = !session.snapshot || session.tainted || !await this.dropSnapshot(session);
    this.sessions.delete(key);
    this.record({ soldier: key, type: "session_closed", data: { cwd: session.cwd, retained } }, session);
  }

  /**
   * WSP-11: removes this session's snapshot alone, by `git worktree remove` on its own path (never a repository-wide prune), and
   * checks the result. The intent is logged before and the outcome after, so a later start can find an unfinished removal.
   */
  private async dropSnapshot(session: Session): Promise<boolean> {
    const snapshot = session.snapshot;
    if (!snapshot || !this.snapshots.ok) return false;
    const root = this.snapshots.root;
    const note = (data: Record<string, unknown>) => this.record({ soldier: session.spec.key, type: "snapshot", data: { path: snapshot.path, ...data } }, session);
    try {
      const real = realish(snapshot.path);
      if (lstatSync(snapshot.path, { throwIfNoEntry: false })?.isSymbolicLink() || real === realish(root) || !within(realish(root), real)) throw new Error(`refusing to remove ${snapshot.path}: not a folder inside ${root}`);
      note({ removing: true });
      await this.logPending;
      const result = await this.officeGit.run(["worktree", "remove", "--force", snapshot.path], "snapshot");
      if (result.code !== 0) throw new Error(`git worktree remove failed: ${result.stderr.trim() || `exit ${result.code}`}`);
      try {
        if (readdirSync(snapshot.subfolder).every((name) => name === FOLDER_FILE)) { rmSync(join(snapshot.subfolder, FOLDER_FILE), { force: true }); rmdirSync(snapshot.subfolder); }
      } catch { /* not there, or not empty */ }
      note({ removed: true });
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
      await Promise.allSettled(this.opening.values());
      const ended = await Promise.allSettled([...this.sessions.keys()].map((key) => this.closeSession(key)));
      this.record({ type: "closed", data: { retained: true } });
      await this.logPending;
      const failed = ended.filter((item): item is PromiseRejectedResult => item.status === "rejected");
      if (failed.length) throw new AggregateError(failed.map((item) => item.reason), "some native sessions could not be closed");
    })();
  }
}
