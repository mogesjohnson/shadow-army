import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Roster, SoldierSpec } from "../core/roster.js";
import { applyAudited } from "./apply.js";
import type { AppliedFile } from "../workspace/apply.js";
import { captureState, diffState, type RepoState } from "../workspace/guard.js";
import { Locks } from "../workspace/locks.js";
import { git, repoRoot, splitZ } from "../workspace/git.js";
import { ensureShadowRoot, openWriteSession, type WriteSession } from "../workspace/session.js";
import { createSnapshot } from "../workspace/worktree.js";
import type { ChannelEvent, ChannelFactory, NativeChannel, RetryNotice, TurnResult, WriteOutcome } from "./channel.js";
import { ClaudeChannel } from "./claude.js";
import { buildStandingInstructions, InstructionsTooLargeError, MAX_INSTRUCTION_TOKENS } from "./instructions.js";
import { redact, REDACTED, SessionLogs } from "./logs.js";
import type { LeaseRecord } from "./lease.js";
import { loadV2Roster, resolveShadowNames } from "./roster.js";

/** Streamed fragments the log holds until their block ends (C1): thinking first, as the CLI streams it. */
const FRAGMENT_KINDS = ["thinking", "text"] as const;
const frameOf = (event: ChannelEvent): { type?: unknown; event?: { type?: unknown; delta?: unknown } } | undefined =>
  event.type === "raw" && event.data && typeof event.data === "object" ? event.data as { type?: unknown; event?: { type?: unknown; delta?: unknown } } : undefined;
/** A raw stream delta: its text reaches the log only inside the assembled block. */
const isDelta = (event: ChannelEvent): boolean => frameOf(event)?.type === "stream_event" && frameOf(event)?.event?.delta !== undefined;
/** The parts of a raw Claude frame that carry a tool call's streamed input or its whole call. */
interface RawFrame {
  type?: unknown;
  parent_tool_use_id?: string | null;
  event?: { type?: unknown; index?: unknown; content_block?: { type?: unknown; id?: unknown; name?: unknown }; delta?: { type?: unknown; partial_json?: unknown } };
  message?: { content?: Array<{ type?: unknown; id?: unknown } | null> };
}
interface ToolInput { id?: string; name?: string; parts: string[] }
/** Events that end a streamed block: the block's stop, the whole assistant message, the turn's end or the process's. */
const endsBlock = (event: ChannelEvent): boolean => {
  const frame = frameOf(event);
  return event.type === "turn_end" || event.type === "closed" || frame?.type === "assistant"
    || (frame?.type === "stream_event" && (frame.event?.type === "content_block_stop" || frame.event?.type === "message_stop"));
};

/** What a block-ending event ends: one block, or every block of one stream (a message's end or an assistant frame). */
interface BlockScope { parent: string; block?: string }
const blockScope = (event: ChannelEvent): BlockScope | undefined => {
  const frame = frameOf(event) as RawFrame | undefined;
  if (!frame) return undefined;
  const parent = frame.parent_tool_use_id ?? "main";
  return frame.type === "stream_event" && frame.event?.type === "content_block_stop" ? { parent, block: `${parent}:${String(frame.event?.index)}` } : { parent };
};

export type LeaseEndReason = "Claude Code ended" | "the owner logged out" | "no renewal from the mod for 30 s";
export interface OfficeEvent { soldier?: string; type: string; data: unknown; }
export interface OfficeOptions {
  cwd: string;
  credential: string;
  roster?: Roster;
  /** Soldier key to shadow name, for a supplied `roster`, checked like configured names. Default: each soldier's default name. A loaded roster brings its own. */
  names?: ReadonlyMap<string, string>;
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
/** `exact` (#94 C10): the selected session decides, so a send to a writer must name its claims; the HTTP server sets it. */
export interface TurnOptions { claims?: string[]; exact?: boolean; }
interface Session {
  spec: SoldierSpec;
  /** A turn was reserved on this session. */
  used?: boolean;
  /** `tip` is the full commit ID of the branch tip the last audit resolved; `lease` is v1's claims lease, renewed here; `leaseLost` sticks once a renewal fails. */
  write?: { ws: WriteSession; claims: string[]; tip?: string; lease?: { locks: Locks; id: string }; leaseLost?: boolean; heartbeat?: ReturnType<typeof setInterval> };
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

/** The owner's one-line notice for a CLI backing off before an API retry. */
function retryMessage(soldier: string, cli: string, retry: RetryNotice): string {
  const attempt = retry.attempt === undefined ? "" : `attempt ${retry.attempt}${retry.maxRetries === undefined ? "" : ` of ${retry.maxRetries}`}`;
  const delay = retry.retryDelayMs === undefined ? "" : `in ${Math.round(retry.retryDelayMs / 100) / 10} s`;
  const cause = [retry.errorStatus, retry.error].filter((part) => part !== undefined && part !== null && part !== "").map(String).join(" ");
  const detail = [[attempt, delay].filter(Boolean).join(", "), cause].filter(Boolean).join("; ");
  return `${soldier}: ${cli} is retrying${detail ? ` (${detail})` : ""}`;
}
/** The blob `rev:path` names, or undefined when the path is absent there. */
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
/** An index entry as `git add -N` writes it: the empty blob (SHA-1 or SHA-256) at stage 0. */
const INTENT_TO_ADD = /^100(644|755) (e69de29bb2d1d6434b8b29ae775ad8c2e48c5391|473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813) 0\n$/;
const blob = (root: string, rev: string, path: string) => git(root, ["rev-parse", "--verify", "-q", `${rev}:${path}`]).then((out) => out.trim() || undefined, () => undefined);

/**
 * After an apply, move each running turn's guard base past exactly what the apply changed: a path whose state the turn
 * started with is now expected in its applied state. A path the turn had already seen change is left, so the guard still names it.
 * C4: only a path the folder holds as the apply wrote it (the commit's blob, or absent) moves; any other bytes are someone
 * else's change, so the guard still names that path.
 * #99 C7: the worktree and the index are reconciled independently. The apply's only index effect is the intent-to-add
 * entry of a file it added, so only that entry moves; any other index change (an owner's staging) is still named.
 * #94 C12: an empty file the owner staged in full has the same `ls-files --stage` entry as intent-to-add, but only the
 * staged one is in `diff --cached`. An added path that is not verified intent-to-add carries neither its index nor its
 * worktree state, so the guard still names it.
 */
async function carryApply(root: string, sessions: Session[], before: RepoState, after: RepoState, files: AppliedFile[], commit: string): Promise<void> {
  const own = { dirty: [] as string[], index: [] as string[] };
  const staged = files.some((file) => file.change === "A")
    ? new Set(splitZ(await git(root, ["diff", "--cached", "--no-renames", "--name-only", "-z"]))) : new Set<string>();
  for (const { path, change } of files) {
    const intentToAdd = INTENT_TO_ADD.test(after.index.get(path) ?? "") && !staged.has(path);
    if (change === "A" && !intentToAdd) continue;
    const entry = after.dirty.get(path);
    const hash = entry === undefined ? await blob(root, "HEAD", path) : entry.slice(entry.lastIndexOf(" ") + 1);
    if (hash !== "" && (hash === "gone" ? undefined : hash) === await blob(root, commit, path)) own.dirty.push(path);
    if (change === "A") own.index.push(path);
  }
  for (const session of sessions) {
    const base = session.guardBase;
    if (!base) continue;
    for (const key of ["dirty", "index"] as const) {
      for (const path of own[key]) {
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
  /** ARM-3: validated at construction, so a name clash refuses startup. */
  private readonly names: ReadonlyMap<string, string>;
  private readonly logs: SessionLogs;
  private readonly sessions = new Map<string, Session>();
  private readonly opening = new Map<string, Promise<Session>>();
  private readonly factory: ChannelFactory;
  private closed = false;
  private closePromise?: Promise<void>;
  private logPending = Promise.resolve();
  private logFailure?: Error;
  /** Session id to its held tool input, by block (C10). */
  private readonly toolInputs = new Map<string, Map<string, ToolInput>>();
  /** Sessions whose opening record is being written: a failure there is reported by the refused send alone (C13). */
  private readonly openingWrites = new Set<string>();
  /** Sessions whose `opened` record is being written. */
  private readonly openedWrites = new Set<string>();
  /** A gap opened by the `opened` record, not yet reported: the first send decides whether it is a refusal (C19). */
  private readonly heldGaps = new Map<string, Error>();
  /** Sessions whose send's opening failure already went out as its own refused notice. */
  private readonly refusalsReported = new Set<string>();
  /** Session id to its streamed blocks: the block the next fragment belongs to, and the kinds each held block has (C14). */
  private readonly blocks = new Map<string, { current: string; held: Map<string, Set<(typeof FRAGMENT_KINDS)[number]>> }>();
  /** `log_failed` notices on their way into the office log (M1-AC4). */
  private noticesWriting = 0;
  private readonly secrets: string[];
  /** Applies and guard captures take turns, so no guard reads the owner's folder halfway through an apply. */
  private applying = Promise.resolve();

  private constructor(root: string, private readonly options: OfficeOptions) {
    this.root = root;
    const loaded = options.roster
      ? { roster: options.roster, names: resolveShadowNames([...options.roster.soldiers.keys()], options.names ? Object.fromEntries(options.names) : {}) }
      : loadV2Roster(root);
    this.roster = loaded.roster;
    this.names = loaded.names;
    this.factory = options.channelFactory ?? ((settings) => new ClaudeChannel(settings));
    this.secrets = [options.credential];
    this.logs = new SessionLogs(join(root, ".shadow", "v2", "logs"), this.secrets, {
      onFailure: ({ name, error, type }) => this.logFailed(name, error, type),
      // C22: a later line closed the opening gap, so no send can be refused for it: it is reported unmarked now.
      onRecovered: (name) => this.releaseHeldGap(name),
    });
  }

  /** C3 (PO-5, M1-AC4): one notice per gap, outside the failing log; the turn carries on. */
  private logFailed(name: string, error: Error, type: string | undefined): void {
    // M1-AC4: the office log failing while it records a notice is the same failure (a full disk), already reported once.
    if (name === "post-office" && this.noticesWriting > 0) return;
    // C19/C26/C29: a gap the `opened` record opened waits only while a send holds the session: if that send is refused
    // for the same gap, the one event is marked refused; a send that ends first releases it. A standalone open is reported now.
    // C30: only the lost record's own kind decides: any other line lost meanwhile is an ordinary, unmarked gap.
    const paired = [...this.sessions.values()].some((session) => session.id === name && session.active);
    if (type === "opened" && this.openedWrites.has(name) && paired) { this.heldGaps.set(name, error); return; }
    const refused = type === "turn_started" && this.openingWrites.has(name);
    if (refused) this.refusalsReported.add(name);
    this.reportGap(name, error, refused);
  }

  private releaseHeldGap(name: string): void {
    const held = this.heldGaps.get(name);
    if (held) { this.heldGaps.delete(name); this.reportGap(name, held, false); }
  }

  /** C20: the session's queued records (its `opened` one too) settle first, so their gap is reported while the session is known. */
  private async settleLogs(session: Session): Promise<void> {
    await this.logPending;
    this.releaseHeldGap(session.id);
  }

  private reportGap(name: string, error: Error, refused: boolean): void {
    const soldier = [...this.sessions.values()].find((session) => session.id === name)?.spec.key;
    // C13/C15: when the opening write is what stops the send, the event still goes out (PO-5) marked refused; only the duplicate transcript line is dropped.
    const notice = redact({ ...(soldier ? { soldier } : {}), type: "log_failed",
      data: { log: name, ...(refused ? { refused: true } : {}), reason: `the log ${name} could not be written; ${refused ? "the send was refused" : "later lines are retried and the gap is counted"}: ${error.message}` } }, this.secrets) as OfficeEvent;
    try { this.options.onEvent?.(notice); } catch { /* the owner's handler cannot stop the turn */ }
    if (name === "post-office" || refused) return;
    this.noticesWriting++;
    void this.logs.write("post-office", { ...notice, time: new Date().toISOString() }).finally(() => { this.noticesWriting--; });
  }

  /** A native event: a streamed fragment is forwarded now and logged whole when its block ends (C1, M1-AC2). */
  private recordNative(session: Session, event: ChannelEvent): void {
    const soldier = session.spec.key;
    this.trackToolInput(session, event);
    this.trackBlock(session, event);
    const kind = FRAGMENT_KINDS.find((name) => name === event.type);
    if ((kind && typeof event.data === "string") || isDelta(event)) {
      this.options.onEvent?.(redact({ soldier, ...event }, this.secrets) as OfficeEvent);
      if (kind) { const text = event.data as string; const block = this.holdBlock(session, kind); this.logPending = this.logPending.then(() => this.logs.fragment(session.id, `${kind}|${block}`, text)); }
      return;
    }
    if (endsBlock(event)) this.flushBlocks(session, event.type === "turn_end" || event.type === "closed", blockScope(event));
    this.record({ soldier, ...event }, session);
  }

  /** C14: a raw stream frame names the block the next fragment belongs to (the process emits the frame first). */
  private trackBlock(session: Session, event: ChannelEvent): void {
    const frame = event.type === "raw" && event.data && typeof event.data === "object" ? event.data as RawFrame : undefined;
    if (frame?.type !== "stream_event" && frame?.type !== "assistant") return;
    const state = this.blocks.get(session.id) ?? { current: "main:message", held: new Map() };
    this.blocks.set(session.id, state);
    state.current = `${frame.parent_tool_use_id ?? "main"}:${frame.type === "assistant" ? "message" : String(frame.event?.index)}`;
  }

  private holdBlock(session: Session, kind: (typeof FRAGMENT_KINDS)[number]): string {
    const state = this.blocks.get(session.id) ?? { current: "main:message", held: new Map() };
    this.blocks.set(session.id, state);
    const kinds = state.held.get(state.current) ?? new Set();
    kinds.add(kind);
    state.held.set(state.current, kinds);
    return state.current;
  }

  /** C10 (PO-5): a tool call's streamed input is held by its block until the whole call arrives; the delta itself is never logged. */
  private trackToolInput(session: Session, event: ChannelEvent): void {
    const frame = event.type === "raw" && event.data && typeof event.data === "object" ? event.data as RawFrame : undefined;
    if (frame?.type !== "stream_event" && frame?.type !== "assistant") return;
    const held = this.toolInputs.get(session.id) ?? new Map<string, ToolInput>();
    this.toolInputs.set(session.id, held);
    if (frame.type === "assistant") {
      // The whole call is logged from this frame, so its streamed input is no longer needed.
      const ids = new Set((Array.isArray(frame.message?.content) ? frame.message.content : []).filter((part) => part?.type === "tool_use").map((part) => part?.id));
      for (const [key, input] of held) if (input.id !== undefined && ids.has(input.id)) held.delete(key);
      return;
    }
    const key = `${frame.parent_tool_use_id ?? "main"}:${String(frame.event?.index)}`;
    const block = frame.event?.content_block;
    if (frame.event?.type === "content_block_start" && block?.type === "tool_use") {
      // A block index is reused by the next message: an earlier call still held there was never finished.
      const earlier = held.get(key);
      if (earlier) this.writeToolInputs(session, [earlier]);
      held.set(key, { id: typeof block.id === "string" ? block.id : undefined, name: typeof block.name === "string" ? block.name : undefined, parts: [] });
    } else if (frame.event?.delta?.type === "input_json_delta" && typeof frame.event.delta.partial_json === "string") {
      const input = held.get(key) ?? { parts: [] };
      input.parts.push(frame.event.delta.partial_json);
      held.set(key, input);
    }
  }

  /** Writes unfinished tool input whole, joined before it is redacted, so a secret split across deltas is still caught. */
  private writeToolInputs(session: Session, inputs: ToolInput[]): void {
    if (inputs.length === 0) return;
    this.logPending = this.logPending.then(async () => {
      for (const { id, name, parts } of inputs) {
        await this.logs.write(session.id, { soldier: session.spec.key, type: "tool_input", unfinished: true, id, name, input: parts.join(""), time: new Date().toISOString() });
      }
    }).catch(() => {});
  }

  /** Writes each held block whole, redacted as one text; at the turn's end, tool input whose call never arrived too. */
  private flushBlocks(session: Session, turnOver = false, scope?: BlockScope): void {
    // C14: only the block that ended (or the stream a whole message ended), never another stream's.
    const held = this.blocks.get(session.id)?.held ?? new Map<string, Set<(typeof FRAGMENT_KINDS)[number]>>();
    const ended = [...held.entries()].filter(([key]) => turnOver || !scope || (scope.block ? key === scope.block : key.startsWith(`${scope.parent}:`)));
    for (const [key] of ended) held.delete(key);
    if (ended.length > 0) this.logPending = this.logPending.then(async () => {
      for (const [key, kinds] of ended) for (const kind of FRAGMENT_KINDS) if (kinds.has(kind)) await this.logs.endMessage(session.id, `${kind}|${key}`, { soldier: session.spec.key, type: kind, time: new Date().toISOString() });
    }).catch(() => {});
    if (turnOver) this.blocks.delete(session.id);
    if (!turnOver) return;
    this.writeToolInputs(session, [...(this.toolInputs.get(session.id)?.values() ?? [])]);
    this.toolInputs.delete(session.id);
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
    const opening = session && event.type === "opened" ? session.id : undefined;
    this.logPending = this.logPending.then(async () => {
      if (opening) this.openedWrites.add(opening);
      try { await this.logs.write(session ? session.id : "post-office", { ...safe, time: new Date().toISOString() }); }
      finally { if (opening) this.openedWrites.delete(opening); }
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
      return { ...spec, name: this.names.get(spec.key) ?? spec.key, supported: spec.cli === "claude", state: session?.down ? "down" : session?.active ? "working" : session ? "idle" : "closed", restarts: session?.restarts ?? 0 };
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
      await this.settleLogs(existing);
      // A fresh snapshot keeps partial work in the previous one, never silently repeats it.
      this.sessions.delete(key);
      existing = undefined;
    }
    const session = await this.session(key, options.claims, options.exact);
    return { soldier: key, cwd: session.cwd, session: session.id, ...(session.write ? { branch: session.write.ws.branch } : {}) };
  }

  /** The current session's identity and role, read from the office's own state (#94 C10). */
  held(key: string): { session: string; writer: boolean; used: boolean } | undefined {
    const session = this.sessions.get(key);
    return session && { session: session.id, writer: !!session.write, used: !!session.used };
  }

  private async session(key: string, claims?: string[], exact = false): Promise<Session> {
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
      if (exact && held && !wanted) throw new Error(`${key} holds a write session: a send to a writer needs its claims (close its session to send read-only)`);
      return existing;
    }
    const pending = this.opening.get(key);
    // A send that arrives while the first open is still making its worktree gets the same claim check.
    if (pending) { await pending; return this.session(key, claims, exact); }
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
    // SI-3: the size refusal comes first, so nothing is allocated for a soldier that cannot open, and the log keeps the count and section.
    let instructions: string;
    try { instructions = buildStandingInstructions(this.roster, spec, { readOnly: !claims?.length, names: this.names }); }
    catch (error) {
      if (error instanceof InstructionsTooLargeError) this.record({ soldier: key, type: "refused", data: { reason: "standing instructions too large", estimate: error.estimate, limit: MAX_INSTRUCTION_TOKENS, section: `## ${key}`, message: error.message } });
      throw error;
    }
    // Bad or overlapping claims throw here, naming the holder, before any process starts (WSP-2).
    const ws = claims?.length ? await openWriteSession({ cwd: this.root, soldier: key, claims, ttlMs: WRITE_LEASE_MS }) : undefined;
    const id = `session-${randomUUID()}`;
    let cwd: string;
    try { cwd = ws ? ws.cwd : (await createSnapshot(this.root, join(this.root, ".shadow", "v2"), "HEAD", id)).path; }
    catch (error) { await ws?.release(); throw error; }
    const session: Session = { spec, id, cwd, instructions, generation: 0, restarts: 0, crashes: [], down: false, tainted: false, restartPending: false, ...(ws ? { write: { ws, claims: [...claims!] } } : {}) };
    // C3: other calls wait on the opening promise; the session is published only once its lease and channel exist.
    try {
      if (ws) await this.holdLease(session);
      if (this.closed) throw new Error("post office closed while opening session");
      // #99 C8: a factory that throws synchronously rolls back too, so no claims or heartbeat stay behind.
      this.start(session);
    } catch (error) {
      session.down = true;
      await session.channel?.close().catch(() => {});
      await this.releaseWrite(session);
      throw error;
    }
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
        this.recordNative(session, event);
        if (event.type === "error" && (event.data as { kind?: string } | undefined)?.kind === "login_needed") session.loginNeeded = true;
        if (event.type === "retry") this.record({ soldier: session.spec.key, type: "notice", data: { kind: "retry", message: retryMessage(session.spec.key, session.spec.cli, event.data as RetryNotice) } }, session);
        if (event.type === "closed") {
          if ((event.data as { containmentStopped?: boolean })?.containmentStopped === false) {
            session.containmentFailed = true;
            session.down = true;
            this.record({ soldier: session.spec.key, type: "down", data: { reason: "native descendants could not be confirmed stopped; inspect before reconnecting" } }, session);
            return;
          }
          if (this.closed || session.down) return;
          // #111 C3: an old, silent or managed-refused CLI fails the same way every time, so it is down, never restarted.
          if ((event.data as { refusedStart?: boolean })?.refusedStart === true) {
            session.down = true;
            this.record({ soldier: session.spec.key, type: "down", data: { reason: "the CLI refused to start (see its error); fix that, then reconnect" } }, session);
            return;
          }
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
    const session = await this.session(key, options.claims, options.exact);
    if (session.active) throw new Error(`${key} already has a running turn`);
    // #90 C7: the turn is reserved before the first await, so a parallel send sees it and is refused,
    // and an interrupt during the lease renewal is kept for run().
    session.stopRequested = false;
    session.used = true;
    const next = (async () => {
      // WSP-2: fail closed before the brief goes out when the claims may have changed hands.
      if (!(await this.renewLease(session))) await this.leaseLostDown(session);
      // A copied credential in a brief must never enter a soldier's stdin/context either.
      return this.run(session, text.replace(new RegExp(this.secrets[0]!, "gi"), REDACTED));
    })();
    session.active = next;
    try { return await next; } finally {
      session.active = undefined;
      // C29: a send that ended before its opening could account for a held gap (a lost lease) reports it unmarked now.
      this.releaseHeldGap(session.id);
      if (session.restartPending) this.restart(session);
    }
  }

  /** WSP-2: a lease known lost before the turn's opening takes the session down and refuses the send; nothing is opened. */
  private async leaseLostDown(session: Session): Promise<never> {
    session.down = true;
    await session.channel?.close();
    const reason = "the claims lease was lost, so the files may have changed hands; reconnect to start fresh";
    this.record({ soldier: session.spec.key, type: "down", data: { reason } }, session);
    throw new Error(`${session.spec.key}: ${reason}`);
  }

  private async run(session: Session, text: string): Promise<TurnResult> {
    // C2 (PO-5, M1-AC4): the turn's opening record is written, after everything before it, before the soldier gets the message.
    await this.logPending;
    // C28: the turn's own preparation is done before its opening, so only the delivery follows its last path check.
    // Both checks run even after transport failure/cancellation. M2 extends this native result
    // boundary to actual background jobs; persistent session services must survive ordinary turns.
    // A write session has no read-only snapshot to guard: the claim audit takes its place.
    const snapshotBefore = session.write ? undefined : await captureState(session.cwd);
    session.guardBase = await this.exclusive(() => captureState(this.root));
    // WSP-2 (C31): a lease that could not be renewed since the last turn may have changed hands: no opening is written.
    if (!(await this.renewLease(session))) { session.guardBase = undefined; await this.leaseLostDown(session); }
    this.openingWrites.add(session.id);
    const opened = await this.logs.write(session.id, { soldier: session.spec.key, type: "turn_started", data: { text }, time: new Date().toISOString() }).finally(() => this.openingWrites.delete(session.id));
    const held = this.heldGaps.get(session.id);
    this.heldGaps.delete(session.id);
    const reported = this.refusalsReported.delete(session.id);
    if (held) this.reportGap(session.id, held, !opened.written);
    // A refusal inside a gap already reported (a standalone open's, C26) still gets its one refused line.
    else if (!opened.written && !reported) this.reportGap(session.id, opened.error ?? new Error("unknown error"), true);
    if (!opened.written) {
      session.guardBase = undefined;
      throw new Error(`message not sent: the session log could not record the turn's start (${String(redact(opened.error?.message ?? "unknown error", this.secrets))})`);
    }
    let result: TurnResult;
    try {
      this.check();
      if (session.write?.leaseLost) {
        // C2: lost while the opening was written (the renewal above passed): the claims may now be someone else's, so nothing reaches the CLI; a fresh open claims them again.
        session.down = true;
        await session.channel!.close();
        result = { status: "failed", text: "", refusal: false, error: { kind: "other", message: "the claims lease was lost before this turn, so nothing was sent; reconnect to claim the files again" } };
      } else if (session.stopRequested) result = { status: "interrupted", text: "", refusal: false };
      else result = await session.channel!.send(text);
    } catch (error) {
      result = { status: "failed", text: "", refusal: false, error: { kind: "transport", message: String(error) } };
    }
    // A stream that ended without closing its block still has its fragments, and unfinished tool input, logged whole.
    this.flushBlocks(session, true);
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
      await this.renewLease(session);
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
    if (session.write && write) session.write.tip = write.tip;
    // M1-AC28: only a completed turn that passed the guard and the audit reaches the owner's folder, and only its own
    // audited delta, `start..tip`, as resolved at the audit.
    let failure: string | undefined;
    if (write?.applicable) {
      const audited = write;
      const apply = await this.exclusive(async () => {
        const others = [...this.sessions.values()].filter((other) => other !== session && other.guardBase);
        const before = others.length ? await captureState(this.root) : undefined;
        const applied = await applyAudited(this.root, audited);
        // #94 C14: a temporary file left behind is a warning beside the outcome, never instead of it.
        if (applied.cleanup) failure = `the apply's cleanup failed: ${applied.cleanup}`;
        // W12-3: Shadow Army's own apply is no change in another running turn's checkout guard; anything else still is.
        // #92 C6: the folder has changed by now, so a failed carry is reported, never thrown; it only leaves the
        // other running turns' guards naming these paths (they fail closed).
        if (before && applied.applied && applied.files.length) {
          try { await carryApply(this.root, others, before, await captureState(this.root), applied.files, audited.tip!); }
          catch (error) { failure = [failure, `other running turns' guards were not moved past this apply: ${message(error)}`].filter(Boolean).join("; "); }
        }
        return applied;
      });
      write = { ...write, apply };
    }
    // W12-1: a turn that moved the branch but did not reach the folder (not applicable, or its apply refused: C1) leaves
    // work the owner never got. A later turn's apply would carry it in, so the session goes down, as after a guard
    // failure; reconnecting starts a fresh worktree.
    // #92 C6: once files reached the owner's folder, no later failure (an observer, the log) hides which.
    // #94 C15: nor which files a failed rollback may have left changed (`left`).
    const applied = !!write?.apply && (write.apply.applied ? write.apply.files.length > 0 : !!write.apply.left?.length);
    const afterApply = (error: unknown) => {
      if (!applied) throw error;
      failure = [failure, `the post office failed after the apply: ${message(error)}`].filter(Boolean).join("; ");
    };
    if (write && !write.apply?.applied && write.tip && write.tip !== tip && !session.down) {
      session.down = true;
      write = { ...write, reason: `${write.reason ?? write.apply?.reason ?? "the apply was refused"}; the session is down so a later turn cannot carry this work in; reconnect to start fresh` };
      try {
        await session.channel!.close();
        this.record({ soldier: session.spec.key, type: "down", data: { reason: write.reason } }, session);
      } catch (error) { afterApply(error); }
    }
    if (write) result = { ...result, write };
    result = { ...result, summary: result.text.split(/\r?\n/).slice(0, 5).join("\n") };
    try {
      this.record({ soldier: session.spec.key, type: "guard", data: { changes, cwd: session.cwd } }, session);
      if (write) this.record({ soldier: session.spec.key, type: "audit", data: { ...write, diff: undefined } }, session);
      this.record({ soldier: session.spec.key, type: "delivery", data: { state: result.status === "completed" ? "answered" : "interrupted", result } }, session);
      await this.logPending;
    } catch (error) { afterApply(error); }
    if (this.logFailure) {
      if (!applied) throw this.logFailure;
      failure = [failure, `post office log failed: ${this.logFailure.message}`].filter(Boolean).join("; ");
    }
    if (failure) result = { ...result, logFailure: failure };
    return redact(result, this.secrets) as TurnResult;
  }

  /** v1's claim audit: revert edits outside the claims, commit the rest on the soldier's branch, and hand B4 the audited diff. */
  private async audit(session: Session, result: TurnResult, guardChanges: string[]): Promise<WriteOutcome> {
    const info = await session.write!.ws.finish(`${session.spec.key}: turn`);
    // Immutable IDs at the audit boundary: the apply and its record use these, never the branch name.
    const start = session.write!.tip ?? info.base;
    const tip = info.commit ? (await git(info.path, ["rev-parse", "--verify", `${info.commit}^{commit}`])).trim() : undefined;
    const diff = tip ? await git(info.path, ["diff", start, tip]) : "";
    let reason: string | undefined;
    if (guardChanges.length) reason = guardChanges.join("; ");
    else if (result.status !== "completed") reason = `the turn ${result.status}; its claimed work stays on ${info.branch}`;
    else if (info.leaseLost || session.write!.leaseLost) reason = "the claims lease was lost, so the files may have changed hands";
    // The branch holds earlier turns' commits too: only a tip this turn moved is this turn's change.
    else if (!tip || tip === start) reason = "the soldier changed nothing";
    return { worktree: info.path, branch: info.branch, base: info.base, commit: info.commit, ...(tip ? { tip } : {}), start, claims: info.claims, inScope: info.inScope, outOfScope: info.outOfScope,
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

  /** `only`: close the session only while it is still that one, so a caller never closes a session another request opened. */
  async closeSession(key: string, only?: string): Promise<void> {
    await this.opening.get(key)?.catch(() => {});
    const session = this.sessions.get(key);
    if (!session || (only !== undefined && session.id !== only)) return;
    session.down = true;
    session.wake?.();
    await session.channel?.close();
    await session.active?.catch(() => {});
    await session.restart;
    if (session.containmentFailed) throw new Error(`native descendants for ${key} were not confirmed stopped`);
    await this.releaseWrite(session);
    this.record({ soldier: key, type: "session_closed", data: { cwd: session.cwd, retained: true } }, session);
    // C19/C20: a gap no send claimed, or the close record's own, is reported with its soldier before the session goes.
    await this.settleLogs(session);
    if (this.sessions.get(key) === session) this.sessions.delete(key);
  }

  /** Runs `fn` alone among applies and checkout-guard captures. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.applying.then(fn);
    this.applying = next.then(() => {}, () => {});
    return next;
  }

  refused(): void { this.record({ type: "command_refused", data: { reason: "wrong or missing Monarch credential" } }); }

  /** PO-7: the shutdown's reason, which tells the owner's logout from Claude Code ending and from a lapsed lease. */
  leaseEnded(session: string, reason: LeaseEndReason): void {
    this.record({ type: "lease_ended", data: { session, reason } });
  }

  /** PO-7: the lease's start, each long step and each refusal go to the redacting log; renewals are never logged one by one. */
  leaseRecord(record: LeaseRecord): void { this.record(record); }

  close(): Promise<void> {
    return this.closePromise ??= (async () => {
      this.closed = true;
      await Promise.allSettled(this.opening.values());
      const ended = await Promise.allSettled([...this.sessions.keys()].map((key) => this.closeSession(key)));
      await this.logPending;
      // C19: a gap no send claimed is reported unmarked before the office ends.
      for (const [name, error] of this.heldGaps) this.reportGap(name, error, false);
      this.heldGaps.clear();
      this.record({ type: "closed", data: { retained: true } });
      await this.logPending;
      const failed = ended.filter((item): item is PromiseRejectedResult => item.status === "rejected");
      if (failed.length) throw new AggregateError(failed.map((item) => item.reason), "some native sessions could not be closed");
    })();
  }
}
