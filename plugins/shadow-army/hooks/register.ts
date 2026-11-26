import type {
  EngineInterface, HookStream, ProcessSpawnChunk, ProcessSpawnResult, Register, Timer,
} from "claude-code";
import type { TurnResult } from "../../../src/v2/channel.js";
import { sanitize } from "../../../src/v2/sanitize.js";

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
  /** The renewal now waiting for its answer, if any; it stops counting as waiting after 5 s (HOST-2). */
  renewing?: symbol;
  diagnostic: string;
  finished?: Promise<void>;
  /** ARM-7: the folder's latest trust card; a use that meets it while it is open waits on its answer. */
  card?: Card;
  /** C3: the requests now in flight, each with the first card drawn while it was, whose answer it takes. */
  uses: Set<{ met?: Card }>;
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
/** HOST-2: each `--version` run ends after 10 s, and a post office that never reports ready is ended after 60 s. */
const VERSION_WAIT_MS = 10_000;
const READY_WAIT_MS = 60_000;
const MIN_HOST = [2, 1, 294];
const PROXY_VARIABLES = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"];
const NO_PROXY_VARIABLES = ["NO_PROXY", "no_proxy"];
/** The preflight passed in this process; HOST-2 checks before the first start only. */
let checked = false;

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
  let response: { ok: boolean; status: number; text: string };
  try {
    response = await $.http.fetch(`${runtime.url}/command`, {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.credential}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
  } catch (error) {
    // Claude Code itself refused (HOST-2): stop renewing so the lease ends the post office, and send nothing more.
    const words = safeText(error instanceof Error ? error.message : error, runtime.credential);
    if (!runtime.closing) fail($, runtime, `Shadow Army can't reach its post office: Claude Code refused the request (${words || "your organization's policy doesn't allow web fetch"})`);
    throw new Error(words);
  }
  try {
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
  if (!wasClosing) $.ui.log(sanitize(prefixed(message)));
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
    runtime.url = url;
    runtime.deadline?.cancel();
    runtime.deadline = undefined;
    if (runtime.closing) {
      // An end event may beat relay startup. Release a late ready helper too.
      void post($, runtime, { action: "release", session: runtime.session }).catch(() => {});
      return;
    }
    runtime.heartbeat = $.clock.every(RENEW_EVERY_MS, () => renew($, runtime));
    runtime.accept();
    return;
  }
  // M1 observes the event stream without adding another model turn/context.
  // The richer pane and transcript cards belong to the later mod milestones.
  if (!runtime.closing && ["error", "channel_down", "containment_uncertain"].includes(value.type)) {
    $.ui.log(sanitize(safeText(`Shadow Army${value.soldier ? ` · ${value.soldier}` : ""}: ${JSON.stringify(value.data)}`, runtime.credential)));
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

/** A tool's `--version` as numbers, `undefined` when it is missing, or `"late"` after 10 s, with its processes ended (HOST-2). */
async function versionOf($: EngineInterface, tool: string, cwd: string): Promise<number[] | undefined | "late"> {
  let stream: HookStream<ProcessSpawnChunk, ProcessSpawnResult>;
  try { stream = $.process.spawn({ argv: [tool, "--version"], cwd }); } catch { return undefined; }
  let timer: Timer | undefined;
  const late = new Promise<"late">((done) => { timer = $.clock.after(VERSION_WAIT_MS, () => done("late")); });
  const read = (async () => {
    let out = "";
    try { for await (const chunk of stream) if (chunk.stream === "stdout") out += chunk.text; } catch { return undefined; }
    const found = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(out);
    return found ? [Number(found[1]), Number(found[2]), Number(found[3] ?? 0)] : undefined;
  })();
  const result = await Promise.race([read, late]);
  timer?.cancel();
  if (result === "late") void stream.return({ code: null, signal: null }).catch(() => {});
  return result;
}

const olderThan = (found: number[], least: number[]): boolean => {
  for (let i = 0; i < least.length; i++) if (found[i]! !== least[i]!) return found[i]! < least[i]!;
  return false;
};

/** A variable's value from the shell (`$.env.get`) or the merged settings' `env`. */
async function setting($: EngineInterface, name: string): Promise<string | undefined> {
  const shell = await $.env.get(name);
  if (shell) return shell;
  const merged = await $.settings.read() as { env?: Record<string, string> } | undefined;
  return merged?.env?.[name] || undefined;
}

/** HOST-2's preflight: the line to show when the army must not start, or `undefined` to go on. */
async function preflight($: EngineInterface, cwd: string): Promise<string | undefined> {
  const host = String(await $.session.version());
  const hostParts = /(\d+)\.(\d+)\.(\d+)/.exec(host)?.slice(1).map(Number);
  if (!hostParts || olderThan(hostParts, MIN_HOST)) return `Shadow Army needs Claude Code 2.1.294 or later; this is ${host}`;
  for (const [tool, name, least] of [["node", "Node.js", [22, 0]], ["git", "git", [2, 34]]] as const) {
    const found = await versionOf($, tool, cwd);
    if (found === undefined || found === "late") {
      return `${found === "late" ? `${tool} --version gave no answer in 10 s · ` : ""}Shadow Army needs ${name} ${least.join(".")} or later on PATH; none was found`;
    }
    if (olderThan(found, [...least])) return `Shadow Army needs ${name} ${least.join(".")} or later on PATH; found ${found.join(".")}`;
  }
  // P-16: Claude Code sends the mod's fetch through a proxy named in these variables, the loopback address too.
  const listed = (await Promise.all(NO_PROXY_VARIABLES.map((name) => setting($, name)))).some((value) =>
    (value ?? "").split(",").some((entry) => ["127.0.0.1", "*"].includes(entry.trim())));
  if (!listed) {
    for (const name of PROXY_VARIABLES) {
      if (await setting($, name)) return `Shadow Army: ${name} would send the army's commands through a proxy · add 127.0.0.1 to NO_PROXY · nothing started`;
    }
  }
  return undefined;
}

async function ensure($: EngineInterface): Promise<Runtime> {
  const session = await $.session.id();
  const cwd = await $.session.cwd();
  // The army keeps the id it started with after /clear, /resume or /branch (HOST-2), so only another folder replaces it.
  if (active && active.cwd !== cwd) await release($, active);
  let runtime = active;
  if (!runtime || runtime.closing) {
    // The end hook only requests release. A later foreground command waits for the
    // old relay/helper to finish guard finalization and release the folder marker.
    await Promise.all([...retiring].map((old) => old.finished));
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
      closing: false, ready, accept, reject, diagnostic: "", uses: new Set(),
    };
    active = runtime;
    const owned = runtime;
    // HOST-2: two uses at once share this one start and its refusal; `active` is set before the first wait.
    owned.finished = (async () => {
      if (!checked) {
        const refusal = await preflight($, cwd);
        if (refusal) throw new Error(refusal);
        checked = true;
      }
      owned.deadline = $.clock.after(READY_WAIT_MS, () => fail($, owned, "post office did not report ready within 60 s · step: waiting for its ready event · ended with its processes"));
      await consume($, owned);
    })().catch((error) => fail($, owned, error instanceof Error ? error.message : error)).finally(() => { retiring.delete(owned); });
  }
  await runtime.ready;
  if (runtime.closing) throw new Error("The army ended before the command could run");
  return runtime;
}

interface Soldier { key: string; name: string; roles: string[]; supported: boolean }
/** The turn result the post office returns. The claim audit and the apply (B3, B4) put their outcome in `write`. */
type Delivery = Pick<TurnResult, "status" | "summary" | "error" | "write" | "refusal">;

/** SEC-6: every drawn text goes through M1b-9's placeholder function. */
const prefixed = (message: string): string => message.startsWith("Shadow Army") ? message : `Shadow Army: ${message}`;
function show(text: unknown): string {
  return sanitize(String(text));
}

function parseSend(args: string): { name?: string; claims: string[]; brief: string } {
  let rest = args.trim();
  const word = () => { const match = /^(\S+)\s*/.exec(rest); rest = rest.slice(match?.[0].length ?? 0); return match?.[1]; };
  const name = word();
  const claims: string[] = [];
  while (rest.startsWith("--claim ")) { word(); const path = word(); if (path) claims.push(path); }
  return { name, claims, brief: rest };
}

/** HOST-11's summary card: the soldier, at most five lines of summary, the session log, and what was applied or why not. */
export function card(soldier: Soldier, delivery: Delivery, log: string, credential: string): string {
  const summary = (delivery.summary ?? "").split("\n").slice(0, 5).join("\n") || delivery.error?.message || "no summary";
  // M1-AC25: when the turn did not complete or the claim audit left no `write`, the error says why (a thrown audit leaves no other trace).
  const why = delivery.status !== "completed" || !delivery.write ? delivery.error?.message : undefined;
  const error = why && why !== summary ? `\nError: ${why}` : "";
  const apply = delivery.write?.apply;
  const files = apply?.applied && apply.files.length ? `Applied: ${apply.files.map((file) => file.path).join(", ")}`
    : `Not applied: ${(apply && !apply.applied ? [apply.reason, ...apply.clashes].filter(Boolean).join(": ") : delivery.write?.reason) || why || "no change was applied"}`;
  const outside = delivery.write?.reverted ? delivery.write.outOfScope : [];
  const reverted = outside.length ? `
Reverted, outside its claims: ${outside.join(", ")}` : "";
  return safeText(show(`Shadow Army · ${soldier.name} · ${delivery.status}${delivery.refusal ? " (refused)" : ""}\n${summary}${error}\nLog: ${log}\n${files}${reverted}`), credential);
}

/** The post office writes its logs under the repository root, which can sit above Claude's cwd: the nearest folder up that holds `.git`. */
async function repoRoot($: EngineInterface, cwd: string): Promise<string> {
  let dir = cwd.replace(/[\\/]+$/, "");
  for (;;) {
    if (await $.fs.exists(`${dir}/.git`)) return dir;
    const up = dir.replace(/[\\/][^\\/]*$/, "");
    if (!up || up === dir) return cwd;
    dir = up;
  }
}

/**
 * ARM-7: #140's trust answer. While a policy file is untrusted the post office answers `open` and `send` with it
 * instead of their result and starts nothing (#143); `trust` with exactly the card's file hashes accepts them.
 */
type TrustRow =
  | { kind: "file"; name: string; state: "new" | "changed" | "gone"; hash: string; soldier?: string }
  | { kind: "soldier"; name: string; cli: string; model: string; autonomy: string }
  | { kind: "server"; file: string; name: string; target: string };
/** What the folder's card ended with: `accepted`, or the line to return with nothing started. */
type CardOutcome = { accepted: true } | { accepted: false; reason: string; failed?: string };
/** One card the owner was shown, by identity; `settled` once its answer is in. */
type Card = { outcome: Promise<CardOutcome>; settled: boolean };
/** ARM-7's five policy files, as `src/v2/trust.ts` names them (#143). */
const POLICY_FILES = new Set(["shadow.config.json", "orchestratorDelegate.md", "agent.md", "rules.md", ".mcp.json"]);
const TRUST_QUESTION = "Trust this folder's Shadow Army files?";
const TRUST_NOT_NOW = "Not now";
const TRUST_ACCEPT = "Trust these files";
const TRUST_WAIT = "the army waits for you to trust this folder's Shadow Army files";

const isText = (value: unknown): value is string => typeof value === "string";
function isTrustRow(value: unknown): value is TrustRow {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row !== "object") return false;
  // A file row names one of the five policy files with its full hash; a gone file may have no last-trusted hash.
  if (row.kind === "file") return isText(row.name) && POLICY_FILES.has(row.name) && isText(row.hash) && /^([a-f0-9]{64})?$/.test(row.hash)
    && (row.state === "new" || row.state === "changed" || row.state === "gone") && (row.hash !== "" || row.state === "gone")
    && (row.soldier === undefined || isText(row.soldier));
  if (row.kind === "soldier") return isText(row.name) && isText(row.cli) && isText(row.model) && isText(row.autonomy);
  return row.kind === "server" && isText(row.file) && isText(row.name) && isText(row.target);
}

/** The card's rows when `result` is a trust answer, else `undefined`. A malformed answer throws: nothing is shown or accepted on a guess. */
function trustRows(result: unknown): TrustRow[] | undefined {
  if (!result || typeof result !== "object" || !("trust" in result)) return undefined;
  const rows = ((result as { trust: unknown }).trust as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows) || !rows.every(isTrustRow) || !rows.some((row) => row.kind === "file")) throw new Error(`the post office's trust answer is malformed; nothing was accepted and nothing started`);
  return rows;
}

const cardKey = (rows: TrustRow[]) => rows.map((row) => row.kind === "file" ? `${row.name}:${row.hash}` : "").filter(Boolean).join();

/**
 * ARM-7's card, for the owner's own use: one notice row per row of the answer, then the question with `Not now` first.
 * Only the exact answer `Trust these files` accepts, and it sends exactly the file hashes shown. Not now, text typed
 * under Other, a dismissed or rejecting dialog, an army that ended meanwhile and a refused accept each start nothing.
 */
async function showCard($: EngineInterface, runtime: Runtime, rows: TrustRow[], refreshed: boolean): Promise<CardOutcome> {
  if (refreshed) $.ui.log("Shadow Army · trust · the files changed while the question was open; these are their new hashes");
  for (const row of rows) {
    $.ui.log(show(row.kind === "file" ? `Shadow Army · trust · ${row.state} · ${row.name}${row.soldier ? ` (${row.soldier})` : ""}${row.hash ? ` · ${row.hash.slice(0, 12)}` : ""}`
      : row.kind === "soldier" ? `Shadow Army · trust · soldier · ${[row.name, row.cli, row.model, row.autonomy].join(" · ")}`
      : `Shadow Army · trust · ${row.file} server · ${row.name} · ${row.target}`));
  }
  let answer: string;
  try { answer = await $.ui.ask(TRUST_QUESTION, { options: [TRUST_NOT_NOW, TRUST_ACCEPT], header: "Trust" }); }
  catch { return { accepted: false, reason: `Nothing started: ${TRUST_WAIT} (the dialog was dismissed or could not open).` }; }
  if (answer !== TRUST_ACCEPT) return { accepted: false, reason: `Nothing started: ${TRUST_WAIT}.` };
  if (runtime.closing) return { accepted: false, reason: "Nothing started: the army ended while the question was open; nothing was accepted." };
  const hashes = rows.flatMap((row) => row.kind === "file" ? [row.hash] : []);
  let result: unknown;
  try { result = await post($, runtime, { action: "trust", hashes }); }
  catch (error) {
    // HOST-2: Claude Code refused the fetch and `post` retired the army; that is not a stale card, so nothing more is posted.
    if (runtime.closing) return { accepted: false, reason: show(`Nothing started: nothing was accepted, the army ended: ${safeText(error instanceof Error ? error.message : error, runtime.credential)}.`) };
    return { accepted: false, failed: cardKey(rows), reason: show(`Nothing started: nothing was accepted, ${safeText(error instanceof Error ? error.message : error, runtime.credential)}.`) }; }
  if ((result as { ok?: unknown } | null)?.ok !== true) return { accepted: false, reason: "Nothing started: the post office did not confirm the trust; nothing was accepted." };
  return { accepted: true };
}

/**
 * Posts `command` and answers any trust card it meets (ARM-7). One card per army: a use that meets an open card waits
 * on its answer instead of drawing a second one. When an accept is refused because a file changed while the question
 * was open, the command's new card, with the new hashes, is shown and asked again; the same card refused stops.
 */
async function gated($: EngineInterface, runtime: Runtime, command: Record<string, unknown>): Promise<{ value: unknown } | { held: string }> {
  let refused: { key: string; reason: string } | undefined;
  for (;;) {
    const open = runtime.card;
    if (open && !open.settled) {
      const outcome = await open.outcome;
      if (!outcome.accepted) return { held: outcome.reason };
    }
    // C9: Claude Code may retire the army at any step (HOST-2); nothing is posted after that, retries included.
    if (runtime.closing) throw new Error("The army ended before the command could run");
    // C3: the first card drawn while this request is in flight answers this use, even after a later card replaced it.
    const use: { met?: Card } = {};
    runtime.uses.add(use);
    let value: unknown;
    try { value = await post($, runtime, command); } finally { runtime.uses.delete(use); }
    const rows = trustRows(value);
    if (!rows) return { value };
    if (use.met) {
      const outcome = await use.met.outcome;
      if (!outcome.accepted) return { held: outcome.reason };
      continue;
    }
    if (refused && refused.key === cardKey(rows)) return { held: refused.reason };
    const card: Card = { outcome: showCard($, runtime, rows, refused !== undefined), settled: false };
    card.outcome = card.outcome.finally(() => { card.settled = true; });
    runtime.card = card;
    for (const other of runtime.uses) other.met ??= card;
    const outcome = await card.outcome;
    if (outcome.accepted) { refused = undefined; continue; }
    if (outcome.failed === undefined) return { held: outcome.reason };
    refused = { key: outcome.failed, reason: outcome.reason };
  }
}

async function send($: EngineInterface, args: string): Promise<string> {
  const { name, claims, brief } = parseSend(args);
  if (!name || !brief) return "Usage: /send <soldier> --claim <path-or-glob> <brief>";
  if (!claims.length) return "Nothing sent: /send needs at least one --claim <path-or-glob>, so the soldier's changes can be audited.";
  const runtime = await ensure($);
  const soldiers = await post($, runtime, { action: "army" }) as Soldier[];
  if (!Array.isArray(soldiers)) throw new Error("invalid army response");
  const soldier = soldiers.find((item) => item.key.toLowerCase() === name.toLowerCase() || item.name.toLowerCase() === name.toLowerCase());
  if (!soldier) return "Nothing sent: unknown soldier.";
  if (!soldier.supported || !soldier.roles.includes("build")) return show(`Nothing sent: ${soldier.name} is not a claude soldier with the build role.`);
  if (runtime.closing) throw new Error("The army ended before the send could run");
  // Stand-in (S-6, B1): WSP-11 lets only `sa live` open a session in M1, so `/send` still opens one here until M1b-28/29 settle it.
  // ARM-7: while a policy file is untrusted, open and send answer with the folder's trust card instead (#143).
  const opening = await gated($, runtime, { action: "open", soldier: soldier.key, claims });
  if ("held" in opening) return opening.held;
  const opened = opening.value as { session?: string };
  const sending = await gated($, runtime, { action: "send", soldier: soldier.key, text: brief, claims });
  if ("held" in sending) return sending.held;
  const delivery = sending.value as Delivery;
  const root = await repoRoot($, runtime.cwd);
  return card(soldier, delivery, `${root}/.shadow/v2/logs/${opened.session ?? soldier.key}.jsonl`, runtime.credential);
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
    catch (error) { return { text: show(prefixed(safeText(error instanceof Error ? error.message : error, active?.credential))) }; }
  }).catch((_$, _e, next) => ({ text: show(`Shadow Army: ${safeText(next.error.message)}`) }));
  on("session.end", async ($, e, next) => {
    const runtime = active;
    // /clear and /resume keep the army and its renewals; any other end stops renewing first, then releases with the reason (HOST-2).
    if (runtime && !inert && !KEEPS_ARMY.has(String(e.reason))) {
      try { await release($, runtime, typeof e.reason === "string" ? e.reason : undefined); }
      catch { /* Cancelled renewals let the independent lease expire if release cannot arrive. */ }
    }
    return next(e);
  });
};
