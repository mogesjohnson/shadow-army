import { randomUUID } from "node:crypto";
import { access, constants, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { ChannelEvent, ChannelOptions, NativeChannel, NativeError, RetryNotice, TurnResult, TurnUsage } from "./channel.js";
import { redact } from "./logs.js";
import { spawnManagedProcess, type ManagedProcess } from "./processTree.js";

type Frame = Record<string, unknown>;
const object = (value: unknown): Frame | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Frame : undefined;
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
const string = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
const MAX_FRAME_BYTES = 16 * 1024 * 1024;
/** CH-1: one unparseable line is an error and the session carries on; this many in a row is a lost connection. */
export const MAX_BAD_LINES_IN_A_ROW = 10;
const BAD_LINE_EXCERPT = 200;
/** CH-2: the oldest claude a soldier runs on. */
export const OLDEST_CLAUDE = "2.1.277";
/** Spec "Versions": a `--version` run ends after 10 s, with every process it started. */
export const VERSION_TIMEOUT_MS = 10_000;
/** How long the exit handler waits for stderr to finish, so a refusal's words are read. */
const STDERR_DRAIN_MS = 500;

export interface ClaudeChannelOptions extends ChannelOptions {
  /** Test seam for the 10 s `--version` bound. */
  versionTimeoutMs?: number;
  /** The environment the launch target is resolved from (default: the post office's own). */
  env?: NodeJS.ProcessEnv;
}

/** CH-1: the one validated target both the `--version` probe and the session start. */
export interface ClaudeLaunch { file: string; args: string[]; env: NodeJS.ProcessEnv; dropped: string[] }

const foldCase = process.platform === "win32" || process.platform === "darwin";
const inside = (child: string, parent: string): boolean => {
  const rel = relative(foldCase ? parent.toLowerCase() : parent, foldCase ? child.toLowerCase() : child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
const isFile = async (path: string): Promise<boolean> => {
  try { if (!(await stat(path)).isFile()) return false; if (process.platform !== "win32") await access(path, constants.X_OK); return true; }
  catch { return false; }
};

/**
 * CH-1: resolve claude once. The post office's `PATH` loses every relative, empty or unresolvable
 * entry and every entry in the soldier's folder, compared by real path; `claude` is looked up in what
 * is left (on Windows with each `PATHEXT` extension in order, never with none, never in the current
 * folder), and the session gets that cleaned `PATH`. A configured command must be absolute.
 * Returns the refusal line when no trusted claude is found.
 */
export async function resolveClaudeLaunch(command: { file: string; args?: string[] } | undefined, cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<ClaudeLaunch | string> {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const folder = await realpath(cwd).catch(() => cwd);
  const kept: string[] = []; const dropped: string[] = [];
  for (const entry of (env[pathKey] ?? "").split(delimiter)) {
    const real = entry && isAbsolute(entry) ? await realpath(entry).catch(() => undefined) : undefined;
    if (real && !inside(real, folder)) kept.push(entry); else dropped.push(entry);
  }
  const launchEnv: NodeJS.ProcessEnv = { ...env, [pathKey]: kept.join(delimiter) };
  if (process.platform === "win32") launchEnv.NoDefaultCurrentDirectoryInExePath = "1";
  if (command) {
    if (!isAbsolute(command.file)) return `claude command ${command.file} is not an absolute path`;
    return { file: command.file, args: command.args ?? [], env: launchEnv, dropped };
  }
  const extensions = process.platform === "win32" ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  for (const entry of kept) for (const extension of extensions) {
    const candidate = join(entry, `claude${extension}`);
    if (await isFile(candidate)) return { file: candidate, args: [], env: launchEnv, dropped };
  }
  return "claude was not found on PATH outside the soldier's folder; install claude";
}

const versionParts = (text: string): number[] | undefined => /(\d+)\.(\d+)\.(\d+)/.exec(text)?.slice(1).map(Number);
const isOlder = (found: number[], oldest: number[]): boolean => {
  for (let i = 0; i < 3; i++) if (found[i] !== oldest[i]) return found[i] < oldest[i];
  return false;
};

/**
 * CH-2: read `claude --version` before a session opens. Returns the line for the soldier's log and
 * Claude's transcript when claude is too old, gave no answer in time, or could not be run. Such a
 * start is not a crash (PO-1), so the caller reports it with kind "other". Rejects, with
 * `containmentFailed`, when the probe's processes cannot be confirmed stopped.
 */
export async function claudeVersionProblem(command: { file: string; args?: string[]; env?: NodeJS.ProcessEnv }, cwd: string, timeoutMs = VERSION_TIMEOUT_MS): Promise<string | undefined> {
  let child: ManagedProcess;
  try { child = await spawnManagedProcess({ file: command.file, args: [...(command.args ?? []), "--version"], cwd, env: command.env }); }
  catch (error) { return `claude --version could not run: ${error instanceof Error ? error.message : String(error)}`; }
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  child.stdin.on("error", () => {});
  child.stdin.end();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = Symbol("timeout");
  const outcome = await Promise.race([
    child.exited.then(() => "exited" as const, () => "exited" as const),
    new Promise<typeof timedOut>((resolve) => { timer = setTimeout(() => resolve(timedOut), timeoutMs); }),
  ]);
  clearTimeout(timer);
  if (outcome === "exited") await new Promise((resolve) => setTimeout(resolve, 20)); // let stdout's last chunk land
  // Fail closed: no session opens until the probe's processes are confirmed stopped.
  try { await child.close(); }
  catch (error) { throw Object.assign(new Error(`claude --version probe containment failed: ${error instanceof Error ? error.message : String(error)}`), { containmentFailed: true }); }
  if (outcome === timedOut) return `claude --version gave no answer in ${timeoutMs / 1000} s`;
  const found = versionParts(output);
  if (!found) return `claude --version gave an answer that is not a version: ${output.trim().slice(0, 80) || "(nothing)"}`;
  if (isOlder(found, versionParts(OLDEST_CLAUDE)!)) return `claude ${found.join(".")} is older than ${OLDEST_CLAUDE}; update claude`;
  return undefined;
}

/** CH-2: the permission mode each autonomy level passes. */
const permissionModeFor = (autonomy: ChannelOptions["autonomy"]): string => autonomy === "full" ? "bypassPermissions" : autonomy === "auto" ? "auto" : "plan";

/** A start the CLI refused because managed settings forbid a flag (PO-1). `--mcp-config` under disableSideloadFlags is PO-4's, never this. */
const MANAGED_REFUSAL = /managed settings|disableBypassPermissionsMode|disabled by your organization/i;
const SIDELOAD_REFUSAL = /disableSideloadFlags|--mcp-config/i;

interface PendingTurn {
  id: string;
  resolve: (result: TurnResult) => void;
  text: string;
  contextTokens?: number;
  error?: NativeError;
  refusal: boolean;
  model?: string;
  partialText: boolean;
  stopped: boolean;
  usageSteps: Map<string, { assistant?: Frame; stream?: Frame; outputTokens?: number }>;
  streamMessageId?: string;
}

/** Native Claude flags only: preserve its prompt, tools, permissions and session persistence. */
export function claudeChannelArgs(options: ChannelOptions, instructionPath?: string): string[] {
  const permission = permissionModeFor(options.autonomy);
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
  private badLines = 0;
  private closingResult?: TurnResult;
  private reason: NativeError = { kind: "transport", message: "Claude channel closed" };
  private stopTimer?: NodeJS.Timeout;
  private instructionDirectory?: string;
  private model?: string;
  private sawFrame = false;
  private stderrText = "";
  private stderrDone: Promise<void> = Promise.resolve();
  private loginNeeded?: NativeError;
  /** PO-1: an old, silent or managed-refused claude. The closed event says so, and it is never restarted. */
  private refusedStart = false;
  private probeContainmentFailed = false;

  constructor(private readonly options: ClaudeChannelOptions) {
    this.process = this.spawn();
    this.ready = this.open();
    // Spawn/initialization errors must remain observed even if the owner closes before sending.
    void this.ready.catch((error: unknown) => {
      const flags = error as { refusedStart?: boolean; containmentFailed?: boolean } | undefined;
      if (flags?.refusedStart) this.refusedStart = true;
      if (flags?.containmentFailed) this.probeContainmentFailed = true;
      return this.failTransport(error instanceof Error ? error.message : String(error), false, flags?.refusedStart ? "other" : "transport");
    });
  }

  private async spawn(): Promise<ManagedProcess> {
    // CH-1: one validated target for the probe and the session. No trusted claude is a refused start.
    const command = await resolveClaudeLaunch(this.options.command, this.options.cwd, this.options.env);
    if (typeof command === "string") throw Object.assign(new Error(command), { refusedStart: true });
    if (command.dropped.length) this.emit("raw", { type: "path", dropped: command.dropped });
    // CH-2: an old or silent claude opens no session. This is a refused start, not a crash.
    const problem = await claudeVersionProblem(command, this.options.cwd, this.options.versionTimeoutMs);
    if (problem) throw Object.assign(new Error(problem), { refusedStart: true });
    let instructionPath: string | undefined;
    // npm's Windows .cmd shim cannot preserve multiline argv. The vendor's append-file flag
    // preserves the same standing text and default prompt. Credentials never enter these options.
    if (process.platform === "win32" && /[\r\n]/.test(this.options.instructions)) {
      this.instructionDirectory = await mkdtemp(join(tmpdir(), "shadow-claude-instructions-"));
      instructionPath = join(this.instructionDirectory, "instructions.txt");
      await writeFile(instructionPath, this.options.instructions, { encoding: "utf8", mode: 0o600 });
    }
    return spawnManagedProcess({ file: command.file, args: [...command.args, ...claudeChannelArgs(this.options, instructionPath)], cwd: this.options.cwd, env: command.env });
  }

  private emit(type: ChannelEvent["type"], data: unknown): void {
    this.options.onEvent({ type, data });
  }

  /** The process or its output ended. Wait briefly for stderr, so a refusal's words are read before the reason is fixed. */
  private async ended(message: string): Promise<void> {
    if (this.closed) return;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([this.stderrDone, new Promise((resolve) => { timer = setTimeout(resolve, STDERR_DRAIN_MS); })]);
    clearTimeout(timer);
    await this.failTransport(message, true);
  }

  private async open(): Promise<void> {
    const child = await this.process;
    if (this.closed) return;
    this.stderrDone = new Promise((resolve) => { child.stderr.once("end", () => resolve()); child.stderr.once("close", () => resolve()); });
    child.stdout.on("data", (chunk: Buffer) => this.read(this.decoder.write(chunk)));
    child.stdout.on("end", () => {
      this.read(this.decoder.end());
      if (this.buffer.trim()) this.parseLine(this.buffer);
      this.buffer = "";
      void this.ended("Claude output stream ended");
    });
    child.stdout.on("error", (error: Error) => { void this.failTransport(error.message); });
    child.stdin.on("error", (error: Error) => { void this.failTransport(error.message); });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (this.stderrText.length < 8192) this.stderrText += text;
      this.emit("raw", { type: "stderr", text });
    });
    void child.exited.then((exit) => this.ended(`Claude process ended (${exit.code ?? exit.signal ?? "unknown"})`)).catch((error: unknown) => this.failTransport(error instanceof Error ? error.message : String(error)));
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
    if (!frame || typeof frame.type !== "string") {
      this.badLines++;
      const excerpt = line.length > BAD_LINE_EXCERPT ? `${line.slice(0, BAD_LINE_EXCERPT)}...` : line;
      const message = `Claude emitted an unparseable line: ${String(redact(excerpt))}`;
      this.emit("raw", { type: "unparseable_line", text: String(redact(excerpt)) });
      if (this.badLines >= MAX_BAD_LINES_IN_A_ROW) void this.failTransport(`Claude connection lost: ${MAX_BAD_LINES_IN_A_ROW} unparseable lines in a row`);
      else this.emit("error", { kind: "other", message } satisfies NativeError);
      return;
    }
    this.badLines = 0;
    this.sawFrame = true;
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
    if (frame.type === "system" && frame.subtype === "init") { this.init(frame); return; }
    if (frame.type === "system" && frame.subtype === "api_retry") {
      // CH-2: the CLI is backing off. A notice, not an error; the turn goes on.
      this.emit("retry", { attempt: number(frame.attempt), maxRetries: number(frame.max_retries), retryDelayMs: number(frame.retry_delay_ms), errorStatus: frame.error_status, error: frame.error } satisfies RetryNotice);
      return;
    }
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
      const event = object(frame.event);
      // S6 on Claude 2.1.296: interrupt results zero every usage field. Keep only this
      // turn's main-loop provider events; auxiliary usage remains a separate scope.
      if (frame.parent_tool_use_id === null) {
        if (event?.type === "message_start") {
          const message = object(event.message);
          turn.streamMessageId = string(message?.id);
          this.recordUsage(turn, turn.streamMessageId, object(message?.usage), "stream");
        } else if (event?.type === "message_delta") {
          const usage = object(event.usage);
          this.recordUsage(turn, turn.streamMessageId, usage, "stream");
          const step = turn.streamMessageId ? turn.usageSteps.get(turn.streamMessageId) : undefined;
          // message_delta output is cumulative for one API response, never an increment.
          if (step && number(usage?.output_tokens) !== undefined) step.outputTokens = number(usage!.output_tokens);
        } else if (event?.type === "message_stop") turn.streamMessageId = undefined;
      }
      const delta = object(event?.delta);
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
        this.noteModel(turn, string(message?.model));
        const usage = object(message?.usage);
        this.recordUsage(turn, string(message?.id), usage, "assistant");
        if (usage && number(usage.input_tokens) !== undefined) {
          turn.contextTokens = number(usage.input_tokens)! + (number(usage.cache_read_input_tokens) ?? 0) + (number(usage.cache_creation_input_tokens) ?? 0);
          this.emit("usage", { scope: "main", contextTokens: turn.contextTokens, raw: usage });
        }
        if (message?.stop_reason === "refusal") turn.refusal = true;
        if (text && !turn.partialText) { turn.text += text; this.emit("text", text); }
        if (frame.error) {
          turn.error = claudeNativeError(frame, text);
          if (turn.error.kind === "login_needed") this.loginNeeded = turn.error;
          this.emit("error", turn.error);
        }
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

  /** CH-2: system/init names the model in use, and the mode claude actually runs in (M1-AC5). */
  private init(frame: Frame): void {
    this.noteModel(this.current, string(frame.model));
    const mode = string(frame.permissionMode) ?? string(frame.permission_mode);
    const expected = permissionModeFor(this.options.autonomy);
    if (mode !== undefined && mode !== expected) {
      this.emit("error", { kind: "other", message: `Claude runs in permission mode ${mode}, but Shadow Army passed ${expected} for autonomy ${this.options.autonomy ?? "supervised"}` } satisfies NativeError);
    }
  }

  /** CH-2: the model in use is claude's own report. A change it makes by itself is logged, and the turn's usage names the new model. */
  private noteModel(turn: PendingTurn | undefined, model: string | undefined): void {
    if (!model) return;
    if (this.model !== undefined && model !== this.model) this.emit("raw", { type: "model_changed", from: this.model, to: model });
    this.model = model;
    if (turn) turn.model = model;
  }

  private recordUsage(turn: PendingTurn, id: string | undefined, usage: Frame | undefined, source: "assistant" | "stream"): void {
    if (!id || !usage) return;
    const step = turn.usageSteps.get(id) ?? {};
    step[source] = { ...step[source], ...usage };
    turn.usageSteps.set(id, step);
    if (source === "stream" && number(usage.input_tokens) !== undefined) {
      turn.contextTokens = number(usage.input_tokens)! + (number(usage.cache_read_input_tokens) ?? 0) + (number(usage.cache_creation_input_tokens) ?? 0);
      this.emit("usage", { scope: "main", contextTokens: turn.contextTokens, raw: usage });
    }
  }

  private eventUsage(turn: PendingTurn | undefined, terminal?: Frame): TurnUsage | undefined {
    if (!turn?.usageSteps.size) return undefined;
    const steps = [...turn.usageSteps.entries()];
    const sum = (field: string): number | undefined => {
      const values = steps.map(([, step]) => number(step.assistant?.[field]) ?? number(step.stream?.[field]));
      return values.every((value) => value !== undefined) ? values.reduce<number>((total, value) => total + value!, 0) : undefined;
    };
    const outputs = steps.map(([, step]) => step.outputTokens);
    return {
      inputTokens: sum("input_tokens"), cachedInputTokens: sum("cache_read_input_tokens"),
      // Assistant output_tokens is a placeholder. If any response lacks a message_delta,
      // the output total stays unknown rather than substituting that placeholder.
      outputTokens: outputs.every((value) => value !== undefined) ? outputs.reduce<number>((total, value) => total + value!, 0) : undefined,
      raw: { source: "assistant_and_stream", mainMessages: steps.map(([messageId, step]) => ({ messageId, ...step })), ...(terminal ? { terminal } : {}) },
    };
  }

  private result(frame: Frame): void {
    const turn = this.current;
    // A notification or stale result cannot change another turn's usage/cost boundary.
    // CH-2: a result ends a message's turn only when it names that message. Any other result is recorded and ends nothing.
    // Either field may name it; a result that names no message ends nothing.
    const named = [...(Array.isArray(frame.user_message_uuids) ? frame.user_message_uuids : []), ...(typeof frame.user_message_uuid === "string" ? [frame.user_message_uuid] : [])];
    if (!turn || object(frame.origin)?.kind === "task-notification" || !named.includes(turn.id)) {
      this.emit("raw", { type: "result_ignored", user_message_uuid: frame.user_message_uuid, origin: frame.origin });
      return;
    }
    const errors = Array.isArray(frame.errors) ? frame.errors.filter((value): value is string => typeof value === "string") : [];
    const text = string(frame.result) ?? (errors.length ? errors.join("\n") : turn.text);
    const failed = frame.is_error === true || string(frame.subtype)?.startsWith("error_") === true;
    const nativeInterrupted = frame.terminal_reason === "aborted_streaming" || frame.terminal_reason === "aborted_tools" || frame.stop_reason === "interrupted";
    const terminalError = failed ? claudeNativeError(frame, errors.length ? errors.join("\n") : text) : undefined;
    const knownFailure = turn.error !== undefined || terminalError !== undefined && terminalError.kind !== "other";
    const failure = failed || nativeInterrupted && knownFailure;
    const completed = !failed && !nativeInterrupted && (frame.subtype === "success" || frame.terminal_reason === "completed" || frame.stop_reason === "end_turn");
    // A known API failure preceding stop keeps its type. The generic execution result
    // following a requested interrupt is the stop acknowledgement, not a new error kind.
    const interrupted = !completed && !knownFailure && (nativeInterrupted || turn.stopped && frame.subtype === "error_during_execution");
    const cumulative = number(frame.total_cost_usd);
    const previous = this.cumulativeCost;
    const nativeUsage = object(frame.usage);
    const zeroExecutionResult = frame.subtype === "error_during_execution" && nativeUsage && ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].every((key) => number(nativeUsage[key]) === 0);
    const recoverUsage = interrupted || nativeInterrupted || zeroExecutionResult;
    const unusableCost = recoverUsage && (cumulative === undefined || cumulative === 0 || cumulative < (previous ?? 0));
    const costGap = this.missingCostBoundary;
    if (unusableCost) this.missingCostBoundary = true;
    else if (cumulative !== undefined) { this.cumulativeCost = cumulative; this.missingCostBoundary = false; }
    const terminal = { ...nativeUsage, ...(frame.modelUsage === undefined ? {} : { modelUsage: frame.modelUsage }), ...(cumulative === undefined ? {} : { total_cost_usd: cumulative }) };
    const costUsage = cumulative === undefined || unusableCost ? undefined : {
      costUsd: cumulative === undefined || costGap ? undefined : cumulative >= (previous ?? 0) ? cumulative - (previous ?? 0) : undefined,
      costSource: "native_cli_estimate" as const,
    };
    let usage: TurnUsage | undefined;
    if (recoverUsage) {
      const observed = this.eventUsage(turn, terminal);
      // The native dollar estimate is distinct from the interrupted result's unusable
      // token counters. Retain it only when its cumulative boundary is actually usable.
      if (observed || costUsage) usage = { ...observed, ...costUsage, raw: observed?.raw ?? { source: "assistant_and_stream", terminal } };
    } else if (nativeUsage || cumulative !== undefined) usage = {
      inputTokens: number(nativeUsage?.input_tokens), cachedInputTokens: number(nativeUsage?.cache_read_input_tokens), outputTokens: number(nativeUsage?.output_tokens), ...costUsage, raw: terminal,
    };
    if (usage && turn.model) usage = { ...usage, raw: { ...usage.raw, model: turn.model } };
    if (usage) this.emit("usage", { scope: "turn", ...usage });
    const error = failure && !interrupted ? terminalError ?? claudeNativeError(frame, errors.length ? errors.join("\n") : text) : undefined;
    // Some error results expose only the generic terminal code; keep an earlier typed API error.
    const nativeError = error?.kind === "other" && turn.error ? { ...turn.error, message: turn.error.kind === "other" ? error.message || turn.error.message : turn.error.message } : error;
    if (nativeError?.kind === "login_needed") this.loginNeeded = nativeError;
    const result: TurnResult = { status: interrupted ? "interrupted" : failure ? "failed" : "completed", text, refusal: !failure && (turn.refusal || frame.stop_reason === "refusal"), sessionId: this.sessionId, contextTokens: turn.contextTokens, usage, ...(nativeError ? { error: nativeError } : {}) };
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
      this.current = { id, resolve, text: "", refusal: false, partialText: false, stopped: false, usageSteps: new Map() };
      void this.ready.then(async () => {
        if (!this.current || this.current.id !== id || this.closed) return;
        await this.write({ type: "user", uuid: id, session_id: this.sessionId ?? "", message: { role: "user", content: text }, parent_tool_use_id: null, priority: "later" });
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

  private async failTransport(message: string, drainTerminal = false, kind: NativeError["kind"] = "transport"): Promise<void> {
    if (this.closed) return;
    this.reason = { kind, message };
    if (drainTerminal && !this.sawFrame && MANAGED_REFUSAL.test(this.stderrText) && !SIDELOAD_REFUSAL.test(this.stderrText)) {
      // PO-1: a start managed settings refuse is not a crash and is never restarted.
      this.refusedStart = true;
      this.reason = { kind: "other", message: `claude can't start at ${this.options.autonomy ?? "supervised"}: your organization's managed settings refuse it (${this.stderrText.trim().split(/\r?\n/)[0].slice(0, 200)}) · lower its autonomy` };
    } else if (drainTerminal && this.loginNeeded) {
      // CH-2: a login needed never restarts the channel, even when the CLI exits after it.
      this.reason = { ...this.loginNeeded };
    }
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
      let containmentStopped = !this.probeContainmentFailed;
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
      this.finish(containmentStopped && this.closingResult ? this.closingResult : { status: "interrupted", text: this.current?.text ?? "", refusal: false, sessionId: this.sessionId, contextTokens: this.current?.contextTokens, usage: this.eventUsage(this.current), error: this.reason });
      this.emit("closed", { sessionId: this.sessionId, reason: this.reason, containmentStopped, refusedStart: this.refusedStart });
    })();
    return this.closePromise;
  }
}
