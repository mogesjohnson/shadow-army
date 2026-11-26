import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (...args: any[]) => any;
const URL_ = "http://127.0.0.1:4321";
const SOLDIERS = [
  { key: "claude-sonnet", name: "Tank", roles: ["build"], supported: true },
  { key: "grok", name: "Beru", roles: ["review"], supported: true },
  { key: "codex", name: "Igris", roles: ["build"], supported: false },
];

/** A fake `$`: the relay's stream, the loopback endpoint and the clock are scripted; nothing real runs. */
async function mod(respond: (command: any) => unknown = () => ({}), relay: { before?: any[]; after?: any[]; ready?: boolean } = {}) {
  vi.resetModules();
  const { register } = await import("./register.js");
  const handlers: Record<string, Handler> = {};
  const on = (name: string, optionsOrHandler: unknown, maybe?: Handler) => {
    handlers[name] = (maybe ?? optionsOrHandler) as Handler;
    return { catch: (fallback: Handler) => { handlers[`${name}.catch`] = fallback; } };
  };
  register(on as never);
  const spawns: any[] = [];
  const commands: any[] = [];
  const logs: string[] = [];
  const registered: any[] = [];
  const $ = {
    session: { id: async () => "session-1", cwd: async () => "/repo" },
    plugin: { root: "/x/plugins/shadow-army" },
    fs: { exists: async () => true },
    clock: { every: () => ({ cancel() {} }), after: () => ({ cancel() {} }) },
    ui: { log: (line: string) => logs.push(line) },
    command: { register: async (spec: unknown) => { registered.push(spec); } },
    process: {
      spawn: (options: unknown) => {
        spawns.push(options);
        let stop: () => void = () => {};
        const closed = new Promise<void>((done) => { stop = done; });
        return {
          async *[Symbol.asyncIterator]() {
            for (const chunk of relay.before ?? []) yield chunk;
            if (relay.ready === false) return;
            yield { stream: "stdout", text: `${JSON.stringify({ type: "ready", data: { url: URL_ } })}\n` };
            for (const chunk of relay.after ?? []) yield chunk;
            await closed;
          },
          return: async () => { stop(); return { done: true }; },
        };
      },
    },
    http: {
      fetch: async (_url: string, init: { body: string }) => {
        const command = JSON.parse(init.body);
        commands.push(command);
        if (command.action === "army") return { ok: true, status: 200, text: JSON.stringify({ result: SOLDIERS }) };
        if (command.action === "open") return { ok: true, status: 200, text: JSON.stringify({ result: { session: "tank-1" } }) };
        try { return { ok: true, status: 200, text: JSON.stringify({ result: respond(command) }) }; }
        catch (error) { return { ok: false, status: 400, text: JSON.stringify({ error: (error as Error).message }) }; }
      },
    },
  };
  const send = async (args: string): Promise<string> => (await handlers["command.run"]!($, { args })).text;
  return { $, handlers, spawns, commands, logs, registered, send };
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
    await send("claude-sonnet first brief");
    await send("claude-sonnet second brief");
    expect(spawns).toHaveLength(1);
    expect(spawns[0].argv.join(" ")).toMatch(/modRelay\.js --cwd \/repo$/);
    const bootstrap = JSON.parse(spawns[0].input);
    expect(bootstrap.session).toBe("session-1");
    expect(spawns[0].argv.join(" ")).not.toContain(bootstrap.credential);
    expect(commands.filter((c) => c.action === "send")).toHaveLength(2);
  });

  it("sends the brief, and no claims, to the named soldier, by name or key", async () => {
    const { send, commands } = await mod(() => ({ status: "completed", summary: "ok" }));
    await send("Tank write the parser");
    expect(commands.find((c) => c.action === "send")).toEqual({ action: "send", soldier: "claude-sonnet", text: "write the parser" });
    expect(commands.find((c) => c.action === "open")).toEqual({ action: "open", soldier: "claude-sonnet" });
  });

  it("sends nothing, and says why, with no brief, an unknown soldier or one that cannot build", async () => {
    const { send, spawns, commands } = await mod();
    expect(await send("")).toBe("Usage: /send <soldier> <brief>");
    expect(await send("claude-sonnet")).toMatch(/^Usage: \/send/);
    expect(spawns).toHaveLength(0);
    expect(await send("nobody do it")).toMatch(/unknown soldier/);
    expect(await send("grok do it")).toMatch(/Beru is not a claude soldier with the build role/);
    expect(await send("codex do it")).toMatch(/Igris is not a claude soldier/);
    expect(commands.some((c) => c.action === "send")).toBe(false);
  });

  it("does not advertise claims, and refuses a --claim before opening a session (C15)", async () => {
    const { $, handlers, registered, send, spawns, commands } = await mod();
    await handlers["session.start"]!($, {}, async () => undefined);
    expect(JSON.stringify(registered)).not.toMatch(/claim/i);
    for (const args of ["Tank --claim src/a.ts go", "Tank --claim", "Tank  --claim 'a b' --claim c go"]) {
      expect(await send(args), args).toMatch(/^Nothing sent: --claim is not available in this build/);
    }
    expect(await send("Tank fix the --claim flag docs")).not.toMatch(/Nothing sent/);
    expect(spawns).toHaveLength(1);
    expect(commands.filter((c) => c.action === "send").map((c) => c.text)).toEqual(["fix the --claim flag docs"]);
  });

  it("shows a post office refusal as one row, with the credential redacted", async () => {
    const { send, spawns } = await mod(() => { throw new Error("the soldier is busy"); });
    const row = await send("claude-sonnet do it");
    expect(row).toContain("Shadow Army: the soldier is busy");
    expect(row).not.toContain(JSON.parse(spawns[0].input).credential);
  });

  it("releases the lease at the session's end", async () => {
    const { $, handlers, send, commands } = await mod(() => ({ status: "completed" }));
    await send("claude-sonnet do it");
    await handlers["session.end"]!($, { sessionId: "session-1" }, async () => undefined);
    expect(commands.at(-1)).toEqual({ action: "release", session: "session-1" });
  });
});

describe("the summary card (M1-AC25, SEC-6)", () => {
  it("holds the soldier, at most five summary lines, the log path and the files applied", async () => {
    const summary = ["1", "2", "3", "4", "5", "6", "7"].join("\n");
    const { send } = await mod(() => ({ status: "completed", summary, applied: ["src/a.ts", "src/b.ts"] }));
    const row = await send("claude-sonnet go");
    expect(row).toBe(`Shadow Army · Tank · completed\n1\n2\n3\n4\n5\nLog: /repo/.shadow/v2/logs/tank-1.jsonl\nApplied: src/a.ts, src/b.ts`);
  });

  it("gives the reason when nothing was applied, and names a reverted file", async () => {
    const { send } = await mod(() => ({ status: "completed", summary: "s", reason: "you changed src/a.ts yourself", reverted: ["docs/x.md"] }));
    const row = await send("claude-sonnet go");
    expect(row).toContain("Not applied: you changed src/a.ts yourself");
    expect(row).toContain("Reverted, outside its claims: docs/x.md");
  });

  it("shows each Cc and Cf character as a placeholder and keeps newline and tab", async () => {
    const hostile = "a\u001b[31mred‮drawer​z\ttab\nnext\u0007";
    const { send } = await mod(() => ({ status: "completed", summary: hostile, applied: ["we‮ird.ts"] }));
    const row = await send("claude-sonnet go");
    expect(row).toContain("a\\u{1b}[31mred\\u{202e}drawer\\u{200b}z\ttab\nnext\\u{7}");
    expect(row).toContain("we\\u{202e}ird.ts");
    expect(row).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f​‮]/);
  });

  it("falls back to the error text for a failed turn with no summary", async () => {
    const { send } = await mod(() => ({ status: "failed", error: { message: "read-only guard failed" } }));
    expect(await send("claude-sonnet go")).toContain("Shadow Army · Tank · failed\nread-only guard failed\n");
  });

  it("caps a CRLF summary at five lines", async () => {
    const { send } = await mod(() => ({ status: "completed", summary: "1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7" }));
    expect(await send("claude-sonnet go")).toBe("Shadow Army · Tank · completed\n1\n2\n3\n4\n5\nLog: /repo/.shadow/v2/logs/tank-1.jsonl\nNot applied: no change was applied");
  });

  it("caps the error used for a failed turn with no summary at five lines, with LF and CRLF", async () => {
    for (const eol of ["\n", "\r\n"]) {
      const message = ["e1", "e2", "e3", "e4", "e5", "e6", "e7"].join(eol);
      const { send } = await mod(() => ({ status: "failed", error: { message } }));
      expect(await send("claude-sonnet go")).toBe("Shadow Army · Tank · failed\ne1\ne2\ne3\ne4\ne5\nLog: /repo/.shadow/v2/logs/tank-1.jsonl\nNot applied: no change was applied");
    }
  });

  it("prefers the summary to the error, and treats an empty summary as none", async () => {
    const error = { message: "boom" };
    const { send } = await mod(() => ({ status: "failed", summary: "s1\ns2", error }));
    expect(await send("claude-sonnet go")).toContain("failed\ns1\ns2\nLog:");
    const empty = await mod(() => ({ status: "failed", summary: "", error }));
    expect(await empty.send("claude-sonnet go")).toContain("failed\nboom\nLog:");
  });
});

describe("relay diagnostics in the UI log (SEC-6)", () => {
  it("shows format characters in a channel event as placeholders", async () => {
    const event = { type: "error", soldier: "Ta‪nk", data: { message: "bad\u007F ‮" } };
    const { send, logs } = await mod(() => ({ status: "completed" }), { after: [{ stream: "stdout", text: `${JSON.stringify(event)}\n` }] });
    await send("claude-sonnet go");
    await new Promise((done) => setTimeout(done, 0));
    expect(logs).toEqual([`Shadow Army · Ta\\u{202a}nk: {"message":"bad\\u{7f} \\u{202e}"}`]);
  });

  it("shows a startup diagnostic with control characters as placeholders and redacts the credential", async () => {
    const secret = "a".repeat(64);
    const { send, logs } = await mod(() => ({}), { before: [{ stream: "stderr", text: `boom‮\u001B[0m ${secret}` }], ready: false });
    const row = await send("claude-sonnet go");
    expect(row).toContain("boom\\u{202e}\\u{1b}[0m [redacted]");
    expect(logs).toEqual(["Shadow Army: Error: post office relay ended: boom\\u{202e}\\u{1b}[0m [redacted]"]);
  });
});
