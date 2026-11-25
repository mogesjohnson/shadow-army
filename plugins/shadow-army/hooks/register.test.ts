import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnResult, WriteOutcome } from "../../../src/v2/channel.js";

/** A turn result in the post office's own type, so a fake cannot drift from what the card reads. */
const turn = (summary: string, write?: Partial<WriteOutcome>): TurnResult => ({
  status: "completed", text: summary, refusal: false, summary,
  ...(write ? { write: { worktree: "w", branch: "shadow/tank", base: "b", claims: ["src/**"], inScope: [], outOfScope: [], reverted: false, leaseLost: false, uncommittedIgnored: false, diff: "", applicable: true, ...write } } : {}),
});

type Handler = (...args: any[]) => any;
/** Lets every promise now ready run, and the timers of the fake's own tasks. */
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((done) => setTimeout(done, 0)); };
const URL_ = "http://127.0.0.1:4321";
const SOLDIERS = [
  { key: "claude-sonnet", name: "Tank", roles: ["build"], supported: true },
  { key: "grok", name: "Beru", roles: ["review"], supported: true },
  { key: "codex", name: "Igris", roles: ["build"], supported: false },
];

const BIN = process.platform === "win32" ? "C:\\tools\\bin" : "/usr/local/bin";
const HOME_ = process.platform === "win32" ? "C:\\Users\\me" : "/home/me";
const PATH_SEPARATOR = process.platform === "win32" ? ";" : ":";
const exeIn = (dir: string, name: string) => `${dir}${dir.includes("\\") ? "\\" : "/"}${name}${process.platform === "win32" ? ".exe" : ""}`;
const toolOf = (argv0: string) => /([^\\/]+?)(?:\.exe)?$/.exec(argv0)![1]!;

/** A fake `$`: the relay's stream, the loopback endpoint and the clock are scripted; nothing real runs. */
type Env = {
  cwd?: string; git?: string; hang?: string; host?: string;
  /** What each tool prints for `--version`, or `missing` (not on PATH), `unspawnable` (found, but cannot start), `hang` (never ends). */
  tools?: Record<string, string>;
  /** An exit code for a tool's `--version`, and what it prints when it is `0`. */
  exits?: Record<string, number>;
  vars?: Record<string, string>; settingsEnv?: Record<string, string>; settingsReads?: { count: number };
  refuse?: string;
  /** Directories where node and git are found, as listed in PATH. */
  dirs?: string[];
  /** `fetch` rejects with this after the first answer. */
  transport?: string;
  /** The relay's end waits for this gate; a promise that never settles leaves it unconfirmed. */
  gate?: Promise<void>;
  /** The relay starts but never reports ready. Read at each start, so a test can change it between two. */
  silent?: boolean;
  /** The relay reports ready only once this settles. */
  late?: Promise<void>;
  /** Where a path really lands (a link, a junction, an 8.3 name or another case); a path not listed lands on itself. */
  real?: Record<string, string>;
  /** Paths that lead nowhere: `$.fs.stat` rejects them. */
  unresolved?: string[];
  /** Paths that are there but land nowhere (a dangling link, or a real path the host withholds): `$.fs.stat` answers without `realPath`. */
  dangling?: string[];
  /** File contents `$.fs.read` returns (git's metadata files); a path not listed, or listed as `undefined`, rejects `ENOENT`. */
  files?: Record<string, string | undefined>;
  /** The folders `$.fs.list` lists, by name; a path not listed rejects `ENOENT`. */
  lists?: Record<string, string[]>;
};
async function mod(respond: (command: any) => unknown = () => ({}), env: Env = {}) {
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
  const relaysEnded: string[] = [];
  const commands: any[] = [];
  /** Every request sent, answered or not; `commands` holds only the answered ones. */
  const attempted: any[] = [];
  /** Relay starts and relay ends, in the order they happened. */
  const order: string[] = [];
  const logs: string[] = [];
  const registered: any[] = [];
  const claudeId = { value: "session-1" };
  const every: { ms: number; run: () => void; cancelled: boolean }[] = [];
  const after: { ms: number; run: () => void; cancelled: boolean }[] = [];
  let answered = false;
  const $ = {
    session: { id: async () => claudeId.value, cwd: async () => env.cwd ?? "/repo", version: async () => env.host ?? "2.1.294" },
    env: { get: async (name: string) => env.vars?.[name] ?? ({ PATH: (env.dirs ?? [BIN]).join(PATH_SEPARATOR), HOME: HOME_, USERPROFILE: HOME_ } as Record<string, string>)[name] },
    settings: { read: async () => { if (env.settingsReads) env.settingsReads.count++; return { env: env.settingsEnv ?? {} }; } },
    plugin: { root: "/x/plugins/shadow-army" },
    fs: {
      exists: async (path: string) => {
        const exe = /^(.*)[\\/](node|git)(?:\.exe)?$/.exec(path);
        if (exe) return (env.dirs ?? [BIN]).includes(exe[1]!) && env.tools?.[exe[2]!] !== "missing";
        return env.git === undefined || path === `${env.git}/.git` || path.includes("/dist/");
      },
      stat: async (path: string, options?: { resolve?: boolean }) => {
        const exe = /^(.*)[\\/](node|git)(?:\.exe)?$/.exec(path);
        const there = !env.unresolved?.includes(path) && (!exe || ((env.dirs ?? [BIN]).includes(exe[1]!) && env.tools?.[exe[2]!] !== "missing"));
        if (!there) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
        if (env.dangling?.includes(path)) return { kind: "other", size: 0, mtimeMs: 0, isLink: true };
        const kind = env.files?.[path] === undefined && /[\\/]\.git$/.test(path) ? "directory" : "file";
        return { kind, size: 0, mtimeMs: 0, isLink: false, ...(options?.resolve ? { realPath: env.real?.[path] ?? path } : {}) };
      },
      read: async (path: string) => {
        const text = env.files?.[path];
        if (text === undefined) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
        return text;
      },
      list: async (path: string) => {
        const names = env.lists?.[path];
        if (!names) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
        return names.map((name) => ({ name, kind: "directory", size: 0, mtimeMs: 0, isLink: false }));
      },
    },
    clock: {
      every: (ms: number, run: () => void) => { const t = { ms, run, cancelled: false }; every.push(t); return { cancel() { t.cancelled = true; } }; },
      after: (ms: number, run: () => void) => { const t = { ms, run, cancelled: false }; after.push(t); return { cancel() { t.cancelled = true; } }; },
    },
    ui: { log: (line: string) => logs.push(line) },
    command: { register: async (spec: unknown) => { registered.push(spec); } },
    process: {
      spawn: (options: { argv: string[] }) => {
        if (options.argv[1] === "--version") {
          probes.push(options);
          const name = toolOf(options.argv[0]!);
          const tool = env.tools?.[name] ?? (name === "node" ? "v22.1.0" : "git version 2.43.0");
          if (tool === "unspawnable") throw new Error("cannot start");
          let end: () => void = () => {};
          const hung = new Promise<void>((done) => { end = done; });
          const run = (async function* () {
            if (tool === "hang") await hung; else yield { stream: "stdout", text: tool + "\n" };
            return { code: env.exits?.[name] ?? 0, signal: null };
          })();
          const origin = run.return.bind(run);
          run.return = (async (value: unknown) => { killed.push(name); end(); return origin(value as never); }) as typeof run.return;
          return run;
        }
        spawns.push(options);
        order.push("relay started");
        let stop: () => void = () => {};
        const closed = new Promise<void>((done) => { stop = done; });
        const relay = (async function* () {
          if (env.late) await env.late;
          if (!env.silent) yield { stream: "stdout", text: `${JSON.stringify({ type: "ready", data: { url: URL_ } })}\n` };
          await closed;
          return { code: null, signal: null };
        })();
        const origin = relay.return.bind(relay);
        relay.return = (async (value: unknown) => { stop(); await env.gate; relaysEnded.push(options.argv[0]!); order.push("relay ended"); return origin(value as never); }) as typeof relay.return;
        return relay;
      },
    },
    http: {
      fetch: async (_url: string, init: { body: string }) => {
        attempted.push(JSON.parse(init.body));
        if (env.refuse) throw new Error(env.refuse);
        if (env.transport && answered) throw new Error(env.transport);
        answered = true;
        const command = JSON.parse(init.body);
        commands.push(command);
        if (command.action === env.hang) await new Promise(() => {});
        if (command.action === "army") return { ok: true, status: 200, text: JSON.stringify({ result: SOLDIERS }) };
        if (command.action === "open") return { ok: true, status: 200, text: JSON.stringify({ result: { session: "tank-1" } }) };
        try { return { ok: true, status: 200, text: JSON.stringify({ result: respond(command) }) }; }
        catch (error) { return { ok: false, status: 400, text: JSON.stringify({ error: (error as Error).message }) }; }
      },
    },
  };
  const send = async (args: string): Promise<string> => (await handlers["command.run"]!($, { args })).text;
  /** The renewal timer the mod started once the relay was ready (HOST-2), and a tick of it. */
  const heartbeat = () => every.find((t) => !t.cancelled);
  const tick = async () => { heartbeat()!.run(); await new Promise((done) => setTimeout(done, 0)); };
  return { $, handlers, spawns, probes, killed, relaysEnded, commands, attempted, order, logs, registered, send, claudeId, every, after, heartbeat, tick };
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
    const env: Env = { silent: true };
    const { send, after, spawns, logs, relaysEnded } = await mod(() => ({ status: "completed", summary: "ok" }), env);
    const pending = send("claude-sonnet --claim a go");
    await flush();
    after.find((t) => t.ms === 60_000)!.run();
    await pending;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/did not report ready within 60 s · step: waiting for its ready event · relay ended$/);
    expect(logs[0]).not.toContain("ended with its processes");
    expect(relaysEnded).toHaveLength(1);
    env.silent = false;
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

/** Every Cc and Cf character but newline and tab, read from this Node's own Unicode data, not from the module's table (M1-AC12). */
const CONTROL_AND_FORMAT: number[] = [];
for (let code = 0; code <= 0x10ffff; code++) {
  if (code !== 9 && code !== 10 && /^[\p{Cc}\p{Cf}]$/u.test(String.fromCodePoint(code))) CONTROL_AND_FORMAT.push(code);
}
const SEP = process.platform === "win32" ? "\\" : "/";
const ROOT = process.platform === "win32" ? "C:\\work\\repo" : "/repo";
const isAbsolutePath = (path: string) => process.platform === "win32" ? /^[A-Za-z]:\\/.test(path) : path.startsWith("/");
const OK = () => ({ status: "completed", summary: "ok" });

describe("the executables the preflight vets (HOST-2, CH-1, C1)", () => {
  it("runs both probes by absolute path and starts the relay with the same Node.js", async () => {
    const { send, probes, spawns } = await mod(OK);
    await send("claude-sonnet --claim a go");
    expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
    expect(spawns[0].argv[0]).toBe(probes[0].argv[0]);
    for (const run of [...probes, ...spawns]) expect(isAbsolutePath(run.argv[0])).toBe(true);
  });

  it("skips empty, relative, repository, worktree and .shadow PATH entries, though each holds node and git", async () => {
    const dirs = [
      "", `relative${SEP}bin`, ROOT, [ROOT, "node_modules", ".bin"].join(SEP), [ROOT, ".shadow", "snap", "bin"].join(SEP),
      `${ROOT}-worktrees${SEP}x${SEP}bin`, BIN,
    ];
    const { send, probes, spawns } = await mod(OK, { cwd: ROOT, dirs });
    await send("claude-sonnet --claim a go");
    expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
    expect(spawns[0].argv[0]).toBe(exeIn(BIN, "node"));
  });

  it("runs no probe at all when git is missing", async () => {
    const { send, probes, spawns } = await mod(OK, { tools: { git: "missing" } });
    expect(await send("claude-sonnet --claim a go")).toMatch(/^Shadow Army needs git 2\.34 or later on PATH; none was found$/);
    expect(probes).toEqual([]);
    expect(spawns).toEqual([]);
  });

  describe("canonical paths (C1)", () => {
    const where = (...parts: string[]) => parts.join(SEP);
    const ALIAS = process.platform === "win32" ? "C:\\links\\bin" : "/links/bin";
    const SAFE = process.platform === "win32" ? "C:\\safe\\bin" : "/safe/bin";
    const RELEASED = process.platform === "win32" ? "C:\\real\\bin" : "/real/bin";
    const launched = async (env: Env) => {
      const run = await mod(OK, { cwd: ROOT, ...env });
      const line = await run.send("claude-sonnet --claim a go");
      return { ...run, line };
    };

    it("refuses an entry that is an alias of a folder in the repository, though its own spelling is outside it", async () => {
      const { probes, spawns } = await launched({ dirs: [ALIAS, BIN], real: { [ALIAS]: where(ROOT, "bin") } });
      expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
      expect(spawns[0].argv[0]).toBe(exeIn(BIN, "node"));
    });

    it("refuses an entry that is an alias of a worktree folder and of a snapshot", async () => {
      const { probes } = await launched({
        dirs: [ALIAS, SAFE, BIN], real: { [ALIAS]: where(`${ROOT}-worktrees`, "w1", "bin"), [SAFE]: where(ROOT, ".shadow", "snap", "bin") },
      });
      expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
    });

    it("refuses an executable that is itself an alias of one in the repository, in a folder outside it", async () => {
      const { probes } = await launched({ dirs: [SAFE, BIN], real: { [exeIn(SAFE, "node")]: exeIn(where(ROOT, "bin"), "node"), [exeIn(SAFE, "git")]: exeIn(where(ROOT, "bin"), "git") } });
      expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
    });

    it("compares against the repository's real path when the working folder is itself a link", async () => {
      const real = process.platform === "win32" ? "D:\\data\\repo" : "/data/repo";
      const { probes } = await launched({ dirs: [where(real, "bin"), BIN], real: { [ROOT]: real } });
      expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
    });

    it("drops an entry that does not resolve, though the executables are listed under it", async () => {
      const { probes } = await launched({ dirs: [ALIAS, BIN], unresolved: [ALIAS] });
      expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
    });

    it("drops an executable that does not resolve, and starts nothing when no entry has a resolvable one", async () => {
      const { probes, spawns, line } = await launched({ dirs: [BIN], unresolved: [exeIn(BIN, "node")] });
      expect(line).toMatch(/^Shadow Army needs Node\.js 22\.0 or later on PATH; none was found$/);
      expect(probes).toEqual([]);
      expect(spawns).toEqual([]);
    });

    it("matches a differently cased real path on Windows and macOS only", async () => {
      const upper = ROOT.toUpperCase();
      const { probes } = await launched({ dirs: [ALIAS, BIN], real: { [ALIAS]: where(upper, "bin") } });
      const refused = process.platform !== "linux";
      expect(probes[0]!.argv[0]).toBe(exeIn(refused ? BIN : ALIAS, "node"));
    });

    it("refuses an entry in the worktrees folder's real storage when that folder is itself a link (C1, review 18)", async () => {
      const store = process.platform === "win32" ? "E:\\store\\trees" : "/store/trees";
      const { probes } = await launched({ dirs: [where(store, "w1", "bin"), BIN], real: { [`${ROOT}-worktrees`]: store } });
      expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
    });

    it("still starts when there is no worktrees folder", async () => {
      const { probes, spawns } = await launched({ unresolved: [`${ROOT}-worktrees`] });
      expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
      expect(spawns).toHaveLength(1);
    });

    it.each([["the worktrees folder is there but leads nowhere", { dangling: [`${ROOT}-worktrees`] }], ["the working folder does not resolve", { unresolved: [ROOT] }]])(
      "starts nothing when %s", async (_case, env) => {
        const { probes, spawns, line } = await launched(env);
        expect(line).toMatch(/^Shadow Army: .+ does not resolve to a real path · nothing started$/);
        expect(probes).toEqual([]);
        expect(spawns).toEqual([]);
      });

    it("probes and starts the relay with the resolved path, not the spelling found on PATH", async () => {
      const { probes, spawns } = await launched({
        dirs: [ALIAS], real: { [exeIn(ALIAS, "node")]: exeIn(RELEASED, "node"), [exeIn(ALIAS, "git")]: exeIn(RELEASED, "git") },
      });
      expect(probes.map((p) => p.argv[0])).toEqual([exeIn(RELEASED, "node"), exeIn(RELEASED, "git")]);
      expect(spawns[0].argv[0]).toBe(exeIn(RELEASED, "node"));
    });

    describe("the repository's whole layout, read from git's own files (C9, review 21)", () => {
      const fwd = (path: string) => path.replace(/\\/g, "/");
      const LINKED = process.platform === "win32" ? "D:\\elsewhere\\w9" : "/elsewhere/w9";
      const OTHER = process.platform === "win32" ? "E:\\other\\w2" : "/other/w2";
      const ADMIN = `${fwd(ROOT)}/.git/worktrees`;
      const linked = (files: Record<string, string | undefined> = {}): Env => ({
        cwd: LINKED, lists: { [ADMIN]: ["w9", "w2"] },
        files: {
          [`${LINKED}/.git`]: `gitdir: ${ADMIN}/w9\n`, [`${ADMIN}/w9/gitdir`]: `${fwd(LINKED)}/.git\n`, [`${ADMIN}/w9/commondir`]: "../..\n",
          [`${ADMIN}/w2/gitdir`]: `${fwd(OTHER)}/.git\n`, ...files,
        },
      });

      it("refuses entries in the main checkout, its worktrees folder and every registered worktree from a linked checkout", async () => {
        const dirs = [where(ROOT, "bin"), where(`${ROOT}-worktrees`, "x", "bin"), where(OTHER, "bin"), BIN];
        const { probes, spawns } = await launched({ ...linked(), dirs });
        expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
        expect(spawns).toHaveLength(1);
      });

      it.each([
        ["its .git file names no git folder", { [`${LINKED}/.git`]: "nonsense\n" }],
        ["its git folder does not name it back", { [`${ADMIN}/w9/gitdir`]: "/somewhere/else/.git\n" }],
        ["its git folder has no commondir", { [`${ADMIN}/w9/commondir`]: undefined }],
        ["a registered worktree's gitdir cannot be read", { [`${ADMIN}/w2/gitdir`]: undefined }],
      ])("starts nothing from a linked checkout when %s", async (_case, files) => {
        const { probes, spawns, line } = await launched(linked(files));
        expect(line).toMatch(/^Shadow Army: .+ · nothing started$/);
        expect(probes).toEqual([]);
        expect(spawns).toEqual([]);
      });
    });

    describe("snapshot roots outside the checkout (C10, review 21)", () => {
      const MOVED = process.platform === "win32" ? "F:\\snaps" : "/snaps";

      it("refuses entries in the default snapshot root and in the one SHADOW_ARMY_SNAPSHOTS names", async () => {
        const dirs = [where(HOME_, ".shadow-army", "snapshots", "repo-0a1b2c3d4e5f", "s1", "bin"), where(MOVED, "repo-0a1b2c3d4e5f", "s1", "bin"), BIN];
        const { probes } = await launched({ dirs, vars: { SHADOW_ARMY_SNAPSHOTS: MOVED } });
        expect(probes.map((p) => p.argv[0])).toEqual([exeIn(BIN, "node"), exeIn(BIN, "git")]);
      });

      it.each([["no home folder is known", { HOME: "", USERPROFILE: "" }], ["SHADOW_ARMY_SNAPSHOTS is relative", { SHADOW_ARMY_SNAPSHOTS: "snaps" }]])(
        "starts nothing when %s", async (_case, vars) => {
          const { probes, spawns, line } = await launched({ vars });
          expect(line).toMatch(/^Shadow Army: .+ · nothing started$/);
          expect(probes).toEqual([]);
          expect(spawns).toEqual([]);
        });
    });
  });
});

describe("what a version run must show (HOST-2, C2)", () => {
  it.each([["node", "Node\\.js 22\\.0", { node: 1 }, 1], ["git", "git 2\\.34", { git: 128 }, 128]])(
    "starts nothing when %s prints a supported version and then exits nonzero", async (_tool, needs, exits, code) => {
      const { send, spawns, logs } = await mod(OK, { exits });
      const line = new RegExp(`^Shadow Army needs ${needs} or later on PATH; .*${_tool}(?:\\.exe)? --version did not exit cleanly \\(exit code ${code}\\)$`);
      expect(await send("claude-sonnet --claim a go")).toMatch(line);
      expect(logs[0]).toMatch(line);
      expect(spawns).toEqual([]);
    });

  it.each([
    ["node", { node: "hello world" }], ["node", { node: "git version 2.43.0" }], ["git", { git: "v22.1.0" }], ["git", { git: "" }],
  ])("starts nothing when %s prints no version line of its own (%j)", async (tool, tools) => {
    const { send, spawns } = await mod(OK, { tools });
    expect(await send("claude-sonnet --claim a go")).toMatch(new RegExp(`${tool}(?:\\.exe)? --version did not print a version line$`));
    expect(spawns).toEqual([]);
  });
});

describe("the proxy sources (P-16, HOST-2, C3)", () => {
  const line = (name: string) => `Shadow Army: ${name} would send the army's commands through a proxy · add 127.0.0.1 to NO_PROXY · nothing started`;

  it("refuses when the shell's NO_PROXY lists the loopback address but the settings' does not", async () => {
    const { send, spawns } = await mod(OK, { vars: { HTTPS_PROXY: "http://p:8080", NO_PROXY: "127.0.0.1" }, settingsEnv: { NO_PROXY: "example.com" } });
    expect(await send("claude-sonnet --claim a go")).toBe(line("HTTPS_PROXY"));
    expect(spawns).toEqual([]);
  });

  it("refuses a proxy in the settings when the shell's NO_PROXY is the only bypass listed", async () => {
    const { send } = await mod(OK, { vars: { no_proxy: "*" }, settingsEnv: { HTTP_PROXY: "http://p:8080", no_proxy: "example.com" } });
    expect(await send("claude-sonnet --claim a go")).toBe(line("HTTP_PROXY"));
  });

  it("starts when every NO_PROXY value in both sources lists the loopback address", async () => {
    const { send, spawns } = await mod(OK, { vars: { HTTPS_PROXY: "http://p:8080", NO_PROXY: "*" }, settingsEnv: { no_proxy: "localhost,127.0.0.1" } });
    expect(await send("claude-sonnet --claim a go")).toContain("Tank");
    expect(spawns).toHaveLength(1);
  });

  it.each([
    ["with a proxy set", { vars: { HTTPS_PROXY: "http://p:8080", NO_PROXY: "127.0.0.1" } }],
    ["with none set", {}],
  ])("reads the settings once %s", async (_name, env: Env) => {
    const settingsReads = { count: 0 };
    const { send } = await mod(OK, { ...env, settingsReads });
    await send("claude-sonnet --claim a go");
    expect(settingsReads.count).toBe(1);
  });
});

describe("a refused fetch and a failed one (PO-7, HOST-2, C4)", () => {
  it("treats a failed fetch after an answer as transport: the command fails, nothing is logged, and renewals go on", async () => {
    const { send, tick, attempted, every, logs, relaysEnded } = await mod(OK, { transport: "connect ECONNREFUSED 127.0.0.1:4321" });
    expect(await send("claude-sonnet --claim a go")).toContain("ECONNREFUSED");
    expect(logs).toEqual([]);
    await tick(); await tick();
    expect(attempted.filter((c) => c.action === "renew")).toHaveLength(2);
    expect(every.every((t) => !t.cancelled)).toBe(true);
    expect(relaysEnded).toEqual([]);
  });

  it("stops at the host's policy words even after an answer, with one line, and leaves the relay to the lease", async () => {
    const { send, every, logs, relaysEnded, attempted } = await mod(OK, { transport: "your organization's policy doesn't allow web fetch" });
    await send("claude-sonnet --claim a go");
    expect(logs).toEqual(["Shadow Army can't reach its post office: Claude Code refused the request (your organization's policy doesn't allow web fetch)"]);
    expect(every.every((t) => t.cancelled)).toBe(true);
    expect(relaysEnded).toEqual([]);
    expect(attempted.length).toBe(2);
  });

  it("sends nothing more and does not return the relay after a refusal before any answer", async () => {
    const { $, handlers, send, attempted, every, logs, relaysEnded } = await mod(() => ({}), { refuse: "your organization's policy doesn't allow web fetch" });
    await send("claude-sonnet --claim a go");
    expect(logs).toHaveLength(1);
    expect(relaysEnded).toEqual([]);
    expect(every.every((t) => t.cancelled)).toBe(true);
    await handlers["session.end"]!($, { sessionId: "session-1", reason: "logout" }, async () => undefined);
    expect(attempted).toEqual([{ action: "army" }]);
  });
});

describe("a start that stalls (HOST-2, PO-7, C5)", () => {
  it("holds the next use until the host confirms the relay's end, and logs the line after it", async () => {
    let open!: () => void;
    const env: Env = { silent: true, gate: new Promise<void>((done) => { open = done; }) };
    const { send, after, order, logs, spawns } = await mod(OK, env);
    const first = send("claude-sonnet --claim a go");
    await flush();
    after.find((t) => t.ms === 60_000)!.run();
    await flush();
    env.silent = false;
    const second = send("claude-sonnet --claim a go");
    await flush();
    expect(spawns).toHaveLength(1);
    expect(logs).toEqual([]);
    open();
    expect(await second).toContain("Tank");
    await first;
    expect(order).toEqual(["relay started", "relay ended", "relay started"]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/step: waiting for its ready event · relay ended$/);
  });

  it("never takes the 30 s timer as the relay's end: a cleanup that never resolves keeps every next start refused", async () => {
    const env: Env = { silent: true, gate: new Promise<void>(() => {}) };
    const { send, after, logs, spawns } = await mod(OK, env);
    const first = send("claude-sonnet --claim a go");
    await flush();
    after.find((t) => t.ms === 60_000)!.run();
    await flush();
    expect(logs).toEqual([]);
    after.find((t) => t.ms === 30_000)!.run();
    await first;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/step: waiting for its ready event · relay's end not confirmed in 30 s; the army won't start again until it is confirmed$/);
    env.silent = false;
    for (let i = 0; i < 2; i++) {
      expect(await send("claude-sonnet --claim a go")).toMatch(/won't start the army: the last relay's end was not confirmed in 30 s at step: waiting for its ready event, so its post office may still be running/);
    }
    expect(spawns).toHaveLength(1);
  });

  it("lets the next use start once the host confirms a late relay end", async () => {
    let open!: () => void;
    const env: Env = { silent: true, gate: new Promise<void>((done) => { open = done; }) };
    const { send, after, spawns } = await mod(OK, env);
    const first = send("claude-sonnet --claim a go");
    await flush();
    after.find((t) => t.ms === 60_000)!.run();
    await flush();
    after.find((t) => t.ms === 30_000)!.run();
    await first;
    env.silent = false;
    expect(await send("claude-sonnet --claim a go")).toMatch(/won't start the army/);
    open();
    await flush();
    expect(await send("claude-sonnet --claim a go")).toContain("Tank");
    expect(spawns).toHaveLength(2);
  });

  it("refuses the next start when the relay's end fails, naming the step", async () => {
    const env: Env = { silent: true, gate: Promise.reject(new Error("kill failed")) };
    void env.gate!.catch(() => {});
    const { send, after, logs, spawns } = await mod(OK, env);
    const first = send("claude-sonnet --claim a go");
    await flush();
    after.find((t) => t.ms === 60_000)!.run();
    await first;
    expect(logs[0]).toMatch(/step: waiting for its ready event · relay's end failed; the army won't start again until it is confirmed$/);
    env.silent = false;
    expect(await send("claude-sonnet --claim a go")).toMatch(/the last relay's end failed at step: waiting for its ready event/);
    expect(spawns).toHaveLength(1);
  });

});

describe("the acceptance scenarios (M1-AC1, M1-AC12, C6)", () => {
  it("cancels the 60 s deadline when ready arrives in time, and the army stays usable", async () => {
    let ready!: () => void;
    const { send, after, logs, spawns, every } = await mod(OK, { late: new Promise<void>((done) => { ready = done; }) });
    const first = send("claude-sonnet --claim a go");
    await flush();
    expect(after.find((t) => t.ms === 60_000)!.cancelled).toBe(false);
    ready();
    expect(await first).toContain("Tank");
    expect(after.find((t) => t.ms === 60_000)!.cancelled).toBe(true);
    expect(await send("claude-sonnet --claim a go")).toContain("Tank");
    expect(spawns).toHaveLength(1);
    expect(logs).toEqual([]);
    expect(every.some((t) => !t.cancelled)).toBe(true);
  });

  it("shows every Cc and Cf character of the Unicode data but newline and tab as a placeholder on the summary card", async () => {
    expect(CONTROL_AND_FORMAT.length).toBeGreaterThan(150);
    const hostile = `a${String.fromCodePoint(...CONTROL_AND_FORMAT)}b\tc\nd`;
    const { send } = await mod(() => turn(hostile, { apply: { applied: true, files: [{ change: "A", path: `x${String.fromCodePoint(...CONTROL_AND_FORMAT)}.ts` }] } }));
    const row = await send("claude-sonnet --claim src/** go");
    for (const code of CONTROL_AND_FORMAT) expect(row).toContain(`\\u{${code.toString(16)}}`);
    expect(row).toContain("b\tc\nd");
    expect(row.replace(/[\n\t]/g, "")).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  });

  it("shows every one of them in a refusal's words, in the log and in the command's row", async () => {
    const { send, logs } = await mod(() => ({}), { refuse: `no ${String.fromCodePoint(...CONTROL_AND_FORMAT)} web` });
    const row = await send("claude-sonnet --claim a go");
    for (const text of [row, logs[0]!]) {
      for (const code of CONTROL_AND_FORMAT) expect(text).toContain(`\\u{${code.toString(16)}}`);
      expect(text).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    }
  });
});
