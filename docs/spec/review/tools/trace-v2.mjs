// Ad-hoc check of docs/spec/v2.md against its Appendix B rules 1 to 6 and 8.
// Usage: node trace-v2.mjs <spec> [<previous version of the spec>]
// With a previous version, rule 5 also checks that no ID it had is gone (a deleted entry instead of a withdrawn one).
import { readFileSync } from "node:fs";
const text = readFileSync(process.argv[2], "utf8");
const problems = [];
// IDs a text names, with whether each citation carries a forward mark (rule 8): "(CH-9, →M2)" or "CH-9 (→M2)".
const cite = (s) => {
  const ids = [];
  for (const m of s.matchAll(/\b([A-Z]+)-(\d+)(?: to (?:\1-)?(\d+))?/g)) {
    const [, area, a, b] = m;
    const mark = s.slice(m.index + m[0].length).match(/^\)?[,\s]*\(?→M(\d)/);
    const to = mark ? +mark[1] : null;
    if (b) for (let i = +a; i <= +b; i++) ids.push({ id: `${area}-${i}`, to });
    else ids.push({ id: `${area}-${a}`, to });
  }
  return ids.filter(({ id }) => !/^(M\d|AC|ADR|RFC|S\d|G\d|Q\d)-?/.test(id));
};
const expand = (s) => cite(s).map((c) => c.id);
// Rules 1, 2 and 5: requirement definitions with milestone and evidence; withdrawn entries in §0's form.
const reqs = new Map(), withdrawn = new Set();
for (const m of text.matchAll(/^- \*\*([A-Z]+-\d+)\*\* (.*)$/gm)) {
  const [, id, rest] = m;
  if (reqs.has(id) || withdrawn.has(id)) problems.push(`duplicate requirement ${id}`);
  if (/^\(withdrawn/.test(rest)) {
    if (!/^\(withdrawn in v\d+\.\d+: [^)]+\)/.test(rest)) problems.push(`${id}: a withdrawn entry not in §0's form`);
    withdrawn.add(id);
    continue;
  }
  const head = rest.match(/^\(([^;)]*);\s*([A-Z, ]+)\)/);
  if (!head) { problems.push(`${id}: no milestone and evidence codes`); continue; }
  const miles = head[1].split(",").map((x) => x.trim()).filter((x) => /^M\d$/.test(x)).map((x) => +x.slice(1));
  if (!miles.length) problems.push(`${id}: no milestone`);
  if (!head[2].trim()) problems.push(`${id}: no evidence code`);
  reqs.set(id, miles);
}
const first = (id) => Math.min(...reqs.get(id)), last = (id) => Math.max(...reqs.get(id));
if (process.argv[3]) {
  const before = readFileSync(process.argv[3], "utf8");
  for (const m of before.matchAll(/^- \*\*([A-Z]+-\d+)\*\* /gm)) {
    if (!reqs.has(m[1]) && !withdrawn.has(m[1])) problems.push(`${m[1]}: in the previous version, now gone (rule 5)`);
  }
}
const reqText = new Map();
for (const m of text.matchAll(/^- \*\*([A-Z]+-\d+)\*\* ([\s\S]*?)(?=\n- \*\*|\n#|(?![\s\S]))/gm)) if (reqs.has(m[1])) reqText.set(m[1], m[2]);
// Milestones: Implements lines and ACs.
const implement = new Map(), cited = new Map(), acList = [];
const sections = text.split(/^### (M\d):/m);
for (let i = 1; i < sections.length; i += 2) {
  const m = sections[i], k = +m.slice(1), body = sections[i + 1].split(/^## /m)[0];
  const imp = body.match(/^Implements:([\s\S]*?)(?=\n\n- \*\*M\d-AC|\n\n- \*\*S\d|\n\n###|\n\n##|(?![\s\S]))/m);
  implement.set(m, new Set(imp ? expand(imp[1]) : []));
  const acs = new Set();
  for (const a of body.matchAll(/^- \*\*(M\d-AC\d+)\*\* ([\s\S]*?)(?=\n- \*\*M\d-AC|\n### |\n## |(?![\s\S]))/gm)) {
    const ids = expand(a[2]).filter((id) => reqs.has(id));
    if (!ids.length) problems.push(`${m}: an AC cites no requirement: ${a[2].slice(0, 60)}`);
    ids.forEach((x) => acs.add(x));
    acList.push({ ac: a[1], k, body: a[2] });
  }
  cited.set(m, acs);
}
// Rules 3 and 4.
for (const [id, miles] of reqs) {
  for (const n of miles) {
    const m = `M${n}`;
    if (!implement.get(m)?.has(id)) problems.push(`${id}: not in ${m}'s Implements`);
    else if (!cited.get(m)?.has(id)) problems.push(`${id}: in ${m}'s Implements but no ${m} AC cites it`);
  }
}
for (const [m, set] of implement) for (const id of set) if (!reqs.has(id)) problems.push(`${m} implements unknown ${id}`);
// Rule 6: a requirement is carried over exactly when it names a source as "(from …)", and Appendix A lists exactly those.
const appA = (text.split("## Appendix A")[1] || "").split("## Appendix B")[0];
const carried = new Set([...reqText].filter(([, body]) => /\(from /.test(body)).map(([id]) => id));
const appAIds = new Set();
for (const row of appA.split("\n")) {
  const cells = row.split("|");
  if (cells.length > 2 && !/^\s*(v2|-+)\s*$/.test(cells[1])) expand(cells[1]).forEach((id) => appAIds.add(id));
}
for (const id of carried) if (!appAIds.has(id)) problems.push(`${id}: carried over but not in Appendix A`);
for (const id of appAIds) {
  if (!reqs.has(id)) problems.push(`Appendix A names ${id}, which is not a requirement`);
  else if (!carried.has(id)) problems.push(`${id}: in Appendix A but names no source as "(from …)"`);
}
// Rule 8: no hidden forward dependency. A mark must name the cited requirement's (first) milestone.
const marks = (owner, at, list) => {
  for (const { id, to } of list) {
    if (to === null || !reqs.has(id)) continue;
    if (to !== first(id)) problems.push(`${owner}: the mark on ${id} says M${to}, but ${id} is M${first(id)}`);
    else if (first(id) <= at) problems.push(`${owner}: ${id} is marked →M${to}, but it is not later than M${at}`);
  }
};
for (const [id, body] of reqText) marks(id, last(id), cite(body));
const forward = new Set();
for (const { ac, k, body } of acList) {
  const list = cite(body).filter((c) => reqs.has(c.id));
  marks(ac, k, list);
  for (const { id, to } of list) {
    if (to !== null) continue;
    if (first(id) > k) forward.add(`${ac} cites ${id} (M${first(id)}) with no mark`);
    for (const c of cite(reqText.get(id) || "")) {
      if (reqs.has(c.id) && c.to === null && first(c.id) > Math.max(k, last(id))) forward.add(`${id} cites ${c.id} (M${first(c.id)}) with no mark (reached from ${ac})`);
    }
  }
}
// One line per citation that needs a mark, naming the first AC that reaches it.
const seen = new Set();
for (const f of forward) {
  const key = f.replace(/ \(reached from .*\)$/, "");
  if (!seen.has(key)) { seen.add(key); problems.push(f); }
}
const areas = {};
for (const id of reqs.keys()) areas[id.split("-")[0]] = (areas[id.split("-")[0]] || 0) + 1;
console.log(`${reqs.size} requirements ${JSON.stringify(areas)}${withdrawn.size ? `; ${withdrawn.size} withdrawn` : ""}; milestones ${[...implement.keys()].join(" ")}; ACs ${acList.length}`);
console.log(problems.length ? problems.join("\n") : "0 problems");
