// The war ledger as the finished table's drawer: what each soldier did this run. No Ink, so the mod can reuse it.
import { safeText, type ArmyView, type Tone } from "./model.js";
import { drawerBox, finishedRows } from "./summaryRows.js";
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

export function ledgerRows(view: ArmyView, scene: TableScene, lines: LedgerLine[], height: number): Row[] {
  const head = columns(seg("soldier"), "briefs", "answers", [seg("peak ctx")], "time", "cost", [seg("outcome")]);
  const body = lines.map((l): Row => {
    const s = view.soldiers.find((x) => x.id === l.soldier);
    const peak = [seg(`${l.peakK}k`), ...(l.peakMark ? [seg(" "), MARK[l.peakMark]] : [])];
    const cost = Number.isFinite(l.costUsd) ? `$${l.costUsd!.toFixed(2)}` : "—";
    return columns(seg(safeText(s?.name ?? l.soldier), s?.colour, true), String(l.briefs), String(l.answers), peak,
      safeText(l.time), cost, [seg(l.outcome.mark, l.outcome.mark === "✓" ? "ok" : "wn"), seg(` ${safeText(l.outcome.text)}`)]);
  });
  const title: Row = [seg("✓", "ok"), seg(" war ledger", "ac", true), seg("  what each soldier did this run", "dm"), seg("  t summary", "fa")];
  const table: Row[] = [head.map((s) => ({ ...s, tone: "dm" })), ...body];
  return finishedRows(view, scene, height, (room) => drawerBox(view, title, table, Math.min(room, table.length + 2)));
}
