import { existsSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { makeRoster } from "../core/roster.testutil.js";
import { afterEach, describe, expect, it } from "vitest";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { windowsOnly } from "./windowsOnly.testutil.js";
import { processStartTime, startOfficeServer, type OfficeServer, type ServerOptions } from "./server.js";
import type { StartTimeOf } from "./lock.js";
import type { LeaseClock } from "./lease.js";
import type { SweepOps } from "./contain/sweep.js";
import type { OfficeEvent } from "./postOffice.js";
import { credential, factory, roster, until } from "./fixture-main.testutil.js";

const servers: OfficeServer[] = [];
const repos: ReturnType<typeof makeRepo>[] = [];
const sockets: Socket[] = [];
/** A fake process table: this process and the one that started it exist; nothing else does. */
const stamps: StartTimeOf = async (pid) => pid === process.pid ? "1000" : pid === process.ppid ? "50" : null;
async function setup(lease?: { session: string }, leaseClock?: LeaseClock, extra: Partial<ServerOptions> = {}) {
  const repo = makeRepo(); repos.push(repo);
  const events: OfficeEvent[] = [];
  const server = await startOfficeServer({ cwd: repo.dir, credential, roster, channelFactory: factory, lease, leaseClock, startTimeOf: stamps, ...extra, onEvent: (event) => events.push(event) }); servers.push(server);
  return { repo, server, events };
}
const command = (server: OfficeServer, value: Record<string, unknown>) => fetch(`${server.url}/command`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify(value) });
afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.destroy());
  await Promise.all(servers.splice(0).map((server) => server.close()));
  repos.splice(0).forEach((repo) => repo.cleanup());
});
describe("M1 authenticated loopback command server", () => {
  it("a released mod session cannot renew or keep its folder alive", async () => {
    const { repo, server, events } = await setup({ session: "current" });
    expect((await command(server, { action: "renew", session: "old" })).status).toBe(400);
    expect((await command(server, { action: "renew", session: "current" })).status).toBe(200);
    expect((await command(server, { action: "release", session: "current" })).status).toBe(200);
    await server.close();
    expect(events.filter((event) => event.type === "lease_ended")).toEqual([
      { type: "lease_ended", data: { session: "current", reason: "released" } },
    ]);
    await expect(readFile(join(repo.dir, ".shadow", "v2", "post-office.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);

  it("30 s without a renewal on the fake clock close the office, and a renewal 10 s apart keeps it", async () => {
    let now = 0; let check = () => {};
    const { repo, server, events } = await setup({ session: "expired" }, { now: () => now, every: (fn) => { check = fn; return () => {}; } });
    const run = (seconds: number) => { for (let i = 0; i < seconds; i++) { now += 1000; check(); } };
    for (let i = 0; i < 6; i++) { run(10); expect((await command(server, { action: "renew", session: "expired" })).status).toBe(200); }
    expect(events.some((event) => event.type === "lease_ended")).toBe(false);
    run(30);
    await until(() => events.some((event) => event.type === "lease_ended"));
    await server.close();
    expect(events.find((event) => event.type === "lease_ended")?.data).toEqual({ session: "expired", reason: "expired" });
    await expect(readFile(join(repo.dir, ".shadow", "v2", "post-office.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);

  it("a post office with no lease, as `sa live` starts it, refuses renew and release and runs on", async () => {
    const { server, events } = await setup();
    const renewed = await command(server, { action: "renew", session: "current" });
    expect(renewed.status).toBe(400);
    expect(await renewed.json()).toEqual({ error: "post office has no mod session lease" });
    expect((await command(server, { action: "release", session: "current" })).status).toBe(400);
    expect((await command(server, { action: "army" })).status).toBe(200);
    expect(events.some((event) => event.type === "lease_ended")).toBe(false);
  });

  it("only binds loopback, authenticates every request and has no HTTP event stream", async () => {
    const { repo, server } = await setup();
    await expect(startOfficeServer({ cwd: repo.dir, credential, host: "0.0.0.0" })).rejects.toThrow("non-loopback");
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    for (const headers of [{}, { Authorization: `Bearer ${"cd".repeat(32)}` }]) {
      const response = await fetch(`${server.url}/command`, { method: "POST", headers, body: JSON.stringify({ action: "army" }) });
      expect(response.status).toBe(401);
    }
    const auth = { Authorization: `Bearer ${credential}` };
    for (const path of ["/command", "/events"]) {
      const response = await fetch(`${server.url}${path}`, { headers: auth });
      expect(response.status).toBe(404); expect(response.headers.get("content-type")).toBe("application/json");
    }
    const response = await command(server, { action: "army" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }, 20_000);

  it("passes a command's claims to open and send, so a claims turn is applied to the owner's folder", async () => {
    const repo = makeRepo(); repos.push(repo);
    const builders = makeRoster({ tank: { cli: "claude", model: "synthetic", roles: ["build"], write: true } });
    const server = await startOfficeServer({ cwd: repo.dir, credential, roster: builders, channelFactory: (options) => ({
      async send() { await mkdir(dirname(join(options.cwd, "src/a.ts")), { recursive: true }); await writeFile(join(options.cwd, "src/a.ts"), "from the soldier\n"); return { status: "completed", text: "done", refusal: false }; },
      async interrupt() {}, async respondApproval() {}, async close() {},
    }) }); servers.push(server);
    const opened = await (await command(server, { action: "open", soldier: "tank", claims: ["src/a.ts"] })).json() as { result: { branch?: string } };
    expect(opened.result.branch).toMatch(/^shadow\//);
    const sent = await (await command(server, { action: "send", soldier: "tank", text: "edit", claims: ["src/a.ts"] })).json() as { result: { write: { inScope: string[]; apply: { applied: boolean } } } };
    expect(sent.result.write.inScope).toEqual(["src/a.ts"]);
    expect(sent.result.write.apply.applied).toBe(true);
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("from the soldier\n");
    expect((await command(server, { action: "send", soldier: "tank", text: "edit", claims: "src/a.ts" })).status).toBe(400);
    expect((await command(server, { action: "send", soldier: "tank", text: "edit", claims: [""] })).status).toBe(400);
  }, 30_000);

  it("takes the PO-1 lock with its port and starter, refuses a second start, and releases it on shutdown", async () => {
    const { repo, server } = await setup();
    const options = { cwd: repo.dir, credential, roster, channelFactory: factory, startTimeOf: stamps };
    const dir = join(repo.dir, ".shadow", "v2", "lock");
    const text = await readFile(join(dir, "1.lock"), "utf8");
    expect(text).not.toContain(credential);
    expect(JSON.parse(text)).toEqual({ pid: process.pid, startTime: "1000", port: Number(new URL(server.url).port), starter: { pid: process.ppid, startTime: "50" } });
    await expect(startOfficeServer(options)).rejects.toThrow("the army is still closing");
    expect(await readFile(join(dir, "1.lock"), "utf8")).toBe(text);
    await server.close();
    expect(JSON.parse(await readFile(join(dir, "1.lock"), "utf8"))).toEqual({ released: true });
    servers.push(await startOfficeServer(options));
  }, 20_000);

  it("takes the lock and reports ready before its one recovery, which opens wait for; a caller that loses the lock touches no recovery state (PO-1)", async () => {
    const repo = makeRepo(); repos.push(repo);
    const shadow = join(repo.dir, ".shadow", "v2");
    // What an earlier, dead post office left: a tree record and an open turn.
    await mkdir(join(shadow, "trees"), { recursive: true }); await mkdir(join(shadow, "turns"), { recursive: true });
    await writeFile(join(shadow, "trees", "old.jsonl"), `${JSON.stringify({ kind: "post-office", pid: 999, startTime: 5 })}\n`);
    const turn = join(shadow, "turns", "old.json");
    await writeFile(turn, "{}");
    let free!: () => void;
    const gate = new Promise<void>((done) => { free = done; });
    const ops = (calls: number[], wait?: Promise<void>): SweepOps => ({ platform: "linux", commandOf: async (pid) => `fake ${pid}`, endProcess: async () => {}, wait: async () => {},
      startTimeOf: async (pid) => { calls.push(pid); await wait; return pid === process.pid ? 1 : undefined; } });
    const winnerCalls: number[] = [], loserCalls: number[] = [];
    const winner = await startOfficeServer({ cwd: repo.dir, credential, roster, channelFactory: factory, startTimeOf: stamps, processOps: ops(winnerCalls, gate) }); servers.push(winner);
    // Ready with the recovery still waiting on its process check.
    await until(() => winnerCalls.length > 0);
    expect(existsSync(turn)).toBe(true);
    await expect(startOfficeServer({ cwd: repo.dir, credential, roster, channelFactory: factory, startTimeOf: stamps, processOps: ops(loserCalls) })).rejects.toThrow("the army is still closing");
    expect(loserCalls).toEqual([]);
    expect(existsSync(turn)).toBe(true);
    let answered = false;
    const opening = command(winner, { action: "open", soldier: "scout" }).then((response) => { answered = true; return response; });
    await new Promise((done) => setTimeout(done, 200));
    expect(answered).toBe(false);
    free();
    expect((await opening).status).toBe(200);
    expect(existsSync(turn)).toBe(false);
  }, 30_000);

  it("replaces a lock whose process is gone and logs it, and starts nothing without a start time", async () => {
    const repo = makeRepo(); repos.push(repo);
    const dir = join(repo.dir, ".shadow", "v2", "lock");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "1.lock"), JSON.stringify({ pid: 4242, startTime: "7", port: 1, starter: { pid: 4243, startTime: "8" } }));
    const logged: Record<string, unknown>[] = [];
    const server = await startOfficeServer({ cwd: repo.dir, credential, roster, channelFactory: factory, startTimeOf: stamps, log: (record) => { logged.push(record); }, memoryProtection: "memory protection: Yama ptrace_scope 1" }); servers.push(server);
    expect(logged).toContainEqual({ type: "memory_protection", line: "memory protection: Yama ptrace_scope 1" });
    expect(logged.some((r) => r.type === "lock" && String(r.line).includes("no process has its pid"))).toBe(true);
    const other = makeRepo(); repos.push(other);
    await expect(startOfficeServer({ cwd: other.dir, credential, roster, channelFactory: factory, startTimeOf: async () => null })).rejects.toThrow("lock not written");
  }, 20_000);

  it("reads this system's creation stamp the same way twice, and none for a pid with no process", async () => {
    const first = await processStartTime(process.pid);
    expect(first).toMatch(/\S/);
    expect(await processStartTime(process.pid)).toBe(first);
    expect(await processStartTime(2_000_000_000)).toBeNull();
  }, 20_000);

  it("writes the refusal reports and the memory-protection line to post-office.jsonl through the office's own writer", async () => {
    const timers: (() => void)[] = [];
    const { repo, server } = await setup(undefined, undefined, { memoryProtection: "memory protection: Yama ptrace_scope 1", refusalTimer: (fn) => { timers.push(fn); return () => {}; } });
    const refuse = (n: number) => Promise.all(Array.from({ length: n }, () => fetch(`${server.url}/command`, { method: "POST", headers: { Authorization: `Bearer ${"cd".repeat(32)}` }, body: "{}" })));
    await refuse(3);
    timers.shift()!();
    await server.close();
    const lines = (await readFile(join(repo.dir, ".shadow", "v2", "logs", "post-office.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.filter((r) => r.type === "command_refused").map((r) => (r.data as { count?: number }).count)).toEqual([undefined, 2]);
    expect(lines).toContainEqual(expect.objectContaining({ type: "memory_protection", data: { line: "memory protection: Yama ptrace_scope 1" } }));
    expect(JSON.stringify(lines)).not.toContain(credential);
  }, 30_000);

  it("reports 1,000 refused requests once in full, then once a minute with the count, on a fake clock", async () => {
    const timers: (() => void)[] = [];
    const logged: Record<string, unknown>[] = [];
    const { server, events } = await setup(undefined, undefined, { log: (record) => { logged.push(record); }, refusalTimer: (fn) => { timers.push(fn); return () => {}; } });
    const refuse = (n: number) => Promise.all(Array.from({ length: n }, () => fetch(`${server.url}/command`, { method: "POST", headers: { Authorization: `Bearer ${"cd".repeat(32)}` }, body: "{}" }).then((r) => r.status)));
    const counts = () => logged.filter((r) => r.type === "command_refused").map((r) => (r.data as { count: number }).count);
    for (let i = 0; i < 20; i++) expect((await refuse(50)).every((status) => status === 401)).toBe(true);
    expect(events.filter((event) => event.type === "command_refused")).toHaveLength(1);
    expect(counts()).toEqual([]);
    timers.shift()!();
    expect(counts()).toEqual([999]);
    await refuse(2);
    timers.shift()!();
    expect(counts()).toEqual([999, 2]);
    timers.shift()!();
    expect(counts()).toEqual([999, 2]);
    await refuse(1);
    expect(events.filter((event) => event.type === "command_refused")).toHaveLength(2);
    expect(JSON.stringify([events, logged])).not.toContain(credential);
  }, 60_000);

  windowsOnly("shutdown settles an active native turn, retains its edit and closes stalled request bodies", async () => {
    const { repo, server, events } = await setup();
    const opened = await (await command(server, { action: "open", soldier: "scout" })).json() as { result: { cwd: string } };
    const pending = command(server, { action: "send", soldier: "scout", text: "partial" });
    await until(() => events.some((event) => event.type === "tool_call"));
    const url = new URL(server.url);
    const socket = connect({ host: url.hostname, port: Number(url.port) }); sockets.push(socket);
    socket.on("error", () => {});
    await new Promise<void>((done) => socket.once("connect", done));
    socket.write(`POST /command HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer ${credential}\r\nContent-Length: 999\r\n\r\n{`);
    await server.close();
    const response = await pending;
    const result = await response.json() as { result: { status: string } };
    expect(result.result.status).toBe("failed");
    expect(await readFile(join(opened.result.cwd, "partial.txt"), "utf8")).toBe("partial edit\n");
    expect(events.some((event) => event.type === "closed" && event.soldier === "scout")).toBe(true);
    expect(events.filter((event) => event.type === "guard")).toHaveLength(1);
    await expect(readFile(join(repo.dir, ".shadow", "v2", "post-office.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 30_000);
});
