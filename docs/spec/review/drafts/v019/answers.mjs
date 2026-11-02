// Record the owner's answers to D-30 to D-33 in decisions.md. node answers.mjs <decisions.md>
import { readFileSync, writeFileSync } from "node:fs";
const [file] = process.argv.slice(2);
const t = readFileSync(file, "utf8");
const eol = t.includes("\r\n") ? "\r\n" : "\n";
const lines = t.split(/\r?\n/);
const page = "https://claude.ai/artifact/MxaMyxHYcNYAhMiHsdmCyN";
const ans = {
  "D-30": "accept residuals 7, 8 and 12 as written, and with them residual 13's refs under another army's mark (R-M1-204, v0.18). In the spec, their \"for the owner to accept\" becomes \"accepted (D-30)\".",
  "D-31": "soldiers start fresh in every new Claude Code process; state it in SES-1 and close H38 for 2.0. With it R-F-140 (b): at start, the log and one transcript line name each earlier worktree with commits not applied, and `/diff` and `/apply` accept it.",
  "D-32": "only the owner's own uses (`/army`, `/send`, r, or the list's row) show the trust card's dialog again after `Not now`; Claude's `send` returns `queued · waits · trust card` and shows none (ARM-7).",
  "D-33": "the shipped copy sets every soldier to `supervised`, and ARM-7 says so.",
};
let n = 0;
for (const [d, a] of Object.entries(ans)) {
  const h = lines.findIndex((l) => l.startsWith(`## ${d} `));
  if (h < 0) { console.log("missing", d); continue; }
  let c = h + 1;
  while (c < lines.length && !lines[c].startsWith("- **Card**")) c++;
  if (lines[c + 1]?.startsWith("- **Answer:**")) { console.log("already", d); continue; }
  lines.splice(c + 1, 0, `- **Answer:** **A**, 2026-10-26, from the owner in chat (picked on the page ${page}): ${a} To apply in v0.19.`);
  n++;
}
writeFileSync(file, lines.join(eol));
console.log("answered", n);
