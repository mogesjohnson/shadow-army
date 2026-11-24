import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkSpecTrace, checkTestReferences, expandReferences, findTests, parseImplemented } from "./check-spec-trace.mjs";

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
  const test = (text) => [{ path: "src/v2/x.test.ts", text }];
  const unnamedCh1 = ["CH-1: implemented, but no test names it"];
  it("accepts a test that names each tested requirement in a title or a comment", () => {
    const tests = test(`it("PO-1 and M1-AC1", () => {});\n// CH-1\n`);
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", tests).problems).toEqual([]);
  });
  it("fails when an implemented requirement with U, C, I, X, F or S evidence is named by no test", () => {
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", test("// PO-1")).problems).toEqual(unnamedCh1);
  });
  it("counts a requirement of an earlier milestone as implemented, but not one still being built", () => {
    expect(checkTestReferences(trace, "M2\n", test("// PO-1")).problems).toEqual(unnamedCh1);
    expect(checkTestReferences(trace, "M1\n", test("")).problems).toEqual([]);
  });
  it("does not ask a test for R or L evidence", () => {
    const recorded = checkSpecTrace(valid.replace("(M1; U)", "(M1; R, L)"));
    expect(checkTestReferences(recorded, "M1\nPO-1\n", test("// CH-1")).problems).toEqual([]);
  });
  it("fails when a test names an ID the spec doesn't have, and ignores text that is no ID", () => {
    const problems = checkTestReferences(trace, "M1\n", test(`it("PO-9 UTF-8 SHA-256 TLS-1 M1-AC9", () => {})`)).problems;
    expect(problems).toEqual(["src/v2/x.test.ts: names PO-9, which this spec doesn't have", "src/v2/x.test.ts: names M1-AC9, which this spec doesn't have"]);
  });
  it("names a requirement only by its own ID, not by a range or an AC", () => {
    expect(checkTestReferences(trace, "M1\nPO-1\nCH-1\n", test("// M1-AC1, PO-1 to 3")).problems).toEqual(unnamedCh1);
  });
  it("rejects a malformed or unknown implemented list", () => {
    expect(parseImplemented("PO-1\n").problems).toHaveLength(1);
    expect(parseImplemented("M1\nnonsense\n").problems).toHaveLength(1);
    expect(checkTestReferences(trace, "M1\nPO-9\n", []).problems).toEqual(["implemented list: PO-9 is not in this spec"]);
  });
  it("takes the repository tests as they are, and catches a planted break in them", () => {
    // docs/spec/v2.md here may trail the review branch, so compare against the baseline, not against zero.
    const spec = checkSpecTrace(readFileSync(new URL("../docs/spec/v2.md", import.meta.url), "utf8"));
    const tests = findTests(fileURLToPath(new URL("..", import.meta.url)));
    expect(tests.length).toBeGreaterThan(0);
    expect(tests.map((file) => file.path)).not.toContain("scripts/check-spec-trace.test.mjs");
    const baseline = checkTestReferences(spec, "M1\n", tests).problems;
    const broken = [...tests, { path: "src/v2/planted.test.ts", text: "// PO-99999" }];
    expect(checkTestReferences(spec, "M1\n", broken).problems).toEqual([...baseline, "src/v2/planted.test.ts: names PO-99999, which this spec doesn't have"]);
  });
});
