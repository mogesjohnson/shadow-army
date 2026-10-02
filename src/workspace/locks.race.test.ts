import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Locks } from "./locks.js";

// Slow down lease write-backs on demand, to hold a renewal in the gap between reading a lease and
// writing it back: the window in which an unguarded release would be undone.
const slow = { writes: false };
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (slow.writes && String(args[0]).endsWith(".tmp")) await new Promise((r) => setTimeout(r, 300));
      return actual.writeFile(...args);
    },
  };
});

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "shadow-race-"));
});
afterEach(async () => {
  slow.writes = false;
  await rm(root, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("a release during a renewal's write-back stays released (the lease is not brought back)", async () => {
  const locks = new Locks(root);
  const lease = await locks.acquire({ owner: "grok", claims: ["src/**"] });

  slow.writes = true;
  const renewing = locks.renew(lease.id);
  // Wait until the renewal holds the registry mutex and has moved on to its slow write-back.
  for (let i = 0; i < 400 && !existsSync(join(root, "locks", ".mutex")); i++) await sleep(5);
  await sleep(100);

  await locks.release(lease.id);
  await renewing;

  expect(readdirSync(join(root, "locks", "leases")).filter((f) => f.endsWith(".json"))).toEqual([]);
  expect(await locks.list()).toEqual([]);
}, 30_000);
