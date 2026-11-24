import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { redact, REDACTED, SessionLogs } from "./logs.js";

const dirs: string[] = [];
async function directory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "shadow-v2-logs-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("redaction", () => {
  it("removes known secrets from nested values, errors and object keys, without changing usage", () => {
    const secret = "private-monarch-credential";
    const data = { [secret]: [secret, { text: `error ${secret}`, error: new Error(secret) }],
      usage: { inputTokens: 1400, cache_read_input_tokens: 900, output_tokens: 40 } };
    const safe = redact(data, [secret]);
    expect(JSON.stringify(safe)).not.toContain(secret);
    expect(safe).toMatchObject({ usage: data.usage });
    expect(data[secret][0]).toBe(secret);
  });

  it("redacts common secret fields and plaintext credentials", () => {
    const safe = JSON.stringify(redact({ api_key: "unknown-key", authorization: "other", nested: { refreshToken: "refresh", ANTHROPIC_API_KEY: "opaque-key", client_secret: "client-private" },
      text: "Bearer aaa.bbb.ccc password=abcdefgh1 API_KEY='xyz-long-value' OPENAI_API_KEY=another-opaque-key ghp_1234567890123456 sk-ant-1234567890123456" }));
    for (const secret of ["unknown-key", "opaque-key", "client-private", "aaa.bbb.ccc", "abcdefgh1", "xyz-long-value", "ghp_1234567890123456", "sk-ant-1234567890123456", '"refresh"']) {
      expect(safe).not.toContain(secret);
    }
    expect(safe).toContain("[REDACTED]");
  });

  it("handles cycles and repeated references without omitting secrets", () => {
    const child = { text: "private" };
    const cycle: Record<string, unknown> = { a: child, b: child };
    cycle.self = cycle;
    expect(redact(cycle, ["private"])).toEqual({ a: { text: "[REDACTED]" }, b: { text: "[REDACTED]" }, self: "[Circular]" });
  });

  it("removes every hex case spelling of a known 32-byte credential from output and errors", () => {
    const hex = "abcdef0123456789".repeat(4);
    const upper = hex.toUpperCase();
    const mixed = [...hex].map((char, index) => index % 2 ? char : char.toUpperCase()).join("");
    const safe = JSON.stringify(redact({ output: [hex, upper, mixed], error: new Error(`failed ${mixed}`) }, [hex]));
    for (const variant of [hex, upper, mixed]) expect(safe).not.toContain(variant);
  });
});

/** WSP-8's unit test: one case for each kind with its source, and for each kind a case that must be kept. */
describe("every kind redact() matches (M1-AC2, SEC-4)", () => {
  const monarch = "0123456789abcdef".repeat(4);
  const soldier = "Sold1er/cred+ential=x y";

  it("the Monarch's secret and a soldier credential, in each encoding and any letter case", () => {
    const encodings = (secret: string): string[] => {
      const bytes = Buffer.from(secret);
      return [secret, secret.toUpperCase(), secret.toLowerCase(), bytes.toString("hex"), bytes.toString("hex").toUpperCase(),
        bytes.toString("base64"), bytes.toString("base64url"), encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)];
    };
    for (const secret of [monarch, soldier]) {
      for (const spelling of encodings(secret)) {
        const safe = redact({ line: `before ${spelling} after`, [spelling]: 1 }, [monarch, soldier]) as Record<string, unknown>;
        expect(JSON.stringify(safe), spelling).not.toContain(spelling);
        expect(safe.line).toBe(`before ${REDACTED} after`);
      }
    }
    expect(redact("nothing here, 0123456789abcdef is short", [monarch, soldier])).toBe("nothing here, 0123456789abcdef is short");
  });

  it("a Bearer token", () => {
    expect(redact("x-token: Bearer aaa.bbb~ccc+ddd/eee= done")).toBe(`x-token: Bearer ${REDACTED} done`);
    expect(redact("bearer abc.def")).toBe(`Bearer ${REDACTED}`);
    // kept: the word inside another word, and the word with no token after it
    expect(redact("Pallbearer abcdefghij")).toBe("Pallbearer abcdefghij");
    expect(redact("the Bearer.")).toBe("the Bearer.");
  });

  it("an Authorization header's value, whole, spaces included", () => {
    expect(redact("Authorization: Basic dXNlcjpwYXNz\nnext line")).toBe(`Authorization: ${REDACTED}\nnext line`);
    expect(redact({ headers: '"authorization": "Digest user=a, nonce=b"' })).toEqual({ headers: `"authorization": "${REDACTED}"` });
    // kept: the word with no separator after it, and inside another word
    expect(redact("Authorization was granted")).toBe("Authorization was granted");
    expect(redact("preauthorization: approved")).toBe("preauthorization: approved");
  });

  it("the password in a URL's user part, even one that holds @ or :", () => {
    expect(redact("postgres://u:p@ss:w@rd@host/db")).toBe(`postgres://u:${REDACTED}@host/db`);
    expect(redact("see https://bob:hunter2@example.com:8080/path?x=a@b now")).toBe(`see https://bob:${REDACTED}@example.com:8080/path?x=a@b now`);
    expect(redact('"redis://:pw@cache"')).toBe(`"redis://:${REDACTED}@cache"`);
    // kept: no password, an @ only after the authority, a port instead of a password
    for (const url of ["ssh://git@github.com/x/y", "https://example.com/a:b@c", "http://host:8080/x@y", "https://example.com"]) {
      expect(redact(url)).toBe(url);
    }
  });

  it("a private key block, BEGIN line to END line", () => {
    const block = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\nAAAA\n-----END OPENSSH PRIVATE KEY-----";
    expect(redact(`key:\n${block}\ntail`)).toBe(`key:\n${REDACTED}\ntail`);
    expect(redact("-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----")).toBe(REDACTED);
    // a block cut before its END line is still secret
    expect(redact("a -----BEGIN RSA PRIVATE KEY-----\nMIIEow")).toBe(`a ${REDACTED}`);
    // kept: a certificate, and a public key
    const cert = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
    expect(redact(cert)).toBe(cert);
  });

  it("a key that starts sk-, sk-ant-, ghp_, gho_, ghu_, ghs_ or ghr_", () => {
    for (const prefix of ["sk-", "sk-ant-", "ghp_", "gho_", "ghu_", "ghs_", "ghr_"]) {
      expect(redact(`use ${prefix}abcDEF123_-xyz9 now`), prefix).toBe(`use ${REDACTED} now`);
    }
    // kept: sk- inside a word, fewer than 12 characters, another prefix
    for (const text of ["task-notification-abcdefghijkl", "sk-abc12345678", "ghx_abcdefghijklmnop", "my_sk-abcdefghijklmnop"]) {
      expect(redact(text)).toBe(text);
    }
  });

  it("the value given to a name ending in key, token, secret, password or credential", () => {
    const cases: Array<[string, string]> = [
      ["AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG", `AWS_SECRET_ACCESS_KEY=${REDACTED}`],
      ['{"access_token": "ya29.a0AfH6SMB", "n": 1}', `{"access_token": "${REDACTED}", "n": 1}`],
      ["db-password: s3cretvalue!", `db-password: ${REDACTED}`],
      ["clientCredential=abcdefgh", `clientCredential=${REDACTED}`],
      ["ApiKey = 'abcdefgh12'", `ApiKey = '${REDACTED}'`],
      ["MY_TOKEN=abcdefgh;next=1", `MY_TOKEN=${REDACTED};next=1`],
      ["PASSWORD:abcdefgh}", `PASSWORD:${REDACTED}}`],
    ];
    for (const [source, expected] of cases) expect(redact(source), source).toBe(expected);
    // as an object field too
    expect(redact({ db_password: "abcdefgh1", note: "x" })).toEqual({ db_password: REDACTED, note: "x" });
  });

  it("keeps names that only look like secrets", () => {
    for (const text of ["input_tokens: 5", "primary key: id", "token=short", "tokens: abcdefghijkl", "keyboard=abcdefghijkl",
      "password: a b c d e f g h", "the api_key"]) {
      expect(redact(text), text).toBe(text);
    }
    const usage = { input_tokens: 1400, cache_read_input_tokens: 900, key: "id", primaryKey: "short", token_count: "abcdefghij" };
    expect(redact(usage)).toEqual(usage);
  });
});

describe("session logs", () => {
  it("appends complete ordered records and keeps the post office separate from sessions", async () => {
    const dir = await directory();
    const logs = new SessionLogs(dir, ["root-secret"]);
    await logs.write("post-office", { type: "start", text: "root-secret" });
    await Promise.all(Array.from({ length: 30 }, (_, n) => logs.write("soldier-session", { n, text: "root-secret" })));
    const text = await readFile(join(dir, "soldier-session.jsonl"), "utf8");
    expect(text).not.toContain("root-secret");
    expect(text.trim().split("\n").map((line) => JSON.parse(line).n)).toEqual(Array.from({ length: 30 }, (_, n) => n));
    expect(JSON.parse((await readFile(join(dir, "post-office.jsonl"), "utf8")).trim())).toMatchObject({ type: "start" });
    await new SessionLogs(dir, []).write("soldier-session", { n: 30 });
    expect((await readFile(join(dir, "soldier-session.jsonl"), "utf8")).trim().split("\n")).toHaveLength(31);
  });

  it("rejects path escapes, Windows devices and a credential used as a filename", async () => {
    const logs = new SessionLogs(await directory(), ["root-secret"]);
    for (const name of ["../escape", "..", "a/b", "a\\b", "C:escape", "CON", "nul.txt", "root-secret"]) {
      await expect(logs.write(name, {})).rejects.toThrow("invalid session log name");
    }
  });

  it("never writes uppercase or mixed-case spellings of the Monarch credential", async () => {
    const hex = "abcdef0123456789".repeat(4);
    const upper = hex.toUpperCase();
    const mixed = [...hex].map((char, index) => index % 2 ? char : char.toUpperCase()).join("");
    const dir = await directory();
    const logs = new SessionLogs(dir, [hex]);
    await logs.write("post-office", { output: upper, error: new Error(mixed), nested: [hex, mixed] });
    const text = await readFile(join(dir, "post-office.jsonl"), "utf8");
    for (const variant of [hex, upper, mixed]) expect(text).not.toContain(variant);
    await expect(logs.write(upper, {})).rejects.toThrow("invalid session log name");
  });


  it("reports a failed write and permits a later retry", async () => {
    const dir = await directory();
    const blocked = join(dir, "logs");
    await writeFile(blocked, "not a directory");
    const logs = new SessionLogs(blocked, []);
    await expect(logs.write("post-office", { type: "start" })).rejects.toThrow();
    await rm(blocked);
    await logs.write("post-office", { type: "retry" });
    expect(JSON.parse((await readFile(join(blocked, "post-office.jsonl"), "utf8")).trim())).toEqual({ type: "retry" });
  });
});
