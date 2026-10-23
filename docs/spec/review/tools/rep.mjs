// Apply exact, unique replacements to a file: node rep.mjs <file> <pairs.json>
// pairs.json is [[old, new], ...]. Every old string must occur exactly once, or nothing is written.
import { readFileSync, writeFileSync } from "node:fs";
const [file, pairsFile] = process.argv.slice(2);
let t = readFileSync(file, "utf8");
const crlf = t.includes("\r\n");
const pairs = JSON.parse(readFileSync(pairsFile, "utf8"));
let bad = 0;
for (const [a0, b0] of pairs) {
  const a = crlf ? a0.replace(/\r?\n/g, "\r\n") : a0, b = crlf ? b0.replace(/\r?\n/g, "\r\n") : b0;
  const n = t.split(a).length - 1;
  if (n !== 1) { console.log(`${n}x: ${a0.slice(0, 100)}`); bad++; continue; }
  t = t.replace(a, () => b);
}
if (!bad) writeFileSync(file, t);
console.log(bad ? `${bad} not unique or missing; nothing written` : `${pairs.length} replacements written`);
