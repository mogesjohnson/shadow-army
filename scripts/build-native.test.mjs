import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ELF_MACHINES, FLAGS, LINUX_DIRS, SOURCE, compileArgs, elfProblem, findCompiler, main, plan } from "./build-native.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A small, complete static ELF: header, program headers, 16 bytes of code, one section header. */
const elf = (machine, { cls = 2, data = 1, type = 2, entry, load = {}, extra = [] } = {}) => {
  const segments = [{ type: 1, flags: 5, offset: 0, vaddr: 0x400000, ...load }, ...extra];
  const code = 64 + segments.length * 56;
  const sections = code + 16;
  const buf = Buffer.alloc(sections + 64);
  buf.set([0x7f, 0x45, 0x4c, 0x46, cls, data, 1]);
  buf.writeUInt16LE(type, 16);
  buf.writeUInt16LE(machine, 18);
  buf.writeUInt32LE(1, 20);
  buf.writeBigUInt64LE(BigInt(entry ?? 0x400000 + code), 24);
  buf.writeBigUInt64LE(64n, 32);
  buf.writeBigUInt64LE(BigInt(sections), 40);
  [64, 56, segments.length, 64, 1].forEach((v, i) => buf.writeUInt16LE(v, 52 + i * 2));
  segments.forEach((seg, i) => {
    const at = 64 + i * 56;
    buf.writeUInt32LE(seg.type, at);
    buf.writeUInt32LE(seg.flags ?? 4, at + 4);
    const size = seg.filesz ?? sections;
    [seg.offset ?? 0, seg.vaddr ?? 0, 0, size, seg.memsz ?? size, seg.align ?? 0].forEach((v, j) =>
      buf.writeBigUInt64LE(BigInt(v), at + 8 + j * 8));
  });
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
      expect(compileArgs("scratch")).toEqual([...FLAGS, "-o", "scratch", SOURCE]);
    }
    expect(FLAGS).toEqual(expect.arrayContaining(["-Wall", "-Wextra", "-Werror", "-static"]));
    // The test-only variants (SA_CONTAIN_TEST_*, such as C15's NOPIDFD) are never shipped.
    expect(FLAGS.some((flag) => flag.startsWith("-D"))).toBe(false);
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

describe("elfProblem", () => {
  const { x64, arm64 } = ELF_MACHINES;
  /** A PT_DYNAMIC segment over the code bytes, whose first entry has this tag. */
  const dynamic = (tag) => {
    const at = 64 + 2 * 56;
    const buf = elf(x64, { type: 3, extra: [{ type: 2, offset: at, filesz: 16 }] });
    buf.writeBigUInt64LE(BigInt(tag), at);
    return buf;
  };

  it("takes a complete static executable only for its own processor", () => {
    expect(elfProblem(elf(x64), "x64")).toBeUndefined();
    expect(elfProblem(elf(arm64), "arm64")).toBeUndefined();
    expect(elfProblem(elf(x64, { type: 3 }), "x64")).toBeUndefined(); // static-pie
    expect(elfProblem(dynamic(30), "x64")).toBeUndefined(); // static-pie's own dynamic table
    expect(elfProblem(elf(arm64), "x64")).toMatch(/linux-x64/);
    expect(elfProblem(elf(x64), "arm64")).toMatch(/linux-arm64/);
    expect(elfProblem(elf(3), "x64")).toMatch(/linux-x64/); // i386
    expect(elfProblem(elf(x64, { cls: 1 }), "x64")).toMatch(/64-bit/);
    expect(elfProblem(elf(x64, { data: 2 }), "x64")).toMatch(/64-bit/);
    expect(elfProblem(Buffer.from("#!/bin/sh\n"), "x64")).toMatch(/64-bit/);
  });

  it("takes the largest program-header table the Linux loader reads, and aligned load segments", () => {
    expect(elfProblem(elf(x64, { extra: Array(72).fill({ type: 4 }) }), "x64")).toBeUndefined(); // 73 * 56 <= 4096
    const aligned = { load: { vaddr: 0x410000, align: 0x10000 }, entry: 0x410000 + 64 + 56 };
    expect(elfProblem(elf(x64, aligned), "x64")).toBeUndefined();
    expect(elfProblem(elf(arm64, aligned), "arm64")).toBeUndefined();
    expect(elfProblem(elf(arm64, { extra: Array(72).fill({ type: 4 }) }), "arm64")).toBeUndefined();
  });

  it("refuses an arm64 load segment that a 16 or 64 KiB page kernel can't map (C13)", () => {
    const at4k = { load: { vaddr: 0x401000 }, entry: 0x401000 + 64 + 56 };
    expect(elfProblem(elf(x64, at4k), "x64")).toBeUndefined();
    expect(elfProblem(elf(arm64, at4k), "arm64")).toMatch(/page/);
    const at16k = { load: { vaddr: 0x404000 }, entry: 0x404000 + 64 + 56 };
    expect(elfProblem(elf(arm64, at16k), "arm64")).toMatch(/page/);
  });

  it.each([
    ["only the first 20 bytes", elf(x64).subarray(0, 20), /64-bit/],
    ["cut inside the program headers", elf(x64).subarray(0, 100), /program headers/],
    ["cut before the section headers end", elf(x64).subarray(0, -1), /section headers/],
    ["a segment that ends past the file", elf(x64, { load: { filesz: 4096 } }), /truncated/],
    ["a relocatable object", elf(x64, { type: 1 }), /not an executable/],
    ["a core dump", elf(x64, { type: 4 }), /not an executable/],
    ["a program interpreter", elf(x64, { extra: [{ type: 3, filesz: 8 }] }), /interpreter/],
    ["a needed shared library", dynamic(1), /shared library/],
    ["no entry point, as a shared object has", elf(x64, { type: 3, entry: 0 }), /entry point/],
    ["an entry outside the loaded bytes", elf(x64, { entry: 0x900000 }), /entry point/],
    ["an entry in a segment that can't execute", elf(x64, { load: { flags: 4 } }), /entry point/],
    ["a segment larger in the file than in memory", elf(x64, { load: { memsz: 1 } }), /memory/],
    // C11: the kernel's load_elf_phdrs reads at most ELF_MIN_ALIGN (4096) bytes of program headers,
    ["a program-header table over 4096 bytes", elf(x64, { extra: Array(73).fill({ type: 4 }) }), /loader reads/],
    ["an unrecognized program-header count", elf(x64, { extra: Array(0xfffe).fill({ type: 4 }) }), /loader reads/],
    // and mmap needs each load segment's offset and address to agree within a page (and its p_align).
    ["a load segment off its page", elf(x64, { load: { vaddr: 0x400010 }, entry: 0x400100 }), /page/],
    ["a load segment off its p_align", elf(x64, { load: { vaddr: 0x401000, align: 0x10000 }, entry: 0x401100 }), /page/],
  ])("refuses %s", (name, bytes, reason) => {
    expect(elfProblem(bytes, "x64")).toMatch(reason);
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
  const compilerWriting = (bytes, status = 0, mode = 0o755) => (cc, args, opts) => {
    if (bytes) writeFileSync(join(opts.cwd, args[args.indexOf("-o") + 1]), bytes, { mode });
    return { status };
  };
  const quiet = { log: () => {}, error: () => {} };
  /** Everything beside the helper: a finished build leaves none of its own files there. */
  const leftovers = (out) => readdirSync(dirname(out)).filter((name) => name !== "sa-contain");
  const build = (run) => main({ platform: "linux", arch: "x64", cwd: dir, compiler: "cc", run, ...quiet });
  /** A good x64 helper, told apart from others by one byte of its code. */
  const marked = (mark) => {
    const bytes = elf(ELF_MACHINES.x64);
    bytes[64 + 56] = mark;
    return bytes;
  };
  /** Runs build A, and the whole of build B after A's compiler has written A's output. */
  const overlapping = (a, b) => {
    let second;
    const first = build((...call) => {
      const result = a(...call);
      second = build(b);
      return result;
    });
    return [first, second];
  };

  it("gives each of two concurrent builds its own temporary file and publishes the last one's bytes", () => {
    const out = setup();
    const outputs = [];
    const writing = (bytes) => (cc, args, opts) => {
      outputs.push(join(opts.cwd, args[args.indexOf("-o") + 1]));
      return compilerWriting(bytes)(cc, args, opts);
    };
    expect(overlapping(writing(marked(1)), writing(marked(2)))).toEqual([0, 0]);
    expect(new Set(outputs).size).toBe(2);
    for (const path of outputs) expect(path.startsWith(dirname(out))).toBe(true);
    expect(readFileSync(out).equals(marked(1))).toBe(true); // A published after B
    expect(leftovers(out)).toEqual([]);
  });

  it.each([
    ["fails to compile", compilerWriting(marked(2), 1)],
    ["is refused", compilerWriting(elf(ELF_MACHINES.arm64))],
  ])("publishes its own bytes while a concurrent build %s", (name, other) => {
    const out = setup();
    expect(overlapping(compilerWriting(marked(1)), other)).toEqual([0, 1]);
    expect(readFileSync(out).equals(marked(1))).toBe(true);
    expect(leftovers(out)).toEqual([]);
  });

  it("keeps a concurrent build's published helper when it then fails", () => {
    const out = setup();
    expect(overlapping(compilerWriting(marked(1), 1), compilerWriting(marked(2)))).toEqual([1, 0]);
    expect(readFileSync(out).equals(marked(2))).toBe(true);
    expect(leftovers(out)).toEqual([]);
  });

  it("removes its temporary files when the compiler throws", () => {
    const out = setup();
    expect(() => build(() => { throw new Error("spawn failed"); })).toThrow("spawn failed");
    expect(leftovers(out)).toEqual([]);
  });

  it("fails with no compiler and leaves no previous helper behind", () => {
    const out = setup();
    expect(main({ platform: "linux", arch: "x64", cwd: dir, compiler: undefined, ...quiet })).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it("fails when the compile fails and leaves no helper", () => {
    const out = setup();
    const run = compilerWriting(elf(ELF_MACHINES.x64), 1);
    expect(main({ platform: "linux", arch: "x64", cwd: dir, compiler: "cc", run, ...quiet })).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(leftovers(out)).toEqual([]);
  });

  it("refuses a binary built for another processor", () => {
    const out = setup();
    const run = compilerWriting(elf(ELF_MACHINES.arm64));
    expect(main({ platform: "linux", arch: "x64", cwd: dir, compiler: "cc", run, ...quiet })).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(leftovers(out)).toEqual([]);
  });

  it.each([
    ["a truncated file", elf(ELF_MACHINES.x64).subarray(0, 20)],
    ["a relocatable object", elf(ELF_MACHINES.x64, { type: 1 })],
    ["no file at all", undefined],
  ])("publishes nothing when the compiler leaves %s", (name, bytes) => {
    const out = setup();
    const run = compilerWriting(bytes);
    expect(main({ platform: "linux", arch: "x64", cwd: dir, compiler: "cc", run, ...quiet })).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  // Windows has no execute bit, so only a POSIX run can tell.
  it.skipIf(process.platform === "win32")("refuses an output with no execute permission", () => {
    const out = setup();
    const run = compilerWriting(elf(ELF_MACHINES.x64), 0, 0o644);
    expect(main({ platform: "linux", arch: "x64", cwd: dir, compiler: "cc", run, ...quiet })).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it("publishes a binary for this processor under PO-12's name", () => {
    const out = setup();
    const run = compilerWriting(elf(ELF_MACHINES.x64));
    expect(main({ platform: "linux", arch: "x64", cwd: dir, compiler: "cc", run, ...quiet })).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(leftovers(out)).toEqual([]);
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
