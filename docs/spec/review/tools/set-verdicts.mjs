// Usage: node set-verdicts.mjs <ledger.md> <verdicts.json>
// verdicts.json: [{ "id": "R-F-1", "verdict": "CONFIRMED P1 (F-V1)", "resolution": "fix pending: ..." }, ...]
// Sets the Verdict and Resolution cells of each finding's ledger row (the row that starts "| <id> |").
import { readFileSync, writeFileSync } from "node:fs";
const [ledgerPath, verdictsPath] = process.argv.slice(2);
const verdicts = JSON.parse(readFileSync(verdictsPath, "utf8"));
const lines = readFileSync(ledgerPath, "utf8").split("\n");
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
let changed = 0;
for (const { id, verdict, resolution = "" } of verdicts) {
  const i = lines.findIndex((l) => l.startsWith(`| ${id} |`));
  if (i < 0) { console.error("no row for", id); process.exit(1); }
  const cells = lines[i].split(/(?<!\\)\|/);
  // cells: ["", " ID ", lens, sev, type, location, claim, verdict, resolution, ""]
  if (cells.length < 10) { console.error("unexpected row for", id); process.exit(1); }
  cells[cells.length - 3] = ` ${cell(verdict)} `;
  cells[cells.length - 2] = ` ${cell(resolution)} `;
  lines[i] = cells.join("|");
  changed++;
}
writeFileSync(ledgerPath, lines.join("\n"));
console.log("updated", changed, "rows");
