import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { closeIntegration, createIntegration, createSnapshot, integrationCommits, integrationFiles, mergeInto } from "./integration.js";

vi.setConfig({ testTimeout: 60_000 });

const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

/** A repo with a branch off the first commit that changes `file` to `content`. */
function repoWithBranches() {
  const r = makeRepo({ "README.md": "hello\n", "a.txt": "a\n", "b.txt": "b\n" });
  repos.push(r);
  const branch = (name: string, file: string, content: string) => {
    r.git("checkout", "-q", "-b", name, "main");
    r.write(file, content);
    r.git("commit", "-qam", `${name} edits ${file}`);
    r.git("checkout", "-q", "main");
  };
  return { r, branch, shadow: join(r.dir, ".shadow") };
}

describe("integration branch", () => {
  it("starts from the current commit, merges branches with merge commits, and never moves the user's branch", async () => {
    const { r, branch, shadow } = repoWithBranches();
    branch("one", "a.txt", "a1\n");
    branch("two", "b.txt", "b2\n");
    const head = r.git("rev-parse", "HEAD");

    const integ = await createIntegration(r.dir, shadow, "run1");
    expect(integ.branch).toBe("shadow/run/run1");
    expect(integ.base).toBe(head);

    expect(await mergeInto(integ, "one", "merge one")).toMatchObject({ ok: true });
    expect(await mergeInto(integ, "two", "merge two")).toMatchObject({ ok: true });
    expect((await integrationFiles(integ)).sort()).toEqual(["a.txt", "b.txt"]);
    expect(await integrationCommits(integ)).toBe(4); // two branch commits and two merges
    expect(r.git("log", "-1", "--format=%s", integ.branch)).toBe("merge two");
    expect(r.git("rev-parse", "HEAD")).toBe(head);
    expect(r.git("branch", "--show-current")).toBe("main");
  });

  it("aborts a conflicting merge, names the file, and leaves the branch exactly as it was", async () => {
    const { r, branch, shadow } = repoWithBranches();
    branch("one", "a.txt", "version one\n");
    branch("two", "a.txt", "version two\n");
    const integ = await createIntegration(r.dir, shadow, "run2");
    await mergeInto(integ, "one", "merge one");
    const before = r.git("rev-parse", integ.branch);

    const res = await mergeInto(integ, "two", "merge two");
    expect(res).toEqual({ ok: false, reason: "merge conflict in a.txt" });
    expect(r.git("rev-parse", integ.branch)).toBe(before);
    expect(r.git("-C", integ.path, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(integ.path, "a.txt"), "utf8")).toBe("version one\n");
  });

  it("snapshots a ref read-only and removes it cleanly", async () => {
    const { r, branch, shadow } = repoWithBranches();
    branch("one", "a.txt", "a1\n");
    const snap = await createSnapshot(r.dir, shadow, "one", "snap-test");
    expect(readFileSync(join(snap.path, "a.txt"), "utf8")).toBe("a1\n");
    expect(r.git("-C", snap.path, "branch", "--show-current")).toBe(""); // detached
    await snap.remove();
    expect(existsSync(snap.path)).toBe(false);
  });

  it("closes: removes the worktree, keeps the branch unless asked", async () => {
    const { r, shadow } = repoWithBranches();
    const kept = await createIntegration(r.dir, shadow, "keep");
    await closeIntegration(r.dir, kept, false);
    expect(existsSync(kept.path)).toBe(false);
    expect(r.git("branch", "--list", kept.branch)).toContain(kept.branch);

    const dropped = await createIntegration(r.dir, shadow, "drop");
    await closeIntegration(r.dir, dropped, true);
    expect(r.git("branch", "--list", dropped.branch)).toBe("");
  });
});
