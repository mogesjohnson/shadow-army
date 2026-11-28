// Turn a text file of OLD/NEW blocks into rep.mjs's pairs JSON: node pairs.mjs <blocks.txt> <pairs.json>
// A block is a line "<<< OLD", the old text, a line "=== NEW", the new text, and a line ">>> END".
// Lines outside blocks are comments. Write the old text exactly as the spec has it.
import { readFileSync, writeFileSync } from "node:fs";
const [src, out] = process.argv.slice(2);
const t = readFileSync(src, "utf8").replace(/\r\n/g, "\n");
const re = /^<<< OLD\n([\s\S]*?)\n=== NEW\n([\s\S]*?)\n>>> END$/gm;
const pairs = [...t.matchAll(re)].map((m) => [m[1], m[2]]);
const opened = (t.match(/^<<< OLD$/gm) ?? []).length;
if (opened !== pairs.length) { console.log(`${opened} blocks opened, ${pairs.length} complete`); process.exit(1); }
writeFileSync(out, JSON.stringify(pairs, null, 1));
console.log("wrote", pairs.length, "pairs to", out);
