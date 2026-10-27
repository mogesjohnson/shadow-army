// Insert round 4's rows after the last existing row of each prefix (R-M1-, R-F-).
// node addrows.mjs <ledger.md> <rows.txt>
import { readFileSync, writeFileSync } from "node:fs";
const [file, rowsFile] = process.argv.slice(2);
const t = readFileSync(file, "utf8");
const eol = t.includes("\r\n") ? "\r\n" : "\n";
const lines = t.split(/\r?\n/);
const rows = readFileSync(rowsFile, "utf8").split(/\r?\n/).filter((l) => l.startsWith("| R-"));
for (const prefix of ["R-M1-", "R-F-"]) {
  const mine = rows.filter((r) => r.startsWith(`| ${prefix}`));
  for (const r of mine) if (lines.includes(r) || lines.some((l) => l.startsWith(r.split(" | ")[0] + " |"))) throw new Error("exists: " + r.slice(0, 14));
  let at = -1;
  lines.forEach((l, i) => { if (l.startsWith(`| ${prefix}`)) at = i; });
  lines.splice(at + 1, 0, ...mine);
  console.log(prefix, mine.length, "after line", at + 1);
}
writeFileSync(file, lines.join(eol));
