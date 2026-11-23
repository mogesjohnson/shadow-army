import { randomBytes } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { redact } from "./logs.js";
import type { OfficeEvent } from "./postOffice.js";
import type { LeaseOptions } from "./lease.js";

export interface ClientOptions {
  cwd: string;
  onEvent?: (event: OfficeEvent) => void;
  /** Dependency injection for a configured runtime entry, including subprocess contract tests. */
  command?: { file: string; args: string[] };
  /** The native mod passes its ephemeral credential on relay stdin, never argv/env/disk. */
  credential?: string;
  lease?: LeaseOptions;
}

/** One caller owns the process and the secret, retained only in memory and its stdin pipe. */
export class OfficeClient {
  #credential = randomBytes(32).toString("hex");
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly exited: Promise<void>;
  private readonly ready: Promise<string>;
  private closePromise?: Promise<void>;
  private ended = false;

  constructor(options: ClientOptions) {
    if (options.credential !== undefined) {
      if (!/^[a-f0-9]{64}$/i.test(options.credential)) throw new Error("caller credential must contain 32 random bytes");
      this.#credential = options.credential;
    }
    const command = options.command ?? { file: process.execPath, args: [fileURLToPath(new URL("./main.js", import.meta.url))] };
    const cwd = resolve(options.cwd);
    // Windows' default child job dies with its launcher before guard finalization can run.
    // Keep the helper alive briefly to observe caller loss and close its contained sessions.
    this.child = spawn(command.file, [...command.args, "--cwd", cwd], { cwd, detached: !!options.lease || process.platform === "win32", windowsHide: true, stdio: "pipe" });
    let ready!: (url: string) => void;
    let failed!: (error: Error) => void;
    this.ready = new Promise<string>((resolve, reject) => { ready = resolve; failed = reject; });
    void this.ready.catch(() => {});
    const timer = setTimeout(() => { failed(new Error("post office did not start within 30 seconds")); void this.close(); }, 30_000);
    let diagnostic = "";
    let buffer = "";
    const decoder = new StringDecoder("utf8");
    this.child.stderr.on("data", (chunk: Buffer) => { diagnostic = String(redact(diagnostic + chunk.toString("utf8"), [this.#credential])).slice(-4_096); });
    this.child.stdin.on("error", (error: Error) => failed(error));
    this.child.stdout.on("data", (chunk: Buffer) => {
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > 20 * 1024 * 1024) { failed(new Error("post office event exceeded 20 MiB")); void this.close(); return; }
      for (let end; (end = buffer.indexOf("\n")) >= 0;) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
          const event = JSON.parse(line) as OfficeEvent;
          if (event.type === "ready") {
            const url = (event.data as { url?: string })?.url;
            if (!url || !/^http:\/\/(?:127\.0\.0\.1|\[::1\]):\d+$/.test(url)) throw new Error("invalid post office loopback endpoint");
            clearTimeout(timer); ready(url);
          } else options.onEvent?.(event);
        } catch (error) { failed(new Error(`post office protocol failed: ${String(error)}`)); void this.close(); }
      }
    });
    this.exited = new Promise<void>((resolve) => {
      this.child.once("error", (error) => { this.ended = true; clearTimeout(timer); failed(error); resolve(); });
      this.child.once("close", () => { this.ended = true; clearTimeout(timer); failed(new Error(`post office ended${diagnostic ? `: ${diagnostic}` : ""}`)); resolve(); });
    });
    this.child.stdin.end(`${JSON.stringify({ credential: this.#credential, ...(options.lease ? { lease: options.lease } : {}) })}\n`);
  }

  /** The relay exposes only this loopback endpoint; its credential stays in memory. */
  endpoint(): Promise<string> { return this.ready; }

  async request<T = unknown>(command: Record<string, unknown>): Promise<T> {
    const url = await this.ready;
    if (this.ended) throw new Error("post office is closed");
    const response = await fetch(`${url}/command`, { method: "POST", headers: { Authorization: `Bearer ${this.#credential}`, "Content-Type": "application/json" }, body: JSON.stringify(command) });
    const data = await response.json() as { result?: T; error?: string };
    if (!response.ok) throw new Error(data.error ?? `post office command failed (${response.status})`);
    return data.result as T;
  }

  close(): Promise<void> {
    return this.closePromise ??= (async () => {
      // The mod closes credential stdin after bootstrap; explicitly end the caller session.
      const timer = setTimeout(() => this.child.kill("SIGKILL"), 35_000);
      try {
        if (!this.ended) {
          const ending = this.ready.then(() => this.request({ action: "shutdown" })).catch(() => {});
          await Promise.race([ending, this.exited]);
        }
        this.child.stdin.end();
        await this.exited;
      } finally { clearTimeout(timer); this.#credential = ""; }
    })();
  }
}
