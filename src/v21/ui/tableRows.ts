// The whole War Table screen as rows, exactly the view's width by `height`. No Ink, so the mod can reuse it.
import { RANK, STATES, needs, safeText, toAscii, type ArmyView, type Briefs, type Message, type Soldier, type Tone } from "./model.js";
import { cardRows, type CardInfo } from "./cardRows.js";
import { messageRows, monarchRows } from "./boardRows.js";
import { lr, stripRow, type Row, type Seg } from "./layout.js";

/** A card's words. `tokensK` is for a card that differs from the strip; `short` is the folded tree's note. */
export type TableCard = CardInfo & { tokensK?: number; short?: string };
/** The decision pinned in the drawer, in the CLI's own words. */
export interface PinnedCard {
  soldier: string; asks: string; worktree: string; askedAt: string; waiting: string;
  question: string; command: string; options: string[]; source: string; hostNote: string; keys: string;
}
export interface TableScene {
  runId: string;
  /** The focus line's last words. */
  hint: string;
  cards: Record<string, TableCard>;
  briefs: Briefs;
  messages: Message[];
  focus?: string;
  /** What is travelling on a soldier's connector, in place of the line. */
  packets?: Record<string, Seg>;
  pinned?: PinnedCard;
}

// The design's threshold: below it the board folds to a tree. The board also holds only two rows of three.
const BOARD_WIDTH = 110, BOARD_HEIGHT = 28, SEATS = 6;

// Terminal columns, not code points: wide characters take two cells. Same rule as Ink's own measuring, with no new dependency.
const graphemes = new Intl.Segmenter();
const WIDE = [[0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1faff], [0x20000, 0x3fffd]];
const cols = (g: string): number => {
  const cp = g.codePointAt(0)!;
  return WIDE.some(([a, b]) => cp >= a && cp <= b) || g.includes("️") ? 2 : 1;
};
const parts = (text: string): string[] => Array.from(graphemes.segment(text), (x) => x.segment);
const textWidth = (text: string): number => parts(text).reduce((n, g) => n + cols(g), 0);
const rw = (r: Row): number => r.reduce((n, x) => n + textWidth(x.text), 0);
/** Like `fit`, in terminal columns: clip with an ellipsis, then pad. */
function fitCols(r: Row, w: number): Row {
  const n = rw(r);
  if (n <= w) return n < w ? [...r, { text: " ".repeat(w - n) }] : r;
  const out: Row = [];
  let used = 0;
  for (const x of r) {
    const keep: string[] = [];
    for (const g of parts(x.text)) {
      if (used + cols(g) > w - 1) {
        out.push({ ...x, text: keep.join("") + "…" });
        return used + 1 < w ? [...out, { text: " ".repeat(w - used - 1) }] : out;
      }
      keep.push(g); used += cols(g);
    }
    out.push(x);
  }
  return out;
}

const seg = (text: string, tone?: Tone, bold?: boolean): Seg => ({ text, tone, bold });
// The glyphs of this file's own rows that the slice's ASCII table lacks.
const TABLE_ASCII: Record<string, string> = {
  "┃": "|", "┊": ":", "┆": ":", "□": "=", "■": "#", "┏": "+", "┓": "+", "┗": "+", "┛": "+", "━": "=", "├": "+", "└": "+",
};
const own = (rows: Row[], ascii: boolean): Row[] =>
  !ascii ? rows : rows.map((r) => r.map((s) => ({
    ...s, text: toAscii(Array.from(s.text, (c) => TABLE_ASCII[c] ?? c).join("")),
  })));

/** The soldiers that need the owner, most urgent first. */
const asking = (view: ArmyView): Soldier[] =>
  view.soldiers.filter((s) => needs(s.state)).sort((a, b) => RANK[a.state] - RANK[b.state]);

function titleRow(view: ArmyView, scene: TableScene, folded: boolean): Row {
  const count = (...states: string[]) => view.soldiers.filter((s) => states.includes(s.state)).length;
  const n = asking(view).length, cold = count("cold");
  // A soldier near its handoff line is still in its turn.
  const right: Row = [seg(`${count("work", "near")} working`, "ac")];
  if (n) right.push(seg("  "), seg(`${n} ${n === 1 ? "needs" : "need"} you`, "wn", true));
  if (cold && !folded) right.push(seg("  "), seg(`${cold} cold`, "in"));
  const name: Row = [seg(" SHADOW ARMY ", "ac", true), seg(" war table", undefined, true)];
  const run = seg(`  run ${safeText(scene.runId)} · ${view.soldiers.length} soldiers`, "dm");
  const left = folded || rw([...name, run, ...right]) >= view.width ? name : [...name, run];
  return lr(left, right, view.width);
}

function focusRow(view: ArmyView, scene: TableScene, folded: boolean): Row {
  const list = asking(view);
  const row: Row = [seg(" focus: pane ", "ac", true), seg(" ")];
  if (!list.length) return [...row, seg(" nothing needs you", "dm")];
  row.push(seg(` ! ${list.length} ${list.length === 1 ? "NEEDS" : "NEED"} YOU `, "wn", true), seg("  "));
  if (folded && scene.pinned) return [...row, seg("Tab next", "dm")];
  list.forEach((s, i) => {
    const what = s.state === "wait" ? scene.cards[s.id]?.task ?? s.task : STATES[s.state].word;
    if (i) row.push(seg(" · ", "dm"));
    row.push(seg(safeText(s.name), s.colour), seg(` ${safeText(what)}`));
  });
  return [...row, seg(`   ${safeText(scene.hint)}`, "dm")];
}

/** The Monarch panel; while a decision is pinned, its army line names who is waiting. */
function panel(view: ArmyView, scene: TableScene): Row[] {
  const rows = monarchRows(view, scene.briefs, scene.messages);
  const list = asking(view);
  if (!scene.pinned || !list.length || rows.length < 4) return rows;
  const cost = scene.briefs.costUsd;
  const left = [seg("! waiting on you", "wn", true), seg(`  ${list.map((s) => safeText(s.name)).join(", ")}`, "dm")];
  const right = Number.isFinite(cost) ? [seg(`$${cost!.toFixed(2)} where the CLIs report a cost`, "dm")] : [];
  const edge = own([[seg("║", "ac")]], view.ascii)[0];
  const line = own([lr(left, right, view.width - 4)], view.ascii)[0];
  return rows.map((r, i) => (i === 2 ? [...edge, seg(" "), ...line, seg(" "), ...edge] : r));
}

/** Words of a row wrapped to `w` columns, tones kept; a word wider than a line is broken between characters. */
function wrap(row: Row, w: number): Row[] {
  const lines: Row[] = [[]];
  let used = 0;
  const put = (text: string, x: Seg, width: number) => { lines[lines.length - 1].push({ ...x, text }); used += width; };
  const next = () => { lines.push([]); used = 0; };
  for (const x of row) {
    for (const token of x.text.split(/(\s+)/).filter(Boolean)) {
      const width = textWidth(token);
      if (/^\s+$/.test(token)) { if (used && used + width <= w) put(token, x, width); continue; }
      if (used && used + width > w) next();
      if (width <= w) { put(token, x, width); continue; }
      for (const g of parts(token)) {
        if (used && used + cols(g) > w) next();
        put(g, x, cols(g));
      }
    }
  }
  return lines.filter((l) => l.length);
}

function decisionRows(view: ArmyView, scene: TableScene, p: PinnedCard, height: number, folded: boolean): Row[] {
  const w = view.width, list = asking(view);
  const s = view.soldiers.find((x) => x.id === p.soldier);
  const name = safeText(s?.name ?? p.soldier);
  const next = list.find((x) => x.id !== p.soldier);
  const nextName = next ? safeText(next.name) : "";
  const title: Row = [seg(" "), seg("!", "wn", true), seg(" "), seg(name, s?.colour, true), seg(` ${safeText(p.asks).replace(/:$/, "")}`, "dm")];
  if (folded) title.push(seg(`  1/${list.length}`, "wn", true));
  else {
    title.push(seg(`   ${list.length} ${list.length === 1 ? "needs" : "need"} you`, "wn", true));
    if (next) title.push(seg(`  Tab: next → ${nextName} ${STATES[next.state].glyph}`, "dm"));
  }
  const ask: Row = [seg(safeText(p.asks)), seg(folded ? " " : "  "), seg(safeText(p.question)), seg(folded ? "  " : "    "), seg(safeText(p.command), "tx", true)];
  const options: Row[] = p.options.map((o, i) => [seg(`${i + 1}`, "wn", true), seg(` ${safeText(o)}`, "wn")]);
  const answers: Row = p.options.flatMap((o, i) => [seg(i ? (folded ? "   " : "      ") : ""), seg(`${i + 1}`, "wn", true), seg(` ${safeText(o)}`, "wn")]);
  const card = scene.cards[p.soldier];
  const used = card?.tokensK ?? s?.tokensK ?? 0;
  const facts = [`${name} turn is paused until you answer`, `${used}k / 200k handoff`,
    ...(card?.windowPct === undefined ? [] : [`${card.windowPct}% window`]), safeText(p.hostNote)].join(" · ");
  const inner = w - 4;
  const dm = (text: string): Row[] => wrap([seg(text, "dm")], inner);
  const worktree = dm(`worktree  ${safeText(p.worktree)}      asked  ${safeText(p.askedAt)}      waiting  ${safeText(p.waiting)}`);
  // The prompt, the command and every option come first when rows run out; a line too narrow is reflowed, not cut.
  const spread = (tail: Row): Row[] => rw([...answers, ...tail]) <= inner
    ? [[...answers, ...tail]] : [...options.flatMap((o) => wrap(o, inner)), ...(tail.length ? wrap(tail, inner) : [])];
  const full: Row[] = folded
    ? [...wrap(ask, inner), ...spread([]), ...wrap([seg(safeText(p.source), "fa")], inner),
      ...(next ? dm(`Tab: next → ${nextName} ${STATES[next.state].glyph} ${STATES[next.state].word}`) : [[]])]
    : [...worktree, ...wrap(ask, inner), ...spread([seg(`      ${safeText(p.source)}`, "fa")]), ...dm(facts), ...dm(safeText(p.keys))];
  // A decision taller than its room keeps the prompt and every numbered answer; the command gives up its last lines.
  const room = height - 2;
  let body = full;
  if (full.length > room) {
    const prompt = wrap([seg(safeText(p.asks)), seg(" "), seg(safeText(p.question))], inner);
    const command = wrap([seg(safeText(p.command), "tx", true)], inner);
    const choices = spread([]);
    const left = Math.max(0, room - prompt.length - choices.length);
    const shown = command.length <= left ? command : left ? [...command.slice(0, left - 1), [seg(`… ${command.length - left + 1} more command lines`, "dm")]] : [];
    body = [...prompt, ...shown, ...choices, ...full.slice(wrap(ask, inner).length + choices.length)];
  }
  if (height < 3) return [];
  const label = [...fitCols(title, Math.min(rw(title), w - 5)), seg(" ")];
  const side = seg("┃", "wn");
  return own([
    [seg("┏━", "wn"), ...label, seg("━".repeat(w - 3 - rw(label)) + "┓", "wn")],
    ...body.slice(0, height - 2).map((r) => [side, seg(" "), ...fitCols(r, w - 4), seg(" "), side]),
    [seg("┗" + "━".repeat(w - 2) + "┛", "wn")],
  ], view.ascii);
}

const drawer = (view: ArmyView, scene: TableScene, height: number, folded: boolean): Row[] =>
  scene.pinned ? decisionRows(view, scene, scene.pinned, height, folded) : messageRows(view, scene.messages, height);

const withCard = (s: Soldier, c: TableCard | undefined): Soldier => ({ ...s, tokensK: c?.tokensK ?? s.tokensK });

/** The board above the drawer. */
function board(view: ArmyView, scene: TableScene): Row[] {
  const w = view.width;
  const cw = Math.floor((w - 4) / 3), gap = Math.floor((w - 3 * cw) / 4), col = Math.floor((cw - 1) / 2);
  const seats = Array.from({ length: 3 }, (_, i) => i);
  const waiting = view.soldiers.some((s) => s.state === "wait" || s.state === "ready");
  const dimmed = (s: Soldier) => waiting && ["idle", "cold", "off"].includes(s.state);

  const cards = (from: number, notch: "top" | "bottom"): Row[] => {
    const drawn = seats.map((i) => {
      const s = view.soldiers[from + i];
      if (!s) return undefined;
      const c = scene.cards[s.id];
      const rows = cardRows(withCard(s, c), c ?? { role: "" }, { width: cw, focus: scene.focus === s.id, notch, ascii: view.ascii });
      return dimmed(s) ? rows.map((r) => r.map((x): Seg => ({ text: x.text, tone: "fa" }))) : rows;
    });
    return Array.from({ length: 7 }, (_, y) => drawn.flatMap((rows) => [seg(" ".repeat(gap)), ...(rows?.[y] ?? [seg(" ".repeat(cw))])]));
  };

  const connectors = (from: number): Row => {
    const row: Row = [];
    for (const i of seats) {
      const s = view.soldiers[from + i];
      let mark = seg(" ");
      if (s) {
        const line = needs(s.state) ? "┃" : s.state === "cold" ? "┊" : s.state === "off" || s.state === "start" ? "┆" : "│";
        const tone: Tone = dimmed(s) ? "fa" : needs(s.state) || s.state === "near" ? "wn" : "ac";
        mark = scene.packets?.[s.id] ?? seg(line, tone, needs(s.state));
      }
      row.push(seg(" ".repeat(gap + col)), mark, seg(" ".repeat(cw - col - 1)));
    }
    return own([row], view.ascii)[0];
  };

  return [
    titleRow(view, scene, false), focusRow(view, scene, false),
    ...cards(0, "bottom"), connectors(0), ...panel(view, scene), connectors(3), ...cards(3, "top"),
  ];
}

/** The narrow screen: one line per soldier in place of the cards, with the drawer under the tree. */
function tree(view: ArmyView, scene: TableScene): Row[] {
  const lines = view.soldiers.map((s, i): Row => {
    const c = scene.cards[s.id], look = STATES[s.state], k = withCard(s, c).tokensK;
    const filled = Math.round(Math.min(1, k / 200) * 10);
    return [
      seg(i === view.soldiers.length - 1 ? " └─ " : " ├─ ", "fa"), seg(safeText(s.tag), s.colour, true), seg(" "),
      seg(`${look.glyph} ${look.word.padEnd(15)}`, look.tone, look.bold), seg(" "),
      seg("▓".repeat(filled), k >= 180 ? "dn" : k >= 100 ? "wn" : "ok"), seg("░".repeat(10 - filled), "fa"),
      seg(k ? ` ${`${k}k`.padStart(4)}` : "", "dm"), seg(c?.short ? `  ${safeText(c.short)}` : "", "dm"),
    ];
  });
  // The panel is asked for under the box threshold, so a short wide screen gets the one line too.
  const one = monarchRows({ ...view, width: Math.min(view.width, BOARD_WIDTH - 1) }, scene.briefs, scene.messages);
  return [titleRow(view, scene, true), focusRow(view, scene, true), ...one, ...own(lines, view.ascii), []];
}

/** The screen: title, focus line, the board or the tree, and the strip on the last row. */
export function tableRows(view: ArmyView, scene: TableScene, height: number): Row[] {
  const w = view.width;
  let full = w >= BOARD_WIDTH && height >= BOARD_HEIGHT && view.soldiers.length <= SEATS;
  let top = full ? board(view, scene) : tree(view, scene);
  // A pinned decision is never cut (VIS-3): when the board and the whole decision do not fit, the tree stands in for the board.
  if (full && scene.pinned && top.length + decisionRows(view, scene, scene.pinned, Infinity, false).length + 1 > height) {
    full = false;
    top = tree(view, scene);
  }
  const room = Math.max(0, height - 1);
  // The rows above the drawer give way first, from the bottom.
  // A taller decision is capped, so the title and focus lines stay above it.
  if (scene.pinned) {
    const need = Math.min(decisionRows(view, scene, scene.pinned, Infinity, !full).length, room - 2);
    top = top.slice(0, Math.max(2, room - need));
  }
  const body = [...top, ...drawer(view, scene, room - top.length, !full)].slice(0, room);
  while (body.length < height - 1) body.push([]);
  // A cut row ends in an ellipsis, which the ASCII profile swaps too.
  return [...body, stripRow(view)].slice(0, height).map((r) => own([fitCols(r, w)], view.ascii)[0]);
}
