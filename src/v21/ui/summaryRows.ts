// The finished War Table and its summary drawer as rows. No Ink, so the mod can reuse them.
import { safeText, toAscii, type ArmyView, type Soldier, type Tone } from "./model.js";
import { cardRows, type CardInfo } from "./cardRows.js";
import { monarchRows } from "./boardRows.js";
import { cells, fit, lr, rowWidth, type Row, type Seg } from "./layout.js";
import { tableRows, type TableScene } from "./tableRows.js";

/** What the last answer said, and what each worktree holds. */
export interface Summary {
  from: string; report: string; answered: string; changes: string; tests: string; applied: string;
  worktrees: { soldier: string; line: string }[];
}

// tableRows' own threshold: under it the board folds to the tree.
const BOARD_WIDTH = 110, BOARD_HEIGHT = 28, SEATS = 6, BOARD_DRAWER_AT = 23;

// Widths and clipping are layout.ts's (string-width cells); only the grapheme split for breaking a long word lives here.
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const parts = (text: string): string[] => Array.from(graphemes.segment(text), (x) => x.segment);
export const rw = rowWidth;
/** Words of a row wrapped to `w` columns, tones kept; a word wider than a line is broken between characters. */
export function wrapRow(row: Row, w: number): Row[] {
  const lines: Row[] = [[]];
  let used = 0;
  const put = (text: string, x: Seg, width: number) => { lines[lines.length - 1].push({ ...x, text }); used += width; };
  const next = () => { lines.push([]); used = 0; };
  for (const x of row) {
    for (const token of x.text.split(/(\s+)/).filter(Boolean)) {
      const width = cells(token);
      if (/^\s+$/.test(token)) { if (used && used + width <= w) put(token, x, width); continue; }
      if (used && used + width > w) next();
      if (width <= w) { put(token, x, width); continue; }
      for (const g of parts(token)) {
        if (used && used + cells(g) > w) next();
        put(g, x, cells(g));
      }
    }
  }
  return lines.filter((l) => l.length);
}

const seg = (text: string, tone?: Tone, bold?: boolean): Seg => ({ text, tone, bold });
// The glyphs of these screens that toAscii's table lacks.
const MORE_ASCII: Record<string, string> = {
  "╭": "+", "╮": "+", "╰": "+", "╯": "+", "╔": "+", "╗": "+", "╚": "+", "╝": "+", "═": "=", "║": "|", "✓": "v", "−": "-", "—": "-",
};
const own = (rows: Row[], ascii: boolean): Row[] =>
  !ascii ? rows : rows.map((r) => r.map((s) => ({ ...s, text: toAscii(Array.from(s.text, (c) => MORE_ASCII[c] ?? c).join("")) })));

/** A drawer box of at most `height` rows, borders included; a short screen drops its last lines. */
export function drawerBox(view: ArmyView, title: Row, body: Row[], height: number): Row[] {
  if (height < 3) return [];
  const w = view.width, side = seg("│", "ok");
  const label: Row = [seg(" "), ...fit(title, Math.min(rw(title), w - 5)), seg(" ")];
  return own([
    [seg("╭─", "ok"), ...label, seg("─".repeat(w - 3 - rw(label)) + "╮", "ok")],
    ...body.slice(0, height - 2).map((r) => [side, seg(" "), ...fit(r, w - 4), seg(" "), side]),
    [seg("╰" + "─".repeat(w - 2) + "╯", "ok")],
  ], view.ascii);
}

/** An idle soldier keeps a solid border once nothing needs the owner: a working card's frame with its own state line. */
function card(s: Soldier, info: CardInfo, opts: Parameters<typeof cardRows>[2]): Row[] {
  const own = cardRows(s, info, opts);
  if (s.state !== "idle") return own;
  const solid = cardRows({ ...s, state: "work" }, info, opts);
  solid[1] = [...solid[1].slice(0, 2), ...own[1].slice(2, -2), ...solid[1].slice(-2)];
  return solid;
}

const money = (usd: number | undefined): string | undefined => (Number.isFinite(usd) ? `$${usd!.toFixed(2)}` : undefined);

/** The finished screen around a drawer: `drawer` gets the rows left under the board or the tree. */
export function finishedRows(view: ArmyView, scene: TableScene, height: number, drawer: (left: number) => Row[]): Row[] {
  const w = view.width;
  // A peer line makes the War Table's panel five rows; the panel and the drawer are replaced below.
  const talk = { time: "", from: "monarch", to: "monarch", kind: "peer", text: "", status: "delivered" } as const;
  // The drawer keeps all its rows: when the board would leave it fewer, the tree stands in and the board gives up its rows first.
  const need = drawer(Infinity).length;
  const board = w >= BOARD_WIDTH && height >= BOARD_HEIGHT && view.soldiers.length <= SEATS && height - 1 - BOARD_DRAWER_AT >= need;
  const base = tableRows(view, { ...scene, messages: [talk] }, board ? height : Math.min(height, BOARD_HEIGHT - 1));
  const rows = [...base.slice(0, -1), ...Array.from({ length: height - base.length }, () => fit([], w)), base[base.length - 1]];
  const put = (at: number, next: Row[]) => next.forEach((r, i) => { if (at + i < height - 1) rows[at + i] = fit(r, w); });

  const name: Row = [seg(" SHADOW ARMY ", "ac", true), seg(" war table", undefined, true)];
  const run = seg(`  run ${safeText(scene.runId)} · finished`, "dm");
  const idle: Row = [seg("0 working", "dm")];
  const left = rw([...name, run, ...idle]) < w ? [...name, run] : name;
  const focus: Row = [seg(" focus: pane ", "ac", true), seg(" "), seg("nothing needs you", "dm"), seg(`   ${safeText(scene.hint)}`, "dm")];
  put(0, own([lr(left, idle, w), focus], view.ascii));

  // The tree is one row per soldier, so its drawer starts four rows below their count.
  let at = view.soldiers.length + 4;
  if (board) {
    const cw = Math.floor((w - 4) / 3), gap = seg(" ".repeat(Math.floor((w - 3 * cw) / 4)));
    const cards = (from: number, notch: "top" | "bottom"): Row[] => {
      const three = [0, 1, 2].map((i) => {
        const s = view.soldiers[from + i];
        if (!s) return undefined;
        const info = scene.cards[s.id] ?? { role: "" };
        return card(s, info, { width: cw, focus: scene.focus === s.id, notch, ascii: view.ascii });
      });
      return Array.from({ length: 7 }, (_, y) => three.flatMap((c) => [gap, ...(c?.[y] ?? [seg(" ".repeat(cw))])]));
    };
    put(2, cards(0, "bottom"));
    put(16, cards(3, "top"));
    // monarchRows draws the box and the briefs line; the other two lines say that the run is over.
    const panel = monarchRows(view, scene.briefs, [talk]);
    const cost = money(scene.briefs.costUsd);
    const edge = own([[seg("║", "ac")]], view.ascii)[0];
    const lines = own([
      lr([seg("✓ nothing in flight", "ok")], cost ? [seg(`${cost} where the CLIs report a cost`, "dm")] : [], w - 4),
      fit([seg("talk", "dm"), seg("  nothing in flight", "fa")], w - 4),
    ], view.ascii);
    put(10, [panel[0], panel[1], ...lines.map((r) => [...edge, seg(" "), ...r, seg(" "), ...edge]), panel[4]]);
    at = BOARD_DRAWER_AT;
  }
  const room = Math.max(0, height - 1 - at);
  const drawn = drawer(room);
  put(at, Array.from({ length: room }, (_, i) => drawn[i] ?? []));
  // A row cut above ends in an ellipsis, which the ASCII profile swaps too.
  return own(rows, view.ascii);
}

export function summaryRows(view: ArmyView, scene: TableScene, sum: Summary, height: number): Row[] {
  const soldier = (id: string) => view.soldiers.find((s) => s.id === id);
  const who = (id: string) => safeText(soldier(id)?.name ?? id);
  const spent = [scene.briefs.sinceFirst && safeText(scene.briefs.sinceFirst), money(scene.briefs.costUsd)].filter(Boolean).join(" · ");
  const inner = view.width - 4;
  // A label keeps its value: a long value wraps under its own label, a narrow row splits into one field per line.
  const field = (key: string, value: string): Row[] =>
    wrapRow([seg(safeText(value))], Math.max(1, inner - 10)).map((r, i) => [seg(i ? " ".repeat(10) : key.padEnd(10), "dm"), ...r]);
  const flow = (row: Row): Row[] => (rw(row) <= inner ? [row] : wrapRow(row, inner));
  const one: Row = [...field("changes", sum.changes)[0], seg("        "), seg("tests  ", "dm"), seg(safeText(sum.tests)), seg("        "), seg("applied  ", "dm"), seg(safeText(sum.applied))];
  const facts = rw(one) <= inner && field("changes", sum.changes).length === 1 ? [one]
    : [...field("changes", sum.changes), ...field("tests", sum.tests), ...field("applied", sum.applied)];
  const title: Row = [seg("✓", "ok"), seg(` summary from ${who(sum.from)}`, "ac", true), seg(` · ${safeText(sum.report)}`, "dm"), seg("  t ledger", "fa")];
  return finishedRows(view, scene, height, (room) => drawerBox(view, title, [
    ...field("answered", sum.answered),
    ...facts,
    ...sum.worktrees.flatMap((t) => flow([seg(who(t.soldier), soldier(t.soldier)?.colour), seg(`  ${safeText(t.line)}`, "dm")])),
    ...flow([seg("✓ The shadows return.", "ok", true), seg(spent && `  ${spent}${money(scene.briefs.costUsd) ? " where the CLIs report a cost" : ""}`, "dm")]),
    ...flow([seg("nothing is running · /send <soldier> <message> to type to one", "dm")]),
  ], room));
}
