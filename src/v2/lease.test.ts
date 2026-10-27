import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionLease } from "./lease.js";

afterEach(() => vi.useRealTimers());

describe("the mod session lease", () => {
  it("expires even when the owning Claude process remains alive, once", async () => {
    vi.useFakeTimers();
    const expired = vi.fn();
    const lease = new SessionLease({ session: "old", ttlMs: 1000 }, expired, () => Date.now());
    await vi.advanceTimersByTimeAsync(1000);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(() => lease.renew("old")).toThrow(/ended/);
    await vi.advanceTimersByTimeAsync(5000);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("a stale session cannot extend a current lease, and renewal resets its own deadline", async () => {
    vi.useFakeTimers();
    const expired = vi.fn();
    const lease = new SessionLease({ session: "current", ttlMs: 1000 }, expired, () => Date.now());
    await vi.advanceTimersByTimeAsync(750);
    expect(() => lease.renew("old")).toThrow(/another session/);
    expect(lease.renew("current")).toEqual({ ttlMs: 1000 });
    await vi.advanceTimersByTimeAsync(750);
    expect(expired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("release prevents delayed heartbeats from reviving a finished session", async () => {
    vi.useFakeTimers();
    const expired = vi.fn();
    const lease = new SessionLease({ session: "current", ttlMs: 1000 }, expired, () => Date.now());
    lease.release("current");
    expect(() => lease.renew("current")).toThrow(/ended/);
    await vi.advanceTimersByTimeAsync(5000);
    expect(expired).not.toHaveBeenCalled();
  });

  it("uses elapsed time when timer delivery was delayed past the lease deadline", () => {
    let now = 0;
    const expired = vi.fn();
    const lease = new SessionLease({ session: "current", ttlMs: 1000 }, expired, () => now);
    now = 1500;
    expect(() => lease.renew("current")).toThrow(/ended/);
    expect(expired).toHaveBeenCalledTimes(1);
  });
});
