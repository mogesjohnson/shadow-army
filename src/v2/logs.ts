import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const REDACTED = "[REDACTED]";
const SECRET_KEYS = new Set([
  "secret", "secrets", "credential", "credentials", "password", "passwd", "apikey",
  "token", "accesstoken", "refreshtoken", "authorization", "cookie", "setcookie", "privatekey",
]);

const isSecretKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return SECRET_KEYS.has(normalized) || /(?:apikey|password|secret|credential|credentials|accesstoken|refreshtoken|privatekey)$/.test(normalized);
};

/** Every log value passes this boundary, including native errors, tool output and object keys. */
export function redact(data: unknown, secrets: readonly string[] = []): unknown {
  const known = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length);
  const cleanString = (text: string): string => {
    for (const secret of known) {
      // The credential represents bytes: uppercase/mixed-case hex authenticates identically.
      // Other configured secrets keep their case-sensitive semantics.
      text = /^[a-f0-9]{64}$/i.test(secret)
        ? text.replace(new RegExp(secret, "gi"), REDACTED)
        : text.replaceAll(secret, REDACTED);
    }
    return text
      .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED)
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
      .replace(/\b(?:sk-(?:ant-)?|gh[pousr]_)[A-Za-z0-9_-]{12,}/g, REDACTED)
      .replace(/\b((?:[A-Z][A-Z0-9]*[_-])?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential|authorization)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, `$1${REDACTED}`);
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
      return Object.fromEntries(Object.entries(source).map(([key, entry]) => [
        cleanString(key), isSecretKey(key) ? REDACTED : visit(entry),
      ]));
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
