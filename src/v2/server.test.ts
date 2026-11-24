import { connect, type Socket } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { makeRoster } from "../core/roster.testutil.js";
import { afterEach, describe, expect, it } from "vitest";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { windowsOnly } from "./windowsOnly.testutil.js";
import { startOfficeServer, type OfficeServer } from "./server.js";
import type { LeaseClock } from "./lease.js";
import type { OfficeEvent } from "./postOffice.js";
import { credential, factory, roster, until } from "./fixture-main.testutil.js";

const servers: OfficeServer[] = [];
const repos: ReturnType<typeof makeRepo>[] = [];
const sockets: Socket[] = [];
async function setup(lease?: { session: string }, leaseClock?: LeaseClock) {
  const repo = makeRepo(); repos.push(repo);
  const events: OfficeEvent[] = [];
  const server = await startOfficeServer({ cwd: repo.dir, credential, roster, channelFactory: factory, lease, leaseClock, onEvent: (event) => events.push(event) }); servers.push(server);
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
