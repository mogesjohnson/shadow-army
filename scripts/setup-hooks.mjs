// Point git at the tracked hooks in .githooks. Runs from `npm install` (the "prepare" script).
// Quietly does nothing outside a git checkout, e.g. when installed from a package.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

try {
  if (existsSync(".githooks")) {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  }
} catch {
  // not a git checkout, or git is unavailable: nothing to set up
}
