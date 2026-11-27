#!/usr/bin/env node
// Builds the containment helper for this checkout's own system (spec v2 PO-13: "A checkout of
// the repository holds no binaries. There, `npm run build` compiles the helper for its own
// system with that system's C compiler"). Only Linux has a helper here so far (M1b-1); every
// other system is skipped with a message. The release package never runs this (PO-13).
//
// On Linux x64 and arm64 the build fails without a compiler, and the helper is published under
// its PO-12 name only after a compile that succeeded and left a complete, statically linked ELF
// executable for this processor.
// The previous helper is removed first, so a failed build never leaves an old one in place.
// Builds may overlap in one checkout. Each compiles in a folder only it created, so the bytes it
// checked are the bytes it renames over the helper's name. After that first removal it touches
// nothing another build made: not its folder, and not a helper it published, even on failure.
// `npm run build:ts` builds the TypeScript alone.
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// PO-12's table: the Linux processors that have a helper, and where each one goes.
export const LINUX_DIRS = { x64: "linux-x64", arm64: "linux-arm64" };
// The ELF e_machine of each (EM_X86_64, EM_AARCH64).
export const ELF_MACHINES = { x64: 62, arm64: 183 };
// ELF_MIN_ALIGN on x64, and the smallest arm64 page: the Linux loader reads at most this many
// bytes of program headers (fs/binfmt_elf.c).
const LOADER_PAGE = 4096n;
// The largest page each target's kernels use: the loader maps each load segment in pages, so its
// offset and address must agree within one. arm64 kernels use 4, 16 or 64 KiB pages (C13).
const SEGMENT_PAGE = { x64: 4096n, arm64: 65536n };

export const SOURCE = join("native", "linux", "sa-contain.c");
// -static: PO-12 and M1-AC17 need each Linux binary statically linked.
export const FLAGS = ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-static"];
export const compileArgs = (output) => [...FLAGS, "-o", output, SOURCE];

/** Returns the first of `cc` and `gcc` that runs, or undefined. */
export function findCompiler(run = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" })) {
  for (const cmd of ["cc", "gcc"]) {
    const result = run(cmd);
    if (!result.error && result.status === 0) return cmd;
  }
  return undefined;
}

/**
 * Why `file` (a whole file's bytes) isn't a complete, statically linked 64-bit little-endian ELF
 * executable for `arch`, or undefined when it is one (PO-12). A static-pie executable has the
 * same type as a shared library, so the entry point must also lie in loaded, executable bytes.
 */
export function elfProblem(file, arch) {
  const u16 = (at) => file.readUInt16LE(at);
  const u64 = (at) => file.readBigUInt64LE(at);
  const inFile = (offset, length) => offset + length <= BigInt(file.length);
  if (file.length < 64 || file.readUInt32BE(0) !== 0x7f454c46 || file[4] !== 2 || file[5] !== 1 || file[6] !== 1) {
    return "not a whole 64-bit little-endian ELF header";
  }
  if (u16(18) !== ELF_MACHINES[arch] || file.readUInt32LE(20) !== 1) return `not built for linux-${arch}`;
  if (u16(16) !== 2 && u16(16) !== 3) return "not an executable (ET_EXEC or ET_DYN)";
  const entry = u64(24);
  const [phoff, shoff] = [u64(32), u64(40)];
  const count = u16(56);
  if (u16(54) !== 56 || count === 0 || phoff < 64n || !inFile(phoff, BigInt(count * 56))) {
    return "its program headers are missing or outside the file";
  }
  if (BigInt(count * 56) > LOADER_PAGE) return "its program-header table is larger than the Linux loader reads";
  if (shoff !== 0n && (u16(58) !== 64 || u16(60) === 0 || !inFile(shoff, BigInt(u16(60) * 64)))) {
    return "truncated: its section headers are outside the file";
  }
  let entryLoaded = false;
  for (let at = Number(phoff), end = at + count * 56; at < end; at += 56) {
    const [type, flags] = [file.readUInt32LE(at), file.readUInt32LE(at + 4)];
    const [offset, vaddr, size, memory] = [u64(at + 8), u64(at + 16), u64(at + 32), u64(at + 40)];
    if (!inFile(offset, size)) return "truncated: a segment ends outside the file";
    if (type === 3) return "not statically linked: it names a program interpreter";
    if (type === 2) {
      // PT_DYNAMIC: static-pie has one too, but never a DT_NEEDED (1) before its DT_NULL (0).
      for (let d = Number(offset); d + 16 <= Number(offset + size) && u64(d) !== 0n; d += 16) {
        if (u64(d) === 1n) return "not statically linked: it needs a shared library";
      }
    }
    if (type !== 1) continue;
    if (size > memory) return "a loaded segment is larger in the file than in memory";
    const align = u64(at + 48);
    const page = SEGMENT_PAGE[arch];
    if (offset % page !== vaddr % page || (align > 1n && offset % align !== vaddr % align)) {
      return "a loaded segment's file offset and address differ within a page or its p_align";
    }
    if (flags & 1 && entry >= vaddr && entry < vaddr + size) entryLoaded = true;
  }
  return entryLoaded && entry !== 0n ? undefined : "its entry point isn't in loaded, executable bytes";
}

/**
 * Decides what the build does on this system. Pure, so the test can try each case.
 * @returns {{action: "skip", message: string} | {action: "fail", out: string, message: string}
 *   | {action: "compile", cc: string, out: string}}
 */
export function plan({ platform, arch, compiler }) {
  if (platform !== "linux") {
    return { action: "skip", message: `build-native: no containment helper to build on ${platform}; skipped.` };
  }
  const dir = LINUX_DIRS[arch];
  if (!dir) {
    return {
      action: "skip",
      message: `build-native: no containment helper for linux-${arch} (PO-12 lists x64 and arm64); skipped.`,
    };
  }
  const out = join("native", dir, "sa-contain");
  if (!compiler) {
    return {
      action: "fail",
      out,
      message:
        "build-native: no C compiler found (tried cc and gcc), so the containment helper can't be built for " +
        "this checkout (PO-13). Install a C compiler and run `npm run build` again, or run `npm run build:ts` " +
        "to build the TypeScript alone. The release package needs no compiler.",
    };
  }
  return { action: "compile", cc: compiler, out };
}

/** Why the compiler's output can't be published, or undefined when it can. */
function artifactProblem(path, arch) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat?.isFile()) return "no regular file was written";
  // Windows has no execute bit; there only a test's stand-in compiler reaches this.
  if (process.platform !== "win32" && !(stat.mode & 0o100)) return "it has no execute permission";
  return elfProblem(readFileSync(path), arch);
}

export function main({
  platform = process.platform,
  arch = process.arch,
  cwd = root,
  compiler = platform === "linux" ? findCompiler() : undefined,
  run = spawnSync,
  log = console.log,
  error = console.error,
} = {}) {
  const step = plan({ platform, arch, compiler });
  if (step.action === "skip") {
    log(step.message);
    return 0;
  }
  const out = join(cwd, step.out);
  rmSync(out, { force: true }); // never leave a previous build under the helper's name
  if (step.action === "fail") {
    error(step.message);
    return 1;
  }
  mkdirSync(dirname(out), { recursive: true });
  // mkdtemp creates a new folder under a name no other build has. It is beside the helper, so the
  // rename stays on one file system and is atomic.
  const own = mkdtempSync(join(dirname(out), ".sa-contain-build-"));
  try {
    const tmp = join(own, "sa-contain");
    const result = run(step.cc, compileArgs(relative(cwd, tmp)), { cwd, stdio: "inherit" });
    if (result.error || result.status !== 0) {
      error(`build-native: ${step.cc} failed to build ${step.out}.`);
      return 1;
    }
    const problem = artifactProblem(tmp, arch);
    if (problem) {
      error(`build-native: ${step.out} not published (PO-12): ${step.cc}'s output is refused, ${problem}.`);
      return 1;
    }
    renameSync(tmp, out);
  } finally {
    rmSync(own, { recursive: true, force: true });
  }
  log(`build-native: built ${step.out} with ${step.cc}.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
