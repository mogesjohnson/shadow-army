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
  it("reads titles as tokens, whatever whitespace or comments separate them (review 116 C11)", () => {
    const pad = " ".repeat(66);
    const ids = (text) => testReferenceText(text).match(/\b[A-Z]+-\d+\b/g) ?? [];
    // A member call after a dot and a long indent is no test call; a spaced modifier and a distant argument are.
    expect(ids(`x.\n${pad}test("PO-1");`)).toEqual([]);
    expect(ids(`it . skip("CH-1", () => {});`)).toEqual(["CH-1"]);
    expect(ids(`test${pad}(\n${pad}"PO-2 bare", () => {});`)).toEqual(["PO-2"]);
    expect(ids(`it /* a */ . /* b */ skip /* c */ ( /* d */ "CH-2 spaced", () => {});`)).toEqual(["CH-2"]);
    expect(ids(`a. // note\n  test("PO-3"); a?.\n  test("PO-4"); a\n  ?. test("PO-5");`)).toEqual([]);
    expect(ids('it(`PO-6 ${ {a: "}"}.a } tail`, () => {}); it(`CH-3 ${`PO-9 ${x}`} end`, () => {});')).toEqual(["PO-6", "CH-3"]);
    expect(ids(`it.each(t)\n${pad}(\n"PO-7 %s", f); describe . skipIf ( c ) ( "CH-4 suite", f); it.each\`a\`  ( "PO-8", f);`)).toEqual(["PO-7", "CH-4", "PO-8"]);
    expect(ids(`foo.it("PO-9"); foo . describe . skip ("PO-10"); it\n.skip\n("PO-11 split", f);`)).toEqual(["PO-11"]);
    // Type arguments do not hide a title; a substitution does not join the text around it into one ID.
    expect(ids('it.each<[string, number]>(rows)("PO-17 %s", f); it<Ctx>("CH-5 typed", f); it(`PO-1${n}0 joined`, f);')).toEqual(["PO-17", "CH-5", "PO-1"]);
    expect(ids(`it\n("PO-12 no dot", f); test.each(["PO-13"]); it(x, "PO-14"); it(/PO-15/, "PO-16");`)).toEqual(["PO-12"]);
  });
  it("tells division from a regular expression literal (review 120 C14)", () => {
    const ids = (text) => testReferenceText(text).match(/\b[A-Z]+-\d+\b/g) ?? [];
    // Division after an expression: a postfix ++ or --, a member named of, a name, a number, an index, a parenthesis.
    expect(ids('let n = 0; const ratio = n++ / 2;\nit("PO-1 after ++", () => {});')).toEqual(["PO-1"]);
    expect(ids('const r = n-- / 2;\nit("PO-2 after --", () => {});')).toEqual(["PO-2"]);
    expect(ids('const r = obj.of / 2;\nit("PO-3 member of", () => {});')).toEqual(["PO-3"]);
    expect(ids('const r = a / b / c;\nit("PO-4 chain", () => {});')).toEqual(["PO-4"]);
    expect(ids('const r = x[0] / 2 + (a) / 2 + 4 / 2;\nit("PO-5 index", () => {});')).toEqual(["PO-5"]);
    expect(ids('const r = `t` / 2 + "s" / 2;\nit("PO-6 literals", () => {});')).toEqual(["PO-6"]);
    // A regex literal after an if, while, for or with condition, a keyword, an operator or a closing brace is no title.
    expect(ids('if (x) /it\\("PO-7"/.test(s);\nit("PO-8 real", () => {});')).toEqual(["PO-8"]);
    expect(ids('while (x) /it\\("PO-9"/.test(s); for (;;) /it\\("PO-10"/.test(s);\nit("PO-11 real", () => {});')).toEqual(["PO-11"]);
    expect(ids('x = /it\\("PO-12"/;\nit("PO-13 real", () => {});')).toEqual(["PO-13"]);
    expect(ids('function f() { return /it\\("PO-14"/; }\nit("PO-15 real", () => {});')).toEqual(["PO-15"]);
    expect(ids('const re = /[/]it\\("PO-16"/;\nit("PO-17 real", () => {});')).toEqual(["PO-17"]);
    expect(ids('if (a) {}\n/it\\("PO-18"/.test(s);\nit("PO-19 real", () => {});')).toEqual(["PO-19"]);
    expect(ids('else /it\\("PO-20"/.test(s);\nfor (const m of /it\\("PO-21"/g) {}\nit("PO-22 real", () => {});')).toEqual(["PO-22"]);
    // A condition's parenthesis does not leak into the next: (a) after an if body, or f(a) after a nested condition, is a division.
    expect(ids('if (x) { y(); } const r = (a) / 2;\nit("PO-23", () => {});')).toEqual(["PO-23"]);
    expect(ids('if ((a)) /it\\("PO-24"/.test(s); const r = f(a) / 2;\nit("PO-25", () => {});')).toEqual(["PO-25"]);
    // A TypeScript non-null assertion ends an expression; a "/" the lexer cannot close on its line never eats the next line.
    expect(ids('const r = total! / 2 + a.b![0]! / 2 + f()! / 2;\nit("PO-26 non-null", () => {});')).toEqual(["PO-26"]);
    expect(ids('const r = [.../it\\("PO-27"/.exec(s)]; export default /it\\("PO-28"/;\nit("PO-29 real", () => {});')).toEqual(["PO-29"]);
    expect(ids('const r = x ? y : <p>hi</p>;\nit("PO-30 after a stray slash", () => {});')).toEqual(["PO-30"]);
  });
  it("classifies a slash by the kind of brace and token before it (review 127 C15)", () => {
    const ids = (text) => testReferenceText(text).match(/\b[A-Z]+-\d+\b/g) ?? [];
    // The "}" of an object literal ends an expression, so the slash is a division and the comment after it stays.
    expect(ids("const ratio = { valueOf: () => 8 } / 2; // PO-78 important note")).toEqual(["PO-78"]);
    expect(ids("const x = {} / 2; // PO-79 note")).toEqual(["PO-79"]);
    expect(ids("const x = f({ a: 1 }, [{ b: 2 }]) / 2 + ({ c: 3 }) / 2; // PO-80 note")).toEqual(["PO-80"]);
    expect(ids("const x = c ? {} : { a: {} } / 2; // PO-81 note")).toEqual(["PO-81"]);
    expect(ids("const x = `${ { a: 1 }.a / 2 } and ${ {} / 2 }` / 2; // PO-82 note")).toEqual(["PO-82"]);
    // A "{" first in a substitution is an object literal; a ":" in a parameter list is no ternary's colon.
    expect(ids("const s = `${ { valueOf: () => 8 } / 2 }`; // PO-94 note")).toEqual(["PO-94"]);
    expect(ids("const r = c ? (x: number) => x : { valueOf: () => 8 } / 2; // PO-95 note")).toEqual(["PO-95"]);
    expect(ids("const r = f(a ? b : c) ? {} / 2 : 1; // PO-96 note")).toEqual(["PO-96"]);
    // The slash after a division is a regex operand, whose text is no title.
    expect(ids('const ratio = n / /it("PO-72 fake")/.test(s); it("PO-73 true", () => {});')).toEqual(["PO-73"]);
    expect(ids('const r = a / /it\\("PO-74"/.source.length; it("PO-75 true", () => {});')).toEqual(["PO-75"]);
    expect(ids('x = {} / /it\\("PO-76"/.source; it("PO-77 true", () => {});')).toEqual(["PO-77"]);
    // The "}" of a block, a function body or a class ends a statement, so the slash starts a regex.
    expect(ids('if (a) {} /it\\("PO-83"/.test(s); it("PO-84 true", () => {});')).toEqual(["PO-84"]);
    expect(ids('const f = () => {}\n/it\\("PO-85"/.test(s); it("PO-86 true", () => {});')).toEqual(["PO-86"]);
    expect(ids('class A { m() {} }\n/it\\("PO-87"/.test(s); try {} finally {} /it\\("PO-88"/.test(s); it("PO-89 true", () => {});')).toEqual(["PO-89"]);
    expect(ids('switch (a) { case 1: {} }\n/it\\("PO-90"/.test(s); lbl: {} /it\\("PO-91"/.test(s); it("PO-92 true", () => {});')).toEqual(["PO-92"]);
    // A "/" with no closing slash on its line is no regex: the lexer goes back to it and keeps what follows.
    expect(ids('const r = c ? <p>hi</p> : 1; it("PO-93 same line", () => {});')).toEqual(["PO-93"]);
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
