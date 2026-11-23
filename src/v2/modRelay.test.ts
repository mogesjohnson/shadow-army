import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { until } from "./fixture-main.testutil.js";

it("the actual mod relay exposes only a loopback endpoint and releases its detached helper", async () => {
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
