#!/usr/bin/env node
// Builds the Windows launcher into the package (spec v2 PO-19: a precompiled assembly at a fixed
// path, never compiled at run time). Runs after `tsc`: it takes the C# source from the compiled
// module, compiles it with the .NET Framework 4 csc.exe that ships with Windows (nothing to install),
// and writes the launcher and a record of the source's and the launcher's SHA-256 beside it. The
// post office checks both before each launch and refuses anything else (PO-14 steps 1 and 2).
// Other systems have no launcher to build and are skipped with a message.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The Framework 4 compiler in the Windows folder, 64-bit first; undefined when neither is there. */
export function frameworkCompiler(windows = process.env.SystemRoot ?? "C:\\Windows", exists = existsSync) {
  return ["Framework64", "Framework"].map((dir) => join(windows, "Microsoft.NET", dir, "v4.0.30319", "csc.exe")).find((path) => exists(path));
}

export async function main({ platform = process.platform, cwd = root } = {}) {
  if (platform !== "win32") {
    console.log(`build-windows-launcher: no Windows launcher to build on ${platform}; skipped.`);
    return 0;
  }
  const csc = frameworkCompiler();
  if (!csc) {
    console.error("build-windows-launcher: the .NET Framework 4 csc.exe is not in the Windows folder, so the launcher was not built and no soldier can start from this checkout.");
    return 1;
  }
  const windows = await import(pathToFileURL(join(cwd, "dist", "v2", "contain", "windows.js")).href);
  const out = join(cwd, "dist", "native", "windows");
  mkdirSync(out, { recursive: true });
  const work = mkdtempSync(join(out, "build-"));
  try {
    const source = join(work, "supervisor.cs"), binary = join(work, "shadow-supervisor.exe");
    writeFileSync(source, windows.SUPERVISOR_SOURCE, "utf8");
    const result = spawnSync(csc, ["/nologo", "/optimize+", "/target:exe", "/reference:System.Web.Extensions.dll", `/out:${binary}`, source], { encoding: "utf8", windowsHide: true });
    if (result.error || result.status !== 0) {
      console.error(`build-windows-launcher: csc.exe failed:\n${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`);
      return 1;
    }
    const record = join(work, "shadow-supervisor.json");
    writeFileSync(record, `${JSON.stringify({ source: windows.SUPERVISOR_SOURCE_SHA256, sha256: sha256(readFileSync(binary)) })}\n`);
    renameSync(binary, join(out, "shadow-supervisor.exe"));
    renameSync(record, join(out, "shadow-supervisor.json"));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`build-windows-launcher: built ${join("dist", "native", "windows", "shadow-supervisor.exe")} with ${csc}.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main();
}
