/** HOST-2 and PO-7: the mod renews every 10 s, and the post office ends the lease after 30 s of its own running time. Fixed; no setting changes them. */
export const RENEW_EVERY_MS = 10_000;
export const LEASE_MS = 30_000;
/** A check runs once a second and adds at most this much, so a sleep or a stalled process cannot end the lease at once. */
export const CHECK_EVERY_MS = 1_000;
export const CHECK_CAP_MS = 5_000;

export interface LeaseOptions {
  session: string;
}

/** Injected so tests run on a fake clock: `now` is monotonic milliseconds, `every` schedules the check and returns its cancel. */
export interface LeaseClock {
  now?: () => number;
  every?: (check: () => void, ms: number) => () => void;
}

function realEvery(check: () => void, ms: number): () => void {
  const timer = setInterval(check, ms);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * An in-memory session lease on the monotonic clock (never the wall clock). The gap starts at zero when
 * the lease is created, which is when the post office is ready, and returns to zero with each renewal.
 * Each check adds the time since the previous check, the last renewal or the start, whichever came last,
 * but never more than 5 s. The lease ends at the first check that brings the gap to 30 s. Handling a
 * renewal never measures time, so a renewal handled before that check renews the lease however late it was sent.
 */
export class SessionLease {
  readonly session: string;
  private gap = 0;
  private mark: number;
  private cancel?: () => void;
  private ended = false;
  private readonly now: () => number;

  constructor(options: LeaseOptions, private readonly onExpire: () => void, clock: LeaseClock = {}) {
    if (typeof options.session !== "string" || !options.session.length || options.session.length > 128) throw new Error("mod lease requires a session id of at most 128 characters");
    this.session = options.session;
    this.now = clock.now ?? (() => performance.now());
    this.mark = this.now();
    this.cancel = (clock.every ?? realEvery)(() => this.check(), CHECK_EVERY_MS);
  }

  /** The once-a-second check. Only a check ends the lease. */
  check(): void {
    if (this.ended) return;
    const at = this.now();
    this.gap += Math.min(Math.max(at - this.mark, 0), CHECK_CAP_MS);
    this.mark = at;
    if (this.gap >= LEASE_MS) {
      this.dispose();
      this.onExpire();
    }
  }

  assertActive(): void {
    if (this.ended) throw new Error("mod session lease has ended");
  }

  private assertSession(session: unknown): void {
    if (session !== this.session) throw new Error("mod lease belongs to another session");
    this.assertActive();
  }

  renew(session: unknown): { ttlMs: number } {
    this.assertSession(session);
    this.gap = 0;
    this.mark = this.now();
    return { ttlMs: LEASE_MS };
  }

  release(session: unknown): void {
    this.assertSession(session);
    this.dispose();
  }

  dispose(): void {
    this.ended = true;
    this.cancel?.();
    this.cancel = undefined;
  }
}
