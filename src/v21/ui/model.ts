// The v2.1 view model: what the War Table screens draw, built from fixtures until the post office feeds it.
// No Ink and no mod import here, so the mod (M5) can share it.

/** A soldier's colour (the design's s1..s8 palette, or the accent). */
export type Colour = "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8" | "ac";
/** Every colour a row can carry: the soldier colours plus the design's tones. */
export type Tone = Colour | "tx" | "dm" | "fa" | "ok" | "wn" | "dn" | "in";

export const PALETTE: Record<Tone, string> = {
  tx: "#e6e3ec", dm: "#8f899b", fa: "#5b5666", ac: "#b388ff", ok: "#5ad08a", wn: "#f0c050", dn: "#ff6b6b", in: "#5cc8e6",
  s1: "#4cc9f0", s2: "#f5b84a", s3: "#7b96ff", s4: "#6fd67a", s5: "#ff8fc8", s6: "#e8d68a", s7: "#3fd0b8", s8: "#ff9e64",
};

export type SoldierState =
  | "start" | "idle" | "work" | "wait" | "cold" | "near" | "prep" | "ready" | "held" | "down" | "auth" | "err" | "off";

export interface StateLook { glyph: string; tone: Tone; bold?: boolean; word: string }

/** The 13 states with their glyph, colour and word (the design's lib.mjs STATE). */
export const STATES: Record<SoldierState, StateLook> = {
  start: { glyph: "◌", tone: "dm", word: "starting" },
  idle: { glyph: "○", tone: "dm", word: "idle" },
  work: { glyph: "◐", tone: "ac", word: "working" },
  wait: { glyph: "!", tone: "wn", bold: true, word: "waiting on you" },
  cold: { glyph: "❄", tone: "in", word: "cold" },
  near: { glyph: "⚠", tone: "wn", word: "near handoff" },
  prep: { glyph: "⇥", tone: "ac", word: "preparing handoff" },
  ready: { glyph: "⇥", tone: "wn", bold: true, word: "handoff ready" },
  held: { glyph: "⏸", tone: "wn", bold: true, word: "queue held" },
  down: { glyph: "◌", tone: "dn", word: "disconnected" },
  auth: { glyph: "⚠", tone: "dn", word: "log in needed" },
  err: { glyph: "✗", tone: "dn", word: "error" },
  off: { glyph: "·", tone: "fa", word: "not started" },
};

/** Urgency, most urgent first (kit.mjs RANK). */
export const RANK: Record<SoldierState, number> = {
  auth: 0, err: 1, down: 2, wait: 3, ready: 4, held: 5, prep: 6, work: 7, near: 8, cold: 9, idle: 10, start: 11, off: 12,
};
/** A state that needs the owner: rank 5 or below. */
export const needs = (s: SoldierState): boolean => RANK[s] <= 5;
/** The short word the strip shows for a needs-you state (kit.mjs WORD). */
export const WORD: Partial<Record<SoldierState, string>> = {
  wait: "waiting", ready: "handoff", held: "held", down: "down", auth: "log in", err: "error",
};

export interface Soldier {
  id: string;
  name: string;
  /** Two letters, so soldiers are told apart without colour. */
  tag: string;
  colour: Colour;
  host: string;
  model: string;
  state: SoldierState;
  /** Context tokens, in thousands. */
  tokensK: number;
  task: string;
}

/** An open question a soldier's CLI asks the owner. */
export interface Decision { id: string; soldier: string; question: string; answers: string[] }
/** A soldier's handoff, ready for the owner to accept. */
export interface HandoffCard { soldier: string; tokensK: number; summary: string }

export interface ArmyView {
  soldiers: Soldier[];
  decisions: Decision[];
  handoffs: HandoffCard[];
  width: number;
  ascii: boolean;
}

/** One post office message. `from` and `to` are soldier ids, "monarch" or "you". */
export interface Message {
  time: string;
  from: string;
  to: string;
  kind: "brief" | "summary" | "peer" | "ask";
  text: string;
  status: "delivered" | "answered" | "waiting" | "queued";
}
/** The Monarch panel's numbers: briefs, and the cost only where a CLI reported one. */
export interface Briefs {
  sent: number;
  answered: number;
  queued: number;
  sinceFirst?: string;
  /** The sum the CLIs reported. Left out when none did; never an estimate. */
  costUsd?: number;
  /** Words after the soldier-to-soldier line. */
  talkNote?: string;
}

// The post office's shapes, mirrored (src/v2/postOffice.ts and channel.ts on the M1b stack); never imported.
export interface OfficeEventShape { soldier?: string; type: string; data: unknown }
export type NativeErrorKind = "rate_limit" | "context_overflow" | "login_needed" | "transport" | "other";
export interface NativeErrorShape { kind: NativeErrorKind; message: string; resetAt?: string }

/** The ASCII profile's stand-ins (lib.mjs asciiRow), for the glyphs these screens use. */
export const ASCII: Record<string, string> = {
  "◌": ".", "○": "o", "◐": "*", "❄": "*", "⚠": "!", "⇥": ">", "⏸": "=", "✗": "x", "·": ".", "…": "~",
  "─": "-", "│": "|", "▓": "#", "░": "-", "↳": ">", "→": ">", "�": "?",
};
export function toAscii(s: string): string {
  return Array.from(s, (ch) => (ch.codePointAt(0)! < 128 ? ch : ASCII[ch] ?? "?")).join("");
}

// Bidirectional controls (U+061C, U+200E-F, U+202A-E, U+2066-9) and C0/C1 controls never reach the terminal.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/gu;
/** Text from a soldier or a CLI, with each control shown as a placeholder such as <U+202E>. */
export function safeText(s: string): string {
  return s.replace(UNSAFE, (c) => `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`);
}
