import { Writable } from "node:stream";
import { Worker } from "node:worker_threads";

/** PO-1's creation stamp of a process, or null when no process has the pid. */
export type StampOf = (pid: number) => Promise<string | null>;

export interface StarterWatchOptions {
  /** The process that started the post office, and its creation stamp when it started it (PO-1's lock). */
  pid: number;
  startTime: string;
  startTimeOf: StampOf;
  /** Starts the shutdown. Called at most once. */
  onEnded: (why: "ended" | "pid reused") => void;
  /** 1 s, so the shutdown starts within 2 s of the starter's end (PO-7, M1-AC1). */
  intervalMs?: number;
  /** The stamp is read every n-th check; reading it can spawn a process (PowerShell on Windows). */
  stampEvery?: number;
  /** Whether any process has the pid. Defaults to `process.kill(pid, 0)`. */
  alive?: (pid: number) => boolean;
  timer?: { every(ms: number, fn: () => void): () => void };
}

const realAlive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
};

const realTimer = { every(ms: number, fn: () => void) { const id = setInterval(fn, ms); id.unref(); return () => clearInterval(id); } };

/**
 * PO-7's watch: the starter ends, or a new process has its pid with another start time, and the shutdown starts.
 * It counts no time, so a post office stopped (`SIGSTOP`) and continued sees a living starter and runs on.
 */
export function watchStarter(options: StarterWatchOptions): { stop(): void } {
  const { pid, startTime, startTimeOf, onEnded, intervalMs = 1_000, alive = realAlive, timer = realTimer } = options;
  const stampEvery = Math.max(1, options.stampEvery ?? (process.platform === "linux" ? 1 : 5));
  let done = false;
  let ticks = 0;
  let reading = false;
  const end = (why: "ended" | "pid reused") => { if (done) return; done = true; cancel(); onEnded(why); };
  const cancel = timer.every(intervalMs, () => {
    if (done) return;
    if (!alive(pid)) return end("ended");
    if (++ticks % stampEvery !== 0 || reading) return;
    reading = true;
    startTimeOf(pid).then((now) => {
      if (now === null) end("ended");
      else if (now !== startTime) end("pid reused");
    }, () => {}).finally(() => { reading = false; });
  });
  return { stop() { done = true; cancel(); } };
}

// The worker's whole job: blocking writes to the output, one reply per chunk (null, or the failure).
const OUTPUT_WORKER = `const { parentPort, workerData } = require("node:worker_threads");
const { writeSync } = require("node:fs");
const nap = new Int32Array(new SharedArrayBuffer(4));
parentPort.on("message", (bytes) => {
  try {
    for (let at = 0; at < bytes.length;) {
      try { at += writeSync(workerData.fd, bytes, at); }
      catch (error) { if (error.code !== "EAGAIN") throw error; Atomics.wait(nap, 0, 0, 5); }
    }
    parentPort.postMessage(null);
  } catch (error) { parentPort.postMessage({ code: error.code, message: String(error.message) }); }
});`;

/**
 * PO-7's nonblocking event transport. Node makes a pipe on stdout blocking on Windows, so a reader that stops
 * reading would hold the whole event loop (renewals, the watch, every soldier). Here a worker thread does the
 * blocking writes. A chunk's callback runs only once its bytes reached the output, so `writableLength` counts
 * every byte not yet written, which is the queue `eventWriter` budgets. The worker keeps the process alive only
 * while bytes wait, so a shutdown still flushes what was written before it.
 */
export function outputTransport(fd: number): Writable {
  // No inherited flags: `--input-type=module` or a loader would make this CommonJS script fail to start.
  const worker = new Worker(OUTPUT_WORKER, { eval: true, workerData: { fd }, execArgv: [] });
  worker.unref();
  const waiting: ((error?: Error | null) => void)[] = [];
  const failAll = (error: Error) => { for (const done of waiting.splice(0)) done(error); };
  worker.on("message", (failure: { code?: string; message: string } | null) => {
    const done = waiting.shift();
    if (!waiting.length) worker.unref();
    done?.(failure ? Object.assign(new Error(failure.message), { code: failure.code }) : null);
  });
  worker.on("error", failAll);
  worker.on("exit", () => failAll(new Error("event output worker ended")));
  const send = (bytes: Buffer, done: (error?: Error | null) => void) => { waiting.push(done); worker.ref(); worker.postMessage(bytes); };
  return new Writable({
    write(chunk: Buffer, _encoding, done) { send(chunk, done); },
    writev(chunks, done) { send(Buffer.concat(chunks.map(({ chunk }) => chunk as Buffer)), done); },
    destroy(error, done) { void worker.terminate(); done(error); },
  });
}

/** PO-7: past 16 MiB of events not yet written, the post office stops reading its soldiers' output. */
export const EVENT_BACKLOG_LIMIT = 16 * 1024 * 1024;

export interface EventWriter {
  /** Queues one line without blocking; dropped once the output is lost. */
  write(line: string): void;
  readonly lost: boolean;
  /** True while more than the limit waits unwritten. */
  readonly full: boolean;
}

/**
 * PO-7's event stream. Writes never block the event loop's other work. A write that fails, as with `EPIPE` once
 * Claude Code has been killed, never ends the post office: writing stops, `onLost` runs once, and the post office
 * runs on until the watch or the lease starts the shutdown. `onBacklog(true)` past the limit, `(false)` once drained.
 */
export function eventWriter(
  stream: Writable,
  options: { limit?: number; onLost?: (error: unknown) => void; onBacklog?: (full: boolean) => void } = {},
): EventWriter {
  const { limit = EVENT_BACKLOG_LIMIT, onLost, onBacklog } = options;
  let lost = false;
  let full = false;
  const lose = (error: unknown) => {
    if (lost) return;
    lost = true;
    if (full) { full = false; onBacklog?.(false); }
    onLost?.(error);
  };
  stream.on("error", lose);
  stream.on("drain", () => { if (full && !lost) { full = false; onBacklog?.(false); } });
  return {
    write(line) {
      if (lost) return;
      try { stream.write(line); } catch (error) { lose(error); return; }
      if (!full && stream.writableLength > limit) { full = true; onBacklog?.(true); }
    },
    get lost() { return lost; },
    get full() { return full; },
  };
}
