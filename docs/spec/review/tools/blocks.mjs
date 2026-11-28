// Builds replacement pairs that swap whole requirement or AC blocks for drafted text.
// Usage: node blocks.mjs <spec> <out.json> <ID>=<file.txt> ... [--pairs extra.json]
// A block runs from its "- **ID**" line to the line before the next top-level "- **" or heading.
import { readFileSync, writeFileSync } from "node:fs";
const [spec, out, ...args] = process.argv.slice(2);
const text = readFileSync(spec, "utf8").replace(/\r\n/g, "\n");
const pairs = [];
let extra = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--pairs") { extra = args[++i]; continue; }
  const [id, file] = args[i].split("=");
  const start = text.indexOf(`\n- **${id}** `);
  if (start < 0) throw new Error(`no block ${id}`);
  const rest = text.slice(start + 1);
  const m = rest.slice(1).search(/\n(- \*\*|#)/);
  const block = m < 0 ? rest : rest.slice(0, m + 1);
  const repl = readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (!repl.startsWith(`- **${id}** `)) throw new Error(`${file} does not start with ${id}`);
  pairs.push([block, repl]);
}
if (extra) pairs.push(...JSON.parse(readFileSync(extra, "utf8")));
writeFileSync(out, JSON.stringify(pairs, null, 1));
console.log(`${pairs.length} pairs`);
