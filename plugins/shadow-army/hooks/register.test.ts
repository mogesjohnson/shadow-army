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
async function mod(respond: (command: any) => unknown = () => ({})) {
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
            yield { stream: "stdout", text: `${JSON.stringify({ type: "ready", data: { url: URL_ } })}\n` };
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
});
