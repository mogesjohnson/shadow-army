// Mark V17-FC1's rows repaired in v0.18. node fixed.mjs <ledger.md>
import { readFileSync, writeFileSync } from "node:fs";
const [file] = process.argv.slice(2);
const t = readFileSync(file, "utf8");
const eol = t.includes("\r\n") ? "\r\n" : "\n";
const lines = t.split(/\r?\n/);
const done = "repaired in v0.18 (`drafts/v018/repairs.txt`); to fix-check";
let n = 0;
const mark = (id, f) => {
  const i = lines.findIndex((l) => l.startsWith(`| ${id} |`));
  if (i < 0) { console.log("missing", id); return; }
  const before = lines[i];
  lines[i] = f(lines[i]);
  if (lines[i] === before) console.log("unchanged", id); else n++;
};
for (let k = 193; k <= 205; k++) {
  mark(`R-M1-${k}`, (l) => l.replace(/repair pending \(v0\.18\)(: [^|]*?)? \|\s*$/, `${done}$1 |`));
}
const rest = { "R-M1-182": 193, "R-M1-183": 199, "R-M1-186": 200, "R-M1-187": 201 };
for (const [id, k] of Object.entries(rest)) {
  mark(id, (l) => l.replace(/ \|\s*$/, `; repaired in v0.18 as R-M1-${k}; to fix-check |`));
}
writeFileSync(file, lines.join(eol));
console.log("marked", n);
