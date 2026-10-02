import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitError } from "./git.js";
import { changedSince, snapshotFolder } from "./snapshot.js";
import { makeRepo } from "./testRepo.testutil.js";

vi.setConfig({ testTimeout: 60_000 });

const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});

function repo(files?: Record<string, string>) {
  const r = makeRepo(files ?? { ".gitignore": "ignored.txt\nbuild/\n", "README.md": "hello\n", "src/a.txt": "a\n", "src/b.txt": "b\n" });
  repos.push(r);
  return r;
}

/** Everything the snapshot must leave alone: HEAD, the branch, the refs, the index entries and the status. */
function untouched(r: ReturnType<typeof makeRepo>) {
  return {
    head: r.git("rev-parse", "HEAD"),
    branch: r.git("branch", "--show-current"),
    refs: r.git("for-each-ref"),
    entries: r.git("ls-files", "--stage"),
    status: r.git("status", "--porcelain=v1", "--untracked-files=all", "--ignored"),
  };
}

const indexFile = (r: ReturnType<typeof makeRepo>) => readFileSync(join(r.dir, ".git", "index")).toString("hex");

describe("snapshotFolder", () => {
  it("is HEAD itself when the folder is clean", async () => {
    const r = repo();
    expect(await snapshotFolder(r.dir)).toBe(r.git("rev-parse", "HEAD"));
    // Ignored files are not changes either.
    r.write("ignored.txt", "x\n");
    r.write("build/out.js", "x\n");
    expect(await snapshotFolder(r.dir)).toBe(r.git("rev-parse", "HEAD"));
  });

  it("holds uncommitted edits, deletions and untracked files, and leaves ignored files out", async () => {
    const r = repo();
    r.write("src/a.txt", "edited\n");
    rmSync(join(r.dir, "README.md"));
    r.write("notes/new.txt", "untracked\n");
    r.write("ignored.txt", "ignored\n");
    r.write("build/out.js", "ignored\n");
    const head = r.git("rev-parse", "HEAD");

    const sha = await snapshotFolder(r.dir);
    expect(sha).not.toBe(head);
    expect(r.git("rev-parse", `${sha}^`)).toBe(head);
    expect(r.git("log", "-1", "--format=%s", sha)).toBe("shadow: snapshot of the working folder");
    expect(r.git("ls-tree", "-r", "--name-only", sha).split("\n")).toEqual([".gitignore", "notes/new.txt", "src/a.txt", "src/b.txt"]);
    expect(r.git("show", `${sha}:src/a.txt`)).toBe("edited");
    expect(r.git("show", `${sha}:src/b.txt`)).toBe("b");
    expect(r.git("show", `${sha}:notes/new.txt`)).toBe("untracked");
  });

  it("changes nothing in the folder, the index (intent-to-add entries included), HEAD or the branches", async () => {
    const r = repo();
    r.write("src/a.txt", "edited\n");
    r.write("src/b.txt", "staged edit\n");
    r.git("add", "src/b.txt");
    r.write("added.txt", "marked for adding\n");
    r.git("add", "--intent-to-add", "added.txt");
    r.write("loose.txt", "untracked\n");
    const files = ["src/a.txt", "src/b.txt", "added.txt", "loose.txt", "README.md"];
    const before = { ...untouched(r), files: files.map((f) => readFileSync(join(r.dir, f), "utf8")) };
    expect(before.status).toContain("A added.txt"); // intent-to-add (the helper trims the leading space)

    // The index file itself is not rewritten either (read straight around the call, so nothing else can have).
    const indexBefore = indexFile(r);
    const sha = await snapshotFolder(r.dir);
    expect(indexFile(r)).toBe(indexBefore);
    expect(r.git("show", `${sha}:added.txt`)).toBe("marked for adding");
    expect(r.git("show", `${sha}:src/b.txt`)).toBe("staged edit");

    expect({ ...untouched(r), files: files.map((f) => readFileSync(join(r.dir, f), "utf8")) }).toEqual(before);
  });

  it("works while the owner's index is locked, since it never writes the real one", async () => {
    const r = repo();
    r.write("src/a.txt", "edited\n");
    writeFileSync(join(r.dir, ".git", "index.lock"), "the owner is in the middle of a git command");
    const sha = await snapshotFolder(r.dir);
    expect(r.git("show", `${sha}:src/a.txt`)).toBe("edited");
    expect(existsSync(join(r.dir, ".git", "index.lock"))).toBe(true);
  });

  it("is HEAD when git calls the folder dirty but nothing differs in content", async () => {
    const r = repo();
    r.git("rm", "--cached", "-q", "src/a.txt"); // staged removal; the file is still there, untracked
    expect(r.git("status", "--porcelain")).not.toBe("");
    expect(await snapshotFolder(r.dir)).toBe(r.git("rev-parse", "HEAD"));
  });

  it("leaves Shadow Army's own folder out even when nothing ignores it", async () => {
    const r = repo();
    r.write(".shadow/applied.jsonl", "{}\n");
    r.write("src/a.txt", "edited\n");
    const sha = await snapshotFolder(r.dir);
    expect(r.git("ls-tree", "-r", "--name-only", sha)).not.toContain(".shadow");
    r.git("checkout", "-q", "--", "src/a.txt");
    expect(await snapshotFolder(r.dir)).toBe(r.git("rev-parse", "HEAD")); // only .shadow differs
  });

  it("stores line endings the way a commit would, so a CRLF folder is not a change by itself", async () => {
    const r = repo({ "a.txt": "one\ntwo\n" });
    r.git("config", "core.autocrlf", "true");
    r.write("a.txt", "one\r\ntwo\r\n");
    expect(await snapshotFolder(r.dir)).toBe(r.git("rev-parse", "HEAD"));
    r.write("a.txt", "one\r\ntwo\r\nthree\r\n");
    const sha = await snapshotFolder(r.dir);
    expect(readFileSync(join(r.dir, "a.txt"), "utf8")).toBe("one\r\ntwo\r\nthree\r\n");
    expect(r.git("cat-file", "blob", `${sha}:a.txt`)).toBe("one\ntwo\nthree");
  });

  it("gives a clear error for a repository with no commits", async () => {
    const r = repo();
    r.git("checkout", "-q", "--orphan", "empty");
    r.git("rm", "-rfq", ".");
    await expect(snapshotFolder(r.dir)).rejects.toBeInstanceOf(GitError);
    await expect(snapshotFolder(r.dir)).rejects.toThrow(/no commits yet/);
  });
});

describe("changedSince", () => {
  it("lists only the paths whose content differs from the ref, one-sided paths included", async () => {
    const r = repo();
    r.write("src/a.txt", "edited\n"); // differs
    rmSync(join(r.dir, "src/b.txt")); // in the ref, gone from the folder
    r.write("new.txt", "new\n"); // in the folder, not in the ref
    r.write("README.md", "hello\n"); // rewritten with the same content
    const head = r.git("rev-parse", "HEAD");
    const asked = ["src/a.txt", "src/b.txt", "new.txt", "README.md", "never-existed.txt"];
    const index = readFileSync(join(r.dir, ".git", "index")).toString("hex");
    expect(await changedSince(r.dir, head, asked)).toEqual(["new.txt", "src/a.txt", "src/b.txt"]);
    expect(await changedSince(r.dir, head, [])).toEqual([]);
    expect(readFileSync(join(r.dir, ".git", "index")).toString("hex")).toBe(index);
  });

  it("sees ignored files, which a status listing never shows", async () => {
    const r = repo();
    r.write("ignored.txt", "x\n");
    expect(await changedSince(r.dir, r.git("rev-parse", "HEAD"), ["ignored.txt"])).toEqual(["ignored.txt"]);
  });
});
