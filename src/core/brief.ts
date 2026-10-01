import { z } from "zod";
import type { Brief } from "./types.js";

/** Windows caps a command line near 32k characters and briefs are passed as an argument. */
export const MAX_PROMPT_CHARS = 24_000;

const FENCE = "shadow-report";

export function buildPrompt(brief: Brief): string {
  const lines = [
    "You are a soldier in Shadow Army, taking one task from the Monarch.",
    "You have no other context; everything you need is in this brief.",
    "",
    `ROLE: ${brief.role}`,
    "",
    "TASK:",
    brief.task.trim(),
  ];
  if (brief.constraints.length) {
    lines.push("", "CONSTRAINTS:", ...brief.constraints.map((c) => `- ${c}`));
  }
  if (brief.vaultNotes.length) {
    lines.push("", "SHARED NOTES FROM THE VAULT:", ...brief.vaultNotes.map((n) => `- ${n}`));
  }
  lines.push(
    "",
    brief.write
      ? "You may modify files in the working directory as the task requires."
      : "Do not modify, create, or delete any files. This is a read-only task.",
    "",
    "When finished, end your reply with a fenced block in exactly this form:",
    "```" + FENCE,
    '{"summary": "what you did or found, in a few sentences", "filesTouched": [], "openQuestions": [], "notes": []}',
    "```",
    "Put anything the Monarch should remember for the whole army in \"notes\". Keep it short.",
  );
  const prompt = lines.join("\n");
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`brief is ${prompt.length} characters; the limit is ${MAX_PROMPT_CHARS}. Shorten the task.`);
  }
  return prompt;
}

const ReportBlock = z.object({
  summary: z.string(),
  filesTouched: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export interface ParsedReport {
  summary: string;
  filesTouched: string[];
  openQuestions: string[];
  notes: string[];
  structured: boolean;
}

/** Use the last shadow-report block; if it is missing or malformed, fall back to the raw text. */
export function parseReport(text: string): ParsedReport {
  const re = new RegExp("```" + FENCE + "\\s*([\\s\\S]*?)```", "g");
  let last: string | undefined;
  for (const m of text.matchAll(re)) last = m[1];
  if (last !== undefined) {
    try {
      const parsed = ReportBlock.parse(JSON.parse(last));
      return { ...parsed, structured: true };
    } catch {
      // fall through to the raw-text fallback
    }
  }
  const stripped = text.replace(re, "").trim();
  return { summary: stripped || text.trim(), filesTouched: [], openQuestions: [], notes: [], structured: false };
}
