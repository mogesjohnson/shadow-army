// Usage: node packet.mjs <out.md> <title> <raw.md>:<index>=<ID>[,...] ...
// Copies findings (split on "- severity:") from raw reviewer files into a verification packet, each headed by its ID.
import { readFileSync, writeFileSync } from "node:fs";
const [out, title, ...specs] = process.argv.slice(2);
const cache = {};
const items = (f) => cache[f] ??= readFileSync(f, "utf8").split(/\n(?=- severity:)/).filter((s) => s.startsWith("- severity:")).map((s) => s.replace(/\n(Coverage|No P0|Unit |Findings)[\s\S]*$/, "").trimEnd());
let body = `# ${title}\n`;
for (const spec of specs) {
  const [file, picks] = spec.split(":");
  for (const p of picks.split(",")) {
    const [i, id] = p.split("=");
    const it = items(file)[+i - 1];
    if (!it) { console.error("missing", file, i); process.exit(1); }
    body += `\n## ${id}\n\n${it}\n`;
  }
}
writeFileSync(out, body);
console.log("wrote", out, body.length, "chars");
