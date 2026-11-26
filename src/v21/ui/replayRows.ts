// The War Table as it was at one moment, folded from the post office's records. No Ink, so the mod can reuse it.
import { safeText, type ArmyView, type Tone } from "./model.js";
import { drawnRows, own } from "./summaryRows.js";
import { messageRows } from "./boardRows.js";
import { fit, lr, rowWidth, type Row, type Seg } from "./layout.js";
import type { TableCard, TableScene } from "./tableRows.js";

/** Where the replay stands in the records: step `step` of `steps`, on a track running `from` to `to`. */
export interface Replay { at: string; step: number; steps: number; from: string; to: string; track: string }

const seg = (text: string, tone?: Tone, bold?: boolean): Seg => ({ text, tone, bold });
const UNKNOWN = "— not in the records";

/** The records hold no context meter, window share or cost, so none is drawn, whatever the caller passes. */
function recorded(view: ArmyView, scene: TableScene): [ArmyView, TableScene] {
  const cards = Object.fromEntries(view.soldiers.map((s): [string, TableCard] => {
    const { tokensK: _, windowPct: __, short: ___, ...card } = scene.cards[s.id] ?? { role: "" };
    return [s.id, s.state === "off" ? card : { ...card, short: UNKNOWN }];
  }));
  const { costUsd: _, sinceFirst: __, ...briefs } = scene.briefs;
  return [{ ...view, soldiers: view.soldiers.map((s) => ({ ...s, tokensK: 0 })) }, { ...scene, cards, briefs, pinned: undefined }];
}

export function replayRows(view: ArmyView, scene: TableScene, replay: Replay, height: number): Row[] {
  const w = view.width, at = safeText(replay.at);
  const [then, past] = recorded(view, scene);

  const name: Row = [seg(" REPLAY ", "in", true), seg("  "), seg(at, "in", true), seg(`  ◂ [  ${replay.step}/${replay.steps}  ] ▸`, "dm")];
  const track = seg(`  ${safeText(replay.from)} ${safeText(replay.track)} ${safeText(replay.to)}`, "fa");
  const only: Row = [seg("history only", "in")];
  const title = lr(rowWidth([...name, track, ...only]) < w ? [...name, track] : name, only, w);

  // The way back to live is the last thing a narrow screen gives up.
  const lead: Row = [seg(" focus: pane ", "ac", true), seg(" "), seg(`the table as it was at ${at}`, "in", true)];
  const back = seg(`   ${safeText(scene.hint)}`, "dm");
  const long: Row = [...lead, seg("   a dash is something the records do not hold ·", "dm"), seg(` ${safeText(scene.hint)}`, "dm")];
  const focus = rowWidth(long) <= w ? long : [...fit(lead, Math.min(rowWidth(lead), w - rowWidth([back]))), back];

  const { sent, answered, queued } = past.briefs;
  const counts = `${sent} sent · ${answered} answered` + (queued ? ` · ${queued} queued` : "");
  const talk = past.messages.filter((m) => m.kind === "peer").at(-1);

  return drawnRows(then, past, height, {
    top: [title, focus],
    talk,
    meter: [seg("░".repeat(10), "fa"), seg(` ${UNKNOWN}`, "dm")],
    unknown: `  ${UNKNOWN}`,
    panel: (box, edged) => [
      edged(lr([seg("briefs", "dm"), seg(`  ${counts}`)], [seg(at, "dm")], w - 4)),
      edged(lr([seg("from the records", "dm")], [seg("history only", "dm")], w - 4)),
      talk ? box[3] : edged([seg("talk", "dm"), seg("  no soldier-to-soldier message", "fa")]),
    ],
  }, (room) => {
    // The drawer shows as many records as the room allows, and the selected one is always among them.
    const all = past.messages, rows = Math.min(room, all.length + 2), count = Math.max(0, rows - 2);
    const picked = all.filter((m) => m.time <= replay.at).length - 1;
    const first = Math.max(0, Math.min(all.length - count, Math.max(0, picked)));
    return own(messageRows(then, all.slice(first, first + count), rows), view.ascii);
  });
}
