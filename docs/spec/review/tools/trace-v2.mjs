// Ad-hoc check of docs/spec/v2.md against its Appendix B rules 1-4 and 6.
import { readFileSync } from "node:fs";
const text = readFileSync(process.argv[2], "utf8");
const problems = [];
const expand = (s) => {
  const ids = [];
  for (const m of s.matchAll(/\b([A-Z]+)-(\d+)(?: to (?:\1-)?(\d+))?/g)) {
    const [, area, a, b] = m;
    if (b) for (let i = +a; i <= +b; i++) ids.push(`${area}-${i}`);
    else ids.push(`${area}-${a}`);
  }
  return ids.filter((id) => !/^(M\d|AC|ADR|RFC|S\d|G\d|Q\d)-?/.test(id));
};
// Rule 1-2: requirement definitions with milestone and evidence.
const reqs = new Map();
for (const m of text.matchAll(/^- \*\*([A-Z]+-\d+)\*\* \(([^;)]*);\s*([A-Z, ]+)\)/gm)) {
  const [, id, ms, ev] = m;
  if (reqs.has(id)) problems.push(`duplicate requirement ${id}`);
  const miles = ms.split(",").map((x) => x.trim()).filter((x) => /^M\d$/.test(x));
  if (!miles.length) problems.push(`${id}: no milestone`);
  if (!ev.trim()) problems.push(`${id}: no evidence code`);
  reqs.set(id, miles);
}
// Milestones: Implements lines and ACs.
const implement = new Map(), cited = new Map();
const sections = text.split(/^### (M\d):/m);
for (let i = 1; i < sections.length; i += 2) {
  const m = sections[i], body = sections[i + 1].split(/^## /m)[0];
  const imp = body.match(/^Implements:([\s\S]*?)(?=\n\n- \*\*M\d-AC|\n\n- \*\*S\d|\n\n###|\n\n##|(?![\s\S]))/m);
  implement.set(m, new Set(imp ? expand(imp[1]) : []));
  const acs = new Set();
  for (const a of body.matchAll(/^- \*\*M\d-AC\d+\*\* ([\s\S]*?)(?=\n- \*\*M\d-AC|\n### |\n## |(?![\s\S]))/gm)) {
    const ids = expand(a[1]).filter((id) => reqs.has(id));
    if (!ids.length) problems.push(`${m}: an AC cites no requirement: ${a[1].slice(0, 60)}`);
    ids.forEach((x) => acs.add(x));
  }
  cited.set(m, acs);
}
// Rule 3 and 4.
for (const [id, miles] of reqs) {
  for (const m of miles) {
    if (!implement.get(m)?.has(id)) problems.push(`${id}: not in ${m}'s Implements`);
    else if (!cited.get(m)?.has(id)) problems.push(`${id}: in ${m}'s Implements but no ${m} AC cites it`);
  }
}
for (const [m, set] of implement) for (const id of set) if (!reqs.has(id)) problems.push(`${m} implements unknown ${id}`);
// Rule 6: carried-over requirements appear in Appendix A. A requirement is carried over when its text says
// so ("(from ...", "carries over", "as in 2.0's"), or when it is on the known list (which also holds the v1
// design rules that do not say it). Only IDs this spec defines are checked, so one checker serves every version.
const appA = (text.split("## Appendix A")[1] || "").split("## Appendix B")[0];
const reqText = new Map();
for (const m of text.matchAll(/^- \*\*([A-Z]+-\d+)\*\* ([\s\S]*?)(?=\n- \*\*|\n#|(?![\s\S]))/gm)) reqText.set(m[1], m[2]);
const KNOWN = ["WSP-1", "WSP-2", "WSP-3", "WSP-4", "WSP-5", "WSP-6", "WSP-7", "WSP-8", "WSP-9", "CH-7", "ARM-1", "ARM-2", "ARM-3", "ARM-5", "ARM-6", "MSG-1", "VIS-1"];
const carried = new Set(KNOWN.filter((id) => reqs.has(id)));
for (const [id, body] of reqText) if (reqs.has(id) && /\(from |carr(?:y|ies) over|as in 2\.0's/.test(body)) carried.add(id);
const appAIds = new Set();
for (const row of appA.split("\n")) {
  const cells = row.split("|");
  if (cells.length > 2 && !/^\s*(v2|-+)\s*$/.test(cells[1])) expand(cells[1]).forEach((id) => appAIds.add(id));
}
for (const id of carried) if (!appAIds.has(id)) problems.push(`${id}: carried over but not in Appendix A`);
for (const id of appAIds) if (!reqs.has(id)) problems.push(`Appendix A names ${id}, which is not a requirement`);
const areas = {};
for (const id of reqs.keys()) areas[id.split("-")[0]] = (areas[id.split("-")[0]] || 0) + 1;
console.log(`${reqs.size} requirements ${JSON.stringify(areas)}; milestones ${[...implement.keys()].join(" ")}; ACs ${[...text.matchAll(/^- \*\*M\d-AC\d+\*\*/gm)].length}`);
console.log(problems.length ? problems.join("\n") : "0 problems");
