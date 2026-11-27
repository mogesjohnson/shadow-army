import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyToCheckout, renderApply } from "./apply.js";
import { makeRepo } from "./testRepo.testutil.js";

vi.setConfig({ testTimeout: 60_000 });

// Run git for real, except `apply -R`, which fails the way it does when the files changed since the apply.
vi.mock("./git.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("./git.js")>();
  return {
    ...real,
    git: (cwd: string, args: string[], opts?: { stripFinalNewline?: boolean }) =>
      args[0] === "apply" && args.includes("-R")
        ? Promise.reject(new real.GitError("error: keep.txt: patch does not apply"))
        : real.git(cwd, args, opts),
  };
});

const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

describe("when the index cannot be changed and the edits cannot be taken back out", () => {
  it("reports the files still changed, and the report does not say the folder is unchanged", async () => {
    const r = makeRepo({ "keep.txt": "a\n" });
    repos.push(r);
    const base = r.git("rev-parse", "HEAD");
    r.git("checkout", "-q", "-b", "shadow/run/test");
    r.write("keep.txt", "a\nb\n");
    r.write("hello.txt", "hi\n");
    r.git("add", "-A");
    r.git("commit", "-q", "-m", "run");
    r.git("checkout", "-q", "main");
    // The patch applies to the working tree, then `git add -N` fails on the lock.
    // `git apply` never takes the index lock, so it can be held from the start.
    writeFileSync(join(r.dir, ".git", "index.lock"), "owner's lock");

    const result = await applyToCheckout(r.dir, base, "shadow/run/test");

    expect(result.applied).toBe(false);
    if (result.applied) return;
    expect(result.reason).toContain("index.lock");
    expect(result.reason).toContain("taking the edits back out failed");
    expect(result.left).toEqual(["hello.txt", "keep.txt"]);
    // The edits really are still there.
    expect(readFileSync(join(r.dir, "keep.txt"), "utf8")).toBe("a\nb\n");
    expect(existsSync(join(r.dir, "hello.txt"))).toBe(true);

    const text = renderApply(result, "shadow/run/test");
    expect(text).not.toContain("Your folder is unchanged");
    expect(text).toContain("NOT put back");
    expect(text).toContain("  hello.txt\n  keep.txt");
  });

  it("lists an ignored addition that is still there, which plain git status leaves out", async () => {
    const r = makeRepo({ "keep.txt": "a\n", ".gitignore": "*.log\n" });
    repos.push(r);
    const base = r.git("rev-parse", "HEAD");
    r.git("checkout", "-q", "-b", "shadow/run/test");
    r.write("keep.txt", "a\nb\n");
    r.write("run.log", "hi\n");
    r.git("add", "-f", "keep.txt", "run.log");
    r.git("commit", "-q", "-m", "run");
    r.git("checkout", "-q", "main");
    writeFileSync(join(r.dir, ".git", "index.lock"), "owner's lock");

    const result = await applyToCheckout(r.dir, base, "shadow/run/test");

    expect(existsSync(join(r.dir, "run.log"))).toBe(true);
    expect(result).toMatchObject({ applied: false, left: ["keep.txt", "run.log"] });
    const text = renderApply(result, "shadow/run/test");
    expect(text).toContain("  run.log");
    expect(text).toContain("git diff does not show new untracked files");
  });
});
