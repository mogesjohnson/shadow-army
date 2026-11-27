import { appendFile, mkdir, open, type FileHandle } from "node:fs/promises";
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

export interface SessionLogsOptions {
  /** Called once when a gap opens in a log: its first line lost after a failed retry. The post office reports it. */
  onFailure?: (failure: { name: string; error: Error }) => void;
  /** Called when a later line is written and so closes the gap `onFailure` reported (C22). */
  onRecovered?: (name: string) => void;
  /** Delay before the one retry; PO-5 says 100 ms. */
  retryDelayMs?: number;
  /**
   * Appends text to a log file; with `flush`, returns only once it is on disk. Tests replace it to inject faults.
   * It throws {@link UnflushedAppend} when the whole text is in the file but the flush failed: the retry then flushes only.
   */
  append?: (path: string, text: string, flush: boolean) => Promise<void>;
  /** Flushes a log file already holding its text (the retry after {@link UnflushedAppend}). */
  flush?: (path: string) => Promise<void>;
}

/** The text is in the file whole; only its flush to disk failed. A retry must not append it again (C21). */
export class UnflushedAppend extends Error {
  constructor(readonly cause: Error) { super(cause.message); this.name = "UnflushedAppend"; }
}

/** Opens a file or folder, runs `use` on it, syncs it to disk and closes it. */
async function synced(path: string, flags: string, use?: (handle: FileHandle) => Promise<void>): Promise<void> {
  const handle = await open(path, flags, 0o600);
  try {
    await use?.(handle);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

const defaultFlush = async (path: string): Promise<void> => {
  await synced(path, "a");
  // A new file's entry is durable only once its folder is synced too. Windows can't open a folder for that.
  if (process.platform !== "win32") await synced(dirname(path), "r");
};

const defaultAppend = async (path: string, text: string, flush: boolean): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  if (!flush) return appendFile(path, text, { encoding: "utf8", mode: 0o600 });
  await appendFile(path, text, { encoding: "utf8", mode: 0o600 });
  try { await defaultFlush(path); } catch (error) {
    throw new UnflushedAppend(error instanceof Error ? error : new Error(String(error)));
  }
};

/** PO-5: the line that opens a turn is written and flushed before its message goes in. */
const opensTurn = (data: unknown): boolean => (data as { type?: unknown } | null)?.type === "turn_started";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Append-only JSONL files in the supplied .shadow/v2/logs directory (PO-5).
 * A log never stops a soldier: a failed write is retried once, 100 ms later; if that fails too,
 * `write` resolves with `written: false`, later writes try again, and the first line written
 * after the gap is preceded by a `log-gap` line that counts the lines lost. When the lost line is a turn's
 * opening row that reached the file but could not be flushed (its send was refused), the next `log-gap`
 * line says `refused: true` and counts that row among the lost, so recovery never takes it for a turn in
 * flight (C21). The retry after such a flush only flushes again; it never appends the row twice.
 */
export class SessionLogs {
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly secrets: string[];
  private readonly lost = new Map<string, number>();
  private readonly cut = new Set<string>();
  /** Logs whose last line is a turn's opening row that is in the file but was reported not written. */
  private readonly refusedOpening = new Set<string>();
  private readonly fragments = new Map<string, Map<string, string[]>>();
  private readonly append: (path: string, text: string, flush: boolean) => Promise<void>;
  private readonly flush: (path: string) => Promise<void>;
  private readonly retryDelayMs: number;

  constructor(private readonly directory: string, secrets: string[], private readonly options: SessionLogsOptions = {}) {
    this.secrets = [...secrets];
    this.append = options.append ?? defaultAppend;
    this.flush = options.flush ?? defaultFlush;
    this.retryDelayMs = options.retryDelayMs ?? 100;
  }

  async write(name: string, data: unknown): Promise<LogWriteResult> {
    this.assertName(name);
    const line = JSON.stringify(redact(data, this.secrets));
    if (line === undefined) throw new Error("session log record is not JSON data");
    const flush = opensTurn(data);
    return this.enqueue(name, () => this.tryWrite(name, line, flush));
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

  private enqueue(name: string, task: () => Promise<LogWriteResult>): Promise<LogWriteResult> {
    // Each write runs whatever the one before it did, and the cleanup never rejects.
    const next = (this.pending.get(name) ?? Promise.resolve()).then(task, task);
    this.pending.set(name, next);
    const forget = (): void => { if (this.pending.get(name) === next) this.pending.delete(name); };
    next.then(forget, forget);
    return next;
  }

  private async tryWrite(name: string, line: string, flush: boolean): Promise<LogWriteResult> {
    const lost = this.lost.get(name) ?? 0;
    const refused = this.refusedOpening.has(name);
    const gap = lost > 0 ? `${JSON.stringify({ type: "log-gap", lost, ...(refused ? { refused: true } : {}), time: new Date().toISOString() })}\n` : "";
    const path = join(this.directory, `${name}.jsonl`);
    let error: Error | undefined;
    let appended = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(this.retryDelayMs);
      try {
        // C21: text already in the file whole is flushed again, never appended twice.
        if (appended) await this.flush(path);
        // Built for each try: a line cut short by a failed try (or write) is ended before this one.
        else await this.append(path, `${this.cut.has(name) ? "\n" : ""}${gap}${line}\n`, flush);
        this.lost.delete(name);
        this.cut.delete(name);
        this.refusedOpening.delete(name);
        // C22: the gap this line closes is over, whatever later lines do.
        if (lost > 0) try { this.options.onRecovered?.(name); } catch { /* the caller's own failure */ }
        return { written: true };
      } catch (caught) {
        if (caught instanceof UnflushedAppend) {
          appended = true;
          error = caught.cause;
        } else {
          error = caught instanceof Error ? caught : new Error(String(caught));
          if (!appended) this.cut.add(name);
        }
      }
    }
    if (appended) {
      // The text, any gap line included, is in the file whole: the next gap line follows it and counts only it.
      this.cut.delete(name);
      this.refusedOpening.add(name);
      this.lost.set(name, 1);
      // An earlier gap's line went in with it, so that gap is over and this one is new (C22).
      if (lost > 0) try { this.options.onRecovered?.(name); } catch { /* the caller's own failure */ }
    } else this.lost.set(name, lost + 1);
    if (lost === 0 || appended) {
      // The notice belongs to the caller; a notice that throws must not stop this log's queue.
      try { this.options.onFailure?.({ name, error: error! }); } catch { /* the caller's own failure */ }
    }
    return { written: false, error };
  }
}
