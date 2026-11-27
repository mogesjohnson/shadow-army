import type {
  EngineInterface, HookStream, ProcessSpawnChunk, ProcessSpawnResult, Register, Timer,
} from "claude-code";
import type { TurnResult } from "../../../src/v2/channel.js";

interface Runtime {
  session: string;
  cwd: string;
  /** The canonical repository root the relay reports; the post office keeps `.shadow` there (M1-AC25). */
  root?: string;
  credential: string;
  closing: boolean;
  /** The `session.end` reason the army was released with, kept for a relay that reports ready afterwards. */
  releaseReason?: string;
  ready: Promise<void>;
  accept: () => void;
  reject: (error: Error) => void;
  url?: string;
  stream?: HookStream<ProcessSpawnChunk, ProcessSpawnResult>;
  deadline?: Timer;
  heartbeat?: Timer;
  /** The renewal now waiting for its answer, if any; it stops counting as waiting after 5 s (HOST-2). */
  renewing?: symbol;
  diagnostic: string;
  finished?: Promise<void>;
}

// These values stay in this module's private environment. $.store writes a file,
// and $.state is readable by other plugins; neither may hold the Monarch secret.
let active: Runtime | undefined;
const retiring = new Set<Runtime>();
/** HOST-2 / M1-AC9: set at `session.start` of a session that is not the owner's interactive one; the mod then does nothing. */
let inert = false;
const RENEW_EVERY_MS = 10_000;
const RENEW_WAIT_MS = 5_000;
/** `session.end` reasons that keep the army running (HOST-2, PO-7). */
const KEEPS_ARMY = new Set(["clear", "resume"]);
/** Counts army-ending `session.end` events; a start begun before one is abandoned rather than published. */
let ends = 0;

function safeText(value: unknown, credential = ""): string {
  let text = String(value);
  if (credential) text = text.replace(new RegExp(credential, "gi"), "[redacted]");
  // Keep errors safe even after a runtime's private credential has been cleared.
  return text.replace(/\b[a-f0-9]{64}\b/gi, "[redacted]")
    .replace(/(Bearer\s+)[^\s"'\\]+/gi, "$1[redacted]");
}

function cancelTimers(runtime: Runtime): void {
  runtime.deadline?.cancel();
  runtime.heartbeat?.cancel();
  runtime.deadline = undefined;
  runtime.heartbeat = undefined;
}

async function post($: EngineInterface, runtime: Runtime, command: Record<string, unknown>): Promise<unknown> {
  if (!runtime.url || !runtime.credential) throw new Error("post office is not connected");
  try {
    const response = await $.http.fetch(`${runtime.url}/command`, {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.credential}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    const body = JSON.parse(response.text) as { result?: unknown; error?: unknown };
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `post office command failed (${response.status})`);
    return body.result;
  } catch (error) {
    throw new Error(safeText(error instanceof Error ? error.message : error, runtime.credential));
  }
}

async function release($: EngineInterface, runtime: Runtime, reason?: string): Promise<void> {
  // Stop renewals before a network wait: session.end shares the native 1.5s
  // deadline, and /clear keeps the Claude process/module alive afterwards.
  runtime.closing = true;
  runtime.releaseReason ??= reason;
  cancelTimers(runtime);
  runtime.reject(new Error("Claude session ended before the post office was ready"));
  retiring.add(runtime);
  if (active === runtime) active = undefined;
  if (runtime.url) await post($, runtime, { action: "release", session: runtime.session, ...(reason ? { reason } : {}) });
  // The relay remains drained while the detached helper finishes cleanup. If
  // native unload kills the relay first, the independent helper's lease expires.
}

function fail($: EngineInterface, runtime: Runtime, error: unknown): void {
  const message = safeText(error, runtime.credential);
  const wasClosing = runtime.closing;
  runtime.closing = true;
  cancelTimers(runtime);
  runtime.reject(new Error(message));
  if (active === runtime) active = undefined;
  if (!wasClosing) uiLog($, `Shadow Army: ${message}`, runtime.credential);
  // The native stream owns only the relay. Returning it cannot skip the
  // detached post office's independent expiry/containment/finalization path.
  if (runtime.stream) void runtime.stream.return({ code: null, signal: null }).catch(() => {});
}

/** One renewal. The army's id stays the army's after `/clear`, `/resume` or `/branch` gives Claude another, so it is never compared with `$.session.id()`. A failed renewal stops nothing: the next goes at its time. */
function renew($: EngineInterface, runtime: Runtime): void {
  if (runtime.closing || runtime.renewing) return;
  const mine = Symbol("renewal");
  runtime.renewing = mine;
  const waiting = $.clock.after(RENEW_WAIT_MS, () => { if (runtime.renewing === mine) runtime.renewing = undefined; });
  void post($, runtime, { action: "renew", session: runtime.session }).catch(() => {}).finally(() => {
    waiting.cancel();
    if (runtime.renewing === mine) runtime.renewing = undefined;
  });
}

function event($: EngineInterface, runtime: Runtime, line: string): void {
  const value = JSON.parse(line) as { type?: string; soldier?: string; data?: Record<string, unknown>; url?: string };
  if (!value || typeof value !== "object" || typeof value.type !== "string") throw new Error("invalid post office event");
  if (value.type === "ready") {
    if (runtime.url) throw new Error("post office sent ready more than once");
    const url = value.data?.url ?? value.url;
    if (typeof url !== "string" || !/^http:\/\/(?:127\.0\.0\.1|\[::1\]):\d+$/.test(url)) throw new Error("invalid post office loopback endpoint");
    const root = value.data?.root;
    if (typeof root !== "string" || !root) throw new Error("post office sent no repository root");
    runtime.url = url;
    runtime.root = root;
    runtime.deadline?.cancel();
    runtime.deadline = undefined;
    if (runtime.closing) {
      // An end event may beat relay startup. Release a late ready helper too.
      void post($, runtime, { action: "release", session: runtime.session, ...(runtime.releaseReason ? { reason: runtime.releaseReason } : {}) }).catch(() => {});
      return;
    }
    runtime.heartbeat = $.clock.every(RENEW_EVERY_MS, () => renew($, runtime));
    runtime.accept();
    return;
  }
  // PO-5: a gap in a log gets one line in Claude's transcript, also while the office closes. The post office sends one event a gap.
  if (value.type === "log_failed") {
    // C18: a refused opening write is marked `refused`; the /send refusal already shows it, so a second line would double it.
    if (value.data?.refused === true) return;
    // Only what would break the line becomes a space: \s would also swallow Cc and Cf characters that SEC-6 shows.
    const reason = String(value.data?.reason ?? "unknown error").replace(/[\n\t\u2028\u2029]+/g, " ");
    $.ui.log(safeText(show(`Shadow Army: logs not written · ${reason}`), runtime.credential));
    return;
  }
  // M1 observes the event stream without adding another model turn/context.
  // The richer pane and transcript cards belong to the later mod milestones.
  // A CLI backing off before an API retry shows as a retry, not as an error: its own plain line.
  if (!runtime.closing && value.type === "notice" && typeof value.data?.message === "string") {
    $.ui.log(safeText(`Shadow Army: ${value.data.message}`, runtime.credential));
    return;
  }
  if (!runtime.closing && ["error", "channel_down", "containment_uncertain"].includes(value.type)) {
    uiLog($, `Shadow Army${value.soldier ? ` · ${value.soldier}` : ""}: ${JSON.stringify(value.data)}`, runtime.credential);
  }
}

async function consume($: EngineInterface, runtime: Runtime): Promise<void> {
  const entry = `${$.plugin.root}/../../dist/v2/modRelay.js`;
  if (!await $.fs.exists(entry)) throw new Error("Shadow Army runtime is missing; run npm run build in its repository");
  if (runtime.closing) return;
  runtime.stream = $.process.spawn({
    argv: ["node", entry, "--cwd", runtime.cwd],
    cwd: runtime.cwd,
    input: `${JSON.stringify({ credential: runtime.credential, session: runtime.session })}\n`,
  });
  let buffer = "";
  try {
    // Native chunks are decoded UTF-8 pieces, not JSON lines. Keep pulling after
    // the initiating command returns; its return alone does not end this child.
    for await (const chunk of runtime.stream) {
      if (chunk.stream === "stderr") {
        runtime.diagnostic = safeText(runtime.diagnostic + chunk.text, runtime.credential).slice(-4_096);
        continue;
      }
      buffer += chunk.text;
      if (new TextEncoder().encode(buffer).byteLength > 20 * 1024 * 1024) throw new Error("post office event exceeded 20 MiB");
      for (let end; (end = buffer.indexOf("\n")) >= 0;) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (line.trim()) event($, runtime, line);
      }
    }
    if (buffer.trim()) throw new Error("post office ended with an incomplete event");
    if (!runtime.closing) throw new Error(`post office relay ended${runtime.diagnostic ? `: ${runtime.diagnostic}` : ""}`);
  } finally {
    cancelTimers(runtime);
  }
}

async function ensure($: EngineInterface): Promise<Runtime> {
  const begun = ends;
  const ended = () => { if (ends !== begun) throw new Error("The army ended before the command could run"); };
  const session = await $.session.id();
  const cwd = await $.session.cwd();
  ended();
  // The army keeps the id it started with after /clear, /resume or /branch (HOST-2), so only another folder replaces it.
  if (active && active.cwd !== cwd) await release($, active);
  let runtime = active;
  if (!runtime || runtime.closing) {
    // The end hook only requests release. A later foreground command waits for the
    // old relay/helper to finish guard finalization and release the folder marker.
    await Promise.all([...retiring].map((old) => old.finished));
    ended();
    // Another concurrent foreground call may have opened the army while we waited.
    if (active && !active.closing && active.cwd === cwd) {
      const shared = active;
      await shared.ready;
      if (shared.closing) throw new Error("Army session closed during startup");
      return shared;
    }
    let accept!: () => void;
    let reject!: (error: Error) => void;
    const ready = new Promise<void>((resolve, failed) => { accept = resolve; reject = failed; });
    void ready.catch(() => {});
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    runtime = {
      session, cwd, credential: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      closing: false, ready, accept, reject, diagnostic: "",
    };
    active = runtime;
    const owned = runtime;
    owned.deadline = $.clock.after(30_000, () => fail($, owned, "post office did not start within 30 seconds"));
    owned.finished = consume($, owned).catch((error) => fail($, owned, error)).finally(() => { retiring.delete(owned); });
  }
  await runtime.ready;
  if (runtime.closing) throw new Error("The army ended before the command could run");
  return runtime;
}

interface Soldier { key: string; name: string; roles: string[]; supported: boolean }
/** The turn result the post office returns. The claim audit and the apply (B3, B4) put their outcome in `write`. */
type Delivery = Pick<TurnResult, "status" | "summary" | "error" | "write" | "refusal" | "logFailure">;

/** SEC-6: each Cc or Cf character except newline and tab shows as a placeholder such as \u{1b}. */
function show(text: unknown): string {
  return String(text).replace(/[\p{Cc}\p{Cf}]/gu, (char) => char === "\n" || char === "\t" ? char : `\\u{${char.codePointAt(0)!.toString(16)}}`);
}

/** SEC-6: every line this mod puts in the UI log is redacted and shown with placeholders, including relay diagnostics. */
function uiLog($: EngineInterface, text: string, credential = ""): void {
  $.ui.log(safeText(show(text), credential));
}

/**
 * `/send <soldier> --claim <path-or-glob> ... <brief>`. A claim with a space sits in double or single quotes
 * (`--claim "docs/Project Notes.md"`); the closing quote must be followed by a space or the end. The brief is
 * everything after the last claim, untouched. A missing or unclosed claim comes back as `error`, before any session opens.
 */
function parseSend(args: string): { name?: string; claims: string[]; brief: string; error?: string } {
  let rest = args.trim();
  const name = /^\S+/.exec(rest)?.[0];
  rest = rest.slice(name?.length ?? 0).trimStart();
  const claims: string[] = [];
  for (let flag; (flag = /^--claim(?=\s|$)\s*/.exec(rest));) {
    rest = rest.slice(flag[0].length);
    const quoted = /^["']/.test(rest);
    const match = quoted ? /^(["'])(.*?)\1(?=\s|$)\s*/.exec(rest) : /^()(\S+)\s*/.exec(rest);
    if (quoted && !match) return { name, claims, brief: rest, error: "a quoted --claim is not closed, or its closing quote is not followed by a space." };
    const claim = match?.[2]?.trim();
    if (!match || !claim || claim === "--claim") return { name, claims, brief: rest, error: "--claim needs a path or glob; put one with a space in quotes." };
    rest = rest.slice(match[0].length);
    claims.push(claim);
  }
  return { name, claims, brief: rest };
}

/** HOST-11's summary card: the soldier, at most five lines of summary, the session log, and what was applied or why not. */
export function card(soldier: Soldier, delivery: Delivery, log: string, credential: string): string {
  // At most five lines of anything the soldier or the office wrote (CRLF and lone CR count as line breaks).
  const five = (value: string | undefined) => value?.split(/\r\n|\r|\n/).slice(0, 5).join("\n");
  const text = five(delivery.summary) ?? "";
  const summary = text || "no summary";
  // M1-AC25: when the turn did not complete or the claim audit left no `write`, the error says why (a thrown audit leaves no other trace).
  const why = delivery.status !== "completed" || !delivery.write ? five(delivery.error?.message) : undefined;
  // With a write outcome the "Not applied" line gives the audit's reason, not the native error, so show the error then too.
  const error = why && (text || delivery.write) ? `\nError: ${why}` : "";
  const apply = delivery.write?.apply;
  // M1-AC27: a failed turn's error (a guard or audit failure names the path) is the reason even after partial text.
  // #94 C9: a failed rollback may leave the edits in the owner's folder, so the card warns and lists every path #101 names.
  const files = apply?.applied && apply.files.length ? `Applied: ${apply.files.map((file) => file.path).join(", ")}`
    : apply && !apply.applied && apply.left ? `Warning: your folder was NOT put back (${apply.reason}). These files may still carry the soldier's edits: ${apply.left.join(", ")}`
    : `Not applied: ${(apply && !apply.applied ? [apply.reason, ...apply.clashes].filter(Boolean).join(": ") : delivery.write?.reason) || why || "no change was applied"}`;
  const outside = delivery.write?.reverted ? delivery.write.outOfScope : [];
  const reverted = outside.length ? `
Reverted, outside its claims: ${outside.join(", ")}` : "";
  // #92 C6: the office failed after the apply (its log, an observer), so the session log may be incomplete.
  const warning = delivery.logFailure ? `\nWarning: ${five(delivery.logFailure)}` : "";
  return safeText(show(`Shadow Army · ${soldier.name} · ${delivery.status}${delivery.refusal ? " (refused)" : ""}\n${summary}${error}\nLog: ${log}\n${files}${warning}${reverted}`), credential);
}

async function send($: EngineInterface, args: string): Promise<string> {
  const { name, claims, brief, error } = parseSend(args);
  if (name && error) return `Nothing sent: ${error}`;
  if (!name || !brief) return "Usage: /send <soldier> --claim <path-or-glob> <brief>";
  if (!claims.length) return "Nothing sent: /send needs at least one --claim <path-or-glob>, so the soldier's changes can be audited.";
  const runtime = await ensure($);
  const soldiers = await post($, runtime, { action: "army" }) as Soldier[];
  if (!Array.isArray(soldiers)) throw new Error("invalid army response");
  const soldier = soldiers.find((item) => item.key.toLowerCase() === name.toLowerCase() || item.name.toLowerCase() === name.toLowerCase());
  if (!soldier) return "Nothing sent: unknown soldier.";
  if (!soldier.supported || !soldier.roles.includes("build")) return show(`Nothing sent: ${soldier.name} is not a claude soldier with the build role.`);
  if (runtime.closing) throw new Error("The army ended before the send could run");
  const opened = await post($, runtime, { action: "open", soldier: soldier.key, claims }) as { session?: string };
  const delivery = await post($, runtime, { action: "send", soldier: soldier.key, text: brief, claims }) as Delivery;
  return card(soldier, delivery, `${runtime.root}/.shadow/v2/logs/${opened.session ?? soldier.key}.jsonl`, runtime.credential);
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    // M1-AC9: a session that is not the owner's interactive one (a soldier's -p session) gets nothing from the mod.
    inert = e.isInteractive === false && !e.surface;
    if (inert) return next(e);
    await $.command.register({ name: "send", description: "Send one brief to a claude soldier and wait for its summary.", argumentHint: "<soldier> --claim <path-or-glob> <brief>", immediate: true });
    return next(e);
  });
  on("command.run", { command: "send" }, async ($, e, next) => {
    if (inert) return next(e);
    try { return { text: await send($, e.args) }; }
    catch (error) { return { text: show(`Shadow Army: ${safeText(error instanceof Error ? error.message : error, active?.credential)}`) }; }
  }).catch((_$, _e, next) => ({ text: show(`Shadow Army: ${safeText(next.error.message)}`) }));
  on("session.end", async ($, e, next) => {
    const runtime = active;
    // /clear and /resume keep the army and its renewals; any other end stops renewing first, then releases with the reason (HOST-2).
    if (!inert && !KEEPS_ARMY.has(String(e.reason))) ends++;
    if (runtime && !inert && !KEEPS_ARMY.has(String(e.reason))) {
      try { await release($, runtime, typeof e.reason === "string" ? e.reason : undefined); }
      catch { /* Cancelled renewals let the independent lease expire if release cannot arrive. */ }
    }
    return next(e);
  });
};
