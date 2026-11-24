#!/usr/bin/env node
// Builds the containment helper for this checkout's own system (spec v2 PO-13: "A checkout of
// the repository holds no binaries. There, `npm run build` compiles the helper for its own
// system with that system's C compiler"). Only Linux has a helper here so far (M1b-1); every
// other system is skipped with a message. The release package never runs this (PO-13).
//
// On Linux x64 and arm64 the build fails without a compiler, and the helper is published under
// its PO-12 name only after a compile that succeeded and whose ELF header names this processor.
// The previous helper is removed first, so a failed build never leaves an old one in place.
// `npm run build:ts` builds the TypeScript alone.
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// PO-12's table: the Linux processors that have a helper, and where each one goes.
export const LINUX_DIRS = { x64: "linux-x64", arm64: "linux-arm64" };
// The ELF e_machine of each (EM_X86_64, EM_AARCH64).
export const ELF_MACHINES = { x64: 62, arm64: 183 };

export const SOURCE = join("native", "linux", "sa-contain.c");
// -static: PO-12 and M1-AC17 need each Linux binary statically linked.
export const FLAGS = ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-static"];

/** Returns the first of `cc` and `gcc` that runs, or undefined. */
export function findCompiler(run = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" })) {
  for (const cmd of ["cc", "gcc"]) {
    const result = run(cmd);
    if (!result.error && result.status === 0) return cmd;
  }
  return undefined;
}

/** True when `header` (a file's first 20 bytes) is a 64-bit little-endian ELF for `arch`. */
export function elfMatches(header, arch) {
  if (header.length < 20) return false;
  const magic = header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46;
  return magic && header[4] === 2 && header[5] === 1 && header.readUInt16LE(18) === ELF_MACHINES[arch];
}

/**
 * Decides what the build does on this system. Pure, so the test can try each case.
 * @returns {{action: "skip", message: string} | {action: "fail", out: string, message: string}
 *   | {action: "compile", cc: string, args: string[], out: string}}
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
  return { action: "compile", cc: compiler, args: [...FLAGS, "-o", `${out}.tmp`, SOURCE], out };
}

function readHeader(path) {
  const header = Buffer.alloc(20);
  const fd = openSync(path, "r");
  try {
    return header.subarray(0, readSync(fd, header, 0, 20, 0));
  } finally {
    closeSync(fd);
  }
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
  const tmp = `${out}.tmp`;
  rmSync(out, { force: true }); // never leave a previous build under the helper's name
  if (step.action === "fail") {
    error(step.message);
    return 1;
  }
  mkdirSync(dirname(out), { recursive: true });
  rmSync(tmp, { force: true });
  const result = run(step.cc, step.args, { cwd, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    rmSync(tmp, { force: true });
    error(`build-native: ${step.cc} failed to build ${step.out}.`);
    return 1;
  }
  if (!elfMatches(readHeader(tmp), arch)) {
    rmSync(tmp, { force: true });
    error(`build-native: ${step.cc} did not build a 64-bit ELF for linux-${arch}; ${step.out} not published (PO-12).`);
    return 1;
  }
  renameSync(tmp, out);
  log(`build-native: built ${step.out} with ${step.cc}.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
