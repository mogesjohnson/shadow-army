import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { connect, createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { assertLoopback, bindLoopback, loopbackAddress } from "./bind.js";

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r)))); });

const iface = (address: string) => ({ lo: [{ address, netmask: "", family: address.includes(":") ? "IPv6" : "IPv4", mac: "", internal: true, cidr: null }] }) as never;

describe("the loopback bind (PO-2)", () => {
  it("prefers 127.0.0.1 and falls back to ::1 only where IPv4 loopback is missing", () => {
    expect(loopbackAddress(iface("127.0.0.1"))).toBe("127.0.0.1");
    expect(loopbackAddress({ lo: [...(iface("::1") as { lo: never[] }).lo, ...(iface("127.0.0.1") as { lo: never[] }).lo], eth: undefined } as never)).toBe("127.0.0.1");
    expect(loopbackAddress(iface("::1"))).toBe("::1");
    expect(() => loopbackAddress({ eth: undefined, wan: [{ address: "10.0.0.2" }] } as never)).toThrow(/neither 127.0.0.1 nor ::1/);
  });

  it.each(["0.0.0.0", "::", "192.168.1.5", "localhost", ""])("refuses %j with an error that says why, and never listens", async (host) => {
    expect(() => assertLoopback(host)).toThrow(/refuses non-loopback address/);
    const server = createServer();
    await expect(bindLoopback(server, 0, host)).rejects.toThrow(/refuses non-loopback address/);
    expect(server.listening).toBe(false);
  });

  it("accepts the two loopback addresses", () => {
    expect(assertLoopback("127.0.0.1")).toBe("127.0.0.1");
    expect(assertLoopback("::1")).toBe("::1");
  });

  it("binds the loopback address and reports its error when the port is taken", async () => {
    const first = createServer(); servers.push(first);
    const info = await bindLoopback(first);
    expect(["127.0.0.1", "::1"]).toContain(info.address);
    const second = createServer(); servers.push(second);
    await expect(bindLoopback(second, info.port, info.address)).rejects.toThrow(/EADDRINUSE/);
  });

  it("opens no socket that leaves loopback: net.client.socket reports only loopback peers (SEC-1, M1-AC1)", async () => {
    const peers: string[] = [];
    const onClient = (message: unknown) => {
      const socket = (message as { socket: Socket }).socket;
      socket.once("connect", () => peers.push(socket.remoteAddress ?? ""));
    };
    subscribe("net.client.socket", onClient);
    try {
      const server = createServer((s) => s.end("ok")); servers.push(server);
      const info = await bindLoopback(server);
      for (let i = 0; i < 3; i++) {
        await new Promise<void>((resolve, reject) => {
          const client = connect(info.port, info.address);
          client.once("error", reject).once("close", () => resolve()).resume();
        });
      }
    } finally { unsubscribe("net.client.socket", onClient); }
    expect(peers).toHaveLength(3);
    for (const peer of peers) expect(["127.0.0.1", "::1"]).toContain(peer);
  });
});
