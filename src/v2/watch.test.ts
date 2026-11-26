import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { eventWriter, watchStarter } from "./watch.js";

function fakeTimer() {
  let fn: (() => void) | undefined;
  return { every(_ms: number, f: () => void) { fn = f; return () => { fn = undefined; }; }, async tick(n = 1) { for (let i = 0; i < n; i++) { fn?.(); await new Promise((done) => setImmediate(done)); } }, get running() { return !!fn; } };
}

describe("watchStarter (PO-7)", () => {
  it("starts the shutdown at the first 1 s check after the starter ends, once", async () => {
    const timer = fakeTimer();
    let living = true;
    const ended: string[] = [];
    watchStarter({ pid: 41, startTime: "7", startTimeOf: async () => "7", alive: () => living, onEnded: (why) => ended.push(why), timer, stampEvery: 1 });
    await timer.tick(5);
    expect(ended).toEqual([]);
    living = false;
    await timer.tick(1);
    expect(ended).toEqual(["ended"]);
    expect(timer.running).toBe(false);
    await timer.tick(3);
    expect(ended).toEqual(["ended"]);
  });

  it("counts a new process with the starter's pid and another start time as ended", async () => {
    const timer = fakeTimer();
    let stamp = "7";
    const ended: string[] = [];
    watchStarter({ pid: 41, startTime: "7", startTimeOf: async () => stamp, alive: () => true, onEnded: (why) => ended.push(why), timer, stampEvery: 2 });
    await timer.tick(4);
    stamp = "9";
    await timer.tick(1);
    expect(ended).toEqual([]);
    await timer.tick(1);
    expect(ended).toEqual(["pid reused"]);
  });

  it("counts a pid with no start time as ended, and a failed read as nothing", async () => {
    const timer = fakeTimer();
    const ended: string[] = [];
    let read: () => Promise<string | null> = () => Promise.reject(new Error("powershell failed"));
    watchStarter({ pid: 41, startTime: "7", startTimeOf: () => read(), alive: () => true, onEnded: (why) => ended.push(why), timer, stampEvery: 1 });
    await timer.tick(3);
    expect(ended).toEqual([]);
    read = async () => null;
    await timer.tick(1);
    expect(ended).toEqual(["ended"]);
  });

  it("stop() ends the watch without a shutdown", async () => {
    const timer = fakeTimer();
    const ended: string[] = [];
    const watch = watchStarter({ pid: 41, startTime: "7", startTimeOf: async () => null, alive: () => false, onEnded: (why) => ended.push(why), timer });
    watch.stop();
    await timer.tick(2);
    expect(ended).toEqual([]);
  });

  // Not tested: Windows has no SIGSTOP; a suspended process there is a debugger's, which this test can't make (M1-AC1).
  it.skipIf(process.platform === "win32")("survives a SIGSTOP and SIGCONT of the post office while the starter lives (POSIX)", async () => {
    const loader = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
    const watch = new URL("./watch.ts", import.meta.url).href;
    const code = `import { watchStarter } from ${JSON.stringify(watch)};
      watchStarter({ pid: ${process.pid}, startTime: "s", startTimeOf: async () => "s", intervalMs: 50, stampEvery: 1, onEnded: (why) => { console.log("ended " + why); process.exit(3); } });
      setInterval(() => console.log("tick"), 50);`;
    const child = spawn(process.execPath, ["--import", loader, "--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
    try {
      for (let i = 0; i < 200 && !out.includes("tick"); i++) await wait(50);
      expect(out).toContain("tick");
      child.kill("SIGSTOP");
      // 40 s in the spec; 1.5 s here is thirty of this watch's 50 ms checks.
      await wait(1_500);
      child.kill("SIGCONT");
      const before = out.length;
      await wait(500);
      expect(out.slice(before)).toContain("tick");
      expect(out).not.toContain("ended");
      expect(child.exitCode).toBeNull();
    } finally { child.kill("SIGKILL"); }
  }, 20_000);
});

describe("eventWriter (PO-7)", () => {
  it("stops writing after EPIPE, says so once, and never throws or ends anything", async () => {
    let calls = 0;
    const stream = new Writable({ write(_chunk, _enc, done) { calls++; done(Object.assign(new Error("write EPIPE"), { code: "EPIPE" })); } });
    const lost: unknown[] = [];
    const writer = eventWriter(stream, { onLost: (error) => lost.push(error) });
    writer.write("one\n");
    await new Promise((done) => setImmediate(done));
    for (let i = 0; i < 5; i++) expect(() => writer.write("more\n")).not.toThrow();
    await new Promise((done) => setImmediate(done));
    expect(writer.lost).toBe(true);
    expect(lost).toHaveLength(1);
    expect((lost[0] as NodeJS.ErrnoException).code).toBe("EPIPE");
    expect(calls).toBe(1);
  });

  it("reports a backlog past the limit while nothing reads, and its end once read", async () => {
    const pending: (() => void)[] = [];
    const stream = new Writable({ highWaterMark: 16, write(_chunk, _enc, done) { pending.push(done); } });
    const backlog: boolean[] = [];
    const writer = eventWriter(stream, { limit: 100, onBacklog: (full) => backlog.push(full) });
    for (let i = 0; i < 20; i++) writer.write("0123456789\n");
    expect(writer.full).toBe(true);
    expect(backlog).toEqual([true]);
    while (pending.length) { pending.shift()!(); await new Promise((done) => setImmediate(done)); }
    expect(writer.full).toBe(false);
    expect(backlog).toEqual([true, false]);
  });
});

describe("outputTransport (PO-7, M1-AC1)", () => {
  // A child post office stand-in: 8 MiB of events go to an inherited stdout pipe the test does not read, while
  // an HTTP server in the same process answers as the office answers renewals. A blocking write would hold the
  // loop, so the server would never answer. The OS pipe holds far less than 8 MiB on every platform.
  it("serves requests while a slow reader leaves stdout full, budgets every unwritten byte, and delivers all of it", async () => {
    const loader = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
    const watch = new URL("./watch.ts", import.meta.url).href;
    const code = `import { eventWriter, outputTransport } from ${JSON.stringify(watch)};
      import { createServer } from "node:http";
      const writer = eventWriter(outputTransport().stream, { limit: 1 << 20, onLost: (e) => process.stderr.write("lost " + e.code + " " + e.message + "\\n"), onBacklog: (full) => process.stderr.write("backlog " + full + "\\n") });
      const line = "x".repeat(1023) + "\\n";
      for (let i = 0; i < 8192; i++) writer.write(line);
      const server = createServer((_q, s) => s.end("renewed")).listen(0, "127.0.0.1", () => process.stderr.write("port " + server.address().port + "\\n"));`;
    const child = spawn(process.execPath, ["--import", loader, "--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => { err += chunk.toString(); });
    const until = async (check: () => boolean, what: string | (() => string)) => {
      for (let i = 0; i < 300 && !check(); i++) await new Promise((done) => setTimeout(done, 50));
      if (!check()) throw new Error(`no ${typeof what === "string" ? what : what()}; stderr: ${err}`);
    };
    try {
      await until(() => /port \d+/.test(err), "server");
      expect(err).toContain("backlog true");
      const port = Number(/port (\d+)/.exec(err)![1]);
      for (let i = 0; i < 3; i++) expect(await (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2_000) })).text()).toBe("renewed");
      expect(err).not.toContain("backlog false"); // bytes the pipe has not taken still count against the budget
      let bytes = 0;
      child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; });
      await until(() => bytes === 8192 * 1024 && err.includes("backlog false"), () => `full delivery (${bytes} bytes)`);
      expect(err).not.toContain("lost");
    } finally { child.kill(); }
  }, 30_000);

  // M1-AC1: with nothing reading the output and the lease ended, the post office still exits with its own code.
  it("lets the process exit with its own code when the reader never reads", async () => {
    const loader = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
    const watch = new URL("./watch.ts", import.meta.url).href;
    const code = `import { eventWriter, outputTransport } from ${JSON.stringify(watch)};
      const output = outputTransport();
      const writer = eventWriter(output.stream);
      const line = "x".repeat(1023) + "\\n";
      for (let i = 0; i < 8192; i++) writer.write(line);
      setTimeout(async () => { await output.close(300); process.exitCode = 7; }, 300);`;
    const child = spawn(process.execPath, ["--import", loader, "--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "inherit"] });
    try {
      const exit = await new Promise<number | null | "hung">((done) => {
        const timer = setTimeout(() => done("hung"), 15_000);
        child.once("exit", (status) => { clearTimeout(timer); done(status); });
      });
      expect(exit).toBe(7);
    } finally { child.kill(); }
  }, 30_000);
});
