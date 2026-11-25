// The War Table soldier card: seven rows, exactly `width` cells wide. No Ink, so the mod can reuse it.
import { STATES, needs, safeText, toAscii, type Soldier, type SoldierState, type Tone } from "./model.js";
import { fit, lr, rowWidth, type Row, type Seg } from "./layout.js";

/** What a card shows beyond the view model's soldier. */
export interface CardInfo {
  role: string;
  elapsed?: string;
  /** The card's task line, when it is worded differently from the strip's. */
  task?: string;
  /** The tool running now. It takes the third line, before `note`. */
  tool?: string;
  note?: Seg;
  windowPct?: number;
}
export interface CardOpts { width: number; focus?: boolean; notch?: "top" | "bottom"; ascii?: boolean }
export type Edge = "round" | "heavy" | "dashed";

const DASHED: ReadonlySet<SoldierState> = new Set(["start", "idle", "cold", "off"]);
/** The border tells states apart without colour: heavy needs the owner, dashed is not in a turn. */
export const cardEdge = (s: SoldierState): Edge => (needs(s) ? "heavy" : DASHED.has(s) ? "dashed" : "round");

/** Top-left, top-right, bottom-left, bottom-right, horizontal, vertical. */
const BOX: Record<Edge, string[]> = {
  round: ["╭", "╮", "╰", "╯", "─", "│"],
  heavy: ["┏", "┓", "┗", "┛", "━", "┃"],
  dashed: ["╭", "╮", "╰", "╯", "┄", "┆"],
};
// The card glyphs the slice's ASCII table lacks; toAscii does the rest.
const CARD_ASCII: Record<string, string> = {
  "╭": "+", "╮": "+", "╰": "+", "╯": "+", "┏": "+", "┓": "+", "┗": "+", "┛": "+", "┬": "+", "┴": "+",
  "━": "=", "┃": "|", "┄": ".", "┆": ":", "▶": ">", "✓": "v", "−": "-",
};
const ascii = (text: string): string => toAscii(Array.from(text, (c) => CARD_ASCII[c] ?? c).join(""));
const seg = (text: string, tone?: Tone, bold?: boolean): Seg => ({ text, tone, bold });

/** Under 40 columns the role leaves the title and leads the task line (the "needs 110" frame). */
const NARROW = 40;
const MIN_WIDTH = 12;

function stateRow(s: Soldier, elapsed: string | undefined, inner: number): Row {
  const look = STATES[s.state];
  const left = [seg(`${look.glyph} ${look.word}`, look.tone, look.bold)];
  if (elapsed) left.push(seg(`  ${safeText(elapsed)}`, "dm"));
  const room = inner - rowWidth(left) - 1;
  const host = seg(safeText(s.host), "dm");
  // The host is cut to the room left; under four cells it would say nothing, so it is dropped.
  if (rowWidth([host]) <= room) return lr(left, [host], inner);
  return room >= 4 ? lr(left, fit([host], room), inner) : left;
}

/** Ten cells to the 200k handoff line. */
function meterRow(tokensK: number): Row {
  if (!tokensK) return [];
  const f = Math.min(1, tokensK / 200);
  const n = Math.round(f * 10);
  const tone: Tone = f >= 0.9 ? "dn" : f >= 0.5 ? "wn" : "ok";
  return [seg("▓".repeat(n), tone), seg("░".repeat(10 - n), "fa"), seg(` ${tokensK}k/200k handoff`, "dm")];
}

/** Replace the cell at `col`, where a stem to the Monarch leaves the border. */
function stamp(row: Row, col: number, ch: string): Row {
  const out: Row = [];
  let at = 0;
  for (const s of row) {
    const cs = Array.from(s.text);
    const i = col - at;
    if (i >= 0 && i < cs.length) cs[i] = ch;
    at += cs.length;
    out.push({ ...s, text: cs.join("") });
  }
  return out;
}

export function cardRows(s: Soldier, info: CardInfo, opts: CardOpts): Row[] {
  const w = Math.max(MIN_WIDTH, opts.width);
  const inner = w - 4;
  const narrow = w < NARROW;
  const edge = cardEdge(s.state);
  const tone: Tone = edge === "heavy" ? "wn" : s.state === "cold" ? "in" : edge === "dashed" ? "fa" : s.state === "near" ? "wn" : "ac";
  const [tl, tr, bl, br, h, v] = BOX[edge];

  const name = safeText(s.name), role = safeText(info.role);
  const title: Row = [seg(opts.focus ? ` ▶ ${name} ` : name, s.colour, true)];
  if (!narrow) title.push(seg(` · ${role}`, "dm"));
  const label: Row = [seg(" "), ...(rowWidth(title) > w - 5 ? fit(title, w - 5) : title), seg(" ")];
  const top: Row = [seg(tl + h, tone), ...label, seg(h.repeat(w - 3 - rowWidth(label)) + tr, tone)];
  const bottom: Row = [seg(bl + h.repeat(w - 2) + br, tone)];

  const task = seg(safeText(info.task ?? s.task), "tx");
  const third: Row = info.tool
    ? [seg("↳", "in"), seg(` ${safeText(info.tool)}`, "dm")]
    : info.note ? [{ ...info.note, text: safeText(info.note.text) }] : [];
  const body: Row[] = [
    stateRow(s, info.elapsed, inner),
    narrow ? [seg(`${role} · `, "dm"), task] : [task],
    third,
    meterRow(s.tokensK),
    info.windowPct === undefined ? [] : [seg(`${" ".repeat(11)}· ${info.windowPct}% window`, "dm")],
  ];

  const col = Math.floor((w - 1) / 2);
  const rows: Row[] = [
    opts.notch === "top" ? stamp(top, col, "┴") : top,
    ...body.map((r) => [seg(v, tone), seg(" "), ...fit(r, inner), seg(" "), seg(v, tone)]),
    opts.notch === "bottom" ? stamp(bottom, col, "┬") : bottom,
  ];
  return opts.ascii ? rows.map((r) => r.map((x) => ({ ...x, text: ascii(x.text) }))) : rows;
}
