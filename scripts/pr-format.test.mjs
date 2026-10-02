import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkAll, checkBody, checkSubject, checkTitle } from "./pr-format.mjs";

const goodBody = `Does a thing.

Validation: tests pass.

Tracking: #14. Base: main.

Checklist:
- [ ] a
- [ ] b
- [ ] c
- [ ] d
- [x] e
- [x] f
`;

describe("commit subjects", () => {
  it("accepts #issue and [F] forms", () => {
    expect(checkSubject("#12 Add delegate parser, roster, and router")).toBeUndefined();
    expect(checkSubject("[F0] Add Shadow Army README")).toBeUndefined();
  });

  it("rejects conventional-commit prefixes and bare text", () => {
    for (const bad of [
      "feat: delegate parser (#12)",
      "fix: something",
      "docs: add README",
      "Add a thing",
      "#12",
      "#12Add",
      "#12  ",
      "[F] no number",
    ]) {
      expect(checkSubject(bad), bad).toMatch(/commit subject must look like/);
    }
  });

  it("leaves merge, fixup, squash and revert commits alone", () => {
    for (const s of ["Merge branch 'main'", "fixup! #1 x", "squash! #1 x", 'Revert "#1 x"']) {
      expect(checkSubject(s), s).toBeUndefined();
    }
  });
});

describe("PR title", () => {
  it("follows the same format", () => {
    expect(checkTitle("#14 Add CLAUDE.md")).toBeUndefined();
    expect(checkTitle("Add CLAUDE.md")).toMatch(/PR title/);
  });
});

describe("PR body", () => {
  it("accepts the template shape", () => {
    expect(checkBody(goodBody)).toEqual([]);
  });

  it("requires Validation, Tracking and Checklist", () => {
    const problems = checkBody("just prose");
    expect(problems.join("\n")).toMatch(/Validation:/);
    expect(problems.join("\n")).toMatch(/Tracking:/);
    expect(problems.join("\n")).toMatch(/Checklist:/);
    expect(problems.join("\n")).toMatch(/0 checklist boxes/);
    expect(checkBody(undefined).length).toBeGreaterThan(0);
  });

  it("requires the whole checklist", () => {
    const short = goodBody.replace(/- \[x\] f\n/, "");
    expect(checkBody(short).join()).toMatch(/5 checklist boxes/);
  });

  it("rejects closing keywords, which close issues before acceptance", () => {
    for (const kw of ["closes #1", "Closes #1", "fixes #22", "resolved #3", "close #4"]) {
      expect(checkBody(goodBody + `\n${kw}\n`).join(), kw).toMatch(/closing keyword/);
    }
    // "Tracking: #14" and prose that merely mentions an issue are fine.
    expect(checkBody(goodBody + "\nSee #14 for context. This closes the gap.\n")).toEqual([]);
  });
});

describe("checkAll", () => {
  it("collects every problem for one PR", () => {
    const problems = checkAll({ title: "bad", body: "x", subjects: ["feat: x", "#1 ok"] });
    expect(problems.some((p) => p.startsWith("PR title"))).toBe(true);
    expect(problems.some((p) => p.includes("Validation:"))).toBe(true);
    expect(problems.filter((p) => p.startsWith("commit subject")).length).toBe(1);
  });

  it("passes a well-formed PR", () => {
    expect(checkAll({ title: "#14 Add it", body: goodBody, subjects: ["#14 Add it"] })).toEqual([]);
  });
});

describe(".githooks/commit-msg", () => {
  const hook = new URL("../.githooks/commit-msg", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const run = (subject) => {
    const dir = mkdtempSync(join(tmpdir(), "hook-"));
    const file = join(dir, "MSG");
    writeFileSync(file, `${subject}\n\nbody\n`);
    try {
      execFileSync("sh", [hook, file], { stdio: "pipe" });
      return 0;
    } catch (e) {
      return e.status;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("agrees with the JS checker on accept and reject", () => {
    for (const ok of ["#1 Add x", "[F0] Add y", "Merge branch 'main'", "fixup! #1 x"]) expect(run(ok), ok).toBe(0);
    for (const bad of ["feat: x", "Add x", "#1", "docs: y (#2)"]) expect(run(bad), bad).toBe(1);
  });
});
