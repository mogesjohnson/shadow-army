import { readFile, readdir } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { OfficeClient } from "./client.js";
import type { OfficeEvent } from "./postOffice.js";
import type { TurnResult } from "./channel.js";
import { credential, until } from "./fixture-main.testutil.js";

const clients: OfficeClient[] = [];
const repos: ReturnType<typeof makeRepo>[] = [];
const children: ChildProcessWithoutNullStreams[] = [];
const runtimeArgs = ["--import", new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href, fileURLToPath(new URL("./fixture-main.testutil.ts", import.meta.url))];
function launch(cwd: string, extra: string[] = []) {
  const child = spawn(process.execPath, [...runtimeArgs, "--cwd", cwd, ...extra], { cwd, windowsHide: true, stdio: "pipe" }); children.push(child);
  let diagnostic = "";
  child.stderr.on("data", (chunk: Buffer) => { diagnostic += chunk.toString(); });
  const events: OfficeEvent[] = [];
  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) { events.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1); }
  });
  const exited = new Promise<number | null>((done) => child.once("exit", done));
  const closed = new Promise<void>((done) => child.once("close", () => done()));
  return { child, events, exited, closed, diagnostic: () => diagnostic };
}
async function request<T>(url: string, action: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${url}/command`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify(action) });
  expect(response.status).toBe(200);
  return ((await response.json()) as { result: T }).result;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await new Promise<void>((done) => child.once("close", done));
  }
  repos.splice(0).forEach((repo) => repo.cleanup());
});
describe("M1 caller subprocess contract", () => {
  it("resolves a relative repository folder once before spawning the helper", async () => {
    const repo = makeRepo(); repos.push(repo);
    const client = new OfficeClient({ cwd: relative(process.cwd(), repo.dir), command: { file: process.execPath, args: runtimeArgs } }); clients.push(client);
    const opened = await client.request<{ cwd: string }>({ action: "open", soldier: "scout" });
    expect(relative(repo.dir, opened.cwd)).toMatch(/^\.shadow[\\/]v2[\\/]worktrees[\\/]session-/);
    expect((await client.request<TurnResult>({ action: "send", soldier: "scout", text: "inspect" })).status).toBe("completed");
  }, 30_000);
  it("bootstraps on stdin, reuses the native process and authenticated shutdown closes active children while retaining partial work", async () => {
    const repo = makeRepo(); repos.push(repo);
    const events: OfficeEvent[] = [];
    const client = new OfficeClient({ cwd: repo.dir, onEvent: (event) => events.push(event), command: { file: process.execPath, args: ["--import", new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href, fileURLToPath(new URL("./fixture-main.testutil.ts", import.meta.url))] } }); clients.push(client);
    const opened = await client.request<{ cwd: string }>({ action: "open", soldier: "scout" });
    const first = JSON.parse((await client.request<TurnResult>({ action: "send", soldier: "scout", text: "inspect" })).text);
    const second = JSON.parse((await client.request<TurnResult>({ action: "send", soldier: "scout", text: "inspect" })).text);
    expect(first.pid).toBe(second.pid);
    expect(second.history).toEqual(["inspect", "inspect"]);
    const pending = client.request<TurnResult>({ action: "send", soldier: "scout", text: "partial" });
    await until(() => events.some((event) => event.type === "tool_call"));
    await client.close();
    expect((await pending).status).toBe("failed");
    expect(() => process.kill(first.pid, 0)).toThrow();
    expect(await readFile(join(opened.cwd, "partial.txt"), "utf8")).toBe("partial edit\n");
    await expect(readFile(join(repo.dir, ".shadow", "v2", "post-office.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(client.request({ action: "army" })).rejects.toThrow("closed");
  }, 40_000);

  it("accepts a one-shot credential pipe, keeps serving after EOF, and exits on authenticated shutdown", async () => {
    const repo = makeRepo(); repos.push(repo);
    const runtime = launch(repo.dir);
    runtime.child.stdin.end(`${JSON.stringify({ credential })}\n`);
    await until(() => runtime.events.some((event) => event.type === "ready") || runtime.child.exitCode !== null);
    expect(runtime.diagnostic()).toBe("");
    const ready = runtime.events.find((event) => event.type === "ready");
    expect(ready).toBeDefined();
    const url = (ready!.data as { url: string }).url;
    const first = JSON.parse((await request<TurnResult>(url, { action: "send", soldier: "scout", text: "inspect" })).text);
    const second = JSON.parse((await request<TurnResult>(url, { action: "send", soldier: "scout", text: "inspect" })).text);
    expect(first.pid).toBe(second.pid); expect(second.history).toEqual(["inspect", "inspect"]);
    await request(url, { action: "shutdown" });
    expect(await runtime.exited).toBe(0);
    expect(() => process.kill(first.pid, 0)).toThrow();
    await expect(readFile(join(repo.dir, ".shadow", "v2", "post-office.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 30_000);

  it("detects an abruptly exited launcher after bootstrap EOF and closes its native child while retaining partial work", async () => {
    const repo = makeRepo(); repos.push(repo);
    const runtime = launch(repo.dir, ["--launcher"]);
    await until(() => runtime.events.some((event) => event.type === "ready"));
    const ready = runtime.events.find((event) => event.type === "ready")!.data as { url: string; pid: number };
    const opened = await request<{ cwd: string }>(ready.url, { action: "open", soldier: "scout" });
    const native = JSON.parse((await request<TurnResult>(ready.url, { action: "send", soldier: "scout", text: "inspect" })).text);
    const pending = request<TurnResult>(ready.url, { action: "send", soldier: "scout", text: "partial" }).then((result) => result, () => undefined);
    await until(() => runtime.events.some((event) => event.type === "tool_call"));
    runtime.child.stdin.end("exit without cleanup\n");
    await runtime.exited;
    const result = await pending;
    if (result) expect(result.status).toBe("failed");
    await until(() => { try { process.kill(native.pid, 0); return false; } catch { return true; } });
    expect(await readFile(join(opened.cwd, "partial.txt"), "utf8")).toBe("partial edit\n");
    await until(async () => { try { await readFile(join(repo.dir, ".shadow", "v2", "post-office.lock")); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; } });
    await expect(readFile(join(repo.dir, ".shadow", "v2", "post-office.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    const logs = join(repo.dir, ".shadow", "v2", "logs");
    const records = (await Promise.all((await readdir(logs)).map((name) => readFile(join(logs, name), "utf8")))).join("\n");
    expect(records.match(/"type":"guard"/g)).toHaveLength(2);
    expect(records.match(/"type":"delivery"/g)).toHaveLength(2);
    await until(() => { try { process.kill(ready.pid, 0); return false; } catch { return true; } });
    await runtime.closed;
    expect(await readFile(join(repo.dir, "launcher-stderr.log"), "utf8")).toBe("");
  }, 30_000);
});
