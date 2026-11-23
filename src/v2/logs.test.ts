import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { redact, SessionLogs } from "./logs.js";

const dirs: string[] = [];
async function directory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "shadow-v2-logs-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

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
      text: "Bearer aaa.bbb.ccc password=abc API_KEY='xyz' OPENAI_API_KEY=another-opaque-key ghp_1234567890123456 sk-ant-1234567890123456" }));
    for (const secret of ["unknown-key", "opaque-key", "client-private", "aaa.bbb.ccc", "password=abc", "'xyz'", "ghp_1234567890123456", "sk-ant-1234567890123456", '"refresh"']) {
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
    expect(redact("PrivateCaseValue privatecasevalue", ["PrivateCaseValue"])).toBe("[REDACTED] privatecasevalue");
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
