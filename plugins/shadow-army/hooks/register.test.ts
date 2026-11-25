import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnResult, WriteOutcome } from "../../../src/v2/channel.js";

/** A turn result in the post office's own type, so a fake cannot drift from what the card reads. */
const turn = (summary: string, write?: Partial<WriteOutcome>): TurnResult => ({
  status: "completed", text: summary, refusal: false, summary,
  ...(write ? { write: { worktree: "w", branch: "shadow/tank", base: "b", claims: ["src/**"], inScope: [], outOfScope: [], reverted: false, leaseLost: false, uncommittedIgnored: false, diff: "", applicable: true, ...write } } : {}),
});

type Handler = (...args: any[]) => any;
const URL_ = "http://127.0.0.1:4321";
const SOLDIERS = [
  { key: "claude-sonnet", name: "Tank", roles: ["build"], supported: true },
  { key: "grok", name: "Beru", roles: ["review"], supported: true },
  { key: "codex", name: "Igris", roles: ["build"], supported: false },
];

/** A fake `$`: the relay's stream, the loopback endpoint and the clock are scripted; nothing real runs. */
async function mod(respond: (command: any) => unknown = () => ({}), env: { cwd?: string; git?: string; hang?: string; host?: string; tools?: Record<string, string>; vars?: Record<string, string>; settingsEnv?: Record<string, string>; refuse?: string; answer?: string | Error | Promise<string>; ownOpen?: boolean } = {}) {
  vi.resetModules();
  const { register } = await import("./register.js");
  const handlers: Record<string, Handler> = {};
  const on = (name: string, optionsOrHandler: unknown, maybe?: Handler) => {
    handlers[name] = (maybe ?? optionsOrHandler) as Handler;
    return { catch: (fallback: Handler) => { handlers[`${name}.catch`] = fallback; } };
  };
  register(on as never);
  const spawns: any[] = [];
  const probes: any[] = [];
  const killed: string[] = [];
  const commands: any[] = [];
  const logs: string[] = [];
  const asks: { question: string; options: any }[] = [];
  const registered: any[] = [];
  const claudeId = { value: "session-1" };
  const every: { ms: number; run: () => void; cancelled: boolean }[] = [];
  const after: { ms: number; run: () => void; cancelled: boolean }[] = [];
  const $ = {
    session: { id: async () => claudeId.value, cwd: async () => env.cwd ?? "/repo", version: async () => env.host ?? "2.1.294" },
    env: { get: async (name: string) => env.vars?.[name] },
    settings: { read: async () => ({ env: env.settingsEnv ?? {} }) },
    plugin: { root: "/x/plugins/shadow-army" },
    fs: { exists: async (path: string) => env.git === undefined || path === `${env.git}/.git` || path.includes("/dist/") },
    clock: {
      every: (ms: number, run: () => void) => { const t = { ms, run, cancelled: false }; every.push(t); return { cancel() { t.cancelled = true; } }; },
      after: (ms: number, run: () => void) => { const t = { ms, run, cancelled: false }; after.push(t); return { cancel() { t.cancelled = true; } }; },
    },
    ui: { log: (line: string) => logs.push(line), ask: async (question: string, options: unknown) => { asks.push({ question, options }); if (env.answer instanceof Error) throw env.answer; return await (env.answer ?? "Trust these files"); } },
    command: { register: async (spec: unknown) => { registered.push(spec); } },
    process: {
      spawn: (options: { argv: string[] }) => {
        if (options.argv[1] === "--version") {
          probes.push(options);
          const tool = env.tools?.[options.argv[0]!] ?? (options.argv[0] === "node" ? "v22.1.0" : "git version 2.43.0");
          if (tool === "missing") throw new Error("not found");
          let end: () => void = () => {};
          const hung = new Promise<void>((done) => { end = done; });
          return {
            async *[Symbol.asyncIterator]() { if (tool === "hang") await hung; else yield { stream: "stdout", text: tool + "\n" }; },
            return: async () => { killed.push(options.argv[0]!); end(); return { done: true }; },
          };
        }
        spawns.push(options);
        let stop: () => void = () => {};
        const closed = new Promise<void>((done) => { stop = done; });
        return {
          async *[Symbol.asyncIterator]() {
            yield { stream: "stdout", text: `${JSON.stringify({ type: "ready", data: { url: URL_ } })}\n` };
            await closed;
          },
          return: async () => { stop(); return { done: true }; },
        };
      },
    },
    http: {
      fetch: async (_url: string, init: { body: string }) => {
        if (env.refuse) throw new Error(env.refuse);
        const command = JSON.parse(init.body);
        commands.push(command);
        if (command.action === env.hang) await new Promise(() => {});
        if (command.action === "army") return { ok: true, status: 200, text: JSON.stringify({ result: SOLDIERS }) };
        if (command.action === "open" && !env.ownOpen) return { ok: true, status: 200, text: JSON.stringify({ result: { session: "tank-1" } }) };
        try { return { ok: true, status: 200, text: JSON.stringify({ result: respond(command) }) }; }
        catch (error) { return { ok: false, status: 400, text: JSON.stringify({ error: (error as Error).message }) }; }
      },
    },
  };
  const send = async (args: string): Promise<string> => (await handlers["command.run"]!($, { args })).text;
  /** The renewal timer the mod started once the relay was ready (HOST-2), and a tick of it. */
  const heartbeat = () => every.find((t) => !t.cancelled);
  const tick = async () => { heartbeat()!.run(); await new Promise((done) => setTimeout(done, 0)); };
  return { $, handlers, spawns, probes, killed, commands, logs, registered, asks, send, claudeId, every, after, heartbeat, tick };
}

describe("the /send command (M1-AC23)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("registers /send as the slice's command", async () => {
    const { $, handlers, registered } = await mod();
    await handlers["session.start"]!($, {}, async () => undefined);
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ name: "send", immediate: true });
  });

  it("starts the post office on first use, reuses it after, and never puts the credential in argv", async () => {
    const { send, spawns, commands } = await mod(() => ({ status: "completed", summary: "done" }));
    await send("claude-sonnet --claim src/a.ts first brief");
    await send("claude-sonnet --claim src/a.ts second brief");
    expect(spawns).toHaveLength(1);
    expect(spawns[0].argv.join(" ")).toMatch(/modRelay\.js --cwd \/repo$/);
    const bootstrap = JSON.parse(spawns[0].input);
    expect(bootstrap.session).toBe("session-1");
    expect(spawns[0].argv.join(" ")).not.toContain(bootstrap.credential);
    expect(commands.filter((c) => c.action === "send")).toHaveLength(2);
  });

  it("sends the brief and every claim to the named soldier, by name or key", async () => {
    const { send, commands } = await mod(() => ({ status: "completed", summary: "ok" }));
    await send("Tank --claim src/a.ts --claim docs/** write the parser");
    expect(commands.find((c) => c.action === "send")).toEqual({ action: "send", soldier: "claude-sonnet", text: "write the parser", claims: ["src/a.ts", "docs/**"] });
  });

  it("opens the soldier with the command's claims, so the post office makes it a write session", async () => {
    const { send, commands } = await mod(() => ({ status: "completed", summary: "ok" }));
    await send("Tank --claim src/a.ts --claim docs/** write the parser");
    expect(commands.find((c) => c.action === "open")).toEqual({ action: "open", soldier: "claude-sonnet", claims: ["src/a.ts", "docs/**"] });
  });

  it("sends nothing, and says why, with no claim, no brief, an unknown soldier or one that cannot build", async () => {
    const { send, spawns, commands } = await mod();
    expect(await send("")).toMatch(/^Usage: \/send/);
    expect(await send("claude-sonnet do it")).toMatch(/needs at least one --claim/);
    expect(spawns).toHaveLength(0);
    expect(await send("nobody --claim a do it")).toMatch(/unknown soldier/);
    expect(await send("grok --claim a do it")).toMatch(/Beru is not a claude soldier with the build role/);
    expect(await send("codex --claim a do it")).toMatch(/Igris is not a claude soldier/);
    expect(commands.some((c) => c.action === "send")).toBe(false);
  });

  it("shows a post office refusal as one row, with the credential redacted", async () => {
    const { send, spawns } = await mod(() => { throw new Error("claims overlap Tank's"); });
    const row = await send("claude-sonnet --claim a do it");
    expect(row).toContain("Shadow Army: claims overlap Tank's");
    expect(row).not.toContain(JSON.parse(spawns[0].input).credential);
  });

  it("releases the lease at the session's end", async () => {
    const { $, handlers, send, commands } = await mod(() => ({ status: "completed" }));
    await send("claude-sonnet --claim a do it");
    await handlers["session.end"]!($, { sessionId: "session-1" }, async () => undefined);
    expect(commands.at(-1)).toEqual({ action: "release", session: "session-1" });
  });
});

describe("the lease renewals (M1b-14, HOST-2, M1-AC1, M1-AC9)", () => {
  const renewals = (commands: any[]) => commands.filter((c) => c.action === "renew");

  it("renews every 10 seconds with the army's id", async () => {
    const { send, heartbeat, tick, commands } = await mod(() => ({ status: "completed" }));
    await send("claude-sonnet --claim a go");
    expect(heartbeat()!.ms).toBe(10_000);
    await tick(); await tick();
    expect(renewals(commands)).toEqual([{ action: "renew", session: "session-1" }, { action: "renew", session: "session-1" }]);
  });

  it("keeps at most one renewal waiting, and skips one that falls due meanwhile", async () => {
    const { send, tick, commands } = await mod(() => ({}), { hang: "renew" });
    await send("claude-sonnet --claim a go").catch(() => {});
    await tick(); await tick(); await tick();
    expect(renewals(commands)).toHaveLength(1);
  });

  it("stops counting a renewal as waiting after 5 seconds, and the next renewal then goes", async () => {
    const { send, tick, after, commands } = await mod(() => ({}), { hang: "renew" });
    await send("claude-sonnet --claim a go").catch(() => {});
    await tick();
    const wait = after.find((t) => t.ms === 5_000)!;
    expect(wait).toBeDefined();
    wait.run();
    await tick();
    expect(renewals(commands)).toHaveLength(2);
  });

  it("does not stop on a failed renewal and does not retry it early", async () => {
    let n = 0;
    const { send, tick, commands, heartbeat, logs } = await mod((c) => { if (c.action === "renew" && ++n === 1) throw new Error("lease busy"); return { status: "completed" }; });
    await send("claude-sonnet --claim a go");
    await tick();
    expect(renewals(commands)).toHaveLength(1);
    expect(heartbeat()).toBeDefined();
    expect(logs).toEqual([]);
    await tick();
    expect(renewals(commands)).toHaveLength(2);
  });

  it("keeps renewing with the army's id after /clear, and reuses the same post office", async () => {
    const { $, handlers, send, claudeId, tick, commands, spawns } = await mod(() => ({ status: "completed" }));
    await send("claude-sonnet --claim a go");
    claudeId.value = "session-2";
    await handlers["session.end"]!($, { sessionId: "session-1", reason: "clear" }, async () => undefined);
    await tick();
    await send("claude-sonnet --claim a go");
    expect(commands.some((c) => c.action === "release")).toBe(false);
    expect(renewals(commands)).toEqual([{ action: "renew", session: "session-1" }]);
    expect(spawns).toHaveLength(1);
  });

  it("keeps renewing at a resume", async () => {
    const { $, handlers, send, tick, commands } = await mod(() => ({ status: "completed" }));
    await send("claude-sonnet --claim a go");
    await handlers["session.end"]!($, { sessionId: "session-1", reason: "resume" }, async () => undefined);
    await tick();
    expect(commands.some((c) => c.action === "release")).toBe(false);
    expect(renewals(commands)).toHaveLength(1);
  });

  it.each(["logout", "prompt_input_exit", "other"])("stops renewing, then releases with the reason, at a %s end", async (reason) => {
    const { $, handlers, send, every, commands } = await mod(() => ({ status: "completed" }));
    await send("claude-sonnet --claim a go");
    await handlers["session.end"]!($, { sessionId: "session-1", reason }, async () => undefined);
    expect(every.every((t) => t.cancelled)).toBe(true);
    expect(commands.at(-1)).toEqual({ action: "release", session: "session-1", reason });
  });

  it("releases with the army's id even when Claude's id has changed", async () => {
    const { $, handlers, send, claudeId, commands } = await mod(() => ({ status: "completed" }));
    await send("claude-sonnet --claim a go");
    claudeId.value = "session-2";
    await handlers["session.end"]!($, { sessionId: "session-2", reason: "logout" }, async () => undefined);
    expect(commands.at(-1)).toMatchObject({ action: "release", session: "session-1" });
  });

  it("registers nothing, starts nothing and sends nothing in a session that is not interactive (M1-AC9)", async () => {
    const { $, handlers, registered, spawns, commands, every } = await mod();
    await handlers["session.start"]!($, { isInteractive: false }, async () => undefined);
    const next = vi.fn(async () => undefined);
    await handlers["command.run"]!($, { args: "claude-sonnet --claim a go" }, next);
    await handlers["session.end"]!($, { sessionId: "session-1", reason: "logout" }, async () => undefined);
    expect(registered).toEqual([]);
    expect(next).toHaveBeenCalled();
    expect(spawns).toEqual([]);
    expect(commands).toEqual([]);
    expect(every).toEqual([]);
  });

  it("still registers when isInteractive is false but a surface is present", async () => {
    const { $, handlers, registered } = await mod();
    await handlers["session.start"]!($, { isInteractive: false, surface: "pane" }, async () => undefined);
    expect(registered).toHaveLength(1);
  });
});

describe("the summary card (M1-AC25, SEC-6)", () => {
  it("holds the soldier, at most five summary lines, the log path and the files applied", async () => {
    const summary = ["1", "2", "3", "4", "5", "6", "7"].join("\n");
    const { send } = await mod(() => turn(summary, { apply: { applied: true, files: [{ change: "M", path: "src/a.ts" }, { change: "A", path: "src/b.ts" }] } }));
    const row = await send("claude-sonnet --claim src/** go");
    expect(row).toBe(`Shadow Army · Tank · completed\n1\n2\n3\n4\n5\nLog: /repo/.shadow/v2/logs/tank-1.jsonl\nApplied: src/a.ts, src/b.ts`);
  });

  it("gives the reason when nothing was applied, and names a reverted file", async () => {
    const { send } = await mod(() => turn("s", { outOfScope: ["docs/x.md"], reverted: true, apply: { applied: false, reason: "your folder has changes to the same files", clashes: ["src/a.ts"] } }));
    const row = await send("claude-sonnet --claim src/** go");
    expect(row).toContain("Not applied: your folder has changes to the same files: src/a.ts");
    expect(row).toContain("Reverted, outside its claims: docs/x.md");
  });

  it("shows each Cc and Cf character as a placeholder and keeps newline and tab", async () => {
    const hostile = "a\u001b[31mred‮drawer​z\ttab\nnext\u0007";
    const { send } = await mod(() => turn(hostile, { apply: { applied: true, files: [{ change: "A", path: "we‮ird.ts" }] } }));
    const row = await send("claude-sonnet --claim src/** go");
    expect(row).toContain("a\\u{1b}[31mred\\u{202e}drawer\\u{200b}z\ttab\nnext\\u{7}");
    expect(row).toContain("we\\u{202e}ird.ts");
    expect(row).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f​‮]/);
  });

  it("falls back to the error text for a failed turn with no summary", async () => {
    const { send } = await mod(() => ({ status: "failed", error: { message: "read-only guard failed" } }));
    expect(await send("claude-sonnet --claim a go")).toContain("Shadow Army · Tank · failed\nread-only guard failed\n");
  });

  it("names the log under the repository root when Claude started in a subfolder (W12-5)", async () => {
    const { send } = await mod(() => turn("s", { apply: { applied: true, files: [{ change: "M", path: "a.ts" }] } }), { cwd: "/repo/packages/app", git: "/repo" });
    expect(await send("claude-sonnet --claim a.ts go")).toContain("\nLog: /repo/.shadow/v2/logs/tank-1.jsonl\n");
  });

  it("shows the audit's error when the turn has a reply but no write outcome (W12-6a)", async () => {
    const { send } = await mod(() => ({ ...turn("I edited it"), error: { kind: "other", message: "claim audit could not complete: a folder on its path is a link" } }));
    const row = await send("claude-sonnet --claim a go");
    expect(row).toContain("I edited it\nError: claim audit could not complete: a folder on its path is a link\n");
    expect(row).toContain("Not applied: claim audit could not complete: a folder on its path is a link");
  });

  it("shows the error of a failed turn that has a reply, and none for a clean completion", async () => {
    const failed = await mod(() => ({ ...turn("partial", { reverted: false }), status: "failed", error: { kind: "rate_limit", message: "429 too many requests" } }));
    expect(await failed.send("claude-sonnet --claim a go")).toContain("partial\nError: 429 too many requests\n");
    const clean = await mod(() => turn("fine", { apply: { applied: true, files: [{ change: "M", path: "a.ts" }] } }));
    const row = await clean.send("claude-sonnet --claim a go");
    expect(row).not.toContain("Error:"); expect(row).not.toContain("refused");
  });

  it("marks a refusal as refused although its status is completed (W12-6b)", async () => {
    const { send } = await mod(() => ({ ...turn("I can't help with that."), refusal: true }));
    expect(await send("claude-sonnet --claim a go")).toContain("Shadow Army · Tank · completed (refused)\nI can't help with that.\n");
  });
});

describe("the mod's preflight (HOST-2, M1b-29)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  const cases: [string, Parameters<typeof mod>[1], RegExp][] = [
    ["host 2.1.293", { host: "2.1.293" }, /^Shadow Army needs Claude Code 2\.1\.294 or later; this is 2\.1\.293$/],
    ["no node", { tools: { node: "missing" } }, /^Shadow Army needs Node\.js 22\.0 or later on PATH; none was found$/],
    ["Node.js 20", { tools: { node: "v20.11.0" } }, /needs Node\.js 22\.0 or later on PATH; found 20\.11\.0$/],
    ["git 2.33", { tools: { git: "git version 2.33.1" } }, /needs git 2\.34 or later on PATH; found 2\.33\.1$/],
  ];
  it.each(cases)("starts nothing with %s and shows the line naming what is needed", async (_name, env, line) => {
    const { send, spawns, logs } = await mod(() => ({}), env);
    expect(await send("claude-sonnet --claim a go")).toMatch(line);
    expect(spawns).toHaveLength(0);
    expect(logs[0]).toMatch(line);
  });

  it("ends a --version that never exits after 10 s, with its process, and says so", async () => {
    const { send, after, killed, spawns } = await mod(() => ({}), { tools: { git: "hang" } });
    const pending = send("claude-sonnet --claim a go");
    await new Promise((done) => setTimeout(done, 0));
    after.find((t) => t.ms === 10_000 && !t.cancelled)!.run();
    expect(await pending).toMatch(/git --version gave no answer in 10 s · Shadow Army needs git 2\.34 or later on PATH; none was found$/);
    expect(killed).toEqual(["git"]);
    expect(spawns).toHaveLength(0);
  });

  it.each([
    ["HTTPS_PROXY", { vars: { HTTPS_PROXY: "http://p:8080", NO_PROXY: "example.com" } }],
    ["http_proxy", { settingsEnv: { http_proxy: "http://p:8080" } }],
  ])("names %s and the entry to add, and starts nothing", async (name, env) => {
    const { send, spawns } = await mod(() => ({}), env);
    expect(await send("claude-sonnet --claim a go")).toBe(`Shadow Army: ${name} would send the army's commands through a proxy · add 127.0.0.1 to NO_PROXY · nothing started`);
    expect(spawns).toHaveLength(0);
  });

  it("starts with 127.0.0.1 in NO_PROXY", async () => {
    const { send, spawns } = await mod(() => ({ status: "completed", summary: "ok" }), { vars: { HTTPS_PROXY: "http://p:8080", NO_PROXY: "127.0.0.1,localhost" } });
    expect(await send("claude-sonnet --claim a go")).toContain("Tank");
    expect(spawns).toHaveLength(1);
  });

  it("stops with Claude Code's words when it refuses every fetch, and sends nothing more", async () => {
    const { send, logs, spawns, every } = await mod(() => ({}), { refuse: "your organization's policy doesn't allow web fetch" });
    expect(await send("claude-sonnet --claim a go")).toContain("your organization's policy");
    expect(logs).toEqual(["Shadow Army can't reach its post office: Claude Code refused the request (your organization's policy doesn't allow web fetch)"]);
    expect(every.every((t) => t.cancelled)).toBe(true);
    expect(spawns).toHaveLength(1);
  });

  it("ends a post office that never reports ready after 60 s, naming the step, and the next use starts a new one", async () => {
    const { send, after, spawns, logs, $ } = await mod(() => ({ status: "completed", summary: "ok" }));
    const spawn = $.process.spawn as (o: { argv: string[] }) => unknown;
    let silent = true;
    ($ as any).process.spawn = (options: { argv: string[] }) => {
      const real = spawn(options) as any;
      if (!silent || options.argv[1] === "--version") return real;
      return { async *[Symbol.asyncIterator]() { await new Promise(() => {}); }, return: async () => ({ done: true }) };
    };
    const pending = send("claude-sonnet --claim a go");
    await new Promise((done) => setTimeout(done, 0));
    await new Promise((done) => setTimeout(done, 0));
    after.find((t) => t.ms === 60_000)!.run();
    await pending;
    expect(logs[0]).toMatch(/did not report ready within 60 s · step: waiting for its ready event/);
    silent = false;
    expect(await send("claude-sonnet --claim a go")).toContain("Tank");
    expect(spawns).toHaveLength(2);
  });

  it("starts one post office for two uses at once, and neither sees an already-running line", async () => {
    const { send, spawns, probes } = await mod(() => ({ status: "completed", summary: "ok" }));
    const [a, b] = await Promise.all([send("claude-sonnet --claim a one"), send("claude-sonnet --claim b two")]);
    expect(a).toContain("Tank");
    expect(b).toContain("Tank");
    expect(spawns).toHaveLength(1);
    expect(probes).toHaveLength(2);
  });

  it("checks once, before the first start only", async () => {
    const { send, probes } = await mod(() => ({ status: "completed", summary: "ok" }));
    await send("claude-sonnet --claim a one");
    await send("claude-sonnet --claim a two");
    expect(probes).toHaveLength(2);
  });

  it("shows every Cc and Cf character in a refusal's words as a placeholder", async () => {
    const { send, logs } = await mod(() => ({}), { refuse: "no\u001b[31m\u202e web" });
    await send("claude-sonnet --claim a go");
    expect(logs[0]).toContain("no\\u{1b}[31m\\u{202e} web");
  });
});

describe("the mod's trust dialog (ARM-7, M1-AC13)", () => {
  const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64);
  const ROWS = [
    { kind: "file", name: "shadow.config.json", state: "new", hash: A },
    { kind: "file", name: "agent.md", state: "changed", hash: B },
    { kind: "file", name: "rules.md", state: "gone", hash: "" },
    { kind: "soldier", name: "Kaisel", cli: "claude", model: "opus", autonomy: "full" },
    { kind: "server", file: ".mcp.json", name: "docs", target: "npx \u001b[31m‮ evil" },
  ];
  const STALE = "the hashes are not the ones the trust card showed; nothing was accepted";
  /** A fake post office in #143's shape: `open` and `send` answer with the card until `trust` sends its file hashes. */
  const office = (accept: (hashes: string[], state: { rows: any[] }) => unknown = () => ({ ok: true }), rows: any[] = ROWS) => {
    const state = { rows, trusted: false, accepted: [] as string[][], opened: 0, sent: 0 };
    const respond = (command: any) => {
      if (command.action === "trust") {
        state.accepted.push(command.hashes);
        const result = accept(command.hashes, state);
        if ((result as { ok?: unknown } | undefined)?.ok === true) state.trusted = true;
        return result;
      }
      if (!state.trusted && (command.action === "open" || command.action === "send")) return { trust: { rows: state.rows } };
      if (command.action === "open") { state.opened++; return { session: "tank-1" }; }
      if (command.action === "send") state.sent++;
      return { status: "completed", summary: "done" };
    };
    return { state, respond };
  };
  const run = "claude-sonnet --claim a go";
  const later = () => new Promise((done) => setTimeout(done, 0));
  const deferred = () => { let answer: (text: string) => void = () => {}; const promise = new Promise<string>((done) => { answer = done; }); return { promise, answer }; };

  it("shows a row per file, soldier and .mcp.json server with SEC-6 placeholders, then asks with Not now first", async () => {
    const { respond } = office();
    const { send, logs, asks } = await mod(respond, { answer: "Not now", ownOpen: true });
    await send(run);
    expect(logs).toEqual(expect.arrayContaining([
      `Shadow Army · trust · new · shadow.config.json · ${"a".repeat(12)}`, `Shadow Army · trust · changed · agent.md · ${"b".repeat(12)}`,
      "Shadow Army · trust · gone · rules.md", "Shadow Army · trust · soldier · Kaisel · claude · opus · full",
      "Shadow Army · trust · .mcp.json server · docs · npx \\u{1b}[31m\\u{202e} evil"]));
    expect(logs.join("|")).not.toContain("\u001b");
    expect(asks).toHaveLength(1);
    expect(asks[0]!.question).toBe("Trust this folder's Shadow Army files?");
    expect(asks[0]!.options.options).toEqual(["Not now", "Trust these files"]);
  });

  it.each([["Not now"], ["trust these files"], ["Trust these files, and more"], [""], [new Error("dismissed")]])("starts nothing on %s", async (answer) => {
    const { state, respond } = office();
    const { send } = await mod(respond, { answer: answer as string | Error, ownOpen: true });
    expect(await send(run)).toMatch(/Nothing started: the army waits for you to trust this folder's Shadow Army files/);
    expect(state).toMatchObject({ accepted: [], opened: 0, sent: 0 });
  });

  it("accepts exactly the hashes shown on the exact answer, then opens and sends", async () => {
    const { state, respond } = office();
    const { send } = await mod(respond, { answer: "Trust these files", ownOpen: true });
    expect(await send(run)).toMatch(/Shadow Army · Tank · completed/);
    expect(state).toMatchObject({ accepted: [[A, B, ""]], opened: 1, sent: 1 });
  });

  it.each([
    ["no rows", { trust: {} }], ["empty rows", { trust: { rows: [] } }], ["a null card", { trust: null }],
    ["a short hash", { trust: { rows: [{ kind: "file", name: "agent.md", state: "new", hash: "abc" }] } }],
    ["a file that is not a policy file", { trust: { rows: [{ kind: "file", name: "evil.json", state: "new", hash: A }] } }],
    ["no file row", { trust: { rows: [ROWS[3]] } }],
  ])("shows and accepts nothing on a trust answer with %s", async (_name, answer) => {
    const accepted: unknown[] = [];
    const { send, asks } = await mod((c) => { if (c.action === "trust") accepted.push(c); return c.action === "open" ? answer : {}; }, { ownOpen: true });
    expect(await send(run)).toMatch(/trust answer is malformed; nothing was accepted and nothing started/);
    expect(asks).toHaveLength(0);
    expect(accepted).toHaveLength(0);
  });

  it.each([[{ ok: "yes" }], [{}], [undefined]])("starts nothing unless the accept answers ok: true (%j)", async (result) => {
    const { state, respond } = office(() => result);
    const { send } = await mod(respond, { answer: "Trust these files", ownOpen: true });
    expect(await send(run)).toMatch(/did not confirm the trust; nothing was accepted/);
    expect(state).toMatchObject({ opened: 0, sent: 0 });
  });

  it.each([["Not now", 0], ["Trust these files", 2]])("shows one card for two uses at once; %s answers both", async (answer, sent) => {
    const { state, respond } = office();
    const owner = deferred();
    const { send, asks } = await mod(respond, { answer: owner.promise, ownOpen: true });
    const both = Promise.all([send(run), send(run)]);
    for (let i = 0; i < 10; i++) await later();
    expect(asks).toHaveLength(1);
    owner.answer(answer);
    const results = await both;
    expect(asks).toHaveLength(1);
    expect(state.accepted).toHaveLength(sent ? 1 : 0);
    expect(state.sent).toBe(sent);
    if (!sent) for (const result of results) expect(result).toMatch(/Nothing started: the army waits for you/);
  });

  it("accepts nothing and opens nothing when the army ends while the question is open", async () => {
    const { state, respond } = office();
    const owner = deferred();
    const { send, handlers, $ } = await mod(respond, { answer: owner.promise, ownOpen: true });
    const result = send(run);
    for (let i = 0; i < 10; i++) await later();
    await handlers["session.end"]!($, { sessionId: "session-1" }, async () => undefined);
    owner.answer("Trust these files");
    expect(await result).toMatch(/the army ended while the question was open; nothing was accepted/);
    expect(state).toMatchObject({ accepted: [], opened: 0, sent: 0 });
  });

  it("shows the new hashes and asks again when a file changed while the question was open", async () => {
    const { state, respond } = office((hashes, live) => {
      if (hashes[1] === B) { live.rows = ROWS.map((row) => row.name === "agent.md" ? { ...row, hash: C } : row); throw new Error(STALE); }
      return { ok: true };
    });
    const { send, asks, logs } = await mod(respond, { answer: "Trust these files", ownOpen: true });
    expect(await send(run)).toMatch(/Shadow Army · Tank · completed/);
    expect(asks).toHaveLength(2);
    expect(logs).toEqual(expect.arrayContaining([
      "Shadow Army · trust · the files changed while the question was open; these are their new hashes", `Shadow Army · trust · changed · agent.md · ${"c".repeat(12)}`]));
    expect(state).toMatchObject({ accepted: [[A, B, ""], [A, C, ""]], opened: 1, sent: 1 });
  });

  it("stops and says why when the same card's accept is refused", async () => {
    const { state, respond } = office(() => { throw new Error("the trust record can't be written: EACCES"); });
    const { send, asks } = await mod(respond, { answer: "Trust these files", ownOpen: true });
    expect(await send(run)).toMatch(/Nothing started: nothing was accepted, the trust record can't be written: EACCES/);
    expect(asks).toHaveLength(1);
    expect(state).toMatchObject({ opened: 0, sent: 0 });
  });

  it("shows no card when the folder is trusted, and answers a card that meets the send", async () => {
    const quiet = office();
    quiet.state.trusted = true;
    const calm = await mod(quiet.respond, { ownOpen: true });
    expect(await calm.send(run)).toMatch(/Shadow Army · Tank · completed/);
    expect(calm.asks).toHaveLength(0);
    let changed = true;
    const late = await mod((c) => {
      if (c.action === "open") return { session: "tank-1" };
      if (c.action === "trust") { changed = false; return { ok: true }; }
      return changed ? { trust: { rows: ROWS.slice(0, 1) } } : { status: "completed", summary: "done" };
    }, { answer: "Trust these files", ownOpen: true });
    expect(await late.send(run)).toMatch(/Shadow Army · Tank · completed/);
    expect(late.asks).toHaveLength(1);
    expect(late.commands.filter((c) => c.action === "send")).toHaveLength(2);
  });
});
