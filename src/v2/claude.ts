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
  private closePromise?: Promise<void>;
  private closed = false;
  private acceptFrames = true;
  private drainTerminal = false;
  private closingResult?: TurnResult;
  private reason: NativeError = { kind: "transport", message: "Claude channel closed" };
  private stopTimer?: NodeJS.Timeout;
  private instructionDirectory?: string;

  constructor(private readonly options: ChannelOptions) {
    this.process = this.spawn();
    this.ready = this.open();
    // Spawn/initialization errors must remain observed even if the owner closes before sending.
    void this.ready.catch((error: unknown) => this.failTransport(error instanceof Error ? error.message : String(error)));
  }

  private async spawn(): Promise<ManagedProcess> {
    const command = this.options.command ?? { file: "claude" };
    let instructionPath: string | undefined;
    // npm's Windows .cmd shim cannot preserve multiline argv. The vendor's append-file flag
    // preserves the same standing text and default prompt. Credentials never enter these options.
    if (process.platform === "win32" && /[\r\n]/.test(this.options.instructions)) {
      this.instructionDirectory = await mkdtemp(join(tmpdir(), "shadow-claude-instructions-"));
      instructionPath = join(this.instructionDirectory, "instructions.txt");
      await writeFile(instructionPath, this.options.instructions, { encoding: "utf8", mode: 0o600 });
    }
    return spawnManagedProcess({ file: command.file, args: [...(command.args ?? []), ...claudeChannelArgs(this.options, instructionPath)], cwd: this.options.cwd });
  }

  private emit(type: ChannelEvent["type"], data: unknown): void {
    this.options.onEvent({ type, data });
  }

  private async open(): Promise<void> {
    const child = await this.process;
    if (this.closed) return;
    child.stdout.on("data", (chunk: Buffer) => this.read(this.decoder.write(chunk)));
    child.stdout.on("end", () => {
      this.read(this.decoder.end());
      if (this.buffer.trim()) this.parseLine(this.buffer);
      this.buffer = "";
      if (!this.closed) void this.failTransport("Claude output stream ended", true);
    });
    child.stdout.on("error", (error: Error) => { void this.failTransport(error.message); });
    child.stdin.on("error", (error: Error) => { void this.failTransport(error.message); });
    child.stderr.on("data", (chunk: Buffer) => this.emit("raw", { type: "stderr", text: chunk.toString("utf8") }));
    void child.exited.then((exit) => {
      if (!this.closed) void this.failTransport(`Claude process ended (${exit.code ?? exit.signal ?? "unknown"})`, true);
    }).catch((error: unknown) => this.failTransport(error instanceof Error ? error.message : String(error)));
    await this.control({ subtype: "initialize", hooks: null });
  }

  private read(chunk: string): void {
    if (!this.acceptFrames) return;
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0 && this.acceptFrames) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(line, "utf8") > MAX_FRAME_BYTES) { void this.failTransport("Claude JSON frame exceeded 16 MiB"); return; }
      if (line.trim()) this.parseLine(line);
    }
    if (Buffer.byteLength(this.buffer, "utf8") > MAX_FRAME_BYTES) void this.failTransport("Claude JSON frame exceeded 16 MiB");
  }

  private parseLine(line: string): void {
    let frame: Frame | undefined;
    try { frame = object(JSON.parse(line)); } catch { /* A malformed protocol cannot safely delimit the active turn. */ }
    if (!frame || typeof frame.type !== "string") { void this.failTransport("Claude emitted malformed JSON frame"); return; }
    this.emit("raw", frame);
    if (typeof frame.session_id === "string") this.sessionId = frame.session_id;
    const response = object(frame.response);
    if (frame.type === "control_response" && response) {
      const id = string(response.request_id);
      const pending = id ? this.controls.get(id) : undefined;
      if (pending && id) {
        clearTimeout(pending.timer);
        this.controls.delete(id);
        if (response.subtype === "error") pending.reject(new Error(string(response.error) ?? "Claude control request failed"));
        else pending.resolve(response);
      }
      return;
    }
    if (frame.type === "control_cancel_request") {
      const id = string(frame.request_id);
      if (id) this.approvals.delete(id);
      return;
    }
    if (frame.type === "control_request") {
      const id = string(frame.request_id);
      if (id && object(frame.request)?.subtype === "can_use_tool" && this.current && !this.current.stopped) {
        this.approvals.add(id);
        this.emit("approval", frame);
      }
      return;
    }
    const turn = this.current;
    if (frame.type === "result") { this.result(frame); return; }
    if (!turn) return;
    if (frame.type === "rate_limit_event") {
      const info = object(frame.rate_limit_info);
      if (info?.status === "rejected") {
        const reset = number(info.resetsAt);
        turn.error = { kind: "rate_limit", message: string(frame.message) ?? "rate_limit_event: rejected", ...(reset === undefined ? {} : { resetAt: new Date(reset * 1000).toISOString() }) };
        this.emit("error", turn.error);
      }
    }
    if (frame.type === "stream_event") {
      const delta = object(object(frame.event)?.delta);
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        turn.text += delta.text;
        turn.partialText = true;
        this.emit("text", delta.text);
      } else if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") this.emit("thinking", delta.thinking);
    }
    if (frame.type === "assistant") {
      const message = object(frame.message);
      const text = textContent(frame);
      if (frame.parent_tool_use_id === null) {
        const usage = object(message?.usage);
        if (usage && number(usage.input_tokens) !== undefined) {
          turn.contextTokens = number(usage.input_tokens)! + (number(usage.cache_read_input_tokens) ?? 0) + (number(usage.cache_creation_input_tokens) ?? 0);
          this.emit("usage", { scope: "main", contextTokens: turn.contextTokens, raw: usage });
        }
        if (message?.stop_reason === "refusal") turn.refusal = true;
        if (text && !turn.partialText) { turn.text += text; this.emit("text", text); }
        if (frame.error) { turn.error = claudeNativeError(frame, text); this.emit("error", turn.error); }
      } else if (message?.usage) this.emit("usage", { scope: "auxiliary", raw: message.usage });
      if (Array.isArray(message?.content)) for (const part of message.content) {
        const block = object(part);
        if (block?.type === "tool_use") this.emit("tool_call", block);
      }
    }
    if (frame.type === "user") {
      const content = object(frame.message)?.content;
      if (Array.isArray(content)) for (const part of content) if (object(part)?.type === "tool_result") this.emit("tool_result", part);
    }
    if (frame.type === "model_refusal_no_fallback") turn.refusal = true;
  }

  private result(frame: Frame): void {
    const cumulative = number(frame.total_cost_usd);
    const previous = this.cumulativeCost;
    if (cumulative !== undefined) this.cumulativeCost = cumulative;
    const nativeUsage = object(frame.usage);
    const usage: TurnUsage | undefined = nativeUsage || cumulative !== undefined ? {
      inputTokens: number(nativeUsage?.input_tokens), cachedInputTokens: number(nativeUsage?.cache_read_input_tokens), outputTokens: number(nativeUsage?.output_tokens),
      costUsd: cumulative === undefined ? undefined : cumulative >= (previous ?? 0) ? cumulative - (previous ?? 0) : undefined,
      ...(cumulative === undefined ? {} : { costSource: "native_cli_estimate" as const }),
      raw: { ...nativeUsage, ...(frame.modelUsage === undefined ? {} : { modelUsage: frame.modelUsage }), ...(cumulative === undefined ? {} : { total_cost_usd: cumulative }) },
    } : undefined;
    if (usage) this.emit("usage", { scope: "turn", ...usage });
    const turn = this.current;
    // Notification results belong to native background activity, never an unrelated new send.
    if (!turn || object(frame.origin)?.kind === "task-notification" || typeof frame.user_message_uuid === "string" && frame.user_message_uuid !== turn.id) return;
    const errors = Array.isArray(frame.errors) ? frame.errors.filter((value): value is string => typeof value === "string") : [];
    const failed = frame.is_error === true || string(frame.subtype)?.startsWith("error_") === true;
    const interrupted = frame.terminal_reason === "aborted_streaming" || frame.terminal_reason === "aborted_tools" || frame.stop_reason === "interrupted" || turn.stopped && frame.terminal_reason !== "completed" && frame.stop_reason !== "end_turn";
    const text = string(frame.result) ?? (errors.length ? errors.join("\n") : turn.text);
    const error = failed && !interrupted ? claudeNativeError(frame, errors.length ? errors.join("\n") : text) : undefined;
    // Some error results expose only the generic terminal code; keep an earlier typed API error.
    const nativeError = error?.kind === "other" && turn.error ? { ...turn.error, message: error.message || turn.error.message } : error;
    const result: TurnResult = { status: interrupted ? "interrupted" : failed ? "failed" : "completed", text, refusal: !failed && (turn.refusal || frame.stop_reason === "refusal"), sessionId: this.sessionId, contextTokens: turn.contextTokens, usage, ...(nativeError ? { error: nativeError } : {}) };
    // A root-exit notification can outrun stdout on a separate transport. Drain native output
    // while containment closes, then decide whether this turn had already completed.
    if (this.closed) { if (this.drainTerminal) this.closingResult = result; }
    else this.finish(result);
  }

  private finish(result: TurnResult): void {
    const turn = this.current;
    if (!turn) return;
    this.current = undefined;
    clearTimeout(this.stopTimer);
    this.stopTimer = undefined;
    this.approvals.clear();
    this.emit("turn_end", result);
    turn.resolve(result);
  }

  send(text: string): Promise<TurnResult> {
    if (this.current) return Promise.reject(new Error("Claude already has a running turn"));
    if (this.closed) return Promise.resolve({ status: "interrupted", text: "", refusal: false, sessionId: this.sessionId, error: this.reason });
    return new Promise((resolve) => {
      const id = randomUUID();
      this.current = { id, resolve, text: "", refusal: false, partialText: false, stopped: false };
      void this.ready.then(async () => {
        if (!this.current || this.current.id !== id || this.closed) return;
        await this.write({ type: "user", uuid: id, session_id: this.sessionId ?? "", message: { role: "user", content: text }, parent_tool_use_id: null });
      }).catch((error: unknown) => this.failTransport(error instanceof Error ? error.message : String(error)));
    });
  }

  private async write(frame: Frame): Promise<void> {
    if (this.closed) throw new Error(this.reason.message);
    const child = await this.process;
    await new Promise<void>((resolve, reject) => child.stdin.write(`${JSON.stringify(frame)}\n`, (error) => error ? reject(error) : resolve()));
  }

  private control(request: Frame): Promise<Frame> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.controls.delete(id); reject(new Error(`Claude ${request.subtype} control request timed out`)); }, 30_000);
      timer.unref();
      this.controls.set(id, { resolve, reject, timer });
      void this.write({ type: "control_request", request_id: id, request }).catch((error: unknown) => {
        clearTimeout(timer); this.controls.delete(id); reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  async interrupt(): Promise<void> {
    await this.ready;
    const turn = this.current;
    if (!turn || this.closed || turn.stopped) return;
    turn.stopped = true;
    // The native interrupt cancels its requests; dropping local ids prevents stale owner answers.
    this.approvals.clear();
    this.stopTimer = setTimeout(() => { void this.failTransport("Claude did not end the turn within 30 seconds of stop"); }, this.options.interruptTimeoutMs ?? 30_000);
    this.stopTimer.unref();
    await this.write({ type: "control_request", request_id: randomUUID(), request: { subtype: "interrupt" } });
  }

  async respondApproval(requestId: string, response: unknown): Promise<void> {
    if (!this.current || this.current.stopped || !this.approvals.has(requestId) || this.closed) throw new Error("Claude approval request is no longer open");
    const answer = object(response);
    if (!answer || answer.behavior !== "allow" && answer.behavior !== "deny") throw new Error("Claude approval response must use its native allow or deny behavior");
    this.approvals.delete(requestId);
    await this.write({ type: "control_response", response: { subtype: "success", request_id: requestId, response: answer } });
  }

  private async failTransport(message: string, drainTerminal = false): Promise<void> {
    if (this.closed) return;
    this.reason = { kind: "transport", message };
    this.drainTerminal = drainTerminal;
    this.emit("error", this.reason);
    await this.close();
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    clearTimeout(this.stopTimer);
    this.approvals.clear();
    for (const pending of this.controls.values()) { clearTimeout(pending.timer); pending.reject(new Error(this.reason.message)); }
    this.controls.clear();
    this.closePromise = (async () => {
      const child = await this.process.catch(() => undefined);
      let containmentStopped = true;
      try {
        if (child) { child.stdin.end(); await child.close(); }
      } catch (error) {
        containmentStopped = false;
        this.reason = { kind: "transport", message: `Claude process containment failed: ${error instanceof Error ? error.message : String(error)}` };
        this.emit("error", this.reason);
      }
      this.acceptFrames = false;
      if (this.instructionDirectory) {
        try { await rm(this.instructionDirectory, { recursive: true, force: true }); }
        catch (error) { this.emit("error", { kind: "other", message: `Claude instruction-file cleanup failed: ${error instanceof Error ? error.message : String(error)}` }); }
      }
      // A failed containment check must unblock callers without claiming cleanup succeeded.
      // The post office keeps such a channel down and never automatically resumes its queue.
      this.finish(containmentStopped && this.closingResult ? this.closingResult : { status: "interrupted", text: this.current?.text ?? "", refusal: false, sessionId: this.sessionId, contextTokens: this.current?.contextTokens, error: this.reason });
      this.emit("closed", { sessionId: this.sessionId, reason: this.reason, containmentStopped });
    })();
    return this.closePromise;
  }
}
