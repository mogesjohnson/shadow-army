// The War Table's Monarch panel and messages log as rows. No Ink, so the mod can reuse them.
import { needs, safeText, toAscii, type ArmyView, type Briefs, type Message, type Tone } from "./model.js";
import { fit, lr, rowWidth, type Row, type Seg } from "./layout.js";

const seg = (text: string, tone?: Tone, bold?: boolean): Seg => ({ text, tone, bold });

/** Below this the Monarch box folds to the one line the "80x24" frame shows. */
const BOXED = 110;
const MIN_WIDTH = 40;

// The board's glyphs the slice's ASCII table lacks. Each message kind keeps its own stand-in.
const BOARD_ASCII: Record<string, string> = {
  "╔": "+", "╗": "+", "╚": "+", "╝": "+", "═": "=", "║": "|", "╭": "+", "╮": "+", "╰": "+", "╯": "+",
  "■": "#", "□": "=", "◆": "*", "▸": ">", "✓": "v",
};
const asciiRows = (rows: Row[], ascii: boolean): Row[] =>
  !ascii ? rows : rows.map((r) => r.map((s) => ({
    ...s, text: toAscii(Array.from(s.text, (c) => BOARD_ASCII[c] ?? c).join("")),
  })));

/** Left and right parts in w cells; when they collide, only the left part is cut. */
function keepRight(l: Row, r: Row, w: number): Row {
  const room = w - rowWidth(r) - (r.length ? 1 : 0);
  return lr(rowWidth(l) > room ? fit(l, room) : l, r, w);
}

function boxed(w: number, chars: string, tone: Tone, title: Row, body: Row[]): Row[] {
  const [tl, tr, bl, br, h, v] = Array.from(chars);
  const label: Row = [seg(" "), ...(rowWidth(title) > w - 5 ? fit(title, w - 5) : title), seg(" ")];
  return [
    [seg(tl + h, tone), ...label, seg(h.repeat(w - 3 - rowWidth(label)) + tr, tone)],
    ...body.map((r) => [seg(v, tone), seg(" "), ...r, seg(" "), seg(v, tone)]),
    [seg(bl + h.repeat(w - 2) + br, tone)],
  ];
}

function party(view: ArmyView, id: string): Seg {
  if (id === "monarch") return seg("Monarch", "ac");
  if (id === "you") return seg("you", "ac");
  const s = view.soldiers.find((x) => x.id === id);
  return seg(safeText(s?.name ?? id), s?.colour ?? "tx");
}

/** The Monarch panel: a double-line box from 110 columns, one line below that. */
export function monarchRows(view: ArmyView, briefs: Briefs, messages: Message[]): Row[] {
  const w = Math.max(MIN_WIDTH, view.width);
  const counts = `${briefs.sent} sent · ${briefs.answered} answered` + (briefs.queued ? ` · ${briefs.queued} queued` : "");
  const since = briefs.sinceFirst === undefined ? undefined : safeText(briefs.sinceFirst);
  const cost = Number.isFinite(briefs.costUsd) ? `$${briefs.costUsd!.toFixed(2)}` : undefined;

  if (w < BOXED) {
    const right = [since, cost].filter((x) => x !== undefined).join(" · ");
    const left = [seg(" "), seg("MONARCH", "ac", true), seg(" "), seg("briefs", "dm"), seg(` ${counts}`)];
    return asciiRows([keepRight(left, right ? [seg(right, "dm")] : [], w)], view.ascii);
  }

  const inner = w - 4;
  // A soldier near its handoff line is still in its turn.
  const working = view.soldiers.filter((s) => s.state === "work" || s.state === "near").length;
  const asking = view.soldiers.filter((s) => needs(s.state)).length;
  const army: Row = [seg(`${working} working`, "ac")];
  if (asking) army.push(seg("  "), seg(`${asking} ${asking === 1 ? "needs" : "need"} you`, "wn", true));

  const body: Row[] = [
    keepRight([seg("briefs", "dm"), seg(`  ${counts}`)], since === undefined ? [] : [seg(`${since} since the first brief`, "dm")], inner),
    keepRight(army, cost === undefined ? [] : [seg(`${cost} where the CLIs report a cost`, "dm")], inner),
  ];
  const talk = messages.filter((m) => m.kind === "peer").at(-1);
  if (talk) {
    const row: Row = [
      seg("talk", "dm"), seg("  "), party(view, talk.from), seg(" "), seg("◆▸", "in"), seg(" "), party(view, talk.to),
      seg(`  ${safeText(talk.text)}`, "tx"),
    ];
    if (briefs.talkNote) row.push(seg(`  ${safeText(briefs.talkNote)}`, "fa"));
    body.push(fit(row, inner));
  }
  const title = [seg("MONARCH", "ac", true), seg(" you + Claude", "dm")];
  return asciiRows(boxed(w, "╔╗╚╝═║", "ac", title, body), view.ascii);
}

const KIND: Record<Message["kind"], Seg> = {
  brief: seg("■", "ac"), summary: seg("□", "dm"), peer: seg("◆", "in"), ask: seg("!", "wn", true),
};
const LEGEND = "■ brief   □ summary   ◆ soldier to soldier   ! asks you";

function status(m: Message): Seg {
  if (m.status === "waiting") return seg("waiting on you", "wn", true);
  if (m.status === "queued") return seg("… queued", "dm");
  if (m.kind === "peer" && m.status === "delivered") return seg("→ delivered", "in");
  return seg(`✓ ${m.status}`, "ok");
}

/** A name column `w` cells wide, with at least one space after the name. */
const column = (s: Seg, w: number): Row => [...fit([s], w - 1), seg(" ")];
/** The message text keeps at least this much; under it the time column goes. */
const MIN_TEXT = 10;

function messageRow(view: ArmyView, m: Message, inner: number): Row {
  const right = status(m);
  const row: Row = [...column(party(view, m.from), 8), KIND[m.kind], seg(" "), ...column(party(view, m.to), 9)];
  const time: Row = [seg(safeText(m.time), "dm"), seg("  ")];
  if (inner - rowWidth([right]) - 1 - rowWidth([...time, ...row]) >= MIN_TEXT) row.unshift(...time);
  return keepRight([...row, seg(safeText(m.text), "tx")], [right], inner);
}

/** The messages log in at most `height` rows, borders included: the last messages that fit, newest at the bottom. */
export function messageRows(view: ArmyView, messages: Message[], height: number): Row[] {
  if (height < 2) return [];
  const w = Math.max(MIN_WIDTH, view.width);
  const shown = messages.slice(Math.max(0, messages.length - (height - 2)));
  const title = [seg("messages", "dm"), seg(`  ${LEGEND}`, "dm")];
  return asciiRows(boxed(w, "╭╮╰╯─│", "fa", title, shown.map((m) => messageRow(view, m, w - 4))), view.ascii);
}
