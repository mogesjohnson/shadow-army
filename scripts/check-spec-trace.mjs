import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// VER-7: an ID has one of this spec's prefixes; other text, such as UTF-8 or SHA-256, is no ID.
const PREFIXES = "HOST|PO|CH|SI|MSG|SES|ARM|WSP|SEC|VIS|SET|OBS|VER|LEG";
// Evidence a test can give; R and L evidence is recorded on the PR (VER-8).
const TESTED_EVIDENCE = new Set(["U", "C", "I", "X", "F", "S"]);
// A range's end is a number not followed by a decimal digit ("to 2.0 semantics"); a sentence's period after it is fine.
const RANGE = new RegExp(`\\b(${PREFIXES})-(\\d+)(?:\\s+to\\s+(?:(${PREFIXES})-)?(\\d+)(?!\\.\\d)\\b)?`, "g");
const DEFINITION = new RegExp(`^- \\*\\*((?:${PREFIXES})-\\d+)\\*\\*(.*)$`);
const TEST_ID = new RegExp(`\\b(?:(?:${PREFIXES})-\\d+|M\\d+-AC\\d+)\\b`, "g");
const EVIDENCE = new Set(["U", "C", "I", "X", "F", "S", "L", "R"]);
// A source marker in a requirement's own text: "(from 2.0 WS-1)", "as in 2.0's CFG-4", or "carries over v1's rule".
// The inline form names one source, a range or a list of them: "as in 2.0's GIT-1 to GIT-4, WS-2 and WS-3". Matched on
// text whose whitespace is collapsed (collapse), so that Markdown wrapping never splits a marker.
const LEGACY_SOURCE = "(?:[A-Z]+-\\d+(?:\\s+to\\s+(?:[A-Z]+-)?\\d+(?!\\.\\d)\\b)?|#\\d+)";
const SOURCE_MARKER = new RegExp(`\\(from\\s+([^)]*)\\)|as in 2\\.0's\\s+(${LEGACY_SOURCE}(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)${LEGACY_SOURCE})*)|carr(?:y|ies) over v1's`, "gi");
// "v1's rule ... carries over" within one line of the original text, so that wrapping into a sub-bullet cannot join them.
const V1_CARRY = /v1's [^.\n]*? carr(?:y|ies) over/i;
const collapse = (text) => text.replace(/\s+/g, " ").trim();
// Sources Appendix A's row may name although the requirement's own text doesn't (the older shipped spec). A spec
// whose text cites them too passes as well (the review spec's PO-8), so the entry is a compatibility allowance. ARM-1, ARM-2 and ARM-5 carry v1's design rules with no
// marker or reference; PO-8 and ARM-6 take further v1 and 2.0 guard rules named only in the table.
const APPENDIX_ONLY_SOURCE = new Map([["ARM-1", []], ["ARM-2", []], ["ARM-5", []], ["PO-8", ["#22", "#16"]], ["ARM-6", ["GUARD-3"]]]);
// A legacy source: "GIT-1", "#16", or a range "GIT-1 to GIT-4" / "GIT-1 to 4".
const LEGACY_REF = /\b([A-Z]+)-(\d+)(?:\s+to\s+(?:([A-Z]+)-)?(\d+)(?!\.\d)\b)?|#\d+/g;

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
        else rows.set(id, collapse(cells[2]));
      }
    }
  }
  for (const [id, { body, withdrawn }] of requirements) {
    if (withdrawn) continue;
    const marked = [...collapse(body).matchAll(SOURCE_MARKER)];
    // A marker may also name this spec's own requirements (WSP-10's config); only legacy sources must be in the row.
    const cited = new Set(marked.flatMap((marker) => legacyRefs(marker[1] ?? marker[2] ?? "", problems)).filter((ref) => !requirements.has(ref)));
    const row = rows.get(id);
    const expected = marked.length > 0 || V1_CARRY.test(body) || APPENDIX_ONLY_SOURCE.has(id);
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

// The lexer fails closed (review 131 C16). A "/" either surely starts a regular expression, surely divides, or is
// ambiguous; an ambiguous one is reported (AmbiguousSlash) and its file credits no ID, since a wrong guess can expose a
// regular expression's or a string's text as a title. A "/" divides only after a token that ends an expression on the
// same line: a name, number, string, template or regex, a ")" or "]", the "}" of an object literal, or a postfix ++, --
// or !. With a line break between them, that token may end a TypeScript type instead (let x: T, then ASI), so it is
// ambiguous; so is a "/" after "<" or ">", which may close a type's arguments or a JSX tag, and after a "}" whose brace
// may be a function's or a class's body, a declaration's or an expression's.
const REGEX_AFTER = new Set(["...", "(", ",", "=", ":", "[", "!", "&", "|", "?", "?.", "??", "{", ";", "+", "-", "*", "/", "%", "^", "~"]);
// A "{" after one of these opens an object literal; after ";", "{" or "}" (or nothing) it opens a block.
const OBJECT_AFTER = new Set(["...", "(", ",", "=", "[", "!", "&", "|", "?", "??", "<", "+", "-", "*", "/", "%", "^", "~"]);
const BLOCK_AFTER = new Set([";", "{", "}"]);
const BLOCK_KEYWORDS = new Set(["else", "do", "try", "finally"]);
// A line break after one of these ends the statement (ASI), so a "{" on the next line opens a block.
const RESTRICTED_KEYWORDS = new Set(["return", "throw", "yield", "break", "continue"]);
const EXPRESSION_KEYWORDS = new Set(["return", "typeof", "case", "void", "yield", "await", "in", "delete", "instanceof", "new", "throw"]);
const REGEX_KEYWORDS = new Set([...EXPRESSION_KEYWORDS, "else", "do", "default"]);
// The ")" closing the head of one of these is followed by a statement (or the "{" of a block).
const CONDITION_KEYWORDS = new Set(["if", "while", "for", "with"]);
const HEAD_KEYWORDS = new Set([...CONDITION_KEYWORDS, "switch", "catch"]);
const AWAIT = new Set(["await"]);
const TEST_CALLEES = new Set(["it", "test", "describe"]);
// it.each(table)(title) and describe.skipIf(flag)(title): the title comes after a second call or a tagged template.
const TEST_FACTORIES = new Set(["each", "for", "skipIf", "runIf", "extend"]);

class AmbiguousSlash extends Error {
  constructor(at, why) {
    super(why);
    this.at = at;
  }
}

/**
 * Splits `source` into code tokens: identifiers, strings, template literals, regular expressions, numbers and
 * punctuation. Whitespace and comments separate tokens without being one; each comment goes to `comments` with its
 * position. Throws AmbiguousSlash at a "/" it cannot classify.
 */
function lexCode(source, comments) {
  const identifier = /#?[\p{L}_$][\p{L}\p{N}_$]*/uy;
  const number = /\d[\w.]*/y;
  let i = 0;
  // From `i`; with `nested`, up to the "}" that closes a template's substitution.
  const scan = (nested) => {
    const found = [];
    // Whether a line break comes after the last token: ASI may end a statement there.
    let newline = false;
    const push = (token) => {
      token.newline = newline;
      newline = false;
      found.push(token);
    };
    // One entry per open "(": the keyword whose head it opens (if, for, switch...), or "".
    const parens = [];
    // One entry per open "{", "(" or "[": the brace's kind, and how many "?" still wait for their ":" inside it.
    const braces = [];
    const top = { kind: nested ? "object" : "block", ternary: 0 };
    // Whether found[index] is a keyword of `words`, not a property of that name (obj.of).
    const keywordAt = (index, words) => found[index]?.kind === "name" && words.has(found[index].value) && !(found[index - 1]?.kind === "punct" && (found[index - 1].value === "." || found[index - 1].value === "?."));
    // "of" is a keyword only in the head of a for loop.
    const ofAt = (index) => keywordAt(index, new Set(["of"])) && parens[parens.length - 1] === "for";
    // The kind of a "{" here: "object", "block", or "unknown" (a function's or a class's body, say).
    const braceKind = (prev, index) => {
      if (!prev) return nested ? "object" : "block";
      if (prev.kind === "name") {
        if (keywordAt(index, RESTRICTED_KEYWORDS) && newline) return "block";
        if (keywordAt(index, AWAIT) && newline) return "unknown";
        if (keywordAt(index, EXPRESSION_KEYWORDS) || ofAt(index)) return "object";
        return keywordAt(index, BLOCK_KEYWORDS) ? "block" : "unknown";
      }
      if (prev.kind !== "punct" || prev.postfix) return "unknown";
      if (prev.arrow) return "block";
      if (prev.value === ":") return prev.colon;
      if (prev.value === ")") return HEAD_KEYWORDS.has(prev.keyword) ? "block" : "unknown";
      // Inside "(" or "[" (a for loop's head: for (; {}.a;)) a ";" is followed by an expression, not a statement.
      if (BLOCK_AFTER.has(prev.value)) return braces[braces.length - 1]?.brace === false ? "unknown" : "block";
      return OBJECT_AFTER.has(prev.value) ? "object" : "unknown";
    };
    // Whether a "/" here starts a regular expression (true) or divides (false); throws when that is unsure.
    const startsRegex = (prev, index, at) => {
      const ends = (what) => {
        if (newline) throw new AmbiguousSlash(at, `a line break after ${what} may end a type`);
        return false;
      };
      if (!prev) return true;
      if (prev.kind === "regex" || prev.postfix || (prev.kind === "punct" && (prev.value === "++" || prev.value === "--"))) return false;
      if (prev.kind === "name") return keywordAt(index, REGEX_KEYWORDS) || ofAt(index) || ends(`"${prev.value}"`);
      if (prev.kind !== "punct") return ends(`a ${prev.kind}`);
      if (prev.value === ")") return CONDITION_KEYWORDS.has(prev.keyword) || ends('")"');
      if (prev.value === "]") return ends('"]"');
      if (prev.value === "}") {
        if (prev.brace === "block") return true;
        if (prev.brace === "object") return ends('an object literal\'s "}"');
        throw new AmbiguousSlash(at, 'the "}" before it may end a statement or an expression, as a function\'s body may');
      }
      if (prev.arrow) return true;
      if (prev.value === "<" || prev.value === ">") throw new AmbiguousSlash(at, `"${prev.value}" before it may close type arguments or a JSX tag`);
      if (REGEX_AFTER.has(prev.value)) return true;
      throw new AmbiguousSlash(at, `"${prev.value}" before it`);
    };
    while (i < source.length) {
      const at = i;
      const c = source[i];
      const prev = found[found.length - 1];
      if (/\s/.test(c)) {
        if (c === "\n") newline = true;
        i++;
      } else if (c === "/" && (source[i + 1] === "/" || source[i + 1] === "*")) {
        const line = source[i + 1] === "/";
        const end = source.indexOf(line ? "\n" : "*/", i + 2);
        const text = source.slice(i, end < 0 ? source.length : end);
        if (text.includes("\n")) newline = true;
        comments.push({ at, text });
        i = end < 0 ? source.length : line ? end : end + 2;
      } else if (c === '"' || c === "'") {
        let text = "";
        for (i++; i < source.length && source[i] !== c && source[i] !== "\n"; i++) {
          if (source[i] === "\\") i++;
          else text += source[i];
        }
        i++;
        push({ kind: "string", value: text, at });
      } else if (c === "`") {
        let text = "";
        for (i++; i < source.length && source[i] !== "`"; ) {
          if (source[i] === "\\") i += 2;
          else if (source[i] === "$" && source[i + 1] === "{") {
            i += 2;
            scan(true);
            // A substitution separates the text on either side: "PO-1${n}0" does not name PO-10.
            text += " ";
          } else text += source[i++];
        }
        i++;
        push({ kind: "template", value: text, at });
      } else if (c === "/" && startsRegex(prev, found.length - 1, at)) {
        // A regular expression literal: skip it, since it may hold a quote.
        for (i++; i < source.length && source[i] !== "/" && source[i] !== "\n"; i++) {
          if (source[i] === "\\") i++;
          else if (source[i] === "[") while (i < source.length && source[i] !== "]" && source[i] !== "\n") i += source[i] === "\\" ? 2 : 1;
        }
        if (source[i] !== "/") throw new AmbiguousSlash(at, "a regular expression must start here, but nothing closes it on its line");
        i++;
        while (/[A-Za-z]/.test(source[i] ?? "")) i++;
        push({ kind: "regex", value: "", at });
      } else {
        identifier.lastIndex = i;
        number.lastIndex = i;
        const name = identifier.exec(source)?.[0];
        const digits = name ? undefined : number.exec(source)?.[0];
        if (name || digits) {
          push({ kind: name ? "name" : "number", value: name ?? digits, at });
          i += (name ?? digits).length;
          continue;
        }
        const value = source.startsWith("...", i) ? "..." : (c === "+" || c === "-") && source[i + 1] === c ? c + c : c === "?" && source[i + 1] === "." && !/\d/.test(source[i + 2] ?? "") ? "?." : c === "?" && source[i + 1] === "?" ? "??" : c;
        i += value.length;
        if (c === "}" && nested && !braces.some((scope) => scope.brace)) return found;
        const frame = braces[braces.length - 1] ?? top;
        const token = { kind: "punct", value, at };
        if (c === "(" || c === "[") braces.push({ kind: "unknown", ternary: 0, brace: false });
        else if ((c === ")" || c === "]") && braces.length > 0 && !frame.brace) braces.pop();
        else if (value === "?") frame.ternary++;
        // "=>" is an arrow: its "{" opens a body. A ":" closing a "?" or inside an object literal is followed by an
        // expression; one in a block (a label or a case) by a statement; elsewhere (a type annotation) it is unknown.
        else if (c === ">" && prev?.kind === "punct" && prev.value === "=" && prev.at === at - 1) token.arrow = true;
        else if (c === ":") {
          token.colon = frame.ternary > 0 ? "object" : frame.kind;
          if (frame.ternary > 0) frame.ternary--;
        } else if (c === "{") braces.push({ kind: braceKind(prev, found.length - 1), ternary: 0, brace: true });
        else if (c === "}") {
          // Drop any "(" or "[" left open inside the block, then the "{" itself.
          while (braces.length > 0 && !braces[braces.length - 1].brace) braces.pop();
          token.brace = braces.pop()?.kind ?? "unknown";
        }
        // x! (a non-null assertion, glued to the name, call or index it follows) ends an expression: x! / 2 is a division.
        if (c === "!" && prev && !/\s/.test(source[at - 1] ?? " ") && (prev.kind === "number" || (prev.kind === "name" && !keywordAt(found.length - 1, REGEX_KEYWORDS)) || (prev.kind === "punct" && (prev.value === ")" || prev.value === "]" || prev.postfix)))) token.postfix = true;
        if (c === "(") parens.push(keywordAt(found.length - 1, HEAD_KEYWORDS) ? found[found.length - 1].value : keywordAt(found.length - 1, AWAIT) && keywordAt(found.length - 2, CONDITION_KEYWORDS) ? found[found.length - 2].value : "");
        else if (c === ")") token.keyword = parens.pop() ?? "";
        push(token);
      }
    }
    return found;
  };
  return scan(false);
}

const isPunct = (token, value) => token?.kind === "punct" && token.value === value;

/**
 * The text of a test file that can name a requirement: its comments and the titles of its it, test and
 * describe calls. Other strings are fixtures, so an ID inside one counts for nothing. A file whose lexing hits an
 * ambiguous "/" gives no text at all, and the reason goes to `problems` with its line.
 */
export function testReferenceText(source, problems = []) {
  const out = [];
  let tokens;
  try {
    tokens = lexCode(source, out);
  } catch (error) {
    if (!(error instanceof AmbiguousSlash)) throw error;
    const line = source.slice(0, error.at).split("\n").length;
    problems.push(`line ${line}: cannot tell whether "/" divides or starts a regular expression (${error.message}), so the file names nothing; add a semicolon or parentheses`);
    return "";
  }
  // The index after the ")" that closes the "(" at `open`.
  const afterCall = (open) => {
    for (let depth = 0, k = open; k < tokens.length; k++) {
      if (isPunct(tokens[k], "(")) depth++;
      else if (isPunct(tokens[k], ")") && --depth === 0) return k + 1;
    }
    return tokens.length;
  };
  for (let k = 0; k < tokens.length; k++) {
    // A call of it, test or describe itself, with modifiers (it.skip), not a method of another object (re.test).
    if (tokens[k].kind !== "name" || !TEST_CALLEES.has(tokens[k].value) || isPunct(tokens[k - 1], ".") || isPunct(tokens[k - 1], "?.")) continue;
    let next = k + 1;
    let last = "";
    while (isPunct(tokens[next], ".") && tokens[next + 1]?.kind === "name") {
      last = tokens[next + 1].value;
      next += 2;
    }
    // Type arguments, as in it.each<[string]>(rows)(title): skip the balanced <...> run.
    if (isPunct(tokens[next], "<")) {
      for (let depth = 0; next < tokens.length; next++) {
        if (isPunct(tokens[next], "<")) depth++;
        else if (isPunct(tokens[next], ">") && --depth === 0) {
          next++;
          break;
        }
      }
    }
    if (TEST_FACTORIES.has(last)) {
      if (tokens[next]?.kind === "template") next++;
      else if (isPunct(tokens[next], "(")) next = afterCall(next);
      else continue;
    }
    const title = tokens[next + 1];
    if (isPunct(tokens[next], "(") && (title?.kind === "string" || title?.kind === "template")) out.push({ at: title.at, text: title.value });
  }
  return out.sort((a, b) => a.at - b.at).map((part) => part.text).join("\n");
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
    const unclear = [];
    const ids = new Set(testReferenceText(text, unclear).match(TEST_ID) ?? []);
    problems.push(...unclear.map((problem) => `${path}: ${problem}`));
    for (const id of ids) {
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
