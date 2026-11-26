import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
    // C5: the relay's last line is the post office's exit it observed, the mod's only proof that it closed.
    expect(output.split("\n").filter(Boolean).map((line) => JSON.parse(line)).at(-1)).toEqual({ type: "post_office_exit", data: { code: 0, signal: null } });
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

it("reports a post office exit after readiness even without a closed event (C11)", async () => {
  const repo = makeRepo();
  const office = join(repo.dir, "office.mjs"), driver = join(repo.dir, "driver.mjs");
  // A post office that becomes ready, then exits on its own without emitting `closed`.
  await writeFile(office, `process.stdin.once("data", () => { process.stdout.write(JSON.stringify({ type: "ready", data: { url: "http://127.0.0.1:1" } }) + "\\n"); setTimeout(() => process.exit(3), 50); });\n`);
  const relayUrl = pathToFileURL(fileURLToPath(new URL("../../dist/v2/modRelay.js", import.meta.url))).href;
  await writeFile(driver, `import { runModRelay } from ${JSON.stringify(relayUrl)};\nawait runModRelay({ command: { file: process.execPath, args: [${JSON.stringify(office)}] } });\n`);
  const relay = spawn(process.execPath, [driver, "--cwd", repo.dir], { cwd: repo.dir, windowsHide: true, stdio: "pipe" });
  const closed = new Promise<number | null>((done) => relay.once("close", done));
  let output = "";
  relay.stdout.on("data", (chunk) => { output += chunk; });
  try {
    relay.stdin.write(`${JSON.stringify({ credential: "d3".repeat(32), session: "native-mod-session" })}\n`); // stdin stays open, as the mod's does
    await closed;
    const events = output.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    expect(events.map((event) => event.type)).toEqual(["ready", "post_office_exit"]);
    expect(events[1].data).toEqual({ code: 3, signal: null });
  } finally {
    if (relay.exitCode === null && relay.signalCode === null) { relay.kill("SIGTERM"); await closed; }
    repo.cleanup();
  }
}, 20_000);
