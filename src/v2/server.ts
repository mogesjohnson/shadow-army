import { timingSafeEqual } from "node:crypto";
import { createServer, type Server, type IncomingMessage } from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { PostOffice, type OfficeOptions } from "./postOffice.js";
import { redact } from "./logs.js";
import { SessionLease, type LeaseClock, type LeaseOptions } from "./lease.js";
import { acquireLock, lockMessages, type HeldLock, type StartTimeOf } from "./lock.js";
import { assertLoopback, bindLoopback } from "./bind.js";
import { RefusalReporter, type After } from "./credential.js";

export interface OfficeServer { url: string; office: PostOffice; close(): Promise<void>; }
export interface ServerOptions extends OfficeOptions {
  host?: string; port?: number; onShutdown?: () => void; lease?: LeaseOptions; leaseClock?: LeaseClock;
  /** The creation stamp of a process, for PO-1's lock. Defaults to the system's own (see processStartTime). */
  startTimeOf?: StartTimeOf;
  /** Appends one record to the post office's log. Passed in by the caller so the log has one writer; no-op by default. */
  log?: (record: Record<string, unknown>) => void | Promise<void>;
  /** The `memory protection:` line (PO-3), taken by the caller before it read the secret; logged first. */
  memoryProtection?: string;
  /** Schedules the refusal reports' minute; tests pass a fake monotonic clock. */
  refusalTimer?: After;
}

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

const run = promisify(execFile);

/**
 * PO-1's creation stamp: field 22 of /proc/<pid>/stat on Linux. STOP-GAP on win32 and darwin until
 * M1b-17's script (GetProcessTimes) and M1b-1's helper (proc_pidinfo) exist: PowerShell's StartTime in FILETIME
 * units, and `ps` on darwin (not tested, there is no Mac). Null when no process has the pid.
 */
export const processStartTime: StartTimeOf = async (pid) => {
  try {
    if (process.platform === "linux") {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19] ?? null;
    }
    const { stdout } = process.platform === "win32"
      ? await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc()`], { windowsHide: true })
      : await run("ps", ["-o", "lstart=", "-p", String(pid)], { env: { ...process.env, LC_ALL: "C" } });
    return stdout.trim() || null;
  } catch { return null; }
};

/** `/send --claim` arrives as `claims`: a list of non-empty path patterns, or nothing. */
function turnOptions(claims: unknown): { claims?: string[] } {
  if (claims === undefined) return {};
  if (!Array.isArray(claims) || claims.some((c) => typeof c !== "string" || !c.trim())) throw new Error("claims must be a list of non-empty path patterns");
  return claims.length ? { claims: claims as string[] } : {};
}

export async function startOfficeServer(options: ServerOptions): Promise<OfficeServer> {
  // PO-2: refused before any office or lock exists. `host` only exists so a test can prove the refusal.
  if (options.host !== undefined) assertLoopback(options.host);
  const office = await PostOffice.create(options);
  const log = (record: Record<string, unknown>) => { void Promise.resolve(options.log?.(record)).catch(() => {}); };
  const refusals = new RefusalReporter((count, first) => {
    // The first refusal is the office's own full event and log line; later ones are counts since the last report.
    if (first) office.refused();
    else log({ type: "command_refused", data: { reason: "wrong or missing Monarch credential", count, since: "the last report" } });
  }, options.refusalTimer);
  let held: HeldLock | undefined;
  let server: Server | undefined;
  let lease: SessionLease | undefined;
  let api: OfficeServer | undefined;
  const requestShutdown = () => {
    lease?.dispose();
    if (options.onShutdown) options.onShutdown();
    else void api?.close().catch(() => {});
  };
  try {
    if (options.memoryProtection) log({ type: "memory_protection", line: options.memoryProtection });
    const credential = Buffer.from(options.credential, "hex");
    server = createServer((request, response) => {
      void (async () => {
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        const presented = request.headers.authorization;
        const match = typeof presented === "string" ? /^Bearer ([a-f0-9]{64})$/i.exec(presented) : null;
        if (!match || !timingSafeEqual(credential, Buffer.from(match[1]!, "hex"))) {
          refusals.refuse();
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
          lease?.assertActive();
          const key = typeof command.soldier === "string" ? command.soldier : "";
          let value: unknown;
          switch (command.action) {
            case "renew":
              if (!lease) throw new Error("post office has no mod session lease");
              value = lease.renew(command.session); break;
            case "release":
              if (!lease) throw new Error("post office has no mod session lease");
              lease.release(command.session);
              office.leaseEnded(lease.session, "released");
              value = { ok: true }; break;
            case "army": value = office.army(); break;
            case "open": value = await office.open(key, turnOptions(command.claims)); break;
            case "send":
              if (typeof command.text !== "string") throw new Error("send requires text");
              value = await office.send(key, command.text, turnOptions(command.claims)); break;
            case "interrupt": await office.interrupt(key); value = { ok: true }; break;
            case "approval":
              if (typeof command.requestId !== "string") throw new Error("approval requires requestId");
              await office.approval(key, command.requestId, command.response); value = { ok: true }; break;
            case "close": await office.closeSession(key); value = { ok: true }; break;
            case "shutdown": value = { ok: true }; break;
            default: throw new Error("unknown post office command");
          }
          response.end(JSON.stringify(redact({ result: value }, [options.credential])));
          if (command.action === "shutdown" || command.action === "release") requestShutdown();
        } catch (error) {
          response.writeHead(400); response.end(JSON.stringify(redact({ error: error instanceof Error ? error.message : String(error) }, [options.credential])));
        }
      })().catch(() => { response.destroy(); });
    });
    // This bounds receipt of a command body, not the provider's response time.
    server.requestTimeout = 30_000;
    server.headersTimeout = 30_000;
    // PO-2: the loopback address only. The lock records the port, so the bind comes first; a refused lock closes it again.
    const address = await bindLoopback(server, options.port ?? 0, options.host);
    // PO-1: the lock names this process and the one that started it (PO-7's watch), by creation stamp.
    const startTimeOf = options.startTimeOf ?? processStartTime;
    const [startTime, starterTime] = await Promise.all([startTimeOf(process.pid), startTimeOf(process.ppid)]);
    if (startTime === null || starterTime === null) throw new Error(lockMessages.notWritten(`no start time for pid ${startTime === null ? process.pid : process.ppid}`));
    const taken = await acquireLock(join(office.root, ".shadow", "v2", "lock"), { pid: process.pid, startTime, port: address.port, starter: { pid: process.ppid, startTime: starterTime } }, startTimeOf);
    if (!taken.ok) throw new Error(taken.message);
    held = taken.lock;
    if (taken.replaced) log({ type: "lock", line: taken.replaced.logLine });
    let closing: Promise<void> | undefined;
    const bound = server;
    const host = address.family === "IPv6" ? "[::1]" : address.address;
    api = { office, url: `http://${host}:${address.port}`, close() {
      return closing ??= (async () => {
        lease?.dispose();
        refusals.flush();
        const stopped = new Promise<void>((resolve, reject) => bound.close((error) => error ? reject(error) : resolve()));
        try {
          await office.close();
        } finally {
          // A caller holding an incomplete/rejected request cannot pin shutdown or the folder lock.
          bound.closeAllConnections();
          // An uncertain containment close must retain the folder marker. A fresh caller
          // cannot launch another writer until the owner has checked the previous session.
          await stopped;
        }
        await held!.release();
      })();
    } };
    // No `lease` option is `sa live`'s post office: it has no lease, and renew and release are refused.
    if (options.lease) lease = new SessionLease(options.lease, () => {
      office.leaseEnded(lease!.session, "expired");
      requestShutdown();
    }, options.leaseClock);
    return api;
  } catch (error) {
    lease?.dispose();
    server?.close();
    refusals.flush();
    await office.close();
    await held?.release();
    throw error;
  }
}
