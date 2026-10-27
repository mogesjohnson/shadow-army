import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OfficeClient } from "./client.js";
import { redact } from "./logs.js";

/** The mod owns this relay; its detached post office can finish guards after native unload. */
export async function runModRelay(options: { cwd?: string; command?: { file: string; args: string[] } } = {}): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let credential = "";
  let client: OfficeClient | undefined;
  let closing: Promise<void> | undefined;
  let outputLost = false;
  let errorLost = false;
  const stop = () => closing ??= (async () => {
    try { await client?.close(); } catch (error) {
      process.exitCode = 1;
      if (!errorLost) process.stderr.write(`${String(redact(String(error), [credential]))}\n`);
    } finally { input.close(); process.stdin.destroy(); credential = ""; }
  })();
  const output = (event: unknown) => {
    if (!outputLost) process.stdout.write(`${JSON.stringify(redact(event, [credential]))}\n`);
  };
  process.stdout.on("error", () => { outputLost = true; void stop(); });
  process.stderr.on("error", () => { errorLost = true; void stop(); });
  process.once("SIGINT", () => { void stop(); });
  process.once("SIGTERM", () => { void stop(); });
  try {
    const line = await new Promise<string>((done, fail) => {
      const timer = setTimeout(() => fail(new Error("mod relay requires stdin bootstrap")), 10_000);
      input.once("line", (value) => { clearTimeout(timer); value.length <= 512 ? done(value) : fail(new Error("mod relay bootstrap exceeds 512 characters")); });
      input.once("close", () => { clearTimeout(timer); fail(new Error("mod relay ended before bootstrap")); });
    });
    let bootstrap: unknown;
    try { bootstrap = JSON.parse(line); } catch { throw new Error("invalid mod relay bootstrap"); }
    if (!bootstrap || typeof bootstrap !== "object" || !("credential" in bootstrap) || !("session" in bootstrap) ||
      typeof bootstrap.credential !== "string" || !/^[a-f0-9]{64}$/i.test(bootstrap.credential) ||
      typeof bootstrap.session !== "string" || !bootstrap.session.length || bootstrap.session.length > 128) throw new Error("mod relay requires a credential and session id");
    credential = bootstrap.credential;
    const index = process.argv.indexOf("--cwd");
    const cwd = options.cwd ?? (index >= 0 ? process.argv[index + 1] ?? "" : process.cwd());
    client = new OfficeClient({ cwd, credential, lease: { session: bootstrap.session }, command: options.command,
      onEvent: (event) => {
        output(event);
        if (!event.soldier && event.type === "closed") void stop();
      },
    });
    const url = await client.endpoint();
    output({ type: "ready", data: { url } });
  } catch (error) {
    process.exitCode = 1;
    if (!errorLost) process.stderr.write(`${String(redact(String(error), [credential]))}\n`);
    await stop();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runModRelay();
