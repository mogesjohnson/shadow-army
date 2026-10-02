import { randomBytes } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertSafe } from "../vault/vault.js";
import { claimsOverlap } from "./claims.js";

export interface Lease {
  id: string;
  owner: string;
  claims: string[];
  createdAt: number;
  /** Epoch ms. A lease nobody renews simply expires, so a crashed soldier cannot hold files forever. */
  expiresAt: number;
  pid: number;
}

export class LockError extends Error {}

/** Another live lease holds files this one wants. `holder` says who and until when. */
export class LockConflict extends LockError {
  constructor(
    readonly holder: Lease,
    message: string,
  ) {
    super(message);
  }
}

export interface AcquireOptions {
  owner: string;
  claims: string[];
  /** Lease lifetime without a renewal. Default 90s. */
  ttlMs?: number;
  /** How long to queue for a conflicting lease before giving up. Default 0 (fail immediately). */
  waitMs?: number;
  pollMs?: number;
}

export const DEFAULT_TTL_MS = 90_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, data, "utf8");
  await rename(tmp, path);
}

/**
 * A short-lived mutex around the whole registry, so "check for overlap, then write the lease" is one
 * step. It is a file created exclusively; one left behind by a crashed process is stolen after `staleMs`
 * (the critical section is a few file operations, so anything older than that is a crash).
 */
async function withMutex<T>(dir: string, fn: () => Promise<T>, timeoutMs = 5_000, staleMs = 10_000): Promise<T> {
  const path = join(dir, ".mutex");
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        const info = await stat(path);
        if (Date.now() - info.mtimeMs > staleMs) {
          await rm(path, { force: true });
          continue;
        }
      } catch {
        // the holder just released it; try again
      }
      if (Date.now() > deadline) throw new LockError("timed out waiting for the lock registry");
      await sleep(5 + Math.random() * 20);
    }
  }
  try {
    return await fn();
  } finally {
    await rm(path, { force: true });
  }
}

/**
 * The lease registry: `<root>/locks/leases/<id>.json`, one file per live lease. A lease is granted only
 * if its claims overlap no other live lease. Read access is never blocked; only writers take leases.
 */
export class Locks {
  constructor(
    readonly root: string,
    private readonly now: () => number = Date.now,
  ) {}

  private get dir() {
    return join(this.root, "locks");
  }
  private get leasesDir() {
    return join(this.dir, "leases");
  }

  private async ensure(): Promise<void> {
    await mkdir(this.leasesDir, { recursive: true });
  }

  /** Live leases, oldest first. With `prune`, expired lease files are deleted as they are found. */
  private async readLive(prune: boolean): Promise<Lease[]> {
    let files: string[];
    try {
      files = await readdir(this.leasesDir);
    } catch {
      return [];
    }
    const live: Lease[] = [];
    for (const f of files.filter((f) => f.endsWith(".json"))) {
      const path = join(this.leasesDir, f);
      try {
        const lease = JSON.parse(await readFile(path, "utf8")) as Lease;
        if (lease.expiresAt <= this.now()) {
          if (prune) await rm(path, { force: true });
        } else live.push(lease);
      } catch {
        // unreadable or half-gone file: another process is mid-release; ignore it
      }
    }
    return live.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  async list(): Promise<Lease[]> {
    return this.readLive(false);
  }

  private async tryAcquire(opts: AcquireOptions): Promise<{ lease: Lease } | { holder: Lease }> {
    await this.ensure();
    return withMutex(this.dir, async () => {
      const live = await this.readLive(true);
      const clash = live.find((l) => claimsOverlap(l.claims, opts.claims));
      if (clash) return { holder: clash };
      const now = this.now();
      const lease: Lease = {
        id: `l-${now}-${randomBytes(3).toString("hex")}`,
        owner: opts.owner,
        claims: opts.claims,
        createdAt: now,
        expiresAt: now + (opts.ttlMs ?? DEFAULT_TTL_MS),
        pid: process.pid,
      };
      await writeAtomic(join(this.leasesDir, `${lease.id}.json`), JSON.stringify(lease, null, 2));
      return { lease };
    });
  }

  /** Take a lease, queueing up to `waitMs` for a conflicting one. Throws LockConflict naming the holder. */
  async acquire(opts: AcquireOptions): Promise<Lease> {
    assertSafe("lease owner", opts.owner);
    // The wait is measured on the wall clock, not `this.now` (which only decides expiry), so a
    // frozen test clock cannot turn a bounded wait into an endless loop.
    const deadline = Date.now() + (opts.waitMs ?? 0);
    for (;;) {
      const r = await this.tryAcquire(opts);
      if ("lease" in r) return r.lease;
      if (Date.now() >= deadline) {
        const secs = Math.max(1, Math.ceil((r.holder.expiresAt - this.now()) / 1000));
        throw new LockConflict(
          r.holder,
          `claims overlap with ${r.holder.owner}'s lease on ${r.holder.claims.join(", ")} (frees within ${secs}s if not renewed)`,
        );
      }
      await sleep(opts.pollMs ?? 250);
    }
  }

  /** Extend a lease. Returns false if it is gone or already expired (the files may have changed hands). */
  async renew(id: string, ttlMs = DEFAULT_TTL_MS): Promise<boolean> {
    assertSafe("lease id", id);
    await this.ensure();
    return withMutex(this.dir, async () => {
      const path = join(this.leasesDir, `${id}.json`);
      let lease: Lease;
      try {
        lease = JSON.parse(await readFile(path, "utf8")) as Lease;
      } catch {
        return false;
      }
      if (lease.expiresAt <= this.now()) return false;
      lease.expiresAt = this.now() + ttlMs;
      await writeAtomic(path, JSON.stringify(lease, null, 2));
      return true;
    });
  }

  /**
   * Free a lease. Done under the registry mutex, like renew(): otherwise a renewal that had already
   * read the lease could write it back after it was deleted and hold the files until the TTL ran out.
   */
  async release(id: string): Promise<void> {
    assertSafe("lease id", id);
    await this.ensure();
    await withMutex(this.dir, () => rm(join(this.leasesDir, `${id}.json`), { force: true }));
  }

  /** Free every live lease an owner holds; returns how many. */
  async releaseOwner(owner: string): Promise<number> {
    let n = 0;
    for (const lease of await this.readLive(false)) {
      if (lease.owner === owner) {
        await this.release(lease.id);
        n++;
      }
    }
    return n;
  }
}
