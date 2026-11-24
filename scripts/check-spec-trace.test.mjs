import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkSpecTrace, expandReferences } from "./check-spec-trace.mjs";

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
