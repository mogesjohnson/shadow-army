import { describe, expect, it, vi } from "vitest";
import { shippedRoster } from "../core/roster.testutil.js";
import { CLEAR_ALL, openChat } from "./open.js";

// The real screen needs a terminal; here the chat "opens" and closes at once, so only what `openChat`
// itself writes to the terminal can be seen.
vi.mock("ink", async (original) => ({
  ...(await original<typeof import("ink")>()),
  render: () => ({ waitUntilExit: async () => undefined, unmount: () => undefined, clear: () => undefined }),
}));

describe("opening the chat", () => {
  it("starts by clearing the screen and the scrollback, like cls", async () => {
    expect(CLEAR_ALL).toBe("\x1b[2J\x1b[3J\x1b[H");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await openChat({ version: "9.9.9", roster: shippedRoster(), cwd: process.cwd() });
      expect(write.mock.calls[0]?.[0]).toBe(CLEAR_ALL);
    } finally {
      write.mockRestore();
    }
  });
});
