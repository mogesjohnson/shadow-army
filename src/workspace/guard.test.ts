import { afterEach, describe, expect, it, vi } from "vitest";
import { captureState, diffState } from "./guard.js";
import { makeRepo } from "./testRepo.testutil.js";

vi.setConfig({ testTimeout: 60_000 });

const repos: ReturnType<typeof makeRepo>[] = [];
afterEach(() => {
  while (repos.length) repos.pop()!.cleanup();
});
const repo = () => {
  const r = makeRepo({ "README.md": "hello\n", "src/a.ts": "a\n" });
  repos.push(r);
  return r;
};

async function changesWhile(r: ReturnType<typeof repo>, act: () => void): Promise<string[]> {
  const before = await captureState(r.dir);
  act();
  return diffState(before, await captureState(r.dir));
}

describe("checkout guard", () => {
  it("reports nothing when nothing changed", async () => {
    const r = repo();
    r.write("src/a.ts", "already dirty\n");
    expect(await changesWhile(r, () => {})).toEqual([]);
  });

  it("catches a file changed, created or deleted in the checkout", async () => {
    const r = repo();
    expect(await changesWhile(r, () => r.write("README.md", "changed\n"))).toEqual(["files in your checkout changed: README.md"]);
    expect(await changesWhile(r, () => r.write("new.txt", "x\n"))).toEqual(["files in your checkout changed: new.txt"]);
  });

  it("catches a further edit to a file that was already modified (same status line)", async () => {
    const r = repo();
    r.write("src/a.ts", "my uncommitted work\n");
    expect(await changesWhile(r, () => r.write("src/a.ts", "overwritten by a soldier\n"))).toEqual([
      "files in your checkout changed: src/a.ts",
    ]);
  });

  it("catches commits, branch switches, tags and moved or deleted branches", async () => {
    const r = repo();
    r.git("branch", "other");
    expect(await changesWhile(r, () => r.git("commit", "-q", "--allow-empty", "-m", "sneaky"))).toEqual([
      expect.stringMatching(/^main moved from [0-9a-f]{7} to [0-9a-f]{7}$/),
      "refs/heads/main moved",
    ]);
    expect(await changesWhile(r, () => r.git("checkout", "-q", "other"))).toEqual(["your checkout switched from main to other"]);
    expect(await changesWhile(r, () => r.git("tag", "v9"))).toEqual(["refs/tags/v9 was created"]);
    expect(await changesWhile(r, () => r.git("branch", "-D", "main"))).toEqual(["refs/heads/main was deleted"]);
  });

  it("ignores Shadow Army's own shadow/* branches, which change during a run by design", async () => {
    const r = repo();
    expect(await changesWhile(r, () => r.git("branch", "shadow/grok/t1"))).toEqual([]);
  });
});
