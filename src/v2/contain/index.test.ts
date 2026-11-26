import { describe, expect, it } from "vitest";
import { containmentFor, containmentTable, noContainmentMessage, spawnLinux, spawnManagedProcess } from "./index.js";
import { spawnManagedProcess as spawnWindows } from "./windows.js";

describe("containment dispatch table (PO-12)", () => {
  it("lists exactly the spec's pairs", () => {
    expect(Object.keys(containmentTable).sort()).toEqual(
      ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"],
    );
  });

  it("registers the Job Object driver for both Windows processors", () => {
    expect(containmentFor("win32", "x64")).toBe(spawnWindows);
    expect(containmentFor("win32", "arm64")).toBe(spawnWindows);
  });

  it("registers the guardian driver for both Linux processors (#139 C2: the driver that lists the tree)", () => {
    expect(containmentFor("linux", "x64")).toBe(spawnLinux);
    expect(containmentFor("linux", "arm64")).toBe(spawnLinux);
  });

  it.each([["darwin", "arm64"], ["darwin", "x64"], ["linux", "riscv64"], ["freebsd", "x64"], ["win32", "ia32"]])(
    "says no helper for %s-%s (PO-14) and starts nothing",
    async (platform, arch) => {
      const message = `No containment helper for ${platform}-${arch}, so no soldier can start. Supported: Linux x64 and arm64, macOS, Windows x64 and arm64.`;
      expect(noContainmentMessage(platform, arch)).toBe(message);
      expect(() => containmentFor(platform, arch)).toThrow(message);
      await expect(spawnManagedProcess({ file: process.execPath, cwd: process.cwd() }, platform, arch)).rejects.toThrow(message);
    },
  );

  it("does not treat inherited object keys as pairs", () => {
    expect(() => containmentFor("__proto__", "x")).toThrow(/No containment helper/);
    expect(() => containmentFor("constructor", "")).toThrow(/No containment helper/);
  });
});
