import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auditWorktree, commitAll, revertPaths, touchedFiles } from "./audit.js";
import { GitError } from "./git.js";
import { Locks } from "./locks.js";
import { openWriteSession, WorkspaceError } from "./session.js";
import { makeRepo } from "./testRepo.testutil.js";
import { createWorktree, listWorktrees, removeWorktree } from "./worktree.js";

vi.setConfig({ testTimeout: 60_000 });

const repos: ReturnType<typeof makeRepo>[] = [];
const repo = (files?: Record<string, string>) => {
  const r = makeRepo(files);
  repos.push(r);
  return r;
};
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

const shadowOf = (dir: string) => join(dir, ".shadow");

describe("worktrees", () => {
  it("creates one per task on its own branch from the current commit, lists and removes it", async () => {
    const r = repo();
    const head = r.git("rev-parse", "HEAD");
    const wt = await createWorktree({ repoRoot: r.dir, shadowRoot: shadowOf(r.dir), soldier: "grok", taskId: "t1" });
    expect(wt).toMatchObject({ name: "grok-t1", branch: "shadow/grok/t1", base: head });
    expect(wt.path).toBe(join(shadowOf(r.dir), "worktrees", "grok-t1"));
    expect(readFileSync(join(wt.path, "src", "a.ts"), "utf8")).toBe("a\n");

    expect((await listWorktrees(r.dir, shadowOf(r.dir))).map((w) => [w.name, w.branch])).toEqual([["grok-t1", "shadow/grok/t1"]]);

    await removeWorktree({ repoRoot: r.dir, shadowRoot: shadowOf(r.dir), name: "grok-t1" });
    expect(existsSync(wt.path)).toBe(false);
    expect(r.git("branch", "--list", "shadow/grok/t1")).toContain("shadow/grok/t1"); // kept by default

    const wt2 = await createWorktree({ repoRoot: r.dir, shadowRoot: shadowOf(r.dir), soldier: "grok", taskId: "t2" });
    await removeWorktree({ repoRoot: r.dir, shadowRoot: shadowOf(r.dir), name: "grok-t2", deleteBranch: true });
    expect(existsSync(wt2.path)).toBe(false);
    expect(r.git("branch", "--list", "shadow/grok/t2")).toBe("");
  });

  it("explains that a repository with no commits cannot host a soldier", async () => {
    const r = repo();
    r.git("checkout", "-q", "--orphan", "empty");
    r.git("rm", "-rfq", ".");
    await expect(
      createWorktree({ repoRoot: r.dir, shadowRoot: shadowOf(r.dir), soldier: "grok", taskId: "t1" }),
    ).rejects.toThrow(/no commits yet/);
  });

  it("refuses unsafe names", async () => {
    const r = repo();
    await expect(createWorktree({ repoRoot: r.dir, shadowRoot: shadowOf(r.dir), soldier: "../x", taskId: "t" })).rejects.toThrow(/invalid/);
    await expect(removeWorktree({ repoRoot: r.dir, shadowRoot: shadowOf(r.dir), name: "nope" })).rejects.toBeInstanceOf(GitError);
  });
});

describe("audit", () => {
  async function scenario() {
    const r = repo({ "README.md": "hello\n", "src/a.ts": "a\n", "src/b.ts": "b\n", "docs/guide.md": "g\n" });
    const wt = await createWorktree({ repoRoot: r.dir, shadowRoot: shadowOf(r.dir), soldier: "grok", taskId: "t1" });
    const w = makeRepoWriter(wt.path);
    // The soldier commits one in-scope change itself...
    w.write("src/a.ts", "a changed\n");
    w.git("add", "-A");
    w.git("-c", "user.name=s", "-c", "user.email=s@x", "commit", "-q", "-m", "soldier commit");
    // ...then leaves more work uncommitted, inside and outside its claims.
    w.write("src/new.ts", "new\n"); //       new, in scope
    w.write("README.md", "vandalized\n"); // modified, out of scope
    w.write("docs/extra.md", "x\n"); //     new, out of scope
    w.rm("docs/guide.md"); //               deleted, out of scope
    return { r, wt };
  }

  it("finds everything the soldier touched, committed or not, from git", async () => {
    const { wt } = await scenario();
    expect(await touchedFiles(wt.path, wt.base)).toEqual(["README.md", "docs/extra.md", "docs/guide.md", "src/a.ts", "src/new.ts"]);
    const audit = await auditWorktree(wt.path, wt.base, ["src/**"]);
    expect(audit.inScope).toEqual(["src/a.ts", "src/new.ts"]);
    expect(audit.outOfScope).toEqual(["README.md", "docs/extra.md", "docs/guide.md"]);
  });

  it("reverts out-of-scope edits and commits the rest, so the branch holds only claimed files", async () => {
    const { r, wt } = await scenario();
    const audit = await auditWorktree(wt.path, wt.base, ["src/**"]);
    await revertPaths(wt.path, wt.base, audit.outOfScope);
    expect(readFileSync(join(wt.path, "README.md"), "utf8")).toBe("hello\n");
    expect(readFileSync(join(wt.path, "docs/guide.md"), "utf8")).toBe("g\n");
    expect(existsSync(join(wt.path, "docs/extra.md"))).toBe(false);

    const sha = await commitAll(wt.path, "shadow(grok): work", wt.base);
    expect(sha).toMatch(/^[0-9a-f]{7,}$/);
    const changed = r.git("diff", "--name-only", wt.base, wt.branch).split("\n").filter(Boolean);
    expect(changed).toEqual(["src/a.ts", "src/new.ts"]);
    expect(await touchedFiles(wt.path, wt.base)).toEqual(["src/a.ts", "src/new.ts"]);
  });

  it("reports the soldier's own commit even when it left nothing uncommitted", async () => {
    const r = repo();
    const wt = await createWorktree({ repoRoot: r.dir, shadowRoot: shadowOf(r.dir), soldier: "grok", taskId: "t1" });
    const w = makeRepoWriter(wt.path);
    w.write("src/a.ts", "x\n");
    w.git("add", "-A");
    w.git("-c", "user.name=s", "-c", "user.email=s@x", "commit", "-q", "-m", "mine");
    expect(await commitAll(wt.path, "nothing to add", wt.base)).toBe(w.git("rev-parse", "--short", "HEAD"));
  });

  it("reports no commit when the soldier changed nothing", async () => {
    const r = repo();
    const wt = await createWorktree({ repoRoot: r.dir, shadowRoot: shadowOf(r.dir), soldier: "grok", taskId: "t1" });
    expect(await commitAll(wt.path, "nothing", wt.base)).toBeUndefined();
  });
});

describe("paths reached through a link", () => {
  // Regression: git reports real paths, so a repo reached through a symlink (macOS's /var is
  // /private/var) or a Windows short name gave the soldier a nonsense working directory.
  it("still puts the soldier inside its own worktree, and still lists the worktree", async () => {
    const r = repo();
    const link = join(dirname(r.dir), `${r.dir.split(/[\\/]/).pop()}-link`);
    symlinkSync(r.dir, link, process.platform === "win32" ? "junction" : "dir");
    try {
      const s = await openWriteSession({ cwd: join(link, "src"), soldier: "grok", claims: ["src/**"] });
      try {
        const real = realpathSync.native(r.dir).replace(/\\/g, "/");
        const cwd = s.cwd.replace(/\\/g, "/");
        expect(cwd.startsWith(`${real}/.shadow/worktrees/grok-`)).toBe(true);
        expect(cwd.endsWith("/src")).toBe(true);
        expect(existsSync(s.cwd)).toBe(true);
        expect((await listWorktrees(link, join(link, ".shadow"))).map((w) => w.branch)).toEqual([s.branch]);
      } finally {
        await s.release();
      }
    } finally {
      rmSync(link, { recursive: false, force: true });
    }
  });
});

describe("write session", () => {
  it("takes a lease, runs in a worktree that mirrors the subdirectory, and releases", async () => {
    const r = repo();
    const s = await openWriteSession({ cwd: join(r.dir, "src"), soldier: "grok", claims: ["src/"] });
    expect(s.claims).toEqual(["src/**"]);
    expect(s.cwd.replace(/\\/g, "/")).toMatch(/\.shadow\/worktrees\/grok-[^/]+\/src$/);
    expect((await new Locks(shadowOf(r.dir)).list()).map((l) => l.owner)).toEqual(["grok"]);

    const info = await s.finish("shadow(grok): nothing");
    expect(info).toMatchObject({ touched: [], commit: undefined, reverted: false, leaseLost: false });
    await s.release();
    await s.release(); // twice is fine
    expect(await new Locks(shadowOf(r.dir)).list()).toEqual([]);
    expect(readFileSync(join(shadowOf(r.dir), ".gitignore"), "utf8")).toBe("*\n");
    expect(r.git("status", "--porcelain")).toBe(""); // .shadow never shows up as untracked
  });

  it("refuses overlapping claims while another session holds them, naming the holder", async () => {
    const r = repo();
    const first = await openWriteSession({ cwd: r.dir, soldier: "grok", claims: ["src/**"] });
    await expect(openWriteSession({ cwd: r.dir, soldier: "codex-sol", claims: ["src/a.ts"] })).rejects.toThrow(/grok's lease/);
    const other = await openWriteSession({ cwd: r.dir, soldier: "codex-sol", claims: ["docs/**"] });
    await other.release();
    await first.release();
  });

  it("leaves nothing behind when a run is discarded before it starts", async () => {
    const r = repo();
    const s = await openWriteSession({ cwd: r.dir, soldier: "grok", claims: ["src/**"] });
    await s.discard();
    await s.release();
    expect(await listWorktrees(r.dir, shadowOf(r.dir))).toEqual([]);
    expect(r.git("branch", "--list", s.branch)).toBe("");
    expect(await new Locks(shadowOf(r.dir)).list()).toEqual([]);
  });

  it("starts the soldier from the folder as it is: uncommitted edits and new files are there, ignored ones are not", async () => {
    const r = repo();
    r.write(".gitignore", "secret.txt\n");
    r.write("src/a.ts", "local edit\n");
    r.write("src/new.ts", "untracked\n");
    r.write("secret.txt", "ignored\n");
    const head = r.git("rev-parse", "HEAD");
    const s = await openWriteSession({ cwd: r.dir, soldier: "grok", claims: ["src/**"] });
    const wt = (p: string) => join(s.cwd, p); // started at the repository root, so this is the worktree's root
    expect(readFileSync(wt("src/a.ts"), "utf8")).toBe("local edit\n");
    expect(readFileSync(wt("src/new.ts"), "utf8")).toBe("untracked\n");
    expect(existsSync(wt("secret.txt"))).toBe(false);

    // Only what the soldier changes is its own: the owner's edits are in its base, not in its branch.
    writeFileSync(wt("src/b.ts"), "by the soldier\n");
    const info = await s.finish("m");
    expect(info.base).not.toBe(head);
    expect(r.git("rev-parse", `${info.base}^`)).toBe(head);
    expect(info.touched).toEqual(["src/b.ts"]);
    expect(r.git("diff", "--name-only", info.base, info.branch)).toBe("src/b.ts");
    await s.release();
    // The owner's folder is as it was.
    expect(readFileSync(join(r.dir, "src/a.ts"), "utf8")).toBe("local edit\n");
    expect(r.git("rev-parse", "HEAD")).toBe(head);
  });

  it("starts the soldier from HEAD itself when the folder is clean", async () => {
    const r = repo();
    const s = await openWriteSession({ cwd: r.dir, soldier: "grok", claims: ["src/**"] });
    expect((await s.finish("m")).base).toBe(r.git("rev-parse", "HEAD"));
    await s.release();
  });

  it("rejects bad claims and non-repositories with a WorkspaceError", async () => {
    const r = repo();
    await expect(openWriteSession({ cwd: r.dir, soldier: "grok", claims: [] })).rejects.toBeInstanceOf(WorkspaceError);
    await expect(openWriteSession({ cwd: r.dir, soldier: "grok", claims: ["../up"] })).rejects.toBeInstanceOf(WorkspaceError);
    expect(await new Locks(shadowOf(r.dir)).list()).toEqual([]);
  });
});

/** Write and run git inside a worktree, for scripting what a soldier would do. */
function makeRepoWriter(dir: string) {
  return {
    write(p: string, content: string) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), content);
    },
    rm(p: string) {
      rmSync(join(dir, p));
    },
    git: (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim(),
  };
}
