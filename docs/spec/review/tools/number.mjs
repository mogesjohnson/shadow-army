// Replace drafters' placeholder IDs with real ones: node number.mjs <file> <map.json>
// map.json is {"NEW-D3-1": "PO-9", ...}. A placeholder is matched whole (NEW-D3-1 never matches inside NEW-D3-10).
// Fails, writing nothing, if any NEW-D placeholder is left without a mapping.
import { readFileSync, writeFileSync } from "node:fs";
const [file, mapFile] = process.argv.slice(2);
const map = JSON.parse(readFileSync(mapFile, "utf8"));
let t = readFileSync(file, "utf8");
const counts = {};
t = t.replace(/NEW-D\d+-(?:AC)?\d+(?!\d)/g, (id) => {
  if (!(id in map)) return id;
  counts[id] = (counts[id] ?? 0) + 1;
  return map[id];
});
const left = [...new Set(t.match(/NEW-D\d+-(?:AC)?\d+(?!\d)/g) ?? [])];
if (left.length) { console.log("unmapped:", left.join(", ")); process.exit(1); }
writeFileSync(file, t);
console.log(Object.entries(counts).map(([k, n]) => `${k}→${map[k]} ×${n}`).join("\n"));
