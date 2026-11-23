import type {
  EngineInterface, HookStream, ProcessSpawnChunk, ProcessSpawnResult, Register, Timer,
} from "claude-code";

interface Runtime {
  session: string;
  cwd: string;
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
    throw new Error(safeText(error, runtime.credential));
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
  if (!wasClosing) $.ui.log(`Shadow Army: ${message}`);
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
    runtime.url = url;
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
    $.ui.log(safeText(`Shadow Army${value.soldier ? ` · ${value.soldier}` : ""}: ${JSON.stringify(value.data)}`, runtime.credential));
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
