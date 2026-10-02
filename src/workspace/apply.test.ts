import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyToCheckout, renderApply } from "./apply.js";
import { makeRepo } from "./testRepo.testutil.js";

const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

const BRANCH = "shadow/run/test";

/** A repo whose run branch modifies keep.txt, deletes old.txt and adds dir/hello.txt; main is checked out. */
function repoWithRun() {
  const r = makeRepo({ "keep.txt": "a\n", "old.txt": "gone\n", "other.txt": "x\n" });
  repos.push(r);
  const base = r.git("rev-parse", "HEAD");
  r.git("checkout", "-q", "-b", BRANCH);
  r.write("keep.txt", "a\nb\n");
  r.git("rm", "-q", "old.txt");
  r.write("dir/hello.txt", "hi\n");
  r.git("add", "-A");
  r.git("commit", "-q", "-m", "run");
  const tip = r.git("rev-parse", "HEAD");
  r.git("checkout", "-q", "main");
  const read = (p: string) => readFileSync(join(r.dir, p), "utf8");
  const has = (p: string) => existsSync(join(r.dir, p));
  return { r, base, tip, read, has };
}

describe("applying a run to the checkout", () => {
  it("puts added, modified and deleted files in as unstaged edits, and commits nothing", async () => {
    const { r, base, tip, read, has } = repoWithRun();
    const result = await applyToCheckout(r.dir, base, BRANCH);
    expect(result).toEqual({
      applied: true,
      files: [
        { change: "A", path: "dir/hello.txt" },
        { change: "M", path: "keep.txt" },
        { change: "D", path: "old.txt" },
      ],
    });
    expect(read("keep.txt")).toBe("a\nb\n");
    expect(read("dir/hello.txt")).toBe("hi\n");
    expect(has("old.txt")).toBe(false);
    // Unstaged, new file included (intent-to-add), so `git diff` shows all of it and nothing is staged.
    expect(r.git("diff", "--name-status")).toBe("A\tdir/hello.txt\nM\tkeep.txt\nD\told.txt");
    expect(r.git("diff", "--cached", "--name-only")).toBe("");
    // HEAD, the current branch and the run branch are where they were.
    expect(r.git("rev-parse", "HEAD")).toBe(base);
    expect(r.git("branch", "--show-current")).toBe("main");
    expect(r.git("rev-parse", BRANCH)).toBe(tip);
  });

  it("leaves the owner's unrelated changes alone", async () => {
    const { r, base, read } = repoWithRun();
    r.write("other.txt", "mine\n");
    r.write("notes.txt", "untracked\n");
    expect((await applyToCheckout(r.dir, base, BRANCH)).applied).toBe(true);
    expect(read("other.txt")).toBe("mine\n");
    expect(read("notes.txt")).toBe("untracked\n");
    expect(r.git("diff", "--name-status")).toContain("M\tother.txt");
  });

  it("changes nothing when the owner has local changes to a file the run changed", async () => {
    const { r, base, read, has } = repoWithRun();
    r.write("keep.txt", "my edit\n");
    r.write("dir/hello.txt", "my own hello\n");
    const result = await applyToCheckout(r.dir, base, BRANCH);
    expect(result).toEqual({
      applied: false,
      reason: "you have uncommitted changes to files the run also changed",
      clashes: ["dir/hello.txt", "keep.txt"],
    });
    expect(read("keep.txt")).toBe("my edit\n");
    expect(read("dir/hello.txt")).toBe("my own hello\n");
    expect(has("old.txt")).toBe(true);
  });

  it("changes nothing when the checkout has moved on and the changes no longer apply", async () => {
    const { r, base, has } = repoWithRun();
    r.write("keep.txt", "z\n");
    r.git("commit", "-q", "-am", "the owner changed keep.txt meanwhile");
    const result = await applyToCheckout(r.dir, base, BRANCH);
    expect(result.applied).toBe(false);
    expect(!result.applied && result.reason).toMatch(/no longer apply to your checkout, which has moved on.*keep\.txt/);
    expect(r.git("status", "--porcelain")).toBe("");
    expect(has("dir/hello.txt")).toBe(false);
  });

  it("still applies when the checkout moved on in other files", async () => {
    const { r, base, read } = repoWithRun();
    r.write("other.txt", "y\n");
    r.git("commit", "-q", "-am", "an unrelated commit");
    expect((await applyToCheckout(r.dir, base, BRANCH)).applied).toBe(true);
    expect(read("keep.txt")).toBe("a\nb\n");
    expect(read("other.txt")).toBe("y\n");
  });

  it("reports a git failure instead of throwing, with the checkout unchanged", async () => {
    const { r, base } = repoWithRun();
    const result = await applyToCheckout(r.dir, base, "shadow/run/no-such-branch");
    expect(result.applied).toBe(false);
    expect(!result.applied && result.reason).toMatch(/no-such-branch/);
    expect(r.git("status", "--porcelain")).toBe("");
  });

  it("includes ignored additions in git diff as intent-to-add", async () => {
    const r = makeRepo({ ".gitignore": "generated.txt\n", "keep.txt": "a\n" });
    repos.push(r);
    const base = r.git("rev-parse", "HEAD");
    r.git("checkout", "-q", "-b", BRANCH);
    r.write("generated.txt", "from the run\n");
    r.git("add", "-f", "--", "generated.txt");
    r.git("commit", "-q", "-m", "run");
    r.git("checkout", "-q", "main");
    expect((await applyToCheckout(r.dir, base, BRANCH)).applied).toBe(true);
    expect(r.git("diff", "--name-status")).toBe("A\tgenerated.txt");
    expect(r.git("diff", "--cached", "--name-only")).toBe("");
  });

  it("changes no files when the index cannot be locked", async () => {
    const { r, base, read, has } = repoWithRun();
    writeFileSync(join(r.dir, ".git", "index.lock"), "owner's lock");
    const result = await applyToCheckout(r.dir, base, BRANCH);
    expect(result.applied).toBe(false);
    expect(!result.applied && result.reason).toContain("index.lock");
    expect(read("keep.txt")).toBe("a\n");
    expect(has("old.txt")).toBe(true);
    expect(has("dir/hello.txt")).toBe(false);
    expect(r.git("status", "--porcelain")).toBe("");
  });

  it("prints an undo command that puts the checkout back exactly", async () => {
    const { r, base, read } = repoWithRun();
    r.write("notes.txt", "untracked\n");
    const result = await applyToCheckout(r.dir, base, BRANCH);
    const undo = renderApply(result, BRANCH).split("\n").find((l) => l.includes("Undo it:"))!.split("Undo it:")[1]!.trim();
    expect(undo).toBe("git --literal-pathspecs restore --source=HEAD --staged --worktree -- dir/hello.txt keep.txt old.txt");
    r.git(...undo.split(" ").slice(1));
    expect(r.git("status", "--porcelain")).toBe("?? notes.txt");
    expect(read("keep.txt")).toBe("a\n");
    expect(read("old.txt")).toBe("gone\n");
  });

  it.each(["cost$price`'[1].txt", "@price.txt"])("runs the printed undo for %s without expanding filenames or pathspecs", async (literal) => {
    const matched = "cost$price`'1.txt";
    const r = makeRepo({ [literal]: "before\n", [matched]: "owner original\n" });
    repos.push(r);
    const base = r.git("rev-parse", "HEAD");
    r.git("checkout", "-q", "-b", BRANCH);
    r.write(literal, "after\n");
    r.git("commit", "-q", "-am", "run");
    r.git("checkout", "-q", "main");
    r.write(matched, "owner local edit\n");
    const result = await applyToCheckout(r.dir, base, BRANCH);
    expect(result.applied).toBe(true);
    const undo = renderApply(result, BRANCH).split("\n").find((l) => l.includes("Undo it:"))!.split("Undo it:")[1]!.trim();
    execFileSync(process.platform === "win32" ? "powershell.exe" : "sh", process.platform === "win32" ? ["-NoProfile", "-Command", undo] : ["-c", undo], { cwd: r.dir });
    expect(readFileSync(join(r.dir, literal), "utf8")).toBe("before\n");
    expect(readFileSync(join(r.dir, matched), "utf8")).toBe("owner local edit\n");
  });
});

describe("what the report says", () => {
  it("lists the files and how to review, keep and undo them, with the branch as a backup", () => {
    const text = renderApply({ applied: true, files: [{ change: "A", path: "hello.txt" }, { change: "M", path: "src/my file.ts" }] }, BRANCH, "posix");
    expect(text.split("\n")).toEqual([
      "Applied to your folder (not committed):",
      "  A  hello.txt",
      "  M  src/my file.ts",
      "  Review it:   git diff",
      "  Keep it:     git --literal-pathspecs add -- hello.txt 'src/my file.ts' && git commit",
      "  Undo it:     git --literal-pathspecs restore --source=HEAD --staged --worktree -- hello.txt 'src/my file.ts'",
      `  Backup:      ${BRANCH}`,
    ]);
  });

  it("says why nothing was applied and where the work is", () => {
    expect(renderApply({ applied: false, reason: "you have uncommitted changes to files the run also changed", clashes: ["keep.txt"] }, BRANCH).split("\n")).toEqual([
      "Not applied to your folder: you have uncommitted changes to files the run also changed.",
      "  keep.txt",
      `Your folder is unchanged; the work is on ${BRANCH}.`,
    ]);
    expect(renderApply({ applied: true, files: [] }, BRANCH)).toBe("Nothing to apply to your folder.");
  });
});
