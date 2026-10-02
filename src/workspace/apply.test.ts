import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyToCheckout, renderApply } from "./apply.js";
import { snapshotFolder } from "./snapshot.js";
import { makeRepo } from "./testRepo.testutil.js";

vi.setConfig({ testTimeout: 60_000 });

const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

const BRANCH = "shadow/run/test";
const ID = "20261002T182110Z-510b";

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

/** `git status --porcelain` as lines; the shared helper trims, which would eat a leading space. */
const statusLines = (dir: string) =>
  execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: dir, encoding: "utf8" }).split("\n").filter(Boolean);

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

  it("changes nothing when the owner changed a file the run also changed, after the run started", async () => {
    const { r, base, read, has } = repoWithRun();
    r.write("keep.txt", "my edit\n");
    r.write("dir/hello.txt", "my own hello\n");
    const result = await applyToCheckout(r.dir, base, BRANCH);
    expect(result).toEqual({
      applied: false,
      reason: "your folder changed, since the run started, in files the run also changed",
      clashes: ["dir/hello.txt", "keep.txt"],
    });
    expect(read("keep.txt")).toBe("my edit\n");
    expect(read("dir/hello.txt")).toBe("my own hello\n");
    expect(has("old.txt")).toBe(true);
  });

  it("counts a file the owner changed and committed since the run started as a change", async () => {
    const { r, base, read, has } = repoWithRun();
    r.write("keep.txt", "z\n");
    r.git("commit", "-q", "-am", "the owner changed keep.txt meanwhile");
    expect(await applyToCheckout(r.dir, base, BRANCH)).toMatchObject({ applied: false, clashes: ["keep.txt"] });
    expect(read("keep.txt")).toBe("z\n");
    expect(r.git("status", "--porcelain")).toBe("");
    expect(has("dir/hello.txt")).toBe(false);
  });

  // Symlinks need special rights on Windows; git's refusal to write through one is the same everywhere.
  it.skipIf(process.platform === "win32")("changes nothing when an ignored symlink the owner made sits in the way of a new file", async () => {
    // The run adds link/new.txt, but meanwhile the owner made `link` a symlink to some other folder.
    const r = makeRepo({ ".gitignore": "link\n", "keep.txt": "a\n" });
    repos.push(r);
    const base = r.git("rev-parse", "HEAD");
    r.branchFrom(base, BRANCH, { "link/new.txt": "from the run\n" });
    const elsewhere = mkdtempSync(join(tmpdir(), "shadow-elsewhere-"));
    symlinkSync(elsewhere, join(r.dir, "link"));
    try {
      expect((await applyToCheckout(r.dir, base, BRANCH)).applied).toBe(false);
      expect(existsSync(join(elsewhere, "new.txt"))).toBe(false);
      expect(r.git("status", "--porcelain")).toBe("");
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
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

  it.each(["cost$price`'[1].txt", "@price.txt"])("prints a keep command that stages %s literally, without expanding filenames or pathspecs", async (literal) => {
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
    const keepLine = renderApply(result, BRANCH, ID).split("\n").find((l) => l.includes("Keep it:"))!.split("Keep it:")[1]!.trim();
    const stage = keepLine.split(/ && git commit|; if \(\$\?\) \{ git commit \}/)[0]!; // everything but the commit
    execFileSync(process.platform === "win32" ? "powershell.exe" : "sh", process.platform === "win32" ? ["-NoProfile", "-Command", stage] : ["-c", stage], { cwd: r.dir });
    expect(r.git("diff", "--cached", "--name-only")).toBe(literal);
    expect(readFileSync(join(r.dir, matched), "utf8")).toBe("owner local edit\n");
  });
});

describe("changed since the run started", () => {
  /** The owner has uncommitted work; the run starts from a snapshot of it and changes keep.txt, old.txt and adds hello.txt. */
  async function runFromDirtyFolder() {
    const r = makeRepo({ "keep.txt": "a\n", "old.txt": "gone\n", "other.txt": "x\n", ".gitignore": "ignored.txt\n" });
    repos.push(r);
    r.write("keep.txt", "a\nmine\n");
    r.write("notes.txt", "untracked\n");
    const base = await snapshotFolder(r.dir);
    r.branchFrom(base, BRANCH, { "keep.txt": "a\nmine\nrun\n", "old.txt": null, "hello.txt": "hi\n" });
    return { r, base };
  }

  it("does not count uncommitted work the run started from, so the run applies on top of it", async () => {
    const { r, base } = await runFromDirtyFolder();
    const head = r.git("rev-parse", "HEAD");
    const result = await applyToCheckout(r.dir, base, BRANCH);
    expect(result).toMatchObject({ applied: true });
    expect(readFileSync(join(r.dir, "keep.txt"), "utf8")).toBe("a\nmine\nrun\n");
    expect(existsSync(join(r.dir, "old.txt"))).toBe(false);
    expect(readFileSync(join(r.dir, "notes.txt"), "utf8")).toBe("untracked\n");
    expect(r.git("rev-parse", "HEAD")).toBe(head);
    expect(r.git("diff", "--cached", "--name-only")).toBe("");
  });

  it("counts an edit made after the run started", async () => {
    const { r, base } = await runFromDirtyFolder();
    r.write("keep.txt", "a\nmine\nand more of mine\n");
    const result = await applyToCheckout(r.dir, base, BRANCH);
    expect(result).toEqual({ applied: false, reason: expect.stringContaining("changed, since the run started"), clashes: ["keep.txt"] });
    expect(readFileSync(join(r.dir, "keep.txt"), "utf8")).toBe("a\nmine\nand more of mine\n");
    expect(existsSync(join(r.dir, "hello.txt"))).toBe(false);
  });

  it("counts a file the run adds that the owner also created since, even an ignored one", async () => {
    const { r, base } = await runFromDirtyFolder();
    r.write("hello.txt", "mine\n");
    expect(await applyToCheckout(r.dir, base, BRANCH)).toMatchObject({ applied: false, clashes: ["hello.txt"] });
    rmSync(join(r.dir, "hello.txt"));

    const ignored = makeRepo({ ".gitignore": "ignored.txt\n", "a.txt": "a\n" });
    repos.push(ignored);
    const ignoredBase = await snapshotFolder(ignored.dir);
    ignored.branchFrom(ignoredBase, BRANCH, { "ignored.txt": "from the run\n" });
    ignored.write("ignored.txt", "already here\n"); // git status never lists this
    expect(await applyToCheckout(ignored.dir, ignoredBase, BRANCH)).toMatchObject({ applied: false, clashes: ["ignored.txt"] });
  });

  it("counts a file the run deletes that the owner edited or removed since", async () => {
    const { r, base } = await runFromDirtyFolder();
    r.write("old.txt", "edited meanwhile\n");
    expect(await applyToCheckout(r.dir, base, BRANCH)).toMatchObject({ applied: false, clashes: ["old.txt"] });
    rmSync(join(r.dir, "old.txt")); // gone from the folder, though the run started with it
    expect(await applyToCheckout(r.dir, base, BRANCH)).toMatchObject({ applied: false, clashes: ["old.txt"] });
  });

  it("ignores edits to files the run did not touch", async () => {
    const { r, base } = await runFromDirtyFolder();
    r.write("other.txt", "edited during the run\n");
    r.write("another.txt", "created during the run\n");
    expect(await applyToCheckout(r.dir, base, BRANCH)).toMatchObject({ applied: true });
  });
});

describe("runs applied one after another", () => {
  /** Apply a run, as the folder is right now: snapshot it, make the run's branch, apply it. */
  async function nextRun(r: ReturnType<typeof makeRepo>, branch: string, changes: Record<string, string | null>) {
    const base = await snapshotFolder(r.dir);
    r.branchFrom(base, branch, changes);
    return applyToCheckout(r.dir, base, branch);
  }

  it("lets a second run change the first run's uncommitted file, which stays intent-to-add", async () => {
    const r = makeRepo({ "keep.txt": "a\n" });
    repos.push(r);
    expect(await nextRun(r, "shadow/run/1", { "bye.txt": "bye\n" })).toMatchObject({ applied: true });
    expect(await nextRun(r, "shadow/run/2", { "bye.txt": "goodbye forever\n" })).toEqual({ applied: true, files: [{ change: "M", path: "bye.txt" }] });
    expect(readFileSync(join(r.dir, "bye.txt"), "utf8")).toBe("goodbye forever\n");
    expect(statusLines(r.dir)).toEqual([" A bye.txt"]);
    expect(r.git("diff", "--cached", "--name-only")).toBe("");
  });

  it("leaves no ghost entry when a later run deletes a file an earlier run added", async () => {
    const r = makeRepo({ "keep.txt": "a\n" });
    repos.push(r);
    await nextRun(r, "shadow/run/1", { "bye.txt": "bye\n", "extra.txt": "e\n" });
    expect(statusLines(r.dir)).toEqual([" A bye.txt", " A extra.txt"]);
    expect(await nextRun(r, "shadow/run/2", { "bye.txt": null })).toEqual({ applied: true, files: [{ change: "D", path: "bye.txt" }] });
    expect(existsSync(join(r.dir, "bye.txt"))).toBe(false);
    expect(statusLines(r.dir)).toEqual([" A extra.txt"]); // bye.txt is gone from status altogether, not " D"
    expect(r.git("ls-files")).toBe("extra.txt\nkeep.txt");
  });

  it("keeps a tracked file's own index entry when a later run adds it back after an earlier run deleted it", async () => {
    const r = makeRepo({ "keep.txt": "a\n", "old.txt": "gone\n" });
    repos.push(r);
    await nextRun(r, "shadow/run/1", { "old.txt": null });
    expect(statusLines(r.dir)).toEqual([" D old.txt"]);
    expect(await nextRun(r, "shadow/run/2", { "old.txt": "back, but different\n" })).toEqual({ applied: true, files: [{ change: "A", path: "old.txt" }] });
    expect(readFileSync(join(r.dir, "old.txt"), "utf8")).toBe("back, but different\n");
    expect(statusLines(r.dir)).toEqual([" M old.txt"]); // an edit of a tracked file, not a second addition
  });

  it("does not touch an index entry the owner staged for a file a later run deletes", async () => {
    const r = makeRepo({ "keep.txt": "a\n" });
    repos.push(r);
    await nextRun(r, "shadow/run/1", { "bye.txt": "bye\n" });
    r.git("add", "bye.txt"); // the owner keeps it: now a real staged addition
    await nextRun(r, "shadow/run/2", { "bye.txt": null });
    expect(statusLines(r.dir)).toEqual(["AD bye.txt"]);
  });
});

describe("what the report says", () => {
  it("lists the files and how to review, keep and undo them, with the branch as a backup", () => {
    const text = renderApply({ applied: true, files: [{ change: "A", path: "hello.txt" }, { change: "M", path: "src/my file.ts" }] }, BRANCH, ID, "posix");
    expect(text.split("\n")).toEqual([
      "Applied to your folder (not committed):",
      "  A  hello.txt",
      "  M  src/my file.ts",
      "  Review it:   git diff",
      "  Keep it:     git --literal-pathspecs add -- hello.txt 'src/my file.ts' && git commit",
      `  Undo it:     sa undo ${ID}`,
      `  Backup:      ${BRANCH}`,
    ]);
  });

  it("names a summon by its branch and quotes an id the shell would mangle", () => {
    expect(renderApply({ applied: true, files: [{ change: "A", path: "a.txt" }] }, "shadow/grok/20261002T1-ab12", "shadow/grok/20261002T1-ab12", "posix")).toContain(
      "  Undo it:     sa undo shadow/grok/20261002T1-ab12\n",
    );
    expect(renderApply({ applied: true, files: [{ change: "A", path: "a.txt" }] }, BRANCH, "odd id", "powershell")).toContain("  Undo it:     sa undo 'odd id'\n");
  });

  it("says why nothing was applied and where the work is", () => {
    expect(renderApply({ applied: false, reason: "your folder changed, since the run started, in files the run also changed", clashes: ["keep.txt"] }, BRANCH, ID).split("\n")).toEqual([
      "Not applied to your folder: your folder changed, since the run started, in files the run also changed.",
      "  keep.txt",
      `Your folder is unchanged; the work is on ${BRANCH}.`,
    ]);
    expect(renderApply({ applied: true, files: [] }, BRANCH, ID)).toBe("Nothing to apply to your folder.");
  });
});
