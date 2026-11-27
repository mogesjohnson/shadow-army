import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkSpecTrace, checkTestReferences, expandReferences, findTests, parseImplemented, testReferenceText } from "./check-spec-trace.mjs";

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
  const files = (text) => [{ path: "src/v2/x.test.ts", text }];
  const unnamedCh1 = ["CH-1: implemented, but no test names it"];
  it("accepts a test that names each tested requirement in a title or a comment", () => {
    const tests = files(`it("PO-1 and M1-AC1", () => {});\n// CH-1\n`);
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", tests).problems).toEqual([]);
  });
  it("fails when an implemented requirement with U, C, I, X, F or S evidence is named by no test", () => {
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", files("// PO-1")).problems).toEqual(unnamedCh1);
  });
  it("counts a requirement of an earlier milestone as implemented, but not one still being built", () => {
    expect(checkTestReferences(trace, "M2\n", files("// PO-1")).problems).toEqual(unnamedCh1);
    expect(checkTestReferences(trace, "M1\n", files("")).problems).toEqual([]);
  });
  it("does not ask a test for R or L evidence", () => {
    const recorded = checkSpecTrace(valid.replace("(M1; U)", "(M1; R, L)"));
    expect(checkTestReferences(recorded, "M1\nPO-1\n", files("// CH-1")).problems).toEqual([]);
  });
  it("fails when a test names an ID the spec doesn't have, and ignores text that is no ID", () => {
    const problems = checkTestReferences(trace, "M1\n", files(`it("PO-9 UTF-8 SHA-256 TLS-1 M1-AC9", () => {})`)).problems;
    expect(problems).toEqual(["src/v2/x.test.ts: names PO-9, which this spec doesn't have", "src/v2/x.test.ts: names M1-AC9, which this spec doesn't have"]);
  });
  it("names a requirement only by its own ID, not by a range or an AC", () => {
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", files("// M1-AC1, PO-1 to 3")).problems).toEqual(unnamedCh1);
  });
  it("rejects a malformed or unknown implemented list", () => {
    expect(parseImplemented("PO-1\n").problems).toHaveLength(1);
    expect(parseImplemented("M1\nnonsense\n").problems).toHaveLength(1);
    expect(checkTestReferences(trace, "M1\nPO-9\n", []).problems).toEqual(["implemented list: PO-9 is not in this spec"]);
  });
  it("credits an ID only from a title or a comment, never from a fixture string", () => {
    const text = 'it("PO-1 title", () => { run("PO-77 CH-1 // CH-2", `x ${"CH-3"} M1-AC4`, /["'+"'"+'`]/); });\n/* block CH-1 */\n';
    expect(testReferenceText(text).match(/\b[A-Z]+-\d+\b/g)).toEqual(["PO-1", "CH-1"]);
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", files('it("x", () => { run("PO-1 CH-1"); });')).problems).toEqual(["PO-1: implemented, but no test names it", ...unnamedCh1]);
    expect(checkTestReferences(trace, "M1\n", files('it("x", () => { run("PO-9"); });')).problems).toEqual([]);
  });
  it("credits the title of a curried it.each or describe.skipIf call, and not a method named test", () => {
    const text = [
      'it.each([["PO-4"]])("PO-1 curried %s", () => {});',
      'describe.skipIf(CH_2)("CH-1 suite", () => { it.skip.each`a`("PO-2 tagged", () => {}); });',
      'it.concurrent("PO-3 plain", () => {});',
      'const q = (s) => /"/.test(s); this.#test("PO-10");',
      '/PO-5/.test("PO-6"); matcher.test("PO-7"); it.each(["PO-8"]); foo(it("x", () => {}), "PO-9");',
    ].join("\n");
    expect(testReferenceText(text).match(/\b[A-Z]+-\d+\b/g)).toEqual(["PO-1", "CH-1", "PO-2", "PO-3"]);
  });
  it("excludes a member call whatever whitespace or comments surround the dot", () => {
    const text = 'matcher . test("PO-7");\nmatcher\n  .test("PO-8"); matcher /* x */ . /* y */ test("PO-9"); a?.test("PO-10"); it("PO-1 real", () => {});';
    expect(testReferenceText(text).match(/\b[A-Z]+-\d+\b/g)).toEqual(["PO-1"]);
  });
  // VER-7, M1-AC7: the traceability script's own tests count, and its fixtures do not.
  it("takes the repository tests as they are, and catches a planted break in them", () => {
    // docs/spec/v2.md here may trail the review branch, so compare against the baseline, not against zero.
    const spec = checkSpecTrace(readFileSync(new URL("../docs/spec/v2.md", import.meta.url), "utf8"));
    const tests = findTests(fileURLToPath(new URL("..", import.meta.url)));
    const paths = tests.map((file) => file.path);
    expect(paths).toContain("scripts/check-spec-trace.test.mjs");
    expect(paths).toContain("plugins/shadow-army/hooks/register.test.ts");
    // This list requires VER-7 (U evidence): only this file's annotation above names it.
    const implemented = "M1\nVER-7\n";
    const baseline = checkTestReferences(spec, implemented, tests);
    expect(baseline.required).toBeGreaterThanOrEqual(1);
    expect(baseline.problems.filter((problem) => !/names \S+, which this spec doesn't have$/.test(problem))).toEqual([]);
    const without = tests.filter((file) => file.path !== "scripts/check-spec-trace.test.mjs");
    expect(checkTestReferences(spec, implemented, without).problems).toEqual([...baseline.problems, "VER-7: implemented, but no test names it"]);
    const broken = [...tests, { path: "src/v2/planted.test.ts", text: "// PO-99999" }];
    expect(checkTestReferences(spec, implemented, broken).problems).toEqual([...baseline.problems, "src/v2/planted.test.ts: names PO-99999, which this spec doesn't have"]);
  });
});
