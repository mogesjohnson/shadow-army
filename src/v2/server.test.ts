import { connect, type Socket } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { makeRoster } from "../core/roster.testutil.js";
import { afterEach, describe, expect, it } from "vitest";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { windowsOnly } from "./windowsOnly.testutil.js";
import { startOfficeServer, type OfficeServer, type SendResponse } from "./server.js";
import type { OfficeEvent } from "./postOffice.js";
import { credential, factory, roster, until } from "./fixture-main.testutil.js";

const servers: OfficeServer[] = [];
const repos: ReturnType<typeof makeRepo>[] = [];
const sockets: Socket[] = [];
async function setup(lease?: { session: string; ttlMs: number }) {
  const repo = makeRepo(); repos.push(repo);
  const events: OfficeEvent[] = [];
  const server = await startOfficeServer({ cwd: repo.dir, credential, roster, channelFactory: factory, lease, onEvent: (event) => events.push(event) }); servers.push(server);
  return { repo, server, events };
}
/** A synthetic build soldier whose turn n writes "turn n" to each of `writes` in its worktree. */
async function builder(writes: string[]) {
  const repo = makeRepo(); repos.push(repo);
  const builders = makeRoster({ tank: { cli: "claude", model: "synthetic", roles: ["build"], write: true } });
  let turns = 0;
  const server = await startOfficeServer({ cwd: repo.dir, credential, roster: builders, channelFactory: (options) => ({
    async send() {
      turns++;
      for (const path of writes) { await mkdir(dirname(join(options.cwd, path)), { recursive: true }); await writeFile(join(options.cwd, path), `turn ${turns}\n`); }
      return { status: "completed", text: "done", refusal: false };
    },
    async interrupt() {}, async respondApproval() {}, async close() {},
  }) }); servers.push(server);
  return { repo, server };
}
/** The fields the card reads: `Delivery` in plugins/shadow-army/hooks/register.ts at fab6f82, copied. */
interface Delivery { status: string; summary?: string; error?: { message?: string }; applied?: string[]; reverted?: string[]; reason?: string }
const command = (server: OfficeServer, value: Record<string, unknown>) => fetch(`${server.url}/command`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify(value) });
afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.destroy());
  await Promise.all(servers.splice(0).map((server) => server.close()));
  repos.splice(0).forEach((repo) => repo.cleanup());
});
describe("M1 authenticated loopback command server", () => {
  it("a released mod session cannot renew or keep its folder alive", async () => {
    const { repo, server, events } = await setup({ session: "current", ttlMs: 2000 });
    expect((await command(server, { action: "renew", session: "old" })).status).toBe(400);
    expect((await command(server, { action: "renew", session: "current" })).status).toBe(200);
    expect((await command(server, { action: "release", session: "current" })).status).toBe(200);
    await server.close();
    expect(events.filter((event) => event.type === "lease_ended")).toEqual([
      { type: "lease_ended", data: { session: "current", reason: "released" } },
    ]);
    await expect(readFile(join(repo.dir, ".shadow", "v2", "post-office.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);

  it("missed heartbeats close the office while the owning test process stays alive", async () => {
    const { repo, server, events } = await setup({ session: "expired", ttlMs: 100 });
    await until(() => events.some((event) => event.type === "lease_ended"));
    await server.close();
    expect(events.find((event) => event.type === "lease_ended")?.data).toEqual({ session: "expired", reason: "expired" });
    await expect(readFile(join(repo.dir, ".shadow", "v2", "post-office.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);
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

  it("C1: the mod's sequence (army, claimless open, claimed send) opens the writer and applies its turn", async () => {
    const { repo, server } = await builder(["src/a.ts"]);
    // The exact calls `send()` in plugins/shadow-army/hooks/register.ts (fab6f82) makes, twice.
    const rounds: SendResponse[] = [];
    for (const round of [1, 2]) {
      expect((await command(server, { action: "army" })).status).toBe(200);
      const opened = await (await command(server, { action: "open", soldier: "tank" })).json() as { result: { session: string; branch?: string } };
      // The first open is claimless and read-only; the second finds the writer the first send opened.
      expect(opened.result.branch === undefined).toBe(round === 1);
      const sent = await command(server, { action: "send", soldier: "tank", text: "edit", claims: ["src/a.ts"] });
      expect(sent.status).toBe(200);
      rounds.push(((await sent.json()) as { result: SendResponse }).result);
    }
    expect(rounds.map((result) => [result.status, result.write?.inScope])).toEqual([["completed", ["src/a.ts"]], ["completed", ["src/a.ts"]]]);
    expect(rounds[0]!.applied).toEqual(["src/a.ts"]);
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("turn 1\n");
  }, 30_000);

  it("C1: a read-only session a turn already used is not replaced by a claimed send", async () => {
    const { server } = await builder([]);
    await command(server, { action: "open", soldier: "tank" });
    expect((await command(server, { action: "send", soldier: "tank", text: "look" })).status).toBe(200);
    const refused = await command(server, { action: "send", soldier: "tank", text: "edit", claims: ["src/a.ts"] });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toContain("read-only session");
  }, 30_000);

  it("C2: refuses an empty claim list, and a claimless send to a writer; claimless read-only sends still work", async () => {
    const { server } = await builder(["src/a.ts"]);
    for (const claims of [[], [""], "src/a.ts"]) {
      expect((await command(server, { action: "open", soldier: "tank", claims })).status).toBe(400);
      expect((await command(server, { action: "send", soldier: "tank", text: "edit", claims })).status).toBe(400);
    }
    expect((await command(server, { action: "send", soldier: "tank", text: "edit", claims: ["src/a.ts"] })).status).toBe(200);
    const claimless = await command(server, { action: "send", soldier: "tank", text: "edit" });
    expect(claimless.status).toBe(400);
    expect(((await claimless.json()) as { error: string }).error).toContain("needs its claims");
    expect((await command(server, { action: "close", soldier: "tank" })).status).toBe(200);
    const readOnly = await command(server, { action: "send", soldier: "tank", text: "look" });
    expect(readOnly.status).toBe(200);
    expect(((await readOnly.json()) as { result: SendResponse }).result.write).toBeUndefined();
  }, 30_000);

  it("C6: a rejected claimed open or send does not mark the soldier a writer; a read-only send still works", async () => {
    const { server } = await builder(["src/a.ts"]);
    const bad = ["../outside"];
    for (const action of ["open", "send"]) {
      const rejected = await command(server, { action, soldier: "tank", text: "edit", claims: bad });
      expect(rejected.status).toBe(400);
      const readOnly = await command(server, { action: "send", soldier: "tank", text: "look" });
      expect(readOnly.status).toBe(200);
      expect(((await readOnly.json()) as { result: SendResponse }).result.write).toBeUndefined();
      expect((await command(server, { action: "close", soldier: "tank" })).status).toBe(200);
    }
  }, 30_000);

  it("C6: a claimed send that fails against a used read-only session leaves it read-only, and a real writer still refuses a claimless send", async () => {
    const { server } = await builder([]);
    expect((await command(server, { action: "send", soldier: "tank", text: "look" })).status).toBe(200);
    expect((await command(server, { action: "send", soldier: "tank", text: "edit", claims: ["src/a.ts"] })).status).toBe(400);
    expect((await command(server, { action: "send", soldier: "tank", text: "look again" })).status).toBe(200);
    expect((await command(server, { action: "close", soldier: "tank" })).status).toBe(200);
    expect((await command(server, { action: "open", soldier: "tank", claims: ["src/a.ts"] })).status).toBe(200);
    const claimless = await command(server, { action: "send", soldier: "tank", text: "look" });
    expect(claimless.status).toBe(400);
    expect(((await claimless.json()) as { error: string }).error).toContain("needs its claims");
  }, 30_000);

  it("#94 C10: a claimless send rejected while a claimed send owns the writer cannot later reach that writer without claims", async () => {
    const repo = makeRepo(); repos.push(repo);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    const server = await startOfficeServer({ cwd: repo.dir, credential, roster: makeRoster({ tank: { cli: "claude", model: "synthetic", roles: ["build"], write: true } }), channelFactory: () => ({
      async send() { started(); await gate; return { status: "completed", text: "done", refusal: false }; },
      async interrupt() {}, async respondApproval() {}, async close() {},
    }) }); servers.push(server);
    const owner = command(server, { action: "send", soldier: "tank", text: "edit", claims: ["src/a.ts"] });
    await running;
    const overlapping = await command(server, { action: "send", soldier: "tank", text: "look" });
    expect(overlapping.status).toBe(400);
    release();
    expect((await owner).status).toBe(200);
    const claimless = await command(server, { action: "send", soldier: "tank", text: "look" });
    expect(claimless.status).toBe(400);
    expect(((await claimless.json()) as { error: string }).error).toContain("needs its claims");
  }, 30_000);

  it("C3: send returns the top-level fields the card reads for applied, refused and reverted outcomes", async () => {
    const reads = (result: SendResponse): Delivery => result;
    const turn = async (writes: string[], claims: string[], prepare?: (dir: string) => Promise<void>) => {
      const { repo, server } = await builder(writes);
      await prepare?.(repo.dir);
      const response = await command(server, { action: "send", soldier: "tank", text: "edit", claims });
      expect(response.status).toBe(200);
      return reads(((await response.json()) as { result: SendResponse }).result);
    };
    const applied = await turn(["src/a.ts"], ["src/a.ts"]);
    expect([applied.status, applied.applied, applied.reverted, applied.reason]).toEqual(["completed", ["src/a.ts"], undefined, undefined]);
    // The owner's own edit to the claimed file clashes, so nothing is applied and the reason says why.
    const refused = await turn(["src/a.ts"], ["src/a.ts"], async (dir) => { await mkdir(join(dir, "src"), { recursive: true }); await writeFile(join(dir, "src/a.ts"), "the owner's\n"); });
    expect([refused.applied, refused.reverted]).toEqual([undefined, undefined]);
    expect(refused.reason).toMatch(/\S/);
    const reverted = await turn(["src/a.ts", "src/b.ts"], ["src/a.ts"]);
    expect([reverted.applied, reverted.reverted, reverted.reason]).toEqual([["src/a.ts"], ["src/b.ts"], undefined]);
  }, 60_000);

  it("enforces a folder singleton and releases its non-secret lock on shutdown", async () => {
    const { repo, server } = await setup();
    const options = { cwd: repo.dir, credential, roster, channelFactory: factory };
    const lock = join(repo.dir, ".shadow", "v2", "post-office.lock");
    expect(await readFile(lock, "utf8")).not.toContain(credential);
    await expect(startOfficeServer(options)).rejects.toThrow("lock already exists");
    await server.close();
    await expect(readFile(lock)).rejects.toMatchObject({ code: "ENOENT" });
    servers.push(await startOfficeServer(options));
  }, 20_000);

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
