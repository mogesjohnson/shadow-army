import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { Command } from "commander";
import { OfficeClient } from "./client.js";
import type { TurnResult } from "./channel.js";
import { runPostOffice } from "./main.js";

// ARM-7, `sa live` side (M1b-28 part A). When the folder's policy files need the owner's trust, the post
// office answers an `open` or a `send` with a TrustAnswer instead of its usual result, and starts nothing.
// `sa live` prints the rows and asks the question; only the typed answer "Trust these files" sends a
// TrustRequest, carrying the full hash of every file row shown (a `gone` row carries the hash last trusted).
// The post office (part B) records exactly those hashes and, if a file changed since the card, answers the
// repeated command with a new TrustAnswer. The rows hold text from the folder's files: print them escaped.
export type TrustRow =
  | { kind: "file"; name: string; state: "new" | "changed" | "gone"; hash: string; soldier?: string }
  | { kind: "soldier"; name: string; cli: string; model: string; autonomy: string }
  | { kind: "server"; file: string; name: string; target: string };
export interface TrustAnswer { trust: { rows: TrustRow[] } }
export interface TrustRequest { action: "trust"; hashes: string[] }
export type TrustDecision = { accepted: true } | { accepted: false; reason: string };
export interface TrustIo {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  client: { request(command: Record<string, unknown>): Promise<unknown> };
  /** Where the typed answer comes from when something else already owns `input`. */
  readLine?: () => Promise<string | undefined>;
  signal?: AbortSignal;
}

export const TRUST_QUESTION = "Trust this folder's Shadow Army files?";
export const TRUST_ANSWER = "Trust these files";
const MAX_TRUST_ROUNDS = 5;
// Control, bidirectional and invisible format characters (SEC-6) become visible placeholders.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u{61c}\u{200b}-\u{200f}\u{2028}\u{2029}\u{202a}-\u{202e}\u{2060}-\u{2069}\u{feff}]/gu;
const escaped = (text: string): string => text.replace(UNSAFE, (c) => `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`);

const isText = (value: unknown): value is string => typeof value === "string";
function isTrustRow(value: unknown): value is TrustRow {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row !== "object") return false;
  if (row.kind === "file") return isText(row.name) && isText(row.hash) && (row.state === "new" || row.state === "changed" || row.state === "gone") && (row.soldier === undefined || isText(row.soldier));
  if (row.kind === "soldier") return isText(row.name) && isText(row.cli) && isText(row.model) && isText(row.autonomy);
  return row.kind === "server" && isText(row.file) && isText(row.name) && isText(row.target);
}
/** The post office's trust answer, or undefined for any other result. A trust answer with a bad row throws: nothing is shown or accepted on a guess. */
export function readTrustAnswer(result: unknown): TrustAnswer | undefined {
  const trust = (result as { trust?: unknown } | null | undefined)?.trust;
  if (trust === undefined) return undefined;
  const rows = (trust as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows) || !rows.length || !rows.every(isTrustRow)) throw new Error("the post office's trust answer is malformed; nothing was accepted");
  return { trust: { rows } };
}

export function renderTrustRows(rows: TrustRow[]): string {
  return rows.map((row) => row.kind === "file" ? `  ${row.state.padEnd(7)} ${escaped(row.name)}${row.soldier ? ` (${escaped(row.soldier)})` : ""}  ${escaped(row.hash.slice(0, 12))}`
    : row.kind === "soldier" ? `  ${[row.name, row.cli, row.model, row.autonomy].map(escaped).join(" \u{b7} ")}`
    : `  ${escaped(row.file)} server ${escaped(row.name)}: ${escaped(row.target)}`).join("\n");
}

/** One typed line from `input`, read without readline so lines after it stay in the stream. Only a newline-terminated line counts; end of input gives undefined. */
function readTypedLine(input: NodeJS.ReadableStream, signal?: AbortSignal): Promise<string | undefined> {
  return new Promise((resolve) => {
    let held = Buffer.alloc(0);
    const finish = (line?: string, rest?: Buffer): void => {
      input.off("data", onData); input.off("end", onEnd); input.off("close", onEnd); input.off("error", onEnd);
      signal?.removeEventListener("abort", onEnd);
      input.pause();
      if (rest?.length) (input as Readable).unshift(rest);
      resolve(line);
    };
    const onEnd = (): void => finish();
    const onData = (chunk: Buffer | string): void => {
      held = Buffer.concat([held, Buffer.from(chunk)]);
      const end = held.indexOf(0x0a);
      if (end < 0) return;
      const line = held.subarray(0, end).toString("utf8");
      finish(line.endsWith("\r") ? line.slice(0, -1) : line, held.subarray(end + 1));
    };
    if (signal?.aborted) return resolve(undefined);
    input.on("data", onData); input.on("end", onEnd); input.on("close", onEnd); input.on("error", onEnd);
    signal?.addEventListener("abort", onEnd, { once: true });
    input.resume();
  });
}

/** Prints the card and asks. Only the exact typed line "Trust these files" sends the TrustRequest; anything else accepts nothing and says why. */
export async function askTrust(answer: TrustAnswer, io: TrustIo): Promise<TrustDecision> {
  const { rows } = answer.trust;
  io.output.write(`${renderTrustRows(rows)}\n${TRUST_QUESTION}\n  1. Not now\n  2. ${TRUST_ANSWER}\nType "${TRUST_ANSWER}" exactly to accept. Anything else accepts nothing.\n> `);
  const line = await (io.readLine ? io.readLine() : readTypedLine(io.input, io.signal));
  if (line === TRUST_ANSWER && !io.signal?.aborted) {
    const request: TrustRequest = { action: "trust", hashes: rows.flatMap((row) => row.kind === "file" ? [row.hash] : []) };
    await io.client.request(request as unknown as Record<string, unknown>);
    return { accepted: true };
  }
  io.output.write("\n");
  const why = io.signal?.aborted ? "it was interrupted"
    : line === undefined ? "input ended before an answer"
    : line === "" ? "an empty line accepts nothing"
    : line === "Not now" ? "you chose Not now"
    : `${JSON.stringify(escaped(line))} is not exactly "${TRUST_ANSWER}"`;
  return { accepted: false, reason: `Nothing was started: ${why}. The army waits for you to trust this folder's Shadow Army files.` };
}

/** Sends `command`; while the post office answers with a trust card, asks, and repeats the command once the owner accepts. */
export async function requestWithTrust<T>(command: Record<string, unknown>, io: TrustIo): Promise<{ done: true; result: T } | { done: false; reason: string }> {
  for (let round = 0; round < MAX_TRUST_ROUNDS; round++) {
    const result = await io.client.request(command);
    const answer = readTrustAnswer(result);
    if (!answer) return { done: true, result: result as T };
    const decision = await askTrust(answer, io);
    if (!decision.accepted) return { done: false, reason: decision.reason };
  }
  return { done: false, reason: "Nothing was started: the folder's files changed again after each answer. Run it again once they are settled." };
}

export function renderLiveResult(result: TurnResult): string {
  const text = result.text.split(/\r?\n/).slice(0, 5).join("\n");
  return result.status === "completed" ? text || result.status
    : `${result.status}: ${result.error?.message ?? "turn stopped"}${text ? `\nPartial reply:\n${text}` : ""}`;
}

export function registerLiveCommand(program: Command): void {
  program.command("post-office", { hidden: true })
    .description("internal authenticated post office; credential supplied on stdin")
    .option("--cwd <dir>", "repository folder", process.cwd())
    .action(async (options: { cwd: string }) => { await runPostOffice({ cwd: options.cwd }); });
  program.command("live <soldier> [task...]")
    .description("open a persistent Claude soldier in a private read-only worktree")
    .option("--cwd <dir>", "repository folder", process.cwd())
    .option("--json", "machine-readable result for a single task")
    .action(async (soldier: string, task: string[], options: { cwd: string; json?: boolean }) => {
      if (options.json && !task.length) throw new Error("--json requires a task");
      const client = new OfficeClient({ cwd: options.cwd, onEvent: (event) => {
        if (event.type === "approval") console.error(`Owner response needed: ${JSON.stringify(event.data)}\n${task.length ? "Interrupt with Ctrl+C; use the interactive form to answer native requests." : "Use /answer <request_id> <native JSON response>, or /stop."}`);
      } });
      let turnRequested = false;
      let cancelled = false;
      let closeInput: (() => void) | undefined;
      // The trust question may be waiting on the terminal while Ctrl+C arrives; both ways of waiting end then.
      let asking: AbortController | undefined;
      let lineTaker: ((line: string | undefined) => void) | undefined;
      const stopAsking = () => { asking?.abort(); const take = lineTaker; lineTaker = undefined; take?.(undefined); };
      const ask = async <T>(command: Record<string, unknown>, readLine?: () => Promise<string | undefined>) => {
        asking = new AbortController();
        try { return await requestWithTrust<T>(command, { input: process.stdin, output: process.stdout, client, readLine, signal: asking.signal }); }
        finally { asking = undefined; }
      };
      const onStop = () => {
        if (!turnRequested) {
          cancelled = true;
          process.exitCode = 130;
          stopAsking();
          closeInput?.();
          void client.close().catch(() => {});
        } else if (asking) stopAsking();
        else void client.request({ action: "interrupt", soldier }).catch(() => {});
      };
      process.on("SIGINT", onStop);
      const show = (result: TurnResult) => {
        console.log(options.json ? JSON.stringify(result, null, 2) : renderLiveResult(result));
        if (result.status !== "completed") process.exitCode = 1;
      };
      const declined = (reason: string) => { console.error(reason); process.exitCode = 1; };
      try {
        const opened = await ask({ action: "open", soldier });
        if (cancelled) return;
        if (!opened.done) return declined(opened.reason);
        if (task.length) {
          turnRequested = true;
          try {
            const sent = await ask<TurnResult>({ action: "send", soldier, text: task.join(" ") });
            if (sent.done) show(sent.result); else declined(sent.reason);
          }
          finally { turnRequested = false; }
        }
        else {
          const input = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
          closeInput = () => input.close();
          input.on("SIGINT", onStop);
          try {
            if (process.stdin.isTTY) { console.log("/stop interrupts the turn; /exit closes the session."); input.setPrompt(`${soldier}> `); input.prompt(); }
            let active: Promise<void> | undefined;
            // While the trust question waits, the next typed line is its answer, not a task.
            const takeLine = () => new Promise<string | undefined>((resolve) => { lineTaker = resolve; });
            for await (const text of input) {
              if (lineTaker) { const take = lineTaker; lineTaker = undefined; take(text); continue; }
              if (text.trim() === "/exit") break;
              if (text.trim() === "/stop") { await client.request({ action: "interrupt", soldier }); continue; }
              if (text.startsWith("/answer ")) {
                const match = /^\/answer\s+(\S+)\s+([\s\S]+)$/.exec(text);
                try {
                  if (!match) throw new Error("use /answer <request_id> <native JSON response>");
                  await client.request({ action: "approval", soldier, requestId: match[1], response: JSON.parse(match[2]!) });
                } catch (error) { console.error(String(error)); }
                continue;
              }
              if (!text.trim()) continue;
              if (active) { console.error("The soldier is working. Use /stop, or wait for its reply."); continue; }
              if (cancelled) break;
              turnRequested = true;
              active = ask<TurnResult>({ action: "send", soldier, text }, takeLine).then((sent) => { if (sent.done) show(sent.result); else declined(sent.reason); }).catch((error: unknown) => { console.error(String(error)); process.exitCode = 1; }).finally(() => { active = undefined; turnRequested = false; if (process.stdin.isTTY) input.prompt(); });
            }
            // Closing the caller ends pending work, instead of waiting indefinitely for another turn.
            stopAsking();
            await client.close();
            await active;
          } finally { input.close(); }
        }
      } catch (error) {
        if (!cancelled) {
          console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
          process.exitCode = 1;
        }
      } finally { process.off("SIGINT", onStop); await client.close(); }
    });
}
