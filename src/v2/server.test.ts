import { connect, type Socket } from "node:net";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { startOfficeServer, type OfficeServer } from "./server.js";
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

  it("shutdown settles an active native turn, retains its edit and closes stalled request bodies", async () => {
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
