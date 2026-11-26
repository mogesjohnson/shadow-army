// Fake git that never exits, and starts a child that never exits, for harness git's limit tests.
// It records `{pid, term, dir, argv}` per process in the file GIT_HANG_PIDS names, then waits forever.
// With GIT_HANG_EXIT_MS it is a slow git instead: no child, it prints "finished" and exits 0 after that long.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const isChild = process.argv[2] === "--child";
if (process.env.GIT_HANG_PIDS) {
  appendFileSync(process.env.GIT_HANG_PIDS, `${JSON.stringify({
    pid: process.pid, child: isChild, term: process.env.GIT_TERMINAL_PROMPT, dir: process.env.GIT_DIR, argv: process.argv.slice(2),
  })}\n`);
}
if (process.env.GIT_HANG_EXIT_MS) {
  setTimeout(() => { process.stdout.write("finished\n"); process.exit(0); }, Number(process.env.GIT_HANG_EXIT_MS));
} else {
  if (!isChild) spawn(process.execPath, [fileURLToPath(import.meta.url), "--child"], { stdio: "ignore", env: process.env });
  setInterval(() => {}, 1 << 30);
}
