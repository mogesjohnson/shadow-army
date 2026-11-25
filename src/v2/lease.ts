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

/** PO-7: what the post office logs about a lease: its start, each long step between two checks and each refusal, never a renewal one by one. */
export type LeaseRecord =
  | { type: "lease_started"; data: { session: string } }
  | { type: "lease_long_step"; data: { session: string; stepMs: number } }
  | { type: "lease_refused"; data: { session: string; action: "renew" | "release"; reason: string } };

/** PO-7: the mod's session id, checked before the post office starts. */
export function assertSessionId(session: unknown): asserts session is string {
  if (typeof session !== "string" || !session.length || session.length > 128) throw new Error("mod lease requires a session id of at most 128 characters");
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
  /** The previous check's time: a long step is measured check to check, so a renewal in between does not hide it. */
  private lastCheck: number;
  private cancel?: () => void;
  private ended = false;
  private readonly now: () => number;

  constructor(options: LeaseOptions, private readonly onExpire: () => void, clock: LeaseClock = {}, private readonly report: (record: LeaseRecord) => void = () => {}) {
    assertSessionId(options.session);
    this.session = options.session;
    this.now = clock.now ?? (() => performance.now());
    this.mark = this.lastCheck = this.now();
    this.cancel = (clock.every ?? realEvery)(() => this.check(), CHECK_EVERY_MS);
    this.report({ type: "lease_started", data: { session: this.session } });
  }

  /** The once-a-second check. Only a check ends the lease. */
  check(): void {
    if (this.ended) return;
    const at = this.now();
    const step = at - this.lastCheck;
    this.lastCheck = at;
    if (step > CHECK_CAP_MS) this.report({ type: "lease_long_step", data: { session: this.session, stepMs: Math.round(step) } });
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

  private assertSession(session: unknown, action: "renew" | "release"): void {
    const reason = session !== this.session ? "mod lease belongs to another session" : this.ended ? "mod session lease has ended" : undefined;
    if (!reason) return;
    this.report({ type: "lease_refused", data: { session: this.session, action, reason } });
    throw new Error(reason);
  }

  renew(session: unknown): { ttlMs: number } {
    this.assertSession(session, "renew");
    this.gap = 0;
    this.mark = this.now();
    return { ttlMs: LEASE_MS };
  }

  release(session: unknown): void {
    this.assertSession(session, "release");
    this.dispose();
  }

  dispose(): void {
    this.ended = true;
    this.cancel?.();
    this.cancel = undefined;
  }
}
