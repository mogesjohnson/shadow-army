import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { makeRoster } from "../core/roster.testutil.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { ClaudeChannel } from "./claude.js";
import { startOfficeServer, type OfficeServer } from "./server.js";
import type { OfficeEvent } from "./postOffice.js";
import { credential } from "./fixture-main.testutil.js";

const fake = fileURLToPath(new URL("../../test/fakes/claude.mjs", import.meta.url));
const servers: OfficeServer[] = [];
const cleanups: (() => void)[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

/**
 * The fake claude never edits files. This wrapper runs the real fake as a real child process and, just
 * before each turn's `result` frame, writes the files named in a plan file into its cwd (the soldier's
 * worktree), the way a native Edit would have.
 */
function fakeWithWrites() {
  const dir = mkdtempSync(join(tmpdir(), "sa-slice-")); cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const plan = join(dir, "plan.json"); writeFileSync(plan, "{}");
  const wrapper = join(dir, "claude-wrapper.mjs");
  writeFileSync(wrapper, [
    `import { readFileSync, writeFileSync, mkdirSync } from "node:fs";`,
    `import { dirname, join } from "node:path";`,
    `const write = process.stdout.write.bind(process.stdout);`,
    `process.stdout.write = (chunk, ...rest) => {`,
    `  if (String(chunk).includes('"type":"result"')) for (const [name, body] of Object.entries(JSON.parse(readFileSync(${JSON.stringify(plan)}, "utf8")))) { mkdirSync(dirname(join(process.cwd(), name)), { recursive: true }); writeFileSync(join(process.cwd(), name), body); }`,
    `  return write(chunk, ...rest);`,
    `};`,
    `await import(${JSON.stringify(pathToFileURL(fake).href)});`,
  ].join("\n"));
  return { wrapper, plan: (files: Record<string, string>) => writeFileSync(plan, JSON.stringify(files)) };
}

describe("M1a slice, end to end with the fake claude (no real model)", () => {
  it("sends a brief with claims over the authenticated command route, applies the claimed change uncommitted, reverts and names a write outside the claims, and refuses a clash", async () => {
    const repo = makeRepo(); cleanups.push(() => repo.cleanup());
    const { wrapper, plan } = fakeWithWrites();
    const events: OfficeEvent[] = [];
    const roster = makeRoster({ tank: { cli: "claude", model: "synthetic", roles: ["build"], write: true } });
    const server = await startOfficeServer({ cwd: repo.dir, credential, roster, onEvent: (event) => events.push(event),
      channelFactory: (options) => new ClaudeChannel({ ...options, interruptTimeoutMs: 500, command: { file: process.execPath, args: [wrapper] } }) }); servers.push(server);
    const command = async (value: Record<string, unknown>) => {
      const response = await fetch(`${server.url}/command`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify(value) });
      const body = (await response.json()) as { result: any }; return body;
    };
    const head = repo.git("rev-parse", "HEAD");

    // The mod's calls: army, open, then send with the claims.
    const army = await command({ action: "army" });
    expect(JSON.stringify(army.result)).toContain("tank");
    await command({ action: "open", soldier: "tank", claims: ["src/**"] });

    // Turn 1, inside its claims: applied to the owner's folder, uncommitted.
    plan({ "src/a.ts": "claimed edit\n" });
    const first = (await command({ action: "send", soldier: "tank", text: "edit src/a.ts", claims: ["src/**"] })).result;
    expect(first.status).toBe("completed");
    expect(first.write.inScope).toEqual(["src/a.ts"]);
    expect(first.write.apply.applied).toBe(true);
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("claimed edit\n");
    expect(repo.git("rev-parse", "HEAD")).toBe(head);
    expect(repo.git("diff", "--cached", "--name-only")).toBe("");
    expect(repo.git("status", "--porcelain")).toContain("src/a.ts");

    // Turn 2, a file outside its claims too: reverted in the worktree, named, and not applied.
    plan({ "src/b.ts": "claimed edit b\n", "README.md": "out of claims\n" });
    const second = (await command({ action: "send", soldier: "tank", text: "edit more", claims: ["src/**"] })).result;
    expect(second.write.outOfScope).toEqual(["README.md"]);
    expect(second.write.reverted).toBe(true);
    expect(second.write.inScope).toContain("src/b.ts");
    expect(second.write.apply.applied).toBe(true);
    expect(await readFile(join(repo.dir, "README.md"), "utf8")).toBe("hello\n");
    expect(await readFile(join(repo.dir, "src/b.ts"), "utf8")).toBe("claimed edit b\n");

    // Turn 3, edits a file an earlier turn already applied: refused with the clash reason, work stays on the branch.
    plan({ "src/a.ts": "edited again\n" });
    const third = (await command({ action: "send", soldier: "tank", text: "edit a again", claims: ["src/**"] })).result;
    expect(third.write.applicable).toBe(true);
    expect(third.write.apply.applied).toBe(false);
    expect(third.write.apply.clashes).toEqual(["src/a.ts"]);
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("claimed edit\n");
    expect(events.filter((event) => event.type === "guard").every((event) => !(event.data as { changes?: string[] }).changes?.length)).toBe(true);
  }, 60_000);
});
