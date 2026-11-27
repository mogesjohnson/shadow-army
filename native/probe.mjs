// Shadow Army's containment probe (PO-14, step 4). It ships in the package and runs in containment as a CLI does.
// The probe starts a child in a new session; the child forks a grandchild and exits. Only the probe and the
// grandchild keep standard output open, so when that pipe ends, both have ended: that is the proof of containment.
// The probe and the grandchild each report their pid as one line of JSON. Both stop on their own after 60 s.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const role = process.argv[2] ?? "probe";
const start = (next, options) => spawn(process.execPath, [fileURLToPath(import.meta.url), next], {
  stdio: ["ignore", "inherit", "ignore"], windowsHide: true, ...options,
});

if (role === "child") {
  // Standard output is the probe's pipe; the grandchild inherits it. On Windows a grandchild whose parent
  // exits at once never gets its output, so wait for it to start, then a moment more.
  const grandchild = start("grandchild");
  grandchild.unref();
  grandchild.once("spawn", () => setTimeout(() => process.exit(0), 500));
} else {
  setTimeout(() => process.exit(0), 60_000);
  process.stdout.write(`${JSON.stringify({ role, pid: process.pid })}\n`);
  // detached: a new session on Linux and macOS, a new process group on Windows.
  if (role === "probe") start("child", { detached: true }).unref();
  setInterval(() => {}, 1000);
}
