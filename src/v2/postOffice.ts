import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { loadRoster, type Roster, type SoldierSpec } from "../core/roster.js";
import { applyAudited } from "./apply.js";
import { captureState, diffState, type RepoState } from "../workspace/guard.js";
import { Locks } from "../workspace/locks.js";
import { git, repoRoot } from "../workspace/git.js";
import { ensureShadowRoot, openWriteSession, type WriteSession } from "../workspace/session.js";
import { createSnapshot } from "../workspace/worktree.js";
import type { ChannelEvent, ChannelFactory, NativeChannel, TurnResult, WriteOutcome } from "./channel.js";
import { ClaudeChannel } from "./claude.js";
import { buildStandingInstructions, shadowName } from "./instructions.js";
import { redact, SessionLogs } from "./logs.js";

export interface OfficeEvent { soldier?: string; type: string; data: unknown; }
export interface OfficeOptions {
  cwd: string;
  credential: string;
  roster?: Roster;
  channelFactory?: ChannelFactory;
  onEvent?: (event: OfficeEvent) => void;
  /** Waits before the first, second and third automatic restart (PO-1: 1, 5 and 30 seconds). */
  restartDelaysMs?: readonly number[];
}
/** v1's heartbeat stops at the first audit, so the office renews the claims lease for the session's whole life and at every turn (WSP-2). */
const WRITE_LEASE_MS = 60 * 60_000;
const RESTART_DELAYS_MS = [1_000, 5_000, 30_000];
/** PO-1: a fourth crash within 10 minutes of the first counted one leaves a channel down; older crashes stop counting. */
const CRASH_WINDOW_MS = 10 * 60_000;
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
}

/** The blob `rev:path` names, or undefined when the path is absent there. */
const blob = (root: string, rev: string, path: string) => git(root, ["rev-parse", "--verify", "-q", `${rev}:${path}`]).then((out) => out.trim() || undefined, () => undefined);

/**
 * After an apply, move each running turn's guard base past exactly what the apply changed: a path whose state the turn
 * started with is now expected in its applied state. A path the turn had already seen change is left, so the guard still names it.
 * C4: only a path the folder holds as the apply wrote it (the commit's blob, or absent) moves; any other bytes are someone
 * else's change, so the guard still names that path.
 */
async function carryApply(root: string, sessions: Session[], before: RepoState, after: RepoState, paths: string[], commit: string): Promise<void> {
  const own: string[] = [];
  for (const path of paths) {
    const entry = after.dirty.get(path);
    const hash = entry === undefined ? await blob(root, "HEAD", path) : entry.slice(entry.lastIndexOf(" ") + 1);
    if (hash !== "" && (hash === "gone" ? undefined : hash) === await blob(root, commit, path)) own.push(path);
  }
  for (const session of sessions) {
    const base = session.guardBase;
    if (!base) continue;
    for (const key of ["dirty", "index"] as const) {
      for (const path of own) {
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
  private readonly roster: Roster;
  private readonly logs: SessionLogs;
  private readonly sessions = new Map<string, Session>();
  private readonly opening = new Map<string, Promise<Session>>();
  private readonly factory: ChannelFactory;
  private closed = false;
  private closePromise?: Promise<void>;
  private logPending = Promise.resolve();
  private logFailure?: Error;
  private readonly secrets: string[];
  /** Applies and guard captures take turns, so no guard reads the owner's folder halfway through an apply. */
  private applying = Promise.resolve();

  private constructor(root: string, private readonly options: OfficeOptions) {
    this.root = root;
    this.roster = options.roster ?? loadRoster(root);
    this.factory = options.channelFactory ?? ((settings) => new ClaudeChannel(settings));
    this.secrets = [options.credential];
    this.logs = new SessionLogs(join(root, ".shadow", "v2", "logs"), this.secrets);
  }

  static async create(options: OfficeOptions): Promise<PostOffice> {
    if (!/^[a-f0-9]{64}$/i.test(options.credential)) throw new Error("post office requires a credential of 32 random bytes");
    const root = await repoRoot(options.cwd);
    await ensureShadowRoot(join(root, ".shadow"));
    const office = new PostOffice(root, options);
    await office.logs.write("post-office", { type: "started", time: new Date().toISOString(), pid: process.pid });
    return office;
  }

  private check(): void {
    if (this.closed) throw new Error("post office is closed");
    if (this.logFailure) throw new Error(`post office log failed: ${this.logFailure.message}`);
  }

  private record(event: OfficeEvent, session?: Session): void {
    const safe = redact(event, this.secrets) as OfficeEvent;
    this.options.onEvent?.(safe);
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
    const ws = claims?.length ? await openWriteSession({ cwd: this.root, soldier: key, claims, ttlMs: WRITE_LEASE_MS }) : undefined;
    const instructions = buildStandingInstructions(this.roster, spec, { readOnly: !ws });
    const id = `session-${randomUUID()}`;
    let cwd: string;
    try { cwd = ws ? ws.cwd : (await createSnapshot(this.root, join(this.root, ".shadow", "v2"), "HEAD", id)).path; }
    catch (error) { await ws?.release(); throw error; }
    const session: Session = { spec, id, cwd, instructions, generation: 0, restarts: 0, crashes: [], down: false, tainted: false, restartPending: false, ...(ws ? { write: { ws, claims: [...claims!] } } : {}) };
    // C3: other calls wait on the opening promise; the session is published only once its lease and channel exist.
    try {
      if (ws) await this.holdLease(session);
      if (this.closed) throw new Error("post office closed while opening session");
    } catch (error) { session.down = true; await this.releaseWrite(session); throw error; }
    this.start(session);
    this.sessions.set(key, session);
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
            // C5: the window starts at the first crash still counted, so older crashes drop out as time passes.
            const now = Date.now();
            session.crashes = [...session.crashes.filter((at) => now - at < CRASH_WINDOW_MS), now];
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
    const snapshotBefore = session.write ? undefined : await captureState(session.cwd);
    session.guardBase = await this.exclusive(() => captureState(this.root));
    // WSP-2: a lease that could not be renewed since the last turn may have changed hands.
    await this.renewLease(session);
    let result: TurnResult;
    try {
      this.check();
      if (session.write?.leaseLost) {
        // C2: the claims may now be someone else's, so nothing reaches the CLI; a fresh open claims them again.
        session.down = true;
        await session.channel!.close();
        result = { status: "failed", text: "", refusal: false, error: { kind: "other", message: "the claims lease was lost before this turn, so nothing was sent; reconnect to claim the files again" } };
      } else result = session.stopRequested ? { status: "interrupted", text: "", refusal: false } : await session.channel!.send(text);
    } catch (error) {
      result = { status: "failed", text: "", refusal: false, error: { kind: "transport", message: String(error) } };
    }
    if (result.status === "completed") session.loginNeeded = false;
    else if (result.error?.kind === "login_needed") session.loginNeeded = true;
    let changes: string[];
    try {
      const [checkout, snapshotAfter] = await Promise.all([
        this.exclusive(async () => { const after = await captureState(this.root); const base = session.guardBase!; session.guardBase = undefined; return diffState(base, after); }),
        snapshotBefore ? captureState(session.cwd) : undefined]);
      changes = [...checkout, ...(snapshotBefore && snapshotAfter ? diffState(snapshotBefore, snapshotAfter).map((message) => `read-only snapshot: ${message}`) : [])];
    } catch (error) {
      session.guardBase = undefined;
      changes = [`checkout guard could not complete: ${String(error)}`];
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
    const tip = session.write?.tip;
    if (session.write && write) session.write.tip = write.commit;
    // M1-AC28: only a completed turn that passed the guard and the audit reaches the owner's folder.
    if (write?.applicable) {
      const audited = write;
      const apply = await this.exclusive(async () => {
        const others = [...this.sessions.values()].filter((other) => other !== session && other.guardBase);
        const before = others.length ? await captureState(this.root) : undefined;
        const applied = await applyAudited(this.root, audited, session.write!.applied);
        // W12-3: Shadow Army's own apply is no change in another running turn's checkout guard; anything else still is.
        if (before && applied.applied && applied.files.length) await carryApply(this.root, others, before, await captureState(this.root), applied.files.map((file) => file.path), audited.commit!);
        return applied;
      });
      if (apply.applied && write.commit) session.write!.applied = write.commit;
      write = { ...write, apply };
    }
    // W12-1: a turn that moved the branch but did not reach the folder (not applicable, or its apply refused: C1) leaves
    // work the owner never got. A later turn's apply would carry it in, so the session goes down, as after a guard
    // failure; reconnecting starts a fresh worktree.
    if (write && !write.apply?.applied && write.commit && write.commit !== tip && !session.down) {
      session.down = true;
      await session.channel!.close();
      write = { ...write, reason: `${write.reason ?? write.apply?.reason ?? "the apply was refused"}; the session is down so a later turn cannot carry this work in; reconnect to start fresh` };
      this.record({ soldier: session.spec.key, type: "down", data: { reason: write.reason } }, session);
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
    const diff = info.commit ? await git(info.path, ["diff", info.base, "HEAD"]) : "";
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
    await session.channel?.close();
    await session.active?.catch(() => {});
    await session.restart;
    if (session.containmentFailed) throw new Error(`native descendants for ${key} were not confirmed stopped`);
    await this.releaseWrite(session);
    this.sessions.delete(key);
    this.record({ soldier: key, type: "session_closed", data: { cwd: session.cwd, retained: true } }, session);
  }

  /** Runs `fn` alone among applies and checkout-guard captures. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.applying.then(fn);
    this.applying = next.then(() => {}, () => {});
    return next;
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
