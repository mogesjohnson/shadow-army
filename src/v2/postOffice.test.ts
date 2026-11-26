import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { existsSync, linkSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { armyMark, type GitFactory } from "./snapshot.js";
import { HarnessGit } from "./git/harness.js";
import { git } from "../workspace/git.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { makeRoster } from "../core/roster.testutil.js";
import { windowsOnly } from "./windowsOnly.testutil.js";
import type { ChannelOptions, NativeChannel } from "./channel.js";
import type { SweepOps } from "./contain/sweep.js";
import { PostOffice, type OfficeEvent, type OfficeOps } from "./postOffice.js";
import { credential, factory, roster, until } from "./fixture-main.testutil.js";

// WSP-11: snapshots go outside the folder; these tests keep theirs in a folder of their own in the home.
const snapshots = mkdtempSync(join(homedir(), ".sa-test-snapshots-"));
process.env.SHADOW_ARMY_SNAPSHOTS = snapshots;
afterAll(() => rmSync(snapshots, { recursive: true, force: true }));
const offices: PostOffice[] = [];
const repos: ReturnType<typeof makeRepo>[] = [];
async function setup(onSend?: (text: string, repo: ReturnType<typeof makeRepo>) => void) {
  const repo = makeRepo(); repos.push(repo);
  repo.write("src/a.ts", "owner's uncommitted work\n");
  const events: OfficeEvent[] = [];
  const deliveries: string[] = [];
  const responses: unknown[] = [];
  const office = await PostOffice.create({ cwd: repo.dir, credential, roster, channelFactory: (options) => {
    const native = factory(options);
    return { send(text) { deliveries.push(text); onSend?.(text, repo); return native.send(text); }, interrupt: () => native.interrupt(), respondApproval: (id, response) => { responses.push(response); return native.respondApproval(id, response); }, close: () => native.close() };
  }, onEvent: (event) => events.push(event) });
  offices.push(office);
  return { repo, office, events, deliveries, responses };
}
afterEach(async () => {
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
    // WSP-11: a read-only snapshot's own write is discarded, not a guard failure; the owner's change to the checkout during the turn is.
    const { office, events, deliveries } = await setup((text, repo) => { if (text === "partial-success-fail") repo.write("src/b.ts", "owner's change during the turn\n"); });
    const opened = await office.open("scout");
    const result = await office.send("scout", "partial-success-fail");
    expect(events.filter((event) => event.type === "tool_call")).toHaveLength(1);
    expect(events.find((event) => event.type === "tool_result")?.data).toMatchObject({ tool_use_id: "edit-success", is_error: false, content: "Edit completed" });
    expect(events.find((event) => event.type === "error")?.data).toMatchObject({ kind: "rate_limit" });
    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("partial work is retained");
    expect(result.error?.message).toContain("read-only snapshot: wrote partial.txt");
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
    const { office, events, responses } = await setup();
    const opened = await office.open("scout");
    const pending = office.send("scout", "approval");
    await until(() => events.some((event) => event.type === "approval"));
    const requestId = (events.find((event) => event.type === "approval")!.data as { request_id: string }).request_id;
    await expect(office.approval("scout", requestId, { behavior: "allow", note: credential.toUpperCase() })).rejects.toThrow("cannot be forwarded");
    await expect(readFile(join(opened.cwd, "approval-response.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(responses).toEqual([]);
    await office.approval("scout", requestId, { behavior: "deny", message: "Owner denied" });
    // The fake's record of the response is a snapshot write, discarded at the turn's end (WSP-11); the forwarded response and the CLI's answer show it arrived.
    expect((await pending).text).toBe("Explicit owner denied");
    expect(responses).toEqual([{ behavior: "deny", message: "Owner denied" }]);
    expect(events.find((event) => event.type === "read_violation")?.data).toMatchObject({ files: ["approval-response.json"] });
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
        // WSP-11: a snapshot write alone is a reported, discarded read-violation; only a change in the owner's folder fails the guard and keeps the partial work.
        async send() { await writeFile(join(options.cwd, "partial.txt"), "retained partial\n"); await writeFile(join(repo.dir, "stray.txt"), "owner folder change\n"); return { status: "completed", text: "edit completed", refusal: false }; },
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
    const { repo, office } = await writer({ "src/a.ts": "claimed edit\n" });
    expect((await office.send("tank", "edit", { claims: ["src/a.ts"] })).write?.applicable).toBe(true);
    repo.write("README.md", "owner edit between turns\n");
    const second = await office.send("tank", "edit again");
    expect(second.status).toBe("completed");
    expect(second.write?.applicable).toBe(true);
  }, 30_000);

  it("carries an apply queued ahead of a finishing turn's guard into that turn's baseline (review 15 C7)", async () => {
    const repo = makeRepo(); repos.push(repo);
    let releaseMedic!: () => void;
    const medicGate = new Promise<void>((done) => { releaseMedic = done; });
    let medicSending = false;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, channelFactory: (options): NativeChannel => {
      return { async send(text) {
        if (text.includes("edit b")) { medicSending = true; await medicGate; await writeFile(join(options.cwd, "src", "b.ts"), "medic\n"); }
        else await writeFile(join(options.cwd, "src", "a.ts"), "tank\n");
        return { status: "completed", text: "done", refusal: false };
      }, async interrupt() {}, async respondApproval() {}, async close() {} };
    } }); offices.push(office);
    // Opening a write session can outlast `until`'s 6 s on a loaded Windows machine; the test's own timeout bounds this wait.
    const settle = async (check: () => boolean) => { while (!check()) await new Promise((done) => setTimeout(done, 10)); };
    // Exclusive calls: medic's start (1), tank's start (2), tank's guard (3), tank's apply (4), medic's guard (5).
    // Tank's apply waits until medic's turn has returned and queued its guard, so medic's guard runs after the apply.
    const inner = office as unknown as { exclusive: <T>(fn: () => Promise<T>) => Promise<T> };
    const exclusive = inner.exclusive.bind(office);
    let calls = 0;
    inner.exclusive = (fn) => {
      const call = ++calls;
      return exclusive(async () => { if (call === 4) { releaseMedic(); await settle(() => calls >= 5); } return fn(); });
    };
    const medic = office.send("medic", "edit b", { claims: ["src/b.ts"] });
    await settle(() => medicSending);
    const tank = await office.send("tank", "edit a", { claims: ["src/a.ts"] }).finally(releaseMedic);
    expect(tank.write?.apply?.applied).toBe(true);
    const result = await medic;
    expect(result.error?.message ?? "").not.toContain("src/a.ts");
    expect(result.status).toBe("completed");
    expect(result.write?.applicable).toBe(true);
  }, 120_000);

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
  // PO-7 / PO-16 / PO-15: the close path removes an ended tree's record; a close that throws keeps it and the soldier down.
  it.each([["ends", false], ["throws", true]] as const)("on shutdown, a tree that %s has its record handled (M1b-23)", async (_name, throws) => {
    const repo = makeRepo(); repos.push(repo);
    const events: OfficeEvent[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, onEvent: (event) => events.push(event), channelFactory: (): NativeChannel => ({
      async send() { return { status: "completed", text: "", refusal: false }; }, async interrupt() {}, async respondApproval() {},
      async close() { if (throws) throw new Error("tree not empty: 4120 node child.js"); },
    }) });
    let removed = 0;
    try {
      await office.open("scout");
      (office as unknown as { sessions: Map<string, { tree?: unknown }> }).sessions.get("scout")!.tree = { remove: async () => { removed++; } };
      if (throws) await expect(office.close()).rejects.toBeInstanceOf(AggregateError);
      else await office.close();
      expect(removed).toBe(throws ? 0 : 1);
      expect(office.downSoldiers.isDown("scout")).toBe(throws);
      const failed = events.find((event) => event.type === "containment_failed");
      if (throws) expect((failed!.data as { message: string }).message).toMatch(/^Containment failed for .+: tree not empty: 4120 node child\.js\. .+ is down and won't restart by itself\.$/);
      else expect(failed).toBeUndefined();
    } finally { await office.close().catch(() => {}); }
  }, 30_000);
});

describe("M1b-26 harness git and outside snapshots", () => {
  it("opens a read-only session in a snapshot outside the folder, under the army's mark, and removes it at close", async () => {
    const { repo, office, events } = await setup();
    const opened = await office.open("scout");
    const subfolder = join(snapshots, `${office.root.split("/").at(-1)}-${armyMark(office.root)}`);
    expect(opened.cwd).toBe(join(subfolder, opened.session));
    expect(opened.cwd.startsWith(repo.dir)).toBe(false);
    expect(readdirSync(opened.cwd)).toContain("README.md");
    await office.closeSession("scout");
    expect(existsSync(opened.cwd)).toBe(false);
    expect(existsSync(subfolder)).toBe(false);
    expect(events.find((event) => event.type === "session_closed")?.data).toMatchObject({ retained: false });
  }, 30_000);

  it("starts no soldier when SHADOW_ARMY_SNAPSHOTS is bad, and never runs it in the folder", async () => {
    process.env.SHADOW_ARMY_SNAPSHOTS = "relative/path";
    try {
      const { office } = await setup();
      await expect(office.open("scout")).rejects.toThrow("SHADOW_ARMY_SNAPSHOTS must be an absolute path");
    } finally { process.env.SHADOW_ARMY_SNAPSHOTS = snapshots; }
  });

  it("holds harness git while a repository hook differs from what it trusted, across a restart, and logs the hold (WSP-10)", async () => {
    const { repo, office, events } = await setup();
    const hook = join(repo.dir, ".git", "hooks", "post-checkout");
    await writeFile(hook, "#!/bin/sh\necho planted\n");
    await expect(office.open("scout")).rejects.toThrow(/harness git held · \.git\/hooks\/post-checkout changed/);
    await office.close();
    // The restart keeps the state the held post office trusted, so the hook still holds harness git.
    const restarted = await PostOffice.create({ cwd: repo.dir, credential, roster, channelFactory: factory, onEvent: (event) => events.push(event) }); offices.push(restarted);
    expect(events.find((event) => event.type === "git_hold" && (event.data as { held?: boolean }).held)?.data).toMatchObject({ line: expect.stringContaining(".git/hooks/post-checkout differs from what the last post office trusted") });
    rmSync(hook);
    expect((await restarted.open("scout")).cwd.startsWith(repo.dir)).toBe(false);
    const log = (await readFile(join(repo.dir, ".shadow", "v2", "logs", "post-office.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(log.filter((record) => record.type === "git_hold" && record.data.event).map((record) => record.data.event)).toEqual(["trusted", "held", "held", "released"]);
  });

  it("keeps a read-only turn's harness git calls, hold checks included, to a fixed count (each costs ~440 ms on Windows)", async () => {
    const repo = makeRepo(); repos.push(repo);
    for (const name of ["a", "b", "c"]) repo.write(`src/${name}.ts`, "owner's uncommitted work\n");
    const calls: string[][] = [];
    const counting: GitFactory = (target) => {
      const harness = new HarnessGit({ repo: target, hooksDir: join(repo.dir, ".shadow", "v2", "hooks") });
      return { run: (args, kind, cwd) => { calls.push(args); return harness.run(args, kind, cwd); } };
    };
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, gitFactory: counting,
      channelFactory: (): NativeChannel => ({ async send() { return { status: "completed", text: "ok", refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {} }) });
    offices.push(office);
    await office.open("scout");
    calls.length = 0;
    expect((await office.send("scout", "look")).status).toBe("completed");
    console.log(`read-only turn: ${calls.length} harness git calls: ${calls.map((args) => args[0]).join(" ")}`);
    // Three dirty files are hashed in one call per guard read, not one call each.
    expect(calls.filter((args) => args[0] === "hash-object")).toHaveLength(2);
    // Was 34 (one hash-object per dirty file per read, and a hold check twice in a row after the turn).
    // 28 before #120's repaired audit (review 15 C9), which adds a config, a diff and an ls-files call per turn.
    expect(calls.length).toBeLessThanOrEqual(31);
  }, 60_000);

  it("puts no ignore file back through a link out of the snapshot on a live turn, and reports it (review 15 C9)", async () => {
    const repo = makeRepo({ "README.md": "hello\n", ".gitignore": "*.tmp\n", "sub/.gitignore": "*.log\n" }); repos.push(repo);
    const outside = mkdtempSync(join(homedir(), ".sa-test-outside-"));
    const events: OfficeEvent[] = [];
    try {
      await mkdir(join(outside, "sub")); await writeFile(join(outside, "sub", ".gitignore"), "outside\n"); await writeFile(join(outside, "hard"), "outside\n"); await writeFile(join(outside, "sub", "keep"), "keep\n");
      const office = await PostOffice.create({ cwd: repo.dir, credential, roster, onEvent: (event) => events.push(event),
        channelFactory: (options): NativeChannel => ({ async send() {
          rmSync(join(options.cwd, "sub"), { recursive: true }); symlinkSync(join(outside, "sub"), join(options.cwd, "sub"), process.platform === "win32" ? "junction" : "dir");
          rmSync(join(options.cwd, ".gitignore")); linkSync(join(outside, "hard"), join(options.cwd, ".gitignore"));
          return { status: "completed", text: "ok", refusal: false };
        }, async interrupt() {}, async respondApproval() {}, async close() {} }) });
      offices.push(office);
      const opened = await office.open("scout");
      await office.send("scout", "look");
      expect(events.find((event) => event.type === "read_violation")?.data).toMatchObject({ files: expect.arrayContaining([".gitignore", "sub/.gitignore"]) });
      expect([await readFile(join(outside, "sub", ".gitignore"), "utf8"), await readFile(join(outside, "hard"), "utf8")]).toEqual(["outside\n", "outside\n"]);
      // Putting the snapshot back unlinks the link first: git's clean would otherwise delete the outside folder's files.
      expect(existsSync(join(outside, "sub", "keep"))).toBe(true);
      expect(await readFile(join(opened.cwd, "sub", ".gitignore"), "utf8")).toBe("*.log\n");
    } finally { rmSync(outside, { recursive: true, force: true }); }
  }, 60_000);

  it("refuses a folder outside any git working tree", async () => {
    const outside = mkdtempSync(join(homedir(), ".sa-test-nogit-"));
    try { await expect(PostOffice.create({ cwd: outside, credential, roster })).rejects.toThrow("the army runs only inside a git working tree"); }
    finally { rmSync(outside, { recursive: true, force: true }); }
  });
});

describe("M1b-26 PO-1 startup and the tree callers (fake processes, no real waits)", () => {
  /** pid -> start time of the processes that run; ending one removes it. */
  function fakeOps(alive: Map<number, number>, ended: number[] = [], waits: number[] = []): SweepOps {
    return { platform: "linux", startTimeOf: async (pid) => alive.get(pid), commandOf: async (pid) => `fake ${pid}`,
      endProcess: async (pid) => { ended.push(pid); alive.delete(pid); }, wait: async (ms) => { waits.push(ms); } };
  }
  const idle = (onList?: () => { pid: number; startTime: number }[]) => (options: ChannelOptions): NativeChannel & { list?: () => Promise<{ pid: number; startTime: number }[]> } => ({
    async send(text) { return { status: "completed", text, refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {},
    ...(onList ? { list: async () => onList() } : {}), ...{ options } });
  const treeFiles = (dir: string) => { try { return readdirSync(join(dir, ".shadow", "v2", "trees")); } catch { return []; } };

  it("writes the tree record before the CLI starts, lists the tree after each turn and removes the record at close", async () => {
    const repo = makeRepo(); repos.push(repo);
    let atStart: string[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 1]])),
      channelFactory: (options) => { atStart = treeFiles(repo.dir); return idle(() => [{ pid: 500, startTime: 7 }])(options); } }); offices.push(office);
    const opened = await office.open("scout");
    expect(atStart).toEqual([`${opened.session}.jsonl`]);
    await office.send("scout", "inspect");
    const lines = (await readFile(join(repo.dir, ".shadow", "v2", "trees", `${opened.session}.jsonl`), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toEqual([{ kind: "post-office", pid: process.pid, startTime: 1 }, { kind: "process", pid: 500, startTime: 7 }]);
    await office.closeSession("scout");
    expect(treeFiles(repo.dir)).toEqual([]);
  });

  it("starts no CLI when the tree can't be recorded (PO-15)", async () => {
    const repo = makeRepo(); repos.push(repo);
    let starts = 0;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map()), channelFactory: (options) => { starts++; return idle()(options); } }); offices.push(office);
    await expect(office.open("scout")).rejects.toThrow("Containment failed for");
    expect(starts).toBe(0);
    expect(treeFiles(repo.dir)).toEqual([]);
  });

  it("holds the guard open while a named process runs, then reconnects only once none does", async () => {
    const repo = makeRepo(); repos.push(repo);
    const alive = new Map([[process.pid, 1], [600, 9]]), ended: number[] = [], waits: number[] = [];
    const channels: ChannelOptions[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(alive, ended, waits), channelFactory: (options) => {
      channels.push(options);
      return { ...idle(() => [...alive].filter(([pid]) => pid === 600).map(([pid, startTime]) => ({ pid, startTime })))(options),
        async send(text) { if (channels.length === 1 && text === "fail") options.onEvent({ type: "closed", data: { containmentStopped: false } }); return { status: "completed", text, refusal: false }; } };
    } }); offices.push(office);
    await office.send("scout", "list");
    const failed = await office.send("scout", "fail");
    expect(failed.status).toBe("interrupted");
    expect(failed.error?.message).toMatch(/the processes it named have stopped; nothing is applied/);
    expect(ended).toEqual([600]);
    expect(waits).toEqual([10_000]);
    alive.set(600, 9);
    await expect(office.open("scout")).rejects.toThrow("not confirmed stopped");
    alive.delete(600);
    await office.open("scout");
    expect(channels).toHaveLength(2);
  });

  it("finishes a turn whose leftovers are unknown as interrupted, saying the attribution card can't cover them (PO-15)", async () => {
    const repo = makeRepo(); repos.push(repo);
    const events: OfficeEvent[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 1]])), onEvent: (event) => events.push(event), channelFactory: (options) => ({
      ...idle()(options), async send(text) { options.onEvent({ type: "closed", data: { containmentStopped: false } }); return { status: "completed", text, refusal: false }; } }) });
    const result = await office.send("scout", "fail");
    expect(result.status).toBe("interrupted");
    expect(result.error?.message).toMatch(/may still be running, and what they change won't be on the turn's attribution card; nothing is applied/);
    expect(events.find((event) => event.type === "containment_turn")?.data).toMatchObject({ ended: false });
    await expect(office.close()).rejects.toThrow("could not be closed");
  });

  const v2 = (dir: string, ...parts: string[]) => join(dir, ".shadow", "v2", ...parts);
  const completions = async (dir: string) => (await readFile(v2(dir, "completed-turns.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { turn: string; late?: boolean });

  it("sends nothing when the turn's baseline can't be written, and records each finished turn by its ID before its baseline goes (PO-1)", async () => {
    const repo = makeRepo(); repos.push(repo);
    let sent = 0;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 1]])), channelFactory: (options) => ({ ...idle()(options), async send(text) { sent++; return { status: "completed", text, refusal: false }; } }) }); offices.push(office);
    await office.send("scout", "first");
    expect(sent).toBe(1);
    expect(readdirSync(v2(repo.dir, "turns"))).toEqual([]);
    const [first] = await completions(repo.dir);
    expect(first!.turn).toMatch(/^[0-9a-f-]{36}$/);
    rmSync(v2(repo.dir, "turns"), { recursive: true });
    await writeFile(v2(repo.dir, "turns"), "a file where the folder goes");
    const blocked = await office.send("scout", "second");
    expect(sent).toBe(1);
    expect(blocked.status).toBe("failed");
    expect(blocked.error?.message).toMatch(/baseline could not be written/);
  });

  it("at startup removes a baseline whose completion is on disk without reporting it again, and keeps one whose completion can't be written (PO-1)", async () => {
    const repo = makeRepo(); repos.push(repo);
    await mkdir(v2(repo.dir, "turns"), { recursive: true }); await mkdir(v2(repo.dir, "trees"), { recursive: true });
    const base = { head: "", branch: "", dirty: [], index: [], refs: [] };
    for (const [session, turn] of [["s-done", "t-done"], ["s-open", "t-open"]]) {
      await writeFile(v2(repo.dir, "turns", `${session}.json`), JSON.stringify({ turn, soldier: "scout", time: new Date().toISOString(), base }));
      await writeFile(v2(repo.dir, "trees", `${session}.jsonl`), `${JSON.stringify({ kind: "post-office", pid: 998, startTime: 4 })}\n`);
    }
    // s-done's turn finished but its post office stopped before the baseline went; s-open's completion file can't be appended to.
    await mkdir(v2(repo.dir, "completed-turns.jsonl"));
    const events: OfficeEvent[] = [];
    const first = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 2]])), onEvent: (event) => events.push(event), channelFactory: idle() }); offices.push(first);
    expect(readdirSync(v2(repo.dir, "turns")).sort()).toEqual(["s-done.json", "s-open.json"]);
    expect(events.some((event) => event.type === "startup" && (event.data as { pending?: boolean }).pending)).toBe(true);
    rmSync(v2(repo.dir, "completed-turns.jsonl"), { recursive: true });
    await writeFile(v2(repo.dir, "completed-turns.jsonl"), `${JSON.stringify({ turn: "t-done" })}\n`);
    events.length = 0;
    await first.open("scout");
    expect(readdirSync(v2(repo.dir, "turns"))).toEqual([]);
    const reported = events.filter((event) => event.type === "late_guard").map((event) => (event.data as { session: string }).session);
    expect(reported).toEqual(["s-open"]);
    expect((await completions(repo.dir)).map((line) => line.turn)).toEqual(["t-done", "t-open"]);
  });

  it("at startup sweeps dead trees, checks the open turn against its baseline and reports and removes the snapshot it left", async () => {
    const repo = makeRepo(); repos.push(repo);
    let release!: () => void;
    const first = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 1]])), channelFactory: (options) => ({
      ...idle()(options), send: (text) => new Promise((done) => { release = () => done({ status: "completed", text, refusal: false }); }) }) }); offices.push(first);
    const opened = await first.open("scout");
    const pending = first.send("scout", "hang");
    await until(() => existsSync(join(repo.dir, ".shadow", "v2", "turns", `${opened.session}.json`)));
    repo.write("src/late.ts", "changed after the crash\n");
    await writeFile(join(opened.cwd, "soldier.txt"), "a write\n");
    await mkdir(join(repo.dir, ".shadow", "v2", "turns"), { recursive: true });
    await writeFile(join(repo.dir, ".shadow", "v2", "turns", "session-broken.json"), "{");
    // A dead post office ran it; one with no tree record would be unresolved and kept (PO-1).
    await writeFile(join(repo.dir, ".shadow", "v2", "trees", "session-broken.jsonl"), `${JSON.stringify({ kind: "post-office", pid: 998, startTime: 4 })}\n`);
    await writeFile(join(repo.dir, ".shadow", "v2", "trees", "dead.jsonl"), `${JSON.stringify({ kind: "post-office", pid: 999, startTime: 5 })}\n${JSON.stringify({ kind: "process", pid: 501, startTime: 3 })}\n`);
    // The second post office runs on a machine where the first one's identity no longer matches: it died.
    const events: OfficeEvent[] = [], ended: number[] = [];
    const second = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 2], [501, 3]]), ended), onEvent: (event) => events.push(event), channelFactory: idle() }); offices.push(second);
    expect(ended).toEqual([501]);
    expect(treeFiles(repo.dir)).not.toContain("dead.jsonl");
    const lines = events.filter((event) => event.type === "late_guard").map((event) => (event.data as { line: string }).line);
    expect(lines).toEqual(expect.arrayContaining([expect.stringMatching(/^session-broken's turn at an unknown time not checked: baseline missing$/), expect.stringMatching(/turn at \d\d:\d\d checked after its post office stopped: .*src\/late\.ts/)]));
    expect(readdirSync(join(repo.dir, ".shadow", "v2", "turns"))).toEqual([]);
    expect(events.find((event) => event.type === "read_violation")?.data).toMatchObject({ session: opened.session, files: ["soldier.txt"] });
    expect(existsSync(opened.cwd)).toBe(false);
    release(); await pending.catch(() => {});
    // Two offices in one folder close one after the other, so their git calls don't race the folder's removal.
    await first.close().catch(() => {}); await second.close();
  }, 30_000);

  /** A post office stopped mid-turn: its open turn file and its read-only snapshot stay for the next one. */
  async function stoppedMidTurn() {
    const repo = makeRepo(); repos.push(repo);
    let release!: () => void;
    const first = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 1]])), channelFactory: (options) => ({
      ...idle()(options), send: (text) => new Promise((done) => { release = () => done({ status: "completed", text, refusal: false }); }) }) }); offices.push(first);
    const opened = await first.open("scout");
    const pending = first.send("scout", "hang");
    const turn = join(repo.dir, ".shadow", "v2", "turns", `${opened.session}.json`);
    await until(() => existsSync(turn));
    await writeFile(join(opened.cwd, "soldier.txt"), "a write\n");
    const record = join(repo.dir, ".shadow", "v2", "snapshots", `${opened.session}.json`);
    const finish = async () => { release(); await pending.catch(() => {}); await first.close().catch(() => {}); };
    return { repo, opened, turn, record, finish };
  }

  it("keeps the turn baseline and snapshot pending while harness git is held, and resumes once a hold check passes (WSP-10)", async () => {
    const { repo, opened, turn, record, finish } = await stoppedMidTurn();
    expect(existsSync(record)).toBe(true);
    const hook = join(repo.dir, ".git", "hooks", "post-checkout");
    await writeFile(hook, "#!/bin/sh\n");
    const events: OfficeEvent[] = [];
    const second = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 2]])), onEvent: (event) => events.push(event), channelFactory: idle() }); offices.push(second);
    expect(events.some((event) => event.type === "git_hold" && (event.data as { held?: boolean }).held)).toBe(true);
    expect(events.some((event) => event.type === "startup" && (event.data as { pending?: boolean }).pending)).toBe(true);
    expect([existsSync(turn), existsSync(opened.cwd), existsSync(record)]).toEqual([true, true, true]);
    await expect(second.open("scout")).rejects.toThrow(/harness git held/);
    expect([existsSync(turn), existsSync(opened.cwd)]).toEqual([true, true]);
    rmSync(hook);
    await second.open("scout");
    expect([existsSync(turn), existsSync(opened.cwd), existsSync(record)]).toEqual([false, false, false]);
    expect(events.some((event) => event.type === "late_guard" && /checked after its post office stopped/.test((event.data as { line: string }).line))).toBe(true);
    expect(events.find((event) => event.type === "read_violation")?.data).toMatchObject({ session: opened.session, files: ["soldier.txt"] });
    await finish(); await second.close();
  }, 60_000);

  it("keeps a snapshot pending when its status check is refused, checking it with the recorded git identity (WSP-10, WSP-11)", async () => {
    const { repo, opened, turn, record, finish } = await stoppedMidTurn();
    const recorded = JSON.parse(await readFile(record, "utf8")) as { path: string; gitDir: string };
    const seen: string[] = [];
    const refusing: GitFactory = (target) => {
      const harness = new HarnessGit({ repo: target, hooksDir: join(repo.dir, ".shadow", "v2", "hooks") });
      return { run: async (args, kind, cwd) => {
        if (args[0] !== "status" || resolve(target.workTree) !== resolve(recorded.path)) return harness.run(args, kind, cwd);
        seen.push(target.gitDir);
        return { code: 128, stdout: "", stderr: "refused" };
      } };
    };
    const events: OfficeEvent[] = [];
    const second = await PostOffice.create({ cwd: repo.dir, credential, roster, gitFactory: refusing, processOps: fakeOps(new Map([[process.pid, 2]])), onEvent: (event) => events.push(event), channelFactory: idle() }); offices.push(second);
    expect(seen).toEqual([recorded.gitDir]);
    expect(existsSync(turn)).toBe(false);
    expect([existsSync(opened.cwd), existsSync(record)]).toEqual([true, true]);
    expect(events.find((event) => event.type === "snapshot" && (event.data as { pending?: boolean }).pending)?.data).toMatchObject({ session: opened.session, reason: expect.stringContaining("refused") });
    expect(events.some((event) => event.type === "read_violation")).toBe(false);
    await finish(); await second.close();
  }, 60_000);

  it("recovers a snapshot under its recorded root after the setting changed, reporting a commit made in it (WSP-11)", async () => {
    const { repo, opened, record, finish } = await stoppedMidTurn();
    await git(opened.cwd, ["add", "soldier.txt"]);
    await git(opened.cwd, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "a commit"]);
    const moved = mkdtempSync(join(homedir(), ".sa-test-snapshots-moved-"));
    process.env.SHADOW_ARMY_SNAPSHOTS = moved;
    const events: OfficeEvent[] = [];
    try {
      const second = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 2]])), onEvent: (event) => events.push(event), channelFactory: idle() }); offices.push(second);
      const violation = events.find((event) => event.type === "read_violation")?.data as { head?: { from: string; to: string }; line: string };
      expect(violation.head?.from).not.toBe(violation.head?.to);
      expect(violation.line).toMatch(/HEAD moved from/);
      expect([existsSync(opened.cwd), existsSync(record)]).toEqual([false, false]);
      await finish(); await second.close();
    } finally { process.env.SHADOW_ARMY_SNAPSHOTS = snapshots; rmSync(moved, { recursive: true, force: true }); }
  }, 60_000);

  it("reports an orphan snapshot whose folder is gone and removes only its own worktree entry (WSP-11)", async () => {
    const { repo, opened, record, finish } = await stoppedMidTurn();
    const { gitDir } = JSON.parse(await readFile(record, "utf8")) as { gitDir: string };
    rmSync(opened.cwd, { recursive: true, force: true });
    const events: OfficeEvent[] = [];
    const second = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 2]])), onEvent: (event) => events.push(event), channelFactory: idle() }); offices.push(second);
    expect(events.find((event) => event.type === "snapshot" && (event.data as { orphan?: boolean }).orphan)?.data).toMatchObject({ session: opened.session, line: expect.stringMatching(/was gone; its worktree entry is removed/) });
    expect([existsSync(gitDir), existsSync(record)]).toEqual([false, false]);
    await finish(); await second.close();
  }, 60_000);
});

describe("M1b-26 review 11: write sessions on harness git, and reconnect cleanup", () => {
  const builders = makeRoster({ tank: { cli: "claude", model: "synthetic", roles: ["build"], write: true }, scout: { cli: "claude", model: "synthetic", roles: ["review"], write: false } });
  /** Harness git that records each call's repository and arguments, and can fail `worktree remove` or `worktree add`. */
  function spyGit(dir: string, calls: string[][], failRemove: { on: boolean; add?: boolean }): GitFactory {
    return (repo) => {
      const harness = new HarnessGit({ repo, hooksDir: join(dir, ".shadow", "v2", "hooks") });
      return { run: async (args, kind, cwd) => {
        calls.push([resolve(repo.workTree), ...args]);
        if (failRemove.on && args[0] === "worktree" && args[1] === "remove") return { code: 1, stdout: "", stderr: "locked" };
        if (failRemove.add && args[0] === "worktree" && args[1] === "add") return { code: 1, stdout: "", stderr: "add failed" };
        return harness.run(args, kind, cwd);
      } };
    };
  }
  async function office(failRemove = { on: false }) {
    const repo = makeRepo(); repos.push(repo);
    const calls: string[][] = [];
    const channels: ChannelOptions[] = [];
    const events: OfficeEvent[] = [];
    const created = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, gitFactory: spyGit(repo.dir, calls, failRemove), onEvent: (event) => events.push(event), channelFactory: (options): NativeChannel => {
      channels.push(options);
      return { async send() { await writeFile(join(options.cwd, "src", "a.ts"), "claimed\n").catch(() => {}); return { status: "completed", text: "done", refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {} };
    } }); offices.push(created);
    return { repo, office: created, calls, channels, events };
  }

  it("opens no write worktree while harness git is held, then makes, audits and commits it through harness git", async () => {
    const { repo, office: post, calls } = await office();
    const hook = join(repo.dir, ".git", "hooks", "post-checkout");
    await writeFile(hook, "#!/bin/sh\n");
    await expect(post.open("tank", { claims: ["src/a.ts"] })).rejects.toThrow(/harness git held/);
    expect(existsSync(join(repo.dir, ".shadow", "worktrees"))).toBe(false);
    rmSync(hook);
    const result = await post.send("tank", "edit", { claims: ["src/a.ts"] });
    expect(result.write?.applicable).toBe(true);
    expect(calls.some((call) => call[1] === "worktree" && call[2] === "add")).toBe(true);
    const inWorktree = calls.filter((call) => call[0] === resolve(result.write!.worktree)).map((call) => call.slice(1).find((arg) => !arg.startsWith("-") && !arg.includes("=")));
    expect(inWorktree).toEqual(expect.arrayContaining(["diff", "ls-files", "add", "commit"]));
  }, 60_000);

  it("removes the worktree when the hold fires on the check after `worktree add`, and releases the claims (C1)", async () => {
    const repo = makeRepo(); repos.push(repo);
    const hook = join(repo.dir, ".git", "hooks", "post-checkout");
    const inner = spyGit(repo.dir, [], { on: false });
    let fire = true;
    const gitFactory: GitFactory = (target) => {
      const git = inner(target);
      return { run: async (args, kind, cwd) => {
        const result = await git.run(args, kind, cwd);
        if (fire && args[0] === "worktree" && args[1] === "add") { fire = false; await writeFile(hook, "#!/bin/sh\n"); }
        return result;
      } };
    };
    const post = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, gitFactory, channelFactory: (): NativeChannel => ({
      async send() { return { status: "completed", text: "done", refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {} }) });
    offices.push(post);
    await expect(post.open("tank", { claims: ["src/a.ts"] })).rejects.toThrow(/harness git held/);
    const folder = join(repo.dir, ".shadow", "worktrees");
    expect(existsSync(folder) ? readdirSync(folder) : []).toEqual([]);
    expect(existsSync(join(repo.dir, ".git", "worktrees")) ? readdirSync(join(repo.dir, ".git", "worktrees")) : []).toEqual([]);
    rmSync(hook);
    const result = await post.send("tank", "edit", { claims: ["src/a.ts"] });
    expect(result.status).toBe("completed");
  }, 60_000);

  it("keeps a down session and its snapshot when reconnecting can't remove it, and the next reconnect does", async () => {
    const failRemove = { on: true };
    const { office: post, channels, events } = await office(failRemove);
    const first = await post.open("scout");
    channels[0]!.onEvent({ type: "error", data: { kind: "login_needed" } });
    channels[0]!.onEvent({ type: "closed", data: {} });
    await until(() => events.some((event) => event.type === "down"));
    await expect(post.open("scout")).rejects.toThrow("could not be removed");
    expect(existsSync(first.cwd)).toBe(true);
    failRemove.on = false;
    const second = await post.open("scout");
    expect(second.cwd).not.toBe(first.cwd);
    expect(existsSync(first.cwd)).toBe(false);
  }, 60_000);

  it("lets reconnect start fresh after a restart removed the old snapshot but could not open a new one (review 15 C8)", async () => {
    const failRemove = { on: false, add: false };
    const { office: post, channels, events } = await office(failRemove);
    const first = await post.open("scout");
    failRemove.add = true;
    channels[0]!.onEvent({ type: "closed", data: {} });
    await until(() => events.some((event) => event.type === "down"));
    expect(existsSync(first.cwd)).toBe(false);
    failRemove.add = false;
    const second = await post.open("scout");
    expect(second.cwd).not.toBe(first.cwd);
    expect(existsSync(second.cwd)).toBe(true);
  }, 60_000);

  it("reports the applied edits and the hold when the hold fires after an apply while another turn runs (w168 note)", async () => {
    const repo = makeRepo(); repos.push(repo);
    const hook = join(repo.dir, ".git", "hooks", "post-checkout");
    const inner = spyGit(repo.dir, [], { on: false });
    const gitFactory: GitFactory = (target) => {
      const git = inner(target);
      return { run: async (args, kind, cwd) => {
        const result = await git.run(args, kind, cwd);
        if (args[0] === "apply" && !args.includes("--check") && !args.includes("-R")) await writeFile(hook, "#!/bin/sh\n");
        return result;
      } };
    };
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    const post = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, gitFactory, channelFactory: (options): NativeChannel => ({
      async send() {
        if (options.cwd.includes("worktrees")) await writeFile(join(options.cwd, "src", "a.ts"), "claimed\n");
        else await gate;
        return { status: "completed", text: "done", refusal: false };
      }, async interrupt() {}, async respondApproval() {}, async close() {} }) });
    offices.push(post);
    const scout = post.send("scout", "look");
    await until(() => (post as unknown as { sessions: Map<string, { guardBase?: unknown }> }).sessions.get("scout")?.guardBase !== undefined);
    const result = await post.send("tank", "edit", { claims: ["src/a.ts"] }).finally(release);
    expect(result.write?.apply).toMatchObject({ applied: true, files: [expect.objectContaining({ path: "src/a.ts" })] });
    expect(result.write?.reason).toMatch(/harness git held/);
    rmSync(hook);
    expect((await scout).status).toBe("failed");
  }, 60_000);
});

describe("M1b-26 review 11 C1, C4: termination and starts gated on verified records (fake processes)", () => {
  type Id = { pid: number; startTime: number };
  /** Identity-bound fakes: `endProcess` (pid only) is never what the office should call; a failing probe throws. */
  function officeOps(alive: Map<number, number>, calls: { ended: Id[]; byPid: number[] } = { ended: [], byPid: [] }, failing = new Set<number>(), stubborn = new Set<number>()): OfficeOps {
    return { platform: "linux", wait: async () => {}, commandOf: async (pid) => `fake ${pid}`,
      // What `systemOps` does on a failed probe: it reads as absence.
      startTimeOf: async (pid) => failing.has(pid) ? undefined : alive.get(pid),
      endProcess: async (pid) => { calls.byPid.push(pid); if (!stubborn.has(pid)) alive.delete(pid); },
      probe: async (pid) => { if (failing.has(pid)) throw new Error(`probe of ${pid} failed`); return alive.get(pid) ?? "gone"; },
      endIdentity: async (one) => { calls.ended.push(one); if (alive.get(one.pid) === one.startTime && !stubborn.has(one.pid)) alive.delete(one.pid); } };
  }
  const channel = (extra: Partial<NativeChannel & { identities(): Promise<{ guardian?: Id; cli?: Id }> }> = {}, sent?: string[]) => (options: ChannelOptions): NativeChannel => ({
    async send(text) { sent?.push(text); return { status: "completed", text, refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {}, ...extra, ...{ options } });
  const trees = (dir: string) => join(dir, ".shadow", "v2", "trees");
  const line = (value: object) => `${JSON.stringify(value)}\n`;
  async function deadTree(dir: string, extra = "") {
    await mkdir(trees(dir), { recursive: true });
    await writeFile(join(trees(dir), "dead.jsonl"), line({ kind: "post-office", pid: 999, startTime: 5 }) + line({ kind: "process", pid: 501, startTime: 3 }) + extra);
  }

  it("ends an earlier tree's process only by its recorded identity, never by its pid alone (C1)", async () => {
    const repo = makeRepo(); repos.push(repo);
    await deadTree(repo.dir);
    const calls = { ended: [] as Id[], byPid: [] as number[] };
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: officeOps(new Map([[process.pid, 1], [501, 3]]), calls), channelFactory: channel() }); offices.push(office);
    expect(calls).toEqual({ ended: [{ pid: 501, startTime: 3 }], byPid: [] });
    expect(existsSync(join(trees(repo.dir), "dead.jsonl"))).toBe(false);
  });

  it("ends nothing, keeps the entry and starts no soldier while a record doesn't verify, then recovers once it does (C1, C4)", async () => {
    const repo = makeRepo(); repos.push(repo);
    await deadTree(repo.dir, `{"kind":"process","pid":502`);
    const calls = { ended: [] as Id[], byPid: [] as number[] };
    let starts = 0;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: officeOps(new Map([[process.pid, 1], [501, 3]]), calls), channelFactory: (options) => { starts++; return channel()(options); } }); offices.push(office);
    await expect(office.open("scout")).rejects.toThrow(/earlier trees not swept, and no soldier starts: dead\.jsonl is not a whole tree record/);
    expect([calls, starts, existsSync(join(trees(repo.dir), "dead.jsonl"))]).toEqual([{ ended: [], byPid: [] }, 0, true]);
    await deadTree(repo.dir);
    await office.open("scout");
    expect([calls.ended, starts]).toEqual([[{ pid: 501, startTime: 3 }], 1]);
  });

  it("treats a failed probe as unknown, never as absence: nothing is ended and starts wait (C1)", async () => {
    const repo = makeRepo(); repos.push(repo);
    await deadTree(repo.dir);
    const calls = { ended: [] as Id[], byPid: [] as number[] };
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: officeOps(new Map([[process.pid, 1], [501, 3]]), calls, new Set([999])), channelFactory: channel() }); offices.push(office);
    await expect(office.open("scout")).rejects.toThrow(/a process check failed: .*probe of 999 failed/);
    expect([calls, existsSync(join(trees(repo.dir), "dead.jsonl"))]).toEqual([{ ended: [], byPid: [] }, true]);
  });

  it("keeps new starts gated while an earlier tree's process still runs, and starts once it stops (C4)", async () => {
    const repo = makeRepo(); repos.push(repo);
    await deadTree(repo.dir);
    const alive = new Map([[process.pid, 1], [501, 3]]), stubborn = new Set([501]);
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: officeOps(alive, undefined, undefined, stubborn), channelFactory: channel() }); offices.push(office);
    await expect(office.open("scout")).rejects.toThrow(/earlier trees still run, and no soldier starts until they stop: 501 fake 501/);
    expect(existsSync(join(trees(repo.dir), "dead.jsonl"))).toBe(true);
    alive.delete(501);
    await office.open("scout");
    expect(existsSync(join(trees(repo.dir), "dead.jsonl"))).toBe(false);
  });

  it("refuses to start a soldier with no process operations rather than run it unrecorded (C4)", async () => {
    const repo = makeRepo(); repos.push(repo);
    let starts = 0;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: null, channelFactory: (options) => { starts++; return channel()(options); } }); offices.push(office);
    await expect(office.open("scout")).rejects.toThrow(/Containment failed for .*no process operations/);
    expect(starts).toBe(0);
  });

  it("puts the guardian's and CLI's identities in the record, and a failed write takes the soldier down on disk with one owner line, sending nothing (C4)", async () => {
    const repo = makeRepo(); repos.push(repo);
    const sent: string[] = [], events: OfficeEvent[] = [];
    let breakRecord = false;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: officeOps(new Map([[process.pid, 1]])), onEvent: (event) => events.push(event),
      channelFactory: channel({ async identities() {
        if (breakRecord) for (const name of readdirSync(trees(repo.dir))) { rmSync(join(trees(repo.dir), name)); await mkdir(join(trees(repo.dir), name)); }
        return { guardian: { pid: 600, startTime: 8 }, cli: { pid: 601, startTime: 9 } };
      } }, sent) }); offices.push(office);
    const opened = await office.open("scout");
    await office.send("scout", "inspect");
    const record = (await readFile(join(trees(repo.dir), `${opened.session}.jsonl`), "utf8")).trim().split("\n").map((text) => JSON.parse(text));
    expect(record).toEqual([{ kind: "post-office", pid: process.pid, startTime: 1 }, { kind: "guardian", pid: 600, startTime: 8 }, { kind: "cli", pid: 601, startTime: 9 }]);
    await office.closeSession("scout");
    breakRecord = true;
    await office.open("scout");
    const result = await office.send("scout", "second");
    expect(sent).toEqual(["inspect"]);
    expect(result.status).not.toBe("completed");
    const down = events.filter((event) => event.type === "containment_failed");
    expect(down).toHaveLength(1);
    expect(down[0]!.data).toMatchObject({ down: true, message: expect.stringMatching(/^Containment failed for .*tree record not written/) });
    expect(office.downSoldiers.isDown("scout")).toBe(true);
    const log = await readFile(join(repo.dir, ".shadow", "v2", "logs", "post-office.jsonl"), "utf8");
    expect(log).toMatch(/"type":"containment_failed".*"down":true/);
  });
});
