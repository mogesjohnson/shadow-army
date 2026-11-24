// A fake CLI for containment tests (M1-AC15). Usage: tree-writer.mjs <file> [ignore-stdin] [ignore-term]
//   root:   reports its argv, cwd and SA_PROBE on stdout, starts `child`, then echoes stdin to stdout
//           byte for byte and exits 7 at stdin's end (unless ignore-stdin; ignore-term ignores SIGTERM).
//   child:  started in a new session with an empty environment; starts `writer` and exits at once.
//   writer: appends its pid to <file> every 20 ms until it is killed.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [role, file, ...flags] = process.argv[2] === "child" || process.argv[2] === "writer" ? process.argv.slice(2) : ["root", ...process.argv.slice(2)];
const self = fileURLToPath(import.meta.url);

if (role === "writer") {
  setInterval(() => appendFileSync(file, `${process.pid}\n`), 20);
} else if (role === "child") {
  spawn(process.execPath, [self, "writer", file], { stdio: "ignore", env: {} }).unref();
  process.exit(0);
} else {
  process.stdout.write(`${JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), probe: process.env.SA_PROBE ?? null })}\n`);
  spawn(process.execPath, [self, "child", file], { stdio: "ignore", env: {}, detached: true }).unref();
  if (flags.includes("ignore-term")) process.on("SIGTERM", () => {});
  if (flags.includes("ignore-stdin")) setInterval(() => {}, 1_000);
  else {
    process.stdin.on("data", (chunk) => process.stdout.write(chunk));
    process.stdin.on("end", () => process.exit(7));
  }
}
