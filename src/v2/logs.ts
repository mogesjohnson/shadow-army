import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

/** WSP-8's marker, in logs and in forwarded events alike. */
export const REDACTED = "[redacted]";

const SECRET_KEYS = new Set([
  "secret", "secrets", "credential", "credentials", "password", "passwd", "apikey",
  "token", "accesstoken", "refreshtoken", "authorization", "proxyauthorization", "cookie", "setcookie", "privatekey",
]);

const NAME_SUFFIX = /(?:key|token|secret|password|credential)$/i;
const VALUE_RULE = /^[^\s"',;}]{8,}$/;

const isSecretKey = (key: string): boolean => SECRET_KEYS.has(key.toLowerCase().replace(/[_-]/g, ""));

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The spellings of one secret that Shadow Army writes: raw, hex, base64, base64url, percent and JSON escaped. */
function spellings(secret: string): string[] {
  const bytes = Buffer.from(secret, "utf8");
  return [
    secret,
    bytes.toString("hex"),
    bytes.toString("base64"),
    bytes.toString("base64url"),
    bytes.toString("base64").replace(/=+$/, ""),
    encodeURIComponent(secret),
    JSON.stringify(secret).slice(1, -1),
  ].filter(Boolean);
}

function secretMatcher(secrets: readonly string[]): RegExp | undefined {
  const all = new Set(secrets.filter(Boolean).flatMap(spellings));
  if (all.size === 0) return undefined;
  // Longest first, so a spelling that holds another is matched whole. Any letter case (SEC-4).
  return new RegExp([...all].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"), "gi");
}

const NOT_IN_WORD = "(?<![A-Za-z0-9_])";
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|[\s\S]*$)/g;
const URL_PASSWORD = new RegExp(`${NOT_IN_WORD}([A-Za-z][A-Za-z0-9+.-]*://[^\\s/?#:@"']*:)[^/?#\\s"']*@`, "g");
// The name, its own quote (escaped to any depth, as in JSON inside JSON) and the separator.
const AUTHORIZATION = new RegExp(`${NOT_IN_WORD}(?:proxy-)?authorization(?:\\\\*["'])?[ \\t]*[=:][ \\t]*`, "gi");
const OPENING_QUOTE = /^\\*["']/;

/** Where a quote as deep as `quote` closes the value on its line, or -1. An inner quote carries more backslashes. */
function closingQuote(text: string, from: number, quote: string): number {
  const lineEnd = text.slice(from).search(/[\r\n]/);
  const limit = lineEnd === -1 ? text.length : from + lineEnd;
  const mark = quote.at(-1)!;
  for (let at = text.indexOf(mark, from); at !== -1 && at < limit; at = text.indexOf(mark, at + 1)) {
    let slashes = 0;
    while (at - slashes - 1 >= from && text[at - slashes - 1] === "\\") slashes++;
    if (slashes === quote.length - 1) return at - slashes;
  }
  return -1;
}

/** The whole Authorization value (WSP-8): a quoted one to its own closing quote, any other to the end of its line. */
function redactAuthorization(text: string): string {
  let out = "";
  let done = 0;
  for (const match of text.matchAll(AUTHORIZATION)) {
    if (match.index < done) continue;
    const start = match.index + match[0].length;
    const quote = OPENING_QUOTE.exec(text.slice(start))?.[0];
    const close = quote ? closingQuote(text, start + quote.length, quote) : -1;
    const lineEnd = text.slice(start).search(/[\r\n]/);
    out += text.slice(done, start) + (close !== -1 ? `${quote}${REDACTED}${quote}` : REDACTED);
    done = close !== -1 ? close + quote!.length : lineEnd === -1 ? text.length : start + lineEnd;
  }
  return out + text.slice(done);
}
const BEARER = new RegExp(`${NOT_IN_WORD}Bearer[ \\t]+[A-Za-z0-9._~+/=-]+`, "gi");
const PREFIXED_KEY = new RegExp(`${NOT_IN_WORD}(?:sk-(?:ant-)?|gh[pousr]_)[A-Za-z0-9_-]{12,}`, "g");
const NAMED_VALUE = new RegExp(`${NOT_IN_WORD}([A-Za-z0-9_-]*(?:key|token|secret|password|credential)["']?[ \\t]*[=:][ \\t]*["']?)[^\\s"',;}]{8,}`, "gi");

/** Every log value passes this boundary, including native errors, tool output and object keys. */
export function redact(data: unknown, secrets: readonly string[] = []): unknown {
  const known = secretMatcher(secrets);
  const cleanString = (text: string): string => {
    if (known) text = text.replace(known, REDACTED);
    const patterned = redactAuthorization(text
      .replace(PRIVATE_KEY_BLOCK, REDACTED)
      .replace(URL_PASSWORD, `$1${REDACTED}@`))
      .replace(BEARER, `Bearer ${REDACTED}`)
      .replace(PREFIXED_KEY, REDACTED)
      .replace(NAMED_VALUE, `$1${REDACTED}`);
    // Text that is JSON is also redacted as structure; when that finds more, the structure is kept (compacted).
    if (!/^\s*[[{]/.test(patterned)) return patterned;
    try {
      const parsed: unknown = JSON.parse(patterned);
      const safe = JSON.stringify(visit(parsed));
      return safe === JSON.stringify(parsed) ? patterned : safe;
    } catch {
      return patterned;
    }
  };
  const seen = new WeakSet<object>();
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") return cleanString(value);
    if (typeof value === "bigint") return value.toString();
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Date) return value.toISOString();
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    try {
      if (Array.isArray(value)) return value.map(visit);
      const source = value instanceof Error
        ? { ...value, name: value.name, message: value.message, stack: value.stack }
        : value;
      return Object.fromEntries(Object.entries(source).map(([key, entry]) => {
        const secretEntry = isSecretKey(key)
          || (NAME_SUFFIX.test(key) && typeof entry === "string" && VALUE_RULE.test(entry));
        return [cleanString(key), secretEntry ? REDACTED : visit(entry)];
      }));
    } finally {
      seen.delete(value);
    }
  };
  return visit(data);
}

export interface LogWriteResult {
  /** False when the line (and any gap line before it) could not be written, even after the retry. */
  written: boolean;
  error?: Error;
}

/** One handle on a log file: a turn's opening is written and synced through it, never through a reopened path (C24). */
export interface OpeningFile {
  write(text: string): Promise<void>;
  /** Returns only once everything written through this handle is on disk. */
  sync(): Promise<void>;
  /** Whether `path` still names the file this handle holds: a moved or replaced file is not the session's log. */
  isAt(path: string): Promise<boolean>;
  close(): Promise<void>;
}

export interface SessionLogsOptions {
  /** Called once when a gap opens in a log: its first line lost after a failed retry. The post office reports it.
   * `type` is the lost record's own `type` (C30), so only a lost turn opening or `opened` record is treated as one. */
  onFailure?: (failure: { name: string; error: Error; type?: string }) => void;
  /** Called when a later line is written and so closes the gap `onFailure` reported (C22). */
  onRecovered?: (name: string) => void;
  /** Delay before the one retry; PO-5 says 100 ms. */
  retryDelayMs?: number;
  /** Appends an ordinary line to a log file. Tests replace it to inject faults. */
  append?: (path: string, text: string) => Promise<void>;
  /** Opens a log file for a turn's opening. Tests replace it to inject faults. */
  openFile?: (path: string) => Promise<OpeningFile>;
}

async function syncFolder(path: string): Promise<void> {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

const defaultOpenFile = async (path: string): Promise<OpeningFile> => {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "a", 0o600);
  // A new file's entry is durable only once its folder is synced too. Windows can't open a folder for that.
  let entrySynced = process.platform === "win32";
  return {
    write: (text) => handle.appendFile(text, { encoding: "utf8" }),
    sync: async () => {
      await handle.sync();
      if (!entrySynced) { await syncFolder(dirname(path)); entrySynced = true; }
    },
    isAt: async (at) => {
      const [held, named] = await Promise.all([handle.stat({ bigint: true }), stat(at, { bigint: true }).catch(() => undefined)]);
      return !!named && held.ino === named.ino && held.dev === named.dev;
    },
    close: () => handle.close(),
  };
};

const defaultAppend = async (path: string, text: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, text, { encoding: "utf8", mode: 0o600 });
};

/** PO-5: the line that opens a turn is on disk, and confirmed there, before its message goes in. */
const opensTurn = (data: unknown): boolean => (data as { type?: unknown } | null)?.type === "turn_started";
const CONFIRMED = "turn_confirmed";
const REFUSED = "turn_refused";
/** The post office's own notice of a lost line (PO-5): the one record whose loss is never reported by a notice of its own. */
const NOTICE = "log_failed";
const moved = (name: string): Error => new Error(`the log ${name} was moved or replaced while a turn's opening was written`);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const asError = (caught: unknown): Error => caught instanceof Error ? caught : new Error(String(caught));

/**
 * Recovery's reading of one log (PO-1, PO-5), from the file alone: the `opening` ids of `turn_started` rows that a
 * `turn_confirmed` row follows and no later `turn_refused` row names. Any other `turn_started` row is a send that
 * was refused, so its message never went in (C25).
 */
export function confirmedOpenings(text: string): Set<string> {
  const rows = new Set<string>();
  const confirmed = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    let row: { type?: unknown; opening?: unknown; openings?: unknown } | null;
    try { row = JSON.parse(line) as typeof row; } catch { continue; }
    if (typeof row?.opening === "string" && row.type === "turn_started") rows.add(row.opening);
    if (typeof row?.opening === "string" && row.type === CONFIRMED && rows.has(row.opening)) confirmed.add(row.opening);
    if (row?.type === REFUSED && Array.isArray(row.openings)) for (const id of row.openings) confirmed.delete(id);
  }
  return confirmed;
}

/**
 * Append-only JSONL files in the supplied .shadow/v2/logs directory (PO-5).
 * A log never stops a soldier: a failed write is retried once, 100 ms later; if that fails too,
 * `write` resolves with `written: false`, later writes try again, and the first line written
 * after the gap is preceded by a `log-gap` line that counts the lines lost. A gap line not yet followed by a
 * written line is written again with the same `gap` id; a reader keeps the last line of each gap.
 * Only what is on disk counts: a turn's opening row carries an `opening` id, and the message may go in only once
 * that row and then a `turn_confirmed` row naming it were each synced through the one handle on the file the log's
 * path still names (C24). A try whose sync fails is never synced again: the retry writes a new row with a new id.
 * A `turn_refused` row naming the failed try follows on the same handle (C27); when that row cannot be synced either,
 * the next line written is preceded by one. So recovery tells a refused opening from a turn in flight by the file
 * alone ({@link confirmedOpenings}, C25). The one case the file cannot settle: the disk refuses
 * every write after a confirmation lands and the process ends before another line of that log is written.
 */
export class SessionLogs {
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly secrets: string[];
  /** Logs with a gap: its id, the lines lost in it, and whether only `log_failed` records have been lost in it so far (C32). */
  private readonly gaps = new Map<string, { id: string; lost: number; onlyNotices: boolean }>();
  /** Opening ids whose rows may be in a log although their send was refused; the next line written names them. */
  private readonly refused = new Map<string, string[]>();
  private readonly cut = new Set<string>();
  private readonly fragments = new Map<string, Map<string, string[]>>();
  private readonly append: (path: string, text: string) => Promise<void>;
  private readonly openFile: (path: string) => Promise<OpeningFile>;
  private readonly retryDelayMs: number;

  constructor(private readonly directory: string, secrets: string[], private readonly options: SessionLogsOptions = {}) {
    this.secrets = [...secrets];
    this.append = options.append ?? defaultAppend;
    this.openFile = options.openFile ?? defaultOpenFile;
    this.retryDelayMs = options.retryDelayMs ?? 100;
  }

  async write(name: string, data: unknown): Promise<LogWriteResult> {
    this.assertName(name);
    const safe = redact(data, this.secrets);
    const line = JSON.stringify(safe);
    if (line === undefined) throw new Error("session log record is not JSON data");
    if (opensTurn(data)) return this.enqueue(name, () => this.tryOpening(name, safe as Record<string, unknown>));
    const type = (safe as { type?: unknown } | null)?.type;
    return this.enqueue(name, () => this.tryWrite(name, line, typeof type === "string" ? type : undefined));
  }

  /** Holds one streamed fragment of a message. Nothing is written until the message ends. */
  fragment(name: string, key: string, text: string): void {
    this.assertName(name);
    const open = this.fragments.get(name) ?? new Map<string, string[]>();
    open.set(key, [...(open.get(key) ?? []), text]);
    this.fragments.set(name, open);
  }

  /** Ends a message: its fragments are joined, redacted as one text, and written whole as `text`. No fragments, no line. */
  async endMessage(name: string, key: string, record: Record<string, unknown> = {}): Promise<LogWriteResult> {
    this.assertName(name);
    const parts = this.fragments.get(name)?.get(key);
    if (!parts) return { written: true };
    this.fragments.get(name)?.delete(key);
    return this.write(name, { ...record, text: parts.join("") });
  }

  private assertName(name: string): void {
    // Names are identifiers, never paths or raw user/model text. Reject Windows devices too.
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
      || redact(name, this.secrets) !== name) {
      throw new Error("invalid session log name");
    }
  }

  private enqueue<T>(name: string, task: () => Promise<T>): Promise<T> {
    // Each write runs whatever the one before it did, and the cleanup never rejects.
    const next = (this.pending.get(name) ?? Promise.resolve()).then(task, task);
    this.pending.set(name, next);
    const forget = (): void => { if (this.pending.get(name) === next) this.pending.delete(name); };
    next.then(forget, forget);
    return next;
  }

  /** What goes before the next line: the end of a line cut short, refused openings, and the open gap. */
  private prefix(name: string, refused: readonly string[] = []): string {
    const time = new Date().toISOString();
    const openings = [...(this.refused.get(name) ?? []), ...refused];
    const gap = this.gaps.get(name);
    return `${this.cut.has(name) ? "\n" : ""}${openings.length ? `${JSON.stringify({ type: REFUSED, openings, time })}\n` : ""}${
      gap ? `${JSON.stringify({ type: "log-gap", gap: gap.id, lost: gap.lost, time })}\n` : ""}`;
  }

  /** The line and its prefix are on disk: the gap before it is over (C22), whatever later lines do. */
  private written(name: string): LogWriteResult {
    const had = this.gaps.delete(name);
    this.cut.delete(name);
    this.refused.delete(name);
    if (had) try { this.options.onRecovered?.(name); } catch { /* the caller's own failure */ }
    return { written: true };
  }

  /** The line is lost after its retry: it is counted, and a new gap is reported once, right now (PO-5, C26). */
  private lost(name: string, error: Error, type: string | undefined): LogWriteResult {
    const gap = this.gaps.get(name);
    const notice = type === NOTICE;
    // C32: a gap only `log_failed` records have been lost in was never reported (the caller keeps a lost notice from
    // recursing), so the first other line lost in it is reported as the gap's notice, whichever failed first.
    if (gap) { gap.lost++; if (!gap.onlyNotices || notice) return { written: false, error }; gap.onlyNotices = false; }
    else this.gaps.set(name, { id: randomUUID(), lost: 1, onlyNotices: notice });
    // The notice belongs to the caller; a notice that throws must not stop this log's queue.
    try { this.options.onFailure?.({ name, error, ...(type ? { type } : {}) }); } catch { /* the caller's own failure */ }
    return { written: false, error };
  }

  private async tryWrite(name: string, line: string, type: string | undefined): Promise<LogWriteResult> {
    const path = join(this.directory, `${name}.jsonl`);
    let error: Error | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(this.retryDelayMs);
      try {
        // Built for each try: a line cut short by a failed try (or write) is ended before this one.
        await this.append(path, `${this.prefix(name)}${line}\n`);
        return this.written(name);
      } catch (caught) {
        error = asError(caught);
        this.cut.add(name);
      }
    }
    return this.lost(name, error!, type);
  }

  /** PO-5 (C24, C25): see the class comment. Each try has its own handle, its own `opening` id, and two syncs. */
  private async tryOpening(name: string, record: Record<string, unknown>): Promise<LogWriteResult> {
    const path = join(this.directory, `${name}.jsonl`);
    const refused: string[] = [];
    let error: Error | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(this.retryDelayMs);
      const opening = randomUUID();
      let file: OpeningFile | undefined;
      let wrote = false;
      let ended = true;
      try {
        file = await this.openFile(path);
        const prefix = this.prefix(name, refused);
        wrote = true;
        ended = false;
        await file.write(`${prefix}${JSON.stringify({ ...record, opening })}\n`);
        ended = true;
        await file.sync();
        // Checked before the confirmation too, so a moved file seldom gets one.
        if (!(await file.isAt(path))) throw moved(name);
        ended = false;
        await file.write(`${JSON.stringify({ type: CONFIRMED, opening, time: new Date().toISOString() })}\n`);
        ended = true;
        await file.sync();
        if (!(await file.isAt(path))) throw moved(name);
        return this.written(name);
      } catch (caught) {
        error = asError(caught);
        // C27: anything this try wrote may be in the file, confirmation included, so a refusal follows on the same
        // handle. Only when that row is not synced where the path points is the id also carried to the next line.
        if (wrote && !(await this.rowOn(file!, path, { type: REFUSED, openings: [opening] }, ended))) { refused.push(opening); this.cut.add(name); }
      } finally {
        await file?.close().catch(() => {});
      }
    }
    if (refused.length) this.refused.set(name, [...(this.refused.get(name) ?? []), ...refused]);
    return this.lost(name, error!, "turn_started");
  }

  /** Writes and syncs one row through `file`: true only when it is on disk in the file the path still names. */
  private async rowOn(file: OpeningFile, path: string, row: Record<string, unknown>, ended = true): Promise<boolean> {
    try {
      await file.write(`${ended ? "" : "\n"}${JSON.stringify({ ...row, time: new Date().toISOString() })}\n`);
      await file.sync();
      return await file.isAt(path);
    } catch {
      return false;
    }
  }

}
