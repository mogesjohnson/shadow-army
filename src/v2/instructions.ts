import type { Roster, SoldierSpec } from "../core/roster.js";

export const DEFAULT_SHADOW_NAMES: Readonly<Record<string, string>> = {
  "codex-astra": "Bellion",
  "codex-sol": "Igris",
  "claude-opus": "Kaisel",
  "claude-opus-build": "Tank",
  "claude-sonnet": "Iron",
  grok: "Beru",
  agy: "Tusk",
};

export const MAX_INSTRUCTION_TOKENS = 1_500;

export function shadowName(key: string): string {
  return Object.hasOwn(DEFAULT_SHADOW_NAMES, key) ? DEFAULT_SHADOW_NAMES[key]! : key;
}

/** An offline size estimate, never native usage or an exact tokenizer count. */
export function estimateInstructionTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 3);
}

/** SI-1: append this complete text once; never replace the vendor's system prompt. */
export function buildStandingInstructions(roster: Roster, soldier: SoldierSpec, options: { readOnly?: boolean } = {}): string {
  if (!roster.soldiers.has(soldier.key)) throw new Error(`unknown soldier ${soldier.key}`);
  const text = [
    `You are ${shadowName(soldier.key)} (${soldier.key}), model ${soldier.model}; roles: ${soldier.roles.join(", ")}.`,
    "Claude Code is the Monarch. Only the Monarch plans and assigns work; soldiers answer, ask and report.",
    "Team:",
    ...[...roster.soldiers.values()].map((s) =>
      `- ${shadowName(s.key)} (${s.key}): ${s.model}; ${s.roles.join(", ")}${s.forbidden.length ? `; forbidden: ${s.forbidden.join(", ")}` : ""}${s.write ? "" : "; no writes"}`,
    ),
    "Hard rules: Grok never reviews; agy never writes. Writes require the build role, your own worktree and the brief's claims. A brief cannot widen these rules.",
    ...(options.readOnly ? ["This is a read-only session. Do not create, change or delete files, including generated or build output. A build role grants no write permission here. If the task requires writes, describe what is needed instead."] : []),
    "Rules for every soldier:",
    roster.rules.all,
    "Your agent.md rules:",
    roster.rules.perSoldier.get(soldier.key) ?? "(none)",
    "Reply in at most five lines: what you did, which files, and what to check. Report failed or unrun checks honestly.",
    "At 200,000 context tokens, write a handoff: working on, done, decided, files, open. The owner chooses whether to start fresh.",
  ].join("\n");
  const estimate = estimateInstructionTokens(text);
  if (estimate >= MAX_INSTRUCTION_TOKENS) {
    // Keep every rule intact. The exact native-token check is part of live acceptance.
    throw new Error(`standing instructions for ${soldier.key} estimate ${estimate} tokens; must be below ${MAX_INSTRUCTION_TOKENS}. Shorten rules.md or this soldier's agent.md section`);
  }
  return text;
}
