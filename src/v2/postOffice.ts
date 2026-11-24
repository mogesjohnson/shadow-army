import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { loadRoster, type Roster, type SoldierSpec } from "../core/roster.js";
import { captureState, diffState } from "../workspace/guard.js";
import { git, repoRoot } from "../workspace/git.js";
import { Locks } from "../workspace/locks.js";
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
}
/** v1's heartbeat stops at the first audit, so the office renews the claims lease for the session's whole life and at every turn (WSP-2). */
const WRITE_LEASE_MS = 60 * 60_000;
export interface TurnOptions { claims?: string[]; }
interface Session {
  spec: SoldierSpec;
  /** `tip` is the branch tip after the last turn; `lease` is v1's claims lease, renewed here; `leaseLost` sticks once a renewal fails. */
  write?: { ws: WriteSession; claims: string[]; tip?: string; lease?: { locks: Locks; id: string }; leaseLost?: boolean; heartbeat?: ReturnType<typeof setInterval> };
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
    // A send that arrives while the first open is still making its worktree gets the same claim check.
    if (pending) { await pending; return this.session(key, claims); }
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
    const session: Session = { spec, id, cwd, instructions, generation: 0, restarts: 0, down: false, tainted: false, restartPending: false, ...(ws ? { write: { ws, claims: [...claims!] } } : {}) };
    this.sessions.set(key, session);
    if (ws) await this.holdLease(session);
    if (this.closed) { session.down = true; await this.releaseWrite(session); throw new Error("post office closed while opening session"); }
    this.start(session);
    this.record({ soldier: key, type: "opened", data: { session: id, cwd, ...(ws ? { branch: ws.branch, claims: session.write!.claims } : {}) } }, session);
    return session;
  }

  /** WSP-2: the lease must hold while the session is open, so keep renewing it until release. Owner, pid and claims name it. */
  private async holdLease(session: Session): Promise<void> {
    const write = session.write!;
    const locks = new Locks(join(this.root, ".shadow"));
    const claims = JSON.stringify([...write.ws.claims].sort());
    const lease = (await locks.list()).filter((held) => held.owner === session.spec.key && held.pid === process.pid && JSON.stringify([...held.claims].sort()) === claims).at(-1);
    if (lease) write.lease = { locks, id: lease.id };
    write.heartbeat = setInterval(() => { void this.renewLease(session); }, WRITE_LEASE_MS / 3);
    write.heartbeat.unref?.();
  }

  /** False once the lease could not be renewed: the files may have changed hands, so nothing more is eligible. */
  private async renewLease(session: Session): Promise<boolean> {
    const write = session.write;
    if (!write) return true;
    const kept = write.lease && !write.leaseLost ? await write.lease.locks.renew(write.lease.id, WRITE_LEASE_MS).catch(() => false) : false;
    if (!kept) write.leaseLost = true;
    return kept;
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
        if (event.type === "closed") {
          if ((event.data as { containmentStopped?: boolean })?.containmentStopped === false) {
            session.containmentFailed = true;
            session.down = true;
            this.record({ soldier: session.spec.key, type: "down", data: { reason: "native descendants could not be confirmed stopped; inspect before reconnecting" } }, session);
            return;
          }
          if (this.closed || session.down) return;
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
      if (session.restarts >= 3) {
        session.down = true;
        this.record({ soldier: session.spec.key, type: "down", data: { reason: "three automatic restarts exhausted; reconnect explicitly" } }, session);
        return;
      }
      session.restarts++;
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
    // WSP-2: fail closed before the brief goes out when the claims may have changed hands.
    if (!(await this.renewLease(session))) {
      session.down = true;
      await session.channel?.close();
      const reason = "the claims lease was lost, so the files may have changed hands; reconnect to start fresh";
      this.record({ soldier: key, type: "down", data: { reason } }, session);
      throw new Error(`${key}: ${reason}`);
    }
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
    const [checkoutBefore, snapshotBefore] = await Promise.all([captureState(this.root), session.write ? undefined : captureState(session.cwd)]);
    let result: TurnResult;
    try {
      this.check();
      result = session.stopRequested ? { status: "interrupted", text: "", refusal: false } : await session.channel!.send(text);
    } catch (error) {
      result = { status: "failed", text: "", refusal: false, error: { kind: "transport", message: String(error) } };
    }
    let changes: string[];
    try {
      const [checkoutAfter, snapshotAfter] = await Promise.all([captureState(this.root), snapshotBefore ? captureState(session.cwd) : undefined]);
      changes = [...diffState(checkoutBefore, checkoutAfter), ...(snapshotBefore && snapshotAfter ? diffState(snapshotBefore, snapshotAfter).map((message) => `read-only snapshot: ${message}`) : [])];
    } catch (error) {
      changes = [`checkout guard could not complete: ${String(error)}`];
    }
    // The audit runs once, after the turn and the guard, also for a failed or cut-short turn (WSP-2).
    let write: WriteOutcome | undefined;
    if (session.write) {
      await this.renewLease(session);
      try { write = await this.audit(session, result, changes); }
      catch (error) { changes.push(`claim audit could not complete: ${String(error)}`); }
    }
    if (changes.length) {
      session.tainted = true;
      session.down = true;
      await session.channel!.close();
      const guard = session.write ? "checkout guard failed; nothing is applied" : "read-only guard failed";
      result = { ...result, status: "failed", error: { kind: "other", message: `${guard}; partial work is retained at ${session.cwd}: ${changes.join("; ")}` } };
      if (write) write = { ...write, applicable: false, reason: changes.join("; ") };
    }
    // A turn that is not applicable but moved the branch leaves work the owner never accepted. A later turn would carry it
    // into its own audit, so the session goes down, as after a guard failure; reconnecting starts a fresh worktree.
    if (write && !write.applicable && write.commit && write.commit !== session.write!.tip && !session.down) {
      session.down = true;
      await session.channel!.close();
      write = { ...write, reason: `${write.reason}; the session is down so a later turn cannot carry this work in; reconnect to start fresh` };
      this.record({ soldier: session.spec.key, type: "down", data: { reason: write.reason } }, session);
    }
    if (session.write && write) session.write.tip = write.commit;
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
    // The branch holds earlier turns' commits too: only a tip this turn moved is this turn's change.
    else if (!info.commit || info.commit === session.write!.tip) reason = "the soldier changed nothing";
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
    await session.channel?.close();
    await session.active?.catch(() => {});
    await session.restart;
    if (session.containmentFailed) throw new Error(`native descendants for ${key} were not confirmed stopped`);
    await this.releaseWrite(session);
    this.sessions.delete(key);
    this.record({ soldier: key, type: "session_closed", data: { cwd: session.cwd, retained: true } }, session);
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
