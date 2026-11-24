import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { processStartTime, startOfficeServer, type OfficeServer, type ServerOptions } from "./server.js";
import { eventWriter, watchStarter } from "./watch.js";
import { redact } from "./logs.js";
import { memoryProtection, readBootstrap } from "./credential.js";

/** Bootstrap is written once then closed, as the mod contract specifies. Shutdown is authenticated. */
export async function runPostOffice(settings: Partial<Omit<ServerOptions, "credential">> = {}): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let office: OfficeServer | undefined;
  let credential = "";
  let ended = false;
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
      watch?.stop();
      input.close();
      process.stdin.destroy();
    }
  })();
  // PO-7: a write that fails, as with EPIPE once Claude Code was killed, stops the writing only; the watch or the
  // lease starts the shutdown. The loss is logged once (before the office exists there is no log to write it to).
  const events = eventWriter(process.stdout, {
    onLost: (error) => office?.office.logRecord({ type: "events_lost", reason: (error as NodeJS.ErrnoException).code ?? String(error) }),
    onBacklog: (full) => {
      office?.office.logRecord({ type: "events_backlog", full });
      // PO-7: a full backlog pauses the soldiers' output through the post office; a drained one resumes it.
      office?.office.backlog(full);
    },
  });
  process.stderr.on("error", () => { errorsLost = true; });
  // The mod closes bootstrap stdin immediately, so EOF cannot mean its session has ended. PO-7's watch: the
  // process that started this one ends, or its pid now names another process, and the shutdown starts.
  const starter = process.ppid;
  let watch: { stop(): void } | undefined;
  const stamped = processStartTime(starter).then((startTime) => {
    if (startTime === null) { void stop(); return; }
    if (!ended) watch = watchStarter({ pid: starter, startTime, startTimeOf: processStartTime, onEnded: () => { void stop(); } });
  });
  process.once("SIGINT", () => { void stop(); });
  process.once("SIGTERM", () => { void stop(); });
  try {
    // PO-3: protect memory first, then read the secret, which arrives on standard input only.
    const protection = await memoryProtection();
    const boot = await readBootstrap(input);
    credential = boot.credential;
    const cwdIndex = process.argv.indexOf("--cwd");
    office = await startOfficeServer({ ...settings, lease: settings.lease ?? boot.lease, memoryProtection: settings.memoryProtection ?? protection, cwd: settings.cwd ?? (cwdIndex >= 0 ? process.argv[cwdIndex + 1] ?? "" : process.cwd()), credential,
      onEvent: (event) => events.write(`${JSON.stringify(event)}\n`),
      onShutdown: () => { void stop(); },
    });
    await stamped;
    if (ended) await office.close();
    else events.write(`${JSON.stringify({ type: "ready", data: { url: office.url, pid: process.pid } })}\n`);
  } catch (error) {
    diagnostic(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    await stop();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runPostOffice();
