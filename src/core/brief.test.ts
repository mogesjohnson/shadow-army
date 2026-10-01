import { describe, expect, it } from "vitest";
import { buildPrompt, MAX_PROMPT_CHARS, parseReport } from "./brief.js";
import type { Brief } from "./types.js";

const brief = (over: Partial<Brief> = {}): Brief => ({
  task: "Summarize the README",
  role: "research",
  constraints: [],
  vaultNotes: [],
  write: false,
  ...over,
});

describe("buildPrompt", () => {
  it("contains only the brief: role, task, read-only rule and the report format", () => {
    const p = buildPrompt(brief());
    expect(p).toContain("ROLE: research");
    expect(p).toContain("Summarize the README");
    expect(p).toContain("read-only");
    expect(p).toContain("```shadow-report");
    expect(p).not.toContain("CONSTRAINTS");
    expect(p).not.toContain("VAULT");
  });

  it("includes constraints and vault notes when present, and allows edits for write briefs", () => {
    const p = buildPrompt(brief({ role: "build", write: true, constraints: ["no new deps"], vaultNotes: ["uses ESM"] }));
    expect(p).toContain("- no new deps");
    expect(p).toContain("- uses ESM");
    expect(p).toContain("You may modify files");
  });

  it("refuses a brief that would overflow the command line", () => {
    expect(() => buildPrompt(brief({ task: "x".repeat(MAX_PROMPT_CHARS) }))).toThrow(/limit/);
  });
});

describe("parseReport", () => {
  it("parses the shadow-report block and strips nothing it needs", () => {
    const text = 'All done.\n```shadow-report\n{"summary":"fixed it","filesTouched":["a.ts"],"openQuestions":["q?"],"notes":["n"]}\n```';
    expect(parseReport(text)).toEqual({
      summary: "fixed it",
      filesTouched: ["a.ts"],
      openQuestions: ["q?"],
      notes: ["n"],
      structured: true,
    });
  });

  it("uses the last block when the soldier echoes the example first", () => {
    const text =
      '```shadow-report\n{"summary":"example"}\n```\nreal:\n```shadow-report\n{"summary":"real"}\n```';
    expect(parseReport(text).summary).toBe("real");
  });

  it("defaults missing list fields to empty", () => {
    expect(parseReport('```shadow-report\n{"summary":"s"}\n```')).toMatchObject({
      filesTouched: [],
      openQuestions: [],
      notes: [],
      structured: true,
    });
  });

  it("falls back to the raw text when the block is missing or malformed", () => {
    expect(parseReport("just prose")).toMatchObject({ summary: "just prose", structured: false });
    expect(parseReport("hi\n```shadow-report\n{oops\n```")).toMatchObject({ structured: false });
  });
});
