import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { git } from "../workspace/git.js";
import { Locks } from "../workspace/locks.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { makeRoster } from "../core/roster.testutil.js";
import { windowsOnly } from "./windowsOnly.testutil.js";
import type { ChannelOptions, NativeChannel } from "./channel.js";
import { PostOffice, type OfficeEvent } from "./postOffice.js";
import { credential, factory, roster, until } from "./fixture-main.testutil.js";

const offices: PostOffice[] = [];
const repos: ReturnType<typeof makeRepo>[] = [];
async function setup() {
  const repo = makeRepo(); repos.push(repo);
  repo.write("src/a.ts", "owner's uncommitted work\n");
  const events: OfficeEvent[] = [];
  const deliveries: string[] = [];
  const office = await PostOffice.create({ cwd: repo.dir, credential, roster, channelFactory: (options) => {
    const native = factory(options);
    return { send(text) { deliveries.push(text); return native.send(text); }, interrupt: () => native.interrupt(), respondApproval: (id, response) => native.respondApproval(id, response), close: () => native.close() };
  }, onEvent: (event) => events.push(event) });
  offices.push(office);
  return { repo, office, events, deliveries };
}
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(offices.splice(0).map((office) => office.close()));
  repos.splice(0).forEach((repo) => repo.cleanup());
});

describe("M1 office integration with synthetic native processes", () => {
  windowsOnly("keeps two messages in one process, preserves owner changes and redacts credentials in replies, events and logs", async () => {
    const { repo, office, events, deliveries } = await setup();
    const first = await office.send("scout", "inspect");
    const second = await office.send("scout", "inspect");
    expect(JSON.parse(first.text).pid).toBe(JSON.parse(second.text).pid);
    expect(JSON.parse(second.text).history).toEqual(["inspect", "inspect"]);
    expect(JSON.parse(second.text).args.join(" ")).not.toContain(credential);
    const secret = await office.send("scout", `echo ${credential}`);
    expect(secret.text).toContain("[REDACTED]");
    await office.send("scout", `echo ${credential.toUpperCase()}`);
    const inspected = JSON.parse((await office.send("scout", "inspect")).text);
    expect(inspected.history).toContain("echo [REDACTED]");
    expect(inspected.history.join(" ").toLowerCase()).not.toContain(credential);
    // Inspecting only office replies could hide an input leak because replies are redacted too.
    expect(deliveries.join(" ").toLowerCase()).not.toContain(credential);
    expect(deliveries.filter((text) => text === "echo [REDACTED]")).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain(credential);
    await office.close();
    const logs = join(repo.dir, ".shadow", "v2", "logs");
    for (const path of await readdir(logs)) expect(await readFile(join(logs, path), "utf8")).not.toContain(credential);
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("owner's uncommitted work\n");
  }, 30_000);

  windowsOnly.each(["die", "partial"])("finalizes both guards after %s, retains partial work, then requires explicit reconnect without replay", async (prompt) => {
    const { repo, office, events } = await setup();
    const opened = await office.open("scout");
    const pending = office.send("scout", prompt);
    await until(() => events.some((event) => event.type === "tool_call"));
    // A concurrent checkout violation proves both guards run even after stream death/cancellation.
    repo.write("README.md", "checkout changed during turn\n");
    if (prompt === "partial") await office.interrupt("scout");
    const result = await pending;
    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("partial work is retained");
    const guard = events.find((event) => event.type === "guard")!.data as { changes: string[] };
    expect(guard.changes.some((line) => line.includes("README.md"))).toBe(true);
    expect(guard.changes.some((line) => line.includes("read-only snapshot:") && line.includes("partial.txt"))).toBe(true);
    expect(await readFile(join(opened.cwd, "partial.txt"), "utf8")).toBe("partial edit\n");
    expect(events.filter((event) => event.type === "delivery")).toHaveLength(1);
    expect(events.filter((event) => event.type === "restarted")).toHaveLength(0);
    await expect(office.send("scout", "retry")).rejects.toThrow("reconnect explicitly");
    const reopened = await office.open("scout");
    expect(reopened.cwd).not.toBe(opened.cwd);
    expect(JSON.parse((await office.send("scout", "inspect")).text).history).toEqual(["inspect"]);
    expect(await readFile(join(opened.cwd, "partial.txt"), "utf8")).toBe("partial edit\n");
  }, 30_000);

  windowsOnly("retains a successful Edit followed by provider failure and requires an explicit fresh retry without replay", async () => {
    const { office, events, deliveries } = await setup();
    const opened = await office.open("scout");
    const result = await office.send("scout", "partial-success-fail");
    expect(events.filter((event) => event.type === "tool_call")).toHaveLength(1);
    expect(events.find((event) => event.type === "tool_result")?.data).toMatchObject({ tool_use_id: "edit-success", is_error: false, content: "Edit completed" });
    expect(events.find((event) => event.type === "error")?.data).toMatchObject({ kind: "rate_limit" });
    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("partial work is retained");
    // W11-1, PO-8: the CLI's own kind and words survive the guard failure.
    expect(result.error?.kind).toBe("rate_limit");
    expect(result.error?.message).toContain("API Error after successful Edit: rate limit");
    expect(events.filter((event) => event.type === "guard")).toHaveLength(1);
    await expect(office.send("scout", "partial-success-fail")).rejects.toThrow("reconnect explicitly");
    expect(deliveries).toEqual(["partial-success-fail"]);
    expect(events.filter((event) => event.type === "restarted")).toHaveLength(0);
    expect(await readFile(join(opened.cwd, "partial.txt"), "utf8")).toBe("successful first edit\n");
    await office.open("scout");
    expect(JSON.parse((await office.send("scout", "inspect")).text).history).toEqual(["inspect"]);
    expect(await readFile(join(opened.cwd, "partial.txt"), "utf8")).toBe("successful first edit\n");
  }, 30_000);

  windowsOnly("keeps rate limits, context overflow, login and refusal distinct without restart or automatic retry", async () => {
    const { office, events } = await setup();
    for (const [text, kind] of [["rate", "rate_limit"], ["context", "context_overflow"], ["login", "login_needed"]]) {
      const result = await office.send("scout", text!);
      expect(result.status).toBe("failed"); expect(result.error?.kind).toBe(kind);
    }
    const refused = await office.send("scout", "refusal");
    expect(refused.refusal).toBe(true); expect(refused.error).toBeUndefined();
    const inspected = JSON.parse((await office.send("scout", "inspect")).text);
    expect(inspected.history).toEqual(["rate", "context", "login", "refusal", "inspect"]);
    expect(events.filter((event) => event.type === "restarted")).toHaveLength(0);
  }, 30_000);

  windowsOnly("passes through provider usage/cache fields and leaves missing usage unknown", async () => {
    const { office } = await setup();
    const meters = await office.send("scout", "meters");
    expect(meters.contextTokens).toBe(22);
    expect(meters.usage?.cachedInputTokens).toBe(40);
    expect(meters.usage?.raw.cache_creation).toEqual({ ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 20 });
    const unknown = await office.send("scout", "unknown-usage");
    expect(unknown.usage).toBeUndefined(); expect(unknown.contextTokens).toBeUndefined();
  }, 30_000);

  windowsOnly("rejects a credential inside an approval response without consuming the native owner request", async () => {
    const { office, events } = await setup();
    const opened = await office.open("scout");
    const pending = office.send("scout", "approval");
    await until(() => events.some((event) => event.type === "approval"));
    const requestId = (events.find((event) => event.type === "approval")!.data as { request_id: string }).request_id;
    await expect(office.approval("scout", requestId, { behavior: "allow", note: credential.toUpperCase() })).rejects.toThrow("cannot be forwarded");
    await expect(readFile(join(opened.cwd, "approval-response.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await office.approval("scout", requestId, { behavior: "deny", message: "Owner denied" });
    await pending;
    expect(JSON.parse(await readFile(join(opened.cwd, "approval-response.json"), "utf8"))).toEqual({ behavior: "deny", message: "Owner denied" });
  }, 30_000);

  it("provides a five-line delivery summary while retaining the full native answer in its audit log", async () => {
    const repo = makeRepo(); repos.push(repo);
    const text = Array.from({ length: 8 }, (_, index) => `native answer line ${index + 1}`).join("\n");
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, channelFactory: (): NativeChannel => ({ async send() { return { status: "completed", text, refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {} }) }); offices.push(office);
    const result = await office.send("scout", "a longer answer");
    expect(result.text).toBe(text);
    expect(result.summary).toBe(text.split("\n").slice(0, 5).join("\n"));
    await office.close();
    const logs = join(repo.dir, ".shadow", "v2", "logs");
    const records = (await Promise.all((await readdir(logs)).map((name) => readFile(join(logs, name), "utf8")))).join("\n").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const delivered = records.find((record) => record.type === "delivery");
    expect(delivered.data.result.text).toBe(text);
    expect(delivered.data.result.summary.split("\n")).toHaveLength(5);
  }, 30_000);

  it("bounds crash supervision at three restarts and reconnects explicitly without resending", async () => {
    const repo = makeRepo(); repos.push(repo);
    const channels: { options: ChannelOptions; sent: string[] }[] = [];
    const events: OfficeEvent[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, restartDelaysMs: [0, 0, 0], onEvent: (event) => events.push(event), channelFactory: (options): NativeChannel => {
      const channel = { options, sent: [] as string[] }; channels.push(channel);
      return { async send(text) { channel.sent.push(text); return { status: "completed", text, refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {} };
    } }); offices.push(office);
    await office.send("scout", "delivered once");
    for (let i = 0; i < 4; i++) {
      channels[i]!.options.onEvent({ type: "closed", data: { crash: i } });
      await until(() => i < 3 ? channels.length === i + 2 : events.some((event) => event.type === "down"));
    }
    expect(channels).toHaveLength(4);
    expect(channels.map((channel) => channel.sent)).toEqual([["delivered once"], [], [], []]);
    expect(events.filter((event) => event.type === "restarted")).toHaveLength(3);
    await expect(office.send("scout", "must not replay")).rejects.toThrow("reconnect explicitly");
    await office.open("scout"); expect(channels).toHaveLength(5);
    expect(channels[4]!.sent).toEqual([]);
  }, 30_000);

  it("blocks restart and owner reconnect when native descendant termination is uncertain", async () => {
    const repo = makeRepo(); repos.push(repo);
    const channels: ChannelOptions[] = [];
    const sent: string[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, channelFactory: (options): NativeChannel => {
      channels.push(options);
      return { async send(text) { sent.push(text); return { status: "completed", text, refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {} };
    } });
    try {
      await office.open("scout");
      channels[0]!.onEvent({ type: "closed", data: { containmentStopped: false } });
      expect(office.army()).toEqual([expect.objectContaining({ state: "down", restarts: 0 })]);
      await expect(office.send("scout", "do not duplicate unknown children")).rejects.toThrow("reconnect explicitly");
      await expect(office.open("scout")).rejects.toThrow("not confirmed stopped");
      await expect(office.closeSession("scout")).rejects.toThrow("not confirmed stopped");
      expect(channels).toHaveLength(1);
      expect(sent).toEqual([]);
      // Failed close preserves the down session and cannot turn a subsequent open into a new launch.
      await expect(office.open("scout")).rejects.toThrow("not confirmed stopped");
      await expect(office.close()).rejects.toBeInstanceOf(AggregateError);
      expect(channels).toHaveLength(1);
    } finally { await office.close().catch(() => {}); }
  }, 30_000);

  it.each(["explicit session close", "office shutdown", "guard failure"])("preserves uncertain containment during %s and never duplicates the native session", async (boundary) => {
    const repo = makeRepo(); repos.push(repo);
    const channels: ChannelOptions[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, channelFactory: (options): NativeChannel => {
      channels.push(options);
      return {
        async send() { await writeFile(join(options.cwd, "partial.txt"), "retained partial\n"); return { status: "completed", text: "edit completed", refusal: false }; },
        async interrupt() {}, async respondApproval() {},
        async close() { options.onEvent({ type: "closed", data: { containmentStopped: false } }); },
      };
    } });
    try {
      const opened = await office.open("scout");
      if (boundary === "office shutdown") {
        await expect(office.close()).rejects.toBeInstanceOf(AggregateError);
      } else {
        if (boundary === "explicit session close") await expect(office.closeSession("scout")).rejects.toThrow("not confirmed stopped");
        else {
          expect((await office.send("scout", "edit")).status).toBe("failed");
          expect(await readFile(join(opened.cwd, "partial.txt"), "utf8")).toBe("retained partial\n");
        }
        expect(office.army()).toEqual([expect.objectContaining({ state: "down", restarts: 0 })]);
        await expect(office.open("scout")).rejects.toThrow("not confirmed stopped");
        await expect(office.send("scout", "retry")).rejects.toThrow("reconnect explicitly");
        await expect(office.closeSession("scout")).rejects.toThrow("not confirmed stopped");
        await expect(office.open("scout")).rejects.toThrow("not confirmed stopped");
        await expect(office.close()).rejects.toBeInstanceOf(AggregateError);
      }
      expect(channels).toHaveLength(1);
    } finally { await office.close().catch(() => {}); }
  }, 30_000);

  it("closes a session whose snapshot is still being prepared", async () => {
    const { office } = await setup();
    const opening = office.open("scout");
    const closing = office.closeSession("scout");
    await Promise.allSettled([opening, closing]);
    expect(office.army()).toEqual([expect.objectContaining({ state: "closed" })]);
  }, 30_000);

  it("closes the office while snapshot preparation is pending without starting a child", async () => {
    const repo = makeRepo(); repos.push(repo);
    let starts = 0;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, channelFactory: (options) => { starts++; return factory(options); } }); offices.push(office);
    const opening = office.open("scout");
    const outcome = opening.then(() => "opened", () => "closed");
    await office.close();
    expect(await outcome).toBe("closed"); expect(starts).toBe(0);
    await expect(office.open("scout")).rejects.toThrow("closed");
  }, 30_000);

  windowsOnly.each(["model", "system instructions"])("preserves a native reported cache hit after changing only %s in a fresh session", async (changed) => {
    const repo = makeRepo(); repos.push(repo);
    const custom = makeRoster({ scout: { cli: "claude", model: "first-model", roles: ["review"], write: false } });
    custom.rules.all = "FIRST SYSTEM INSTRUCTION";
    const settings: ChannelOptions[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: custom, channelFactory: (options) => {
      settings.push(options);
      expect(JSON.stringify(options)).not.toContain(credential);
      expect(JSON.stringify(process.env)).not.toContain(credential);
      return factory(options);
    } }); offices.push(office);
    const first = await office.send("scout", "inspect");
    await office.closeSession("scout");
    if (changed === "model") custom.soldiers.get("scout")!.model = "second-model";
    else custom.rules.all = "SECOND SYSTEM INSTRUCTION";
    const second = await office.send("scout", "inspect");
    expect(settings[0]!.model).toBe("first-model"); expect(settings[1]!.model).toBe(changed === "model" ? "second-model" : "first-model");
    expect(settings[0]!.instructions).toContain("FIRST SYSTEM INSTRUCTION");
    expect(settings[1]!.instructions).toContain(changed === "system instructions" ? "SECOND SYSTEM INSTRUCTION" : "FIRST SYSTEM INSTRUCTION");
    expect(JSON.parse(first.text).pid).not.toBe(JSON.parse(second.text).pid);
    expect(JSON.parse(second.text).history).toEqual(["inspect"]);
    // Cache accounting belongs to the provider and is preserved even across changed settings.
    expect(second.usage?.raw.cache_read_input_tokens).toBe(40);
  }, 30_000);

  it("rejects non-Claude soldiers before routing or cross-model tool/error translation can occur", async () => {
    const repo = makeRepo(); repos.push(repo);
    let starts = 0;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: makeRoster({ other: { cli: "codex", model: "fake", roles: ["review"] } }), channelFactory: (options) => { starts++; return factory(options); } }); offices.push(office);
    await expect(office.open("other")).rejects.toThrow("not implemented in M1"); expect(starts).toBe(0);
  });
});

describe("M1a write path: claims, claim audit and checkout guard (M1-AC24, M1-AC26, M1-AC27)", () => {
  const builders = makeRoster({
    tank: { cli: "claude", model: "synthetic", roles: ["build"], write: true },
    medic: { cli: "claude", model: "synthetic", roles: ["build"], write: true },
    scout: { cli: "claude", model: "synthetic", roles: ["review"], write: false },
  });
  /** A channel that writes the given files into the cwd it was started in, and records what it saw. */
  async function writer(files: Record<string, string>, extra?: (cwd: string, repo: ReturnType<typeof makeRepo>) => Promise<void>) {
    const repo = makeRepo(); repos.push(repo);
    const started: ChannelOptions[] = [];
    const events: OfficeEvent[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, onEvent: (event) => events.push(event), channelFactory: (options): NativeChannel => {
      started.push(options);
      return { async send() {
        for (const [name, body] of Object.entries(files)) { await mkdir(dirname(join(options.cwd, name)), { recursive: true }); await writeFile(join(options.cwd, name), body); }
        await extra?.(options.cwd, repo);
        return { status: "completed", text: "done", refusal: false };
      }, async interrupt() {}, async respondApproval() {}, async close() {} };
    } }); offices.push(office);
    return { repo, office, started, events };
  }

  it("runs a claims turn in its own worktree on a shadow branch, with write instructions and one process across two turns", async () => {
    const { repo, office, started } = await writer({ "src/a.ts": "changed\n" });
    const opened = await office.open("tank", { claims: ["src/**"] });
    expect(opened.branch).toMatch(/^shadow\//);
    expect(opened.cwd).toContain(".shadow");
    expect(opened.cwd).not.toBe(repo.dir);
    expect(started).toHaveLength(1);
    expect(started[0]!.instructions).not.toContain("read-only session");
    const first = await office.send("tank", "edit", { claims: ["src/**"] });
    const second = await office.send("tank", "edit again");
    expect(first.write?.applicable).toBe(true);
    expect(second.write?.branch).toBe(opened.branch);
    // The second turn wrote the same bytes: the earlier turn's commit is not this turn's change.
    expect(second.write?.applicable).toBe(false);
    expect(second.write?.reason).toBe("the soldier changed nothing");
    expect(started).toHaveLength(1);
    // The first turn's audited change reaches the owner's folder uncommitted (B4, M1-AC28).
    expect(first.write?.apply?.applied).toBe(true);
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("changed\n");
  }, 30_000);

  it("reverts a file outside the claims, names it, and commits only the claimed change with its diff", async () => {
    const { office } = await writer({ "src/a.ts": "claimed edit\n", "README.md": "out of scope\n", "notes.txt": "new and unclaimed\n" });
    const result = await office.send("tank", "edit", { claims: ["src/a.ts"] });
    const write = result.write!;
    expect(result.status).toBe("completed");
    expect(write.outOfScope.sort()).toEqual(["README.md", "notes.txt"]);
    expect(write.reverted).toBe(true);
    expect(write.inScope).toEqual(["src/a.ts"]);
    expect(write.applicable).toBe(true);
    expect(write.diff).toContain("+claimed edit");
    expect(write.diff).not.toContain("out of scope");
    expect(await readFile(join(write.worktree, "README.md"), "utf8")).toBe("hello\n");
    await expect(readFile(join(write.worktree, "notes.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    const changed = (await git(write.worktree, ["diff", "--name-only", write.base, "HEAD"])).trim();
    expect(changed).toBe("src/a.ts");
  }, 30_000);

  it("fails the turn and applies nothing when the owner's folder changes during it, naming the path", async () => {
    const { office, events } = await writer({ "src/a.ts": "claimed edit\n" }, async (_cwd, owner) => { owner.write("README.md", "changed under the turn\n"); });
    const result = await office.send("tank", "edit", { claims: ["src/a.ts"] });
    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("README.md");
    expect(result.write?.applicable).toBe(false);
    expect(result.write?.reason).toContain("README.md");
    expect((events.find((event) => event.type === "guard")!.data as { changes: string[] }).changes.join(" ")).toContain("README.md");
    await expect(office.send("tank", "again")).rejects.toThrow("reconnect explicitly");
  }, 30_000);

  it("raises nothing for an edit made between turns, and a shadow branch is no change", async () => {
    let turn = 0;
    const { repo, office } = await writer({}, async (cwd) => { await writeFile(join(cwd, "src/a.ts"), `claimed edit ${++turn}\n`); });
    expect((await office.send("tank", "edit", { claims: ["src/a.ts"] })).write?.applicable).toBe(true);
    repo.write("README.md", "owner edit between turns\n");
    const second = await office.send("tank", "edit again");
    expect(second.status).toBe("completed");
    expect(second.write?.applicable).toBe(true);
  }, 30_000);

  it("refuses overlapping claims naming the holder, and claims for a soldier that cannot write, starting nothing", async () => {
    const { office, started } = await writer({ "src/a.ts": "x\n" });
    await office.open("tank", { claims: ["src/**"] });
    await expect(office.open("medic", { claims: ["src/a.ts"] })).rejects.toThrow(/tank/);
    await expect(office.open("scout", { claims: ["src/a.ts"] })).rejects.toThrow("cannot write");
    await expect(office.send("tank", "x", { claims: ["README.md"] })).rejects.toThrow("holds claims");
    await expect(office.send("medic", "x", { claims: ["../outside"] })).rejects.toThrow();
    expect(started).toHaveLength(1);
  }, 30_000);

  windowsOnly("keeps the claimed work of a cut-short turn on the branch, unusable until the owner decides", async () => {
    const repo = makeRepo(); repos.push(repo);
    const events: OfficeEvent[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, onEvent: (event) => events.push(event), channelFactory: factory }); offices.push(office);
    const opened = await office.open("tank", { claims: ["partial.txt"] });
    const pending = office.send("tank", "partial");
    await until(() => events.some((event) => event.type === "tool_call"));
    await office.interrupt("tank");
    const result = await pending;
    expect(result.status).not.toBe("completed");
    expect(result.write?.applicable).toBe(false);
    expect(result.write?.inScope).toEqual(["partial.txt"]);
    expect(result.write?.worktree).toBe(opened.cwd);
    expect(await readFile(join(opened.cwd, "partial.txt"), "utf8")).toBe("partial edit\n");
  }, 30_000);

  it("C1: a no-op turn after an interrupted one never makes the retained edit applicable; reconnecting starts fresh", async () => {
    const repo = makeRepo(); repos.push(repo);
    const events: OfficeEvent[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, onEvent: (event) => events.push(event), channelFactory: factory }); offices.push(office);
    const opened = await office.open("tank", { claims: ["partial.txt"] });
    const pending = office.send("tank", "partial");
    await until(() => events.some((event) => event.type === "tool_call"));
    await office.interrupt("tank");
    const first = await pending;
    expect(first.write?.applicable).toBe(false);
    expect(first.write?.reason).toContain("reconnect");
    await expect(office.send("tank", "inspect")).rejects.toThrow("reconnect explicitly");
    const reopened = await office.open("tank", { claims: ["partial.txt"] });
    expect(reopened.cwd).not.toBe(opened.cwd);
    const noop = await office.send("tank", "inspect");
    expect(noop.status).toBe("completed");
    expect(noop.write?.applicable).toBe(false);
    expect(noop.write?.diff).not.toContain("partial edit");
    expect(await readFile(join(opened.cwd, "partial.txt"), "utf8")).toBe("partial edit\n");
  }, 30_000);

  it("C2: a send that overlaps a pending open with different claims is refused before any brief is sent", async () => {
    const { repo, office, started } = await writer({ "README.md": "edited under the wrong claims\n" });
    const [opened, sent] = await Promise.allSettled([office.open("tank", { claims: ["src/a.ts"] }), office.send("tank", "edit", { claims: ["README.md"] })]);
    expect(opened.status).toBe("fulfilled");
    expect(sent.status).toBe("rejected");
    expect(String((sent as PromiseRejectedResult).reason)).toContain("holds claims");
    expect(started).toHaveLength(1);
    const worktree = (opened as PromiseFulfilledResult<{ cwd: string }>).value.cwd;
    expect(await readFile(join(worktree, "README.md"), "utf8")).toBe("hello\n");
    expect(await readFile(join(repo.dir, "README.md"), "utf8")).toBe("hello\n");
  }, 30_000);

  it("C3: keeps the claims lease alive across turns, and fails closed once it expired and changed hands (fake clock)", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    let turn = 0;
    const { repo, office, events } = await writer({}, async (cwd) => { await writeFile(join(cwd, "src/a.ts"), `edit ${++turn}\n`); });
    const locks = new Locks(join(repo.dir, ".shadow"));
    expect((await office.send("tank", "edit", { claims: ["src/a.ts"] })).write?.applicable).toBe(true);
    // The owner keeps the first turn, so the second turn's apply meets no uncommitted change (#99 C1 takes a refused apply down).
    await git(repo.dir, ["commit", "-qam", "keep the first turn"]);
    // The first audit stopped v1's heartbeat; the office's own keeps the lease for 80 minutes past a 60-minute TTL.
    for (let step = 0; step < 4; step++) {
      const before = (await locks.list())[0]!.expiresAt;
      await vi.advanceTimersByTimeAsync(20 * 60_000);
      await until(async () => ((await locks.list())[0]?.expiresAt ?? 0) > before);
    }
    await expect(locks.acquire({ owner: "medic", claims: ["src/a.ts"] })).rejects.toThrow(/tank/);
    expect((await office.send("tank", "edit")).write?.applicable).toBe(true);
    // A lease that expires without renewal (the process slept) is taken by another soldier.
    vi.setSystemTime(Date.now() + 61 * 60_000);
    await locks.acquire({ owner: "medic", claims: ["src/a.ts"], ttlMs: 60 * 60_000 });
    await expect(office.send("tank", "edit")).rejects.toThrow("lease was lost");
    expect(turn).toBe(2);
    expect(events.some((event) => event.type === "down")).toBe(true);
  }, 30_000);
});
