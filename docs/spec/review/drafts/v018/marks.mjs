// Append V17-FC1's verdicts to the ledger's last column, then add its new rows (rows.txt) after R-M1-192.
// node marks.mjs <ledger.md> <rows.txt>
import { readFileSync, writeFileSync } from "node:fs";
const [file, rowsFile] = process.argv.slice(2);
const t = readFileSync(file, "utf8");
const eol = t.includes("\r\n") ? "\r\n" : "\n";
const lines = t.split(/\r?\n/);
const fixed = "Fix-checked: FIXED (V17-FC1)";
const notes = {
  "R-M1-182": "V17-FC1: NOT FIXED for relative `PATH` entries (fixed for cmd.exe's own current-folder search and for launchctl); repair pending (v0.18) as R-M1-193",
  "R-M1-183": "V17-FC1: NOT FIXED (no pane key retries, HOST-14 doesn't list the hold, nothing lifts it from M2 to M4); repair pending (v0.18) as R-M1-199",
  "R-M1-184": `${fixed}; follow-up R-M1-202`,
  "R-M1-163": `${fixed} (D-26 A as chosen); follow-ups R-M1-203, R-M1-204`,
  "R-M1-167": `${fixed} (D-27 B)`,
  "R-M1-170": `${fixed} (D-28 A as chosen); follow-ups R-M1-194, R-M1-195`,
  "R-M1-173": `${fixed} (D-29 A as chosen); follow-ups R-M1-196 to R-M1-198`,
  "R-M1-176": `${fixed} for the retry and sleep; the hold's remainder is R-M1-199`,
  "R-M1-186": "V17-FC1: wrong as applied (`git worktree prune` acts on the whole repository); repair pending (v0.18) as R-M1-200",
  "R-M1-187": "V17-FC1: wrong as applied (M1-AC1 still fakes 2.1.285); repair pending (v0.18) as R-M1-201",
  "R-M1-171": fixed, "R-M1-185": fixed, "R-M1-188": fixed, "R-M1-189": fixed,
  "R-M1-190": fixed, "R-M1-191": fixed, "R-M1-192": fixed,
};
let n = 0;
for (const [id, note] of Object.entries(notes)) {
  const i = lines.findIndex((l) => l.startsWith(`| ${id} |`));
  if (i < 0) { console.log("missing", id); continue; }
  lines[i] = lines[i].replace(/ \|\s*$/, `; ${note} |`);
  n++;
}
const rows = readFileSync(rowsFile, "utf8").split(/\r?\n/).filter((l) => l.startsWith("| R-"));
const at = lines.findIndex((l) => l.startsWith("| R-M1-192 |"));
if (lines.some((l) => l.startsWith("| R-M1-193 |"))) throw new Error("rows already added");
lines.splice(at + 1, 0, ...rows);
writeFileSync(file, lines.join(eol));
console.log("marked", n, "added", rows.length);
