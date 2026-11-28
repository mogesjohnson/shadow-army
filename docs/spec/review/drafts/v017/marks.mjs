// Append V16-FC1's verdicts and the owner's D-26 to D-29 answers to the ledger's last column.
// node marks.mjs <ledger.md>
import { readFileSync, writeFileSync } from "node:fs";
const file = process.argv[2];
const t = readFileSync(file, "utf8");
const eol = t.includes("\r\n") ? "\r\n" : "\n";
const lines = t.split(/\r?\n/);
const fixed = "Fix-checked: FIXED (V16-FC1)";
const notes = {
  "R-M1-161": fixed, "R-M1-168": fixed, "R-M1-164": fixed, "R-M1-172": fixed, "R-M1-174": fixed,
  "R-M1-165": fixed, "R-M1-166": fixed, "R-M1-177": fixed, "R-M1-181": fixed, "R-M1-160": `${fixed} (D-25 A)`,
  "R-F-117": `${fixed} (D-24 B)`, "R-F-132": fixed, "R-F-133": fixed, "R-F-134": fixed, "R-F-135": fixed, "R-F-136": fixed,
  "R-F-137": fixed, "R-F-139": fixed, "R-F-143": `${fixed}; exposed R-M1-182`, "R-F-144": fixed, "R-F-145": fixed,
  "R-F-146": fixed, "R-F-147": fixed, "R-F-148": `${fixed} (the list half)`, "R-F-149": `${fixed}; H13 repaired in v0.17 (R-M1-192)`,
  "R-F-151": `${fixed}; HOST-11 repaired in v0.17 (R-M1-192)`, "R-F-152": fixed, "R-F-154": fixed, "R-F-155": fixed,
  "R-M1-169": `${fixed} for npm from the registry or a tarball; mirrors and pnpm are R-M1-184, repaired in v0.17 with D-28 A`,
  "R-M1-173": `${fixed} (the technical half); D-29 answered A (2026-10-23), applied in v0.17: \`SHADOW_ARMY_SNAPSHOTS\` (WSP-11)`,
  "R-M1-176": "V16-FC1: the guard half NOT FIXED (a timed-out guard command's hold had no way out); repaired in v0.17 with R-M1-183",
  "R-M1-171": "V16-FC1: wrong as written (section 5.1 C had no such recording); repaired in v0.17: section 5.1 C records the refused start",
  "R-M1-163": "D-26 answered A (2026-10-23), applied in v0.17: WSP-4 exempts a branch that comes with a working tree WSP-10 leaves out, and other armies' refs; M6-AC9, residual 13",
  "R-M1-167": "D-27 answered B (2026-10-23), applied in v0.17: a non-goal (section 1), PO-14's message, PO-19, M1-AC18; signing listed for a later version",
  "R-M1-170": "D-28 answered A (2026-10-23), applied in v0.17: HOST-1, PO-13, PO-21, M1-AC17, M1-AC22",
};
let n = 0;
for (const [id, note] of Object.entries(notes)) {
  const i = lines.findIndex((l) => l.startsWith(`| ${id} |`));
  if (i < 0) { console.log("missing", id); continue; }
  lines[i] = lines[i].replace(/ \|\s*$/, `; ${note} |`);
  n++;
}
writeFileSync(file, lines.join(eol));
console.log("marked", n);
