import { mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { credential, roster } from "./fixture-main.testutil.js";
import { confirmedOpenings, redact, REDACTED, SessionLogs, type OpeningFile } from "./logs.js";
import { PostOffice } from "./postOffice.js";

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

describe("a gap only log_failed records were lost in (C32, PO-5)", () => {
  it("is reported by the first ordinary record lost in it, in either order, and once per gap after that", async () => {
    const onFailure = vi.fn();
    const logs = new SessionLogs("logs", [], { append: async () => { throw new Error("EIO"); }, onFailure, retryDelayMs: 1 });
    await logs.write("post-office", { type: "log_failed" });
    await logs.write("post-office", { type: "log_failed" });
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenLastCalledWith(expect.objectContaining({ type: "log_failed" }));
    await logs.write("post-office", { type: "command_refused" });
    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenLastCalledWith(expect.objectContaining({ type: "command_refused" }));
    await logs.write("post-office", { type: "command_refused" });
    await logs.write("post-office", { type: "log_failed" });
    expect(onFailure).toHaveBeenCalledTimes(2);
  });
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
    expect(safe).toContain("[redacted]");
  });

  it("handles cycles and repeated references without omitting secrets", () => {
    const child = { text: "private" };
    const cycle: Record<string, unknown> = { a: child, b: child };
    cycle.self = cycle;
    expect(redact(cycle, ["private"])).toEqual({ a: { text: "[redacted]" }, b: { text: "[redacted]" }, self: "[Circular]" });
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

  it("an Authorization value with quotes in it, in a header, a JSON value and escaped JSON, as persisted (C5)", async () => {
    const dir = await directory();
    const logs = new SessionLogs(dir, []);
    const values = [
      'Authorization: Digest username="bob", response="resp-one-secret"\nnext',
      "Authorization: Basic it's-resp-two-secret",
      JSON.stringify({ headers: { Authorization: 'Digest a="x", response="resp-three-secret"' } }),
      JSON.stringify(JSON.stringify({ Authorization: "Token resp-four-secret" })),
      `log {"authorization": 'Token resp-five-secret', "kept": 1}`,
    ];
    for (const text of values) await logs.write("soldier-1", { type: "message", text });
    const file = await readFile(join(dir, "soldier-1.jsonl"), "utf8");
    for (const secret of ["bob", "resp-one", "resp-two", "resp-three", "resp-four", "resp-five"]) expect(file).not.toContain(secret);
    const texts = file.trim().split("\n").map((line) => JSON.parse(line).text as string);
    expect(texts[0]).toBe(`Authorization: ${REDACTED}\nnext`);
    expect(JSON.parse(texts[2]!)).toEqual({ headers: { Authorization: REDACTED } });
    expect(JSON.parse(JSON.parse(texts[3]!))).toEqual({ Authorization: REDACTED });
    expect(texts[4]).toBe(`log {"authorization": '${REDACTED}', "kept": 1}`);
    // JSON text is also redacted as structure: a short value the patterns miss goes by its key.
    expect(redact('{ "api_key": "short", "n": 1 }')).toBe(`{"api_key":"${REDACTED}","n":1}`);
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

  it("every armored block whose BEGIN label names a private key, through its END line (C33, WSP-8)", () => {
    const labels = [
      "PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY", "DSA PRIVATE KEY", "OPENSSH PRIVATE KEY",
      "ENCRYPTED PRIVATE KEY", "PGP PRIVATE KEY BLOCK", "SSH2 ENCRYPTED PRIVATE KEY",
    ];
    for (const label of labels) {
      for (const eol of ["\n", "\r\n"]) {
        const block = `-----BEGIN ${label}-----${eol}Version: x${eol}${eol}lQOYBF${eol}=abcd${eol}-----END ${label}-----`;
        expect(redact(`before${eol}${block}${eol}after`), `${label} ${JSON.stringify(eol)}`).toBe(`before${eol}${REDACTED}${eol}after`);
        // cut before its END line: redacted to the end of the text
        expect(redact(`before ${block.slice(0, block.indexOf("-----END"))}`), `${label} cut`).toBe(`before ${REDACTED}`);
        // the same block inside JSON text, its line ends escaped
        const safe = JSON.stringify(redact(JSON.stringify({ output: `x${eol}${block}${eol}y` })));
        expect(safe, `${label} in JSON`).not.toContain("lQOYBF");
      }
    }
    // two blocks, and the text between them kept
    const two = "-----BEGIN PGP PRIVATE KEY BLOCK-----\nAAA\n-----END PGP PRIVATE KEY BLOCK-----\nmid\n-----BEGIN RSA PRIVATE KEY-----\nBBB\n-----END RSA PRIVATE KEY-----";
    expect(redact(two)).toBe(`${REDACTED}\nmid\n${REDACTED}`);
    // a certificate before a key, in JSON text with escaped line ends: only the key goes
    const cert = "-----BEGIN CERTIFICATE-----\\nAAA\\n-----END CERTIFICATE-----";
    const mixed = `{"cert":"${cert}","key":"-----BEGIN PRIVATE KEY-----\\nBBB\\n-----END PRIVATE KEY-----","next":"x"}`;
    const kept = JSON.stringify(redact(mixed));
    expect(kept).toContain("AAA");
    expect(kept).not.toContain("BBB");
    expect(kept).toContain('next');
    // a very long line of BEGINs stays fast
    const started = Date.now();
    redact("-----BEGIN ".repeat(95000));
    expect(Date.now() - started).toBeLessThan(2000);
    // kept: public key armor, a certificate and a signature
    for (const label of ["PGP PUBLIC KEY BLOCK", "PUBLIC KEY", "CERTIFICATE", "PGP SIGNATURE"]) {
      const armor = `-----BEGIN ${label}-----\nmQENB\n-----END ${label}-----`;
      expect(redact(armor), label).toBe(armor);
    }
  });

  it("an OpenPGP private key in a tool result, an object key or a streamed message is not in the persisted record (C33)", async () => {
    const dir = await directory();
    const logs = new SessionLogs(dir, []);
    const block = "-----BEGIN PGP PRIVATE KEY BLOCK-----\r\n\r\nlQOYBFdummypayload\r\n=abcd\r\n-----END PGP PRIVATE KEY BLOCK-----";
    const pub = "-----BEGIN PGP PUBLIC KEY BLOCK-----\r\nmQENBFpublic\r\n-----END PGP PUBLIC KEY BLOCK-----";
    await logs.write("soldier-1", { type: "tool_result", output: `${block}\r\n${pub}`, nested: { [block]: "k" } });
    for (const part of ["start -----BEGIN PGP PRIVATE ", "KEY BLOCK-----\nlQOYBFsplit", "payload\n-----END PGP PRIVATE KEY BLOCK----- end"]) logs.fragment("soldier-1", "m1", part);
    await logs.endMessage("soldier-1", "m1", { type: "message" });
    const raw = await readFile(join(dir, "soldier-1.jsonl"), "utf8");
    expect(raw).not.toMatch(/lQOYBF|PRIVATE KEY BLOCK/);
    const [first, second] = raw.trim().split("\n").map((line) => JSON.parse(line));
    expect(first.output).toBe(`${REDACTED}\r\n${pub}`);
    expect(second).toEqual({ type: "message", text: `start ${REDACTED} end` });
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

describe("a secret split across fragments", () => {
  const secret = "monarch-secret-value";

  it("is caught in the log whichever of three fragments carries each part", async () => {
    const dir = await directory();
    const logs = new SessionLogs(dir, [secret, "sk-ant-api03-ABCDEFGHIJKLMNOP"]);
    for (const part of ["start monarch-s", "ecret-", "value end "]) logs.fragment("soldier-1", "m1", part);
    for (const part of ["key sk-ant-", "api03-ABCDE", "FGHIJKLMNOP!"]) logs.fragment("soldier-1", "m2", part);
    for (const part of ["Bearer abc", "def.ghi", "jkl"]) logs.fragment("soldier-1", "m3", part);
    expect(await readFile(join(dir, "soldier-1.jsonl"), "utf8").catch(() => "")).toBe("");
    expect((await logs.endMessage("soldier-1", "m1", { type: "message" })).written).toBe(true);
    await logs.endMessage("soldier-1", "m2", { type: "message" });
    await logs.endMessage("soldier-1", "m3", { type: "message" });
    const lines = (await readFile(join(dir, "soldier-1.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { type: "message", text: `start ${REDACTED} end ` },
      { type: "message", text: `key ${REDACTED}!` },
      { type: "message", text: `Bearer ${REDACTED}` },
    ]);
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

});

/** M1-AC4's log failure: retried once after 100 ms, then carried on with a gap line. */
describe("a failed log write (PO-5, M1-AC4)", () => {
  /** An in-memory log file whose appends fail while `failing` is above zero; `torn` leaves half a line behind. */
  function fakeFile(): { text: () => string; attempts: () => number; failing: { count: number; torn: boolean }; append: (path: string, text: string) => Promise<void> } {
    let text = "";
    let attempts = 0;
    const failing = { count: 0, torn: false };
    return {
      text: () => text,
      attempts: () => attempts,
      failing,
      append: async (_path, chunk) => {
        attempts++;
        if (failing.count > 0) {
          failing.count--;
          if (failing.torn) text += chunk.slice(0, Math.floor(chunk.length / 2));
          throw new Error("disk full");
        }
        text += chunk;
      },
    };
  }
  const parsed = (text: string): unknown[] => text.split("\n").flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });

  it("retries once, 100 ms later, and the line is written when the retry works", async () => {
    vi.useFakeTimers();
    const file = fakeFile();
    file.failing.count = 1;
    const onFailure = vi.fn();
    const logs = new SessionLogs("logs", [], { append: file.append, onFailure });
    const result = logs.write("post-office", { n: 1 });
    await vi.advanceTimersByTimeAsync(99);
    expect(file.attempts()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ written: true });
    expect(file.attempts()).toBe(2);
    expect(parsed(file.text())).toEqual([{ n: 1 }]);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("carries on when the retry fails too: reports once, tries every later write, and the first line after the gap counts the loss", async () => {
    vi.useFakeTimers();
    const file = fakeFile();
    file.failing.count = 6;
    const onFailure = vi.fn();
    const logs = new SessionLogs("logs", [], { append: file.append, onFailure });
    const results = Promise.all([1, 2, 3].map((n) => logs.write("post-office", { n })));
    await vi.advanceTimersByTimeAsync(1000);
    expect((await results).map((result) => result.written)).toEqual([false, false, false]);
    expect(file.attempts()).toBe(6);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith({ name: "post-office", error: expect.objectContaining({ message: "disk full" }) });
    expect(file.text()).toBe("");

    expect((await logs.write("post-office", { n: 4 })).written).toBe(true);
    await logs.write("post-office", { n: 5 });
    expect(parsed(file.text())).toEqual([{ type: "log-gap", gap: expect.any(String), lost: 3, time: expect.any(String) }, { n: 4 }, { n: 5 }]);
  });

  it("says once when a line closes a gap, and never for a log without one (C22)", async () => {
    vi.useFakeTimers();
    const file = fakeFile();
    const onRecovered = vi.fn();
    const logs = new SessionLogs("logs", [], { append: file.append, onRecovered });
    await logs.write("soldier-1", { n: 1 });
    file.failing.count = 2;
    const lost = logs.write("soldier-1", { n: 2 });
    await vi.advanceTimersByTimeAsync(100);
    expect((await lost).written).toBe(false);
    expect(onRecovered).not.toHaveBeenCalled();
    await logs.write("soldier-1", { n: 3 });
    await logs.write("soldier-1", { n: 4 });
    expect(onRecovered).toHaveBeenCalledTimes(1);
    expect(onRecovered).toHaveBeenCalledWith("soldier-1");
  });

  it("ends a line cut short by a failed write before the next one, and a reader skips it", async () => {
    vi.useFakeTimers();
    const file = fakeFile();
    const logs = new SessionLogs("logs", [], { append: file.append, retryDelayMs: 100 });
    await logs.write("soldier-1", { n: 1 });
    file.failing.count = 2;
    file.failing.torn = true;
    const lost = logs.write("soldier-1", { n: 2, padding: "x".repeat(40) });
    await vi.advanceTimersByTimeAsync(100);
    expect((await lost).written).toBe(false);
    file.failing.torn = false;
    await logs.write("soldier-1", { n: 3 });
    const lines = file.text().split("\n");
    expect(lines.some((line) => line.startsWith('{"n":2') && !line.endsWith("}"))).toBe(true);
    expect(parsed(file.text())).toEqual([{ n: 1 }, { type: "log-gap", gap: expect.any(String), lost: 1, time: expect.any(String) }, { n: 3 }]);
    expect(file.text().endsWith("\n")).toBe(true);
  });

  it("keeps the record when the first try leaves part of it and the retry works (C4)", async () => {
    vi.useFakeTimers();
    const file = fakeFile();
    file.failing.count = 1;
    file.failing.torn = true;
    const logs = new SessionLogs("logs", [], { append: file.append });
    const result = logs.write("soldier-1", { n: 1, padding: "x".repeat(40) });
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toEqual({ written: true });
    expect(parsed(file.text())).toEqual([{ n: 1, padding: "x".repeat(40) }]);
    await logs.write("soldier-1", { n: 2 });
    expect(parsed(file.text())).toEqual([{ n: 1, padding: "x".repeat(40) }, { n: 2 }]);
  });

  it("keeps writing a log whose failure callback throws (C6)", async () => {
    vi.useFakeTimers();
    const file = fakeFile();
    file.failing.count = 2;
    const logs = new SessionLogs("logs", [], { append: file.append, onFailure: () => { throw new Error("notice failed"); } });
    const lost = logs.write("soldier-1", { n: 1 });
    const next = logs.write("soldier-1", { n: 2 });
    await vi.advanceTimersByTimeAsync(100);
    expect((await lost).written).toBe(false);
    expect((await next).written).toBe(true);
    expect(parsed(file.text())).toEqual([{ type: "log-gap", gap: expect.any(String), lost: 1, time: expect.any(String) }, { n: 2 }]);
  });
});

/** PO-5: the line that opens a turn is written and flushed before its message goes in (Codex C9). */
describe("the flushed opening row (PO-5)", () => {
  /** The real FileHandle.sync, so the default append is the code under test. */
  async function spyOnSync() {
    const probe = await open(join(await directory(), "probe"), "w");
    const prototype = Object.getPrototypeOf(probe) as { sync: () => Promise<void> };
    await probe.close();
    return vi.spyOn(prototype, "sync");
  }
  afterEach(() => { vi.restoreAllMocks(); });
  /** The row and its confirmation, and on Linux and macOS the folder that holds the file's entry once. */
  const syncsPerOpening = process.platform === "win32" ? 2 : 3;
  const rows = async (dir: string, file = "soldier-1.jsonl"): Promise<Record<string, unknown>[]> =>
    (await readFile(join(dir, file), "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const types = (list: Record<string, unknown>[]): unknown[] => list.map((row) => row.type);

  it("syncs the line that opens a turn and its confirmation to disk, and no other line", async () => {
    const sync = await spyOnSync();
    const dir = await directory();
    const logs = new SessionLogs(dir, []);
    await logs.write("soldier-1", { type: "opened" });
    expect(sync).not.toHaveBeenCalled();
    expect((await logs.write("soldier-1", { type: "turn_started", n: 1 })).written).toBe(true);
    expect(sync).toHaveBeenCalledTimes(syncsPerOpening);
    await logs.write("soldier-1", { type: "text" });
    expect(sync).toHaveBeenCalledTimes(syncsPerOpening);
    const list = await rows(dir);
    expect(list).toEqual([{ type: "opened" }, { type: "turn_started", n: 1, opening: expect.any(String) },
      { type: "turn_confirmed", opening: list[1]!.opening, time: expect.any(String) }, { type: "text" }]);
    expect(confirmedOpenings(await readFile(join(dir, "soldier-1.jsonl"), "utf8"))).toEqual(new Set([list[1]!.opening]));
  });

  it("reports the opening row as not written when the sync fails twice", async () => {
    const sync = await spyOnSync();
    sync.mockRejectedValue(new Error("EIO: flush failed"));
    const onFailure = vi.fn();
    const logs = new SessionLogs(await directory(), [], { onFailure, retryDelayMs: 1 });
    const result = await logs.write("soldier-1", { type: "turn_started" });
    expect(result).toMatchObject({ written: false, error: { message: "EIO: flush failed" } });
    // Each try's opening sync and its refusal's (C27).
    expect(sync).toHaveBeenCalledTimes(4);
    expect(onFailure).toHaveBeenCalledTimes(1);
    // C30: the callback names the lost record's kind, so the post office marks only a lost opening refused.
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ name: "soldier-1", type: "turn_started" }));
  });

  it("never trusts a failed sync: the retry writes a new opening, names the failed one refused, and confirms only the new one (C21, C24)", async () => {
    const sync = await spyOnSync();
    sync.mockRejectedValueOnce(new Error("EIO: flush failed"));
    const dir = await directory();
    const logs = new SessionLogs(dir, [], { retryDelayMs: 1 });
    expect(await logs.write("soldier-1", { type: "turn_started" })).toMatchObject({ written: true });
    // The failed sync, the refusal's own sync (C27, a folder sync too off Windows), then the retry's syncs.
    expect(sync.mock.calls.length).toBeGreaterThan(1 + syncsPerOpening);
    const list = await rows(dir);
    expect(types(list)).toEqual(["turn_started", "turn_refused", "turn_started", "turn_confirmed"]);
    expect(list[1]!.openings).toEqual([list[0]!.opening]);
    expect(confirmedOpenings(await readFile(join(dir, "soldier-1.jsonl"), "utf8"))).toEqual(new Set([list[2]!.opening]));
  });

  it("writes the retry to the file the path names when the first sync fails and the file is moved (C24)", async () => {
    const dir = await directory();
    const sync = await spyOnSync();
    sync.mockImplementationOnce(async () => {
      await rename(join(dir, "soldier-1.jsonl"), join(dir, "moved.jsonl"));
      throw new Error("EIO: flush failed");
    });
    const logs = new SessionLogs(dir, [], { retryDelayMs: 1 });
    expect(await logs.write("soldier-1", { type: "turn_started" })).toMatchObject({ written: true });
    expect(confirmedOpenings(await readFile(join(dir, "soldier-1.jsonl"), "utf8")).size).toBe(1);
    expect(types(await rows(dir, "moved.jsonl"))).toEqual(["turn_started", "turn_refused"]);
    expect(confirmedOpenings(await readFile(join(dir, "moved.jsonl"), "utf8")).size).toBe(0);
  });

  /** An in-memory log whose opening handles fail as `faults` say, one entry per try. */
  function memoryLog(faults: ("sync" | "confirm" | "moved" | "later" | undefined)[]) {
    let text = "";
    const openFile = async (): Promise<OpeningFile> => {
      const fault = faults.shift();
      let syncs = 0;
      let checks = 0;
      return {
        write: async (chunk) => { text += chunk; },
        // "confirm": only the confirmation's sync fails; "later": the file is replaced after the opening's checks.
        sync: async () => { syncs++; if (fault === "sync" || (fault === "confirm" && syncs === 2)) throw new Error("EIO: flush failed"); },
        isAt: async () => fault !== "moved" && !(fault === "later" && ++checks > 2),
        close: async () => {},
      };
    };
    const append = async (_path: string, chunk: string): Promise<void> => { text += chunk; };
    return { openFile, append, rows: () => text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>), text: () => text };
  }

  it("follows a confirmation whose sync failed with a refusal on the same handle, so a restart reads no confirmed turn (C27)", async () => {
    const log = memoryLog(["sync", "confirm"]);
    const options = { openFile: log.openFile, append: log.append, retryDelayMs: 1 };
    expect((await new SessionLogs("logs", [], options).write("soldier-1", { type: "turn_started" })).written).toBe(false);
    const tried = log.rows().filter((row) => row.type === "turn_started").map((row) => row.opening);
    // The first try's refusal is not synced, so the retry's row names it again.
    expect(types(log.rows())).toEqual(["turn_started", "turn_refused", "turn_refused", "turn_started", "turn_confirmed", "turn_refused"]);
    expect(log.rows().filter((row) => row.type === "turn_refused").flatMap((row) => row.openings as string[])).toEqual([tried[0], tried[0], tried[1]]);
    expect(confirmedOpenings(log.text())).toEqual(new Set());
    // The restart: a fresh writer that knows nothing of the refusal appends the next record.
    expect((await new SessionLogs("logs", [], options).write("soldier-1", { type: "text" })).written).toBe(true);
    expect(confirmedOpenings(log.text())).toEqual(new Set());
  });

  it("refuses an opening whose synced file the path no longer names (C24)", async () => {
    const log = memoryLog(["moved", "moved"]);
    const logs = new SessionLogs("logs", [], { openFile: log.openFile, append: log.append, retryDelayMs: 1 });
    expect(await logs.write("soldier-1", { type: "turn_started" })).toMatchObject({ written: false, error: { message: expect.stringContaining("moved or replaced") } });
  });

  it("leaves no confirmed opening when both syncs fail, so a restarted reader sees a refused send (C25)", async () => {
    const sync = await spyOnSync();
    sync.mockRejectedValue(new Error("EIO: flush failed"));
    const dir = await directory();
    expect((await new SessionLogs(dir, [], { retryDelayMs: 1 }).write("soldier-1", { type: "turn_started" })).written).toBe(false);
    sync.mockRestore();
    // The restart: a fresh writer, and recovery reading the file before and after its next record.
    const read = async (): Promise<Set<string>> => confirmedOpenings(await readFile(join(dir, "soldier-1.jsonl"), "utf8"));
    // Each try's own refusal row, unsynced, and the first try named again before the retry's row (C27).
    expect(types(await rows(dir))).toEqual(["turn_started", "turn_refused", "turn_refused", "turn_started", "turn_refused"]);
    expect(await read()).toEqual(new Set());
    expect((await new SessionLogs(dir, []).write("soldier-1", { type: "text" })).written).toBe(true);
    expect(await read()).toEqual(new Set());
  });

  it("keeps an earlier gap open when an opening's sync fails, then names the refused tries and counts both lines (C22, C25)", async () => {
    const log = memoryLog(["sync", "sync"]);
    let appends = 0;
    const append = async (path: string, chunk: string): Promise<void> => { if (appends++ < 2) throw new Error("disk full"); await log.append(path, chunk); };
    const onFailure = vi.fn();
    const onRecovered = vi.fn();
    const logs = new SessionLogs("logs", [], { openFile: log.openFile, append, onFailure, onRecovered, retryDelayMs: 1 });
    expect((await logs.write("soldier-1", { type: "opened" })).written).toBe(false);
    expect((await logs.write("soldier-1", { type: "turn_started" })).written).toBe(false);
    expect(onRecovered).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
    // C30: the gap is the `opened` record's, not the opening's that fell into it.
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ type: "opened" }));
    expect((await logs.write("soldier-1", { type: "text" })).written).toBe(true);
    expect(onRecovered).toHaveBeenCalledTimes(1);
    const list = log.rows();
    const tried = list.filter((row) => row.type === "turn_started").map((row) => row.opening);
    expect(list.at(-3)).toEqual({ type: "turn_refused", openings: tried, time: expect.any(String) });
    expect(list.at(-2)).toEqual({ type: "log-gap", gap: list[0]!.gap, lost: 2, time: expect.any(String) });
    expect(list.at(-1)).toEqual({ type: "text" });
    expect(confirmedOpenings(log.text())).toEqual(new Set());
  });

  it("does not deliver a message whose opening row cannot be flushed, and delivers the next one once it can", async () => {
    const repo = makeRepo();
    const delivered: string[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, channelFactory: () => ({
      async send(text) { delivered.push(text); return { status: "completed", text: "done", refusal: false }; },
      async interrupt() {}, async respondApproval() {}, async close() {},
    }) });
    try {
      await office.open("scout");
      const sync = await spyOnSync();
      sync.mockRejectedValue(new Error("EIO: flush failed"));
      await expect(office.send("scout", "first")).rejects.toThrow(/message not sent: .*EIO: flush failed/);
      expect(delivered).toEqual([]);
      sync.mockRestore();
      await office.send("scout", "second");
      expect(delivered).toEqual(["second"]);
    } finally {
      await office.close();
      repo.cleanup();
    }
  }, 30_000);
});
