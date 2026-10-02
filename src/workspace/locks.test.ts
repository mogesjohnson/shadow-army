import { existsSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockConflict, Locks } from "./locks.js";

vi.setConfig({ testTimeout: 30_000 });

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "shadow-locks-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const leaseFiles = () => {
  try {
    return readdirSync(join(root, "locks", "leases")).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
};

describe("acquire and release", () => {
  it("grants non-overlapping claims and refuses overlapping ones, naming the holder", async () => {
    const locks = new Locks(root);
    const a = await locks.acquire({ owner: "grok", claims: ["src/auth/**"] });
    await locks.acquire({ owner: "codex-sol", claims: ["src/billing/**"] });
    const err = await locks.acquire({ owner: "claude-sonnet", claims: ["src/**"] }).catch((e) => e);
    expect(err).toBeInstanceOf(LockConflict);
    expect((err as LockConflict).holder.owner).toBe("grok");
    expect((err as Error).message).toMatch(/grok's lease on src\/auth\/\*\*/);

    await locks.release(a.id);
    await locks.acquire({ owner: "claude-sonnet", claims: ["src/auth/x.ts"] });
    expect((await locks.list()).map((l) => l.owner)).toEqual(["codex-sol", "claude-sonnet"]);
  });

  it("refuses an owner name that could escape the registry", async () => {
    await expect(new Locks(root).acquire({ owner: "../x", claims: ["a"] })).rejects.toThrow(/invalid/);
  });

  it("frees every lease of one owner", async () => {
    const locks = new Locks(root);
    await locks.acquire({ owner: "grok", claims: ["a/**"] });
    await locks.acquire({ owner: "grok", claims: ["b/**"] });
    await locks.acquire({ owner: "agy", claims: ["c/**"] });
    expect(await locks.releaseOwner("grok")).toBe(2);
    expect((await locks.list()).map((l) => l.owner)).toEqual(["agy"]);
  });
});

describe("expiry and renewal", () => {
  it("lets an unrenewed lease expire, so a crashed soldier cannot hold files forever", async () => {
    let t = 1_000_000;
    const locks = new Locks(root, () => t);
    await locks.acquire({ owner: "grok", claims: ["src/**"], ttlMs: 1_000 });
    await expect(locks.acquire({ owner: "codex-sol", claims: ["src/**"] })).rejects.toBeInstanceOf(LockConflict);
    t += 2_000;
    await locks.acquire({ owner: "codex-sol", claims: ["src/**"] });
    expect((await locks.list()).map((l) => l.owner)).toEqual(["codex-sol"]);
    expect(leaseFiles()).toHaveLength(1); // the expired file was pruned
  });

  it("renews a live lease, and reports a lost one", async () => {
    let t = 1_000_000;
    const locks = new Locks(root, () => t);
    const a = await locks.acquire({ owner: "grok", claims: ["src/**"], ttlMs: 1_000 });
    t += 900;
    expect(await locks.renew(a.id, 1_000)).toBe(true);
    t += 900; // past the original expiry, within the renewed one
    await expect(locks.acquire({ owner: "codex-sol", claims: ["src/**"] })).rejects.toBeInstanceOf(LockConflict);
    t += 5_000;
    expect(await locks.renew(a.id)).toBe(false); // expired: the files may have changed hands
    await locks.release(a.id);
    expect(await locks.renew(a.id)).toBe(false); // released
  });

  // The release-during-renewal race has its own deterministic test in locks.race.test.ts.
});

describe("contention", () => {
  it("grants overlapping claims to exactly one of many simultaneous callers", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => new Locks(root).acquire({ owner: `s${i}`, claims: ["src/**"] })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof LockConflict)).toBe(true);
    expect(leaseFiles()).toHaveLength(1);
  });

  it("queues for a held lease when asked to wait, and fails at once when not", async () => {
    const locks = new Locks(root);
    const held = await locks.acquire({ owner: "grok", claims: ["src/**"] });
    await expect(locks.acquire({ owner: "codex-sol", claims: ["src/**"], waitMs: 0 })).rejects.toBeInstanceOf(LockConflict);
    setTimeout(() => void locks.release(held.id), 300);
    const got = await locks.acquire({ owner: "codex-sol", claims: ["src/**"], waitMs: 5_000, pollMs: 50 });
    expect(got.owner).toBe("codex-sol");
  });

  it("ends a bounded wait even when the lease clock is frozen", async () => {
    const locks = new Locks(root, () => 5_000);
    await locks.acquire({ owner: "grok", claims: ["src/**"], ttlMs: 60_000 });
    const started = Date.now();
    await expect(locks.acquire({ owner: "codex-sol", claims: ["src/**"], waitMs: 300, pollMs: 50 })).rejects.toBeInstanceOf(LockConflict);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("steals the registry mutex left behind by a crashed process", async () => {
    await mkdir(join(root, "locks", "leases"), { recursive: true });
    const mutex = join(root, "locks", ".mutex");
    writeFileSync(mutex, "12345");
    const old = new Date(Date.now() - 60_000);
    utimesSync(mutex, old, old);
    await new Locks(root).acquire({ owner: "grok", claims: ["src/**"] });
    expect(existsSync(mutex)).toBe(false);
  });
});
