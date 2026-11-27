import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// VER-7: an ID has one of this spec's prefixes; other text, such as UTF-8 or SHA-256, is no ID.
const PREFIXES = "HOST|PO|CH|SI|MSG|SES|ARM|WSP|SEC|VIS|SET|OBS|VER|LEG";
// Evidence a test can give; R and L evidence is recorded on the PR (VER-8).
const TESTED_EVIDENCE = new Set(["U", "C", "I", "X", "F", "S"]);
const RANGE = new RegExp(`\\b(${PREFIXES})-(\\d+)(?:[ \\t]+to[ \\t]+(?:(${PREFIXES})-)?(\\d+))?`, "g");
const DEFINITION = new RegExp(`^- \\*\\*((?:${PREFIXES})-\\d+)\\*\\*(.*)$`);
const TEST_ID = new RegExp(`\\b(?:(?:${PREFIXES})-\\d+|M\\d+-AC\\d+)\\b`, "g");
const EVIDENCE = new Set(["U", "C", "I", "X", "F", "S", "L", "R"]);
// A source marker in a requirement's own text: "(from 2.0 WS-1)", "as in 2.0's CFG-4", or "carries over v1's rule".
const SOURCE_MARKER = /\(from\s+([^)]*)\)|as in 2\.0's\s+([A-Z]+-\d+)|carr(?:y|ies) over v1's|v1's [^.\n]*? carr(?:y|ies) over/gi;
// Sources Appendix A's row may name although the requirement's own text doesn't (the older shipped spec). A spec
// whose text cites them too passes as well (the review spec's PO-8), so the entry is a compatibility allowance. ARM-1, ARM-2 and ARM-5 carry v1's design rules with no
// marker or reference; PO-8 and ARM-6 take further v1 and 2.0 guard rules named only in the table.
const APPENDIX_ONLY_SOURCE = new Map([["ARM-1", []], ["ARM-2", []], ["ARM-5", []], ["PO-8", ["#22", "#16"]], ["ARM-6", ["GUARD-3"]]]);
// A legacy source: "GIT-1", "#16", or a range "GIT-1 to GIT-4" / "GIT-1 to 4".
const LEGACY_REF = /\b([A-Z]+)-(\d+)(?:[ \t]+to[ \t]+(?:([A-Z]+)-)?(\d+)(?![.\d]))?\b|#\d+/g;

/** Every legacy source in `text`, with each range expanded so that none is compared by its endpoints alone. */
function legacyRefs(text, problems) {
  const refs = [];
  for (const match of text.matchAll(LEGACY_REF)) {
    const [whole, area, first, endArea, last] = match;
    if (area === undefined) refs.push(whole);
    else if (last === undefined) refs.push(`${area}-${first}`);
    else if (!Number.isSafeInteger(Number(first)) || !Number.isSafeInteger(Number(last)) || (endArea && endArea !== area) || Number(last) < Number(first) || Number(last) - Number(first) > 10_000) {
      problems.push(`invalid legacy range ${whole}`);
      refs.push(`${area}-${first}`, `${endArea ?? area}-${last}`);
    } else for (let n = Number(first); n <= Number(last); n++) refs.push(`${area}-${n}`);
  }
  return refs;
}

export function expandReferences(text, problems = []) {
  const ids = [];
  for (const match of text.matchAll(RANGE)) {
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
    // Any heading ends the section before it; an unnumbered one leaves none.
    const heading = lines[n].match(/^#{1,6}\s+(.*)$/);
    if (heading) section = heading[1].match(/^(\d+(?:\.\d+)*)\b/)?.[1] ?? "";
    const definition = lines[n].match(DEFINITION);
    if (!definition) continue;
    const [, id, rest] = definition;
    if (!(section === "4" || section.startsWith("4.") || section === "5.2" || section === "5.3")) {
      problems.push(`${id}: requirement is outside sections 4, 5.2 and 5.3`);
    }
    if (requirements.has(id)) problems.push(`duplicate requirement ${id}`);
    // Appendix B rule 5: a withdrawn requirement keeps its place, and rules 2 to 4 skip it.
    const withdrawn = /^\s*\(withdrawn\b/.test(rest);
    const metadata = rest.match(/^\s*\(([^;()]*);\s*([^()]*)\)/);
    const milestones = metadata?.[1].split(",").map((item) => item.trim()).filter(Boolean) ?? [];
    const evidence = metadata?.[2].split(",").map((item) => item.trim()).filter(Boolean) ?? [];
    if (!withdrawn) {
      if (!milestones.length || milestones.some((item) => !/^M\d+$/.test(item))) problems.push(`${id}: missing or invalid milestone`);
      if (!evidence.length || evidence.some((item) => !EVIDENCE.has(item))) problems.push(`${id}: missing or invalid evidence code`);
    }
    let end = n + 1;
    while (end < lines.length && !/^- \*\*|^#{1,6}\s/.test(lines[end])) end++;
    requirements.set(id, { milestones: withdrawn ? [] : milestones, evidence: withdrawn ? [] : evidence, withdrawn, body: lines.slice(n, end).join("\n") });
  }

  const implementsByMilestone = new Map();
  const citationsByMilestone = new Map();
  const acceptance = new Set();
  const headings = [...text.matchAll(/^### (M\d+):[^\n]*\n/gm)];
  const bodies = [];
  for (const heading of headings) {
    const milestone = heading[1];
    if (implementsByMilestone.has(milestone)) problems.push(`duplicate milestone ${milestone}`);
    const start = heading.index + heading[0].length;
    const tail = text.slice(start);
    const nextHeading = tail.search(/^#{1,3}\s/m);
    const body = nextHeading < 0 ? tail : tail.slice(0, nextHeading);
    bodies.push([start, start + body.length]);
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
    if (!bodies.some(([from, to]) => match.index >= from && match.index < to)) problems.push(`${match[1]}: acceptance criterion is outside a milestone`);
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
  // Rule 6: a requirement's source marker and its Appendix A row must agree.
  const rows = new Map();
  for (const row of appendix.split("\n")) {
    const cells = row.split("|");
    if (cells.length > 2) {
      for (const id of new Set(expandReferences(cells[1], problems))) {
        if (rows.has(id)) problems.push(`Appendix A lists ${id} twice`);
        else rows.set(id, cells[2]);
      }
    }
  }
  for (const [id, { body, withdrawn }] of requirements) {
    if (withdrawn) continue;
    const marked = [...body.matchAll(SOURCE_MARKER)];
    // A marker may also name this spec's own requirements (WSP-10's config); only legacy sources must be in the row.
    const cited = new Set(marked.flatMap((marker) => legacyRefs(marker[1] ?? marker[2] ?? "", problems)).filter((ref) => !requirements.has(ref)));
    const row = rows.get(id);
    const expected = marked.length > 0 || APPENDIX_ONLY_SOURCE.has(id);
    if (expected && row === undefined) problems.push(`${id}: carried over but not in Appendix A`);
    else if (!expected && row !== undefined) problems.push(`${id}: in Appendix A but its text names no source`);
    else if (row !== undefined) {
      const listed = new Set(legacyRefs(row, problems).filter((ref) => !requirements.has(ref)));
      for (const ref of cited) if (!listed.has(ref)) problems.push(`${id}: cites ${ref}, which Appendix A's row doesn't`);
      const only = APPENDIX_ONLY_SOURCE.get(id) ?? [];
      for (const ref of only) if (!listed.has(ref)) problems.push(`${id}: appendix-only source ${ref} is not in Appendix A's row`);
      for (const ref of listed) if (!cited.has(ref) && !only.includes(ref)) problems.push(`${id}: Appendix A's row names ${ref}, which its text doesn't`);
      if (!/\S/.test(row)) problems.push(`${id}: Appendix A's row names no source`);
    }
  }
  for (const id of rows.keys()) if (!requirements.has(id)) problems.push(`Appendix A names unknown requirement ${id}`);
  return {
    requirements: requirements.size,
    acceptanceCriteria: acceptance.size,
    milestones: [...implementsByMilestone.keys()],
    problems,
    requirementIds: requirements,
    acceptanceIds: acceptance,
  };
}

/** Parses docs/spec/implemented.txt: the milestone being built on line 1, then one requirement ID per line. */
export function parseImplemented(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  const problems = [];
  const milestone = lines[0] ?? "";
  if (!/^M\d+$/.test(milestone)) problems.push(`implemented list: first line must be the milestone being built, as M2, not "${milestone}"`);
  const ids = new Set();
  for (const line of lines.slice(1)) {
    if (!new RegExp(`^(?:${PREFIXES})-\\d+$`).test(line)) problems.push(`implemented list: "${line}" is not a requirement ID`);
    else ids.add(line);
  }
  return { milestone, ids, problems };
}

/**
 * The text of a test file that can name a requirement: its comments and the titles of its it, test and
 * describe calls. Other strings are fixtures, so an ID inside one counts for nothing.
 */
export function testReferenceText(source) {
  const out = [];
  // A call's callee: it, test or describe with members (it.skip), not a method of another object (re.test).
  const calleePattern = /(?<![\w$#])(?:it|test|describe)((?:\.[A-Za-z]+)*)\s*$/;
  // A member call, whatever sits between the dot and the name, is no test call. Comments never reach `code`.
  const callee = { exec: (code) => { const m = calleePattern.exec(code); return m && !/(?<!\.\.)\.\s*$/.test(code.slice(0, m.index)) ? m : null; } };
  const factory = /\.(?:each|for|skipIf|runIf|extend)$/;
  // One flag per open parenthesis: whether its first argument is a test title.
  const open = [];
  // Set once a factory call's ")" (or a factory's tagged template) closes: a "(" right after it opens a curried title.
  let closed = false;
  let code = "";
  for (let i = 0; i < source.length; ) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      out.push(source.slice(i, end < 0 ? source.length : end));
      i = end < 0 ? source.length : end;
    } else if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      out.push(source.slice(i, end < 0 ? source.length : end));
      i = end < 0 ? source.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const isTitle = open[open.length - 1] === true && /\(\s*$/.test(code);
      const tagged = c === "`" && factory.test(callee.exec(code)?.[1] ?? "");
      let text = "";
      for (i++; i < source.length && source[i] !== c; i++) {
        if (source[i] === "\\") i++;
        else if (c === "`" && source[i] === "$" && source[i + 1] === "{") {
          // Skip a template's substitution as code, up to its closing brace.
          for (let depth = 0; i < source.length; i++) {
            if (source[i] === "{") depth++;
            else if (source[i] === "}" && --depth === 0) break;
          }
        } else text += source[i];
      }
      i++;
      if (isTitle) out.push(text);
      code = (code + '""').slice(-60);
      closed = tagged;
    } else if (c === "/" && /(?:^|[(,=:[!&|?{};>]|\b(?:return|typeof|case|void|yield|await|of|in))\s*$/.test(code)) {
      // A regular expression literal: skip it, since it may hold a quote.
      for (i++; i < source.length && source[i] !== "/" && source[i] !== "\n"; i++) {
        if (source[i] === "\\") i++;
        else if (source[i] === "[") while (i < source.length && source[i] !== "]") i += source[i] === "\\" ? 2 : 1;
      }
      i++;
      code = (code + "/r/").slice(-60);
      closed = false;
    } else {
      if (c === "(") {
        const direct = callee.exec(code);
        const isFactory = !closed && direct !== null && factory.test(direct[1]);
        // A title position: the call itself, or the call right after a factory such as it.each(...).
        open.push(closed || (direct !== null && !isFactory));
        closed = false;
        if (isFactory) open[open.length - 1] = "factory";
      } else if (c === ")") {
        closed = open.pop() === "factory";
      } else if (!/\s/.test(c)) closed = false;
      code = (code + c).slice(-60);
      i++;
    }
  }
  return out.join("\n");
}

/**
 * Appendix B rule 9 (VER-7). `trace` is checkSpecTrace's result, `implementedSource` the text of
 * implemented.txt and `tests` a list of { path, text }. Tests name IDs in a title or a comment; strings
 * that are fixtures are ignored (testReferenceText). A requirement is named only by its own ID: ranges do not count.
 */
export function checkTestReferences(trace, implementedSource, tests) {
  const implemented = parseImplemented(implementedSource);
  const problems = [...implemented.problems];
  const named = new Map();
  for (const { path, text } of tests) {
    for (const id of new Set(testReferenceText(text).match(TEST_ID) ?? [])) {
      if (!trace.requirementIds.has(id) && !trace.acceptanceIds.has(id)) problems.push(`${path}: names ${id}, which this spec doesn't have`);
      else if (!named.has(id)) named.set(id, path);
    }
  }
  const current = Number(implemented.milestone.slice(1));
  const required = new Set();
  for (const id of implemented.ids) {
    if (!trace.requirementIds.has(id)) problems.push(`implemented list: ${id} is not in this spec`);
    else required.add(id);
  }
  for (const [id, requirement] of trace.requirementIds) {
    // With two milestones, a requirement is of an earlier milestone once both are earlier.
    if (requirement.milestones.length && requirement.milestones.every((m) => Number(m.slice(1)) < current)) required.add(id);
  }
  for (const id of required) {
    const { evidence } = trace.requirementIds.get(id);
    if (evidence.some((code) => TESTED_EVIDENCE.has(code)) && !named.has(id)) problems.push(`${id}: implemented, but no test names it`);
  }
  return { required: required.size, named: named.size, problems };
}

/** Finds *.test.* files under the given directories: the repository's test suites, the mod's and this check's own. */
export function findTests(root, directories = ["src", "scripts", "plugins"]) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) walk(path);
      } else if (/\.test\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
        found.push({ path: relative(root, path).replaceAll("\\", "/"), text: readFileSync(path, "utf8") });
      }
    }
  };
  for (const directory of directories) {
    try {
      walk(join(root, directory));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return found;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    // Usage: check-spec-trace.mjs [spec.md] [--tests]. --tests adds rule 9 (CI): it reads
    // docs/spec/implemented.txt, or the path in --implemented=<file>, and the tests under src/, scripts/ and plugins/.
    const args = process.argv.slice(2);
    const root = fileURLToPath(new URL("..", import.meta.url));
    const path = args.find((arg) => !arg.startsWith("--")) ?? join(root, "docs/spec/v2.md");
    const implementedPath = args.find((arg) => arg.startsWith("--implemented="))?.slice(14) ?? join(root, "docs/spec/implemented.txt");
    const result = checkSpecTrace(readFileSync(path, "utf8"));
    const problems = [...result.problems];
    let summary = `${result.requirements} requirements; ${result.acceptanceCriteria} acceptance criteria`;
    if (args.includes("--tests")) {
      const tests = findTests(root);
      const rule9 = checkTestReferences(result, readFileSync(implementedPath, "utf8"), tests);
      problems.push(...rule9.problems);
      summary += `; ${rule9.required} requirements need a test, ${rule9.named} IDs named by ${tests.length} test files`;
    }
    console.log(`${summary}; ${problems.length} problems`);
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exitCode = 1;
  } catch (error) {
    console.error(`spec trace check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
