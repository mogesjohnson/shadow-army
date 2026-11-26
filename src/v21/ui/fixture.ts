// Fixtures for the War Table until the post office feeds the view (the design's lib.mjs ARMY and kit.mjs models).
import type { ArmyView, Briefs, Message, Soldier } from "./model.js";

/** The design's whole roster, in roster order; the strip tests compare all six with the canvas frames. */
export const ROSTER: Soldier[] = [
  { id: "iron", name: "Iron", tag: "Ir", colour: "s5", host: "claude-sonnet", queued: 0, model: "sonnet", state: "work", tokensK: 112, task: "toggle in settings" },
  { id: "igris", name: "Igris", tag: "Ig", colour: "s2", host: "codex-sol", queued: 2, model: "gpt-6.1-sol", state: "near", tokensK: 181, task: "theme tokens" },
  { id: "beru", name: "Beru", tag: "Be", colour: "s1", host: "grok", queued: 1, model: "grok-4.7", state: "wait", tokensK: 64, task: "asks to run a command" },
  { id: "tusk", name: "Tusk", tag: "Tu", colour: "s3", host: "agy", queued: 0, model: "gemini-3.1-pro-high", state: "idle", tokensK: 38, task: "idle · last: lint scan" },
  { id: "kaisel", name: "Kaisel", tag: "Ka", colour: "ac", host: "claude-opus", queued: 0, model: "opus", state: "cold", tokensK: 142, task: "cold · review of toggle" },
  { id: "bellion", name: "Bellion", tag: "Bl", colour: "s4", host: "codex-astra", queued: 0, model: "gpt-6-astra", state: "off", tokensK: 0, task: "not started" },
];

/** The War Table's first scene: three soldiers, Beru's open decision, Igris's handoff card. */
export function warTable(width: number, ascii = false, soldiers: Soldier[] = ROSTER.slice(0, 3)): ArmyView {
  return {
    soldiers,
    decisions: [
      { id: "d1", soldier: "beru", question: "Run this command? npm run lint -- --fix", answers: ["1 yes", "2 yes, and don't ask again", "3 no"] },
    ],
    handoffs: [{ soldier: "igris", tokensK: 181, summary: "theme tokens: palette done, dark mode left" }],
    width,
    ascii,
  };
}

/** The "work 144" frame's Monarch numbers and messages. */
export const BRIEFS: Briefs = {
  sent: 4, answered: 1, queued: 1, sinceFirst: "2:41", costUsd: 0.41,
  talkNote: "(one line in Claude's transcript, MSG-6)",
};
export const MESSAGES: Message[] = [
  { time: "14:31:02", from: "monarch", to: "iron", kind: "brief", text: 'brief "dark-mode toggle…"', status: "delivered" },
  { time: "14:31:40", from: "igris", to: "iron", kind: "peer", text: '"tokens ready: bg.dark, text.dark"', status: "delivered" },
  { time: "14:32:11", from: "tusk", to: "monarch", kind: "summary", text: "summary · lint scan · 0 findings", status: "answered" },
  { time: "14:32:30", from: "beru", to: "you", kind: "ask", text: "asks: Run this command?", status: "waiting" },
  { time: "14:32:40", from: "monarch", to: "kaisel", kind: "brief", text: 'brief "review the toggle" · queued, cold', status: "queued" },
];
