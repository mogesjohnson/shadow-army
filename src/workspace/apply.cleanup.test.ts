import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyToCheckout, renderApply } from "./apply.js";
import { makeRepo } from "./testRepo.testutil.js";

vi.setConfig({ testTimeout: 60_000 });

// The patch folders the mocked removal refused; teardown removes them with the real rmSync (#94 C18).
const patchDirs = vi.hoisted(() => [] as string[]);

// #94 C14: removing the temporary patch fails, as when antivirus or another process holds it open on Windows.
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, rm: async (path: string) => { patchDirs.push(path); throw new Error("EBUSY: resource busy or locked"); } };
});

const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
  while (patchDirs.length) rmSync(patchDirs.pop()!, { recursive: true, force: true });
});

describe("#94 C14: when the temporary patch cannot be removed", () => {
  it("still reports the applied files, with the cleanup failure as a separate warning", async () => {
    const r = makeRepo({ "keep.txt": "a\n" });
    repos.push(r);
    const base = r.git("rev-parse", "HEAD");
    r.git("checkout", "-q", "-b", "shadow/run/test");
    r.write("keep.txt", "a\nb\n");
    r.write("hello.txt", "hi\n");
    r.git("add", "-A");
    r.git("commit", "-q", "-m", "run");
    r.git("checkout", "-q", "main");

    const result = await applyToCheckout(r.dir, base, "shadow/run/test");

    expect(result).toMatchObject({ applied: true, files: [{ change: "A", path: "hello.txt" }, { change: "M", path: "keep.txt" }] });
    expect(result.cleanup).toContain("EBUSY");
    expect(readFileSync(join(r.dir, "keep.txt"), "utf8")).toBe("a\nb\n");
    const text = renderApply(result, "shadow/run/test");
    expect(text).toContain("Applied to your folder");
    expect(text).toContain("EBUSY");
  });

  it("keeps a refusal's reason too, so nothing reads as applied", async () => {
    const r = makeRepo({ "keep.txt": "a\n" });
    repos.push(r);
    const base = r.git("rev-parse", "HEAD");
    r.git("checkout", "-q", "-b", "shadow/run/test");
    r.write("keep.txt", "b\n");
    r.git("commit", "-q", "-am", "run");
    r.git("checkout", "-q", "main");
    r.write("keep.txt", "owner\n");

    const result = await applyToCheckout(r.dir, base, "shadow/run/test");

    expect(result).toMatchObject({ applied: false, clashes: ["keep.txt"] });
    expect(result.cleanup).toContain("EBUSY");
  });
});
