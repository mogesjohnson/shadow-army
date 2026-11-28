import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
      // Rules 2 to 4 skip a withdrawn requirement (review 140 C28), so an Implements line may still list it.
      if (!requirements.has(id)) problems.push(`${milestone}: implements unknown requirement ${id}`);
      else if (!requirements.get(id).withdrawn && !citationsByMilestone.get(milestone)?.has(id)) problems.push(`${id}: in ${milestone}'s Implements but no ${milestone} AC cites it`);
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

// Rule 9 reads test titles from vitest itself (review 133): no JavaScript is lexed here. The collector (collect,
// below) runs each test file's top level through vitest's Node API (staticParse false; vitest 5's default static
// parse leaves a title's expression unevaluated), so a title is the string the test run would show. VER-7 credits a
// test's own title only (review 140 C26): not its suites' titles, nor a regular expression, a fixture string or a
// comment beside it (review 137 C22). A skipped test is left out, so it names nothing either.
const TEST_DIRECTORIES = ["src", "scripts", "plugins"];
const firstLine = (text) => text.split(/\r\n?|\n/).map((line) => line.trim()).find(Boolean);
// How long stopping a timed-out collector may take before the check reports that it could not stop it.
const TEARDOWN = 10_000;
const alive = (target) => {
  try {
    process.kill(target, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

/**
 * Stops `child` and every process it started, and resolves only once that is verified (review 140 C27); otherwise it
 * rejects, saying why. Windows: taskkill.exe by its absolute path, never PATH, must end the whole tree (exit 0) and the
 * child must exit. POSIX: SIGKILL to the child's process group (it leads one), until no process is left in the group.
 * Either way the stop has TEARDOWN ms.
 */
function stopTree(child) {
  return new Promise((stopped, failed) => {
    let poll;
    const finish = (error) => {
      clearTimeout(limit);
      clearInterval(poll);
      if (error) failed(error);
      else stopped();
    };
    const limit = setTimeout(() => finish(new Error(`it was still running ${TEARDOWN} ms after the kill`)), TEARDOWN);
    if (process.platform === "win32") {
      const system = process.env.SystemRoot ?? process.env.windir;
      if (!system) return finish(new Error("SystemRoot is not set, so taskkill.exe cannot be found"));
      const taskkill = join(system, "System32", "taskkill.exe");
      const killer = spawn(taskkill, ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      killer.on("error", (error) => finish(new Error(`${taskkill}: ${error.message}`)));
      killer.on("exit", (status) => {
        if (status !== 0) finish(new Error(`${taskkill} exited ${status}, so not every process in the tree was ended`));
        else if (child.exitCode !== null || child.signalCode !== null) finish();
        else child.once("exit", () => finish());
      });
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") return finish(error);
      }
      poll = setInterval(() => { if (!alive(-child.pid)) finish(); }, 50);
    }
  });
}

/**
 * Collects the tests vitest would run from `root`, with the repository's config, on `files` only (review 137 C23):
 * this file runs again as the collector (--collect), with `vitest` the path of vitest's Node API, and writes
 * { tests, configured, errors } to a file of its own, never stdout, which the config may also print to (C24). Past
 * `timeout` ms the collector's whole process tree is stopped, one that ignores SIGTERM included (C25), and the stop is
 * verified (C27). A failure says what the collector reported: its collection errors first, then its stderr, then its
 * stdout, each kept apart and bounded (C29).
 */
function vitestList(root, files, vitest, timeout) {
  const directory = mkdtempSync(join(tmpdir(), "trace-list-"));
  const output = join(directory, "list.json");
  const request = join(directory, "request.json");
  writeFileSync(request, JSON.stringify({ vitest, files, output }));
  return new Promise((resolveList, rejectList) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--collect", request], { cwd: root, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const captured = { stdout: "", stderr: "" };
    for (const stream of ["stdout", "stderr"]) {
      child[stream].setEncoding("utf8").on("data", (chunk) => { if (captured[stream].length < 1 << 20) captured[stream] += chunk; });
    }
    const said = () => firstLine(captured.stderr) ?? firstLine(captured.stdout) ?? "no output";
    let ended = false;
    // A detached group misses the terminal's Ctrl-C: stop the tree with this process, then let the signal end it too.
    const signals = process.platform === "win32" ? [] : ["SIGINT", "SIGTERM", "SIGHUP"];
    const settle = () => {
      ended = true;
      clearTimeout(timer);
      for (const signal of signals) process.removeListener(signal, forward);
    };
    const forward = (signal) => {
      settle();
      stopTree(child).catch(() => {}).finally(() => process.kill(process.pid, signal));
    };
    for (const signal of signals) process.on(signal, forward);
    const timer = setTimeout(() => {
      settle();
      child.stdout.destroy();
      child.stderr.destroy();
      stopTree(child).then(
        () => rejectList(new Error(`timed out after ${timeout} ms; its process tree was killed`)),
        (error) => rejectList(new Error(`timed out after ${timeout} ms, and its process tree could not be stopped: ${error.message}`)),
      );
    }, timeout);
    child.on("error", (error) => { if (!ended) { settle(); rejectList(error); } });
    child.on("close", (status, signal) => {
      if (ended) return;
      settle();
      if (status !== 0) return rejectList(new Error(signal ? `stopped by ${signal}` : `exit ${status}: ${said()}`));
      if (!existsSync(output)) return rejectList(new Error(`it wrote no list: ${said()}`));
      try {
        const listed = JSON.parse(readFileSync(output, "utf8"));
        if (!Array.isArray(listed?.tests) || !Array.isArray(listed.configured) || !Array.isArray(listed.errors)) throw new Error("its output is not a list of tests");
        if (listed.errors.length) throw new Error(`${listed.errors[0]}${listed.errors.length > 1 ? ` (and ${listed.errors.length - 1} more)` : ""}`);
        resolveList(listed);
      } catch (error) {
        rejectList(error);
      }
    });
  }).finally(() => {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // A killed collector may still hold the file on Windows; the temporary folder is left behind.
    }
  });
}

/**
 * The tests that can name a requirement: each test vitest collects from the test files under `directories`, as
 * { path, name } with the test's own title, not its suites' (review 140 C26). Only those files are passed
 * to vitest, so a suite outside them is not loaded, unless its path ends with one of theirs (vitest matches a file
 * argument as a substring). It fails closed: when `vitest list` fails (a file does not
 * load, the command errors or passes `timeout`), the result names no test and says why in `problems`. A test file
 * under `directories` that the vitest config does not take in is reported too, since rule 9 cannot read it.
 */
export async function listTests(given, { directories = TEST_DIRECTORIES, vitest = join(given, "node_modules/vitest/dist/node.js"), timeout = 600_000 } = {}) {
  // vitest reports real paths (macOS's /var is /private/var), so compare against the real root.
  const root = realpathSync(given);
  const inside = (file) => {
    const path = relative(root, file).replaceAll("\\", "/");
    return directories.some((directory) => path.startsWith(`${directory}/`)) ? path : undefined;
  };
  try {
    const found = findTests(root, directories);
    // With no file, vitest would list every suite the config takes in.
    if (!found.length) return { tests: [], files: 0, problems: [`no test file under ${directories.join(", ")}, so no test names anything`] };
    const tests = [];
    const listed = await vitestList(root, found, vitest, timeout);
    for (const { file, name } of listed.tests) {
      if (typeof file !== "string" || typeof name !== "string") throw new Error(`${file}: a test without a name`);
      // vitest matches a file argument as a substring, so drop a namesake outside `directories`.
      const path = inside(file);
      if (path) tests.push({ path, name });
    }
    const configured = new Set(listed.configured.map((file) => inside(String(file))));
    const problems = found.filter((path) => !configured.has(path)).map((path) => `${path}: the vitest config does not run this file, so it names nothing`);
    return { tests, files: new Set(tests.map(({ path }) => path)).size, problems };
  } catch (error) {
    return { tests: [], files: 0, problems: [`vitest list failed, so no test names anything: ${error.message}`] };
  }
}

/**
 * Appendix B rule 9 (VER-7). `trace` is checkSpecTrace's result, `implementedSource` the text of implemented.txt and
 * `listing` listTests's result. A test names the IDs in its own title; a requirement is named only by its own ID:
 * ranges do not count. A listing with problems has failed closed, and its problems are reported.
 */
export function checkTestReferences(trace, implementedSource, listing) {
  const implemented = parseImplemented(implementedSource);
  const problems = [...implemented.problems, ...listing.problems];
  const named = new Map();
  const unknown = new Set();
  for (const { path, name } of listing.tests) {
    for (const id of name.match(TEST_ID) ?? []) {
      if (!trace.requirementIds.has(id) && !trace.acceptanceIds.has(id)) {
        const problem = `${path}: names ${id}, which this spec doesn't have`;
        if (!unknown.has(problem)) problems.push(problem);
        unknown.add(problem);
      } else if (!named.has(id)) named.set(id, path);
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

/** The paths of the *.test.* and *.spec.* files under the given directories: the repository's test suites, the mod's and this check's own. */
export function findTests(root, directories = TEST_DIRECTORIES) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) walk(path);
      } else if (/\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
        found.push(relative(root, path).replaceAll("\\", "/"));
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

/**
 * The collector, run by vitestList in a process of its own: it reads { vitest, files, output } from `requestPath`,
 * collects `files` through vitest's Node API from the current folder, and writes each test's file and own title, the
 * files the config takes in, and every collection error, to `output`.
 */
async function collect(requestPath) {
  const { vitest: api, files, output } = JSON.parse(readFileSync(requestPath, "utf8"));
  // As the vitest command sets them before it loads a config.
  process.env.TEST = "true";
  process.env.VITEST = "true";
  process.env.NODE_ENV ??= "test";
  const { createVitest } = await import(pathToFileURL(api).href);
  if (typeof createVitest !== "function") throw new Error(`${api} is not vitest's Node API`);
  const vitest = await createVitest("test", { watch: false, run: true });
  try {
    const { testModules, unhandledErrors } = await vitest.collect(files, { staticParse: false });
    const message = (error) => collapse(String(error?.message ?? error)) || "an error without a message";
    const errors = unhandledErrors.map(message);
    const tests = [];
    for (const module of testModules) {
      const where = relative(process.cwd(), module.moduleId).replaceAll("\\", "/");
      for (const suite of [module, ...module.children.allSuites()]) errors.push(...suite.errors().map((error) => `${where}: ${message(error)}`));
      for (const test of module.children.allTests()) if (test.result().state !== "skipped") tests.push({ file: module.moduleId, name: test.name });
    }
    const configured = (await vitest.getRelevantTestSpecifications(files)).map(({ moduleId }) => moduleId);
    writeFileSync(output, JSON.stringify({ tests, configured, errors }));
  } finally {
    await vitest.close();
  }
  // vitest sets exit code 1 when a file fails to collect; the list written above already says why.
  process.exitCode = 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url && process.argv[2] === "--collect") {
  try {
    await collect(process.argv[3]);
  } catch (error) {
    console.error(`collector failed: ${collapse(String(error?.message ?? error))}`);
    process.exitCode = 1;
  }
} else if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    // Usage: check-spec-trace.mjs [spec.md] [--tests]. --tests adds rule 9 (CI): it reads docs/spec/implemented.txt,
    // or the path in --implemented=<file>, and the tests vitest collects under src/, scripts/ and plugins/.
    const args = process.argv.slice(2);
    const root = fileURLToPath(new URL("..", import.meta.url));
    const path = args.find((arg) => !arg.startsWith("--")) ?? join(root, "docs/spec/v2.md");
    const implementedPath = args.find((arg) => arg.startsWith("--implemented="))?.slice(14) ?? join(root, "docs/spec/implemented.txt");
    const result = checkSpecTrace(readFileSync(path, "utf8"));
    const problems = [...result.problems];
    let summary = `${result.requirements} requirements; ${result.acceptanceCriteria} acceptance criteria`;
    if (args.includes("--tests")) {
      const listing = await listTests(root);
      const rule9 = checkTestReferences(result, readFileSync(implementedPath, "utf8"), listing);
      problems.push(...rule9.problems);
      summary += `; ${rule9.required} requirements need a test, ${rule9.named} IDs named by ${listing.tests.length} tests in ${listing.files} files`;
    }
    console.log(`${summary}; ${problems.length} problems`);
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exitCode = 1;
  } catch (error) {
    console.error(`spec trace check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
