// Insert ledger rows after the last row with the same prefix: node insert-rows.mjs <ledger> <rows.txt>
// Each row in rows.txt starts with "| R-<unit>-"; rows go after the last existing row of that unit.
import { readFileSync, writeFileSync } from "node:fs";
const [ledger, rowsFile] = process.argv.slice(2);
const text = readFileSync(ledger, "utf8");
const eol = text.includes("\r\n") ? "\r\n" : "\n";
const lines = text.split(/\r?\n/);
const rows = readFileSync(rowsFile, "utf8").split(/\r?\n/).filter((l) => l.startsWith("| R-"));
for (const row of rows) {
  const id = row.split("|")[1].trim();
  if (lines.some((l) => l.startsWith(`| ${id} `))) { console.log(`${id} already there; nothing written`); process.exit(1); }
  const prefix = `| ${id.replace(/\d+$/, "")}`;
  let at = -1;
  lines.forEach((l, i) => { if (l.startsWith(prefix) && /^\d/.test(l.slice(prefix.length))) at = i; });
  if (at < 0) { console.log(`no ${prefix} rows; nothing written`); process.exit(1); }
  lines.splice(at + 1, 0, row);
}
writeFileSync(ledger, lines.join(eol));
console.log(`inserted ${rows.length} rows`);
