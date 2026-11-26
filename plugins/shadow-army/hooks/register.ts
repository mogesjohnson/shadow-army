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
  /** The Node.js executable vetted for this start (HOST-2); the relay runs with it. */
  node: string;
  /** The startup step now under way, for the line that names a stall (HOST-2). */
  step: string;
  /** Set once a request to the post office got an answer: a later failed fetch is then not a host policy refusal. */
  reached: boolean;
  /** The one line that stopped the army because Claude Code refused a fetch; nothing is sent after it. */
  refused?: string;
  /** Ending the relay: `ended` once its end was seen, else `failed` or `late` (not seen in 30 s). */
  cleanup?: Promise<RelayEnd>;
  /** Reading the relay's stream; it settles only when the relay has ended. */
  relay?: Promise<void>;
  /** A next start waits for this: the relay's end, or a stalled start's decision to refuse (C5). */
  barrier: Promise<void>;
  lift: () => void;
  /** The relay's own terminal result, once its stream ended without failing (C5). */
  exit?: ProcessSpawnResult;
  /** Reading or processing the relay's stream failed: it was abandoned, so its post office's end was not seen (C5). */
  broken?: boolean;
  /** The post office's exit as the relay observed it: the only proof that it closed (C5). */
  officeExit?: { code: number | null; signal: string | null };
}

/** How a process ended, in words. */
const ending = (exit?: { code: number | null; signal: string | null }): string =>
  !exit ? "no exit result" : exit.signal ? `signal ${exit.signal}` : exit.code === null ? "no exit code" : `exit code ${exit.code}`;

/** Why a relay's end does not show its post office closed, or `undefined` when it does or the relay has not ended (C5). */
function unseen(runtime: Runtime): string | undefined {
  if (runtime.officeExit) return undefined;
  if (runtime.broken) return "failed before it could close its post office";
  if (runtime.exit) return `ended (${ending(runtime.exit)}) without confirming that its post office closed`;
  return undefined;
}
const heldBack = (runtime: Runtime, why: string): string =>
  `Shadow Army won't start the army: the last relay ${why} (step: ${runtime.step}), so its post office may still be running`;

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
/** The post office's own lease (PO-7): past it the post office has ended itself, whatever the host confirmed. */
const CLEANUP_WAIT_MS = 30_000;
type RelayEnd = "ended" | "failed" | "late";
/** C5: set while a relay's end is unconfirmed; every start is refused with it until that end is seen. */
let unconfirmedEnd: string | undefined;
/** Claude Code's own words for a refused fetch; a later rejection with these is a policy change, not transport. */
const POLICY_WORDS = /\b(?:polic|refus|not allow|denied|disabled)/i; // `\b`: a socket's ECONNREFUSED is transport
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
  if (runtime.refused) throw new Error(runtime.refused);
  if (!runtime.url || !runtime.credential) throw new Error("post office is not connected");
  let response: { ok: boolean; status: number; text: string };
  try {
    response = await $.http.fetch(`${runtime.url}/command`, {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.credential}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    runtime.reached = true;
  } catch (error) {
    const words = safeText(error instanceof Error ? error.message : error, runtime.credential);
    // A policy refusal is the same for every request, so a request that fails before any got an answer, or that carries the host's policy words, is one (HOST-2).
    // After an answer, a failed fetch is ordinary transport: this command fails, a renewal is skipped, and the army goes on (PO-7).
    if (!runtime.closing && (!runtime.reached || POLICY_WORDS.test(words))) refuse($, runtime, words);
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

function fail($: EngineInterface, runtime: Runtime, error: unknown, keepRelay = false): void {
  const message = safeText(error, runtime.credential);
  const wasClosing = runtime.closing;
  runtime.closing = true;
  cancelTimers(runtime);
  runtime.reject(new Error(message));
  if (active === runtime) active = undefined;
  // C5: every failed start retires behind the barrier, so the next start waits for its cleanup; a relay that ended
  // or broke without reporting its post office's exit refuses every start (the stall's own words win while it decides).
  retiring.add(runtime);
  const why = unseen(runtime);
  if (why) unconfirmedEnd = heldBack(runtime, why);
  if (!wasClosing) $.ui.log(sanitize(prefixed(message)));
  // The native stream owns only the relay. Returning it cannot skip the
  // detached post office's independent expiry/containment/finalization path.
  // `finished` waits for this, so a new start waits until the relay's end is confirmed.
  if (runtime.stream && !keepRelay) runtime.cleanup ??= endRelay($, runtime);
}

/** Claude Code refused a fetch: send nothing more and stop renewing, and leave the relay alone, so the lease ends the post office and the relay ends with it (HOST-2, PO-7). */
function refuse($: EngineInterface, runtime: Runtime, words: string): void {
  const line = `Shadow Army can't reach its post office: Claude Code refused the request (${words || "your organization's policy doesn't allow web fetch"})`;
  runtime.refused = line;
  retiring.add(runtime);
  fail($, runtime, line, true);
}

/**
 * Ends the relay after a failure. The host may kill it outright, so this confirms the relay's end only, not its
 * post office's (whose lease then ends it, PO-7). A timer is never taken as confirmation: a failed or late end
 * refuses every start until the host confirms it, which may be never (then the army stays refused, C5). A relay whose
 * post office's exit went unseen keeps `fail`'s refusal whatever the cleanup gives: only that exit could lift it (C5, review 45).
 */
async function endRelay($: EngineInterface, runtime: Runtime): Promise<RelayEnd> {
  let timer: Timer | undefined;
  const bound = new Promise<"late">((done) => { timer = $.clock.after(CLEANUP_WAIT_MS, () => done("late")); });
  const ended = Promise.resolve(runtime.stream?.return({ code: null, signal: null })).then(() => "ended" as const, () => "failed" as const);
  const outcome = await Promise.race([ended, bound]);
  timer?.cancel();
  if (outcome === "ended" || unseen(runtime)) return outcome;
  unconfirmedEnd = `Shadow Army won't start the army: the last relay's end ${outcome === "failed" ? "failed" : `was not confirmed in ${CLEANUP_WAIT_MS / 1000} s`} at step: ${runtime.step}, so its post office may still be running`;
  const mine = unconfirmedEnd;
  if (outcome === "late") void ended.then((how) => { if (how === "ended" && unconfirmedEnd === mine) unconfirmedEnd = undefined; });
  return outcome;
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
  if (value.type === "post_office_exit") {
    const exit = (value.data ?? {}) as { code?: unknown; signal?: unknown };
    const code = exit.code === null || Number.isInteger(exit.code) ? exit.code as number | null : undefined;
    const signal = exit.signal === null || typeof exit.signal === "string" ? exit.signal as string | null : undefined;
    if (runtime.officeExit || value.soldier || code === undefined || signal === undefined) throw new Error("invalid post office exit event");
    runtime.officeExit = { code, signal };
    return;
  }
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
  runtime.step = "looking for the relay's file";
  if (!await $.fs.exists(entry)) throw new Error("Shadow Army runtime is missing; run npm run build in its repository");
  if (runtime.closing) return;
  runtime.step = "starting the relay";
  runtime.stream = $.process.spawn({
    argv: [runtime.node, entry, "--cwd", runtime.cwd],
    cwd: runtime.cwd,
    input: `${JSON.stringify({ credential: runtime.credential, session: runtime.session })}\n`,
  });
  runtime.step = "waiting for its ready event";
  let buffer = "";
  try {
    // Native chunks are decoded UTF-8 pieces, not JSON lines. Keep pulling after
    // the initiating command returns; its return alone does not end this child.
    // Read by hand, not `for await`: the terminal result is the relay's own report of how it ended (C5).
    for (;;) {
      let step: IteratorResult<ProcessSpawnChunk, ProcessSpawnResult>;
      try { step = await runtime.stream.next(); } catch (error) { runtime.broken = true; throw error; }
      if (step.done) { runtime.exit = step.value; break; }
      const chunk = step.value;
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
    // A relay ended from outside also returns a terminal result: only one that confirms its post office's exit is a shutdown (C5).
    if (!runtime.officeExit) throw new Error(`post office relay ${unseen(runtime)}`);
  } catch (error) {
    // Any failure after launch abandons the stream: a chunk read but not processed (malformed, oversized) is as
    // unseen as a failed read, and the relay's later return proves only the relay's end (C5, review 35).
    if (!runtime.exit) runtime.broken = true;
    throw error;
  } finally {
    cancelTimers(runtime);
  }
}

/** What one `--version` run gave: the version as numbers, or why there is none (HOST-2). */
type Probe = { version: number[] } | { problem: string } | "late";

/** Runs `<exe> --version` and reads the first line with `pattern`. The run counts only if it exited 0, and ends after 10 s with its processes (HOST-2). */
async function versionOf($: EngineInterface, exe: string, pattern: RegExp, cwd: string): Promise<Probe> {
  let stream: HookStream<ProcessSpawnChunk, ProcessSpawnResult>;
  try { stream = $.process.spawn({ argv: [exe, "--version"], cwd }); } catch { return { problem: "could not be started" }; }
  let timer: Timer | undefined;
  const late = new Promise<"late">((done) => { timer = $.clock.after(VERSION_WAIT_MS, () => done("late")); });
  const read = (async (): Promise<Probe> => {
    let out = "";
    let ended: ProcessSpawnResult | undefined;
    try {
      for (;;) {
        const step = await stream.next();
        if (step.done) { ended = step.value; break; }
        if (step.value.stream === "stdout") out += step.value.text;
      }
    } catch { return { problem: "could not be read" }; }
    // A run that prints a supported version and then fails or is ended proves nothing.
    if (!ended || ended.code !== 0 || ended.signal) return { problem: `did not exit cleanly (${ended?.signal ?? (ended ? `exit code ${ended.code}` : "no exit result")})` };
    const found = pattern.exec(out.split(/\r?\n/).find((line) => line.trim()) ?? "");
    return found ? { version: [Number(found[1]), Number(found[2]), Number(found[3] ?? 0)] } : { problem: "did not print a version line" };
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

/** A path as compared: forward slashes, no trailing slash, no `\\?\` prefix, and lower case where the file system ignores case (Windows, macOS; CH-1). */
const normal = (path: string): string => {
  const text = path.replace(/\\/g, "/").replace(/^\/\/\?\//, "").replace(/\/+$/, "");
  return process.platform === "win32" || process.platform === "darwin" ? text.toLowerCase() : text;
};
const isAbsolute = (path: string): boolean => process.platform === "win32" ? /^(?:[A-Za-z]:[\\/]|\\\\)/.test(path) : path.startsWith("/");

/** Where a path really lands, with links, junctions and 8.3 names followed (`$.fs.stat` with `resolve`), or `undefined` when it leads nowhere (HOST-2, CH-1). */
async function realPathOf($: EngineInterface, path: string): Promise<string | undefined> {
  try {
    const real = (await $.fs.stat(path, { resolve: true })).realPath;
    return typeof real === "string" && real !== "" ? real : undefined;
  } catch { return undefined; }
}

/** Whether a real path is in a barred folder or under `.shadow` (snapshots); `barred` holds `normal` forms. */
const isBarred = (real: string, barred: string[]): boolean => {
  const here = normal(real);
  return /\/\.shadow(?:\/|$)/.test(here) || barred.some((root) => here === root || here.startsWith(`${root}/`));
};

/**
 * An executable by its absolute path on `PATH` alone, as CH-1 finds each CLI: never one in the folder, the repository, its worktrees or a snapshot,
 * and never through a relative or empty entry. The current folder is not searched on Windows, because only the listed entries are (HOST-2).
 * Each entry and the executable are compared by real path, so a link, a junction, an 8.3 name or another case cannot pass a barred one off as
 * eligible; an entry or executable that does not resolve is dropped. So is one under any checkout of the repository that `barred` cannot name
 * (`inCheckout`). The result is the real path of the executable, the one that was vetted.
 */
async function findOnPath($: EngineInterface, name: string, path: string, { folders: barred, common }: Barred): Promise<string | undefined> {
  const file = process.platform === "win32" ? `${name}.exe` : name;
  for (const raw of path.split(process.platform === "win32" ? ";" : ":")) {
    const entry = raw.trim().replace(/^"(.*)"$/, "$1").replace(/[\\/]+$/, "");
    if (!entry || !isAbsolute(entry) || isBarred(entry, barred)) continue;
    const folder = await realPathOf($, entry);
    if (!folder || isBarred(folder, barred)) continue;
    const found = await realPathOf($, `${entry}${entry.includes("\\") ? "\\" : "/"}${file}`);
    if (!found || isBarred(found, barred)) continue;
    if (common && (await inCheckout($, entry, common) || await inCheckout($, folder, common) || await inCheckout($, parentOf(found), common))) continue;
    return found;
  }
  return undefined;
}

const parentOf = (path: string): string => path.replace(/[\\/][^\\/]*$/, "");

/** Whether `<checkout>/.git` leads into the repository whose common git folder is `common` (a `normal` real path). One that is there and cannot be followed counts. */
async function leadsTo($: EngineInterface, checkout: string, common: string): Promise<boolean> {
  let kind: string;
  try { kind = (await $.fs.stat(`${checkout}/.git`)).kind; } catch (error) { return !isMissing(error); }
  const named = kind === "directory" ? `${checkout}/.git` : await adminOf($, checkout);
  const real = named ? await realPathOf($, named) : undefined;
  return !real || normal(real) === common || normal(real).startsWith(`${common}/`);
}

/**
 * Whether a folder is in a checkout of this repository, or in the worktrees folder beside one, judged from the folder's side: each folder above it
 * is asked where its own `.git` leads. This finds a primary checkout that the common git folder keeps no record of, as with
 * `git init --separate-git-dir <elsewhere>/.git` (C9, reviews 35 and 45; C13).
 */
async function inCheckout($: EngineInterface, folder: string, common: string): Promise<boolean> {
  // Up to and including the drive root, `/` or a network share, which can be a checkout too.
  for (let dir = folder.replace(/\\/g, "/").replace(/\/+$/, "");; dir = parentOf(dir)) {
    if (await leadsTo($, dir, common)) return true;
    if (dir.endsWith("-worktrees") && await leadsTo($, dir.slice(0, -"-worktrees".length), common)) return true;
    if (parentOf(dir) === dir || /^\/\/[^/]+\/[^/]+$/.test(dir)) return false;
  }
}

/** Whether a host file call rejected because the path is not there. */
const isMissing = (error: unknown): boolean => {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return code === "ENOENT" || (code === undefined && /\bENOENT\b/.test(String(message)));
};

/** A barred folder's real path; `null` when it is not there (`stat` rejects `ENOENT`), `undefined` when it is there but cannot be resolved. */
async function rootIdentity($: EngineInterface, path: string): Promise<string | null | undefined> {
  let real: unknown;
  try { real = (await $.fs.stat(path, { resolve: true })).realPath; } catch (error) { return isMissing(error) ? null : undefined; }
  return typeof real === "string" && real !== "" ? real : undefined;
}

/** `path` taken from `base` as git takes a path in its own files (an absolute one stands alone), with `.` and `..` folded, in forward slashes. */
const joined = (base: string, path: string): string => {
  const own = path.trim();
  const text = (isAbsolute(own) || /^[\\/]{2}/.test(own) ? own : `${base}/${own}`).replace(/\\/g, "/");
  const lead = text.startsWith("//") ? "//" : text.startsWith("/") ? "/" : "";
  const parts: string[] = [];
  for (const part of text.slice(lead.length).split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") { if (parts.length && !/^[A-Za-z]:$/.test(parts[parts.length - 1]!)) parts.pop(); continue; }
    parts.push(part);
  }
  return lead + parts.join("/");
};

/** The first line of one of git's own files, after `prefix` (`gitdir: ` in a `.git` file), or `undefined` when it cannot be read or is empty. */
async function gitValue($: EngineInterface, path: string, prefix = ""): Promise<string | undefined> {
  try {
    const line = String(await $.fs.read(path)).split(/\r?\n/)[0] ?? "";
    return line.startsWith(prefix) && line.slice(prefix.length).trim() ? line.slice(prefix.length).trim() : undefined;
  } catch { return undefined; }
}

/** The admin folder a checkout's `.git` file names, read from `<checkout>/.git`; `null` when that checkout is gone, `undefined` when it names none. */
async function adminOf($: EngineInterface, checkout: string): Promise<string | null | undefined> {
  try { await $.fs.stat(`${checkout}/.git`); } catch (error) { return isMissing(error) ? null : undefined; }
  const own = await gitValue($, `${checkout}/.git`, "gitdir:");
  return own ? joined(checkout, own) : undefined;
}

/** Whether two paths land on the same real path; a path that leads nowhere matches nothing. */
async function sameReal($: EngineInterface, a: string, b: string): Promise<boolean> {
  const [x, y] = [await realPathOf($, a), await realPathOf($, b)];
  return !!x && !!y && normal(x) === normal(y);
}

/**
 * Whether the common git folder's config may move the primary checkout: `core.worktree` in `config` or `config.worktree`, or an included file
 * that could set it. One that cannot be read counts as moving it (C9, review 35).
 */
async function movable($: EngineInterface, common: string): Promise<boolean> {
  for (const name of ["config", "config.worktree"]) {
    let text: string;
    try { text = String(await $.fs.read(`${common}/${name}`)); } catch (error) { if (isMissing(error)) continue; return true; }
    if (/^\s*(?:worktree\s*=|\[\s*include)/im.test(text)) return true;
  }
  return false;
}

/**
 * A linked checkout's common git folder, when its registry agrees: `.git` names an admin folder directly in `<common>/worktrees`, whose
 * `commondir` leads to `<common>` and whose `gitdir` names this checkout back, and `<common>` is a folder named `.git` (C13). A common folder
 * under another name (a submodule's, a separated one's) is not verified, nor is an admin config that may move the work tree.
 */
async function linkedCommon($: EngineInterface, root: string): Promise<string | undefined> {
  const admin = await adminOf($, root);
  const shared = admin ? await gitValue($, `${admin}/commondir`) : undefined;
  if (!admin || !shared) return undefined;
  const common = joined(admin, shared);
  const back = await gitValue($, `${admin}/gitdir`);
  if (!/\/\.git$/.test(common) || !back || await movable($, admin)) return undefined;
  const agrees = await sameReal($, joined(admin, back), `${root}/.git`) && await sameReal($, parentOf(admin), `${common}/worktrees`);
  return agrees ? common : undefined;
}

/**
 * Every checkout of the repository that git's own files name, read before anything runs (HOST-2, CH-1; C9, reviews 21, 24, 35 and 45; C13): the
 * nearest checkout; from a linked one, the folder that holds the common `.git` folder; and each registered worktree
 * (`<common>/worktrees/<name>/gitdir`). Git keeps no record of the primary checkout, which a separated git folder can put elsewhere, so these
 * names alone do not bar it: `findOnPath` also asks each executable's own folders where their `.git` leads (`inCheckout`). A layout that cannot
 * be verified, or a config that may move the work tree, starts nothing. Each registered worktree whose checkout is there must name its own git
 * folder back; one whose checkout is gone is still barred.
 */
async function checkouts($: EngineInterface, root: string): Promise<{ folders: string[]; common?: string } | { refusal: string }> {
  const refusal = { refusal: `Shadow Army: the git worktrees of ${root} cannot be verified · nothing started` };
  const dotGit = `${root}/.git`;
  let kind: string;
  try { kind = (await $.fs.stat(dotGit)).kind; } catch (error) { return isMissing(error) ? { folders: [root] } : refusal; }
  const common = kind === "file" ? await linkedCommon($, root) : kind === "directory" ? joined(root, ".git") : undefined;
  const real = common ? await realPathOf($, common) : undefined;
  if (!common || !real || await movable($, common)) return refusal;
  const found = kind === "file" ? [root, parentOf(common)] : [root];
  // A linked checkout starts only when the registry itself lists it.
  let registered = kind !== "file";
  let names: string[] = [];
  try { names = (await $.fs.list(`${common}/worktrees`)).filter((entry) => entry.kind === "directory").map((entry) => entry.name); }
  catch (error) { if (!isMissing(error)) return refusal; }
  for (const name of names) {
    const entry = `${common}/worktrees/${name}`;
    const back = await gitValue($, `${entry}/gitdir`);
    if (!back) return refusal;
    const checkout = joined(entry, back).replace(/\/\.git$/, "");
    const named = await adminOf($, checkout);
    if (named === undefined || (named !== null && !await sameReal($, named, entry))) return refusal;
    registered ||= await sameReal($, `${checkout}/.git`, dotGit);
    found.push(checkout);
  }
  return registered ? { folders: found, common: normal(real) } : refusal;
}

/**
 * WSP-11's snapshot roots, outside the checkout and without a `.shadow` component (C10, reviews 21 and 24): the default `~/.shadow-army/snapshots`
 * and the folder `SHADOW_ARMY_SNAPSHOTS` names in the shell or in Claude Code's loaded settings. The host's precedence between the two is not
 * established, so both count. Without a home folder, or with a value that is not absolute, they cannot be known, and nothing starts.
 */
async function snapshotRoots($: EngineInterface, settings: Record<string, unknown>): Promise<string[] | { refusal: string }> {
  const home = process.platform === "win32" ? (await $.env.get("USERPROFILE")) || (await $.env.get("HOME")) : await $.env.get("HOME");
  if (!home || !isAbsolute(home)) return { refusal: "Shadow Army: the home folder, where snapshots go, is not known · nothing started" };
  const moved = [await $.env.get("SHADOW_ARMY_SNAPSHOTS"), settings.SHADOW_ARMY_SNAPSHOTS]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");
  if (moved.some((root) => !isAbsolute(root))) return { refusal: "Shadow Army: SHADOW_ARMY_SNAPSHOTS is not an absolute path · nothing started" };
  return [joined(home, ".shadow-army/snapshots"), ...moved];
}

/** The barred folders in `normal` form, and the repository's common git folder when there is one. */
interface Barred { folders: string[]; common?: string }

/**
 * The barred folders as compared: the working folder, every checkout of the repository (C9), the worktrees folder beside each checkout and the
 * snapshot roots (C10), each in its own spelling and by its own real path, so a link or junction on any of them is followed (C1). The working
 * folder and the nearest checkout must resolve; another may be absent, but one that is there and does not resolve stops the start.
 */
async function barredFolders($: EngineInterface, cwd: string, root: string, settings: Record<string, unknown>): Promise<Barred | { refusal: string }> {
  const refusal = (path: string) => ({ refusal: `Shadow Army: ${path} does not resolve to a real path · nothing started` });
  const [cwdReal, rootReal] = [await rootIdentity($, cwd), await rootIdentity($, root)];
  if (typeof cwdReal !== "string") return refusal(cwd);
  if (typeof rootReal !== "string") return refusal(root);
  const [layout, snapshots] = [await checkouts($, root), await snapshotRoots($, settings)];
  if ("refusal" in layout) return layout;
  if (!Array.isArray(snapshots)) return snapshots;
  const folders = [cwd, cwdReal];
  const add = async (paths: Iterable<string>): Promise<string | undefined> => {
    for (const path of new Set(paths)) {
      const real = await rootIdentity($, path);
      if (real === undefined) return path;
      folders.push(path, ...(real === null ? [] : [real]));
    }
    return undefined;
  };
  const unresolved = await add([root, rootReal, ...layout.folders])
    ?? await add(folders.slice(2).map((checkout) => `${checkout.replace(/[\\/]+$/, "")}-worktrees`))
    ?? await add(snapshots);
  return unresolved === undefined ? { folders: [...new Set(folders.map(normal))], common: layout.common } : refusal(unresolved);
}

/** Node.js's and git's absolute paths, found before either is run (HOST-2), or the line to show when one is missing. */
async function resolveTools($: EngineInterface, cwd: string, settings: Record<string, unknown>): Promise<{ node: string; git: string } | { refusal: string }> {
  const path = (await $.env.get("PATH")) ?? (await $.env.get("Path")) ?? "";
  const barred = await barredFolders($, cwd, await repoRoot($, cwd), settings);
  if ("refusal" in barred) return barred;
  const node = await findOnPath($, "node", path, barred);
  if (!node) return { refusal: "Shadow Army needs Node.js 22.0 or later on PATH; none was found" };
  const git = await findOnPath($, "git", path, barred);
  if (!git) return { refusal: "Shadow Army needs git 2.34 or later on PATH; none was found" };
  return { node, git };
}

const listsLoopback = (value: string): boolean => value.split(",").some((entry) => ["127.0.0.1", "*"].includes(entry.trim()));

/**
 * The line to show when the shell's and the settings' proxy variables would send the army's fetch through a proxy.
 * Both sources are read once, and the host's precedence between them is not established (P-16 tried one at a time), so a proxy in either counts
 * and the bypass counts only when every `NO_PROXY` and `no_proxy` value in either lists the loopback address.
 */
async function proxyRefusal($: EngineInterface, merged: Record<string, unknown>): Promise<string | undefined> {
  // `$.env.get` takes names spelled as literals, so each is written out.
  const shell: Record<string, string | undefined> = {
    HTTPS_PROXY: await $.env.get("HTTPS_PROXY"), https_proxy: await $.env.get("https_proxy"),
    HTTP_PROXY: await $.env.get("HTTP_PROXY"), http_proxy: await $.env.get("http_proxy"),
    NO_PROXY: await $.env.get("NO_PROXY"), no_proxy: await $.env.get("no_proxy"),
  };
  const values = (name: string): string[] => [shell[name], merged[name]].filter((value): value is string => typeof value === "string" && value.trim() !== "");
  const bypass = NO_PROXY_VARIABLES.flatMap(values);
  if (bypass.length && bypass.every(listsLoopback)) return undefined;
  for (const name of PROXY_VARIABLES) {
    if (values(name).length) return `Shadow Army: ${name} would send the army's commands through a proxy · add 127.0.0.1 to NO_PROXY · nothing started`;
  }
  return undefined;
}

/** HOST-2's preflight: the line to show when the army must not start, or `undefined` to go on. */
async function preflight($: EngineInterface, cwd: string, tools: { node: string; git: string }, settings: Record<string, unknown>): Promise<string | undefined> {
  const host = String(await $.session.version());
  const hostParts = /(\d+)\.(\d+)\.(\d+)/.exec(host)?.slice(1).map(Number);
  if (!hostParts || olderThan(hostParts, MIN_HOST)) return `Shadow Army needs Claude Code 2.1.294 or later; this is ${host}`;
  for (const [tool, name, least, pattern] of [
    ["node", "Node.js", [22, 0], /^v(\d+)\.(\d+)\.(\d+)/], ["git", "git", [2, 34], /^git version (\d+)\.(\d+)(?:\.(\d+))?/],
  ] as const) {
    const exe = tools[tool];
    const found = await versionOf($, exe, pattern, cwd);
    if (found === "late") return `${tool} --version gave no answer in 10 s · Shadow Army needs ${name} ${least.join(".")} or later on PATH; none was found`;
    if ("problem" in found) return `Shadow Army needs ${name} ${least.join(".")} or later on PATH; ${exe} --version ${found.problem}`;
    if (olderThan(found.version, [...least])) return `Shadow Army needs ${name} ${least.join(".")} or later on PATH; found ${found.version.join(".")}`;
  }
  // P-16: Claude Code sends the mod's fetch through a proxy named in these variables, the loopback address too.
  return proxyRefusal($, settings);
}

/**
 * The post office gave no `ready` in 60 s. The relay is not killed: a kill would orphan its post office. Its client
 * gave up at 30 s and closes the post office, waiting for its process to exit, and reports that exit before it ends; only
 * that report is the observed shutdown (C5). Without it, or if the relay has not ended in 30 s more, every start is refused.
 */
async function stalled($: EngineInterface, runtime: Runtime): Promise<void> {
  const step = runtime.step;
  const said = runtime.diagnostic.trim().split(/\r?\n/).pop();
  // Closing first keeps the relay's own end from being reported as a second failure; retiring holds the next start back.
  runtime.closing = true;
  retiring.add(runtime);
  if (active === runtime) active = undefined;
  // Only the relay's report of its post office's exit counts as the shutdown; a relay that ends or breaks without it does not.
  const own = (runtime.relay ?? Promise.resolve()).then(() => "ended" as const, () => runtime.officeExit ? "ended" as const : "failed" as const);
  let timer: Timer | undefined;
  const bound = new Promise<"late">((done) => { timer = $.clock.after(CLEANUP_WAIT_MS, () => done("late")); });
  const ended = await (runtime.cleanup ??= Promise.race([own, bound]).finally(() => timer?.cancel()));
  const why = ended === "failed" ? unseen(runtime) ?? "failed before it could close its post office" : `has not ended in ${CLEANUP_WAIT_MS / 1000} s`;
  if (ended !== "ended") {
    const mine = unconfirmedEnd = heldBack(runtime, why);
    void own.then((how) => { if (how === "ended" && unconfirmedEnd === mine) unconfirmedEnd = undefined; });
  }
  const how = ended === "ended" ? `relay saw its post office exit (${ending(runtime.officeExit)})` : ended === "failed" ? `relay ${why}; the army won't start again` : `relay has not ended in ${CLEANUP_WAIT_MS / 1000} s; the army won't start again until it does`;
  const line = `post office did not report ready within 60 s · step: ${step}${said ? ` · its relay said: ${said}` : ""} · ${how}`;
  $.ui.log(sanitize(prefixed(safeText(line, runtime.credential))));
  fail($, runtime, line);
  runtime.lift();
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
    await Promise.all([...retiring].map((old) => old.barrier));
    if (unconfirmedEnd) throw new Error(unconfirmedEnd);
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
    let lift!: () => void;
    const barrier = new Promise<void>((done) => { lift = done; });
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    runtime = {
      session, cwd, credential: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      closing: false, ready, accept, reject, diagnostic: "", barrier, lift,
      node: "", step: "checking Claude Code, Node.js, git and the proxy settings", reached: false,
    };
    active = runtime;
    const owned = runtime;
    // HOST-2: two uses at once share this one start and its refusal; `active` is set before the first wait.
    // `finished` also waits for the relay's end to be confirmed, so a restart never overlaps a start still being cleaned up.
    owned.finished = (async () => {
      // Both executables are found, by absolute path, before either is run; the relay then starts with this same Node.js.
      // Claude Code's loaded settings, read once per start: the snapshot roots (WSP-11, C10) and the proxy check (P-16) both use them.
      const settings = (await $.settings.read() as { env?: Record<string, unknown> } | undefined)?.env ?? {};
      const tools = await resolveTools($, cwd, settings);
      if ("refusal" in tools) throw new Error(tools.refusal);
      if (!checked) {
        const refusal = await preflight($, cwd, tools, settings);
        if (refusal) throw new Error(refusal);
        checked = true;
      }
      owned.node = tools.node;
      owned.deadline = $.clock.after(READY_WAIT_MS, () => { void stalled($, owned); });
      await (owned.relay = consume($, owned));
    })().catch((error) => fail($, owned, error instanceof Error ? error.message : error))
      .then(() => owned.cleanup)
      .finally(() => { retiring.delete(owned); owned.lift(); });
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
  const opened = await post($, runtime, { action: "open", soldier: soldier.key, claims }) as { session?: string };
  const delivery = await post($, runtime, { action: "send", soldier: soldier.key, text: brief, claims }) as Delivery;
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
