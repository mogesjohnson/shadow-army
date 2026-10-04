import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderReport } from "../core/summon.js";
import type { Report } from "../core/types.js";
import { revertPaths } from "./audit.js";
import { crossesLink, trackedLinks, unlinkLinks } from "./links.js";
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

  // Committing a symlink needs core.symlinks, which Windows lacks without special rights.
  it.skipIf(process.platform === "win32")("keeps links the base commit itself tracks", async () => {
    const r = repo();
    symlinkSync("a.ts", join(r.dir, "src", "alias.ts"));
    r.git("add", "-A");
    r.git("commit", "-q", "-m", "tracked link");
    const wt = await createWorktree({ repoRoot: r.dir, shadowRoot: join(r.dir, ".shadow"), soldier: "grok", taskId: "t4" });

    expect(await trackedLinks(wt.path, wt.base)).toEqual(new Set(["src/alias.ts"]));
    expect(await unlinkLinks(wt.path, await trackedLinks(wt.path, wt.base))).toEqual([]);
    expect(existsSync(join(wt.path, "src", "alias.ts"))).toBe(true);
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
