import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECK_EVERY_MS, LEASE_MS, RENEW_EVERY_MS, SessionLease, type LeaseClock } from "./lease.js";

afterEach(() => vi.useRealTimers());

/** A fake monotonic clock. `step` moves time with no check running, as a sleep does; `run` moves it a second at a time with a check after each. */
function fake() {
  let now = 0;
  let check: (() => void) | undefined;
  let cancelled = false;
  const clock: LeaseClock = { now: () => now, every: (fn, ms) => { expect(ms).toBe(CHECK_EVERY_MS); check = fn; return () => { cancelled = true; }; } };
  return {
    clock,
    step: (ms: number) => { now += ms; },
    tick: () => { now += CHECK_EVERY_MS; check?.(); },
    run(seconds: number) { for (let i = 0; i < seconds; i++) this.tick(); },
    get cancelled() { return cancelled; },
  };
}
const make = () => { const f = fake(); const expired = vi.fn(); const lease = new SessionLease({ session: "army" }, expired, f.clock); return { f, expired, lease }; };

describe("the mod session lease (HOST-2, PO-7)", () => {
  it("has fixed timings of 10 s and 30 s", () => {
    expect([RENEW_EVERY_MS, LEASE_MS]).toEqual([10_000, 30_000]);
  });

  it("keeps running through an hour of renewals every 10 s, then ends at the first check 30 s after the last", () => {
    const { f, expired, lease } = make();
    for (let i = 0; i < 360; i++) { f.run(10); expect(lease.renew("army")).toEqual({ ttlMs: 30_000 }); }
    expect(expired).not.toHaveBeenCalled();
    f.run(29);
    expect(expired).not.toHaveBeenCalled();
    f.run(1);
    expect(expired).toHaveBeenCalledTimes(1);
    f.run(60);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("ends 30 s after the start when nothing renews", () => {
    const { f, expired } = make();
    f.run(29); expect(expired).not.toHaveBeenCalled();
    f.run(1); expect(expired).toHaveBeenCalledTimes(1);
  });

  it("ends 16 s after a step of an hour taken between two checks, not at once", () => {
    const { f, expired, lease } = make();
    f.run(1);
    lease.renew("army");
    f.run(9);
    f.step(3_600_000);
    f.tick(); // this check adds at most 5 s: the gap is 9 + 5 s
    expect(expired).not.toHaveBeenCalled();
    f.run(15); expect(expired).not.toHaveBeenCalled();
    f.run(1); expect(expired).toHaveBeenCalledTimes(1);
  });

  it("keeps the lease for a renewal 10 s after the step, and for one handled before the first check after it", () => {
    const a = make();
    a.f.run(9); a.lease.renew("army"); a.f.run(9);
    a.f.step(3_600_000); a.f.tick(); a.f.run(5);
    a.lease.renew("army");
    a.f.run(29); expect(a.expired).not.toHaveBeenCalled();
    const b = make();
    b.f.run(9); b.lease.renew("army"); b.f.run(9);
    b.f.step(3_600_000);
    b.lease.renew("army"); // handled before the first check after the step: it measures nothing
    b.f.tick();
    b.f.run(28); expect(b.expired).not.toHaveBeenCalled();
    b.f.run(2); expect(b.expired).toHaveBeenCalledTimes(1);
  });

  it("is not moved by the wall clock, either way", () => {
    vi.useFakeTimers();
    const expired = vi.fn();
    const lease = new SessionLease({ session: "army" }, expired); // the real clock and timer, faked by vitest
    vi.advanceTimersByTime(9_000);
    vi.setSystemTime(Date.now() + 3_600_000);
    vi.advanceTimersByTime(10_000);
    vi.setSystemTime(Date.now() - 7_200_000);
    expect(expired).not.toHaveBeenCalled();
    lease.renew("army");
    vi.advanceTimersByTime(29_000);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("refuses a renewal from another session, from an earlier start and after the end, and renews nothing", () => {
    const { f, expired, lease } = make();
    f.run(20);
    expect(() => lease.renew("old")).toThrow(/another session/);
    expect(() => lease.renew(undefined)).toThrow(/another session/);
    f.run(10);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(() => lease.renew("army")).toThrow(/ended/);
    expect(() => lease.renew("old")).toThrow(/another session/);
  });

  it("refuses a release that names another session, and a release stops the checks and the end", () => {
    const { f, expired, lease } = make();
    expect(() => lease.release("old")).toThrow(/another session/);
    lease.release("army");
    expect(f.cancelled).toBe(true);
    expect(() => lease.renew("army")).toThrow(/ended/);
    f.run(120);
    expect(expired).not.toHaveBeenCalled();
  });

  it("requires a session id of at most 128 characters", () => {
    expect(() => new SessionLease({ session: "" }, vi.fn(), fake().clock)).toThrow(/session id/);
    expect(() => new SessionLease({ session: "x".repeat(129) }, vi.fn(), fake().clock)).toThrow(/session id/);
  });

  it("dispose cancels its timer and fires nothing", () => {
    const { f, expired, lease } = make();
    lease.dispose();
    f.run(120);
    expect(f.cancelled).toBe(true);
    expect(expired).not.toHaveBeenCalled();
  });
});
