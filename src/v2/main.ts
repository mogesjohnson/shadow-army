import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startOfficeServer, type OfficeServer, type ServerOptions } from "./server.js";
import { redact } from "./logs.js";
import { memoryProtection, readBootstrap } from "./credential.js";

/** Bootstrap is written once then closed, as the mod contract specifies. Shutdown is authenticated. */
export async function runPostOffice(settings: Partial<Omit<ServerOptions, "credential">> = {}): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let office: OfficeServer | undefined;
  let credential = "";
  let ended = false;
  let outputLost = false;
  let errorsLost = false;
  let closing: Promise<void> | undefined;
  const diagnostic = (error: unknown) => {
    if (!errorsLost) process.stderr.write(`${JSON.stringify(redact({ error: String(error) }, [credential]))}\n`);
  };
  const stop = () => closing ??= (async () => {
    ended = true;
    try { await office?.close(); } catch (error) {
      diagnostic(error);
      process.exitCode = 1;
    } finally {
      clearInterval(watch);
      input.close();
      process.stdin.destroy();
    }
  })();
  // A dead caller may close these pipes before the parent watcher runs. Finish teardown and
  // persist guards/logs rather than letting an unhandled EPIPE abandon the folder lock.
  process.stdout.on("error", () => { outputLost = true; void stop(); });
  process.stderr.on("error", () => { errorsLost = true; void stop(); });
  // The mod closes bootstrap stdin immediately, so EOF cannot mean its session has ended.
  // An abruptly lost launcher is detected separately; normal session end issues shutdown.
  const launcher = process.ppid;
  const watch = setInterval(() => {
    try { process.kill(launcher, 0); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") void stop();
    }
  }, 1_000);
  watch.unref();
  process.once("SIGINT", () => { void stop(); });
  process.once("SIGTERM", () => { void stop(); });
  try {
    // PO-3: protect memory first, then read the secret, which arrives on standard input only.
    const protection = await memoryProtection();
    const boot = await readBootstrap(input);
    credential = boot.credential;
    const cwdIndex = process.argv.indexOf("--cwd");
    office = await startOfficeServer({ ...settings, lease: settings.lease ?? boot.lease, memoryProtection: settings.memoryProtection ?? protection, cwd: settings.cwd ?? (cwdIndex >= 0 ? process.argv[cwdIndex + 1] ?? "" : process.cwd()), credential,
      onEvent: (event) => { if (!outputLost) process.stdout.write(`${JSON.stringify(event)}\n`); },
      onShutdown: () => { void stop(); },
    });
    if (ended) await office.close();
    else if (!outputLost) process.stdout.write(`${JSON.stringify({ type: "ready", data: { url: office.url, pid: process.pid } })}\n`);
  } catch (error) {
    diagnostic(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    await stop();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runPostOffice();
