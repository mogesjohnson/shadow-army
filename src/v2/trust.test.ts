import { chmod, mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import {
  accept, gitCommonDir, isAccepted, mcpServers, normalizeCommonDir, readPolicyFiles, readRecord, recordPath, sha256, untrustedFiles,
  type TrustDeps,
} from "./trust.js";

const dirs: string[] = [];
async function directory(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `shadow-v2-trust-${prefix}-`));
  dirs.push(dir);
  return dir;
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

async function deps(): Promise<TrustDeps & { logs: string[] }> {
  const logs: string[] = [];
  return { home: await directory("home"), logs, log: (message) => logs.push(message) };
}

async function check(d: TrustDeps, commonDir: string, folder: string) {
  const current = await readPolicyFiles(folder);
  return { current, untrusted: untrustedFiles(await readRecord(d, commonDir), folder, current) };
}

async function trust(d: TrustDeps, commonDir: string, folder: string) {
  const { current, untrusted } = await check(d, commonDir, folder);
  return accept(d, { commonDir, worktree: folder, shown: untrusted, current });
}

describe("hashes", () => {
  it("hashes each policy file's bytes once and leaves out absent files", async () => {
    const folder = await directory("folder");
    await writeFile(join(folder, "agent.md"), "## Kaisel\n");
    await writeFile(join(folder, "CLAUDE.md"), "not a policy file");
    const read = await readPolicyFiles(folder);
    expect(read.map((file) => file.name)).toEqual(["agent.md"]);
    expect(read[0]!.hash).toBe(sha256(Buffer.from("## Kaisel\n")));
  });

  it("lists .mcp.json's servers with their command or URL, and none for unparseable bytes", () => {
    const bytes = JSON.stringify({ mcpServers: { local: { command: "node", args: ["srv.js", "--port", 1] }, remote: { type: "http", url: "https://mcp.example/x" } } });
    expect(mcpServers(bytes)).toEqual([{ name: "local", target: "node srv.js --port 1" }, { name: "remote", target: "https://mcp.example/x" }]);
    expect(mcpServers("{not json")).toEqual([]);
    expect(mcpServers("null")).toEqual([]);
  });

  it("names the record for the common git directory, lower-cased on Windows, inside the injected home", () => {
    expect(normalizeCommonDir("C:/Repo/.git\n", "win32")).toBe("c:/repo/.git");
    expect(normalizeCommonDir("/Repo/.git\n", "linux")).toBe("/Repo/.git");
    const path = recordPath("/home/u", "/repo/.git");
    expect(path).toBe(join("/home/u", ".shadow-army", "trust", `${sha256("/repo/.git").slice(0, 12)}.json`));
  });
});

describe("the trust store", () => {
  it("shows new files, then trusts exactly the accepted hashes, then shows changed and gone files", async () => {
    const d = await deps();
    const folder = await directory("folder");
    await writeFile(join(folder, "shadow.config.json"), '{"soldiers":{}}');
    await writeFile(join(folder, "agent.md"), "a");
    expect((await check(d, "/r/.git", folder)).untrusted.map((f) => [f.name, f.status])).toEqual([["shadow.config.json", "new"], ["agent.md", "new"]]);
    expect((await trust(d, "/r/.git", folder)).ok).toBe(true);
    expect((await check(d, "/r/.git", folder)).untrusted).toEqual([]);
    await writeFile(join(folder, "agent.md"), "b");
    await writeFile(join(folder, "rules.md"), "r");
    await unlink(join(folder, "shadow.config.json"));
    expect((await check(d, "/r/.git", folder)).untrusted.map((f) => [f.name, f.status])).toEqual([["rules.md", "new"], ["agent.md", "changed"], ["shadow.config.json", "gone"]]);
    expect((await trust(d, "/r/.git", folder)).ok).toBe(true);
    expect((await check(d, "/r/.git", folder)).untrusted).toEqual([]);
    // An older version accepted once stays trusted.
    await writeFile(join(folder, "agent.md"), "a");
    expect((await check(d, "/r/.git", folder)).untrusted).toEqual([]);
  });

  it("accepts only the hashes shown, so a file changed after the card stays untrusted", async () => {
    const d = await deps();
    const folder = await directory("folder");
    await writeFile(join(folder, "agent.md"), "shown");
    const card = await check(d, "/r/.git", folder);
    await writeFile(join(folder, "agent.md"), "changed after the card");
    expect((await accept(d, { commonDir: "/r/.git", worktree: folder, shown: card.untrusted, current: card.current })).ok).toBe(true);
    const after = await check(d, "/r/.git", folder);
    expect(after.untrusted).toEqual([{ name: "agent.md", status: "changed", hash: sha256("changed after the card") }]);
  });

  it("tells whether a snapshot's .mcp.json bytes were accepted", async () => {
    const d = await deps();
    const folder = await directory("folder");
    await writeFile(join(folder, ".mcp.json"), '{"mcpServers":{}}');
    await trust(d, "/r/.git", folder);
    const record = await readRecord(d, "/r/.git");
    expect(isAccepted(record, ".mcp.json", sha256('{"mcpServers":{}}'))).toBe(true);
    expect(isAccepted(record, ".mcp.json", sha256('{"mcpServers":{"x":{"command":"evil"}}}'))).toBe(false);
  });

  it("ignores an acceptance record placed in the folder", async () => {
    const d = await deps();
    const folder = await directory("folder");
    await writeFile(join(folder, "agent.md"), "a");
    await mkdir(join(folder, ".shadow-army", "trust"), { recursive: true });
    await writeFile(recordPath(folder, "/r/.git"), JSON.stringify({ version: 1, commonDir: "/r/.git", accepted: { "agent.md": [sha256("a")] }, worktrees: {} }));
    expect((await check(d, "/r/.git", folder)).untrusted).toHaveLength(1);
  });

  it("counts an unparseable record as none and logs it, and the next acceptance replaces it", async () => {
    const d = await deps();
    const folder = await directory("folder");
    await writeFile(join(folder, "agent.md"), "a");
    await mkdir(join(d.home, ".shadow-army", "trust"), { recursive: true });
    for (const bad of ["{oops", JSON.stringify({ version: 1, commonDir: "/other/.git", accepted: {}, worktrees: {} })]) {
      await writeFile(recordPath(d.home, "/r/.git"), bad);
      expect((await check(d, "/r/.git", folder)).untrusted).toHaveLength(1);
      expect(d.logs.pop()).toMatch(/can't be parsed; it counts as none/);
    }
    expect((await trust(d, "/r/.git", folder)).ok).toBe(true);
    expect((await check(d, "/r/.git", folder)).untrusted).toEqual([]);
  });

  it("accepts nothing when the record can't be written", async () => {
    const d = await deps();
    const folder = await directory("folder");
    await writeFile(join(folder, "agent.md"), "a");
    await writeFile(join(d.home, ".shadow-army"), "a file where the folder should be");
    const result = await trust(d, "/r/.git", folder);
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/can't be written/) });
    expect((await check(d, "/r/.git", folder)).untrusted).toHaveLength(1);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("accepts nothing when the trust folder is read-only", async () => {
    const d = await deps();
    const folder = await directory("folder");
    await writeFile(join(folder, "agent.md"), "a");
    await mkdir(join(d.home, ".shadow-army", "trust"), { recursive: true });
    await chmod(join(d.home, ".shadow-army", "trust"), 0o500);
    try { expect((await trust(d, "/r/.git", folder)).ok).toBe(false); } finally { await chmod(join(d.home, ".shadow-army", "trust"), 0o700); }
  });
});

describe("working trees", () => {
  it("shares one record across a repository's linked worktrees and finds a gone file per worktree", async () => {
    const d = await deps();
    const repo = await directory("repo");
    const linked = join(await directory("wt"), "linked");
    const git = (...args: string[]) => execa("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
    await git("init", "-q");
    await writeFile(join(repo, "agent.md"), "a");
    await writeFile(join(repo, "rules.md"), "r");
    await git("add", ".");
    await git("commit", "-qm", "init");
    await git("worktree", "add", "-q", linked);
    const common = await gitCommonDir(repo);
    expect(await gitCommonDir(linked)).toBe(common);
    expect((await trust(d, common, repo)).ok).toBe(true);
    expect((await check(d, common, linked)).untrusted).toEqual([]);
    await writeFile(join(linked, "agent.md"), "a2");
    expect((await check(d, common, linked)).untrusted.map((f) => f.name)).toEqual(["agent.md"]);
    expect((await trust(d, common, linked)).ok).toBe(true);
    expect((await check(d, common, repo)).untrusted).toEqual([]);

    await unlink(join(linked, "rules.md"));
    expect((await check(d, common, linked)).untrusted).toEqual([{ name: "rules.md", status: "gone", hash: null }]);
    expect((await check(d, common, repo)).untrusted).toEqual([]);
  });

  it("merges two acceptances whose reads came before each other's writes, keeping both worktrees' lists", async () => {
    const d = await deps();
    const main = await directory("main");
    const linked = await directory("linked");
    await writeFile(join(main, "agent.md"), "main agent");
    await writeFile(join(linked, "rules.md"), "linked rules");
    await writeFile(join(linked, "shadow.config.json"), "{}");
    const [a, b] = await Promise.all([check(d, "/r/.git", main), check(d, "/r/.git", linked)]);
    const results = await Promise.all([
      accept(d, { commonDir: "/r/.git", worktree: main, shown: a.untrusted, current: a.current }),
      accept(d, { commonDir: "/r/.git", worktree: linked, shown: b.untrusted, current: b.current }),
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    const record = await readRecord(d, "/r/.git");
    expect(Object.keys(record!.worktrees).sort()).toEqual([linked, main].sort());
    expect((await check(d, "/r/.git", main)).untrusted).toEqual([]);
    expect((await check(d, "/r/.git", linked)).untrusted).toEqual([]);
    await unlink(join(linked, "shadow.config.json"));
    expect((await check(d, "/r/.git", linked)).untrusted).toEqual([{ name: "shadow.config.json", status: "gone", hash: null }]);
    expect((await readdir(join(d.home, ".shadow-army", "trust"))).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(JSON.parse(await readFile(recordPath(d.home, "/r/.git"), "utf8")).commonDir).toBe("/r/.git");
  });
});
