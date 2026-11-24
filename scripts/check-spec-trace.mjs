import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EVIDENCE = new Set(["U", "C", "I", "X", "F", "S", "L", "R"]);
// Carry-overs whose existing text does not repeat the source cue on every requirement.
const CARRY_OVERS = ["WSP-1", "WSP-2", "WSP-3", "WSP-4", "WSP-5", "WSP-6", "WSP-7", "WSP-8", "WSP-9", "CH-7", "ARM-1", "ARM-2", "ARM-3", "ARM-5", "ARM-6", "MSG-1", "VIS-1"];

export function expandReferences(text, problems = []) {
  const ids = [];
  for (const match of text.matchAll(/\b([A-Z][A-Z0-9]*)-(\d+)(?:[ \t]+to[ \t]+(?:([A-Z][A-Z0-9]*)-)?(\d+))?/g)) {
    const [, area, first, endArea, last] = match;
    if (!Number.isSafeInteger(Number(first)) || !Number.isSafeInteger(Number(last ?? first))
      || (last !== undefined && ((endArea && endArea !== area) || Number(last) < Number(first) || Number(last) - Number(first) > 10_000))) {
      problems.push(`invalid requirement range ${match[0]}`);
      continue;
    }
    for (let n = Number(first); n <= Number(last ?? first); n++) ids.push(`${area}-${n}`);
  }
  return ids;
}

/** Appendix B rules 1–4 and 6. Forward references are resolved after all definitions load. */
export function checkSpecTrace(source) {
  const text = source.replace(/\r\n?/g, "\n");
  const problems = [];
  const requirements = new Map();
  const lines = text.split("\n");
  let section = "";
  for (let n = 0; n < lines.length; n++) {
    const heading = lines[n].match(/^#{1,6}\s+(\d+(?:\.\d+)*)\b/);
    if (heading) section = heading[1];
    const definition = lines[n].match(/^- \*\*([A-Z][A-Z0-9]*-\d+)\*\*(.*)$/);
    if (!definition) continue;
    const [, id, rest] = definition;
    if (!(section === "4" || section.startsWith("4.") || section === "5.2" || section === "5.3")) {
      problems.push(`${id}: requirement is outside sections 4, 5.2 and 5.3`);
    }
    if (requirements.has(id)) problems.push(`duplicate requirement ${id}`);
    const metadata = rest.match(/^\s*\(([^;()]*);\s*([^()]*)\)/);
    const milestones = metadata?.[1].split(",").map((item) => item.trim()).filter(Boolean) ?? [];
    const evidence = metadata?.[2].split(",").map((item) => item.trim()).filter(Boolean) ?? [];
    if (!milestones.length || milestones.some((item) => !/^M\d+$/.test(item))) problems.push(`${id}: missing or invalid milestone`);
    if (!evidence.length || evidence.some((item) => !EVIDENCE.has(item))) problems.push(`${id}: missing or invalid evidence code`);
    let end = n + 1;
    while (end < lines.length && !/^- \*\*|^#{1,6}\s/.test(lines[end])) end++;
    requirements.set(id, { milestones, body: lines.slice(n, end).join("\n") });
  }

  const implementsByMilestone = new Map();
  const citationsByMilestone = new Map();
  const acceptance = new Set();
  const headings = [...text.matchAll(/^### (M\d+):[^\n]*\n/gm)];
  for (const heading of headings) {
    const milestone = heading[1];
    if (implementsByMilestone.has(milestone)) problems.push(`duplicate milestone ${milestone}`);
    const start = heading.index + heading[0].length;
    const tail = text.slice(start);
    const nextHeading = tail.search(/^#{1,3}\s/m);
    const body = nextHeading < 0 ? tail : tail.slice(0, nextHeading);
    const bodyLines = body.split("\n");
    const index = bodyLines.findIndex((line) => /^Implements:/.test(line));
    let implementation = "";
    if (index < 0) problems.push(`${milestone}: missing Implements`);
    else {
      implementation = bodyLines[index].replace(/^Implements:/, "");
      for (let n = index + 1; n < bodyLines.length && bodyLines[n].trim(); n++) implementation += `\n${bodyLines[n]}`;
    }
    const implemented = new Set(expandReferences(implementation, problems));
    implementsByMilestone.set(milestone, implemented);
    const cited = new Set();
    const acs = [...body.matchAll(/^- \*\*(M\d+-AC\d+)\*\*/gm)];
    for (let n = 0; n < acs.length; n++) {
      const ac = acs[n];
      const id = ac[1];
      if (acceptance.has(id)) problems.push(`duplicate acceptance criterion ${id}`);
      acceptance.add(id);
      if (!id.startsWith(`${milestone}-`)) problems.push(`${id}: belongs to another milestone`);
      const content = body.slice(ac.index + ac[0].length, acs[n + 1]?.index ?? body.length);
      const ids = expandReferences(content, problems);
      if (!ids.some((ref) => requirements.has(ref))) problems.push(`${id}: cites no requirement`);
      for (const ref of ids) {
        if (!requirements.has(ref)) problems.push(`${id}: cites unknown requirement ${ref}`);
        else cited.add(ref);
      }
    }
    citationsByMilestone.set(milestone, cited);
  }
  for (const match of text.matchAll(/^- \*\*(M\d+-AC\d+)\*\*/gm)) {
    if (!acceptance.has(match[1])) problems.push(`${match[1]}: acceptance criterion is outside a milestone`);
  }
  for (const [id, requirement] of requirements) {
    for (const milestone of requirement.milestones) {
      if (!implementsByMilestone.get(milestone)?.has(id)) problems.push(`${id}: not in ${milestone}'s Implements`);
    }
  }
  for (const [milestone, ids] of implementsByMilestone) {
    for (const id of ids) {
      if (!requirements.has(id)) problems.push(`${milestone}: implements unknown requirement ${id}`);
      else if (!citationsByMilestone.get(milestone)?.has(id)) problems.push(`${id}: in ${milestone}'s Implements but no ${milestone} AC cites it`);
    }
  }

  const appendix = text.match(/^## Appendix A[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? "";
  const appendixIds = new Set();
  for (const row of appendix.split("\n")) {
    const cells = row.split("|");
    if (cells.length > 2) expandReferences(cells[1], problems).forEach((id) => appendixIds.add(id));
  }
  const carried = new Set(CARRY_OVERS.filter((id) => requirements.has(id)));
  for (const [id, { body }] of requirements) {
    if (/\(from\s|carr(?:y|ies|ied) over|as in 2\.0's/i.test(body)) carried.add(id);
  }
  for (const id of carried) if (!appendixIds.has(id)) problems.push(`${id}: carried over but not in Appendix A`);
  for (const id of appendixIds) if (!requirements.has(id)) problems.push(`Appendix A names unknown requirement ${id}`);
  return { requirements: requirements.size, acceptanceCriteria: acceptance.size, milestones: [...implementsByMilestone.keys()], problems };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const path = process.argv[2] ?? fileURLToPath(new URL("../docs/spec/v2.md", import.meta.url));
    const result = checkSpecTrace(readFileSync(path, "utf8"));
    console.log(`${result.requirements} requirements; ${result.acceptanceCriteria} acceptance criteria; ${result.problems.length} problems`);
    for (const problem of result.problems) console.error(problem);
    if (result.problems.length) process.exitCode = 1;
  } catch (error) {
    console.error(`spec trace check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
