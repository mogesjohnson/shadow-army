import { existsSync, lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderReport } from "../core/summon.js";
import type { Report } from "../core/types.js";
import { revertPaths } from "./audit.js";
import { crossesLink, trackedLinks, unlinkLinks } from "./links.js";
import { openWriteSession } from "./session.js";
import { makeRepo } from "./testRepo.testutil.js";
import { createSnapshot, createWorktree, removeWorktree } from "./worktree.js";

// A junction needs no special rights on Windows. Elsewhere the "junction" type is ignored and a
// directory symlink is made, which git and rm treat the same way.
const linkFolder = (target: string, path: string) => symlinkSync(target, path, "junction");

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** A folder outside every repository, holding a file that must survive. */
function outside(): string {
  const dir = mkdtempSync(join(tmpdir(), "shadow-outside-"));
  writeFileSync(join(dir, "precious.txt"), "keep me\n");
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function repo() {
  const r = makeRepo();
  cleanups.push(r.cleanup);
  return r;
}

/** Replace the worktree's tracked `src` folder with a link to `target`, as a soldier could. */
function hijackSrc(worktree: string, target: string): void {
  rmSync(join(worktree, "src"), { recursive: true, force: true });
  linkFolder(target, join(worktree, "src"));
}

describe("removing a worktree never follows a link inside it", () => {
  it("leaves a junction's target alone when a snapshot is removed", async () => {
    const r = repo();
    const target = outside();
    const snap = await createSnapshot(r.dir, join(r.dir, ".shadow"), "HEAD", "look-test");
    hijackSrc(snap.path, target);

    await snap.remove();

    expect(readFileSync(join(target, "precious.txt"), "utf8")).toBe("keep me\n");
    expect(existsSync(snap.path)).toBe(false);
    expect(r.git("worktree", "list", "--porcelain")).not.toContain("look-test");
  });

  it("leaves a junction's target alone when a soldier worktree is removed", async () => {
    const r = repo();
    const target = outside();
    const shadowRoot = join(r.dir, ".shadow");
    const wt = await createWorktree({ repoRoot: r.dir, shadowRoot, soldier: "grok", taskId: "t1" });
    hijackSrc(wt.path, target);

    await removeWorktree({ repoRoot: r.dir, shadowRoot, name: wt.name });

    expect(readFileSync(join(target, "precious.txt"), "utf8")).toBe("keep me\n");
    expect(existsSync(wt.path)).toBe(false);
  });

  it("still removes an ordinary worktree", async () => {
    const r = repo();
    const snap = await createSnapshot(r.dir, join(r.dir, ".shadow"), "HEAD", "plain");
    await snap.remove();
    expect(existsSync(snap.path)).toBe(false);
    expect(existsSync(join(r.dir, ".git", "worktrees", "plain"))).toBe(false);
  });

  it("leaves the records of your other worktrees alone, even one whose folder is missing", async () => {
    const r = repo();
    // One of your own worktrees, whose folder is away for a while (an unplugged drive, a rename).
    const own = mkdtempSync(join(tmpdir(), "shadow-own-"));
    cleanups.push(() => rmSync(own, { recursive: true, force: true }));
    cleanups.push(() => rmSync(`${own}-away`, { recursive: true, force: true }));
    r.git("worktree", "add", "-q", "--detach", own, "HEAD");
    renameSync(own, `${own}-away`);

    const snap = await createSnapshot(r.dir, join(r.dir, ".shadow"), "HEAD", "look-other");
    await snap.remove();

    expect(existsSync(join(r.dir, ".git", "worktrees", "look-other"))).toBe(false);
    expect(existsSync(join(r.dir, ".git", "worktrees", basename(own)))).toBe(true);
    // Back in place, your worktree still works.
    renameSync(`${own}-away`, own);
    expect(r.git("-C", own, "status", "--porcelain")).toBe("");
  });

  it("removes only the link when a soldier swaps its worktree folder for a link to yours", async () => {
    const r = repo();
    const target = outside();
    // One of your own worktrees, holding a link of its own.
    const own = mkdtempSync(join(tmpdir(), "shadow-own-"));
    cleanups.push(() => rmSync(own, { recursive: true, force: true }));
    r.git("worktree", "add", "-q", "--detach", own, "HEAD");
    linkFolder(target, join(own, "linked"));

    const snap = await createSnapshot(r.dir, join(r.dir, ".shadow"), "HEAD", "look-swap");
    // The soldier moves its worktree aside and puts a link to yours in its place.
    renameSync(snap.path, `${snap.path}-moved`);
    linkFolder(own, snap.path);

    await snap.remove();

    expect(existsSync(snap.path)).toBe(false);
    expect(existsSync(join(r.dir, ".git", "worktrees", "look-swap"))).toBe(false);
    // Your worktree, its record and its own link are untouched.
    expect(existsSync(join(r.dir, ".git", "worktrees", basename(own)))).toBe(true);
    expect(readFileSync(join(own, "linked", "precious.txt"), "utf8")).toBe("keep me\n");
    expect(() => r.git("-C", own, "status")).not.toThrow();
  });

  it("finds the record when git stores relative worktree paths", async () => {
    const r = repo();
    r.git("config", "worktree.useRelativePaths", "true");
    const shadowRoot = join(r.dir, ".shadow");
    const snap = await createSnapshot(r.dir, shadowRoot, "HEAD", "look-relative");
    expect(readFileSync(join(r.dir, ".git", "worktrees", "look-relative", "gitdir"), "utf8")).toMatch(/^\.\./);

    await snap.remove();

    expect(existsSync(join(r.dir, ".git", "worktrees", "look-relative"))).toBe(false);
    // The same snapshot can be made again.
    const again = await createSnapshot(r.dir, shadowRoot, "HEAD", "look-relative");
    await again.remove();
  });
});

describe("the claim audit's revert never writes or deletes through a link", () => {
  it("refuses a path under a link, and the target is untouched", async () => {
    const r = repo();
    const target = outside();
    const wt = await createWorktree({ repoRoot: r.dir, shadowRoot: join(r.dir, ".shadow"), soldier: "grok", taskId: "t2" });
    hijackSrc(wt.path, target);

    expect(await crossesLink(wt.path, "src/a.ts")).toBe(true);
    await expect(revertPaths(wt.path, wt.base, ["src/a.ts"])).rejects.toThrow(/link/);
    await expect(revertPaths(wt.path, wt.base, ["src/precious.txt"])).rejects.toThrow(/link/);

    expect(readFileSync(join(target, "precious.txt"), "utf8")).toBe("keep me\n");
    expect(existsSync(join(target, "a.ts"))).toBe(false);
  });

  it("reverts safely once the soldier's links are removed", async () => {
    const r = repo();
    const target = outside();
    const wt = await createWorktree({ repoRoot: r.dir, shadowRoot: join(r.dir, ".shadow"), soldier: "grok", taskId: "t3" });
    hijackSrc(wt.path, target);

    expect(await unlinkLinks(wt.path, await trackedLinks(wt.path, wt.base))).toEqual(["src"]);
    await revertPaths(wt.path, wt.base, ["src/a.ts"]);

    expect(readFileSync(join(wt.path, "src", "a.ts"), "utf8")).toBe("a\n");
    expect(readFileSync(join(target, "precious.txt"), "utf8")).toBe("keep me\n");
    expect(existsSync(join(target, "a.ts"))).toBe(false);
  });

  it("refuses to finish when a soldier swaps its worktree folder for a link into your checkout", async () => {
    const r = repo();
    r.write("src/scratch.ts", "mine\n"); // untracked, yours
    const s = await openWriteSession({ cwd: r.dir, soldier: "grok", claims: ["docs/**"] });
    try {
      // The soldier moves its worktree aside and puts a link to your src folder in its place.
      renameSync(s.cwd, `${s.cwd}-moved`);
      linkFolder(join(r.dir, "src"), s.cwd);

      await expect(s.finish("shadow(grok): swap")).rejects.toThrow(/replaced by a link/);
      expect(await crossesLink(s.cwd, "scratch.ts")).toBe(true);

      // Your file is still there and still untracked, and nothing was committed to your branch.
      expect(readFileSync(join(r.dir, "src", "scratch.ts"), "utf8")).toBe("mine\n");
      expect(r.git("status", "--porcelain")).toContain("src/scratch.ts");
      expect(r.git("rev-list", "--count", "HEAD")).toBe("1");
    } finally {
      await s.discard();
      await s.release();
    }
  });

  // Committing a symlink needs core.symlinks, which Windows lacks without special rights.
  it.skipIf(process.platform === "win32")("keeps links the base commit itself tracks", async () => {
    const r = repo();
    symlinkSync("a.ts", join(r.dir, "src", "alias.ts"));
    r.git("add", "-A");
    r.git("commit", "-q", "-m", "tracked link");
    const wt = await createWorktree({ repoRoot: r.dir, shadowRoot: join(r.dir, ".shadow"), soldier: "grok", taskId: "t4" });

    expect(await trackedLinks(wt.path, wt.base)).toEqual(new Map([["src/alias.ts", "a.ts"]]));
    expect(await unlinkLinks(wt.path, await trackedLinks(wt.path, wt.base))).toEqual([]);
    expect(existsSync(join(wt.path, "src", "alias.ts"))).toBe(true);
  });

  it("unlinks a junction that replaced a tracked link, so the revert deletes nothing outside", async () => {
    const r = repo();
    const target = outside();
    // A tracked symlink, made with plumbing so it can be committed where links can't be created.
    // Where git checks links out as plain files (core.symlinks=false), the worktree gets a file.
    r.write("link.tmp", "src/a.ts");
    const oid = r.git("hash-object", "-w", "link.tmp");
    rmSync(join(r.dir, "link.tmp"));
    r.git("update-index", "--add", "--cacheinfo", `120000,${oid},alias`);
    r.git("commit", "-q", "-m", "tracked link");
    const s = await openWriteSession({ cwd: r.dir, soldier: "grok", claims: ["docs/**"] });
    try {
      // The soldier swaps the checked-out alias for a junction to a folder outside.
      rmSync(join(s.cwd, "alias"), { recursive: true, force: true });
      linkFolder(target, join(s.cwd, "alias"));

      const info = await s.finish("shadow(grok): swap a tracked link");

      expect(info.linksRemoved).toEqual(["alias"]);
      expect(readFileSync(join(target, "precious.txt"), "utf8")).toBe("keep me\n");
      // The base's entry is back, as git checks it out here, and nothing else changed.
      expect(info.outOfScope).toEqual(["alias"]);
      expect(lstatSync(join(s.cwd, "alias")).isDirectory()).toBe(false);
    } finally {
      await s.discard();
      await s.release();
    }
  });

  it("removes a link standing at a path being reverted, without deleting through it", async () => {
    const r = repo();
    const target = outside();
    const wt = await createWorktree({ repoRoot: r.dir, shadowRoot: join(r.dir, ".shadow"), soldier: "grok", taskId: "t5" });
    // A tracked file replaced by a junction to a folder outside, left for the revert to meet.
    rmSync(join(wt.path, "README.md"));
    linkFolder(target, join(wt.path, "README.md"));

    await revertPaths(wt.path, wt.base, ["README.md"]);

    expect(readFileSync(join(target, "precious.txt"), "utf8")).toBe("keep me\n");
    expect(readFileSync(join(wt.path, "README.md"), "utf8")).toBe("hello\n");
  });
});

describe("the report names removed links", () => {
  it("lists them in the summon report", () => {
    const report = {
      soldier: "grok",
      role: "build",
      model: "grok-4.7",
      status: "ok",
      summary: "done",
      filesTouched: [],
      openQuestions: [],
      notes: [],
      structured: true,
      durationMs: 1000,
      workspace: {
        branch: "shadow/grok/t5",
        path: "/tmp/wt",
        base: "abc",
        claims: ["src/**"],
        touched: [],
        inScope: [],
        outOfScope: [],
        reverted: false,
        leaseLost: false,
        uncommittedIgnored: false,
        linksRemoved: ["src"],
      },
    } as Report;
    expect(renderReport(report)).toContain("LINKS REMOVED");
    expect(renderReport(report)).toContain("src");
  });
});
