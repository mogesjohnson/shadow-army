import { once } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askTrust, escaped, readTrustAnswer, registerLiveCommand, renderTrustRows, requestWithTrust, type TrustAnswer } from "./cli.js";

// Limits of this file (V9): every test drives `sa live` with a fake post-office client and fake streams.
// The real post office on this branch has no trust endpoint yet (part B), and no test uses a real TTY or macOS.
// A card against the real post office, and Ctrl+C on a real terminal, are not_run here.

const fake = vi.hoisted(() => ({ request: vi.fn<(command: { action: string }) => Promise<unknown>>(), close: vi.fn(async () => {}), result: { status: "failed", text: "partial answer line 1\nline 2\nline 3\nline 4\nline 5\nline 6", refusal: false, error: { kind: "other", message: "read-only guard failed; partial work is retained at retained-worktree" } } }));
vi.mock("./client.js", () => ({ OfficeClient: class {
  request = fake.request;
  close = fake.close;
} }));
const originalExitCode = process.exitCode;
beforeEach(() => { fake.request.mockReset().mockImplementation(async (command) => command.action === "send" ? fake.result : {}); });
afterEach(() => { process.exitCode = originalExitCode; vi.restoreAllMocks(); fake.close.mockClear(); });

it("plain output exposes the failure and retained-worktree location even when a partial answer exceeds five lines", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const program = new Command(); registerLiveCommand(program);
  await program.parseAsync(["node", "sa", "live", "scout", "partial task"]);
  const rendered = [...output.mock.calls, ...errors.mock.calls].flat().join("\n");
  expect(rendered).toContain("partial answer line 1");
  expect(rendered).toContain("read-only guard failed");
  expect(rendered).toContain("retained-worktree");
  expect(process.exitCode).toBe(1);
  expect(fake.close).toHaveBeenCalled();
});

it("cancels during session opening without delivering the single task after opening finishes", async () => {
  let finishOpening!: () => void;
  const opening = new Promise<void>((done) => { finishOpening = done; });
  fake.request.mockImplementation((command) => command.action === "open" ? opening : Promise.resolve(fake.result));
  const initialListeners = process.listenerCount("SIGINT");
  const program = new Command(); registerLiveCommand(program);
  const running = program.parseAsync(["node", "sa", "live", "scout", "task must never be sent"]);
  try {
    await vi.waitFor(() => expect(fake.request).toHaveBeenCalledWith({ action: "open", soldier: "scout" }));
    process.emit("SIGINT");
    expect(fake.close).toHaveBeenCalled();
  } finally { finishOpening(); await running; }
  expect(fake.request.mock.calls.map(([command]) => command.action)).toEqual(["open"]);
  expect(process.exitCode).toBe(130);
  expect(process.listenerCount("SIGINT")).toBe(initialListeners);
});

const HASH_A = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const HASH_B = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";
const card = (hashA = HASH_A): TrustAnswer => ({ trust: { rows: [
  { kind: "file", name: "shadow.config.json", state: "new", hash: hashA },
  { kind: "file", name: "agent.md", state: "changed", hash: HASH_B },
  { kind: "soldier", name: "Kaisel", cli: "claude", model: "opus", autonomy: "full" },
  { kind: "server", file: ".mcp.json", name: "files", target: "npx files-server" },
] } });

function terminal(typed = "") {
  const input = new PassThrough();
  let printed = "";
  const output = new Writable({ write(chunk, _encoding, done) { printed += String(chunk); done(); } });
  const client = { request: vi.fn(async (_command: Record<string, unknown>): Promise<unknown> => ({})) };
  if (typed) input.write(typed);
  return { input, output, client, printed: () => printed };
}

describe("the trust question", () => {
  it("prints each row, then asks with Not now listed first", async () => {
    const t = terminal("Not now\n");
    await askTrust(card(), t);
    const out = t.printed();
    expect(out).toContain("new     shadow.config.json  a1b2c3d4e5f6\n");
    expect(out).not.toContain(HASH_A);
    expect(out).toContain("changed agent.md  0f1e2d3c4b5a\n");
    expect(out).toContain("Kaisel \u{b7} claude \u{b7} opus \u{b7} full");
    expect(out).toContain(".mcp.json server files: npx files-server");
    expect(out.indexOf("Trust this folder's Shadow Army files?")).toBeGreaterThan(out.indexOf("Kaisel"));
    expect(out.indexOf("1. Not now")).toBeGreaterThan(out.indexOf("Trust this folder's Shadow Army files?"));
    expect(out.indexOf("2. Trust these files")).toBeGreaterThan(out.indexOf("1. Not now"));
  });

  it("accepts only the exact typed answer, and sends exactly the hashes shown", async () => {
    const t = terminal("Trust these files\n");
    await expect(askTrust(card(), t)).resolves.toEqual({ accepted: true });
    expect(t.client.request).toHaveBeenCalledTimes(1);
    expect(t.client.request).toHaveBeenCalledWith({ action: "trust", hashes: [HASH_A, HASH_B] });
  });

  it("accepts the answer typed with a Windows line ending", async () => {
    const t = terminal("Trust these files\r\n");
    await expect(askTrust(card(), t)).resolves.toEqual({ accepted: true });
  });

  it.each([
    ["an empty line", "\n", "empty line"],
    ["end of input", "", "input ended"],
    ["end of input after a partial answer", "Trust these files", "input ended"],
    ["Not now", "Not now\n", "Not now"],
    ["another answer", "yes\n", `"yes" is not exactly`],
    ["a near miss in lower case", "trust these files\n", `"trust these files" is not exactly`],
    ["trailing space", "Trust these files \n", "is not exactly"],
    ["trailing text", "Trust these files please\n", "is not exactly"],
    ["the option number", "2\n", `"2" is not exactly`],
  ])("accepts nothing on %s, and says why", async (_name, typed, why) => {
    const t = terminal(typed);
    if (!typed.endsWith("\n")) t.input.end();
    const decision = await askTrust(card(), t);
    expect(t.client.request).not.toHaveBeenCalled();
    expect(decision.accepted).toBe(false);
    expect(decision.accepted ? "" : decision.reason).toContain(why);
    expect(decision.accepted ? "" : decision.reason).toContain("Nothing was started");
    expect(decision.accepted ? "" : decision.reason).toContain("The army waits for you to trust this folder's Shadow Army files");
  });

  it("accepts nothing when the input ends with no data at all", async () => {
    const t = terminal();
    t.input.end();
    expect((await askTrust(card(), t)).accepted).toBe(false);
    expect(t.client.request).not.toHaveBeenCalled();
  });

  it("shows escape and bidirectional controls as placeholders in the rows and the reason", async () => {
    const t = terminal("bad\u001b[2J\u{202e}\n");
    const hostile: TrustAnswer = { trust: { rows: [
      { kind: "file", name: "agent.md", state: "new", hash: HASH_A },
      { kind: "soldier", name: "Ka\u001bisel", cli: "claude", model: "opu\u{202e}s\nfake", autonomy: "full" },
      { kind: "server", file: ".mcp.json", name: "x\u0007", target: "\u{2066}cmd\u{2069}" },
    ] } };
    const decision = await askTrust(hostile, t);
    const shown = t.printed() + (decision.accepted ? "" : decision.reason);
    expect(shown).not.toMatch(/[\u001b\u0007\u{202e}\u{2066}\u{2069}]/u);
    expect(t.printed()).toContain("Ka\\u{1b}isel \u{b7} claude \u{b7} opu\\u{202e}s\\u{a}fake \u{b7} full");
    expect(decision.accepted ? "" : decision.reason).toContain("bad\\u{1b}[2J\\u{202e}");
  });

  it("escapes every control and format character, and keeps each row on its own line (C3)", () => {
    const cps: number[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) if (/[\p{Cc}\p{Cf}]/u.test(String.fromCodePoint(cp))) cps.push(cp);
    // Characters outside the old hand-written ranges: soft hyphen, Arabic number signs, Mongolian vowel separator,
    // interlinear annotation, the tag characters (SEC-6, M1-AC12).
    for (const cp of [0xad, 0x600, 0x6dd, 0x70f, 0xfff9, 0xfffb, 0xe0001, 0xe0020, 0xe007f, 0x85, 0x9b]) expect(cps).toContain(cp);
    const rendered = renderTrustRows(cps.map((cp) => ({ kind: "server" as const, file: ".mcp.json", name: `a${String.fromCodePoint(cp)}b`, target: "x" })));
    expect(rendered.split("\n")).toHaveLength(cps.length);
    expect(rendered.replaceAll("\n", "")).not.toMatch(/[\p{Cc}\p{Cf}\u2028\u2029]/u);
    expect(escaped("\t\n\u2028\u2029\u00ad\u{e0041}")).toBe("\\u{9}\\u{a}\\u{2028}\\u{2029}\\u{ad}\\u{e0041}");
  });

  it("leaves the lines after the answer in the stream", async () => {
    const t = terminal("Not now\nhello\nsecond\n");
    await askTrust(card(), t);
    expect(String(t.input.read())).toBe("hello\nsecond\n");
  });

  it("stops waiting when interrupted, and accepts nothing", async () => {
    const t = terminal();
    const abort = new AbortController();
    const asking = askTrust(card(), { ...t, signal: abort.signal });
    abort.abort();
    const decision = await asking;
    expect(decision.accepted).toBe(false);
    expect(decision.accepted ? "" : decision.reason).toContain("interrupted");
    expect(t.client.request).not.toHaveBeenCalled();
  });

  it("never accepts from an answer that the post office sent with a bad row", () => {
    expect(() => readTrustAnswer({ trust: { rows: [{ kind: "file", name: "agent.md", state: "trusted", hash: HASH_A }] } })).toThrow("malformed");
    expect(() => readTrustAnswer({ trust: { rows: [] } })).toThrow("malformed");
    expect(() => readTrustAnswer({ trust: "yes" })).toThrow("malformed");
    // C4: a card needs at least one file row, and every file hash is a full lower-case SHA-256.
    const server = { kind: "server", file: ".mcp.json", name: "files", target: "npx files-server" };
    const soldier = { kind: "soldier", name: "Kaisel", cli: "claude", model: "opus", autonomy: "full" };
    const file = (hash: unknown, extra: object = {}) => ({ kind: "file", name: "agent.md", state: "new", hash, ...extra });
    expect(() => readTrustAnswer({ trust: { rows: [server, soldier] } })).toThrow("malformed");
    for (const hash of ["abc", HASH_A.slice(1), `${HASH_A}0`, HASH_A.toUpperCase(), `${"g".repeat(64)}`, "", 5, undefined]) {
      expect(() => readTrustAnswer({ trust: { rows: [file(hash)] } }), String(hash)).toThrow("malformed");
    }
    expect(() => readTrustAnswer({ trust: { rows: [file(HASH_A, { name: "" })] } })).toThrow("malformed");
    expect(() => readTrustAnswer({ trust: { rows: [file(HASH_A), { ...server, target: "" }] } })).toThrow("malformed");
    expect(() => readTrustAnswer({ trust: { rows: [file(HASH_A), { ...soldier, model: 3 }] } })).toThrow("malformed");
    expect(readTrustAnswer({ trust: { rows: [file(HASH_A), server, soldier] } })).toBeDefined();
    expect(readTrustAnswer({ status: "completed" })).toBeUndefined();
    expect(readTrustAnswer(undefined)).toBeUndefined();
  });
});

describe("a command that gets the trust answer", () => {
  it("asks, sends the trust request, and then repeats the command", async () => {
    const t = terminal("Trust these files\n");
    t.client.request.mockResolvedValueOnce(card()).mockResolvedValueOnce({}).mockResolvedValueOnce({ opened: true });
    await expect(requestWithTrust({ action: "open", soldier: "scout" }, t)).resolves.toEqual({ done: true, result: { opened: true } });
    expect(t.client.request.mock.calls.map(([command]) => command)).toEqual([
      { action: "open", soldier: "scout" },
      { action: "trust", hashes: [HASH_A, HASH_B] },
      { action: "open", soldier: "scout" },
    ]);
  });

  it("starts nothing when the answer is anything else", async () => {
    const t = terminal("Not now\n");
    t.client.request.mockResolvedValueOnce(card());
    const outcome = await requestWithTrust({ action: "send", soldier: "scout", text: "go" }, t);
    expect(outcome.done).toBe(false);
    expect(t.client.request).toHaveBeenCalledTimes(1);
  });

  it("shows the card again with the new hash when a file changed after it was shown", async () => {
    const t = terminal("Trust these files\nTrust these files\n");
    const newer = "9".repeat(64);
    t.client.request.mockResolvedValueOnce(card()).mockResolvedValueOnce({}).mockResolvedValueOnce(card(newer)).mockResolvedValueOnce({}).mockResolvedValueOnce({ ok: 1 });
    await expect(requestWithTrust({ action: "open", soldier: "scout" }, t)).resolves.toEqual({ done: true, result: { ok: 1 } });
    expect(t.printed()).toContain("999999999999");
    expect(t.client.request).toHaveBeenCalledWith({ action: "trust", hashes: [newer, HASH_B] });
  });

  it("gives up after five cards that each go stale, but repeats the command after the fifth accepted card (C5)", async () => {
    const t = terminal("Trust these files\n".repeat(6));
    t.client.request.mockImplementation(async (command) => command.action === "trust" ? {} : card());
    const outcome = await requestWithTrust({ action: "open", soldier: "scout" }, t);
    expect(outcome.done).toBe(false);
    expect(t.client.request.mock.calls.filter(([command]) => command.action === "trust")).toHaveLength(5);
    expect(t.client.request.mock.calls.filter(([command]) => command.action === "open")).toHaveLength(6);
    expect(t.client.request.mock.calls.at(-1)![0]).toEqual({ action: "open", soldier: "scout" });
    expect(t.printed().split("Trust this folder's Shadow Army files?").length - 1).toBe(5);
  });

  it("completes the command when the repeat after the fifth accepted card is clean (C5)", async () => {
    const t = terminal("Trust these files\n".repeat(5));
    let opens = 0;
    t.client.request.mockImplementation(async (command) => command.action === "trust" ? {} : ++opens <= 5 ? card() : { opened: true });
    await expect(requestWithTrust({ action: "open", soldier: "scout" }, t)).resolves.toEqual({ done: true, result: { opened: true } });
  });

  it("does not repeat the command once interrupted after an accepted answer (C2)", async () => {
    const t = terminal("Trust these files\n");
    const abort = new AbortController();
    t.client.request.mockImplementation(async (command) => { if (command.action === "trust") abort.abort(); return command.action === "trust" ? {} : card(); });
    const outcome = await requestWithTrust({ action: "open", soldier: "scout" }, { ...t, signal: abort.signal });
    expect(outcome.done).toBe(false);
    expect(t.client.request.mock.calls.map(([command]) => command.action)).toEqual(["open", "trust"]);
  });

  it("accepts nothing, instead of waiting, when the input had already ended before the card (C2)", async () => {
    const t = terminal();
    t.input.end(); t.input.resume();
    await once(t.input, "end");
    await new Promise((resolve) => setImmediate(resolve));
    t.client.request.mockResolvedValueOnce(card());
    const outcome = await requestWithTrust({ action: "open", soldier: "scout" }, t);
    expect(outcome.done).toBe(false);
    expect(t.client.request).toHaveBeenCalledTimes(1);
  });

  it("accepts nothing on a second card when the input ended after the first answer (C2)", async () => {
    const t = terminal("Trust these files\n");
    t.input.end();
    t.client.request.mockImplementation(async (command) => command.action === "trust" ? { } : card());
    const outcome = await requestWithTrust({ action: "open", soldier: "scout" }, t);
    expect(outcome.done).toBe(false);
    expect(t.client.request.mock.calls.filter(([command]) => command.action === "trust")).toHaveLength(1);
  });
});

describe("sa live with a trust card", () => {
  const realStdin = Object.getOwnPropertyDescriptor(process, "stdin")!;
  afterEach(() => { Object.defineProperty(process, "stdin", realStdin); });
  function run(stdin: PassThrough, args: string[]) {
    Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
    let printed = "";
    let stderr = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { printed += String(chunk); return true; });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => { stderr += String(chunk); return true; });
    vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => { printed += `${parts.join(" ")}\n`; });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const program = new Command(); registerLiveCommand(program);
    return { running: program.parseAsync(["node", "sa", "live", ...args]), printed: () => printed, stderr: () => stderr, errors };
  }
  const actions = () => fake.request.mock.calls.map(([command]) => command.action);

  it("opens and sends once the owner types Trust these files", async () => {
    let needed = true;
    fake.request.mockImplementation(async (command) => command.action === "open" && needed ? card() : command.action === "send" ? { status: "completed", text: "done", refusal: false } : (needed = false, {}));
    const stdin = new PassThrough(); stdin.end("Trust these files\n");
    const live = run(stdin, ["scout", "the task"]);
    await live.running;
    expect(actions()).toEqual(["open", "trust", "open", "send"]);
    expect(live.printed()).toContain("Trust this folder's Shadow Army files?");
    expect(live.printed()).toContain("done");
    expect(process.exitCode).toBe(originalExitCode);
  });

  it.each([["Not now\n"], ["\n"], [""], ["trust these files\n"]])("starts nothing on %j, and says why", async (typed) => {
    fake.request.mockImplementation(async () => card());
    const stdin = new PassThrough(); stdin.end(typed);
    const live = run(stdin, ["scout", "the task"]);
    await live.running;
    expect(actions()).toEqual(["open"]);
    expect(live.errors.mock.calls.flat().join("\n")).toContain("Nothing was started");
    expect(process.exitCode).toBe(1);
  });

  it("asks again in the interactive form when a send gets the card, and reads the answer from the same input", async () => {
    let sends = 0;
    fake.request.mockImplementation(async (command) => command.action === "send" ? (sends++ === 0 ? card() : { status: "completed", text: "reply", refusal: false }) : {});
    const stdin = new PassThrough();
    const live = run(stdin, ["scout"]);
    stdin.write("hello\n");
    await vi.waitFor(() => expect(live.printed()).toContain("Trust this folder's Shadow Army files?"));
    stdin.write("Trust these files\n");
    await vi.waitFor(() => expect(live.printed()).toContain("reply"));
    stdin.end("/exit\n");
    await live.running;
    expect(actions()).toEqual(["open", "send", "trust", "send"]);
    expect(fake.request.mock.calls.filter(([command]) => command.action === "send").map(([command]) => (command as { text?: string }).text)).toEqual(["hello", "hello"]);
  });

  it("sends interrupt, and does not end a question, when Ctrl+C arrives while a turn runs with no card shown (C1)", async () => {
    let release!: (result: unknown) => void;
    fake.request.mockImplementation((command) => command.action === "send" ? new Promise((resolve) => { release = resolve; }) : Promise.resolve({}));
    const live = run(new PassThrough(), ["scout", "the task"]);
    await vi.waitFor(() => expect(actions()).toContain("send"));
    process.emit("SIGINT");
    await vi.waitFor(() => expect(fake.request).toHaveBeenCalledWith({ action: "interrupt", soldier: "scout" }));
    release({ status: "completed", text: "done", refusal: false });
    await live.running;
    expect(live.printed()).toContain("done");
    expect(live.printed()).not.toContain("Trust this folder's");
  });

  it("ends the question, and sends no interrupt, when Ctrl+C arrives while a card waits for its answer (C1)", async () => {
    fake.request.mockImplementation(async (command) => command.action === "send" ? card() : {});
    const live = run(new PassThrough(), ["scout", "the task"]);
    await vi.waitFor(() => expect(live.printed()).toContain("Trust this folder's Shadow Army files?"));
    process.emit("SIGINT");
    await live.running;
    expect(actions()).toEqual(["open", "send"]);
    expect(live.errors.mock.calls.flat().join("\n")).toContain("interrupted");
    expect(process.exitCode).toBe(1);
  });

  it("answers a card that arrives after the interactive input has ended without waiting for a line (C2)", async () => {
    let release!: (result: unknown) => void;
    fake.request.mockImplementation((command) => command.action === "send" ? new Promise((resolve) => { release = resolve; }) : Promise.resolve({}));
    const stdin = new PassThrough();
    const live = run(stdin, ["scout"]);
    stdin.write("hello\n");
    await vi.waitFor(() => expect(actions()).toContain("send"));
    stdin.end();
    await vi.waitFor(() => expect(fake.close).toHaveBeenCalled());
    release(card());
    await live.running;
    expect(actions()).toEqual(["open", "send"]);
    expect(live.errors.mock.calls.flat().join("\n")).toContain("Nothing was started");
    expect(process.exitCode).toBe(1);
  });

  it("keeps the prompt off stdout with --json, accepted or declined (C6)", async () => {
    let needed = true;
    fake.request.mockImplementation(async (command) => command.action === "open" && needed ? card() : command.action === "send" ? { status: "completed", text: "done", refusal: false } : (needed = false, {}));
    const accepted = run((() => { const s = new PassThrough(); s.end("Trust these files\n"); return s; })(), ["scout", "the task", "--json"]);
    await accepted.running;
    expect(JSON.parse(accepted.printed())).toEqual({ status: "completed", text: "done", refusal: false });
    expect(accepted.stderr()).toContain("Trust this folder's Shadow Army files?");
    vi.restoreAllMocks();
    fake.request.mockReset().mockImplementation(async () => card());
    const declined = run((() => { const s = new PassThrough(); s.end("Not now\n"); return s; })(), ["scout", "the task", "--json"]);
    await declined.running;
    expect(declined.printed()).toBe("");
    expect(declined.stderr()).toContain("Trust this folder's Shadow Army files?");
    expect(declined.errors.mock.calls.flat().join("\n")).toContain("Nothing was started");
    expect(process.exitCode).toBe(1);
  });

  it("does not send a task typed after an interactive open's card was declined", async () => {
    let needed = true;
    fake.request.mockImplementation(async (command) => command.action === "open" && needed ? card() : (needed = false, {}));
    const stdin = new PassThrough(); stdin.end("Not now\nhello\n");
    const live = run(stdin, ["scout"]);
    await live.running;
    expect(actions()).toEqual(["open"]);
    expect(process.exitCode).toBe(1);
  });
});
