import { timingSafeEqual } from "node:crypto";
import { createServer, type Server, type IncomingMessage } from "node:http";
import { open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { PostOffice, type OfficeOptions } from "./postOffice.js";
import { redact } from "./logs.js";

export interface OfficeServer { url: string; office: PostOffice; close(): Promise<void>; }
export interface ServerOptions extends OfficeOptions { host?: string; port?: number; onShutdown?: () => void; }

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("command exceeds 1 MiB");
    chunks.push(chunk);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("command must be an object");
  return value as Record<string, unknown>;
}

/** Non-secret PID lock. Never reclaim a live/unknown PID; stale locks are handled conservatively. */
async function folderLock(root: string): Promise<() => Promise<void>> {
  const path = join(root, ".shadow", "v2", "post-office.lock");
  const record = JSON.stringify({ pid: process.pid });
  let file;
  try { file = await open(path, "wx", 0o600); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const current = await readFile(path, "utf8").catch(() => "");
    throw new Error(`post office lock already exists; close the existing caller or remove its stale lock after checking the recorded PID: ${current}`);
  }
  try { await file.writeFile(record); } finally { await file.close(); }
  return async () => { if (await readFile(path, "utf8").catch(() => "") === record) await unlink(path); };
}

export async function startOfficeServer(options: ServerOptions): Promise<OfficeServer> {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") throw new Error(`post office refuses non-loopback address ${host}`);
  const office = await PostOffice.create(options);
  let unlock: (() => Promise<void>) | undefined;
  let server: Server | undefined;
  try {
    unlock = await folderLock(office.root);
    const credential = Buffer.from(options.credential, "hex");
    server = createServer((request, response) => {
      void (async () => {
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        const presented = request.headers.authorization;
        const match = typeof presented === "string" ? /^Bearer ([a-f0-9]{64})$/i.exec(presented) : null;
        if (!match || !timingSafeEqual(credential, Buffer.from(match[1]!, "hex"))) {
          office.refused();
          response.writeHead(401); response.end(JSON.stringify({ error: "wrong or missing Monarch credential" }));
          request.resume();
          return;
        }
        if (request.method !== "POST" || request.url !== "/command") {
          response.writeHead(404); response.end(JSON.stringify({ error: "command endpoint only; events are sent over stdout" }));
          request.resume(); return;
        }
        try {
          const command = await body(request);
          const key = typeof command.soldier === "string" ? command.soldier : "";
          let value: unknown;
          switch (command.action) {
            case "army": value = office.army(); break;
            case "open": value = await office.open(key); break;
            case "send":
              if (typeof command.text !== "string") throw new Error("send requires text");
              value = await office.send(key, command.text); break;
            case "interrupt": await office.interrupt(key); value = { ok: true }; break;
            case "approval":
              if (typeof command.requestId !== "string") throw new Error("approval requires requestId");
              await office.approval(key, command.requestId, command.response); value = { ok: true }; break;
            case "close": await office.closeSession(key); value = { ok: true }; break;
            case "shutdown": value = { ok: true }; break;
            default: throw new Error("unknown post office command");
          }
          response.end(JSON.stringify(redact({ result: value }, [options.credential])));
          if (command.action === "shutdown") options.onShutdown?.();
        } catch (error) {
          response.writeHead(400); response.end(JSON.stringify(redact({ error: error instanceof Error ? error.message : String(error) }, [options.credential])));
        }
      })().catch(() => { response.destroy(); });
    });
    // This bounds receipt of a command body, not the provider's response time.
    server.requestTimeout = 30_000;
    server.headersTimeout = 30_000;
    await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(options.port ?? 0, host, resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("post office did not bind a TCP port");
    let closing: Promise<void> | undefined;
    const bound = server;
    return { office, url: `http://${host === "::1" ? "[::1]" : host}:${address.port}`, close() {
      return closing ??= (async () => {
        const stopped = new Promise<void>((resolve, reject) => bound.close((error) => error ? reject(error) : resolve()));
        try {
          await office.close();
        } finally {
          // A caller holding an incomplete/rejected request cannot pin shutdown or the folder lock.
          bound.closeAllConnections();
          try { await stopped; } finally { await unlock!(); }
        }
      })();
    } };
  } catch (error) {
    server?.close();
    await office.close();
    await unlock?.();
    throw error;
  }
}
