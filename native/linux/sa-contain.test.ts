// The Linux containment helper (native/linux/sa-contain.c), built with the
// system's C compiler and run with a Unix socket on fd 3.
// Not tested: off Linux, or without `cc`, these tests skip (D-34).
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const source = fileURLToPath(new URL("./sa-contain.c", import.meta.url));
const canBuild = process.platform === "linux" && spawnSync("cc", ["--version"]).status === 0;
let dir = "";
let helper = "";

type Fd3 = "pipe" | number | net.Socket;
interface Run { lines: string[]; code: number | null }

/* Runs the helper; `onLine` may answer each report line with a command. */
function run(args: string[], fd3: Fd3, input = "", onLine?: (line: string) => string | undefined): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(helper, args, { stdio: ["ignore", "ignore", "ignore", fd3] });
    const lines: string[] = [];
    const sock = fd3 === "pipe" ? (child.stdio[3] as net.Socket) : undefined;
    let rest = "";
    sock?.on("data", (chunk) => {
      rest += chunk.toString();
      let nl: number;
      while ((nl = rest.indexOf("\n")) >= 0) {
        const line = rest.slice(0, nl);
        rest = rest.slice(nl + 1);
        lines.push(line);
        const reply = onLine?.(line);
        if (reply) sock.write(reply);
      }
    });
    sock?.on("error", () => {});
    if (input) sock?.write(input);
    child.on("error", reject);
    child.on("close", (code) => resolve({ lines, code }));
  });
}

const parsed = (r: Run) => r.lines.map((l) => JSON.parse(l) as Record<string, unknown>);
const killOnExit = (line: string) => (line.includes('"event":"exit"') ? "kill\n" : undefined);

describe.skipIf(!canBuild)("sa-contain", () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "sa-contain-"));
    helper = join(dir, "sa-contain");
    for (const [out, extra] of [[helper, []], [`${helper}-stale`, ["-DSA_CONTAIN_TEST_STALE"]]] as const) {
      const cc = spawnSync("cc", ["-std=c11", "-Wall", "-Wextra", "-Werror", "-O2", ...extra, "-o", out, source]);
      expect(cc.stderr.toString()).toBe("");
      expect(cc.status).toBe(0);
    }
  }, 60_000);
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("reports started for a program that runs, then its exit code", async () => {
    const r = await run(["guard", "/bin/sh", "-c", "exit 3"], "pipe", "start\n", killOnExit);
    const events = parsed(r).map((e) => e.event);
    expect(events).toEqual(["ready", "started", "exit", "ended"]);
    expect(parsed(r)[2]).toMatchObject({ code: 3 });
    expect(r.code).toBe(0);
  });

  it("reports started for a live program, and kills it on kill", async () => {
    const r = await run(["guard", "/bin/sleep", "5"], "pipe", "start\n", (line) =>
      line.includes('"started"') ? "kill\n" : undefined,
    );
    expect(parsed(r).map((e) => e.event)).toEqual(["ready", "started", "exit", "ended"]);
    expect(parsed(r)[2]).toMatchObject({ signal: 9 });
  });

  it("does not report started for a child stopped before exec (C8)", async () => {
    // Large arguments slow the exec down, so `term` lands before it.
    const junk = Array.from({ length: 32 }, () => "x".repeat(16 * 1024));
    const r = await run(["guard", "/bin/sh", "-c", "sleep 5", ...junk], "pipe", "start\nterm\n", killOnExit);
    const events = parsed(r);
    expect(events.some((e) => e.event === "started")).toBe(false);
    expect(events).toContainEqual({ op: "guard", ok: false, step: "exec-unconfirmed", errno: 0 });
    expect(events.find((e) => e.event === "exit")).toMatchObject({ signal: 15 });
    expect(r.code).toBe(1);
  });

  it("settles a start still unresolved when the CLI becomes waitable (C10)", async () => {
    // The stale build skips the looks at the pipe's end and before reaping,
    // so only the reaping can settle the start.
    const shipped = helper;
    helper = `${shipped}-stale`;
    try {
      const ran = await run(["guard", "/bin/sh", "-c", "exit 3"], "pipe", "start\n", killOnExit);
      expect(parsed(ran).map((e) => e.event)).toEqual(["ready", "started", "exit", "ended"]);
      expect(parsed(ran)[2]).toMatchObject({ code: 3 });
      expect(ran.code).toBe(0);
      const junk = Array.from({ length: 32 }, () => "x".repeat(16 * 1024));
      const r = await run(["guard", "/bin/sh", "-c", "sleep 5", ...junk], "pipe", "start\nterm\n", killOnExit);
      const events = parsed(r);
      const unconfirmed = events.findIndex((e) => e.step === "exec-unconfirmed");
      expect(unconfirmed).toBeGreaterThan(0);
      expect(events.findIndex((e) => e.event === "exit")).toBeGreaterThan(unconfirmed);
      expect(events.some((e) => e.event === "started")).toBe(false);
      expect(r.code).toBe(1);
    } finally {
      helper = shipped;
    }
  });

  it("passes a check on a connected socket", async () => {
    const r = await run(["check"], "pipe");
    expect(parsed(r)).toEqual([{ op: "check", ok: true, subreaper: 1 }]);
    expect(r.code).toBe(0);
  });

  it("refuses a listening socket on fd 3 (C9)", async () => {
    const server = net.createServer();
    await new Promise<void>((done) => server.listen(join(dir, "listen.sock"), done));
    const fd = (server as unknown as { _handle: { fd: number } })._handle.fd;
    const r = await run(["check"], fd);
    server.close();
    expect(r.code).toBe(2);
  });

  it("fails a check whose report can't be sent (C9)", async () => {
    const server = net.createServer((c) => c.destroy());
    await new Promise<void>((done) => server.listen(join(dir, "closed.sock"), done));
    const client = net.connect({ path: join(dir, "closed.sock"), allowHalfOpen: true });
    client.on("error", () => {});
    await new Promise((done) => client.once("end", done));
    const r = await run(["check"], client);
    client.destroy();
    server.close();
    expect(r.code).toBe(1);
  });
});
