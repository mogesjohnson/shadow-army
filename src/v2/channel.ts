import type { Autonomy } from "../adapters/Adapter.js";
import type { ApplyResult } from "../workspace/apply.js";

export type NativeErrorKind = "rate_limit" | "context_overflow" | "login_needed" | "transport" | "other";
export interface NativeError {
  kind: NativeErrorKind;
  message: string;
  resetAt?: string;
}
/** One model's own figures for a turn, subagent models included (CH-2, OBS-3). */
export interface ModelUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
  outputTokens?: number;
  webSearchRequests?: number;
  costUsd?: number;
}
export interface TurnUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  costSource?: "native_cli_estimate";
  /** The turn's figures by model, where the CLI reports them; absent where it gives only main-loop figures. */
  models?: Record<string, ModelUsage>;
  raw: Record<string, unknown>;
}
/** What a turn with claims leaves in the soldier's worktree for the apply (B4) and the card. */
export interface WriteOutcome {
  worktree: string;
  branch: string;
  base: string;
  /** Short sha of the branch tip when it holds any change. */
  commit?: string;
  claims: string[];
  inScope: string[];
  /** Changed outside the claims and reverted. */
  outOfScope: string[];
  reverted: boolean;
  leaseLost: boolean;
  /** The owner's folder had uncommitted changes the worktree (made from HEAD) does not contain. */
  uncommittedIgnored: boolean;
  /** The audited change: `git diff base HEAD` in the worktree, claimed files only. */
  diff: string;
  /** True only when the turn completed and passed the guard and the audit with a change to apply. */
  applicable: boolean;
  reason?: string;
  /** What B4 did with the change: the files now uncommitted in the owner's folder, or why none. Absent unless applicable. */
  apply?: ApplyResult;
}
export interface TurnResult {
  status: "completed" | "failed" | "interrupted";
  text: string;
  refusal: boolean;
  sessionId?: string;
  contextTokens?: number;
  usage?: TurnUsage;
  error?: NativeError;
  /** Office summaries are bounded independently of the native full reply retained in logs. */
  summary?: string;
  write?: WriteOutcome;
}
/** The CLI is backing off before retrying its API call; not an error, the turn goes on (CH-2). */
export interface RetryNotice {
  attempt?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  errorStatus?: unknown;
  error?: unknown;
}
export interface ChannelEvent {
  type: "text" | "thinking" | "tool_call" | "tool_result" | "approval" | "usage" | "turn_end" | "error" | "retry" | "closed" | "raw";
  data: unknown;
}
export interface ChannelOptions {
  cwd: string;
  model: string;
  instructions: string;
  autonomy?: Autonomy;
  interruptTimeoutMs?: number;
  onEvent: (event: ChannelEvent) => void;
  /** A configured executable is also how fake CLIs are selected in tests. */
  command?: { file: string; args?: string[] };
}
export interface NativeChannel {
  send(text: string): Promise<TurnResult>;
  interrupt(): Promise<void>;
  respondApproval(requestId: string, response: unknown): Promise<void>;
  close(): Promise<void>;
}
export type ChannelFactory = (options: ChannelOptions) => NativeChannel;
