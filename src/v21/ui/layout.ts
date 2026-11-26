// Pure layout for the War Table: rows of styled segments, exactly `w` cells wide. No Ink, so the mod can reuse it.
import stringWidth from "string-width";
import { STATES, WORD, needs, safeText, toAscii, type ArmyView, type Soldier, type Tone } from "./model.js";

export interface Seg { text: string; tone?: Tone; bold?: boolean }
export type Row = Seg[];

const seg = (text: string, tone?: Tone, bold?: boolean): Seg => ({ text, tone, bold });
/** Terminal cells, the same measure Ink uses (wide CJK and emoji are two, combining marks none). */
const cells = (s: string): number => stringWidth(s);
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
/** The longest grapheme prefix of s that is at most max cells wide. */
function takeCells(s: string, max: number): string {
  let out = "", used = 0;
  for (const { segment } of segmenter.segment(s)) {
    const c = cells(segment);
    if (used + c > max) break;
    out += segment;
    used += c;
  }
  return out;
}
export const rowWidth = (r: Row): number => r.reduce((n, s) => n + cells(s.text), 0);
export const plain = (r: Row): string => r.map((s) => s.text).join("");

/** Clip to w cells with an ellipsis, then pad. */
export function fit(r: Row, w: number): Row {
  if (w <= 0) return [];
  const n = rowWidth(r);
  if (n <= w) return n < w ? [...r, seg(" ".repeat(w - n))] : r;
  const out: Row = [];
  let used = 0;
  for (const s of r) {
    const sw = cells(s.text);
    if (used + sw <= w - 1) { out.push(s); used += sw; continue; }
    const keep = takeCells(s.text, Math.max(0, w - 1 - used));
    out.push({ ...s, text: keep + "…" });
    used += cells(keep) + 1;
    break;
  }
  return used < w ? [...out, seg(" ".repeat(w - used))] : out;
}

/** Left and right parts, padded between so the row is w cells. When they do not fit, the left is clipped and the right stays whole. */
export function lr(l: Row, r: Row, w: number): Row {
  const rw = rowWidth(r);
  const gap = w - rowWidth(l) - rw;
  if (gap >= 1) return [...l, seg(" ".repeat(gap)), ...r];
  if (w - rw - 1 < 1) return fit(r, w);
  return [...fit(l, w - rw - 1), seg(" "), ...r];
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

function stripAt(soldiers: Soldier[], mode: StripMode, ascii: boolean, marker: Row = []): Row {
  const row: Row = [seg(" "), seg("army", "ac", true), seg("  ")];
  soldiers.forEach((s, i) => {
    if (i) row.push(seg("  "));
    row.push(...asciiRow(stripItem(s, mode), ascii));
  });
  if (marker.length) row.push(...(soldiers.length ? [seg("  ")] : []), ...marker);
  return row;
}

/**
 * HOST-6: one line in roster order. It steps down full -> tokens -> names -> tag as the width shrinks;
 * only needs-you states carry a word. Past tags it folds: soldiers that need nothing first, as `+N more`,
 * then owner-attention overflow, as `+N · /decisions`. The right-hand segment is always kept.
 */
export function stripRow(view: ArmyView, right: Row = []): Row {
  const w = view.width, ascii = view.ascii;
  const rightRow = asciiRow(right, ascii);
  const room = w - rowWidth(rightRow) - 1;
  const done = (row: Row): Row => asciiRow(lr(row, rightRow, w), ascii);
  for (const mode of MODES) {
    const row = stripAt(view.soldiers, mode, ascii);
    if (rowWidth(row) <= room) return done(row);
  }
  const shown = [...view.soldiers];
  const folded: Soldier[] = [];
  const markers = (): Row[] => {
    const owner = folded.filter((s) => needs(s.state)).length;
    const more = folded.length - owner;
    const m = (t: string, tone: Tone): Row => [seg(t, tone, true)];
    const decisions = m(`+${owner} · /decisions`, "wn");
    if (!owner) return [m(`+${more} more`, "dm")];
    return more ? [[...m(`+${more} more`, "dm"), seg("  "), ...decisions], decisions] : [decisions];
  };
  // Fold the last soldier that needs nothing; once only owner-attention soldiers remain, fold from the end.
  while (shown.length) {
    let at = -1;
    for (let i = shown.length - 1; i >= 0; i--) if (!needs(shown[i].state)) { at = i; break; }
    folded.unshift(...shown.splice(at < 0 ? shown.length - 1 : at, 1));
    for (const marker of markers()) {
      const row = stripAt(shown, "tag", ascii, marker);
      if (rowWidth(row) <= room) return done(row);
    }
  }
  return done(stripAt([], "tag", ascii, markers()[0]));
}

/**
 * HOST-4: from 50 columns one line, name · host · model with the state on the right;
 * below 50, two lines: name and state, then host and model, the model cut by an ellipsis.
 */
export function headerRows(s: Soldier, w: number, ascii = false): Row[] {
  const look = STATES[s.state];
  const name = safeText(s.name), host = safeText(s.host), model = safeText(s.model);
  // The chosen profile is measured before padding: ASCII turns wide characters into one cell each.
  const prof = (t: string): string => (ascii ? toAscii(t) : t);
  const state: Row = [seg(look.glyph, look.tone, look.bold), seg(" "), seg(`${look.word} `, look.tone, look.bold)];
  const lead: Row = [seg(" "), seg(prof(name), s.colour, true)];
  const done = (r: Row): Row => asciiRow(r, ascii);
  if (w >= 50) return [done(lr([...lead, seg(` · ${prof(host)} · ${prof(model)}`, "dm")], asciiRow(state, ascii), w))];
  const room = Math.max(4, w - cells(prof(host)) - 5);
  const m = prof(model);
  const cut = cells(m) > room ? takeCells(m, room - 1) + "…" : m;
  return [lr(lead, asciiRow(state, ascii), w), fit([seg(" "), seg(`${prof(host)} · ${cut}`, "dm")], w)].map(done);
}
