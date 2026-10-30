// Copy the first fenced block of a saved report that holds OLD/NEW blocks into a draft file: node fence.mjs <raw.md> <draft.txt> "<first line>"
import { readFileSync, writeFileSync } from "node:fs";
const [src, out, head] = process.argv.slice(2);
const t = readFileSync(src, "utf8").replace(/\r\n/g, "\n");
const m = t.match(/^```[a-z]*\n([\s\S]*?<<< OLD[\s\S]*?)\n```$/m);
if (!m) { console.log("no fenced block with OLD/NEW blocks in", src); process.exit(1); }
writeFileSync(out, (head ? head + "\n\n" : "") + m[1] + "\n");
console.log("wrote", out, (m[1].match(/^<<< OLD$/gm) ?? []).length, "blocks");
