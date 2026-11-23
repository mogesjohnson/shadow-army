import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { ChannelEvent, ChannelOptions, NativeChannel, NativeError, TurnResult, TurnUsage } from "./channel.js";
import { spawnManagedProcess, type ManagedProcess } from "./processTree.js";

type Frame = Record<string, unknown>;
const object = (value: unknown): Frame | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Frame : undefined;
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
const string = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
const MAX_FRAME_BYTES = 16 * 1024 * 1024;

interface PendingTurn {
  id: string;
  resolve: (result: TurnResult) => void;
  text: string;
  contextTokens?: number;
  error?: NativeError;
  refusal: boolean;
  partialText: boolean;
  stopped: boolean;
  usageSteps: Map<string, { assistant?: Frame; stream?: Frame; outputTokens?: number }>;
  streamMessageId?: string;
}

/** Native Claude flags only: preserve its prompt, tools, permissions and session persistence. */
export function claudeChannelArgs(options: ChannelOptions, instructionPath?: string): string[] {
  const permission = options.autonomy === "full" ? "bypassPermissions" : options.autonomy === "auto" ? "auto" : "plan";
  return [
    "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
    "--include-partial-messages", "--permission-prompts", "host", "--permission-prompt-tool", "stdio",
    "--model", options.model, "--permission-mode", permission,
    ...(instructionPath ? ["--append-system-prompt-file", instructionPath] : ["--append-system-prompt", options.instructions]),
  ];
}

function textContent(frame: Frame): string {
  const content = object(frame.message)?.content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => object(part)).filter((part) => part?.type === "text").map((part) => string(part?.text) ?? "").join("\n");
}

/** Classify vendor fields; keep vendor prose intact, including unknown failures. */
export function claudeNativeError(frame: Frame, message: string): NativeError {
  const code = string(frame.error) ?? string(object(frame.error)?.type) ?? string(frame.terminal_reason) ?? string(frame.startup_failure_reason);
  const status = number(frame.api_error_status) ?? number(object(frame.error)?.status);
  let kind: NativeError["kind"] = "other";
  if (code === "rate_limit" || code === "rate_limit_error" || status === 429) kind = "rate_limit";
  else if (code === "prompt_too_long" || code === "context_overflow" || code === "context_length_exceeded" || code === "invalid_request" && /prompt is too long|prompt too long|context (?:window|length)|maximum context/i.test(message)) kind = "context_overflow";
  else if (code === "authentication_failed" || code === "oauth_org_not_allowed" || code === "cloud_credential_error" || status === 401) kind = "login_needed";
  const resetAt = string(frame.reset_at) ?? string(object(frame.error)?.reset_at);
  return { kind, message, ...(resetAt === undefined ? {} : { resetAt }) };
}

/**
 * M1 owns a persistent native channel and a result boundary, not a background-job scheduler.
 * Background frames are retained verbatim. PO-8's job/continuation quiescence and claim audit
 * belong to M2/M6; persistent LSP and MCP processes are never classified as turn-owned jobs here.
 */
export class ClaudeChannel implements NativeChannel {
  private readonly process: Promise<ManagedProcess>;
  private readonly ready: Promise<void>;
  private readonly controls = new Map<string, { resolve: (frame: Frame) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private readonly approvals = new Set<string>();
  private readonly decoder = new StringDecoder("utf8");
  private buffer = "";
  private current?: PendingTurn;
  private sessionId?: string;
  private cumulativeCost?: number;
  private missingCostBoundary = false;
  private closePromise?: Promise<void>;
  private closed = false;
  private acceptFrames = true;
  private drainTerminal = false;
  private closingResult?: TurnResult;
  private reason: NativeError = { kind: "transport", message: "Claude channel closed" };
  private stopTimer?: NodeJS.Timeout;
