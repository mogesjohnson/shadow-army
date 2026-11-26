import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { validateSnapshotRoot } from "./snapshot.js";
import { platformInspect, readAcls, windowsInspector, type AclFolder, type AclReader } from "./winAcl.js";
import { windowsOnly } from "./windowsOnly.testutil.js";

const USER = "S-1-5-21-1-2-3-1001", OTHER = "S-1-5-21-1-2-3-1002", AUTHENTICATED = "S-1-5-11";
const home = realpathSync(mkdtempSync(join(tmpdir(), "sa-acl-home-")));
const folder = realpathSync(mkdtempSync(join(tmpdir(), "sa-acl-folder-")));
const root = join(home, "snaps");
mkdirSync(root);
afterAll(() => { rmSync(home, { recursive: true, force: true }); rmSync(folder, { recursive: true, force: true }); });

/** Every folder clean and the user's own, except what `change` says for a path. */
const reader = (change: (path: string) => Partial<AclFolder> = () => ({})): AclReader => (paths) =>
  ({ user: USER, folders: paths.map((path) => ({ path, owner: USER, rules: [{ sid: USER, allow: true, rights: 0x1f01ff, inheritOnly: false }], ...change(path) })) });
const check = (read: AclReader) => validateSnapshotRoot(root, { home, folder, workTrees: [folder], inspect: windowsInspector(read), exists: () => false });

describe("Windows snapshot root owner and ACL (review 15 C2, WSP-11)", () => {
  it("refuses a root whose owner can't be read, or is another user", () => {
    const failing: AclReader = () => { throw new Error("Get-Acl failed"); };
    expect(check(failing)).toEqual({ ok: false, reason: expect.stringMatching(/owner and permissions can't be checked: Get-Acl failed/) });
    expect(check(() => ({ user: "", folders: [] })).ok).toBe(false);
    expect(check(reader((path) => (path === home ? { owner: OTHER } : {})))).toEqual({ ok: false, reason: expect.stringContaining(`${home}, which another user owns`) });
  });

  it("refuses an ACL that lets another user replace a folder, or add to the root", () => {
    const grant = (at: string, rights: number) => reader((path) => (path === at ? { rules: [{ sid: AUTHENTICATED, allow: true, rights, inheritOnly: false }] } : {}));
    expect(check(grant(home, 0x10000)).ok).toBe(false); // Delete on a folder above
    expect(check(grant(home, 0x40000)).ok).toBe(false); // WriteDAC
    expect(check(grant(root, 0x4)).ok).toBe(false); // AppendData on the root itself
    expect(check(grant(root, 0x40000000)).ok).toBe(false); // GenericWrite on the root
  });

  it("accepts a clean root, adding rights above it (C:\\'s own), denials and inherit-only rules", () => {
    expect(check(reader())).toEqual({ ok: true, root });
    expect(check(reader((path) => (path === home ? { rules: [{ sid: AUTHENTICATED, allow: true, rights: 0x4, inheritOnly: false }] } : {}))).ok).toBe(true);
    expect(check(reader(() => ({ rules: [{ sid: AUTHENTICATED, allow: false, rights: 0x1f01ff, inheritOnly: false }, { sid: AUTHENTICATED, allow: true, rights: 0xe0010000, inheritOnly: true }] }))).ok).toBe(true);
    expect(check(reader(() => ({ owner: "S-1-5-18" })))).toEqual({ ok: true, root });
  });

  it("reads every folder up the chain in one call, and fails closed for one it did not read", () => {
    let calls = 0;
    const inspect = windowsInspector((paths) => { calls++; return reader()(paths.slice(0, 1)); });
    expect(inspect(root)).toEqual({ owner: "owner", writableByOthers: false });
    expect(() => inspect(home)).toThrow(`the owner and permissions of ${home} were not read`);
    expect(calls).toBe(1);
  });

  it("uses the ACL check on Windows, never a fixed answer", () => {
    expect(() => platformInspect("win32", () => { throw new Error("unavailable"); })(root)).toThrow("unavailable");
  });

  windowsOnly("reads this machine's real owner and ACL for a fresh folder under home with Get-Acl", () => {
    const fresh = mkdtempSync(join(homedir(), ".sa-test-acl-"));
    try {
      const read = readAcls([fresh]);
      expect(read.user).toMatch(/^S-1-5-/);
      expect(windowsInspector()(fresh)).toEqual({ owner: "owner", writableByOthers: false });
    } finally { rmSync(fresh, { recursive: true, force: true }); }
  }, 30_000);
});
