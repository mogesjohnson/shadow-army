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
