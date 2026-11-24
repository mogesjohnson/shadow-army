import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLAGS, SOURCE, findCompiler, plan } from "./build-native.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("build-native plan", () => {
  it("skips every system but Linux, and says so", () => {
    for (const platform of ["win32", "darwin", "freebsd"]) {
      const step = plan({ platform, arch: "x64", compiler: "cc" });
      expect(step.action).toBe("skip");
      expect(step.message).toContain(platform);
    }
  });

  it("compiles on Linux x64 and arm64 into PO-12's folders, statically, with warnings as errors", () => {
    for (const [arch, dir] of [["x64", "linux-x64"], ["arm64", "linux-arm64"]]) {
      const step = plan({ platform: "linux", arch, compiler: "gcc" });
      expect(step.action).toBe("compile");
      expect(step.cc).toBe("gcc");
      expect(step.out).toBe(join("native", dir, "sa-contain"));
      expect(step.args).toEqual([...FLAGS, "-o", step.out, SOURCE]);
    }
    expect(FLAGS).toEqual(expect.arrayContaining(["-Wall", "-Wextra", "-Werror", "-static"]));
  });

  it("skips a Linux processor PO-12 doesn't list", () => {
    const step = plan({ platform: "linux", arch: "riscv64", compiler: "cc" });
    expect(step.action).toBe("skip");
    expect(step.message).toContain("linux-riscv64");
  });

  it("skips with a message, not a failure, on Linux with no C compiler", () => {
    const step = plan({ platform: "linux", arch: "x64", compiler: undefined });
    expect(step.action).toBe("skip");
    expect(step.message).toMatch(/no C compiler found \(tried cc and gcc\)/);
    expect(step.message).toContain("no soldier can start");
  });
});

describe("findCompiler", () => {
  const runner = (present) => (cmd) => (present.includes(cmd) ? { status: 0 } : { error: new Error("ENOENT"), status: null });

  it("prefers cc, falls back to gcc, and finds none when neither runs", () => {
    expect(findCompiler(runner(["cc", "gcc"]))).toBe("cc");
    expect(findCompiler(runner(["gcc"]))).toBe("gcc");
    expect(findCompiler(runner([]))).toBeUndefined();
  });

  it("does not take a compiler that exits with an error", () => {
    expect(findCompiler(() => ({ status: 1 }))).toBeUndefined();
  });
});

describe("build-native on this system", () => {
  it("exits 0, and on Linux with a compiler leaves the helper in PO-12's folder", () => {
    const result = spawnSync(process.execPath, [join(root, "scripts", "build-native.mjs")], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    if (process.platform !== "linux") {
      expect(result.stdout).toContain("skipped");
    } else if (findCompiler()) {
      expect(existsSync(join(root, "native", `linux-${process.arch}`, "sa-contain"))).toBe(true);
    }
  }, 60_000);
});

// The helper's two command-line cases that need no CLI. Guarding a tree is M1b-15's driver tests.
const helper = join(root, "native", `linux-${process.arch}`, "sa-contain");
const runHelper = (args) =>
  spawnSync(helper, args, { stdio: ["ignore", "pipe", "pipe", "pipe"], encoding: "utf8" });

describe.skipIf(process.platform !== "linux" || !findCompiler())("the built Linux helper", () => {
  it("passes its check, reading the subreaper mark back, on fd 3 alone", () => {
    const result = runHelper(["check"]);
    expect(result.status).toBe(0);
    expect(result.output[3]).toBe('{"op":"check","ok":true,"subreaper":1}\n');
    expect(result.stdout + result.stderr).toBe("");
  });

  it("refuses an unknown operation and exits 2", () => {
    const result = runHelper(["list", "1"]);
    expect(result.status).toBe(2);
    expect(result.output[3]).toBe('{"ok":false,"reason":"unknown operation"}\n');
  });
});
