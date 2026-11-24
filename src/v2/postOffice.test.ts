import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { armyMark, snapshotSubfolder } from "./snapshot.js";
import { sha256 } from "./trust.js";
import { shadowName } from "./instructions.js";
import type { TrustRow } from "./cli.js";
import { git } from "../workspace/git.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { makeRoster } from "../core/roster.testutil.js";
import { windowsOnly } from "./windowsOnly.testutil.js";
import type { ChannelOptions, NativeChannel } from "./channel.js";
import type { SweepOps } from "./contain/sweep.js";
import { PostOffice, TRUST_WAIT, TrustNeeded, type OfficeEvent } from "./postOffice.js";
import { credential, factory, roster, until } from "./fixture-main.testutil.js";

// WSP-11: snapshots go outside the folder; these tests keep theirs in a folder of their own in the home.
const snapshots = mkdtempSync(join(homedir(), ".sa-test-snapshots-"));
process.env.SHADOW_ARMY_SNAPSHOTS = snapshots;
afterAll(() => rmSync(snapshots, { recursive: true, force: true }));
/** Each restart makes a fresh snapshot (WSP-11): about 7.5 s of harness git on Windows, past `until`'s 6 s bound. */
const untilRestart = async (check: () => boolean): Promise<void> => {
  for (const end = performance.now() + 60_000; !check(); await new Promise((done) => setTimeout(done, 20))) if (performance.now() > end) throw new Error("expected restart did not arrive");
};
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
      await untilRestart(() => i < 3 ? channels.length === i + 2 : events.some((event) => event.type === "down"));
    }
    expect(channels).toHaveLength(4);
    expect(channels.map((channel) => channel.sent)).toEqual([["delivered once"], [], [], []]);
    expect(events.filter((event) => event.type === "restarted")).toHaveLength(3);
    await expect(office.send("scout", "must not replay")).rejects.toThrow("reconnect explicitly");
    await office.open("scout"); expect(channels).toHaveLength(5);
    expect(channels[4]!.sent).toEqual([]);
  }, 120_000);

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
  });

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
    expect(events.find((event) => event.type === "harness_git_held")?.data).toMatchObject({ line: expect.stringContaining(".git/hooks/post-checkout differs from what the last post office trusted") });
    rmSync(hook);
    expect((await restarted.open("scout")).cwd.startsWith(repo.dir)).toBe(false);
    const log = (await readFile(join(repo.dir, ".shadow", "v2", "logs", "post-office.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(log.filter((record) => record.type === "harness_hold").map((record) => record.data.event)).toEqual(["trusted", "held", "held", "released"]);
  });

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

  // M1b-27 / PO-9: the guardian holds the job, so its identity joins the tree record once the channel has one.
  it("adds the channel's guardian to the tree record once per identity, and a channel without one still works", async () => {
    const repo = makeRepo(); repos.push(repo);
    let guardian: { pid: number; startTime: number } | undefined;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 1]])),
      channelFactory: (options) => Object.defineProperty(idle(() => [{ pid: 500, startTime: 7 }])(options), "guardian", { get: () => guardian }) }); offices.push(office);
    const opened = await office.open("scout");
    const lines = async () => (await readFile(join(repo.dir, ".shadow", "v2", "trees", `${opened.session}.jsonl`), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    await office.send("scout", "no guardian yet");
    expect(await lines()).toEqual([{ kind: "post-office", pid: process.pid, startTime: 1 }, { kind: "process", pid: 500, startTime: 7 }]);
    guardian = { pid: 400, startTime: 3 };
    await office.send("scout", "guardian started");
    await office.send("scout", "again");
    expect(await lines()).toEqual([{ kind: "post-office", pid: process.pid, startTime: 1 }, { kind: "process", pid: 500, startTime: 7 }, { kind: "guardian", pid: 400, startTime: 3 }]);
    guardian = { pid: 401, startTime: 4 };
    await office.send("scout", "a restart's guardian");
    expect((await lines()).filter((line) => line.kind === "guardian")).toEqual([{ kind: "guardian", pid: 400, startTime: 3 }, { kind: "guardian", pid: 401, startTime: 4 }]);
  });

  it("reports a guardian line that can't be added once, keeps the session working and tries again next turn", async () => {
    const repo = makeRepo(); repos.push(repo);
    const events: OfficeEvent[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: fakeOps(new Map([[process.pid, 1]])), onEvent: (event) => events.push(event),
      channelFactory: (options) => Object.defineProperty(idle()(options), "guardian", { get: () => ({ pid: 400, startTime: 3 }) }) }); offices.push(office);
    const opened = await office.open("scout");
    const session = (office as unknown as { sessions: Map<string, { tree: { add: (line: unknown) => Promise<void> } }> }).sessions.get("scout")!;
    const real = session.tree.add.bind(session.tree);
    let failing = true;
    session.tree.add = async (line) => { if (failing) throw new Error("disk full"); return real(line); };
    expect((await office.send("scout", "one")).status).toBe("completed");
    expect((await office.send("scout", "two")).status).toBe("completed");
    const reports = events.filter((event) => event.type === "tree_record" && (event.data as { guardian?: boolean }).guardian === false);
    expect(reports).toHaveLength(1);
    expect((reports[0]!.data as { reason: string }).reason).toContain("disk full");
    failing = false;
    await office.send("scout", "three");
    const text = await readFile(join(repo.dir, ".shadow", "v2", "trees", `${opened.session}.jsonl`), "utf8");
    expect(text.trim().split("\n").map((line) => JSON.parse(line)).filter((line) => line.kind === "guardian")).toEqual([{ kind: "guardian", pid: 400, startTime: 3 }]);
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
    expect((await office.send("scout", "fail")).status).toBe("completed");
    expect(ended).toEqual([600]);
    expect(waits).toEqual([10_000]);
    alive.set(600, 9);
    await expect(office.open("scout")).rejects.toThrow("not confirmed stopped");
    alive.delete(600);
    await office.open("scout");
    expect(channels).toHaveLength(2);
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
});

describe("M1b-27 the guard waits for background work, and a backlog pauses soldiers (PO-8, WSP-11, PO-7)", () => {
  type Listed = NativeChannel & { list?: () => Promise<{ pid: number; startTime: number }[]> };
  const task = (subtype: string) => ({ type: "raw" as const, data: { type: "system", subtype, task_id: "t1" } });
  /** A channel whose `send` runs `during` before its result, and that lists `alive` but the post office. */
  const channel = (options: ChannelOptions, during: (text: string) => void, alive?: Map<number, number>): Listed => ({
    async send(text) { during(text); return { status: "completed", text, refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {},
    ...(alive ? { list: async () => [...alive].filter(([pid]) => pid !== process.pid).map(([pid, startTime]) => ({ pid, startTime })) } : {}) });

  it("keeps the guard open past the result until the task's notification, so a write meanwhile fails the turn (M1-AC11)", async () => {
    const repo = makeRepo(); repos.push(repo);
    const events: OfficeEvent[] = [];
    let emit!: ChannelOptions["onEvent"];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: null, onEvent: (event) => events.push(event),
      channelFactory: (options) => { emit = options.onEvent; return channel(options, (text) => { if (text === "bg") emit(task("task_started")); }); } }); offices.push(office);
    let done = false;
    const turn = office.send("scout", "bg").then((result) => { done = true; return result; });
    await until(() => events.some((event) => event.type === "background_work"));
    expect(events.find((event) => event.type === "background_work")?.data).toEqual({ tasks: ["t1"], processes: [] });
    expect(done).toBe(false);
    repo.write("README.md", "written by the task\n");
    emit(task("task_notification"));
    const result = await turn;
    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("README.md");
  });

  it("closing the session ends the wait for a task that never reports its end", async () => {
    const repo = makeRepo(); repos.push(repo);
    const events: OfficeEvent[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: null, onEvent: (event) => events.push(event),
      channelFactory: (options) => channel(options, () => options.onEvent(task("task_started"))) }); offices.push(office);
    const turn = office.send("scout", "bg");
    await until(() => events.some((event) => event.type === "background_work"));
    await office.closeSession("scout");
    expect((await turn).status).toBe("completed");
  });

  it("waits for an undeclared child but never for a declared language server, whose turn closes at its result (M1-AC11)", async () => {
    const repo = makeRepo(); repos.push(repo);
    const alive = new Map([[process.pid, 1]]), waits: number[] = [];
    const ops: SweepOps = { platform: "linux", startTimeOf: async (pid) => alive.get(pid), endProcess: async (pid) => { alive.delete(pid); },
      commandOf: async (pid) => pid === 701 ? "lsp-server --stdio" : "node child.js",
      // The injected clock: the undeclared child writes a checkout file, then exits, while the guard waits.
      wait: async (ms) => { waits.push(ms); repo.write("README.md", "child\n"); alive.delete(700); } };
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster, processOps: ops, sessionServices: ["lsp-server"],
      channelFactory: (options) => channel(options, (text) => { alive.set(701, 5); if (text === "child") alive.set(700, 6); }, alive) }); offices.push(office);
    const first = await office.send("scout", "edit");
    expect(first.status).toBe("completed");
    expect(waits).toEqual([]);
    expect(alive.has(701)).toBe(true);
    const second = await office.send("scout", "child");
    expect(waits).toEqual([1_000]);
    expect(second.status).toBe("failed");
    expect(second.error?.message).toContain("README.md");
  });

  it("pauses every open channel's output on a full backlog, a channel opened meanwhile too, and resumes them once drained", async () => {
    const repo = makeRepo(); repos.push(repo);
    const calls: string[] = [];
    let opened = 0;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: makeRoster({ scout: { cli: "claude", model: "m", roles: ["review"], write: false }, spy: { cli: "claude", model: "m", roles: ["review"], write: false } }),
      processOps: null, channelFactory: (options) => {
        const name = `c${++opened}`;
        return { ...channel(options, () => {}), pause: () => calls.push(`${name} pause`), resume: () => calls.push(`${name} resume`) };
      } }); offices.push(office);
    await office.open("scout");
    office.backlog(true);
    await office.open("spy");
    office.backlog(false);
    expect(calls).toEqual(["c1 pause", "c2 pause", "c1 resume", "c2 resume"]);
  });
});

describe("M1b-27 worktree lines, two soldiers and M1 restarts (WSP-11, PO-1, M1-AC4, M1-AC11)", () => {
  const two = makeRoster({ scout: { cli: "claude", model: "m", roles: ["review"], write: false }, spy: { cli: "claude", model: "m", roles: ["review"], write: false } });
  /** Fake channels: each turn runs `during` with the channel's options; `channels` keeps every one made, in order. */
  async function fakeOffice(during: (options: ChannelOptions, text: string) => Promise<void> | void = () => {}) {
    const repo = makeRepo(); repos.push(repo);
    const events: OfficeEvent[] = [], channels: ChannelOptions[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: two, processOps: null, restartDelaysMs: [0, 0, 0], onEvent: (event) => events.push(event),
      channelFactory: (options): NativeChannel => {
        channels.push(options);
        return { async send(text) { await during(options, text); return { status: "completed", text, refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {} };
      } }); offices.push(office);
    return { repo, office, events, channels };
  }
  const lines = (events: OfficeEvent[], type: string) => events.filter((event) => event.type === type).map((event) => (event.data as { line: string }).line);

  it("a working tree made inside the folder during a turn, edited and removed after it, passes the turn with one line each (M1-AC11)", async () => {
    const { repo, office, events } = await fakeOffice(async () => {
      await git(repo.dir, ["worktree", "add", "--detach", ".claude/worktrees/fix-1"]);
      await writeFile(join(repo.dir, ".claude/worktrees/fix-1/README.md"), "the owner's edit\n");
    });
    expect((await office.send("scout", "go")).status).toBe("completed");
    expect(lines(events, "worktree")).toEqual([expect.stringMatching(/added at .*\.claude\/worktrees\/fix-1$/)]);
    await git(repo.dir, ["worktree", "remove", "--force", ".claude/worktrees/fix-1"]);
    await office.close();
    expect(lines(events, "worktree")[1]).toMatch(/fix-1 was removed$/);
    expect(events.some((event) => event.type === "harness_git_held")).toBe(false);
  });

  it("one soldier's crash, restart and close leave the other's turn and snapshot running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    const { office, events, channels } = await fakeOffice(async (_options, text) => { if (text === "wait") await gate; });
    await office.open("scout");
    const spy = await office.open("spy");
    const turn = office.send("spy", "wait");
    channels[0]!.onEvent({ type: "closed", data: {} });
    await untilRestart(() => events.some((event) => event.type === "restarted"));
    await office.closeSession("scout");
    release();
    expect((await turn).status).toBe("completed");
    expect(existsSync(spy.cwd)).toBe(true);
    expect(office.army()).toEqual([expect.objectContaining({ key: "scout", state: "closed" }), expect.objectContaining({ key: "spy", state: "idle" })]);
    expect((await office.send("spy", "again")).status).toBe("completed");
  }, 120_000);

  it("a restart reports the old snapshot's writes, opens a fresh one and says the session is new; a close reports them too (M1-AC4)", async () => {
    const { office, events, channels } = await fakeOffice();
    const { cwd } = await office.open("scout");
    await writeFile(join(cwd, "note.txt"), "written after the turn\n");
    channels[0]!.onEvent({ type: "closed", data: {} });
    await untilRestart(() => events.some((event) => event.type === "restarted"));
    const types = events.map((event) => event.type);
    expect(types.indexOf("read_violation")).toBeLessThan(types.indexOf("restarted"));
    expect(lines(events, "read_violation")).toEqual([expect.stringMatching(/read-only snapshot had writes before its restart: note.txt$/)]);
    expect(lines(events, "restarted")[0]).toContain("this is a new session, and its earlier context is gone");
    expect(channels[1]!.cwd).toBe(cwd);
    expect(existsSync(join(cwd, "note.txt"))).toBe(false);
    expect((await office.send("scout", "after")).status).toBe("completed");
    await writeFile(join(cwd, "late.txt"), "x\n");
    await office.closeSession("scout");
    expect(lines(events, "read_violation")[1]).toMatch(/read-only snapshot had writes at its close: late.txt$/);
    expect(existsSync(cwd)).toBe(false);
  }, 120_000);
});

describe("M1b-28 part B: sessions and restarts wait for the trust card (ARM-7, M1-AC13)", () => {
  const config = JSON.stringify({ soldiers: {
    "codex-astra": { cli: "codex", model: "gpt-6-astra" }, "codex-sol": { cli: "codex", model: "gpt-6.1-sol" }, "claude-opus": { cli: "claude", model: "opus", autonomy: "full" },
    "claude-sonnet": { cli: "claude", model: "sonnet" }, grok: { cli: "grok", model: "grok-4.7" }, agy: { cli: "agy", model: "gemini-3.1-pro-high" } } });
  const policy = { "README.md": "hello\n", "shadow.config.json": config, "agent.md": "# Rules\n\n## claude-opus\nBe brief.\n" };
  const homes: string[] = [];
  afterAll(() => homes.forEach((home) => rmSync(home, { recursive: true, force: true })));
  async function trustOffice(files: Record<string, string> = policy, restartDelaysMs: readonly number[] | undefined = [0, 0, 0]) {
    const repo = makeRepo(files); repos.push(repo);
    const home = mkdtempSync(join(tmpdir(), "sa-trust-home-")); homes.push(home);
    const events: OfficeEvent[] = [], channels: ChannelOptions[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, processOps: null, ...(restartDelaysMs ? { restartDelaysMs } : {}), trustHome: home, onEvent: (event) => events.push(event),
      channelFactory: (options): NativeChannel => {
        channels.push(options);
        return { async send(text) { return { status: "completed", text, refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {} };
      } }); offices.push(office);
    return { repo, office, events, channels, home };
  }
  const card = async (use: Promise<unknown>): Promise<TrustRow[]> => {
    const error = await use.then(() => undefined, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(TrustNeeded);
    expect((error as Error).message).toContain(TRUST_WAIT);
    return (error as TrustNeeded).answer.trust.rows;
  };
  const shown = (rows: TrustRow[]) => rows.flatMap((row) => row.kind === "file" ? [row.hash] : []);
  const hash = (text: string) => sha256(Buffer.from(text));
  /** Closes an office with several snapshots inside the test's own time, not the 10 s afterEach hook's. */
  const closeHere = async (office: PostOffice) => { offices.splice(offices.indexOf(office), 1); await office.close(); };
  /** The office's session snapshots; the subfolder goes once its last snapshot does. */
  const sessions = (office: PostOffice) => { const at = snapshotSubfolder(snapshots, office.root); return existsSync(at) ? readdirSync(at, { withFileTypes: true }).filter((entry) => entry.isDirectory()) : []; };

  it("a new repository with full in its config opens nothing and makes no snapshot until accepted, then opens at full", async () => {
    const { office, channels, events, home } = await trustOffice();
    const rows = await card(office.open("claude-opus"));
    expect(rows).toEqual([
      { kind: "file", name: "shadow.config.json", state: "new", hash: hash(config) },
      { kind: "file", name: "agent.md", state: "new", hash: hash(policy["agent.md"]) },
      { kind: "soldier", name: shadowName("claude-opus"), cli: "claude", model: "opus", autonomy: "full" }]);
    await card(office.send("claude-opus", "hi"));
    expect(channels).toEqual([]);
    expect(sessions(office)).toEqual([]);
    await expect(office.trust(["0".repeat(64)])).rejects.toThrow("nothing was accepted");
    expect(existsSync(join(home, ".shadow-army", "trust"))).toBe(false);
    expect(await office.trust(shown(rows))).toEqual({ ok: true });
    expect(readdirSync(join(home, ".shadow-army", "trust"))).toHaveLength(1);
    await office.open("claude-opus");
    expect(channels.map((one) => one.autonomy)).toEqual(["full"]);
    expect(events.filter((event) => event.type === "trust_card")).toHaveLength(2);
  }, 60_000);

  it("a file changed between the card and the answer is not accepted, and the card shows again with its new hash", async () => {
    const { repo, office, channels } = await trustOffice();
    const first = await card(office.open("claude-opus"));
    repo.write("agent.md", `${policy["agent.md"]}!`);
    await office.trust(shown(first));
    const second = await card(office.open("claude-opus"));
    expect(second).toEqual([{ kind: "file", name: "agent.md", state: "changed", hash: hash(`${policy["agent.md"]}!`) }]);
    expect(channels).toEqual([]);
    await office.trust(shown(second));
    await office.open("claude-opus");
    expect(channels).toHaveLength(1);
  }, 60_000);

  it("shows .mcp.json's servers, and a committed copy that differs from the accepted folder one gets the soldier's card before its session", async () => {
    const committed = JSON.stringify({ mcpServers: { tools: { command: "node", args: ["tools.js"] } } });
    const folderCopy = JSON.stringify({ mcpServers: { docs: { url: "https://docs.example/mcp" } } });
    const { repo, office, channels } = await trustOffice({ "README.md": "hello\n", ".mcp.json": committed });
    repo.write(".mcp.json", folderCopy);
    const folder = await card(office.open("claude-opus"));
    expect(folder).toEqual([{ kind: "file", name: ".mcp.json", state: "new", hash: hash(folderCopy) }, { kind: "server", file: ".mcp.json", name: "docs", target: "https://docs.example/mcp" }]);
    await office.trust(shown(folder));
    const snapshot = await card(office.open("claude-opus"));
    expect(snapshot).toEqual([{ kind: "file", name: ".mcp.json", state: "changed", hash: hash(committed), soldier: shadowName("claude-opus") },
      { kind: "server", file: ".mcp.json", name: "tools", target: "node tools.js" }]);
    expect(channels).toEqual([]);
    expect(sessions(office)).toEqual([]);
    await office.trust(shown(snapshot));
    await office.open("claude-opus");
    expect(channels).toHaveLength(1);
  }, 60_000);

  it("a crash restart while a file is untrusted waits for the card, while another soldier's open session runs on", async () => {
    const { repo, office, channels, events } = await trustOffice();
    await office.trust(shown(await card(office.open("claude-opus"))));
    await office.open("claude-opus");
    await office.open("claude-sonnet");
    repo.write("agent.md", "# Rules\n");
    channels[0]!.onEvent({ type: "closed", data: {} });
    await untilRestart(() => events.some((event) => event.type === "trust_wait"));
    expect((events.find((event) => event.type === "trust_wait")!.data as { line: string }).line).toContain(TRUST_WAIT);
    expect((await office.send("claude-sonnet", "still here")).status).toBe("completed");
    const rows = await card(office.send("claude-opus", "hi"));
    expect(rows).toEqual([{ kind: "file", name: "agent.md", state: "changed", hash: hash("# Rules\n") }]);
    expect(channels).toHaveLength(2);
    expect(events.some((event) => event.type === "restarted")).toBe(false);
    await office.trust(shown(rows));
    await untilRestart(() => events.some((event) => event.type === "restarted"));
    expect(channels.map((one) => one.model)).toEqual(["opus", "sonnet", "opus"]);
    expect((await office.send("claude-opus", "back")).status).toBe("completed");
    await closeHere(office);
  }, 120_000);

  it("on the fake clock, a crash restart with an untrusted file waits its 1 s, then schedules nothing more until the card is accepted", async () => {
    const { repo, office, channels, events } = await trustOffice(policy, undefined);
    await office.trust(shown(await card(office.open("claude-opus"))));
    await office.open("claude-opus");
    repo.write("agent.md", "# Rules\n");
    const tick = () => new Promise<void>((done) => setImmediate(done));
    try {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      channels[0]!.onEvent({ type: "closed", data: {} });
      for (let i = 0; vi.getTimerCount() === 0; i++) { if (i > 10_000) throw new Error("the restart wait was never set"); await tick(); }
      // PO-1: the first restart waits 1 s; nothing is checked or started before it ends.
      await vi.advanceTimersByTimeAsync(999);
      expect(events.some((event) => event.type === "trust_wait" || event.type === "restarted")).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      vi.useRealTimers();
      await untilRestart(() => events.some((event) => event.type === "trust_wait"));
      // ARM-7: ten minutes on, the restart has scheduled nothing and started nothing.
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
    expect(channels).toHaveLength(1);
    expect(events.some((event) => event.type === "restarted" || event.type === "down")).toBe(false);
    await office.trust(shown(await card(office.send("claude-opus", "hi"))));
    await untilRestart(() => events.some((event) => event.type === "restarted"));
    expect(channels).toHaveLength(2);
    await closeHere(office);
  }, 120_000);
});
