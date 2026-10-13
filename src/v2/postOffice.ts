import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { loadRoster, type Roster, type SoldierSpec } from "../core/roster.js";
import { captureState, diffState } from "../workspace/guard.js";
import { repoRoot } from "../workspace/git.js";
import { ensureShadowRoot } from "../workspace/session.js";
import { createSnapshot } from "../workspace/worktree.js";
import type { ChannelEvent, ChannelFactory, NativeChannel, TurnResult } from "./channel.js";
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
interface Session {
  spec: SoldierSpec;
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

  async open(key: string): Promise<{ soldier: string; cwd: string; session: string }> {
    this.check();
    let existing = this.sessions.get(key);
    if (existing?.down) {
      if (existing.containmentFailed) throw new Error("native descendants were not confirmed stopped; end this caller and inspect them before starting another session");
      if (existing.active) throw new Error("cannot reconnect while the previous turn is finalizing");
      await existing.channel?.close();
      // A fresh snapshot keeps partial work in the previous one, never silently repeats it.
      this.sessions.delete(key);
      existing = undefined;
    }
    const session = await this.session(key);
    return { soldier: key, cwd: session.cwd, session: session.id };
  }

  private async session(key: string): Promise<Session> {
    this.check();
    const existing = this.sessions.get(key);
    if (existing) {
      await existing.restart;
      if (existing.down) throw new Error(`channel ${key} is down; reconnect explicitly`);
      return existing;
    }
    const pending = this.opening.get(key);
    if (pending) return pending;
    const next = this.makeSession(key);
    this.opening.set(key, next);
    try { return await next; } finally { this.opening.delete(key); }
  }

  private async makeSession(key: string): Promise<Session> {
    const spec = this.roster.soldiers.get(key);
    if (!spec) throw new Error(`unknown soldier ${key}`);
    if (spec.cli !== "claude") throw new Error(`${key}: ${spec.cli} live channels are not implemented in M1`);
    const instructions = buildStandingInstructions(this.roster, spec, { readOnly: true });
    const id = `session-${randomUUID()}`;
    const snapshot = await createSnapshot(this.root, join(this.root, ".shadow", "v2"), "HEAD", id);
    const session: Session = { spec, id, cwd: snapshot.path, instructions, generation: 0, restarts: 0, down: false, tainted: false, restartPending: false };
    this.sessions.set(key, session);
    if (this.closed) { session.down = true; throw new Error("post office closed while opening session"); }
    this.start(session);
    this.record({ soldier: key, type: "opened", data: { session: id, cwd: snapshot.path } }, session);
    return session;
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

  async send(key: string, text: string): Promise<TurnResult> {
    this.check();
    if (!text.trim()) throw new Error("message is empty");
    const session = await this.session(key);
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
    const [checkoutBefore, snapshotBefore] = await Promise.all([captureState(this.root), captureState(session.cwd)]);
    let result: TurnResult;
    try {
      this.check();
      result = session.stopRequested ? { status: "interrupted", text: "", refusal: false } : await session.channel!.send(text);
    } catch (error) {
      result = { status: "failed", text: "", refusal: false, error: { kind: "transport", message: String(error) } };
    }
    let changes: string[];
    try {
      const [checkoutAfter, snapshotAfter] = await Promise.all([captureState(this.root), captureState(session.cwd)]);
      changes = [...diffState(checkoutBefore, checkoutAfter), ...diffState(snapshotBefore, snapshotAfter).map((message) => `read-only snapshot: ${message}`)];
    } catch (error) {
      changes = [`checkout guard could not complete: ${String(error)}`];
    }
    if (changes.length) {
      session.tainted = true;
      session.down = true;
      await session.channel!.close();
      result = { ...result, status: "failed", error: { kind: "other", message: `read-only guard failed; partial work is retained at ${session.cwd}: ${changes.join("; ")}` } };
    }
    this.record({ soldier: session.spec.key, type: "guard", data: { changes, cwd: session.cwd } }, session);
    result = { ...result, summary: result.text.split(/\r?\n/).slice(0, 5).join("\n") };
    this.record({ soldier: session.spec.key, type: "delivery", data: { state: result.status === "completed" ? "answered" : "interrupted", result } }, session);
    await this.logPending;
    if (this.logFailure) throw this.logFailure;
    return redact(result, this.secrets) as TurnResult;
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
    this.sessions.delete(key);
    this.record({ soldier: key, type: "session_closed", data: { cwd: session.cwd, retained: true } }, session);
  }

  refused(): void { this.record({ type: "command_refused", data: { reason: "wrong or missing Monarch credential" } }); }

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
