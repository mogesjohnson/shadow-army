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
async function mod(respond: (command: any) => unknown = () => ({}), relay: { before?: any[]; after?: any[]; ready?: boolean; cwd?: string; root?: string } = {}) {
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
    session: { id: async () => "session-1", cwd: async () => relay.cwd ?? "/repo" },
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
            yield { stream: "stdout", text: `${JSON.stringify({ type: "ready", data: { url: URL_, root: relay.root ?? "/repo" } })}\n` };
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

  it("takes a quoted claim with a space whole, and keeps the brief's own quotes and spacing", async () => {
    const { send, commands } = await mod(() => ({ status: "completed" }));
    await send(`Tank --claim "docs/Project Notes.md" --claim 'my dir/**' --claim plain.ts  rewrite "the notes"  now`);
    expect(commands.find((c) => c.action === "send")).toEqual({
      action: "send", soldier: "claude-sonnet", text: `rewrite "the notes"  now`, claims: ["docs/Project Notes.md", "my dir/**", "plain.ts"],
    });
  });

  it("rejects a missing or unclosed claim before opening a session", async () => {
    const { send, spawns, commands } = await mod();
    for (const args of [
      "Tank --claim", "Tank --claim ", `Tank --claim "" go`, "Tank --claim --claim a go", `Tank --claim "docs/Project Notes.md go`,
      `Tank --claim "a"b go`, `Tank --claim a --claim 'b c go`,
    ]) expect(await send(args), args).toMatch(/^Nothing sent: (--claim needs a path or glob|a quoted --claim is not closed)/);
    expect(spawns).toHaveLength(0);
    expect(commands).toHaveLength(0);
  });

  it("rejects a malformed option without contacting a running post office (#94 C8)", async () => {
    const { send, spawns, commands } = await mod(() => ({ status: "completed" }));
    await send("Tank --claim a.ts go");
    const before = commands.length;
    for (const args of [String.raw`Tank --claim "C:\Users\me\My Notes.md go`, "Tank --claim", `Tank --claim 'a'b go`]) {
      expect(await send(args), args).toMatch(/^Nothing sent: /);
    }
    expect(spawns).toHaveLength(1);
    expect(commands).toHaveLength(before);
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

describe("the summary card (M1-AC25, SEC-6)", () => {
  it("holds the soldier, at most five summary lines, the log path and the files applied", async () => {
    const summary = ["1", "2", "3", "4", "5", "6", "7"].join("\n");
    const { send } = await mod(() => turn(summary, { apply: { applied: true, files: [{ change: "M", path: "src/a.ts" }, { change: "A", path: "src/b.ts" }] } }));
    const row = await send("claude-sonnet --claim src/** go");
    expect(row).toBe(`Shadow Army · Tank · completed\n1\n2\n3\n4\n5\nLog: /repo/.shadow/v2/logs/tank-1.jsonl\nApplied: src/a.ts, src/b.ts`);
  });

  it("shows the applied files and the warning when the office failed after the apply (#92 C6)", async () => {
    const { send } = await mod(() => ({ ...turn("s", { apply: { applied: true, files: [{ change: "M", path: "src/a.ts" }] } }), logFailure: "post office log failed: disk full" }));
    const row = await send("claude-sonnet --claim src/** go");
    expect(row).toContain("\nApplied: src/a.ts\nWarning: post office log failed: disk full");
  });

  it("gives the reason when nothing was applied, and names a reverted file", async () => {
    const { send } = await mod(() => turn("s", { outOfScope: ["docs/x.md"], reverted: true, apply: { applied: false, reason: "your folder has changes to the same files", clashes: ["src/a.ts"] } }));
    const row = await send("claude-sonnet --claim src/** go");
    expect(row).toContain("Not applied: your folder has changes to the same files: src/a.ts");
    expect(row).toContain("Reverted, outside its claims: docs/x.md");
  });

  it("warns, with every affected path, when taking the edits back out failed (#94 C9)", async () => {
    const reason = "index.lock exists; taking the edits back out failed too";
    const { send } = await mod(() => turn("s", { apply: { applied: false, reason, clashes: [], left: ["run.log", "src/a.ts"] } }));
    const row = await send("claude-sonnet --claim src/** go");
    expect(row).not.toContain("Not applied");
    expect(row).toContain(`Warning: your folder was NOT put back (${reason}). These files may still carry the soldier's edits: run.log, src/a.ts`);
  });

  it("shows each Cc and Cf character as a placeholder and keeps newline and tab", async () => {
    const hostile = "a\u001b[31mred‮drawer​z\ttab\nnext\u0007";
    const { send } = await mod(() => turn(hostile, { apply: { applied: true, files: [{ change: "A", path: "we‮ird.ts" }] } }));
    const row = await send("claude-sonnet --claim src/** go");
    expect(row).toContain("a\\u{1b}[31mred\\u{202e}drawer\\u{200b}z\ttab\nnext\\u{7}");
    expect(row).toContain("we\\u{202e}ird.ts");
    expect(row).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f​‮]/);
  });

  it("gives the error as the reason for a failed turn with no summary", async () => {
    const { send } = await mod(() => ({ status: "failed", error: { message: "read-only guard failed" } }));
    expect(await send("claude-sonnet --claim a go")).toBe("Shadow Army · Tank · failed\nno summary\nLog: /repo/.shadow/v2/logs/tank-1.jsonl\nNot applied: read-only guard failed");
  });

  it("names the failure even when the soldier wrote partial text and the audit left no write result (M1-AC27)", async () => {
    const { send } = await mod(() => ({ status: "failed", summary: "I edited README.md", error: { message: "guard: README.md changed outside the claims" } }));
    const row = await send("claude-sonnet --claim src/** go");
    expect(row).toContain("I edited README.md\n");
    expect(row).toContain("Not applied: guard: README.md changed outside the claims");
  });

  it("names the log under the root the relay reports, not Claude's folder or an alias of it (M1-AC25, W12-5)", async () => {
    const { send, spawns } = await mod(() => turn("s"), { cwd: "/alias/app", root: "/real/repo" });
    expect(await send("claude-sonnet --claim a.ts go")).toContain("\nLog: /real/repo/.shadow/v2/logs/tank-1.jsonl\n");
    expect(spawns[0].argv.at(-1)).toBe("/alias/app");
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

  it("names the error of a failed turn with no reply text even when the audit left a write outcome (self-review 94)", async () => {
    const { send } = await mod(() => ({ ...turn("", { reverted: false }), status: "failed", summary: "", error: { kind: "rate_limit", message: "429 too many requests" } }));
    const row = await send("claude-sonnet --claim a go");
    expect(row).toContain("no summary\nError: 429 too many requests\n");
  });

  it("marks a refusal as refused although its status is completed (W12-6b)", async () => {
    const { send } = await mod(() => ({ ...turn("I can't help with that."), refusal: true }));
    expect(await send("claude-sonnet --claim a go")).toContain("Shadow Army · Tank · completed (refused)\nI can't help with that.\n");
  });

  it("refuses a relay that reports no repository root rather than guessing the log path (C16)", async () => {
    const { send, commands } = await mod(() => turn("s"), { root: "" });
    expect(await send("claude-sonnet --claim a go")).toContain("post office sent no repository root");
    expect(commands.some((c) => c.action === "send")).toBe(false);
  });

  it("caps a CRLF summary at five lines", async () => {
    const { send } = await mod(() => turn("1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7"));
    expect(await send("claude-sonnet --claim a go")).toBe("Shadow Army · Tank · completed\n1\n2\n3\n4\n5\nLog: /repo/.shadow/v2/logs/tank-1.jsonl\nNot applied: no change was applied");
  });

  it("caps the error given as the reason at five lines, with LF and CRLF", async () => {
    for (const eol of ["\n", "\r\n"]) {
      const message = ["e1", "e2", "e3", "e4", "e5", "e6", "e7"].join(eol);
      const { send } = await mod(() => ({ status: "failed", error: { message } }));
      expect(await send("claude-sonnet --claim a go")).toBe("Shadow Army · Tank · failed\nno summary\nLog: /repo/.shadow/v2/logs/tank-1.jsonl\nNot applied: e1\ne2\ne3\ne4\ne5");
    }
  });
});

describe("relay diagnostics in the UI log (SEC-6)", () => {
  it("shows format characters in a channel event as placeholders", async () => {
    const event = { type: "error", soldier: "Ta‪nk", data: { message: "bad\u007F ‮" } };
    const { send, logs } = await mod(() => ({ status: "completed" }), { after: [{ stream: "stdout", text: `${JSON.stringify(event)}\n` }] });
    await send("claude-sonnet --claim a go");
    await new Promise((done) => setTimeout(done, 0));
    expect(logs).toEqual([`Shadow Army · Ta\\u{202a}nk: {"message":"bad\\u{7f} \\u{202e}"}`]);
  });

  it("shows a startup diagnostic with control characters as placeholders and redacts the credential", async () => {
    const secret = "a".repeat(64);
    const { send, logs } = await mod(() => ({}), { before: [{ stream: "stderr", text: `boom‮\u001B[0m ${secret}` }], ready: false });
    const row = await send("claude-sonnet --claim a go");
    expect(row).toContain("boom\\u{202e}\\u{1b}[0m [redacted]");
    expect(logs).toEqual(["Shadow Army: Error: post office relay ended: boom\\u{202e}\\u{1b}[0m [redacted]"]);
  });
});

describe("the event stream's transcript lines", () => {
  it("shows the post office's retry notice as a plain line during backoff, not as an error", async () => {
    const harness = await mod(() => ({ status: "completed", summary: "ok" }));
    const notice = { type: "notice", soldier: "claude-sonnet", data: { kind: "retry", message: "claude-sonnet: claude is retrying (attempt 1 of 10, in 0.5 s, 529 overloaded)" } };
    const failure = { type: "error", soldier: "claude-sonnet", data: { kind: "transport", message: "lost" } };
    harness.$.process.spawn = () => ({
      async *[Symbol.asyncIterator]() {
        yield { stream: "stdout", text: `${JSON.stringify({ type: "ready", data: { url: URL_, root: "/repo" } })}\n` };
        yield { stream: "stdout", text: `${JSON.stringify(notice)}\n${JSON.stringify(failure)}\n` };
        await new Promise(() => {});
      },
      return: async () => ({ done: true }),
    }) as never;
    await harness.send("claude-sonnet --claim a go");
    await vi.waitFor(() => expect(harness.logs).toHaveLength(2));
    expect(harness.logs[0]).toBe("Shadow Army: claude-sonnet: claude is retrying (attempt 1 of 10, in 0.5 s, 529 overloaded)");
    expect(harness.logs[0]).not.toMatch(/error|\{/);
    expect(harness.logs[1]).toContain('"kind":"transport"');
  });
});
