import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { windowsOnly } from "./windowsOnly.testutil.js";
import { until } from "./fixture-main.testutil.js";

windowsOnly("the actual mod relay exposes only a loopback endpoint and releases its detached helper", async () => {
  const repo = makeRepo();
  const credential = "d2".repeat(32);
  const entry = fileURLToPath(new URL("../../dist/v2/modRelay.js", import.meta.url));
  const relay = spawn(process.execPath, [entry, "--cwd", repo.dir], { cwd: repo.dir, windowsHide: true, stdio: "pipe" });
  const closed = new Promise<number | null>((done) => relay.once("close", done));
  let output = "", diagnostic = "";
  relay.stdout.on("data", (chunk) => { output += chunk; });
  relay.stderr.on("data", (chunk) => { diagnostic += chunk; });
  let endpoint: string | undefined;
  try {
    relay.stdin.end(`${JSON.stringify({ credential, session: "native-mod-session" })}\n`);
    await until(() => output.includes('"type":"ready"') || relay.exitCode !== null);
    const ready = output.split("\n").filter(Boolean).map((line) => JSON.parse(line)).find((event) => event.type === "ready");
    expect(ready).toBeDefined();
    endpoint = ready.data.url;
    expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const headers = { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" };
    const command = (action: string, session?: string) => fetch(`${endpoint}/command`, { method: "POST", headers, body: JSON.stringify({ action, session }) });
    expect((await command("army")).status).toBe(200);
    expect((await command("renew", "old-session")).status).toBe(400);
    expect((await command("renew", "native-mod-session")).status).toBe(200);
    expect((await command("release", "native-mod-session")).status).toBe(200);
    expect(await closed).toBe(0);
    expect(output + diagnostic).not.toContain(credential);
    expect(diagnostic).toBe("");
    await expect(readFile(join(repo.dir, ".shadow", "v2", "post-office.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    if (relay.exitCode === null && relay.signalCode === null) {
      if (endpoint) await fetch(`${endpoint}/command`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "shutdown" }) }).catch(() => {});
      relay.kill("SIGTERM"); await closed;
    }
    repo.cleanup();
  }
}, 40_000);

/** Starts the real relay with this bootstrap, reads the lock it makes, and shuts it down. */
async function lockedStarter(bootstrap: Record<string, unknown>): Promise<number> {
  const repo = makeRepo();
  const credential = "d3".repeat(32);
  const entry = fileURLToPath(new URL("../../dist/v2/modRelay.js", import.meta.url));
  const relay = spawn(process.execPath, [entry, "--cwd", repo.dir], { cwd: repo.dir, windowsHide: true, stdio: "pipe" });
  const closed = new Promise<number | null>((done) => relay.once("close", done));
  let output = "", diagnostic = "";
  relay.stdout.on("data", (chunk) => { output += chunk; });
  relay.stderr.on("data", (chunk) => { diagnostic += chunk; });
  let endpoint: string | undefined;
  try {
    relay.stdin.end(`${JSON.stringify({ credential, session: "starter-session", ...bootstrap })}\n`);
    await until(() => output.includes('"type":"ready"') || relay.exitCode !== null);
    const ready = output.split("\n").filter(Boolean).map((line) => JSON.parse(line)).find((event) => event.type === "ready");
    expect(diagnostic).toBe("");
    endpoint = ready.data.url;
    // PO-1's lock folder holds numbered generations; the highest one is the live holder.
    const folder = join(repo.dir, ".shadow", "v2", "lock");
    const newest = (await readdir(folder)).filter((name) => /^\d+\.lock$/.test(name)).sort((a, b) => parseInt(a) - parseInt(b)).at(-1)!;
    const lock = JSON.parse(await readFile(join(folder, newest), "utf8")) as { starter: { pid: number } };
    const release = await fetch(`${endpoint}/command`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "release", session: "starter-session" }) });
    expect(release.status).toBe(200);
    expect(await closed).toBe(0);
    // The detached post office frees its folder after the relay exits.
    await until(async () => { try { await readFile(join(repo.dir, ".shadow", "v2", "post-office.lock")); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; } });
    return lock.starter.pid;
  } finally {
    if (relay.exitCode === null && relay.signalCode === null) {
      if (endpoint) await fetch(`${endpoint}/command`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "shutdown" }) }).catch(() => {});
      relay.kill("SIGTERM"); await closed;
    }
    repo.cleanup();
  }
}

windowsOnly("the relay records the bootstrap's starter as the lock's starter", async () => {
  // A live process that is not the relay's parent, so only a forwarded starter can explain the lock.
  const host = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true, stdio: "ignore" });
  try {
    expect(await lockedStarter({ starter: host.pid })).toBe(host.pid);
  } finally { host.kill(); }
}, 40_000);

windowsOnly("the relay takes the process that launched it as the starter when the bootstrap names none", async () => {
  expect(await lockedStarter({})).toBe(process.pid);
}, 40_000);

windowsOnly("the relay refuses a starter that is not a positive integer pid", async () => {
  await expect(lockedStarter({ starter: "12" })).rejects.toThrow(/starter/);
}, 40_000);
