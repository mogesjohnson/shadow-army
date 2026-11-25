// Pure layout for the War Table: rows of styled segments, exactly `w` cells wide. No Ink, so the mod can reuse it.
import { STATES, WORD, safeText, toAscii, type ArmyView, type Soldier, type Tone } from "./model.js";

export interface Seg { text: string; tone?: Tone; bold?: boolean }
export type Row = Seg[];

const seg = (text: string, tone?: Tone, bold?: boolean): Seg => ({ text, tone, bold });
const cells = (s: string): number => Array.from(s).length;
export const rowWidth = (r: Row): number => r.reduce((n, s) => n + cells(s.text), 0);
export const plain = (r: Row): string => r.map((s) => s.text).join("");

/** Clip to w cells with an ellipsis, then pad. */
export function fit(r: Row, w: number): Row {
  const n = rowWidth(r);
  if (n <= w) return n < w ? [...r, seg(" ".repeat(w - n))] : r;
  const out: Row = [];
  let used = 0;
  for (const s of r) {
    const cs = Array.from(s.text);
    if (used + cs.length <= w - 1) { out.push(s); used += cs.length; continue; }
    const keep = cs.slice(0, Math.max(0, w - 1 - used)).join("");
    out.push({ ...s, text: keep + "…" });
    break;
  }
  return out;
}

/** Left and right parts, padded between so the row is w cells. */
export function lr(l: Row, r: Row, w: number): Row {
  const gap = w - rowWidth(l) - rowWidth(r);
  if (gap < 1) return fit([...l, seg(" "), ...r], w);
  return [...l, seg(" ".repeat(gap)), ...r];
}

const asciiRow = (r: Row, ascii: boolean): Row => (ascii ? r.map((s) => ({ ...s, text: toAscii(s.text) })) : r);
const kfmt = (k: number): string => `${k}k`;

/** A five-cell meter to the 200k handoff line. */
function cell5(tokensK: number): Row {
  const f = Math.min(1, tokensK / 200);
  const n = Math.round(f * 5);
  const tone: Tone = f >= 0.9 ? "dn" : f >= 0.5 ? "wn" : "ok";
  return [seg("▓".repeat(n), tone), seg("░".repeat(5 - n), "fa")];
}

export type StripMode = "full" | "tokens" | "names" | "tag";
const MODES: StripMode[] = ["full", "tokens", "names", "tag"];

function stripItem(s: Soldier, mode: StripMode): Row {
  const look = STATES[s.state];
  const word = WORD[s.state];
  const row: Row = [
    seg(look.glyph, look.tone, look.bold),
    seg(" "),
    seg(safeText(mode === "tag" ? s.tag : s.name), s.colour, true),
  ];
  if (word) row.push(seg(` ${word}`, look.tone, look.bold));
  if (mode === "full" && s.tokensK) row.push(seg(" "), ...cell5(s.tokensK), seg(` ${kfmt(s.tokensK)}`, "dm"));
  if (mode === "tokens" && s.tokensK) row.push(seg(` ${kfmt(s.tokensK)}`, "dm"));
  return row;
}

function stripAt(view: ArmyView, mode: StripMode): Row {
  const row: Row = [seg(" "), seg("army", "ac", true), seg("  ")];
  view.soldiers.forEach((s, i) => {
    if (i) row.push(seg("  "));
    row.push(...stripItem(s, mode));
  });
  return row;
}

/**
 * HOST-6: one line in roster order. It steps down full -> tokens -> names -> tag as the width shrinks;
 * only needs-you states carry a word.
 */
export function stripRow(view: ArmyView, right: Row = []): Row {
  const w = view.width;
  for (const mode of MODES) {
    const row = stripAt(view, mode);
    if (rowWidth(row) + rowWidth(right) + 1 <= w) return asciiRow(lr(row, right, w), view.ascii);
  }
  return asciiRow(fit(stripAt(view, "tag"), w), view.ascii);
}

/**
 * HOST-4: from 50 columns one line, name · host · model with the state on the right;
 * below 50, two lines: name and state, then host and model, the model cut by an ellipsis.
 */
export function headerRows(s: Soldier, w: number, ascii = false): Row[] {
  const look = STATES[s.state];
  const name = safeText(s.name), host = safeText(s.host), model = safeText(s.model);
  const state: Row = [seg(look.glyph, look.tone, look.bold), seg(" "), seg(`${look.word} `, look.tone, look.bold)];
  const lead: Row = [seg(" "), seg(name, s.colour, true)];
  if (w >= 50) return [asciiRow(lr([...lead, seg(` · ${host} · ${model}`, "dm")], state, w), ascii)];
  const room = Math.max(4, w - cells(host) - 5);
  const cut = cells(model) > room ? Array.from(model).slice(0, room - 1).join("") + "…" : model;
  return [lr(lead, state, w), fit([seg(" "), seg(`${host} · ${cut}`, "dm")], w)].map((r) => asciiRow(r, ascii));
}
