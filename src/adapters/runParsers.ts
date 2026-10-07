import type { RunResult } from "./Adapter.js";
import { extractJson } from "./exec.js";

type Obj = Record<string, unknown>;

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const firstKey = (v: unknown): string | undefined =>
  v && typeof v === "object" ? Object.keys(v as Obj)[0] : undefined;

function failure(message: string): RunResult {
  return { text: "", isError: true, errorMessage: message };
}

/** `claude -p --output-format json`: one object with result, is_error, usage, total_cost_usd. */
export function parseClaudeRun(stdout: string): RunResult {
  let o: Obj;
  try {
    o = extractJson(stdout) as Obj;
  } catch (e) {
    return failure(`unreadable claude output: ${(e as Error).message}`);
  }
  const u = (o.usage ?? {}) as Obj;
  const input =
    (num(u.input_tokens) ?? 0) +
    (num(u.cache_read_input_tokens) ?? 0) +
    (num(u.cache_creation_input_tokens) ?? 0);
  const isError = o.is_error === true || (str(o.subtype) !== undefined && o.subtype !== "success");
  return {
    text: str(o.result) ?? "",
    isError,
    errorMessage: isError ? (str(o.result) ?? str(o.subtype) ?? "claude reported an error") : undefined,
    usage: { inputTokens: input || undefined, outputTokens: num(u.output_tokens) },
    costUsd: num(o.total_cost_usd),
    sessionId: str(o.session_id),
    resolvedModel: firstKey(o.modelUsage),
  };
}

/**
 * `codex exec --json`: JSONL events. The answer is the last agent_message item; usage comes from
 * turn.completed; failures arrive as `error` or `turn.failed` events.
 */
export function parseCodexRun(stdout: string): RunResult {
  let text = "";
  let usage: RunResult["usage"];
  let sessionId: string | undefined;
  let errorMessage: string | undefined;

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    let e: Obj;
    try {
      e = JSON.parse(line) as Obj;
    } catch {
      continue;
    }
    const type = str(e.type);
    if (type === "thread.started") sessionId = str(e.thread_id);
    else if (type === "item.completed") {
      const item = (e.item ?? {}) as Obj;
      if (item.type === "agent_message" && str(item.text) !== undefined) text = item.text as string;
    } else if (type === "turn.completed") {
      const u = (e.usage ?? {}) as Obj;
      usage = { inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens) };
    } else if (type === "turn.failed") {
      errorMessage = str(((e.error ?? {}) as Obj).message) ?? "codex turn failed";
    } else if (type === "error") {
      errorMessage = str(e.message) ?? "codex error";
    }
  }

  if (errorMessage) return { text, isError: true, errorMessage, usage, sessionId };
  if (!text) return { ...failure("codex produced no answer"), usage, sessionId };
  return { text, isError: false, usage, sessionId };
}

/** `grok -p --output-format json`: one object with text, stopReason, usage, total_cost_usd. */
export function parseGrokRun(stdout: string): RunResult {
  let o: Obj;
  try {
    o = extractJson(stdout) as Obj;
  } catch (e) {
    return failure(`unreadable grok output: ${(e as Error).message}`);
  }
  const u = (o.usage ?? {}) as Obj;
  // Grok's input_tokens is the uncached input only; the cache fields hold the rest.
  const input =
    (num(u.input_tokens) ?? 0) +
    (num(u.cache_read_input_tokens) ?? 0) +
    (num(u.cache_creation_input_tokens) ?? 0);
  const text = str(o.text) ?? "";
  const stop = str(o.stopReason);
  const isError = !text && stop !== undefined && stop !== "end_turn";
  return {
    text,
    isError,
    errorMessage: isError ? `grok stopped: ${stop}` : undefined,
    usage: { inputTokens: input || undefined, outputTokens: num(u.output_tokens) },
    costUsd: num(o.total_cost_usd),
    sessionId: str(o.sessionId),
    resolvedModel: firstKey(o.modelUsage),
  };
}

const clip = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** agy's own reason for an error: the first present of `error`, `error.message`, `message`, `response`. */
function agyReason(o: Obj): string | undefined {
  const err = o.error;
  const candidates = [
    str(err),
    err && typeof err === "object" ? str((err as Obj).message) : undefined,
    str(o.message),
    str(o.response),
  ];
  for (const c of candidates) {
    const reason = clip(c ?? "", 300);
    if (reason) return reason;
  }
  return undefined;
}

/**
 * `agy -p --output-format json`: one object with status, response, usage. A status other than SUCCESS
 * is an error whose message carries agy's own reason when the JSON has one, else the last non-empty
 * line of `stderr` (the adapter passes it in), else just the status.
 */
export function parseAgyRun(stdout: string, stderr = ""): RunResult {
  let o: Obj;
  try {
    o = extractJson(stdout) as Obj;
  } catch (e) {
    return failure(`unreadable agy output: ${(e as Error).message}`);
  }
  const u = (o.usage ?? {}) as Obj;
  // agy's input_tokens leaves out the cached input, which it reports as cache_read_tokens.
  const input = (num(u.input_tokens) ?? 0) + (num(u.cache_read_tokens) ?? 0);
  const status = str(o.status);
  const isError = status !== undefined && status !== "SUCCESS";
  const stderrTail = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-1)[0];
  const reason = isError ? (agyReason(o) ?? (stderrTail ? clip(stderrTail, 300) : undefined)) : undefined;
  return {
    text: str(o.response) ?? "",
    isError,
    errorMessage: isError ? `agy status ${status}${reason ? `: ${reason}` : ""}` : undefined,
    usage: { inputTokens: input || undefined, outputTokens: num(u.output_tokens) },
    sessionId: str(o.conversation_id),
  };
}
