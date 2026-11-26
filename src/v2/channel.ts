import type { Autonomy } from "../adapters/Adapter.js";

export type NativeErrorKind = "rate_limit" | "context_overflow" | "login_needed" | "transport" | "other";
export interface NativeError {
  kind: NativeErrorKind;
  message: string;
  resetAt?: string;
}
export interface TurnUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  costSource?: "native_cli_estimate";
  raw: Record<string, unknown>;
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
}
export interface ChannelEvent {
  type: "text" | "thinking" | "tool_call" | "tool_result" | "approval" | "usage" | "turn_end" | "error" | "closed" | "raw";
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
