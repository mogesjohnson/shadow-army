/**
 * One operation at a time, in the order called: WSP-10's hold runs every read-modify-write of its record, every
 * registration and every gate check-then-act through one, and a harness git command its sweep entries (C31-C40).
 * An operation that fails doesn't stop the next. An operation must not wait for another queued behind it.
 */
export class Serial {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(work: () => T | Promise<T>): Promise<T> {
    const next = this.tail.then(() => work());
    this.tail = next.catch(() => {});
    return next;
  }
}
