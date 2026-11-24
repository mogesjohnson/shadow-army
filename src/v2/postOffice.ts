import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadRoster, type Roster, type SoldierSpec } from "../core/roster.js";
import { applyAudited } from "./apply.js";
import { captureState, diffState, type RepoState } from "../workspace/guard.js";
import { Locks } from "../workspace/locks.js";
import { ensureShadowRoot, openWriteSession, type WriteSession } from "../workspace/session.js";
import { HarnessGit } from "./git/harness.js";
import { HarnessHold, type GitRepo } from "./git/hold.js";
import { openSnapshot, posixInspect, removeInside, removeSnapshot, snapshotSubfolder, validateSnapshotRoot, type GitFactory, type Snapshot } from "./snapshot.js";
import type { ChannelEvent, ChannelFactory, NativeChannel, TurnResult, WriteOutcome } from "./channel.js";
import { ClaudeChannel } from "./claude.js";
import { buildStandingInstructions, shadowName } from "./instructions.js";
import { redact, SessionLogs } from "./logs.js";
import { containmentFailedMessage, DownSoldiers, holdGuardOpen, readTrees, stillRunning, TreeRecord, type Identity, type Leftover, type ProcessOps } from "./contain/trees.js";
import { sweepTrees, systemOps, type SweepOps } from "./contain/sweep.js";
import { accept, isAccepted, mcpServers, normalizeCommonDir, readPolicyFiles, readRecord, sha256, untrustedFiles, type PolicyFile, type PolicyFileRead, type TrustRecord, type Untrusted } from "./trust.js";
import type { TrustAnswer, TrustRow } from "./cli.js";

/** ARM-7: the reason a use gets while any policy file is untrusted. */
export const TRUST_WAIT = "the army waits for you to trust this folder's Shadow Army files";
/** ARM-7: thrown by `open` and `send` instead of starting anything; `answer` is #140's trust answer for the command's result. */
export class TrustNeeded extends Error {
  constructor(readonly answer: TrustAnswer) { super(`nothing was started: ${TRUST_WAIT}`); }
}
/** The soldiers a folder's `shadow.config.json` sets above supervised, as the card names them. Unparseable bytes name none. */
function aboveSupervised(bytes: Buffer): TrustRow[] {
  let soldiers: unknown;
  try { soldiers = (JSON.parse(bytes.toString()) as { soldiers?: unknown } | null)?.soldiers; } catch { return []; }
  if (!soldiers || typeof soldiers !== "object") return [];
  return Object.entries(soldiers as Record<string, { cli?: unknown; model?: unknown; autonomy?: unknown } | null>).flatMap(([key, one]) =>
    one?.autonomy !== undefined && one.autonomy !== "supervised" ? [{ kind: "soldier" as const, name: shadowName(key), cli: String(one.cli), model: String(one.model), autonomy: String(one.autonomy) }] : []);
}

/** A channel that can list its tree's processes (PO-11). The Claude channel doesn't expose `list` yet. */
/** PO-1: each turn's checkout baseline is kept on disk while the turn runs, so a later post office can close its guard. */
const turnsDir = (root: string) => join(root, ".shadow", "v2", "turns");
const stateToJson = (state: RepoState) => ({ ...state, dirty: [...state.dirty], index: [...state.index], refs: [...state.refs] });
const stateFromJson = (value: ReturnType<typeof stateToJson>): RepoState => ({ head: value.head, branch: value.branch, dirty: new Map(value.dirty), index: new Map(value.index), refs: new Map(value.refs) });
const machineOps = (): SweepOps | undefined => { try { return systemOps(); } catch { return undefined; } };
/** A path as compared between git's output and the office's own: forward slashes, no trailing one, and on Windows lower-cased. */
const slash = (path: string) => { const one = path.replace(/\\/g, "/").replace(/\/+$/, ""); return process.platform === "win32" ? one.toLowerCase() : one; };
/** WSP-11: a working tree nested in the folder, with everything under it, is not the checkout. */
const outsideTrees = (state: RepoState, inside: readonly string[]): RepoState => !inside.length ? state
  : { ...state, dirty: new Map([...state.dirty].filter(([path]) => !inside.some((tree) => slash(path) === tree || slash(path).startsWith(`${tree}/`)))) };

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
  processOps?: SweepOps | null;
  /** PO-8's session services: the commands the CLI's configuration declares for its language and MCP servers. Such a process never holds a turn's guard. */
  sessionServices?: readonly string[];
  /** ARM-7: the home whose `.shadow-army/trust/` holds the accepted hashes. Tests pass their own. */
  trustHome?: string;
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
/** How often a turn's guard checks whether a process that joined the tree during the turn has exited. */
const BACKGROUND_POLL_MS = 1_000;
const identityKey = (one: Identity) => `${one.pid}@${one.startTime}`;
export interface TurnOptions { claims?: string[]; }
interface Session {
  spec: SoldierSpec;
  /** `applied` is the branch tip last put into the owner's folder, so a later turn applies only what is new. */
  /** `tip` is the branch tip after the last turn; `lease` is v1's claims lease, renewed here; `leaseLost` sticks once a renewal fails. */
  write?: { ws: WriteSession; claims: string[]; applied?: string; tip?: string; lease?: { locks: Locks; id: string }; leaseLost?: boolean; heartbeat?: ReturnType<typeof setInterval> };
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
  /** PO-16's record of the soldier's process tree, removed once the tree has ended. Created before start in M1b-26. */
  tree?: TreeRecord;
  /** The last guardian identity added to the tree record (PO-9): a restart's new guardian is a new identity. */
  guardianRecorded?: Identity;
  /** A guardian line that could not be added is reported once per session, as PO-16 says for a record line. */
  guardianFailureReported?: boolean;
  /** claude's background tasks: `task_started` until its `task_notification` (PO-8, WSP-11). */
  tasks: Set<string>;
  /** Wakes a guard waiting on background work. */
  settle?: () => void;
  /** ARM-7: a restart that found a policy file untrusted; it waits for the card. */
  trustWait?: boolean;
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

/** M1 transport foundation. Routing, write claims, handoffs and background-job attribution are later milestones. */
export class PostOffice {
  readonly root: string;
  private roster: Roster;
  /** ARM-7: the folder's one trust card as shown, until accepted, and the repository's record name. */
  private card?: { shown: Untrusted[]; current: { name: PolicyFile; hash: string }[]; hashes: string[] };
  private commonDir?: Promise<string>;
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
  private readonly ops: SweepOps | undefined;
  /** The post office's own identity for its tree records, read once. */
  private self?: Promise<Identity | undefined>;
  /** WSP-10's hold on the repository, and how many turns have their guard open (PO-8). */
  private hold?: HarnessHold;
  private openTurns = 0;
  /** PO-7: the event writer's backlog is full, so soldiers' output is paused. */
  private paused = false;
  /** WSP-11: the repository's other working trees, but Shadow Army's own, as the last guard check listed them. */
  private trees?: Map<string, string>;

  private constructor(root: string, private readonly repo: GitRepo, private readonly git: GitFactory,
    private readonly snapshots: { ok: true; root: string } | { ok: false; reason: string }, private readonly options: OfficeOptions) {
    this.root = root;
    this.roster = options.roster ?? loadRoster(root);
    this.factory = options.channelFactory ?? ((settings) => new ClaudeChannel(settings));
    this.secrets = [options.credential];
    this.logs = new SessionLogs(join(root, ".shadow", "v2", "logs"), this.secrets);
    this.ops = options.processOps === undefined ? machineOps() : options.processOps ?? undefined;
  }

  static async create(options: OfficeOptions): Promise<PostOffice> {
    if (!/^[a-f0-9]{64}$/i.test(options.credential)) throw new Error("post office requires a credential of 32 random bytes");
    const found = findRepo(options.cwd);
    // WSP-10: an empty hooks folder Shadow Army keeps; PATH may not name the folder or the snapshots.
    const hooksDir = join(found.workTree, ".shadow", "v2", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    // WSP-11: a bad SHADOW_ARMY_SNAPSHOTS starts no soldier, so it is kept to name at each open. The Windows ACL reader is M1b-17.
    const snapshots = validateSnapshotRoot(process.env.SHADOW_ARMY_SNAPSHOTS, { home: homedir(), folder: found.workTree, workTrees: [],
      inspect: process.platform === "win32" ? () => ({ owner: "owner", writableByOthers: false }) : posixInspect });
    const untrusted = [found.workTree, ...(snapshots.ok ? [snapshots.root] : [])];
    const gitFor: GitFactory = options.gitFactory ?? ((repo) => new HarnessGit({ repo, hooksDir, untrusted }));
    // The folder as `git rev-parse --show-toplevel` prints it: the army's mark is taken from this path (WSP-11).
    const top = await gitFor(found).run(["rev-parse", "--show-toplevel"]);
    if (top.code !== 0) throw new Error(`the army runs only inside a git working tree: ${top.stderr.trim()}`);
    const root = top.stdout.trim();
    const repo = { ...found, workTree: root };
    await ensureShadowRoot(join(root, ".shadow"));
    // WSP-10: every later harness git command runs between the hold's checks; the hold reads the repository with plain harness git.
    const hold = new HarnessHold({ repo, gitFor: (at) => ({ run: (args, kind) => gitFor(at).run(args, kind) }),
      statePath: join(root, ".shadow", "v2", "logs", "harness-hold.json"), log: (event) => office.record({ type: "harness_hold", data: event }) });
    const held: GitFactory = (at) => { const git = gitFor(at); return { run: (args, kind, cwd) => hold.run({ run: (a, k) => git.run(a, k, cwd) }, args, kind) }; };
    const office: PostOffice = new PostOffice(root, repo, held, snapshots, options);
    office.hold = hold;
    const lastLogEnd = await stat(join(root, ".shadow", "v2", "logs", "post-office.jsonl")).then((file) => file.mtime.toISOString(), () => undefined);
    await office.logs.write("post-office", { type: "started", time: new Date().toISOString(), pid: process.pid });
    const start = await hold.start();
    if (start.held) office.record({ type: "harness_git_held", data: { line: start.line } });
    await office.finishLast(lastLogEnd);
    return office;
  }

  /**
   * PO-1: before any channel opens, finish what earlier post offices left: their trees (PO-16), their open turns' guards and
   * their snapshots (WSP-11). An item is logged before its file goes, so nothing is reported twice. A post office whose
   * tree record shows it still running keeps its items.
   */
  private async finishLast(lastLogEnd: string | undefined): Promise<void> {
    const ops = this.ops;
    if (!ops) { this.record({ type: "startup", data: { finished: false, reason: `no process operations on ${process.platform}; earlier trees, turns and snapshots are left` } }); return; }
    const trees = await readTrees(this.root);
    const running = async (id: string) => {
      const office = trees.find((tree) => tree.id === id)?.lines.find((line) => line.kind === "post-office");
      return office !== undefined && "pid" in office && await ops.startTimeOf(office.pid) === office.startTime;
    };
    const swept = await sweepTrees(this.root, ops);
    if (swept.swept || swept.left.length || swept.unhandled) this.record({ type: "swept", data: swept });
    for (const name of (await readdir(turnsDir(this.root)).catch(() => [] as string[])).filter((name) => name.endsWith(".json"))) {
      const id = name.slice(0, -".json".length), file = join(turnsDir(this.root), name);
      if (await running(id)) continue;
      let turn: { soldier?: string; time?: string; base?: ReturnType<typeof stateToJson> } = {};
      try { turn = JSON.parse(await readFile(file, "utf8")); } catch { /* reported as missing below */ }
      const who = `${turn.soldier ? shadowName(turn.soldier) : id}'s turn at ${turn.time ? new Date(turn.time).toTimeString().slice(0, 5) : "an unknown time"}`;
      let line: string;
      try {
        const changes = diffState(stateFromJson(turn.base!), await this.exclusive(() => captureState(this.root)));
        line = `${who} checked after its post office stopped: this compares the checkout now with the turn's start; the last post office's log ends at ${lastLogEnd ?? "an unknown time"}, and changes made since then, the owner's own included, show too: ${changes.length ? changes.join("; ") : "no change"}`;
      } catch { line = `${who} not checked: baseline missing`; }
      this.record({ ...(turn.soldier ? { soldier: turn.soldier } : {}), type: "late_guard", data: { session: id, line } });
      await this.logPending;
      await unlink(file).catch(() => {});
    }
    if (!this.snapshots.ok) return;
    const root = this.snapshots.root, subfolder = snapshotSubfolder(root, this.root);
    for (const entry of await readdir(subfolder, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || await running(entry.name)) continue;
      const path = join(subfolder, entry.name);
      try {
        const gitDir = resolve(path, (await readFile(join(path, ".git"), "utf8")).replace(/^gitdir:\s*/, "").trim());
        const status = await this.git({ gitDir, workTree: path, commonDir: this.repo.commonDir }).run(["status", "--porcelain", "--untracked-files=all"], "guard");
        const files = status.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
        if (files.length) this.record({ type: "read_violation", data: { session: entry.name, files, line: `a read-only snapshot the last post office left had writes: ${files.join(", ")}` } });
        await removeSnapshot({ path, subfolder, gitDir, commonDir: this.repo.commonDir }, root, this.repo, this.git);
      } catch (error) {
        // A snapshot started but not made: removed as one that timed out (WSP-10).
        removeInside(root, path);
        this.record({ type: "snapshot", data: { session: entry.name, removed: true, made: false, reason: String(error) } });
      }
    }
    await this.logPending;
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

  private trustDeps() {
    return { home: this.options.trustHome ?? homedir(), log: (line: string) => this.record({ type: "trust_record", data: { line } }) };
  }

  /** ARM-7: the record is named for the common git directory as git prints it, lower-cased on Windows. */
  private repoKey(): Promise<string> {
    return this.commonDir ??= this.git(this.repo).run(["rev-parse", "--path-format=absolute", "--git-common-dir"]).then((out) => {
      if (out.code !== 0) { this.commonDir = undefined; throw new Error(`the repository's common git directory can't be read: ${out.stderr.trim()}`); }
      return normalizeCommonDir(out.stdout.trim());
    });
  }

  /** ARM-7: the folder's policy files, each read and hashed once, against the record. Any untrusted one raises the card instead. */
  private async trustCheck(): Promise<{ record: TrustRecord | null; files: PolicyFileRead[] }> {
    const commonDir = await this.repoKey();
    const files = await readPolicyFiles(this.root);
    const record = await readRecord(this.trustDeps(), commonDir);
    const untrusted = untrustedFiles(record, slash(this.root), files);
    if (untrusted.length) throw this.raiseCard(record, untrusted, files);
    return { record, files };
  }

  /** The roster from trusted files: they are hashed again after it is read, so bytes changed meanwhile are never used. */
  private async trustedRoster(): Promise<{ record: TrustRecord | null; files: PolicyFileRead[] }> {
    const first = await this.trustCheck();
    if (this.options.roster) return first;
    const roster = loadRoster(this.root);
    const again = await this.trustCheck();
    if (again.files.map((file) => file.hash).join() !== first.files.map((file) => file.hash).join()) return this.trustedRoster();
    this.roster = roster;
    return again;
  }

  /** ARM-7: a claude session connects the `.mcp.json` where it opens, which can differ from the folder's; that copy needs trust too. */
  private async trustCwd(key: string, cwd: string, trusted: { record: TrustRecord | null; files: PolicyFileRead[] }): Promise<void> {
    const bytes = await readFile(join(cwd, ".mcp.json")).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error; });
    if (!bytes || isAccepted(trusted.record, ".mcp.json", sha256(bytes))) return;
    const status = trusted.record?.accepted[".mcp.json"]?.length ? "changed" : "new";
    throw this.raiseCard(trusted.record, [{ name: ".mcp.json", status, hash: sha256(bytes) }], trusted.files, shadowName(key), bytes);
  }

  /** ARM-7: the folder's one card: each file with its full hash (a gone one's last trusted), the soldiers set above supervised, and the servers. */
  private raiseCard(record: TrustRecord | null, untrusted: Untrusted[], current: PolicyFileRead[], soldier?: string, mcp?: Buffer): TrustNeeded {
    const last = record?.worktrees[slash(this.root)] ?? {};
    const shown = untrusted.map((file) => ({ ...file, hash: file.hash ?? last[file.name] ?? "" }));
    const rows: TrustRow[] = shown.map((file) => ({ kind: "file", name: file.name, state: file.status, hash: file.hash, ...(soldier ? { soldier } : {}) }));
    const bytesOf = (name: PolicyFile) => shown.some((file) => file.name === name && file.status !== "gone") ? current.find((file) => file.name === name)?.bytes : undefined;
    const config = soldier ? undefined : bytesOf("shadow.config.json");
    if (config) rows.push(...aboveSupervised(config));
    const servers = mcp ?? bytesOf(".mcp.json");
    if (servers) rows.push(...mcpServers(servers).map((server) => ({ kind: "server" as const, file: ".mcp.json", name: server.name, target: server.target })));
    this.card = { shown, current: current.map(({ name, hash }) => ({ name, hash })), hashes: shown.map((file) => file.hash) };
    this.record({ type: "trust_card", data: { rows, line: TRUST_WAIT } });
    return new TrustNeeded({ trust: { rows } });
  }

  /**
   * ARM-7: the owner typed "Trust these files". Records exactly the card's hashes for every working tree of the repository,
   * then lets each restart waiting on the card go on. A file changed since the card stays untrusted: the next use shows a new one.
   */
  async trust(hashes: unknown): Promise<{ ok: true }> {
    this.check();
    const card = this.card;
    if (!card) throw new Error("no trust card is waiting; nothing was accepted");
    if (!Array.isArray(hashes) || hashes.join() !== card.hashes.join() || hashes.length !== card.hashes.length) throw new Error("the hashes are not the ones the trust card showed; nothing was accepted");
    const result = await accept(this.trustDeps(), { commonDir: await this.repoKey(), worktree: slash(this.root), shown: card.shown, current: card.current });
    if (!result.ok) throw new Error(result.reason);
    if (this.card === card) this.card = undefined;
    this.record({ type: "trust_accepted", data: { hashes: card.hashes } });
    for (const session of this.sessions.values()) if (session.trustWait) { session.trustWait = false; this.restart(session); }
    return { ok: true };
  }

  async open(key: string, options: TurnOptions = {}): Promise<{ soldier: string; cwd: string; session: string; branch?: string }> {
    this.check();
    let existing = this.sessions.get(key);
    if (existing?.down) {
      if (existing.containmentFailed) {
        // PO-15: a reconnect starts the CLI only once no process the failure named still runs; unnamed ones keep it down.
        const left = await this.leftovers(existing);
        if (left !== "unknown" && !this.downSoldiers.isDown(key)) this.downSoldiers.fail(key, left);
        if (left === "unknown" || !this.ops || !(await this.downSoldiers.mayStart(key, this.processOps(this.ops)))) {
          throw new Error("native descendants were not confirmed stopped; end this caller and inspect them before starting another session");
        }
        await existing.tree?.remove().catch(() => {});
      }
      if (existing.active) throw new Error("cannot reconnect while the previous turn is finalizing");
      await existing.channel?.close();
      await this.releaseWrite(existing);
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
      // ARM-7: a restart waiting on the card starts only once the files are trusted; until then the use gets the card.
      if (existing.trustWait) { await this.trustCheck(); existing.trustWait = false; this.restart(existing); }
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
    // ARM-7: no session opens and no snapshot or worktree is made while a policy file is untrusted; the soldier runs as the trusted files say.
    const trusted = await this.trustedRoster();
    const spec = this.roster.soldiers.get(key);
    if (!spec) throw new Error(`unknown soldier ${key}`);
    if (spec.cli !== "claude") throw new Error(`${key}: ${spec.cli} live channels are not implemented in M1`);
    // Hard rule: writes need the build role and a soldier the roster lets write. Nothing starts otherwise.
    if (claims?.length && (!spec.write || !spec.roles.includes("build"))) throw new Error(`${key} cannot write: claims need the build role and write access in the roster`);
    // Bad or overlapping claims throw here, naming the holder, before any process starts (WSP-2).
    const ws = claims?.length ? await openWriteSession({ cwd: this.root, soldier: key, claims, ttlMs: WRITE_LEASE_MS }) : undefined;
    const instructions = buildStandingInstructions(this.roster, spec, { readOnly: !ws });
    const id = `session-${randomUUID()}`;
    let snapshot: Snapshot | undefined, tree: TreeRecord | undefined;
    try {
      // PO-16: the tree's record exists before anything of the session does; one that can't be written starts nothing (PO-15).
      tree = await this.treeRecord(key, id);
      // WSP-11: a soldier whose snapshot can't be made does not start, and never runs in the folder itself.
      if (!ws && !this.snapshots.ok) throw new Error(`${key} can't start: ${this.snapshots.reason}`);
      if (!ws && this.snapshots.ok) snapshot = await openSnapshot({ root: this.snapshots.root, folder: this.root, sessionId: id, repo: this.repo, git: this.git });
      await this.trustCwd(key, ws ? ws.cwd : snapshot!.path, trusted);
    } catch (error) {
      if (snapshot && this.snapshots.ok) await removeSnapshot(snapshot, this.snapshots.root, this.repo, this.git).catch(() => {});
      await tree?.remove().catch(() => {}); await ws?.release(); throw error;
    }
    const cwd = ws ? ws.cwd : snapshot!.path;
    const session: Session = { spec, id, cwd, instructions, ...(snapshot ? { snapshot } : {}), ...(tree ? { tree } : {}), generation: 0, restarts: 0, crashes: [], down: false, tainted: false, restartPending: false, tasks: new Set(), ...(ws ? { write: { ws, claims: [...claims!] } } : {}) };
    this.sessions.set(key, session);
    if (ws) await this.holdLease(session);
    if (this.closed) { session.down = true; await this.releaseWrite(session); throw new Error("post office closed while opening session"); }
    this.start(session);
    this.record({ soldier: key, type: "opened", data: { session: id, cwd, ...(ws ? { branch: ws.branch, claims: session.write!.claims } : {}) } }, session);
    return session;
  }

  private async treeRecord(key: string, id: string): Promise<TreeRecord | undefined> {
    const ops = this.ops;
    if (!ops) return undefined;
    this.self ??= ops.startTimeOf(process.pid).then((startTime) => startTime === undefined ? undefined : { pid: process.pid, startTime });
    const failed = (reason: string) => new Error(containmentFailedMessage(shadowName(key), { reason }));
    const self = await this.self;
    if (!self) throw failed("the post office's own start time can't be read");
    return TreeRecord.create(this.root, id, self, undefined, (error) => this.record({ soldier: key, type: "tree_record", data: { listed: false, reason: String(error) } }))
      .catch((error: unknown) => { throw failed(`tree record not written: ${String(error)}`); });
  }

  /** Adds the channel's guardian to the session's tree record once per identity. A line that can't be added is reported once; the next turn tries again. */
  private async recordGuardian(session: Session): Promise<void> {
    const guardian = session.channel?.guardian, tree = session.tree;
    if (!guardian || !tree) return;
    if (session.guardianRecorded?.pid === guardian.pid && session.guardianRecorded.startTime === guardian.startTime) return;
    const identity: Identity = { pid: guardian.pid, startTime: guardian.startTime };
    try {
      await tree.add({ kind: "guardian", ...identity });
      session.guardianRecorded = identity;
    } catch (error) {
      if (session.guardianFailureReported) return;
      session.guardianFailureReported = true;
      this.record({ soldier: session.spec.key, type: "tree_record", data: { guardian: false, reason: String(error) } }, session);
    }
  }

  private processOps(ops: SweepOps): ProcessOps {
    return { startTimeOf: (pid) => ops.startTimeOf(pid), end: async (processes) => { for (const one of processes) await ops.endProcess(one.pid, false); } };
  }

  /** PO-15: the processes of the session's tree record that still run, named by their command lines; `"unknown"` when none was recorded. */
  private async leftovers(session: Session): Promise<Leftover[] | "unknown"> {
    const ops = this.ops;
    const lines = (await readTrees(this.root)).find((tree) => tree.id === session.id)?.lines ?? [];
    const named = lines.flatMap((line) => "pid" in line && line.kind !== "post-office" ? [{ pid: line.pid, startTime: line.startTime, command: "" }] : []);
    if (!ops || named.length === 0) return "unknown";
    const left = await stillRunning(this.processOps(ops), named);
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
    session.channel = this.factory({ cwd: session.cwd, model: session.spec.model, autonomy: session.spec.autonomy, instructions: session.instructions,
      onEvent: (event: ChannelEvent) => {
        if (generation !== session.generation) return;
        this.record({ soldier: session.spec.key, ...event }, session);
        if (event.type === "error" && (event.data as { kind?: string } | undefined)?.kind === "login_needed") session.loginNeeded = true;
        const frame = event.type === "raw" ? event.data as { type?: unknown; subtype?: unknown; task_id?: unknown } : undefined;
        if (frame?.type === "system" && typeof frame.task_id === "string") {
          if (frame.subtype === "task_started") session.tasks.add(frame.task_id);
          if (frame.subtype === "task_notification") { session.tasks.delete(frame.task_id); session.settle?.(); }
        }
        if (event.type === "closed") {
          // PO-8: a CLI whose process has ended has no background work left; a waiting guard closes.
          session.tasks.clear();
          session.settle?.();
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
    if (this.paused) session.channel.pause?.();
  }

  private restart(session: Session): void {
    if (session.restart || this.closed || session.down || !session.restartPending || session.trustWait) return;
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
      const key = session.spec.key;
      try {
        // ARM-7: a restart is a fresh session, so it reads the policy files again, and starts nothing while one is untrusted.
        const trusted = await this.trustedRoster();
        session.spec = this.roster.soldiers.get(key) ?? session.spec;
        session.instructions = buildStandingInstructions(this.roster, session.spec, { readOnly: !session.write });
        // WSP-11: a restart opens a fresh session, so it gets a new snapshot; the old one's writes are reported before it goes.
        if (session.snapshot && this.snapshots.ok) {
          await this.reportWrites(session, "before its restart");
          await removeSnapshot(session.snapshot, this.snapshots.root, this.repo, this.git);
          session.snapshot = await openSnapshot({ root: this.snapshots.root, folder: this.root, sessionId: session.id, repo: this.repo, git: this.git });
          session.cwd = session.snapshot.path;
          if (this.closed || session.down) return;
        }
        await this.trustCwd(key, session.cwd, trusted);
      } catch (error) {
        if (!(error instanceof TrustNeeded)) throw error;
        session.trustWait = true;
        this.record({ soldier: key, type: "trust_wait", data: { line: `${shadowName(key)} not restarted: ${TRUST_WAIT}` } }, session);
        return;
      }
      this.start(session);
      this.record({ soldier: session.spec.key, type: "restarted", data: { attempt: session.restarts, replayed: false, cwd: session.cwd,
        line: `${shadowName(session.spec.key)} restarted (attempt ${session.restarts}): this is a new session, and its earlier context is gone` } }, session);
    })().catch((error: unknown) => {
      session.down = true;
      this.record({ soldier: session.spec.key, type: "down", data: { reason: String(error) } }, session);
    }).finally(() => {
      session.restart = undefined;
      if (session.restartPending && !session.trustWait && !session.active && !session.down && !this.closed) this.restart(session);
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
    const snapshotBefore = session.write ? undefined : await captureState(session.cwd);
    session.guardBase = await this.exclusive(() => captureState(this.root));
    const treesOpen = await this.exclusive(() => this.worktrees(session));
    const turnFile = join(turnsDir(this.root), `${session.id}.json`);
    await mkdir(turnsDir(this.root), { recursive: true })
      .then(() => writeFile(turnFile, JSON.stringify({ soldier: session.spec.key, time: new Date().toISOString(), base: stateToJson(session.guardBase!) }), { mode: 0o600 }))
      .catch((error: unknown) => this.record({ soldier: session.spec.key, type: "turn_baseline", data: { written: false, reason: String(error) } }, session));
    // WSP-10: a post office that stops with a turn open leaves the next one the state trusted before it, not the state it finds.
    this.hold?.setTurnOpen(++this.openTurns > 0);
    // WSP-2: a lease that could not be renewed since the last turn may have changed hands.
    await this.renewLease(session);
    const channel = session.channel, generation = session.generation;
    const before = channel?.list ? await channel.list().catch(() => []) : [];
    let result: TurnResult;
    try {
      this.check();
      result = session.stopRequested ? { status: "interrupted", text: "", refusal: false } : await session.channel!.send(text);
    } catch (error) {
      result = { status: "failed", text: "", refusal: false, error: { kind: "transport", message: String(error) } };
    }
    if (result.status === "completed") session.loginNeeded = false;
    else if (result.error?.kind === "login_needed") session.loginNeeded = true;
    // PO-9: the guardian holds the job, so its identity goes into the tree record once the channel has one.
    await this.recordGuardian(session);
    // PO-11: the tree's processes as the channel lists them go into its record.
    const after = channel?.list ? await channel.list().catch(() => []) : [];
    if (channel?.list && session.tree) await session.tree.listing(after);
    await this.backgroundWork(session, generation, before, after);
    // PO-15: while a process the failed containment named still runs, the guard stays open; with none named it is cut short.
    if (session.containmentFailed && this.ops) await holdGuardOpen(await this.leftovers(session), this.processOps(this.ops), { wait: this.ops.wait });
    let changes: string[];
    try {
      // Both captures settle before the turn ends: a failed one must not leave the other's git running in the folder.
      const settled = await Promise.allSettled([
        this.exclusive(async () => {
          const after = await captureState(this.root), base = session.guardBase!;
          session.guardBase = undefined;
          // WSP-11: a working tree inside the folder, as listed when the guard opened or closes, is not the checkout.
          const inside = [...new Set([...treesOpen, ...await this.worktrees(session)])];
          return diffState(outsideTrees(base, inside), outsideTrees(after, inside));
        }),
        snapshotBefore ? captureState(session.cwd) : undefined]);
      const [checkout, snapshotAfter] = settled.map((item) => { if (item.status === "rejected") throw item.reason; return item.value; }) as [string[], RepoState | undefined];
      changes = [...checkout, ...(snapshotBefore && snapshotAfter ? diffState(snapshotBefore, snapshotAfter).map((message) => `read-only snapshot: ${message}`) : [])];
    } catch (error) {
      session.guardBase = undefined;
      changes = [`checkout guard could not complete: ${String(error)}`];
    }
    await unlink(turnFile).catch(() => {});
    this.hold?.setTurnOpen(--this.openTurns > 0);
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
        const before = others.length ? await captureState(this.root) : undefined;
        const applied = await applyAudited(this.root, audited, session.write!.applied);
        // W12-3: Shadow Army's own apply is no change in another running turn's checkout guard; anything else still is.
        if (before && applied.applied && applied.files.length) carryApply(others, before, await captureState(this.root), applied.files.map((file) => file.path));
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

  /**
   * WSP-11, with PO-8's session services from M1: past its end event, the turn's guard stays open while a task the
   * session reported runs, or while a process that joined the tree during the turn runs and is no declared session
   * service. It closes when that work ends, or when the CLI's process or the session ends.
   */
  private async backgroundWork(session: Session, generation: number, before: Identity[], after: Identity[]): Promise<void> {
    const ops = this.ops, known = new Set(before.map(identityKey));
    let joined: Leftover[] = [];
    if (ops) {
      for (const one of after.filter((process) => !known.has(identityKey(process)))) {
        const command = (await ops.commandOf?.(one.pid).catch(() => undefined)) ?? "";
        if (!this.isService(command)) joined.push({ ...one, command });
      }
    }
    const live = () => generation === session.generation && !session.down && !session.restartPending && !this.closed;
    let shown = false;
    while (live()) {
      if (ops && joined.length) joined = await stillRunning(this.processOps(ops), joined);
      if (!live() || (session.tasks.size === 0 && joined.length === 0)) return;
      if (!shown) {
        shown = true;
        this.record({ soldier: session.spec.key, type: "background_work", data: { tasks: [...session.tasks], processes: joined.map((one) => one.pid) } }, session);
      }
      const settled = new Promise<void>((done) => { session.settle = done; });
      await (joined.length ? Promise.race([settled, ops!.wait(BACKGROUND_POLL_MS)]) : settled);
      session.settle = undefined;
    }
  }

  /**
   * WSP-11: lists the repository's working trees at a guard's open or close, and at the office's close. Each one added or
   * removed since the last check, but the folder itself, Shadow Army's snapshots and its `shadow/` worktrees, gets one line;
   * the first check only learns them. Returns those inside the folder, relative to it, as `slash` gives them.
   */
  private async worktrees(session?: Session): Promise<string[]> {
    // Read as `git worktree list` reads them, from each linked tree's `gitdir` and `HEAD`: no process, so no hold check per turn.
    const admin = join(this.repo.commonDir, "worktrees");
    const top = slash(this.root), snaps = this.snapshots.ok ? slash(this.snapshots.root) : undefined, now = new Map<string, string>();
    for (const name of await readdir(admin).catch(() => [] as string[])) {
      const gitdir = (await readFile(join(admin, name, "gitdir"), "utf8").catch(() => "")).trim();
      const branch = (await readFile(join(admin, name, "HEAD"), "utf8").catch(() => "")).trim().replace(/^ref:\s*/, "");
      const path = gitdir ? dirname(resolve(admin, name, gitdir)).replace(/\\/g, "/") : "";
      if (!path || slash(path) === top || (snaps && slash(path).startsWith(`${snaps}/`)) || branch.startsWith("refs/heads/shadow/")) continue;
      now.set(slash(path), path);
    }
    const who = session ? { soldier: session.spec.key } : {};
    for (const [key, path] of this.trees ? now : []) if (!this.trees!.has(key)) this.record({ ...who, type: "worktree", data: { added: path, line: `a working tree of the repository was added at ${path}` } }, session);
    for (const [key, path] of this.trees ?? []) if (!now.has(key)) this.record({ ...who, type: "worktree", data: { removed: path, line: `the working tree at ${path} was removed` } }, session);
    this.trees = now;
    return [...now.keys()].filter((key) => key.startsWith(`${top}/`)).map((key) => key.slice(top.length + 1));
  }

  /** WSP-11: a read-only snapshot's writes are reported before it is removed; one that can't be read is not removed. */
  private async reportWrites(session: Session, when: string): Promise<void> {
    const { path, gitDir, commonDir } = session.snapshot!;
    const status = await this.git({ gitDir, workTree: path, commonDir }).run(["status", "--porcelain", "--untracked-files=all"], "guard");
    if (status.code !== 0) throw new Error(`the snapshot's writes could not be read: ${status.stderr.trim()}`);
    const files = status.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
    if (files.length) this.record({ soldier: session.spec.key, type: "read_violation", data: { session: session.id, files, line: `${shadowName(session.spec.key)}'s read-only snapshot had writes ${when}: ${files.join(", ")}` } }, session);
  }

  /** PO-8: a process the CLI started with a command its configuration declares for a session service. */
  private isService(command: string): boolean {
    const line = command.trim();
    return line !== "" && (this.options.sessionServices ?? []).some((declared) => line === declared.trim() || line.startsWith(`${declared.trim()} `));
  }

  /** PO-7: while the event writer's backlog is full, every open channel stops reading its soldier's output; it reads on once drained. */
  backlog(full: boolean): void {
    this.paused = full;
    for (const session of this.sessions.values()) {
      if (full) session.channel?.pause?.(); else session.channel?.resume?.();
    }
  }

  /** v1's claim audit: revert edits outside the claims, commit the rest on the soldier's branch, and hand B4 the audited diff. */
  private async audit(session: Session, result: TurnResult, guardChanges: string[]): Promise<WriteOutcome> {
    const info = await session.write!.ws.finish(`${session.spec.key}: turn`);
    const diff = info.commit ? (await this.git(findRepo(info.path)).run(["diff", info.base, "HEAD"])).stdout : "";
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
    session.settle?.();
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
    let retained = !session.snapshot || session.tainted;
    if (!retained && this.snapshots.ok) {
      const root = this.snapshots.root;
      await this.reportWrites(session, "at its close").then(() => removeSnapshot(session.snapshot!, root, this.repo, this.git))
        .catch((error: unknown) => { retained = true; this.record({ soldier: key, type: "snapshot", data: { removed: false, reason: String(error) } }, session); });
    }
    this.sessions.delete(key);
    this.record({ soldier: key, type: "session_closed", data: { cwd: session.cwd, retained } }, session);
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
      // WSP-11: a working tree removed after the last guard closed shows here.
      if (this.trees) await this.exclusive(() => this.worktrees());
      this.record({ type: "closed", data: { retained: true } });
      await this.logPending;
      const failed = ended.filter((item): item is PromiseRejectedResult => item.status === "rejected");
      if (failed.length) throw new AggregateError(failed.map((item) => item.reason), "some native sessions could not be closed");
    })();
  }
}
