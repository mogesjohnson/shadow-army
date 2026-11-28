// Checks Appendix C against the ideas lists, the order/ files and the spec's IDs.
// Usage: node check-appendix-c.mjs <appendix or spec file> <spec file> <the-future dir>
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const [appFile, specFile, futureDir] = process.argv.slice(2);
let text = readFileSync(appFile, "utf8");
if (text.includes("## Appendix C")) text = text.slice(text.indexOf("## Appendix C"));
const spec = readFileSync(specFile, "utf8");
const problems = [];

// The 118 IDs: the order doc's 108 plus R1-R5 and U1-U5.
const orderDoc = readFileSync(join(futureDir, "claude-shadow-ideas-order.md"), "utf8");
const ids = [...orderDoc.matchAll(/^### (?:⭐ )?([HMB]\d+)\./gm)].map((m) => m[1]);
for (let i = 1; i <= 5; i++) ids.push(`R${i}`, `U${i}`);
if (ids.length !== 118) problems.push(`expected 118 ideas, found ${ids.length}`);

// Group rows: first cell is an ID, five cells.
const rows = [];
let section = "";
for (const line of text.split("\n")) {
  if (line.startsWith("### ")) section = line.slice(4);
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length === 5 && /^[HMBRU]\d+$/.test(cells[0])) rows.push({ section, id: cells[0], cells });
}
const seen = new Map();
for (const r of rows) seen.set(r.id, (seen.get(r.id) || 0) + 1);
for (const id of ids) if (seen.get(id) !== 1) problems.push(`${id}: ${seen.get(id) || 0} rows`);
for (const id of seen.keys()) if (!ids.includes(id)) problems.push(`${id}: not an idea`);

// Order: rows follow the order doc's group order.
const orderIds = ids.slice(0, 108);
const rowIds = rows.map((r) => r.id).filter((id) => orderIds.includes(id));
if (rowIds.join() !== orderIds.join()) problems.push("rows are not in the order doc's order");

// Files: every order/ path exists, and every order/ file is used once.
const used = new Set();
for (const r of rows) {
  const m = r.cells[4].match(/^`(order\/[^`]+)`$/);
  if (m) {
    if (!existsSync(join(futureDir, m[1]))) problems.push(`${r.id}: missing file ${m[1]}`);
    if (!m[1].includes(`/${r.id}-`)) problems.push(`${r.id}: file is another idea's: ${m[1]}`);
    used.add(m[1]);
  } else if (!/^`agy-ink-research\.md`, [RU]\d$/.test(r.cells[4]) || !r.cells[4].endsWith(r.id)) problems.push(`${r.id}: bad file cell ${r.cells[4]}`);
}
const orderDir = join(futureDir, "order");
for (const g of readdirSync(orderDir)) for (const f of readdirSync(join(orderDir, g))) if (!used.has(`order/${g}/${f}`)) problems.push(`unused file order/${g}/${f}`);

// Verdicts.
const labels = ["Same", "Another way", "Partly", "New", "In the CLI", "Conflicts", "Coding note"];
const counts = Object.fromEntries(labels.map((l) => [l, 0]));
for (const r of rows) {
  const label = labels.find((l) => r.cells[3].startsWith(l));
  if (!label) problems.push(`${r.id}: verdict starts with no label: ${r.cells[3].slice(0, 30)}`);
  else counts[label]++;
}

// Could-add lists match the rows.
const v20Rows = rows.filter((r) => /Could add \(v2\.0/.test(r.cells[3])).map((r) => r.id).sort();
const v20Table = text.split("**For v2.0.**")[1].split("**After v2.0.**")[0];
const v20Listed = [...v20Table.matchAll(/^\| ([^|]+) \|/gm)].flatMap((m) => m[1].split(",").map((s) => s.trim())).filter((s) => /^[HMBRU]\d+$/.test(s)).sort();
if (v20Rows.join() !== v20Listed.join()) problems.push(`v2.0 list ${v20Listed} vs rows ${v20Rows}`);
const afterRows = rows.filter((r) => /Could add \(after v2\.0/.test(r.cells[3])).map((r) => r.id).sort();
const afterPara = text.split("**After v2.0.**")[1].split("\n### ")[0];
const afterListed = [...new Set([...afterPara.matchAll(/\b([HMBRU]\d+)\b/g)].map((m) => m[1]))].sort();
if (afterRows.join() !== afterListed.join()) problems.push(`after-v2.0 list ${afterListed} vs rows ${afterRows}`);

// Every spec ID cited exists.
const reqs = new Set([...spec.matchAll(/^- \*\*([A-Z]+-\d+)\*\*/gm)].map((m) => m[1]));
const acs = new Set([...spec.matchAll(/^- \*\*(M\d-AC\d+)\*\*/gm)].map((m) => m[1]));
for (const m of text.matchAll(/\b([A-Z]{2,5}-\d+)\b/g)) {
  const id = m[1];
  if (/^ADR-/.test(id)) { if (!spec.includes(`| ${id.slice(4)} |`)) problems.push(`unknown ${id}`); continue; }
  if (/^M\d-AC/.test(id)) continue;
  if (!reqs.has(id)) problems.push(`unknown requirement ${id}`);
}
for (const m of text.matchAll(/\b(M\d-AC\d+)\b/g)) if (!acs.has(m[1])) problems.push(`unknown AC ${m[1]}`);
for (const m of text.matchAll(/\b([GQ]\d)\b/g)) if (!new RegExp(`\\*\\*${m[1]}[ *]`).test(spec)) problems.push(`unknown ${m[1]}`);

// The six v2.1 designs: one row each, the status ADR-0015 gives, and a text file that exists.
const designs = { "War Table": ["Held", 1], "Timeline": ["Held", 2], "Gatehouse": ["Adopted", 3], "Review Desk": ["Not adopted", 4], "Margin": ["Adopted", 5], "Summoning Circle": ["Not adopted", 6] };
const checkout = process.env.MAIN_CHECKOUT || "C:/Users/johns/projects/AIConnections";
const designRows = [];
for (const line of text.split("\n")) {
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length === 5 && cells[0] in designs) designRows.push(cells);
}
for (const [name, [status, n]] of Object.entries(designs)) {
  const found = designRows.filter((c) => c[0] === name);
  if (found.length !== 1) { problems.push(`design ${name}: ${found.length} rows`); continue; }
  const [cells] = found;
  if (!cells[3].startsWith(status)) problems.push(`design ${name}: status should start "${status}"`);
  const file = `.shadow/v2-tools/v21/out/d${n}.txt`;
  if (cells[4] !== `\`${file}\``) problems.push(`design ${name}: file should be ${file}`);
  if (!existsSync(join(checkout, file))) problems.push(`design ${name}: missing ${file}`);
}

console.log(`rows ${rows.length}; verdicts ${JSON.stringify(counts)}; v2.0 ${v20Rows.length}; after ${afterRows.length}; designs ${designRows.length}`);
console.log(problems.length ? problems.join("\n") : "0 problems");
