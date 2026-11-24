import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

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

/** Append-only JSONL files in the supplied .shadow/v2/logs directory. */
export class SessionLogs {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly secrets: string[];

  constructor(private readonly directory: string, secrets: string[]) {
    this.secrets = [...secrets];
  }

  async write(name: string, data: unknown): Promise<void> {
    // Names are identifiers, never paths or raw user/model text. Reject Windows devices too.
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
      || redact(name, this.secrets) !== name) {
      throw new Error("invalid session log name");
    }
    const line = JSON.stringify(redact(data, this.secrets));
    if (line === undefined) throw new Error("session log record is not JSON data");
    const previous = this.pending.get(name) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true });
      await appendFile(join(this.directory, `${name}.jsonl`), `${line}\n`, { encoding: "utf8", mode: 0o600 });
    });
    this.pending.set(name, next);
    try {
      await next;
    } finally {
      if (this.pending.get(name) === next) this.pending.delete(name);
    }
  }
}
