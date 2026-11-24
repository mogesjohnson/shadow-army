import { networkInterfaces } from "node:os";
import type { AddressInfo, Server } from "node:net";

/** PO-2: the one address family each loopback has. No setting, flag or variable names the address. */
export const LOOPBACK_V4 = "127.0.0.1";
export const LOOPBACK_V6 = "::1";

type Interfaces = ReturnType<typeof networkInterfaces>;

/** Refuses every address but the two loopback ones, with an error that says so (PO-2, M1-AC1). */
export function assertLoopback(host: string): "127.0.0.1" | "::1" {
  if (host !== LOOPBACK_V4 && host !== LOOPBACK_V6) throw new Error(`post office refuses non-loopback address ${host}: it binds only 127.0.0.1 or ::1`);
  return host;
}

/** 127.0.0.1, or ::1 where IPv4 loopback is missing. `interfaces` is injectable for tests. */
export function loopbackAddress(interfaces: Interfaces = networkInterfaces()): "127.0.0.1" | "::1" {
  const all = Object.values(interfaces).flatMap((list) => list ?? []);
  if (all.some((i) => i.address === LOOPBACK_V4)) return LOOPBACK_V4;
  if (all.some((i) => i.address === LOOPBACK_V6)) return LOOPBACK_V6;
  throw new Error("post office cannot bind: this machine has neither 127.0.0.1 nor ::1");
}

/**
 * Listens on the loopback address only; `port` 0 picks a free one. `host` exists so a test can prove the refusal:
 * a caller passes nothing, and anything but a loopback address throws before the server listens.
 */
export function bindLoopback(server: Server, port = 0, host?: string): Promise<AddressInfo> {
  let address: "127.0.0.1" | "::1";
  try { address = host === undefined ? loopbackAddress() : assertLoopback(host); } catch (error) { return Promise.reject(error as Error); }
  return new Promise((resolve, reject) => {
    const failed = (error: Error) => reject(error);
    server.once("error", failed);
    server.listen(port, address, () => {
      server.off("error", failed);
      resolve(server.address() as AddressInfo);
    });
  });
}
