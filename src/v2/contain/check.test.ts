import { spawn } from "node:child_process";
import { PassThrough, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkContainment, createContainmentGate, type CheckOptions, type ChecksumsOutcome, type Clock, type StepContext, type StepOutcome, type SystemSteps } from "./check.js";
import type { ManagedProcess } from "./index.js";
import { failureMessage, type Failure, type Where } from "./messages.js";

/*
 * AC17/AC18 mapping (V8). These tests drive PO-14's check through its seams: injected per-system steps, a fake
 * clock and a fake probe whose pipe ends, fails or closes on cue. Covered here: the four steps in order, each
 * failure cause and its message, the 10 s counted deadline and PO-7's sleep rule, the probe's end-of-file proof
 * (natural EOF only), launch ownership at the deadline, bounded cleanup, the pass log's containment and digests,
 * and the rerun rule. The last test runs the real native/probe.mjs. Not covered here (pending): the per-system
 * steps (M1b-15, M1b-16, M1b-19), the drivers' no-grace tree kill, wiring the gate into the post office's start,
 * the packaged probe, and native evidence on Linux, macOS and real Windows policy cases.
 */
const ok: StepOutcome = { ok: true };
const flush = () => new Promise<void>((done) => setImmediate(done));
const digest = { file: "guardian", sha256: "ab".repeat(32) };

type PipeAtKill = "eof" | "leak" | "error" | "close";
/** A contained probe that reports both pids; at `close()` its `stdout` ends (or leaks, fails, closes without end). */
function fakeProbe(atKill: PipeAtKill = "eof", over: { closeHangs?: boolean; launch?: Promise<void> } = {}) {
  let closes = 0;
  let stdout!: PassThrough;
  return {
    closed: () => closes,
    stdout: () => stdout,
    spawn: (async () => {
      await over.launch;
      stdout = new PassThrough();
      stdout.write('{"role":"probe","pid":10}\n{"role":"grandchild","pid":12}\n');
      const pipe = stdout;
      let first = true;
      return {
        pid: 10, stdin: new Writable(), stdout, stderr: new PassThrough(), exited: new Promise(() => {}),
        close: async () => {
          closes++;
          if (first && atKill === "eof") pipe.end();
          if (first && atKill === "error") pipe.destroy(new Error("EPIPE"));
          if (first && atKill === "close") pipe.destroy();
          first = false;
          if (over.closeHangs) await new Promise(() => {});
        },
      } as unknown as ManagedProcess;
    }) satisfies CheckOptions["spawn"],
  };
}

class FakeClock implements Clock {
  time = 0;
  private fns = new Set<() => void>();
  now() { return this.time; }
  every(_ms: number, fn: () => void) { this.fns.add(fn); return () => { this.fns.delete(fn); }; }
  /** Whole seconds, with a tick after each. */
  async advance(ms: number) { for (let i = 0; i < ms / 1000; i++) { this.time += 1000; this.fns.forEach((fn) => fn()); await flush(); } }
  /** The computer slept: time passes with no tick, then one tick sees it all. */
  async sleep(ms: number) { this.time += ms; this.fns.forEach((fn) => fn()); await flush(); }
}

const steps = (over: Partial<SystemSteps> = {}): SystemSteps => ({
  helper: async () => ok, checksums: async () => ({ ok: true, files: [digest] }), mode: async () => ok,
  listTree: async () => ({ pids: [10, 12], containment: "job \\Sessions\\1\\sa-7", newCoalition: true }), ...over,
});

const base = (over: Partial<CheckOptions> = {}, system: SystemSteps = steps()): CheckOptions => ({
  platform: "win32", arch: "x64", osVersion: "10.0.26200", shadowArmy: "2.0.1", clock: new FakeClock(), spawn: fakeProbe().spawn,
  systems: { "win32-x64": system, "darwin-arm64": system, "linux-x64": system }, ...over,
});

describe("PO-14 check", () => {
  it("passes when every step does, and logs one line naming the containment and each file's SHA-256 (AC18)", async () => {
    const lines: string[] = [];
    const result = await checkContainment(base({ log: (line) => lines.push(line) }));
    expect(result).toMatchObject({ ok: true, containment: "job \\Sessions\\1\\sa-7", files: [digest] });
    expect(lines).toEqual([expect.stringMatching(/^Containment check passed on Windows 10\.0\.26200 \(x64\) in [\d.]+ s: helper, checksums \(guardian SHA-256 (ab){32}\), mode, probe \(in job \\Sessions\\1\\sa-7\)\.$/)]);
  });

  it("fails a checksums pass that names no file, and a listing that names no containment (AC18)", async () => {
    const none = await checkContainment(base({}, steps({ checksums: async () => ({ ok: true, files: [] }) })));
    expect(none).toMatchObject({ ok: false, step: "checksums", failure: { detail: "the checksums step checked no file" } });
    const unnamed = await checkContainment(base({}, steps({ listTree: async () => ({ pids: [10, 12], containment: "" }) })));
    expect(unnamed).toMatchObject({ ok: false, step: "probe", failure: { detail: "the listing did not name the containment" } });
  });

  it("fails with 'outlived' when the probe's pipe stays open after the kill, and kills what it started", async () => {
    const clock = new FakeClock();
    const probe = fakeProbe("leak");
    const pending = checkContainment(base({ clock, spawn: probe.spawn }));
    await flush();
    await clock.advance(3000);
    const result = await pending;
    expect(result).toMatchObject({ ok: false, step: "probe", failure: { cause: "outlived" } });
    expect(!result.ok && result.message).toMatch(/a test process outlived its containment/);
    await flush();
    expect(probe.closed()).toBe(2);
  });

  it.each<[PipeAtKill, string]>([
    ["error", "the test process's pipe failed (EPIPE)"],
    ["close", "the test process's pipe closed without reaching its end"],
  ])("takes only end of file as the proof: a pipe that ends by %s fails (C1)", async (atKill, detail) => {
    const result = await checkContainment(base({ spawn: fakeProbe(atKill).spawn }));
    expect(result).toMatchObject({ ok: false, step: "probe", failure: { cause: "helper-failed", detail } });
  });

  it("fails when the pipe ended before the kill: that end proves nothing (C1)", async () => {
    const probe = fakeProbe();
    const result = await checkContainment(base({ spawn: probe.spawn }, steps({
      listTree: async () => { probe.stdout().end(); await flush(); return { pids: [10, 12], containment: "job" }; },
    })));
    expect(result).toMatchObject({ ok: false, step: "probe", failure: { detail: "the test process's pipe ended before it was killed" } });
  });

  it("kills the probe with killTree and times the pipe's end from the kill, not from a close that waits (C4)", async () => {
    const probe = fakeProbe("eof", { closeHangs: true });
    let kills = 0;
    const result = await checkContainment(base({ spawn: probe.spawn, killTree: () => { kills++; probe.stdout().end(); } }));
    expect(result.ok).toBe(true);
    expect([kills, probe.closed()]).toEqual([1, 0]);
    const byDefault = await checkContainment(base({ spawn: fakeProbe("eof", { closeHangs: true }).spawn }));
    expect(byDefault.ok).toBe(true);
  });

  it("closes a probe whose launch completes after the deadline, and gives the launch the abort signal (C2)", async () => {
    const clock = new FakeClock();
    let launched!: () => void;
    const probe = fakeProbe("eof", { launch: new Promise<void>((done) => { launched = done; }) });
    let signal: AbortSignal | undefined;
    const pending = checkContainment(base({ clock, spawn: (o, s) => { signal = s; return probe.spawn(o, s); } }));
    await flush();
    await clock.advance(10_000);
    expect(await pending).toMatchObject({ ok: false, step: "probe", failure: { cause: "timeout" } });
    expect(signal?.aborted).toBe(true);
    expect(probe.closed()).toBe(0);
    launched();
    await flush();
    expect(probe.closed()).toBe(1);
  });

  it("fails when the listing misses the grandchild, or on macOS the coalition is not new", async () => {
    const missing = await checkContainment(base({}, steps({ listTree: async () => ({ pids: [10], containment: "job", newCoalition: true }) })));
    expect(!missing.ok && missing.message).toMatch(/did not show the test process and its grandchild/);
    const shared = await checkContainment(base({ platform: "darwin", arch: "arm64", dispatch: () => ok }, steps({ listTree: async () => ({ pids: [10, 12], containment: "coalition 9" }) })));
    expect(!shared.ok && shared.message).toMatch(/not in a new coalition/);
  });

  it("gives a system or processor with no helper PO-14's message, and keeps running (AC17)", async () => {
    const result = await checkContainment(base({ platform: "linux", arch: "riscv64" }));
    expect(result).toMatchObject({ ok: false, step: "helper", failure: { cause: "no-helper" } });
    expect(!result.ok && result.message).toContain("No containment helper for linux-riscv64, so no soldier can start. Supported: Linux x64 and arm64, macOS, Windows x64 and arm64.");
  });

  it("still decides with the macOS version newer than any CI tested, and logs that it is untested (AC17)", async () => {
    const lines: string[] = [];
    const result = await checkContainment(base({
      platform: "darwin", arch: "arm64", osVersion: "99.1", testedMacOS: { oldest: "14.0", newest: "27.1" }, log: (line) => lines.push(line), dispatch: () => ok,
    }));
    expect(result.ok).toBe(true);
    expect(lines[0]).toBe("macOS 99.1 is untested by this Shadow Army; the containment check still decides.");
  });

  it("fails closed for a system whose per-system steps are not built yet", async () => {
    const result = await checkContainment(base({ systems: {} }));
    expect(result).toMatchObject({ ok: false, step: "helper", failure: { cause: "not-built", step: "helper" } });
  });

  it.each<[string, Partial<SystemSteps>, string, RegExp]>([
    ["a helper that can't be run", { helper: async () => ({ ok: false, failure: { cause: "cannot-run", detail: "EACCES" } }) }, "helper", /can't be run: EACCES/],
    ["a file with a byte changed", { checksums: async () => ({ ok: false, failure: { cause: "changed", file: "guardian" } }) }, "checksums", /doesn't match Shadow Army 2\.0\.1/],
    ["a mode step that fails", { mode: async () => ({ ok: false, failure: { cause: "helper-failed", detail: "the subreaper mark did not read back" } }) }, "mode", /subreaper mark did not read back/],
    ["a step that throws", { mode: async () => { throw new Error("boom"); } }, "mode", /the mode step failed: boom/],
  ])("fails on %s, naming the step and the cause", async (_name, over, step, message) => {
    const result = await checkContainment(base({}, steps(over)));
    expect(result).toMatchObject({ ok: false, step });
    expect(!result.ok && result.message).toMatch(message);
    expect(!result.ok && result.message).toContain("Windows 10.0.26200, x64, Shadow Army 2.0.1");
  });

  it("fails 10 s after it began when a step hangs: names the step and kills what it started", async () => {
    const clock = new FakeClock();
    let killed = 0;
    const hang = (ctx: StepContext) => { ctx.killOnFail(() => { killed++; }); return new Promise<StepOutcome>(() => {}); };
    const pending = checkContainment(base({ clock }, steps({ mode: hang })));
    await flush();
    await clock.advance(9000);
    await Promise.race([pending, flush()]);
    expect(killed).toBe(0);
    await clock.advance(1000);
    const result = await pending;
    expect(result).toMatchObject({ ok: false, step: "mode", failure: { cause: "timeout", step: "mode" } });
    expect(!result.ok && result.message).toContain("did not finish in 10 seconds; it was still in the mode step");
    expect(killed).toBe(1);
  });

  it("returns a failure without waiting on a cleanup that hangs, logs a cleanup that fails, and bounds the rest (C3)", async () => {
    const clock = new FakeClock();
    const lines: string[] = [];
    const hang = (ctx: StepContext) => {
      ctx.killOnFail(() => new Promise<void>(() => {}));
      ctx.killOnFail(() => Promise.reject(new Error("access denied")));
      return new Promise<StepOutcome>(() => {});
    };
    const pending = checkContainment(base({ clock, log: (line) => lines.push(line) }, steps({ mode: hang })));
    await flush();
    await clock.advance(10_000);
    expect(await pending).toMatchObject({ ok: false, failure: { cause: "timeout", step: "mode" } });
    expect(lines).toContain("Cleanup after the containment check failed: access denied");
    await clock.advance(5000);
    expect(lines).toContain("Cleanup after the containment check did not finish within 5 s.");
  });

  it("counts at most 5 s of a step the computer slept through, and logs it (PO-7)", async () => {
    const clock = new FakeClock();
    const lines: string[] = [];
    let release!: () => void;
    const slow = () => new Promise<ChecksumsOutcome>((done) => { release = () => done({ ok: true, files: [digest] }); });
    const pending = checkContainment(base({ clock, log: (line) => lines.push(line) }, steps({ checksums: slow })));
    await flush();
    await clock.sleep(3_600_000);
    expect(lines).toEqual(["The post office did not run for 3600 s during the containment check; 5 s of it count."]);
    release();
    expect((await pending).ok).toBe(true);
  });
});

describe("rerun at reconnect (PO-14, PO-15)", () => {
  it("checks at start, keeps a pass, and checks again only after a failed containment", async () => {
    let runs = 0;
    const gate = createContainmentGate(base({}, steps({ helper: async () => { runs++; return ok; } })));
    expect((await gate.start()).ok).toBe(true);
    await gate.ready();
    expect(runs).toBe(1);
    gate.containmentFailed();
    await gate.ready();
    expect(runs).toBe(2);
  });

  it("checks again before every start while the last check failed, and shares a check already running", async () => {
    let runs = 0;
    const gate = createContainmentGate(base({}, steps({ helper: async () => { runs++; return { ok: false, failure: { cause: "cannot-run" } }; } })));
    expect((await gate.start()).ok).toBe(false);
    await Promise.all([gate.ready(), gate.ready()]);
    expect(runs).toBe(2);
    await gate.ready();
    expect(runs).toBe(3);
  });

  it("does not keep a pass from a check that began before a reported failure (C6)", async () => {
    let runs = 0;
    let release!: () => void;
    const gate = createContainmentGate(base({}, steps({
      helper: async () => { runs++; if (runs === 1) await new Promise<void>((done) => { release = done; }); return ok; },
    })));
    const early = gate.start();
    await flush();
    gate.containmentFailed();
    const later = gate.ready();
    release();
    expect((await early).ok).toBe(true);
    expect((await later).ok).toBe(true);
    expect(runs).toBe(2);
    await gate.ready();
    expect(runs).toBe(2);
  });
});

describe("PO-14 messages per cause (AC18)", () => {
  const where: Where = { platform: "win32", system: "Windows", version: "11", arch: "x64", shadowArmy: "2.0.1" };
  const sac = (state: 0 | 1 | 2 | undefined): Failure[] => [
    { cause: "constrained-language", smartAppControl: state },
    { cause: "dll-load", code: "0x800711C7", smartAppControl: state },
    { cause: "cannot-run", smartAppControl: state },
  ];

  it.each(sac(1))("names Smart App Control when its value is 1: %j", (failure) => {
    expect(failureMessage(failure, where)).toContain("Smart App Control blocked Shadow Army's Windows script or its DLL");
  });

  it.each([0, 2, undefined] as const)("does not name it when its value is %s", (state) => {
    for (const failure of sac(state)) expect(failureMessage(failure, where)).not.toContain("Smart App Control");
  });

  it("says turning it off can't be undone only on a build where that is so", () => {
    const failure: Failure = { cause: "dll-load", smartAppControl: 1 };
    expect(failureMessage(failure, { ...where, smartAppControlCanBeUndone: false })).toContain("can't be undone without resetting Windows");
    expect(failureMessage(failure, { ...where, smartAppControlCanBeUndone: true })).not.toContain("can't be undone");
  });

  it("gives each other cause its own message, naming the system, processor and Shadow Army's version", () => {
    const causes: Failure[] = [
      { cause: "no-helper" }, { cause: "cannot-run" }, { cause: "changed" }, { cause: "constrained-language" }, { cause: "dll-load" },
      { cause: "execution-policy", policy: "AllSigned" }, { cause: "helper-failed", detail: "x" }, { cause: "outlived" },
      { cause: "timeout", step: "mode" }, { cause: "not-built", step: "mode" },
    ];
    const messages = causes.map((failure) => failureMessage(failure, where));
    expect(new Set(messages).size).toBe(causes.length);
    for (const message of messages) expect(message).toContain("(Windows 11, x64, Shadow Army 2.0.1)");
    expect(failureMessage({ cause: "execution-policy", policy: "Restricted" }, where)).toContain("Restricted execution policy");
  });
});

describe("native/probe.mjs", () => {
  it("reports itself and a grandchild, and its pipe ends once both are gone", async () => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../../native/probe.mjs", import.meta.url))], { stdio: ["ignore", "pipe", "ignore"] });
    const pids = new Set<number>([child.pid!]);
    let text = "";
    const ended = new Promise<void>((done) => child.stdout.on("end", () => done()));
    const both = new Promise<void>((done) => child.stdout.on("data", (chunk: Buffer) => {
      text += chunk.toString();
      for (const line of text.split("\n").filter(Boolean)) pids.add((JSON.parse(line) as { pid: number }).pid);
      if (pids.size === 2) done();
    }));
    try {
      await both;
      expect(text.trim().split("\n").map((line) => (JSON.parse(line) as { role: string }).role).sort()).toEqual(["grandchild", "probe"]);
    } finally {
      for (const pid of pids) try { process.kill(pid); } catch { /* already gone */ }
    }
    await ended;
  });
});
