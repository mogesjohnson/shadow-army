import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { failureMessage, type Failure, type Where } from "./messages.js";

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
    const roles: string[] = [];
    let text = "";
    let seen = 0;
    const ended = new Promise<void>((done) => child.stdout.on("end", () => done()));
    const both = new Promise<void>((done, fail) => {
      const timer = setTimeout(() => fail(new Error("the probe did not report itself and a grandchild in time")), 4_000);
      child.stdout.on("error", (e) => { clearTimeout(timer); fail(e); });
      child.stdout.on("data", (chunk: Buffer) => {
        text += chunk.toString();
        const lines = text.split("\n");
        text = lines.pop() ?? ""; // a partial last line waits for its newline
        for (const line of lines.filter(Boolean)) {
          try {
            const report = JSON.parse(line) as { pid: number; role: string };
            pids.add(report.pid);
            roles.push(report.role);
            seen += 1;
          } catch (e) { clearTimeout(timer); fail(e); return; }
        }
        if (seen >= 2 && pids.size === 2) { clearTimeout(timer); done(); }
      });
    });
    try {
      await both;
      expect(roles.sort()).toEqual(["grandchild", "probe"]);
    } finally {
      for (const pid of pids) try { process.kill(pid); } catch { /* already gone */ }
    }
    await ended;
  });
});
