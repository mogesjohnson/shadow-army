import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { makeRoster } from "../core/roster.testutil.js";
import type { ChannelOptions, NativeChannel, TurnResult } from "./channel.js";
import { PostOffice, type OfficeEvent } from "./postOffice.js";
import { credential, until } from "./fixture-main.testutil.js";
import { Locks } from "../workspace/locks.js";

// C4: a hook that runs right after an apply, before the office reads the folder again.
const hooks = vi.hoisted(() => ({ afterApply: undefined as undefined | (() => void) }));
vi.mock("./apply.js", async (load) => {
  const real = await load<typeof import("./apply.js")>();
  return { applyAudited: async (...args: Parameters<typeof real.applyAudited>) => { const out = await real.applyAudited(...args); hooks.afterApply?.(); return out; } };
});

const offices: PostOffice[] = [];
const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  hooks.afterApply = undefined;
  await Promise.all(offices.splice(0).map((office) => office.close().catch(() => {})));
  repos.splice(0).forEach((repo) => repo.cleanup());
});

const roster = makeRoster({
  tank: { cli: "claude", model: "synthetic", roles: ["build"], write: true },
  medic: { cli: "claude", model: "synthetic", roles: ["build"], write: true },
});
type Step = (cwd: string) => Promise<TurnResult["status"]>;
const put = async (dir: string, name: string, body: string) => { await mkdir(dirname(join(dir, name)), { recursive: true }); await writeFile(join(dir, name), body); };

/** Each soldier's channel runs its next scripted step per turn (the w12 probes' shape). */
async function office(steps: Record<string, Step[]>) {
  const repo = makeRepo({ "README.md": "hello\n", "src/a.ts": "a\n", "src/b.ts": "b\n" }); repos.push(repo);
  const o = await PostOffice.create({ cwd: repo.dir, credential, roster, channelFactory: (options: ChannelOptions): NativeChannel => {
    const key = options.cwd.includes("medic") ? "medic" : "tank";
    return { async send() { return { status: await steps[key]!.shift()!(options.cwd), text: "done", refusal: false }; },
      async interrupt() {}, async respondApproval() {}, async close() {} };
  } }); offices.push(o);
  return { repo, office: o };
}

describe("post office fixes from the M1a pre-review", () => {
  it("W12-1: a cut-short turn's partial edit never reaches the owner's folder through a later turn", async () => {
    const { repo, office: o } = await office({ tank: [
      async (cwd) => { await put(cwd, "src/a.ts", "PARTIAL\n"); return "interrupted"; },
      async (cwd) => { await put(cwd, "src/b.ts", "turn 2\n"); return "completed"; },
    ] });
    const first = await o.send("tank", "one", { claims: ["src/**"] });
    expect(first.write?.applicable).toBe(false);
    expect(first.write?.reason).toContain("reconnect");
    await expect(o.send("tank", "two", { claims: ["src/**"] })).rejects.toThrow("reconnect explicitly");
    await o.open("tank", { claims: ["src/**"] });
    const second = await o.send("tank", "two", { claims: ["src/**"] });
    expect(second.write?.apply).toEqual({ applied: true, files: [{ change: "M", path: "src/b.ts" }] });
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("a\n");
  }, 30_000);

  it("W12-2/C2: a lease lost between turns sends and applies nothing, and the session needs a fresh open", async () => {
    // v1 Locks keeps the Date.now it was made with, so time is faked before the office exists.
    vi.useFakeTimers({ toFake: ["Date"] });
    const steps: Record<string, Step[]> = { tank: [
      async (cwd) => { await put(cwd, "src/a.ts", "t1\n"); return "completed"; },
      async (cwd) => { await put(cwd, "src/b.ts", "t2\n"); return "completed"; },
    ] };
    const { repo, office: o } = await office(steps);
    await o.send("tank", "one", { claims: ["src/**"] });
    vi.setSystemTime(Date.now() + 61 * 60_000);
    await o.open("medic", { claims: ["src/b.ts"] });
    // #90's send fails closed: it refuses before the brief goes out and takes the session down.
    await expect(o.send("tank", "two", { claims: ["src/**"] })).rejects.toThrow("claims lease was lost");
    expect(steps.tank).toHaveLength(1);
    await expect(o.send("tank", "three")).rejects.toThrow("reconnect explicitly");
    expect(await readFile(join(repo.dir, "src/b.ts"), "utf8")).toBe("b\n");
  }, 30_000);

  it("W12-2: every turn renews the lease, so overlapping claims stay refused while the session is used", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { office: o } = await office({ tank: [async () => "completed", async () => "completed"] });
    await o.send("tank", "one", { claims: ["src/**"] });
    vi.setSystemTime(Date.now() + 50 * 60_000);
    expect((await o.send("tank", "two")).write?.leaseLost).toBe(false);
    vi.setSystemTime(Date.now() + 50 * 60_000);
    await expect(o.open("medic", { claims: ["src/b.ts"] })).rejects.toThrow(/tank/);
  }, 30_000);

  it("W12-3: one soldier's apply does not fail another soldier's running turn", async () => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void; const medicStarted = new Promise<void>((resolve) => { started = resolve; });
    const { repo, office: o } = await office({
      tank: [async (cwd) => { await medicStarted; await put(cwd, "src/a.ts", "tank\n"); return "completed"; }],
      medic: [async (cwd) => { started(); await put(cwd, "src/b.ts", "medic\n"); await gate; return "completed"; }],
    });
    await o.open("tank", { claims: ["src/a.ts"] }); await o.open("medic", { claims: ["src/b.ts"] });
    const medic = o.send("medic", "b");
    expect((await o.send("tank", "a")).write?.apply?.applied).toBe(true);
    release();
    const m = await medic;
    expect(m.status).toBe("completed");
    expect(m.write?.apply?.applied).toBe(true);
    expect(await readFile(join(repo.dir, "src/b.ts"), "utf8")).toBe("medic\n");
  }, 30_000);

  it("W12-3: an owner's change during the turn to a path another soldier just applied still fails the guard", async () => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void; const medicStarted = new Promise<void>((resolve) => { started = resolve; });
    const { repo, office: o } = await office({
      tank: [async (cwd) => { await medicStarted; await put(cwd, "src/a.ts", "tank\n"); return "completed"; }],
      medic: [async () => { started(); await gate; return "completed"; }],
    });
    await o.open("tank", { claims: ["src/a.ts"] }); await o.open("medic", { claims: ["src/b.ts"] });
    const medic = o.send("medic", "b");
    await o.send("tank", "a");
    repo.write("src/a.ts", "owner\n");
    release();
    expect((await medic).error?.message).toContain("src/a.ts");
  }, 30_000);

  it("C4: an owner's edit between another soldier's apply and the office's next read still fails the guard", async () => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void; const medicStarted = new Promise<void>((resolve) => { started = resolve; });
    const { repo, office: o } = await office({
      tank: [async (cwd) => { await medicStarted; await put(cwd, "src/a.ts", "tank\n"); return "completed"; }],
      medic: [async () => { started(); await gate; return "completed"; }],
    });
    await o.open("tank", { claims: ["src/a.ts"] }); await o.open("medic", { claims: ["src/b.ts"] });
    const medic = o.send("medic", "b");
    hooks.afterApply = () => { hooks.afterApply = undefined; repo.write("src/a.ts", "owner\n"); };
    await o.send("tank", "a");
    release();
    expect((await medic).error?.message).toContain("src/a.ts");
  }, 30_000);

  it("C1: a moved tip whose apply was refused takes the session down, so a later no-op cannot carry it in", async () => {
    const { repo, office: o } = await office({ tank: [
      async (cwd) => { await put(cwd, "src/a.ts", "soldier\n"); return "completed"; },
      async () => "completed",
    ] });
    repo.write("src/a.ts", "owner\n");
    const first = await o.send("tank", "one", { claims: ["src/**"] });
    expect(first.write?.apply?.applied).toBe(false);
    expect(first.write?.reason).toContain("reconnect");
    repo.write("src/a.ts", "a\n");
    await expect(o.send("tank", "two")).rejects.toThrow("reconnect explicitly");
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("a\n");
  }, 30_000);

  it("C3: a writing session is used only once its lease and channel are set up, and a failed setup frees its claims", async () => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const list = Locks.prototype.list;
    vi.spyOn(Locks.prototype, "list").mockImplementationOnce(async function (this: Locks) { await gate; return list.call(this); })
      .mockImplementationOnce(async () => { throw new Error("lease read failed"); });
    const { office: o } = await office({ tank: [async () => "completed"] });
    const opened = o.open("tank", { claims: ["src/**"] });
    const sent = o.send("tank", "x", { claims: ["src/**"] });
    await Promise.race([sent, new Promise((resolve) => setTimeout(resolve, 2_000))]); // the send must wait for the opening
    release();
    await opened;
    expect((await sent).status).toBe("completed");
    await o.closeSession("tank");
    await expect(o.open("medic", { claims: ["src/a.ts"] })).rejects.toThrow("lease read failed");
    await o.open("tank", { claims: ["src/a.ts"] });
  }, 30_000);

  it("#99 C8: a channel factory that throws frees the claims and the heartbeat, so the same claims open again", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const repo = makeRepo({ "README.md": "hello\n", "src/a.ts": "a\n" }); repos.push(repo);
    let fail = true;
    const o = await PostOffice.create({ cwd: repo.dir, credential, roster, channelFactory: (): NativeChannel => {
      if (fail) throw new Error("factory failed");
      return { async send() { return { status: "completed", text: "done", refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {} };
    } }); offices.push(o);
    await expect(o.open("tank", { claims: ["src/**"] })).rejects.toThrow("factory failed");
    expect(vi.getTimerCount()).toBe(0);
    expect(JSON.parse(JSON.stringify(o.army())).find((s: { key: string }) => s.key === "tank").state).toBe("closed");
    fail = false;
    await o.open("medic", { claims: ["src/**"] });
  }, 30_000);

  it("#93 C7: an open that overlaps a pending open with other claims is refused; matching claims share the session", async () => {
    const { office: o } = await office({ tank: [] });
    const [first, other, same] = await Promise.allSettled([o.open("tank", { claims: ["src/a.ts"] }), o.open("tank", { claims: ["src/**"] }), o.open("tank", { claims: ["src/a.ts"] })]);
    expect(first.status).toBe("fulfilled");
    expect(String((other as PromiseRejectedResult).reason)).toContain("holds claims src/a.ts");
    expect((same as PromiseFulfilledResult<{ session: string }>).value.session).toBe((first as PromiseFulfilledResult<{ session: string }>).value.session);
  }, 30_000);

  it("#90 C7: two matching sends at once run one turn; the other is refused before any brief", async () => {
    const steps: Record<string, Step[]> = { tank: [async (cwd) => { await put(cwd, "src/a.ts", "one\n"); return "completed"; }, async () => "completed"] };
    const { office: o } = await office(steps);
    await o.open("tank", { claims: ["src/**"] });
    const [a, b] = await Promise.allSettled([o.send("tank", "one", { claims: ["src/**"] }), o.send("tank", "two", { claims: ["src/**"] })]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");
    expect(String((b as PromiseRejectedResult).reason)).toContain("already has a running turn");
    expect(steps.tank).toHaveLength(1);
  }, 30_000);

  it("C6: the heartbeat renews the lease while the session is idle and stops when it closes", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const renewals: Promise<boolean>[] = [];
    const renew = Locks.prototype.renew;
    vi.spyOn(Locks.prototype, "renew").mockImplementation(function (this: Locks, ...args: Parameters<Locks["renew"]>) { const p = renew.apply(this, args); renewals.push(p); return p; });
    const { office: o } = await office({ tank: [async () => "completed"] });
    await o.send("tank", "one", { claims: ["src/**"] }); // the turn's audit stops v1's own heartbeat
    for (let i = 0; i < 4; i++) { await vi.advanceTimersByTimeAsync(20 * 60_000); await Promise.all(renewals); }
    await expect(o.open("medic", { claims: ["src/b.ts"] })).rejects.toThrow(/tank/);
    await o.closeSession("tank");
    const count = renewals.length;
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(renewals).toHaveLength(count);
  }, 30_000);
});

describe("W11-3: crash restarts (PO-1)", () => {
  async function crashing(delays: number[]) {
    const repo = makeRepo(); repos.push(repo);
    const channels: ChannelOptions[] = [];
    const events: (OfficeEvent & { at: number })[] = [];
    const o = await PostOffice.create({ cwd: repo.dir, credential, roster: makeRoster({ scout: { cli: "claude", model: "synthetic", roles: ["review"], write: false } }),
      restartDelaysMs: delays, onEvent: (event) => events.push({ ...event, at: performance.now() }), channelFactory: (options): NativeChannel => {
        channels.push(options);
        return { async send(text) { return { status: "completed", text, refusal: false }; }, async interrupt() {}, async respondApproval() {}, async close() {} };
      } }); offices.push(o);
    await o.open("scout");
    return { o, channels, events };
  }

  it("waits the given delay before each restart", async () => {
    const { channels, events } = await crashing([150, 300, 450]);
    for (let i = 0; i < 2; i++) {
      const at = performance.now();
      channels[i]!.onEvent({ type: "closed", data: {} });
      await until(() => channels.length === i + 2);
      expect(performance.now() - at).toBeGreaterThanOrEqual([150, 300][i]! - 5);
    }
    expect(events.filter((event) => event.type === "restarted")).toHaveLength(2);
  }, 30_000);

  it("resets the count after 10 minutes without a crash", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { o, channels, events } = await crashing([0, 0, 0]);
    for (let i = 0; i < 3; i++) { channels[i]!.onEvent({ type: "closed", data: {} }); await until(() => channels.length === i + 2); }
    vi.setSystemTime(Date.now() + 11 * 60_000);
    channels[3]!.onEvent({ type: "closed", data: {} });
    await until(() => channels.length === 5);
    expect(events.some((event) => event.type === "down")).toBe(false);
    expect(o.army()).toEqual([expect.objectContaining({ state: "idle", restarts: 1 })]);
  }, 30_000);

  it("C5: counts only crashes within 10 minutes of each other: spaced crashes restart, four close ones take it down", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { channels, events } = await crashing([0, 0, 0]);
    for (let i = 0; i < 4; i++) { // minutes 0, 4, 8 and 12
      if (i) vi.setSystemTime(Date.now() + 4 * 60_000);
      channels[i]!.onEvent({ type: "closed", data: {} }); await until(() => channels.length === i + 2);
    }
    expect(events.some((event) => event.type === "down")).toBe(false);
    vi.setSystemTime(Date.now() + 60_000);
    channels[4]!.onEvent({ type: "closed", data: {} }); // minute 13: four crashes since minute 4
    await until(() => events.some((event) => event.type === "down"));
  }, 30_000);

  it("never restarts after a login needed", async () => {
    const { o, channels, events } = await crashing([0, 0, 0]);
    channels[0]!.onEvent({ type: "error", data: { kind: "login_needed", message: "Please run /login" } });
    channels[0]!.onEvent({ type: "closed", data: {} });
    await until(() => events.some((event) => event.type === "down"));
    expect(channels).toHaveLength(1);
    expect(JSON.stringify(events.find((event) => event.type === "down")!.data)).toContain("log in");
    await expect(o.send("scout", "x")).rejects.toThrow("reconnect explicitly");
  }, 30_000);
});
