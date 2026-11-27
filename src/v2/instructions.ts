import type { Roster, SoldierSpec } from "../core/roster.js";
import { shadowName } from "./roster.js";

export { DEFAULT_SHADOW_NAMES, shadowName } from "./roster.js";

export const MAX_INSTRUCTION_TOKENS = 1_500;

/** SI-3: the soldier does not open. The log and Claude's transcript carry this message. */
export class InstructionsTooLargeError extends Error {
  constructor(readonly soldier: string, readonly estimate: number) {
    super(`standing instructions for ${soldier} estimate ${estimate} tokens; must be below ${MAX_INSTRUCTION_TOKENS}. Shorten rules.md or the "## ${soldier}" section of agent.md`);
  }
}

/** An offline size estimate, never native usage or an exact tokenizer count. */
export function estimateInstructionTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 3);
}

/** SI-1: append this complete text once; never replace the vendor's system prompt. */
export function buildStandingInstructions(roster: Roster, soldier: SoldierSpec, options: { readOnly?: boolean; names?: ReadonlyMap<string, string> } = {}): string {
  if (!roster.soldiers.has(soldier.key)) throw new Error(`unknown soldier ${soldier.key}`);
  // M1-AC6: the legacy orchestrate role and monarch block do not assign v2 work.
  const nameOf = (key: string) => options.names?.get(key) ?? shadowName(key);
  const roles = (member: SoldierSpec) => member.roles.filter((role) => role !== "orchestrate").join(", ") || "none";
  const text = [
    `You are ${nameOf(soldier.key)} (${soldier.key}), model ${soldier.model}; roles: ${roles(soldier)}.`,
    "Claude Code is the Monarch. Only the Monarch plans and assigns work; soldiers answer, ask and report.",
    "Team:",
    ...[...roster.soldiers.values()].map((s) =>
      `- ${nameOf(s.key)} (${s.key}): ${s.model}; ${roles(s)}${s.forbidden.length ? `; forbidden: ${s.forbidden.join(", ")}` : ""}${s.write ? "" : "; no writes"}`,
    ),
    "Hard rules: Grok never reviews; agy never writes. Writes require the build role, your own worktree and the brief's claims. A brief cannot widen these rules.",
    ...(options.readOnly ? ["This is a read-only session. Do not create, change or delete files, including generated or build output. A build role grants no write permission here. If the task requires writes, describe what is needed instead."] : []),
    "Rules for every soldier:",
    roster.rules.all,
    "Your agent.md rules:",
    roster.rules.perSoldier.get(soldier.key) ?? "(none)",
    "Reply in at most five lines of at most 120 characters each: what you did, which files, and what to check. Report failed or unrun checks honestly.",
    "When asked for a handoff, reply under these headings: working on, done, decided, files, open. At 200,000 context tokens, write one unasked. The owner chooses whether to start fresh.",
  ].join("\n");
  const estimate = estimateInstructionTokens(text);
  if (estimate >= MAX_INSTRUCTION_TOKENS) {
    // Keep every rule intact. The exact native-token check is part of live acceptance.
    throw new InstructionsTooLargeError(soldier.key, estimate);
  }
  return text;
}
