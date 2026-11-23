#!/usr/bin/env node
// Builds the containment helper for this checkout's own system (spec v2 PO-13: "A checkout of
// the repository holds no binaries. There, `npm run build` compiles the helper for its own
// system with that system's C compiler"). Only Linux has a helper here so far (M1b-1); every
// other system is skipped with a message. The release package never runs this (PO-13).
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// PO-12's table: the Linux processors that have a helper, and where each one goes.
const LINUX_DIRS = { x64: "linux-x64", arm64: "linux-arm64" };

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

/**
 * Decides what the build does on this system. Pure, so the test can try each case.
 * @returns {{action: "skip", message: string} | {action: "compile", cc: string, args: string[], out: string}}
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
  if (!compiler) {
    return {
      action: "skip",
      message:
        "build-native: no C compiler found (tried cc and gcc), so the containment helper was not built and " +
        "no soldier can start from this checkout. Install a C compiler and run `npm run build` again. " +
        "The release package needs no compiler (PO-13).",
    };
  }
  const out = join("native", dir, "sa-contain");
  return { action: "compile", cc: compiler, args: [...FLAGS, "-o", out, SOURCE], out };
}

export function main({ platform = process.platform, arch = process.arch, cwd = root } = {}) {
  const step = plan({ platform, arch, compiler: platform === "linux" ? findCompiler() : undefined });
  if (step.action === "skip") {
    console.log(step.message);
    return 0;
  }
  mkdirSync(join(cwd, dirname(step.out)), { recursive: true });
  const result = spawnSync(step.cc, step.args, { cwd, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(`build-native: ${step.cc} failed to build ${step.out}.`);
    return 1;
  }
  console.log(`build-native: built ${step.out} with ${step.cc}.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
