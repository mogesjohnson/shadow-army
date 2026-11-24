import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ELF_MACHINES, FLAGS, LINUX_DIRS, SOURCE, elfMatches, findCompiler, main, plan } from "./build-native.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The first 20 bytes of an ELF file: 64-bit, little-endian, with this e_machine. */
const elfHeader = (machine, { cls = 2, data = 1 } = {}) => {
  const buf = Buffer.alloc(20);
  buf.set([0x7f, 0x45, 0x4c, 0x46, cls, data]);
  buf.writeUInt16LE(machine, 18);
  return buf;
};

describe("build-native plan", () => {
  it("skips every system but Linux, and says so", () => {
    for (const platform of ["win32", "darwin", "freebsd"]) {
      const step = plan({ platform, arch: "x64", compiler: "cc" });
      expect(step.action).toBe("skip");
      expect(step.message).toContain(platform);
    }
  });

  it("compiles on Linux x64 and arm64 to a temporary file in PO-12's folders, statically, warnings as errors", () => {
    for (const [arch, dir] of [["x64", "linux-x64"], ["arm64", "linux-arm64"]]) {
      const step = plan({ platform: "linux", arch, compiler: "gcc" });
      expect(step.action).toBe("compile");
      expect(step.cc).toBe("gcc");
      expect(step.out).toBe(join("native", dir, "sa-contain"));
      expect(step.args).toEqual([...FLAGS, "-o", `${step.out}.tmp`, SOURCE]);
    }
    expect(FLAGS).toEqual(expect.arrayContaining(["-Wall", "-Wextra", "-Werror", "-static"]));
  });

  it("skips a Linux processor PO-12 doesn't list", () => {
    const step = plan({ platform: "linux", arch: "riscv64", compiler: "cc" });
    expect(step.action).toBe("skip");
    expect(step.message).toContain("linux-riscv64");
  });

  it("fails, not skips, on a supported Linux with no C compiler (PO-13)", () => {
    const step = plan({ platform: "linux", arch: "x64", compiler: undefined });
    expect(step.action).toBe("fail");
    expect(step.message).toMatch(/no C compiler found \(tried cc and gcc\)/);
    expect(step.message).toContain("build:ts");
  });
});

describe("elfMatches", () => {
  it("takes a 64-bit little-endian ELF only for its own processor", () => {
    expect(elfMatches(elfHeader(ELF_MACHINES.x64), "x64")).toBe(true);
    expect(elfMatches(elfHeader(ELF_MACHINES.arm64), "arm64")).toBe(true);
    expect(elfMatches(elfHeader(ELF_MACHINES.arm64), "x64")).toBe(false);
    expect(elfMatches(elfHeader(ELF_MACHINES.x64), "arm64")).toBe(false);
    expect(elfMatches(elfHeader(3), "x64")).toBe(false); // i386
    expect(elfMatches(elfHeader(ELF_MACHINES.x64, { cls: 1 }), "x64")).toBe(false);
    expect(elfMatches(elfHeader(ELF_MACHINES.x64, { data: 2 }), "x64")).toBe(false);
    expect(elfMatches(Buffer.from("#!/bin/sh\n"), "x64")).toBe(false);
  });
});

describe("build-native main, with a stand-in compiler", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  const setup = () => {
    dir = mkdtempSync(join(tmpdir(), "build-native-"));
    const out = join(dir, "native", "linux-x64", "sa-contain");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, "the previous build");
    return out;
  };
  const compilerWriting = (bytes, status = 0) => (cc, args, opts) => {
    if (bytes) writeFileSync(join(opts.cwd, args[args.indexOf("-o") + 1]), bytes);
    return { status };
  };
  const quiet = { log: () => {}, error: () => {} };

  it("fails with no compiler and leaves no previous helper behind", () => {
    const out = setup();
    expect(main({ platform: "linux", arch: "x64", cwd: dir, compiler: undefined, ...quiet })).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it("fails when the compile fails and leaves no helper", () => {
    const out = setup();
    const run = compilerWriting(elfHeader(ELF_MACHINES.x64), 1);
    expect(main({ platform: "linux", arch: "x64", cwd: dir, compiler: "cc", run, ...quiet })).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(`${out}.tmp`)).toBe(false);
  });

  it("refuses a binary built for another processor", () => {
    const out = setup();
    const run = compilerWriting(elfHeader(ELF_MACHINES.arm64));
    expect(main({ platform: "linux", arch: "x64", cwd: dir, compiler: "cc", run, ...quiet })).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(`${out}.tmp`)).toBe(false);
  });

  it("publishes a binary for this processor under PO-12's name", () => {
    const out = setup();
    const run = compilerWriting(elfHeader(ELF_MACHINES.x64));
    expect(main({ platform: "linux", arch: "x64", cwd: dir, compiler: "cc", run, ...quiet })).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(existsSync(`${out}.tmp`)).toBe(false);
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

// PO-12: only these pairs get a helper; any other system or processor skips.
const supported = process.platform === "linux" && Boolean(LINUX_DIRS[process.arch]);
const compiler = process.platform === "linux" ? findCompiler() : undefined;

describe("build-native on this system", () => {
  it("does what PO-12 and PO-13 ask for this system", () => {
    const result = spawnSync(process.execPath, [join(root, "scripts", "build-native.mjs")], { encoding: "utf8" });
    if (!supported) {
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("skipped");
      if (process.platform === "linux") expect(result.stdout).toContain(`linux-${process.arch}`);
    } else if (compiler) {
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(join(root, "native", `linux-${process.arch}`, "sa-contain"))).toBe(true);
    } else {
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/no C compiler found/);
    }
  }, 60_000);
});

// The helper's two command-line cases that need no CLI. Guarding a tree is M1b-15's driver tests.
const helper = join(root, "native", `linux-${process.arch}`, "sa-contain");
const runHelper = (args) =>
  spawnSync(helper, args, { stdio: ["ignore", "pipe", "pipe", "pipe"], encoding: "utf8" });

describe.skipIf(!supported || !compiler)("the built Linux helper", () => {
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
