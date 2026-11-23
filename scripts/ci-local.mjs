#!/usr/bin/env node
// Local CI: runs this repository's checks on Windows, then on Linux inside WSL.
// Usage: node scripts/ci-local.mjs [--windows-only | --linux-only | --setup-wsl] [--distro <name>]
// See docs/ci-local.md. No dependencies beyond Node.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { judge, lastLines } from "./ci-local-parse.mjs";
// ---------------------------------------------------------------- runtime

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true, ...options });
  return { code: result.status ?? 1, out: `${result.stdout ?? ""}${result.stderr ?? ""}`, error: result.error };
}

const git = (cwd, ...args) => run("git", args, { cwd });
function parseArgs(argv) {
  const opts = { windows: true, linux: true, setup: false, distro: "Ubuntu" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--windows-only") opts.linux = false;
    else if (a === "--linux-only") opts.windows = false;
    else if (a === "--setup-wsl") opts.setup = true;
    else if (a === "--distro") opts.distro = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!opts.windows && !opts.linux) throw new Error("nothing to run");
  return opts;
}

const results = [];
const logLines = [];
function report(platform, name, status, line) {
  const text = `[${platform}] ${name}: ${status} - ${line}`;
  console.log(text);
  logLines.push(text);
  results.push({ platform, name, status });
}

function runChecks(platform, exec, hasScript, installNeeded) {
  const installed = installNeeded();
  if (installed) {
    const r = exec("npm ci");
    if (r.code !== 0) {
      report(platform, "install", "fail", `npm ci exit ${r.code}: ${lastLines(r.out, 4)}`);
      return;
    }
  }
  report(platform, "install", "pass", installed ? "npm ci" : "node_modules current, npm ci skipped");
  const checks = [["tsc", "npx tsc --noEmit"], ["build", "npm run build"], ["test", "npm test"]];
  if (hasScript("test:coverage")) checks.push(["coverage", "npm run test:coverage"]);
  for (const [name, cmd] of checks) {
    const r = exec(cmd);
    const j = judge(name, r.code, r.out);
    report(platform, name, j.status, `${cmd}: ${j.line}`);
  }
  if (!hasScript("test:coverage")) report(platform, "coverage", "not_run", "this commit has no test:coverage script");
}

function lockHash(root) {
  const f = join(root, "package-lock.json");
  return existsSync(f) ? run("git", ["hash-object", f]).out.trim() : "none";
}

function runWindows(root) {
  const nm = join(root, "node_modules");
  const marker = join(nm, ".ci-local-lock");
  const hasScript = (s) => Boolean(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts?.[s]);
  const installNeeded = () => {
    if (!existsSync(nm)) return true;
    const want = lockHash(root);
    try {
      return readFileSync(marker, "utf8").trim() !== want;
    } catch {
      // Not installed by this script: trust npm's own record when the lock file is not newer.
      const npmLock = join(nm, ".package-lock.json");
      return !existsSync(npmLock) || statSync(join(root, "package-lock.json")).mtimeMs > statSync(npmLock).mtimeMs;
    }
  };
  const exec = (cmd) => {
    const r = run(cmd, [], { cwd: root, shell: true });
    if (cmd === "npm ci" && r.code === 0) writeFileSync(marker, `${lockHash(root)}\n`);
    return r;
  };
  runChecks("windows", exec, hasScript, installNeeded);
}

function wslExec(distro, script) {
  const wrapped = `export PATH="$HOME/.local/node/bin:$PATH"; ${script}`;
  return run("wsl.exe", ["-d", distro, "--cd", "~", "--exec", "bash", "-lc", wrapped]);
}

function wslPath(distro, winPath) {
  const r = run("wsl.exe", ["-d", distro, "--", "wslpath", "-a", winPath.replace(/\\/g, "/")]);
  return r.out.trim();
}

const NODE_SETUP = String.raw`set -e
want="$1"
if [ -x "$HOME/.local/node/bin/node" ] && [ "$("$HOME/.local/node/bin/node" --version)" = "v$want" ]; then
  echo "node v$want already installed"; exit 0
fi
mkdir -p "$HOME/.local" "$HOME/ci"
cd "$HOME/ci"
file="node-v$want-linux-x64.tar.gz"
curl -fsSL -o "$file" "https://nodejs.org/dist/v$want/$file"
rm -rf "$HOME/.local/node-v$want-linux-x64"
tar -xzf "$file" -C "$HOME/.local"
ln -sfn "$HOME/.local/node-v$want-linux-x64" "$HOME/.local/node"
rm -f "$file"
"$HOME/.local/node/bin/node" --version`;

function setupWsl(distro) {
  const want = process.versions.node;
  console.log(`[setup] installing Node ${want} in WSL ${distro} under ~/.local/node (no sudo, no apt)`);
  const r = run("wsl.exe", ["-d", distro, "--", "bash", "-s", "--", want], { input: `${NODE_SETUP.replace(/\r/g, "")}\n` });
  console.log(lastLines(r.out, 5));
  if (r.code !== 0) throw new Error(`WSL Node setup failed (exit ${r.code})`);
}

function runLinux(root, sha, distro) {
  const probe = wslExec(distro, "node --version && npm --version");
  if (probe.code !== 0) {
    report("linux", "setup", "fail", `no Node in WSL ${distro}; run: node scripts/ci-local.mjs --setup-wsl`);
    return;
  }
  const commonDir = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir").out.trim();
  const winCommon = wslPath(distro, commonDir);
  const clone = '$HOME/ci/shadow-army';
  const sync = wslExec(
    distro,
    [
      "set -e",
      `mkdir -p "$HOME/ci"`,
      `[ -d ${clone}/.git ] || git init -q ${clone}`,
      `cd ${clone}`,
      `git -c safe.directory='*' fetch -q "${winCommon}" ${sha}`,
      `git checkout -q -f --detach ${sha}`,
      `git clean -fdxq -e node_modules`,
      `test "$(git rev-parse HEAD)" = "${sha}"`,
      "echo synced",
    ].join(" && ").replace("set -e &&", "set -e;"),
  );
  if (sync.code !== 0) {
    report("linux", "clone", "fail", `could not put ${sha.slice(0, 9)} in WSL: ${lastLines(sync.out, 3)}`);
    return;
  }
  report("linux", "clone", "pass", `fresh checkout of ${sha.slice(0, 9)} in ~/ci/shadow-army (uncommitted changes are not included)`);
  const hasScript = (s) =>
    wslExec(distro, `cd ${clone} && node -e 'process.exit(require("./package.json").scripts?.["${s}"]?0:1)'`).code === 0;
  const exec = (cmd) => {
    const r = wslExec(distro, `cd ${clone} && ${cmd}`);
    if (cmd === "npm ci" && r.code === 0) wslExec(distro, `cd ${clone} && git hash-object package-lock.json > node_modules/.ci-local-lock`);
    return r;
  };
  const installNeeded = () =>
    wslExec(distro, `cd ${clone} && test "$(git hash-object package-lock.json)" = "$(cat node_modules/.ci-local-lock 2>/dev/null)"`).code !== 0;
  runChecks("linux", exec, hasScript, installNeeded);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.setup) {
    setupWsl(opts.distro);
    return 0;
  }
  const top = run("git", ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) throw new Error("run this from inside the repository checkout");
  const root = top.out.trim();
  const sha = git(root, "rev-parse", "HEAD").out.trim();
  const branch = git(root, "branch", "--show-current").out.trim() || "(detached)";
  const dirty = git(root, "status", "--porcelain", "--untracked-files=no").out.trim() !== "";
  console.log(`ci:local ${branch} @ ${sha.slice(0, 9)}, Node ${process.version}${dirty ? ", working tree has uncommitted changes (Linux runs the commit only)" : ""}`);
  console.log("macOS is not checked (dropped by the owner, 2026-11-23).");
  if (opts.windows) runWindows(root);
  if (opts.linux) runLinux(root, sha, opts.distro);
  const failed = results.filter((r) => r.status === "fail");
  const summary = `ci:local ${failed.length === 0 ? "PASS" : "FAIL"}: ${results.length - failed.length}/${results.length} checks ok${failed.length ? `; failed: ${failed.map((r) => `${r.platform}/${r.name}`).join(", ")}` : ""}`;
  console.log(summary);
  const dir = join(root, ".shadow", "ci");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const header = [`commit ${sha}`, `branch ${branch}`, `windows node ${process.version}`, `date ${new Date().toISOString()}`];
  writeFileSync(join(dir, `${stamp}-${sha.slice(0, 9)}.log`), [...header, ...logLines, summary, ""].join("\n"));
  return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(`ci:local: ${err.message}`);
    process.exitCode = 2;
  }
}
