import { describe, expect, it } from "vitest";
import { Serial } from "./serial.js";

describe("one operation at a time (C31-C40)", () => {
  it("runs calls in the order called, each only once the one before it has ended", async () => {
    const queue = new Serial(), order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    const first = queue.run(async () => { order.push("first starts"); await gate; order.push("first ends"); return 1; });
    const second = queue.run(() => { order.push("second"); return 2; });
    const third = queue.run(async () => { order.push("third"); return 3; });
    await new Promise((done) => setTimeout(done, 20));
    expect(order).toEqual(["first starts"]); // the second waits, though it is synchronous
    release();
    expect(await Promise.all([first, second, third])).toEqual([1, 2, 3]);
    expect(order).toEqual(["first starts", "first ends", "second", "third"]);
  });

  it("doesn't let a call that throws or rejects block the next, and gives each its own outcome", async () => {
    const queue = new Serial(), order: string[] = [];
    const thrown = queue.run(() => { order.push("throws"); throw new Error("sync"); });
    const rejected = queue.run(async () => { order.push("rejects"); throw new Error("async"); });
    const next = queue.run(() => { order.push("next"); return "ok"; });
    await expect(thrown).rejects.toThrow("sync");
    await expect(rejected).rejects.toThrow("async");
    expect(await next).toBe("ok");
    expect(order).toEqual(["throws", "rejects", "next"]);
  });

  it("leaves no unhandled rejection behind when a failed call's own promise is handled", async () => {
    const queue = new Serial(), unhandled: unknown[] = [];
    const listen = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", listen);
    try {
      await expect(queue.run(() => Promise.reject(new Error("handled")))).rejects.toThrow("handled");
      await queue.run(() => undefined);
      await new Promise((done) => setTimeout(done, 20));
    } finally { process.off("unhandledRejection", listen); }
    expect(unhandled).toEqual([]);
  });
});
