import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { helperPath, parseStat, spawnManagedProcess, treeOf, type LinuxManagedProcess } from "./linux.js";

const fake = fileURLToPath(new URL("../../../test/fakes/tree-writer.mjs", import.meta.url));
// The helper exists only on Linux after `npm run build`; elsewhere these tests skip (D-34: Not tested off Linux).
const linux = it.runIf(process.platform === "linux" && existsSync(helperPath()));

describe("Linux tree listing (PO-11)", () => {
  it("reads the parent and start time after the last ')' of the command name", () => {
    const fields = Array.from({ length: 50 }, (_, index) => String(index + 3));
    fields[0] = "S"; fields[1] = "41"; fields[19] = "123456";
    expect(parseStat(42, `42 (a) b) (c) ${fields.join(" ")}`)).toEqual({ pid: 42, ppid: 41, startTime: 123456 });
    expect(parseStat(42, "42 no-paren")).toBeNull();
    expect(parseStat(42, "42 (x) S")).toBeNull();
  });

  it("keeps each process whose chain of parents reaches the root, and survives a cycle", () => {
    const entry = (pid: number, ppid: number) => ({ pid, ppid, startTime: pid * 10 });
    const all = [entry(1, 0), entry(10, 1), entry(11, 10), entry(12, 11), entry(20, 1), entry(30, 31), entry(31, 30)];
    expect(treeOf(all, 10).map((process) => process.pid)).toEqual([11, 12]);
    expect(treeOf(all, 99)).toEqual([]);
  });
});

describe("Linux guardian driver (PO-9, PO-10, M1-AC15 on Linux)", () => {
  let dir: string;
  const open: LinuxManagedProcess[] = [];
  afterEach(async () => {
    await Promise.allSettled(open.splice(0).map((managed) => managed.close({ grace: false })));
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function start(...flags: string[]) {
    dir = mkdtempSync(join(tmpdir(), "sa-linux-"));
    const out = join(dir, "writer.log");
    const managed = await spawnManagedProcess({ file: "node", args: [fake, out, ...flags], cwd: dir, env: { ...process.env, SA_PROBE: "probe" } });
    open.push(managed);
    let stdout = "";
    managed.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    const writer = await waitFor(() => existsSync(out) && Number(readFileSync(out, "utf8").split("\n")[0]));
    return { managed, out, writer, stdout: () => stdout };
  }

  async function waitFor<T>(probe: () => T, ms = 5_000): Promise<T> {
    for (const began = Date.now(); Date.now() - began < ms; await new Promise((done) => setTimeout(done, 20))) {
      const value = probe();
      if (value) return value;
    }
    throw new Error("timed out");
  }

  /** The file has stopped growing: it is the same size 200 ms apart. */
  async function stoppedGrowing(file: string) {
    const before = statSync(file).size;
    await new Promise((done) => setTimeout(done, 200));
    return statSync(file).size === before;
  }

  linux("passes streams, cwd, args and env, hears the exit while the writer runs, lists the writer and ends it", async () => {
    const { managed, out, writer, stdout } = await start();
    const listed = await managed.list();
    expect(listed.map((process) => process.pid)).toEqual(expect.arrayContaining([managed.pid, writer]));
    expect(listed.find((process) => process.pid === writer)!.startTime).toBeGreaterThan(0);
    managed.stdin.write("bytes é\n");
    await waitFor(() => stdout().includes("bytes é\n"));
    expect(JSON.parse(stdout().split("\n")[0]!)).toEqual({ argv: [out], cwd: dir, probe: "probe" });
    managed.stdin.end(); // The CLI's own exit, as close() asks for it.
    expect(await managed.exited).toEqual({ code: 7, signal: null });
    expect(await stoppedGrowing(out)).toBe(false); // The writer still runs after the CLI's own exit...
    const began = Date.now();
    await managed.close(); // ...until the tree is killed, at once since the CLI has exited.
    expect(Date.now() - began).toBeLessThan(2_000);
    expect(await stoppedGrowing(out)).toBe(true);
  }, 20_000);

  linux("sends SIGTERM 9.5 s after asking a CLI that ignores its input to exit", async () => {
    const { managed, out } = await start("ignore-stdin");
    const began = Date.now();
    const closed = managed.close();
    expect(await managed.exited).toEqual({ code: null, signal: "SIGTERM" });
    expect(Date.now() - began).toBeGreaterThanOrEqual(9_400);
    await closed;
    expect(await stoppedGrowing(out)).toBe(true);
  }, 20_000);

  linux("kills the tree at 10 s when the CLI ignores its input and SIGTERM", async () => {
    const { managed, out } = await start("ignore-stdin", "ignore-term");
    const began = Date.now();
    await managed.close();
    expect(await managed.exited).toEqual({ code: null, signal: "SIGKILL" });
    expect(Date.now() - began).toBeGreaterThanOrEqual(9_900);
    expect(Date.now() - began).toBeLessThan(15_000);
    expect(await stoppedGrowing(out)).toBe(true);
  }, 25_000);

  linux("kills at once without grace, and spares a process outside the session", async () => {
    const outside = spawn("sleep", ["30"], { stdio: "ignore" });
    try {
      const { managed, out } = await start("ignore-stdin", "ignore-term");
      const began = Date.now();
      await managed.close({ grace: false });
      expect(Date.now() - began).toBeLessThan(2_000);
      expect(await managed.exited).toEqual({ code: null, signal: "SIGKILL" });
      expect(await stoppedGrowing(out)).toBe(true);
      expect(outside.exitCode).toBeNull();
      expect(() => process.kill(outside.pid!, 0)).not.toThrow();
    } finally { outside.kill("SIGKILL"); }
  }, 20_000);

  linux("kills the tree at once when the guardian learns the post office is gone", async () => {
    const { managed, out } = await start("ignore-stdin", "ignore-term");
    process.kill(managed.guardianPid, "SIGTERM"); // The guardian treats SIGTERM as the post office being gone.
    expect(await managed.exited).toEqual({ code: null, signal: "SIGKILL" });
    await managed.close();
    expect(await stoppedGrowing(out)).toBe(true);
  }, 20_000);

  linux("starts nothing for a missing executable or helper", async () => {
    await expect(spawnManagedProcess({ file: "no-such-cli-sa", cwd: tmpdir() })).rejects.toThrow(/could not find executable/);
    await expect(spawnManagedProcess({ file: "node", cwd: tmpdir() }, "/nonexistent/sa-contain")).rejects.toThrow(/ENOENT/);
  });
});
