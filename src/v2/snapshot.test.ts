import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { armyMark, removeInside, snapshotSubfolder, validateSnapshotRoot, within, type FolderFacts } from "./snapshot.js";

const folders: string[] = [];
const temp = () => { const folder = realpathSync(mkdtempSync(join(tmpdir(), "sa-snap-"))); folders.push(folder); return folder; };
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const put = (file: string, text: string) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
const link = (target: string, path: string) => symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
const quiet: (dir: string) => FolderFacts = () => ({ owner: "owner", writableByOthers: false });

describe("the snapshots folder", () => {
  it("marks an army by the first 12 hex digits of its folder's path, lower-cased on Windows", () => {
    expect(armyMark("/work/App")).toMatch(/^[0-9a-f]{12}$/);
    expect(armyMark("C:\\Work\\App", "win32")).toBe(armyMark("c:\\work\\app", "win32"));
    expect(armyMark("/work/App", "linux")).not.toBe(armyMark("/work/app", "linux"));
    expect(snapshotSubfolder("/snaps", "/work/App")).toContain(`App-${armyMark("/work/App")}`);
    expect([within("/a/b", "/a/b/c"), within("/a/b", "/a/bc")]).toEqual([true, false]);
  });

  const files = new Set<string>();
  const setup = () => {
    files.clear();
    const [home, folder, tree, outside] = [temp(), temp(), temp(), temp()];
    return { home, folder, tree, outside, ctx: { home, folder, workTrees: [tree], inspect: quiet, exists: (path: string) => files.has(path) } };
  };
  it("takes the default under the home, and an absolute folder outside the folder and every working tree", () => {
    const s = setup();
    expect(validateSnapshotRoot(undefined, s.ctx)).toEqual({ ok: true, root: join(s.home, ".shadow-army", "snapshots") });
    expect(validateSnapshotRoot(join(s.outside, "snaps"), s.ctx)).toEqual({ ok: true, root: join(s.outside, "snaps") });
  });
  it("refuses a relative path, one inside the folder or a working tree, and a link into either", () => {
    const s = setup();
    const entry = join(s.outside, "entry");
    link(s.folder, entry);
    const reasons = ["snaps", join(s.folder, "snaps"), join(s.tree, "a", "b"), join(entry, "snaps")].map((value) => validateSnapshotRoot(value, s.ctx));
    expect(reasons.map((r) => (r.ok ? "" : r.reason))).toEqual([expect.stringContaining("absolute"), expect.stringContaining("inside the folder"), expect.stringContaining("working tree"), expect.stringContaining("inside the folder")]);
  });
  it("refuses a folder, or a parent, that another user owns or can write", () => {
    const s = setup();
    const root = join(s.outside, "a", "snaps");
    mkdirSync(root, { recursive: true });
    const inspect = (bad: string, facts: FolderFacts) => (dir: string) => (dir === bad ? facts : quiet(dir));
    for (const [bad, facts, word] of [[root, { owner: "owner", writableByOthers: true }, "can write"], [dirname(root), { owner: "owner", writableByOthers: true }, "can write"], [dirname(root), { owner: "other", writableByOthers: false }, "owns"]] as const) {
      const result = validateSnapshotRoot(root, { ...s.ctx, inspect: inspect(bad, facts) });
      expect(result.ok ? "" : result.reason).toContain(word);
    }
  });
  it("refuses a folder under a parent outside the home that holds a CLAUDE.md or a .claude/AGENTS.md, but not one inside the home", () => {
    const s = setup();
    for (const guidance of ["CLAUDE.md", join(".claude", "AGENTS.md")]) {
      const parent = temp();
      files.add(join(parent, guidance));
      const result = validateSnapshotRoot(join(parent, "snaps"), s.ctx);
      expect(result.ok ? "" : result.reason).toContain("above it");
    }
    files.add(join(s.home, "CLAUDE.md"));
    expect(validateSnapshotRoot(join(s.home, "snaps"), s.ctx).ok).toBe(true);
  });
});

describe("removal stays inside the snapshots folder", () => {
  it("refuses a path outside it, the folder itself, and a link, and leaves what they point at", () => {
    const [root, outside] = [temp(), temp()];
    put(join(outside, "keep.txt"), "kept");
    mkdirSync(join(root, "s"), { recursive: true });
    link(outside, join(root, "link"));
    for (const path of [outside, root, join(root, "link"), join(root, "s", "..", "..")]) expect(() => removeInside(root, path)).toThrow(/refusing/);
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("kept");
  });
  it("deletes a snapshot holding a link to an outside folder without following it, and a missing one is no error", () => {
    const [root, outside] = [temp(), temp()];
    put(join(outside, "keep.txt"), "kept");
    put(join(root, "s", "file.txt"), "x");
    link(outside, join(root, "s", "escape"));
    removeInside(root, join(root, "s"));
    expect(existsSync(join(root, "s"))).toBe(false);
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("kept");
    expect(() => removeInside(root, join(root, "s"))).not.toThrow();
  });
});
