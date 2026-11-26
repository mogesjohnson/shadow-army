// Fixtures for the War Table until the post office feeds the view (the design's lib.mjs ARMY and kit.mjs models).
import type { ArmyView, Briefs, Message, Soldier } from "./model.js";
import type { TableCard, TableScene } from "./tableRows.js";

/** The design's whole roster, in roster order; the strip tests compare all six with the canvas frames. */
export const ROSTER: Soldier[] = [
  { id: "iron", name: "Iron", tag: "Ir", colour: "s5", host: "claude-sonnet", model: "sonnet", state: "work", tokensK: 112, task: "toggle in settings" },
  { id: "igris", name: "Igris", tag: "Ig", colour: "s2", host: "codex-sol", model: "gpt-6.1-sol", state: "near", tokensK: 181, task: "theme tokens" },
  { id: "beru", name: "Beru", tag: "Be", colour: "s1", host: "grok", model: "grok-4.7", state: "wait", tokensK: 64, task: "asks to run a command" },
  { id: "tusk", name: "Tusk", tag: "Tu", colour: "s3", host: "agy", model: "gemini-3.1-pro-high", state: "idle", tokensK: 38, task: "idle · last: lint scan" },
  { id: "kaisel", name: "Kaisel", tag: "Ka", colour: "ac", host: "claude-opus", model: "opus", state: "cold", tokensK: 142, task: "cold · review of toggle" },
  { id: "bellion", name: "Bellion", tag: "Bl", colour: "s4", host: "codex-astra", model: "gpt-6-astra", state: "off", tokensK: 0, task: "not started" },
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

const CARDS: Record<string, TableCard> = {
  iron: { role: "build", elapsed: "2:14", tool: "Edit Page.tsx +18 −2", short: "↳ Edit Page.tsx" },
  igris: { role: "build", elapsed: "6:02", tool: "Bash npm test", windowPct: 70 },
  beru: { role: "build", task: "asks: Run this command?", note: { text: "1-3 answer in the card", tone: "wn", bold: true }, windowPct: 25, short: "1-3 answer" },
  tusk: { role: "research", task: "last: lint scan ✓" },
  kaisel: { role: "review", task: "review of the toggle", note: { text: "❄ cold · tools changed", tone: "in" }, short: "cold · tools changed" },
  bellion: { role: "orchestrate" },
};

/** The "work 144" scene: all six soldiers, with the messages log in the drawer. */
export const WORK_SCENE: TableScene = {
  runId: "r-0412", hint: "the table is the pane zoomed; esc returns it to its width", cards: CARDS, briefs: BRIEFS, messages: MESSAGES,
  focus: "iron", packets: { tusk: { text: "□", tone: "dm" }, kaisel: { text: "■", tone: "in" } },
};

/** The "needs 110" scene: Igris is at its handoff line too, and Beru's decision is pinned in the drawer. */
export const NEEDS_SCENE: TableScene = {
  ...WORK_SCENE, hint: "Tab jumps · 1-3 answer", focus: "beru", briefs: { ...BRIEFS, costUsd: 0.58 },
  packets: { beru: { text: "!", tone: "wn", bold: true }, igris: { text: "⇥", tone: "wn", bold: true } },
  cards: {
    ...CARDS,
    igris: { role: "build", task: "handoff summary saved", note: { text: "a accept  e edit  g go on", tone: "wn", bold: true }, windowPct: 77, tokensK: 200, short: "a accept  e edit" },
  },
  pinned: {
    soldier: "beru", asks: "grok asks:", worktree: "shadow/beru-4", askedAt: "14:32:30", waiting: "0:15",
    question: "Run this command?", command: "npm run lint -- --fix",
    options: ["Allow once", "Allow for this session", "Reject"], source: "grok own prompt, relayed unchanged",
    hostNote: "grok has no known cache lifetime", keys: "1-3 answer with the pane keys (HOST-5) · esc later · the table keeps this card pinned",
  },
};

/** The needs-you scene's six soldiers. */
export const needsSoldiers: Soldier[] = ROSTER.map((s) => (s.id === "igris" ? { ...s, state: "ready" } : s));
