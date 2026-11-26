// The war ledger as the finished table's drawer: what each soldier did this run. No Ink, so the mod can reuse it.
import { safeText, type ArmyView, type Tone } from "./model.js";
import { drawerBox, finishedRows, rw, wrapRow } from "./summaryRows.js";
import type { Row, Seg } from "./layout.js";
import type { TableScene } from "./tableRows.js";

export interface LedgerLine {
  soldier: string; briefs: number; answers: number; peakK: number; time: string;
  /** What happened to that context: the soldier handed off, or the session began cold. */
  peakMark?: "handoff" | "cold";
  /** Left out when the soldier's CLI reported no cost; never an estimate. */
  costUsd?: number;
  outcome: { mark: "✓" | "⇥" | "!"; text: string };
}

const seg = (text: string, tone?: Tone, bold?: boolean): Seg => ({ text, tone, bold });
const MARK = { handoff: seg("⇥", "wn"), cold: seg("❄", "in") };

/** The name, briefs, answers, peak context, time and cost columns; the outcome follows them. */
function columns(name: Seg, briefs: string, answers: string, peak: Row, time: string, cost: string, outcome: Row): Row {
  const peakWidth = peak.reduce((n, s) => n + s.text.length, 0);
  return [
    { ...name, text: name.text.padEnd(9) }, seg(briefs.padStart(6)), seg(answers.padStart(8)), seg("  "),
    ...peak, seg(" ".repeat(Math.max(1, 9 - peakWidth))), seg(time.padStart(6)), seg(cost.padStart(8)), seg("   "), ...outcome,
  ];
}

/** A narrow screen's soldier: name, time, cost, counts and peak, with the outcome wrapped under it. */
function block(name: Seg, l: LedgerLine, peak: Row, cost: string, outcome: Row, inner: number): Row[] {
  const lead: Row = [{ ...name, text: name.text.padEnd(9) }, seg(safeText(l.time).padStart(6)), seg(cost.padStart(8)), seg("  "),
    seg(`${l.briefs}/${l.answers}`), seg(" "), ...peak];
  return [lead, ...wrapRow(outcome, inner - 2).map((r): Row => [seg("  "), ...r])];
}

export function ledgerRows(view: ArmyView, scene: TableScene, lines: LedgerLine[], height: number): Row[] {
  const inner = view.width - 4;
  const head = columns(seg("soldier"), "briefs", "answers", [seg("peak ctx")], "time", "cost", [seg("outcome")]);
  const parts = lines.map((l) => {
    const s = view.soldiers.find((x) => x.id === l.soldier);
    const peak = [seg(`${l.peakK}k`), ...(l.peakMark ? [seg(" "), MARK[l.peakMark]] : [])];
    const cost = Number.isFinite(l.costUsd) ? `$${l.costUsd!.toFixed(2)}` : "—";
    const name = seg(safeText(s?.name ?? l.soldier), s?.colour, true);
    const outcome: Row = [seg(l.outcome.mark, l.outcome.mark === "✓" ? "ok" : "wn"), seg(` ${safeText(l.outcome.text)}`)];
    return { row: columns(name, String(l.briefs), String(l.answers), peak, safeText(l.time), cost, outcome), block: block(name, l, peak, cost, outcome, inner) };
  });
  const title: Row = [seg("✓", "ok"), seg(" war ledger", "ac", true), seg("  what each soldier did this run", "dm"), seg("  t summary", "fa")];
  // Too narrow for the columns: each soldier reflows onto lines instead of being clipped.
  const wide = [head, ...parts.map((p) => p.row)].every((r) => rw(r) <= inner);
  const narrow: Row = [seg("soldier".padEnd(9)), seg("time".padStart(6)), seg("cost".padStart(8)), seg("  "), seg("b/a peak")];
  const dim = (r: Row): Row => r.map((s) => ({ ...s, tone: "dm" as Tone }));
  const table: Row[] = wide ? [dim(head), ...parts.map((p) => p.row)] : [dim(narrow), ...parts.flatMap((p) => p.block)];
  return finishedRows(view, scene, height, (room) => drawerBox(view, title, table, Math.min(room, table.length + 2)));
}
