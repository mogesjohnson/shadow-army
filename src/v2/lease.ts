export interface LeaseOptions {
  session: string;
  ttlMs?: number;
}

/** An in-memory session lease. A living Claude process does not imply a living mod/session. */
export class SessionLease {
  readonly session: string;
  readonly ttlMs: number;
  private deadline: number;
  private timer?: ReturnType<typeof setTimeout>;
  private ended = false;

  constructor(options: LeaseOptions, private readonly onExpire: () => void, private readonly now = () => performance.now()) {
    if (typeof options.session !== "string" || !options.session.length || options.session.length > 128) throw new Error("mod lease requires a session id of at most 128 characters");
    this.session = options.session;
    this.ttlMs = options.ttlMs ?? 20_000;
    if (!Number.isInteger(this.ttlMs) || this.ttlMs < 100 || this.ttlMs > 60_000) throw new Error("mod lease TTL must be between 100 and 60000 milliseconds");
    this.deadline = now() + this.ttlMs;
    this.arm();
  }

  private arm(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.ended) return;
      if (this.now() < this.deadline) { this.arm(); return; }
      this.dispose();
      this.onExpire();
    }, Math.max(1, this.deadline - this.now()));
    this.timer.unref?.();
  }

  assertActive(): void {
    if (!this.ended && this.now() >= this.deadline) {
      this.dispose();
      this.onExpire();
    }
    if (this.ended) throw new Error("mod session lease has ended");
  }

  private assertSession(session: unknown): void {
    if (session !== this.session) throw new Error("mod lease belongs to another session");
    this.assertActive();
  }

  renew(session: unknown): { ttlMs: number } {
    this.assertSession(session);
    this.deadline = this.now() + this.ttlMs;
    this.arm();
    return { ttlMs: this.ttlMs };
  }

  release(session: unknown): void {
    this.assertSession(session);
    this.dispose();
  }

  dispose(): void {
    this.ended = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
