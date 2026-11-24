import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export const REDACTED = "[REDACTED]";

const SECRET_KEYS = new Set([
  "secret", "secrets", "credential", "credentials", "password", "passwd", "apikey",
  "token", "accesstoken", "refreshtoken", "authorization", "cookie", "setcookie", "privatekey",
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
const AUTHORIZATION = new RegExp(`${NOT_IN_WORD}(authorization["']?[ \\t]*[=:][ \\t]*["']?)[^\\r\\n"']+`, "gi");
const BEARER = new RegExp(`${NOT_IN_WORD}Bearer[ \\t]+[A-Za-z0-9._~+/=-]+`, "gi");
const PREFIXED_KEY = new RegExp(`${NOT_IN_WORD}(?:sk-(?:ant-)?|gh[pousr]_)[A-Za-z0-9_-]{12,}`, "g");
const NAMED_VALUE = new RegExp(`${NOT_IN_WORD}([A-Za-z0-9_-]*(?:key|token|secret|password|credential)["']?[ \\t]*[=:][ \\t]*["']?)[^\\s"',;}]{8,}`, "gi");

/** Every log value passes this boundary, including native errors, tool output and object keys. */
export function redact(data: unknown, secrets: readonly string[] = []): unknown {
  const known = secretMatcher(secrets);
  const cleanString = (text: string): string => {
    if (known) text = text.replace(known, REDACTED);
    return text
      .replace(PRIVATE_KEY_BLOCK, REDACTED)
      .replace(URL_PASSWORD, `$1${REDACTED}@`)
      .replace(AUTHORIZATION, `$1${REDACTED}`)
      .replace(BEARER, `Bearer ${REDACTED}`)
      .replace(PREFIXED_KEY, REDACTED)
      .replace(NAMED_VALUE, `$1${REDACTED}`);
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
  /** Delay before the one retry; PO-5 says 100 ms. */
  retryDelayMs?: number;
  /** Appends text to a log file. Tests replace it to inject faults. */
  append?: (path: string, text: string) => Promise<void>;
}

const defaultAppend = async (path: string, text: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, text, { encoding: "utf8", mode: 0o600 });
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Append-only JSONL files in the supplied .shadow/v2/logs directory (PO-5).
 * A log never stops a soldier: a failed write is retried once, 100 ms later; if that fails too,
 * `write` resolves with `written: false`, later writes try again, and the first line written
 * after the gap is preceded by a `log-gap` line that counts the lines lost.
 */
export class SessionLogs {
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly secrets: string[];
  private readonly lost = new Map<string, number>();
  private readonly cut = new Set<string>();
  private readonly fragments = new Map<string, Map<string, string[]>>();
  private readonly append: (path: string, text: string) => Promise<void>;
  private readonly retryDelayMs: number;

  constructor(private readonly directory: string, secrets: string[], private readonly options: SessionLogsOptions = {}) {
    this.secrets = [...secrets];
    this.append = options.append ?? defaultAppend;
    this.retryDelayMs = options.retryDelayMs ?? 100;
  }

  async write(name: string, data: unknown): Promise<LogWriteResult> {
    this.assertName(name);
    const line = JSON.stringify(redact(data, this.secrets));
    if (line === undefined) throw new Error("session log record is not JSON data");
    return this.enqueue(name, () => this.tryWrite(name, line));
  }

  /** Holds one streamed fragment of a message. Nothing is written until the message ends. */
  fragment(name: string, key: string, text: string): void {
    this.assertName(name);
    const open = this.fragments.get(name) ?? new Map<string, string[]>();
    open.set(key, [...(open.get(key) ?? []), text]);
    this.fragments.set(name, open);
  }

  /** Ends a message: its fragments are joined, redacted as one text, and written whole as `text`. */
  async endMessage(name: string, key: string, record: Record<string, unknown> = {}): Promise<LogWriteResult> {
    this.assertName(name);
    const parts = this.fragments.get(name)?.get(key) ?? [];
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
    const next = (this.pending.get(name) ?? Promise.resolve()).then(task);
    this.pending.set(name, next);
    void next.finally(() => { if (this.pending.get(name) === next) this.pending.delete(name); });
    return next;
  }

  private async tryWrite(name: string, line: string): Promise<LogWriteResult> {
    const lost = this.lost.get(name) ?? 0;
    const gap = lost > 0 ? `${JSON.stringify({ type: "log-gap", lost, time: new Date().toISOString() })}\n` : "";
    // A line cut short by a failed write is ended before the next one.
    const text = `${this.cut.has(name) ? "\n" : ""}${gap}${line}\n`;
    const path = join(this.directory, `${name}.jsonl`);
    let error: Error | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(this.retryDelayMs);
      try {
        await this.append(path, text);
        this.lost.delete(name);
        this.cut.delete(name);
        return { written: true };
      } catch (caught) {
        error = caught instanceof Error ? caught : new Error(String(caught));
        this.cut.add(name);
      }
    }
    this.lost.set(name, lost + 1);
    if (lost === 0) this.options.onFailure?.({ name, error: error! });
    return { written: false, error };
  }
}
