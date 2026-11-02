// Save a subagent's final report from its task transcript (JSONL) to a file, with a header line.
// node save-report.mjs <subagents/agent-<id>.jsonl> <out.md> "<header line>"
// Takes a hand-back tool call's longest string if there is one, else the last assistant text.
import fs from 'node:fs';
const [, , src, out, header] = process.argv;
const lines = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean);
let handback = null;
let lastText = null;
for (const line of lines) {
  let o;
  try { o = JSON.parse(line); } catch { continue; }
  if (o?.message?.role !== 'assistant') continue;
  const content = o.message.content;
  if (!Array.isArray(content)) continue;
  const texts = content.filter((b) => b.type === 'text' && b.text.trim()).map((b) => b.text);
  if (texts.length) lastText = texts.join('\n\n');
  for (const b of content) {
    if (b.type === 'tool_use' && /handback/i.test(b.name)) {
      handback = Object.values(b.input).find((v) => typeof v === 'string' && v.length > 200) ?? handback;
    }
  }
}
const body = handback ?? lastText;
if (!body) { console.error('no report found'); process.exit(1); }
fs.writeFileSync(out, `${header}\n\n${body.trim()}\n`);
console.log(`${out}: ${body.length} chars, from ${handback ? 'hand-back' : 'last text'}`);
