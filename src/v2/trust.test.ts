import { chmod, mkdir, mkdtemp, readdir, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import {
  accept, gitCommonDir, isAccepted, MAX_ATTEMPTS, mcpServers, normalizeCommonDir, observe, readPolicyFiles, readRecord, recordPath, sha256,
  untrustedFiles,
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

  it("finds a file gone from a linked tree that showed no card, once a check there recorded what it saw", async () => {
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
    expect((await trust(d, common, repo)).ok).toBe(true);
    const seen = await check(d, common, linked);
    expect(seen.untrusted).toEqual([]);
    expect((await observe(d, { commonDir: common, worktree: linked, current: seen.current })).ok).toBe(true);
    await unlink(join(linked, "rules.md"));
    expect((await check(d, common, linked)).untrusted).toEqual([{ name: "rules.md", status: "gone", hash: null }]);
    // A second check while the file is gone keeps it listed, so it stays gone until a card accepts that.
    const again = await check(d, common, linked);
    expect((await observe(d, { commonDir: common, worktree: linked, current: again.current })).ok).toBe(true);
    expect((await check(d, common, linked)).untrusted).toEqual([{ name: "rules.md", status: "gone", hash: null }]);
    expect((await check(d, common, repo)).untrusted).toEqual([]);
  });

  it("records only files already accepted when it observes, and writes nothing when there is nothing to add", async () => {
    const d = await deps();
    const folder = await directory("folder");
    await writeFile(join(folder, "agent.md"), "never shown");
    const seen = await check(d, "/r/.git", folder);
    expect(await observe(d, { commonDir: "/r/.git", worktree: folder, current: seen.current })).toEqual({ ok: true, record: null });
    await expect(readFile(recordPath(d.home, "/r/.git"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await check(d, "/r/.git", folder)).untrusted).toHaveLength(1);
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

describe("committing the record", () => {
  async function oneFile(d: TrustDeps, name: string) {
    const folder = await directory(name);
    await writeFile(join(folder, "agent.md"), name);
    const card = await check(d, "/r/.git", folder);
    return { folder, input: { commonDir: "/r/.git", worktree: folder, shown: card.untrusted, current: card.current } };
  }
  const trustFolder = (d: TrustDeps) => join(d.home, ".shadow-army", "trust");
  // Anything in the trust folder besides the record itself: temp files, locks, recovery guards.
  const leftovers = async (d: TrustDeps) => (await readdir(trustFolder(d))).filter((f) => join(trustFolder(d), f) !== recordPath(d.home, "/r/.git"));

  it("retries from a new read when another acceptance lands between its read and its rename", async () => {
    const d = await deps();
    const other = await oneFile(d, "other");
    const mine = await oneFile(d, "mine");
    const attempts: number[] = [];
    const result = await accept({ ...d, beforeCommit: async (attempt) => {
      attempts.push(attempt);
      if (attempt === 1) expect((await accept(d, other.input)).ok).toBe(true);
    } }, mine.input);
    expect(result.ok).toBe(true);
    expect(attempts).toEqual([1, 2]);
    const record = await readRecord(d, "/r/.git");
    expect(Object.keys(record!.worktrees).sort()).toEqual([mine.folder, other.folder].sort());
    expect([...record!.accepted["agent.md"]!].sort()).toEqual([sha256("mine"), sha256("other")].sort());
    expect(await leftovers(d)).toEqual([]);
  });

  it("accepts nothing after MAX_ATTEMPTS changed records, keeps the last record whole and leaves no files behind", async () => {
    const d = await deps();
    const mine = await oneFile(d, "mine");
    let last = "";
    const result = await accept({ ...d, beforeCommit: async (attempt) => {
      last = JSON.stringify({ version: 1, commonDir: "/r/.git", accepted: { "rules.md": [sha256(String(attempt))] }, worktrees: {} });
      await writeFile(recordPath(d.home, "/r/.git"), last);
    } }, mine.input);
    expect(result).toEqual({ ok: false, reason: `the trust record kept changing during ${MAX_ATTEMPTS} attempts; nothing was accepted` });
    expect(await readFile(recordPath(d.home, "/r/.git"), "utf8")).toBe(last);
    expect(await leftovers(d)).toEqual([]);
  });

  it("reports an acceptance whose lock can't be removed after the rename as accepted, with a warning", async () => {
    const d = await deps();
    const mine = await oneFile(d, "mine");
    const failing = { ...d, io: { rm: async (path: string, options?: { force?: boolean }) => {
      if (path.endsWith(".lock")) throw Object.assign(new Error("busy"), { code: "EBUSY" });
      await rm(path, options);
    } } };
    const result = await accept(failing, mine.input);
    expect(result).toMatchObject({ ok: true, warning: expect.stringMatching(/was written, but its lock .* can't be removed: EBUSY/) });
    expect((await check(d, "/r/.git", mine.folder)).untrusted).toEqual([]);
    expect(d.logs.at(-1)).toMatch(/can't be removed/);
    // The lock left behind is this process's own and no longer held, so the next acceptance takes it over.
    const next = await oneFile(d, "next");
    expect((await accept({ ...d, lockWaitMs: 200 }, next.input)).ok).toBe(true);
    expect(await leftovers(d)).toEqual([]);
  });

  it("never takes the lock from a live owner, however long it stalls, and takes it over once that owner is gone", async () => {
    const d = await deps();
    const mine = await oneFile(d, "mine");
    const stalled = execa(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
    await mkdir(trustFolder(d), { recursive: true });
    const lock = `${recordPath(d.home, "/r/.git")}.lock`;
    const owner = JSON.stringify({ pid: stalled.pid, host: hostname(), token: "stalled" });
    await writeFile(lock, owner);
    const old = new Date(Date.now() - 3_600_000);
    await utimes(lock, old, old);
    const held = await accept({ ...d, lockWaitMs: 200 }, mine.input);
    expect(held).toMatchObject({ ok: false, reason: expect.stringMatching(/is held by process \d+/) });
    expect(await readFile(lock, "utf8")).toBe(owner);
    expect(await readRecord(d, "/r/.git")).toBeNull();
    stalled.kill();
    await stalled.catch(() => undefined);
    expect((await accept({ ...d, lockWaitMs: 200 }, mine.input)).ok).toBe(true);
    expect(await leftovers(d)).toEqual([]);
  });
});
