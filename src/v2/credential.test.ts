import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { maskCredential, memoryProtection, readBootstrap, RefusalReporter, type After } from "./credential.js";

const secret = "ab".repeat(32);
const bootstrap = (write: (input: PassThrough) => void, waitMs?: number) => {
  const stream = new PassThrough();
  const input = createInterface({ input: stream, crlfDelay: Infinity });
  const read = readBootstrap(input, waitMs);
  write(stream);
  return read.finally(() => input.close());
};

describe("PO-3 credential on standard input", () => {
  it("reads the secret and the lease from one line", async () => {
    expect(await bootstrap((s) => s.write(`${JSON.stringify({ credential: secret, lease: { session: "s1" } })}\n`))).toEqual({ credential: secret, lease: { session: "s1" } });
    expect(await bootstrap((s) => s.write(`${JSON.stringify({ credential: secret })}\n`))).toEqual({ credential: secret });
  });

  it("refuses a line that is not whole, too long or not a secret of 32 bytes, and never repeats the line in its error", async () => {
    for (const line of [`{"credential":"${secret}`, "not json", "null", JSON.stringify({ credential: "short" }), JSON.stringify({ credential: secret, lease: { session: 1 } }), JSON.stringify({ credential: secret, pad: "x".repeat(300) })]) {
      const error = await bootstrap((s) => s.write(`${line}\n`)).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("invalid credential bootstrap");
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("fails when nothing arrives in time or the caller ends first", async () => {
    await expect(bootstrap(() => {}, 20)).rejects.toThrow("requires its credential on stdin");
    await expect(bootstrap((s) => s.end())).rejects.toThrow("caller ended before post office bootstrap");
  });

  it("shows at most the last four characters of a secret", () => {
    expect(maskCredential(secret)).toBe("…abab");
    expect(maskCredential(secret)).not.toContain(secret.slice(0, 8));
  });
});

describe("PO-3 memory protection line", () => {
  const scope = (value: string) => async () => value;
  it("names Yama's ptrace_scope on Linux, and says none at 0 or without Yama", async () => {
    expect(await memoryProtection("linux", scope("0\n"))).toBe("memory protection: none · ptrace_scope 0");
    for (const n of [1, 2, 3]) expect(await memoryProtection("linux", scope(`${n}\n`))).toBe(`memory protection: Yama ptrace_scope ${n}`);
    const missing = async () => { throw Object.assign(new Error("no file"), { code: "ENOENT" }); };
    expect(await memoryProtection("linux", missing)).toBe("memory protection: none · no Yama");
    expect(await memoryProtection("linux", scope("garbage"))).toBe("memory protection: none · ptrace_scope unreadable");
  });

  it("checks nothing on macOS, and does not claim a DACL on Windows", async () => {
    expect(await memoryProtection("darwin")).toBe("memory protection: not checked");
    expect(await memoryProtection("win32")).toMatch(/^memory protection: none · process DACL not set/);
  });
});

describe("PO-3 refusal reports", () => {
  const fake = () => {
    const pending: (() => void)[] = [];
    const after: After = (fn) => { pending.push(fn); return () => { pending.splice(pending.indexOf(fn), 1); }; };
    return { after, minute: () => pending.shift()!(), waiting: () => pending.length };
  };

  it("gives the first refusal in full, then one count a minute, and the last minute's count when it ends", () => {
    const clock = fake(); const reports: [number, boolean][] = [];
    const reporter = new RefusalReporter((count, first) => reports.push([count, first]), clock.after);
    for (let i = 0; i < 1000; i++) reporter.refuse();
    expect(reports).toEqual([[1, true]]);
    clock.minute();
    expect(reports).toEqual([[1, true], [999, false]]);
    for (let i = 0; i < 7; i++) reporter.refuse();
    clock.minute();
    expect(reports.at(-1)).toEqual([7, false]);
    clock.minute();
    expect(reports).toHaveLength(3);
    expect(clock.waiting()).toBe(0);
  });

  it("reports in full again after a quiet minute, and flush reports what is pending", () => {
    const clock = fake(); const reports: [number, boolean][] = [];
    const reporter = new RefusalReporter((count, first) => reports.push([count, first]), clock.after);
    reporter.refuse();
    clock.minute();
    reporter.refuse();
    expect(reports).toEqual([[1, true], [1, true]]);
    reporter.refuse(); reporter.refuse();
    reporter.flush();
    expect(reports.at(-1)).toEqual([2, false]);
    expect(clock.waiting()).toBe(0);
  });
});
