import { execFile, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { checkSpecTrace, checkTestReferences, expandReferences, listTests, parseImplemented } from "./check-spec-trace.mjs";

const valid = `## 4. Requirements
- **PO-1** (M1; U) First requirement, referring forward to CH-1.
- **CH-1** (M1; C, I) Second requirement.
## 6. Milestones
### M0: Spikes
Implements: none.
### M1: The office
Implements:
- PO-1;
- CH-1.

- **M1-AC1** A recorded request verifies both (PO-1, CH-1).
## Appendix A: Carry-overs
| v2 | Source |
|---|---|
## Appendix B: Rules
`;

describe("spec traceability", () => {
  it("accepts forward references and multiline Implements on Windows line endings", () => {
    expect(checkSpecTrace(valid.replaceAll("\n", "\r\n"))).toMatchObject({ requirements: 2, acceptanceCriteria: 1, problems: [] });
  });
  it("expands full and shorthand ranges, and rejects backwards or mixed-area ranges", () => {
    expect(expandReferences("WSP-1 to WSP-3, CH-1 to 2")).toEqual(["WSP-1", "WSP-2", "WSP-3", "CH-1", "CH-2"]);
    const errors = [];
    expect(expandReferences("WSP-3 to WSP-1; WSP-1 to CH-3", errors)).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(expandReferences("PO-99999999999999999999999", errors)).toEqual([]);
  });
  it("rejects duplicate IDs and malformed requirement metadata", () => {
    const bad = valid.replace("- **CH-1** (M1; C, I)", "- **PO-1** (M99; Z)");
    expect(checkSpecTrace(bad).problems.join("\n")).toMatch(/duplicate requirement PO-1/);
    expect(checkSpecTrace(bad).problems.join("\n")).toMatch(/invalid evidence/);
    expect(checkSpecTrace(bad).problems.join("\n")).toMatch(/not in M99/);
    expect(checkSpecTrace(valid.replace("(M1; U)", "(M1)")).problems.join("\n")).toMatch(/invalid milestone/);
  });
  it("detects missing Implements entries, missing AC references and unknown references", () => {
    expect(checkSpecTrace(valid.replace("- PO-1;", "")).problems.join("\n")).toContain("PO-1: not in M1's Implements");
    expect(checkSpecTrace(valid.replace("(PO-1, CH-1)", "(PO-1)")).problems.join("\n")).toContain("CH-1: in M1's Implements but no M1 AC cites it");
    expect(checkSpecTrace(valid.replace("(PO-1, CH-1)", "(PO-99)")).problems.join("\n")).toContain("M1-AC1: cites no requirement");
    expect(checkSpecTrace(valid.replace("- CH-1.", "- CH-99.")).problems.join("\n")).toContain("M1: implements unknown requirement CH-99");
  });
  it("skips a withdrawn requirement in rules 2 to 4, an Implements line that still lists it included (review 140 C28)", () => {
    const withdrawn = valid.replace("- **CH-1** (M1; C, I) Second requirement.", "- **CH-1** (withdrawn in v0.3: merged into PO-1)").replace("(PO-1, CH-1)", "(PO-1)");
    expect(checkSpecTrace(withdrawn).problems).toEqual([]);
    expect(checkSpecTrace(withdrawn.replace("- CH-1.", "")).problems).toEqual([]);
    expect(checkSpecTrace(withdrawn.replace("(PO-1)", "(PO-1, CH-1)")).problems).toEqual([]);
    expect(checkSpecTrace(valid.replace("(PO-1, CH-1)", "(PO-1)")).problems).toEqual(["CH-1: in M1's Implements but no M1 AC cites it"]);
  });
  it("requires carried-over IDs in Appendix A and rejects unknown table IDs", () => {
    const carried = valid.replace("Second requirement.", "Second requirement (from v1).");
    expect(checkSpecTrace(carried).problems).toContain("CH-1: carried over but not in Appendix A");
    const recorded = carried.replace("|---|---|", "|---|---|\n| CH-1 | v1 |");
    expect(checkSpecTrace(recorded).problems).toEqual([]);
    expect(checkSpecTrace(recorded.replace("| CH-1 | v1 |", "| CH-99 | v1 |")).problems).toContain("Appendix A names unknown requirement CH-99");
  });
  it("keeps a requirement after an unnumbered heading out of the previous section", () => {
    const moved = valid.replace("## 6. Milestones", "## Notes\n- **PO-2** (M1; U) Stray.\n## 6. Milestones");
    expect(checkSpecTrace(moved).problems).toContain("PO-2: requirement is outside sections 4, 5.2 and 5.3");
  });
  it("finds an acceptance criterion repeated outside its milestone", () => {
    const repeated = `${valid}\n- **M1-AC1** Again (PO-1).`;
    expect(checkSpecTrace(repeated).problems).toContain("M1-AC1: acceptance criterion is outside a milestone");
  });
  it("checks each source marker against its Appendix A row, in both directions", () => {
    const carried = valid.replace("Second requirement.", "Second requirement (from 2.0 WS-7 and v1 #16).");
    const row = (text) => carried.replace("|---|---|", `|---|---|\n| CH-1 | ${text} |`);
    expect(checkSpecTrace(row("2.0 WS-7; v1 #16")).problems).toEqual([]);
    expect(checkSpecTrace(row("2.0 WS-7")).problems).toContain("CH-1: cites #16, which Appendix A's row doesn't");
    expect(checkSpecTrace(valid.replace("|---|---|", "|---|---|\n| CH-1 | v1 #16 |")).problems).toContain("CH-1: in Appendix A but its text names no source");
    expect(checkSpecTrace(carried).problems).toContain("CH-1: carried over but not in Appendix A");
  });
  it("rejects a row that adds a source its requirement doesn't name, and a repeated row", () => {
    const carried = valid.replace("Second requirement.", "Second requirement (from 2.0 WS-7).");
    const rows = (...lines) => carried.replace("|---|---|", `|---|---|\n${lines.join("\n")}`);
    expect(checkSpecTrace(rows("| CH-1 | 2.0 WS-7; v1 #99 |")).problems).toContain("CH-1: Appendix A's row names #99, which its text doesn't");
    expect(checkSpecTrace(rows("| CH-1 | 2.0 WS-7 |", "| CH-1 | 2.0 WS-7 |")).problems).toContain("Appendix A lists CH-1 twice");
    expect(checkSpecTrace(rows("| CH-1 | 2.0 WS-7 |", "| PO-1, CH-1 | 2.0 WS-7 |")).problems).toContain("Appendix A lists CH-1 twice");
    const noRefs = valid.replace("Second requirement.", "Second requirement (from v1).").replace("|---|---|", "|---|---|\n| CH-1 | v1 #16 |");
    expect(checkSpecTrace(noRefs).problems).toContain("CH-1: Appendix A's row names #16, which its text doesn't");
    expect(checkSpecTrace(rows("| CH-1 | 2.0 WS-7 |")).problems).toEqual([]);
  });
  it("expands a legacy range, so replacing it with its endpoints is caught", () => {
    const spec = (marker, row) => valid.replace("Second requirement.", `Second requirement (from 2.0 ${marker}).`).replace("|---|---|", `|---|---|\n| CH-1 | ${row} |`);
    expect(checkSpecTrace(spec("GIT-1 to GIT-4", "2.0 GIT-1 to GIT-4")).problems).toEqual([]);
    expect(checkSpecTrace(spec("GIT-1 to GIT-4", "2.0 GIT-1, GIT-4")).problems).toEqual(["CH-1: cites GIT-2, which Appendix A's row doesn't", "CH-1: cites GIT-3, which Appendix A's row doesn't"]);
    expect(checkSpecTrace(spec("GIT-1 to GIT-4", "2.0 GIT-1 to 4")).problems).toEqual([]);
    expect(checkSpecTrace(spec("GIT-1, GIT-4", "2.0 GIT-1 to GIT-4")).problems).toEqual(["CH-1: Appendix A's row names GIT-2, which its text doesn't", "CH-1: Appendix A's row names GIT-3, which its text doesn't"]);
    expect(checkSpecTrace(spec("GIT-4 to GIT-1", "2.0 GIT-1, GIT-4")).problems).toContain("invalid legacy range GIT-4 to GIT-1");
    expect(checkSpecTrace(spec("GIT-9007199254740000 to 9007199254741000", "2.0 GIT-1")).problems).toContain("invalid legacy range GIT-9007199254740000 to 9007199254741000");
    expect(checkSpecTrace(spec("WS-7 to 2.0 semantics", "2.0 WS-7")).problems).toEqual([]);
  });
  it("compares a range in every marker, across Markdown wrapping and a sentence period (review 116 C12)", () => {
    const spec = (text, row) => valid.replace("Second requirement.", `Second requirement ${text}`).replace("|---|---|", `|---|---|\n| CH-1 | ${row} |`);
    const cites = (id) => `CH-1: cites ${id}, which Appendix A's row doesn't`;
    expect(checkSpecTrace(spec("as in 2.0's GIT-1 to GIT-4.", "2.0 GIT-1")).problems).toEqual([cites("GIT-2"), cites("GIT-3"), cites("GIT-4")]);
    expect(checkSpecTrace(spec("as in 2.0's GIT-1 to GIT-4.", "2.0 GIT-1 to GIT-4")).problems).toEqual([]);
    expect(checkSpecTrace(spec("as\nin 2.0's GIT-1\nto GIT-4.", "2.0 GIT-1, GIT-4")).problems).toEqual([cites("GIT-2"), cites("GIT-3")]);
    expect(checkSpecTrace(spec("(from 2.0 GIT-1 to\nGIT-4).", "2.0 GIT-1, GIT-4")).problems).toEqual([cites("GIT-2"), cites("GIT-3")]);
    expect(checkSpecTrace(spec("(from 2.0 GIT-1 to\n  GIT-4).", "2.0 GIT-1 to GIT-4")).problems).toEqual([]);
    expect(checkSpecTrace(spec("(from 2.0 GIT-1 to GIT-4).", "2.0 GIT-1 to GIT-4.")).problems).toEqual([]);
    expect(checkSpecTrace(spec("(from 2.0 GIT-1 to GIT-4.)", "2.0 GIT-1 to 4. See v1 notes.")).problems).toEqual([]);
    expect(checkSpecTrace(spec("as in 2.0's GIT-1, GIT-3 and WS-2 to 3.", "2.0 GIT-1, GIT-3, WS-2, WS-3")).problems).toEqual([]);
    expect(checkSpecTrace(spec("as in 2.0's GIT-1 and GIT-3.", "2.0 GIT-1")).problems).toEqual([cites("GIT-3")]);
    expect(checkSpecTrace(spec("(from 2.0 WS-7 to 2.0 semantics).", "2.0 WS-7")).problems).toEqual([]);
    // An inline marker takes a "#N" source too, and "v1's ... carries over" stays within one line of the text.
    expect(checkSpecTrace(spec("as in 2.0's WS-5 and #32.", "2.0 WS-5; v1 #32")).problems).toEqual([]);
    expect(checkSpecTrace(spec("as in 2.0's WS-5 and #32.", "2.0 WS-5")).problems).toEqual([cites("#32")]);
    expect(checkSpecTrace(valid.replace("Second requirement.", "Keeps v1's guard rules:\n  - audit runs after failure\n  - This carries over the rest.")).problems).toEqual([]);
    expect(checkSpecTrace(valid.replace("Second requirement.", "Keeps v1's guard, which carries over.")).problems).toEqual(["CH-1: carried over but not in Appendix A"]);
    expect(expandReferences("WSP-1 to\n  WSP-3, CH-1 to 2.")).toEqual(["WSP-1", "WSP-2", "WSP-3", "CH-1", "CH-2"]);
    expect(expandReferences("PO-1 to 2.0 semantics")).toEqual(["PO-1"]);
  });
  it("accepts an appendix-only source whether or not the requirement's text also names it", () => {
    const po8 = (text) => valid.replace("- **CH-1** (M1; C, I) Second requirement.", `- **PO-8** (M1; I) ${text}\n- **CH-1** (M1; C, I) Second requirement.`).replace("|---|---|", "|---|---|\n| PO-8 | v1 #22, #16 |").replace("- PO-1;", "- PO-1;\n- PO-8;").replace("(PO-1, CH-1)", "(PO-1, PO-8, CH-1)");
    expect(checkSpecTrace(po8("Ends once.")).problems).toEqual([]);
    expect(checkSpecTrace(po8("Ends once (from v1 #22 and #16: the guard).")).problems).toEqual([]);
    expect(checkSpecTrace(po8("Ends once (from v1 #22).")).problems).toEqual([]);
    expect(checkSpecTrace(po8("Ends once.").replace("#22, #16", "#22")).problems).toEqual(["PO-8: appendix-only source #16 is not in Appendix A's row"]);
  });
  it("rejects an acceptance criterion stranded outside the milestone section", () => {
    expect(checkSpecTrace(`${valid}\n- **M1-AC99** Orphan (PO-1).`).problems).toContain("M1-AC99: acceptance criterion is outside a milestone");
  });
  it("passes the shipped roadmap and runs as a CLI without an explicit filename", () => {
    const spec = readFileSync(new URL("../docs/spec/v2.md", import.meta.url), "utf8");
    expect(checkSpecTrace(spec).problems).toEqual([]);
    expect(execFileSync(process.execPath, ["scripts/check-spec-trace.mjs"], { encoding: "utf8" })).toContain("0 problems");
  });
});

describe("Appendix B rule 9: tests name the requirements", () => {
  const trace = checkSpecTrace(valid);
  const listed = (...names) => ({ tests: names.map((name) => ({ path: "src/v2/x.test.ts", name })), files: 1, problems: [] });
  const unnamedCh1 = ["CH-1: implemented, but no test names it"];
  it("accepts tests whose titles name each tested requirement", () => {
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", listed("PO-1 and M1-AC1", "CH-1")).problems).toEqual([]);
  });
  it("fails when an implemented requirement with U, C, I, X, F or S evidence is named by no test", () => {
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", listed("PO-1")).problems).toEqual(unnamedCh1);
  });
  it("counts a requirement of an earlier milestone as implemented, but not one still being built", () => {
    expect(checkTestReferences(trace, "M2\n", listed("PO-1")).problems).toEqual(unnamedCh1);
    expect(checkTestReferences(trace, "M1\n", listed()).problems).toEqual([]);
  });
  it("does not ask a test for R or L evidence", () => {
    const recorded = checkSpecTrace(valid.replace("(M1; U)", "(M1; R, L)"));
    expect(checkTestReferences(recorded, "M1\nPO-1\n", listed("CH-1")).problems).toEqual([]);
  });
  it("fails when a test names an ID the spec doesn't have, and ignores text that is no ID", () => {
    const problems = checkTestReferences(trace, "M1\n", listed("PO-9 UTF-8 SHA-256 TLS-1 M1-AC9", "PO-9 again")).problems;
    expect(problems).toEqual(["src/v2/x.test.ts: names PO-9, which this spec doesn't have", "src/v2/x.test.ts: names M1-AC9, which this spec doesn't have"]);
  });
  it("names a requirement only by its own ID, not by a range or an AC", () => {
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", listed("M1-AC1, PO-1 to 3", "PO-1")).problems).toEqual(unnamedCh1);
  });
  it("rejects a malformed or unknown implemented list", () => {
    expect(parseImplemented("PO-1\n").problems).toHaveLength(1);
    expect(parseImplemented("M1\nnonsense\n").problems).toHaveLength(1);
    expect(checkTestReferences(trace, "M1\nPO-9\n", listed()).problems).toEqual(["implemented list: PO-9 is not in this spec"]);
  });

  // Fixture suites in a temporary root with their own config, run by this repository's vitest (review 133), which the
  // root's node_modules links to, so that listTests finds it as it would in a repository.
  const modules = fileURLToPath(new URL("../node_modules", import.meta.url));
  const suite = (files, config = 'export default { test: { globals: true, exclude: ["**/node_modules/**", "src/out/**"] } };\n') => {
    const root = mkdtempSync(join(tmpdir(), "trace-rule9-"));
    symlinkSync(modules, join(root, "node_modules"), "junction");
    writeFileSync(join(root, "vitest.config.mjs"), config);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return root;
  };
  const roots = [];
  // Unlink node_modules first, so that removing the root never reaches the repository's own.
  afterAll(() => roots.forEach((root) => { unlinkSync(join(root, "node_modules")); rmSync(root, { recursive: true, force: true }); }));
  const run = 'it("runs", () => {});\n';
  it("credits only the titles vitest collects, never a regular expression, a comment or a title's operand (review 133 C17-C21)", async () => {
    const root = suite({
      "src/c17-not.test.mjs": `if (true)!/it("PO-1")/.test("x");\n${run}`,
      "src/c17-increment.test.mjs": `const r = /x/;\n++/it("PO-1")/.lastIndex;\n${run}`,
      "src/c18-cr.test.mjs": `function f() {\n  return\r/it("PO-1")/.test("x");\n}\n${run}`,
      "src/c18-ls.test.mjs": `function f() {\n  return /it("PO-1")/.test("x");\n}\n${run}`,
      "src/c18-ps.test.mjs": `function f() {\n  return /* */ /it("PO-1")/.test("x");\n}\n${run}`,
      "src/c19.test.mjs": `for (let of = 8; of / 2; of--) {} // PO-1\nit("CH-1 after a classic for", () => {});\n`,
      "src/c20.test.mjs": `function f(s) { label: {} /nope/.test(s); }\nit("CH-1 after a labeled block", () => {});\n`,
      "src/c21-conditional.test.mjs": `it("PO-1" === process.env.NO_SUCH_TRACE_FIXTURE ? "matches" : "differs", () => {});\n`,
      "src/c21-grouped.test.mjs": `describe("grouped", () => { it(("CH-1"), () => {}); });\n`,
      "src/out/excluded.test.mjs": 'it("PO-1 outside the config", () => {});\n',
    });
    roots.push(root);
    const listing = await listTests(root);
    expect(listing.tests.map(({ name }) => name).sort()).toEqual(["CH-1", "CH-1 after a classic for", "CH-1 after a labeled block", "differs", ...Array(5).fill("runs")]);
    expect(listing.problems).toEqual(["src/out/excluded.test.mjs: the vitest config does not run this file, so it names nothing"]);
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", listing).problems).toEqual([...listing.problems, "PO-1: implemented, but no test names it"]);
  }, 120_000);
  it("fails closed when a test file does not load: no test names anything", async () => {
    const root = suite({ "src/named.test.mjs": 'it("PO-1 CH-1", () => {});\n', "src/broken.test.mjs": 'throw new Error("fixture does not load");\n' });
    roots.push(root);
    const listing = await listTests(root);
    expect(listing.tests).toEqual([]);
    expect(listing.problems).toEqual(["vitest list failed, so no test names anything: src/broken.test.mjs: fixture does not load"]);
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", listing).problems).toEqual([...listing.problems, "PO-1: implemented, but no test names it", ...unnamedCh1]);
    expect((await listTests(root, { vitest: join(root, "missing.mjs") })).problems).toEqual([expect.stringMatching(/^vitest list failed/)]);
  }, 120_000);
  it("loads only the traced test files, reads a JSON file not stdout, and credits a title, not a comment beside it (review 137 C22-C24)", async () => {
    const root = suite({
      "src/trace.test.mjs": 'it("PO-1 by its title", () => {});\nit("checks behavior", () => {}); // CH-1\n',
      "docs/other.test.mjs": 'throw new Error("out of scope, never loaded");\n',
    }, 'console.log("fixture config initialized");\nexport default { test: { globals: true } };\n');
    roots.push(root);
    const listing = await listTests(root);
    expect(listing).toEqual({ tests: [{ path: "src/trace.test.mjs", name: "PO-1 by its title" }, { path: "src/trace.test.mjs", name: "checks behavior" }], files: 1, problems: [] });
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", listing).problems).toEqual(unnamedCh1);
  }, 120_000);
  it("fails closed with vitest's message when it writes no list, and when no test file is found", async () => {
    const root = suite({ "src/named.test.mjs": 'it("PO-1", () => {});\n', "quiet.mjs": 'export async function createVitest() {\n  console.error("collection stopped by an error");\n  process.exit(0);\n}\n' });
    roots.push(root);
    expect((await listTests(root, { vitest: join(root, "quiet.mjs") })).problems).toEqual(["vitest list failed, so no test names anything: it wrote no list: collection stopped by an error"]);
    expect((await listTests(root, { directories: ["plugins"] })).problems).toEqual(["no test file under plugins, so no test names anything"]);
  }, 30_000);
  // A collector that ignores SIGTERM, starts a child that does too, and never collects.
  const hang = `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => {});
const child = spawn(process.execPath, ["-e", 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'], { stdio: "ignore" });
writeFileSync(new URL("./grandchild.pid", import.meta.url), String(child.pid));
writeFileSync(new URL("./collector.pid", import.meta.url), String(process.pid));
setInterval(() => {}, 1000);
export const createVitest = () => new Promise(() => {});
`;
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  it("kills a hung collector's whole process tree at the deadline, even one that ignores SIGTERM (review 137 C25)", async () => {
    const root = suite({ "src/named.test.mjs": 'it("PO-1", () => {});\n', "hang.mjs": hang });
    roots.push(root);
    const started = Date.now();
    const listing = await listTests(root, { vitest: join(root, "hang.mjs"), timeout: 2_000 });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(listing.problems).toEqual([expect.stringMatching(/^vitest list failed, so no test names anything: timed out after 2000 ms/)]);
    const pid = Number(readFileSync(join(root, "grandchild.pid"), "utf8"));
    for (let n = 0; n < 50 && alive(pid); n++) await new Promise((wake) => setTimeout(wake, 100));
    expect(alive(pid)).toBe(false);
  }, 30_000);
  // Not tested on Windows: there Ctrl-C reaches the whole console group, so no signal is forwarded.
  it.skipIf(process.platform === "win32")("ends the collector's tree when the checker itself is stopped by Ctrl-C (review 137 C25)", async () => {
    const root = suite({ "src/named.test.mjs": 'it("PO-1", () => {});\n', "hang.mjs": hang });
    roots.push(root);
    const checker = new URL("./check-spec-trace.mjs", import.meta.url).href;
    const parent = spawn(process.execPath, ["-e", `import(${JSON.stringify(checker)}).then((m) => m.listTests(${JSON.stringify(root)}, { vitest: ${JSON.stringify(join(root, "hang.mjs"))} }))`], { stdio: "ignore" });
    const file = join(root, "grandchild.pid");
    for (let n = 0; n < 100 && !existsSync(file); n++) await new Promise((wake) => setTimeout(wake, 100));
    const pid = Number(readFileSync(file, "utf8"));
    const ended = new Promise((done) => parent.on("exit", (status, signal) => done(signal)));
    parent.kill("SIGINT");
    expect(await ended).toBe("SIGINT");
    for (let n = 0; n < 50 && alive(pid); n++) await new Promise((wake) => setTimeout(wake, 100));
    expect(alive(pid)).toBe(false);
  }, 30_000);
  it("credits a test's own title only: an ID in a suite's title names nothing (review 140 C26)", async () => {
    const root = suite({ "src/suites.test.mjs": 'describe("PO-1 suite", () => { it("creates its fixture", () => {}); });\ndescribe("CH-99 suite", () => { it("CH-1 by its own title", () => {}); });\n' });
    roots.push(root);
    const listing = await listTests(root);
    expect(listing.tests.map(({ name }) => name)).toEqual(["creates its fixture", "CH-1 by its own title"]);
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", listing).problems).toEqual(["PO-1: implemented, but no test names it"]);
  }, 120_000);
  it("explains a failure by the collection's error or stderr, not the config's startup output (review 140 C29)", async () => {
    const root = suite({
      "src/valid.test.mjs": 'it("PO-1", () => {});\n',
      "src/broken.test.mjs": 'throw new Error("specific suite initialization failure");\n',
      "noisy.mjs": 'console.log("normal config startup");\nconsole.error("the real diagnostic");\nprocess.exit(1);\n',
    }, 'console.log("normal config startup");\nexport default { test: { globals: true } };\n');
    roots.push(root);
    expect((await listTests(root)).problems).toEqual(["vitest list failed, so no test names anything: src/broken.test.mjs: specific suite initialization failure"]);
    writeFileSync(join(root, "warned.mjs"), 'console.error("(node) ExperimentalWarning: noise");\nconsole.error("collector failed: " + "x".repeat(1000));\nprocess.exit(1);\n');
    const warned = (await listTests(root, { vitest: join(root, "warned.mjs") })).problems[0];
    expect(warned.startsWith("vitest list failed, so no test names anything: exit 1: collector failed: xxx")).toBe(true);
    expect(warned.length).toBeLessThan(400);
    expect((await listTests(root, { vitest: join(root, "noisy.mjs") })).problems).toEqual(["vitest list failed, so no test names anything: exit 1: the real diagnostic"]);
  }, 120_000);
  // A real vitest whose test file never finishes loading; its worker records its own and its parent's process IDs.
  const slow = 'import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("../worker.pid", import.meta.url), JSON.stringify([process.pid, process.ppid]));\nawait new Promise((wake) => setTimeout(wake, 60_000));\nit("PO-1", () => {});\n';
  it("stops vitest and its worker at the deadline with no system folder on PATH, and verifies it (review 140 C27)", async () => {
    const root = suite({ "src/slow.test.mjs": slow });
    roots.push(root);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"));
    env.PATH = dirname(process.execPath);
    const checker = new URL("./check-spec-trace.mjs", import.meta.url).href;
    // The caller checks the processes the moment the check reports, while it still runs: once it exits, vitest's
    // worker would end with it anyway.
    const pidFile = JSON.stringify(join(root, "worker.pid"));
    const script = `const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
import(${JSON.stringify(checker)}).then((m) => m.listTests(${JSON.stringify(root)}, { timeout: 15000 })).then((r) => {
  console.log(JSON.stringify({ problems: r.problems, alive: JSON.parse(require("node:fs").readFileSync(${pidFile}, "utf8")).filter(alive) }));
});`;
    const output = await new Promise((done, failed) => execFile(process.execPath, ["-e", script], { env, timeout: 60_000 }, (error, stdout) => (error ? failed(error) : done(stdout))));
    expect(JSON.parse(output)).toEqual({ problems: ["vitest list failed, so no test names anything: timed out after 15000 ms; its process tree was killed"], alive: [] });
  }, 90_000);
  it.runIf(process.platform === "win32")("says the tree could not be stopped when taskkill.exe cannot run, never that it was killed (review 140 C27)", async () => {
    const root = suite({ "src/named.test.mjs": 'it("PO-1", () => {});\n', "hang.mjs": hang });
    roots.push(root);
    // Node itself needs SystemRoot to start, so it moves only once the collector runs, before the deadline.
    const system = process.env.SystemRoot;
    let listing;
    try {
      const listed = listTests(root, { vitest: join(root, "hang.mjs"), timeout: 8_000 });
      for (let n = 0; n < 70 && !existsSync(join(root, "collector.pid")); n++) await new Promise((wake) => setTimeout(wake, 100));
      process.env.SystemRoot = join(root, "no-system");
      listing = await listed;
    } finally {
      process.env.SystemRoot = system;
      for (const file of ["collector.pid", "grandchild.pid"]) {
        const pid = Number(readFileSync(join(root, file), "utf8"));
        if (alive(pid)) process.kill(pid);
      }
    }
    expect(listing.problems).toEqual([expect.stringMatching(/^vitest list failed, so no test names anything: timed out after 8000 ms, and its process tree could not be stopped: .*no-system\\System32\\taskkill\.exe/)]);
  }, 30_000);
  it("VER-7, M1-AC7: takes the repository tests as vitest collects them, and catches a planted break in them", async () => {
    // docs/spec/v2.md here may trail the review branch, so compare against the baseline, not against zero.
    const spec = checkSpecTrace(readFileSync(new URL("../docs/spec/v2.md", import.meta.url), "utf8"));
    const listing = await listTests(fileURLToPath(new URL("..", import.meta.url)));
    expect(listing.problems).toEqual([]);
    const paths = listing.tests.map(({ path }) => path);
    expect(paths).toContain("scripts/check-spec-trace.test.mjs");
    expect(paths).toContain("plugins/shadow-army/hooks/register.test.ts");
    // This list requires VER-7 (U evidence): only this test's title names it.
    const implemented = "M1\nVER-7\n";
    const baseline = checkTestReferences(spec, implemented, listing);
    expect(baseline.required).toBeGreaterThanOrEqual(1);
    expect(baseline.problems.filter((problem) => !/names \S+, which this spec doesn't have$/.test(problem))).toEqual([]);
    const without = { ...listing, tests: listing.tests.filter(({ path }) => path !== "scripts/check-spec-trace.test.mjs") };
    expect(checkTestReferences(spec, implemented, without).problems).toEqual([...baseline.problems, "VER-7: implemented, but no test names it"]);
    const broken = { ...listing, tests: [...listing.tests, { path: "src/v2/planted.test.ts", name: "PO-99999" }] };
    expect(checkTestReferences(spec, implemented, broken).problems).toEqual([...baseline.problems, "src/v2/planted.test.ts: names PO-99999, which this spec doesn't have"]);
  }, 300_000);
});
