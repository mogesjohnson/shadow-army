// Usage: TASKS_DIR=<the session's tasks folder> node extract.mjs <agentId> <dest.md> [header]
// Writes an agent's final report (its SubagentHandback message, else its last text) from its JSONL
// transcript to dest, without printing it. Claude Code keeps each background agent's transcript in
// <temp>/claude/<project>/<session>/tasks/<agentId>.output; never read that file into context whole.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const [id, dest, header = ""] = process.argv.slice(2);
const dir = (process.env.TASKS_DIR ?? ".").replace(/[\\/]?$/, "/");
const file = dir + id + ".output";
if (!existsSync(file)) { console.log("missing", file); process.exit(1); }
const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
let last = "", hand = "";
for (const l of lines) {
  let o; try { o = JSON.parse(l); } catch { continue; }
  const m = o.message;
  if (o.type === "assistant" && m && Array.isArray(m.content)) {
    const text = m.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    if (text.trim()) last = text;
    for (const b of m.content) if (b.type === "tool_use" && b.name === "SubagentHandback" && b.input && typeof b.input.message === "string") hand = b.input.message;
  }
}
if (hand) last = hand;
if (!last) { console.log("no assistant text in", lines.length, "lines"); process.exit(2); }
writeFileSync(dest, (header ? header + "\n\n" : "") + last + "\n");
console.log("wrote", dest, last.length, "chars");
