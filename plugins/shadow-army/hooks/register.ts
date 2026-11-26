import type {
  EngineInterface, HookStream, ProcessSpawnChunk, ProcessSpawnResult, Register, Timer,
} from "claude-code";

interface Runtime {
  session: string;
  cwd: string;
  /** The canonical repository root the relay reports; the post office keeps `.shadow` there (M1-AC25). */
  root?: string;
  credential: string;
  closing: boolean;
  ready: Promise<void>;
  accept: () => void;
  reject: (error: Error) => void;
  url?: string;
  stream?: HookStream<ProcessSpawnChunk, ProcessSpawnResult>;
  deadline?: Timer;
  heartbeat?: Timer;
  renewing: boolean;
  diagnostic: string;
  finished?: Promise<void>;
}

// These values stay in this module's private environment. $.store writes a file,
// and $.state is readable by other plugins; neither may hold the Monarch secret.
let active: Runtime | undefined;
const retiring = new Set<Runtime>();

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

async function release($: EngineInterface, runtime: Runtime): Promise<void> {
  // Stop renewals before a network wait: session.end shares the native 1.5s
  // deadline, and /clear keeps the Claude process/module alive afterwards.
  runtime.closing = true;
  cancelTimers(runtime);
  runtime.reject(new Error("Claude session ended before the post office was ready"));
  retiring.add(runtime);
  if (active === runtime) active = undefined;
  if (runtime.url) await post($, runtime, { action: "release", session: runtime.session });
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

async function renew($: EngineInterface, runtime: Runtime): Promise<void> {
  if (runtime.closing) return;
  if (await $.session.id() !== runtime.session) {
    await release($, runtime);
    return;
  }
  if (!runtime.closing) await post($, runtime, { action: "renew", session: runtime.session });
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
      void post($, runtime, { action: "release", session: runtime.session }).catch(() => {});
      return;
    }
    runtime.heartbeat = $.clock.every(5_000, () => {
      if (runtime.closing || runtime.renewing) return;
      runtime.renewing = true;
      void renew($, runtime).catch((error) => fail($, runtime, error)).finally(() => { runtime.renewing = false; });
    });
    runtime.accept();
    return;
  }
  // M1 observes the event stream without adding another model turn/context.
  // The richer pane and transcript cards belong to the later mod milestones.
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
  const session = await $.session.id();
  const cwd = await $.session.cwd();
  if (active && (active.session !== session || active.cwd !== cwd)) await release($, active);
  let runtime = active;
  if (!runtime || runtime.closing) {
    // The end hook only requests release. A later foreground command waits for the
    // old relay/helper to finish guard finalization and release the folder marker.
    await Promise.all([...retiring].map((old) => old.finished));
    if (await $.session.id() !== session) throw new Error("Claude session changed while the previous army was closing");
    // Another concurrent foreground call may have opened this session while we waited.
    if (active && !active.closing && active.session === session && active.cwd === cwd) {
      const shared = active;
      await shared.ready;
      if (shared.closing || await $.session.id() !== session) throw new Error("Army session closed during startup");
      return shared;
    }
    let accept!: () => void;
    let reject!: (error: Error) => void;
    const ready = new Promise<void>((resolve, failed) => { accept = resolve; reject = failed; });
    void ready.catch(() => {});
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    runtime = {
      session, cwd, credential: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      closing: false, ready, accept, reject, renewing: false, diagnostic: "",
    };
    active = runtime;
    const owned = runtime;
    owned.deadline = $.clock.after(30_000, () => fail($, owned, "post office did not start within 30 seconds"));
    owned.finished = consume($, owned).catch((error) => fail($, owned, error)).finally(() => { retiring.delete(owned); });
  }
  await runtime.ready;
  if (runtime.session !== session || runtime.closing || await $.session.id() !== session) {
    // A command that began before /clear cannot claim a runtime another command
    // opened for the new session, or release that newer command's lease.
    if (runtime.session === session) await release($, runtime);
    throw new Error("Claude session changed before the army command could run");
  }
  return runtime;
}

interface Soldier { key: string; name: string; roles: string[]; supported: boolean }
/** The turn result the post office returns; `applied`, `reverted` and `reason` come from the claim audit and the apply (B3, B4). */
interface Delivery { status: string; summary?: string; error?: { message?: string }; applied?: string[]; reverted?: string[]; reason?: string }

/** SEC-6: each Cc or Cf character except newline and tab shows as a placeholder such as \u{1b}. */
function show(text: unknown): string {
  return String(text).replace(/[\p{Cc}\p{Cf}]/gu, (char) => char === "\n" || char === "\t" ? char : `\\u{${char.codePointAt(0)!.toString(16)}}`);
}

/** SEC-6: every line this mod puts in the UI log is redacted and shown with placeholders, including relay diagnostics. */
function uiLog($: EngineInterface, text: string, credential = ""): void {
  $.ui.log(safeText(show(text), credential));
}

/**
 * `/send <soldier> <brief>`. This build has no claim audit or apply (C15), so a brief that starts with `--claim`
 * is refused as `error` before any session opens, instead of being sent as text.
 */
function parseSend(args: string): { name?: string; brief: string; error?: string } {
  const text = args.trim();
  const name = /^\S+/.exec(text)?.[0];
  const brief = text.slice(name?.length ?? 0).trimStart();
  if (/^--claim(?=\s|$)/.test(brief)) return { name, brief, error: "--claim is not available in this build: there is no claim audit yet, so a claimed brief is not sent." };
  return { name, brief };
}

/** HOST-11's summary card: the soldier, at most five lines of summary, the session log, and what was applied or why not. */
function card(soldier: Soldier, delivery: Delivery, log: string, credential: string): string {
  // Choose the summary, or else the error, first; then cap whichever it is at five lines (CRLF and lone CR count as line breaks).
  const summary = (delivery.summary || delivery.error?.message || "no summary").split(/\r\n|\r|\n/).slice(0, 5).join("\n");
  const files = delivery.applied?.length ? `Applied: ${delivery.applied.join(", ")}` : `Not applied: ${delivery.reason ?? "no change was applied"}`;
  const reverted = delivery.reverted?.length ? `\nReverted, outside its claims: ${delivery.reverted.join(", ")}` : "";
  return safeText(show(`Shadow Army · ${soldier.name} · ${delivery.status}\n${summary}\nLog: ${log}\n${files}${reverted}`), credential);
}

async function send($: EngineInterface, args: string): Promise<string> {
  const { name, brief, error } = parseSend(args);
  if (name && error) return `Nothing sent: ${error}`;
  if (!name || !brief) return "Usage: /send <soldier> <brief>";
  const runtime = await ensure($);
  const soldiers = await post($, runtime, { action: "army" }) as Soldier[];
  if (!Array.isArray(soldiers)) throw new Error("invalid army response");
  const soldier = soldiers.find((item) => item.key.toLowerCase() === name.toLowerCase() || item.name.toLowerCase() === name.toLowerCase());
  if (!soldier) return "Nothing sent: unknown soldier.";
  if (!soldier.supported || !soldier.roles.includes("build")) return show(`Nothing sent: ${soldier.name} is not a claude soldier with the build role.`);
  if (runtime.closing || await $.session.id() !== runtime.session) throw new Error("Claude session changed before the send could run");
  const opened = await post($, runtime, { action: "open", soldier: soldier.key }) as { session?: string };
  const delivery = await post($, runtime, { action: "send", soldier: soldier.key, text: brief }) as Delivery;
  return card(soldier, delivery, `${runtime.root}/.shadow/v2/logs/${opened.session ?? soldier.key}.jsonl`, runtime.credential);
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({ name: "send", description: "Send one brief to a claude soldier and wait for its summary.", argumentHint: "<soldier> <brief>", immediate: true });
    return next(e);
  });
  on("command.run", { command: "send" }, async ($, e) => {
    try { return { text: await send($, e.args) }; }
    catch (error) { return { text: show(`Shadow Army: ${safeText(error instanceof Error ? error.message : error, active?.credential)}`) }; }
  }).catch((_$, _e, next) => ({ text: show(`Shadow Army: ${safeText(next.error.message)}`) }));
  on("session.end", async ($, e, next) => {
    const runtime = active;
    if (runtime?.session === e.sessionId) {
      try { await release($, runtime); }
      catch { /* Cancelled renewals let the independent lease expire if release cannot arrive. */ }
    }
    return next(e);
  });
};
