import { describe, expect, it } from "vitest";
import { FINISHED_SCENE, SUMMARY, finishedTable } from "./fixture.js";
import { summaryRows } from "./summaryRows.js";
import { plain, rowWidth, type Row } from "./layout.js";
import type { ArmyView } from "./model.js";

// The design's out/d1.txt without the canvas's right padding and the host's own last three lines.
const SUMMARY_110 = String.raw`
 SHADOW ARMY  war table  run r-0412 · finished                                                       0 working
 focus: pane  nothing needs you   t shows the ledger
 ╭─ Iron ──────────────────────────╮ ╭─ Igris ─────────────────────────╮ ╭─ Beru ──────────────────────────╮
 │ ○ idle            claude-sonnet │ │ ○ idle                codex-sol │ │ ○ idle                     grok │
 │ build · toggle done · 2 files   │ │ build · theme tokens done       │ │ build · lint pass after your OK │
 │ cold in 56m                     │ │ cold in 12m                     │ │                                 │
 │ ▓▓▓░░░░░░░ 58k/200k handoff     │ │ ▓▓▓▓▓▓▓░░░ 142k/200k handoff    │ │ ▓▓▓▓░░░░░░ 71k/200k handoff     │
 │                                 │ │            · 55% window         │ │            · 28% window         │
 ╰────────────────┬────────────────╯ ╰────────────────┬────────────────╯ ╰────────────────┬────────────────╯
                  │                                   │                                   │
╔═ MONARCH you + Claude ═════════════════════════════════════════════════════════════════════════════════════╗
║ briefs  4 sent · 4 answered                                                     3:05 since the first brief ║
║ ✓ nothing in flight                                                     $0.64 where the CLIs report a cost ║
║ talk  nothing in flight                                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
                  │                                   │                                   ┆
 ╭─ Tusk ─────────┴────────────────╮ ╭─  ▶ Kaisel  ───┴────────────────╮ ╭┄ Bellion ┄┄┄┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮
 │ ○ idle                      agy │ │ ○ idle              claude-opus │ ┆ · not started       codex-astra ┆
 │ research · last: lint scan ✓    │ │ review · review answered ✓      │ ┆ orchestrate · not started       ┆
 │                                 │ │ cold in 55m                     │ ┆                                 ┆
 │ ▓▓░░░░░░░░ 38k/200k handoff     │ │ ▓▓▓░░░░░░░ 64k/200k handoff     │ ┆                                 ┆
 │                                 │ │                                 │ ┆                                 ┆
 ╰─────────────────────────────────╯ ╰─────────────────────────────────╯ ╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯
╭─ ✓ summary from Kaisel · .shadow/reports/kaisel-1431.md  t ledger ─────────────────────────────────────────╮
│ answered  Reviewed the dark-mode toggle: no blocking findings. One nit: the label could read "Dark theme". │
│ changes   none (a review)        tests  not run        applied  nothing to apply                           │
│ Iron  2 files · +42 −2 on shadow/iron · tests ✓ passed · applied ○ not yet                                 │
│ ✓ The shadows return.  3:05 · $0.64 where the CLIs report a cost                                           │
│ nothing is running · /send <soldier> <message> to type to one                                              │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
 army  ○ Iron 58k  ○ Igris 142k  ○ Beru 71k  ○ Tusk 38k  ○ Kaisel 64k  · Bellion`.slice(1).split("\n");

const text = (rows: Row[]) => rows.map((r) => plain(r).trimEnd());
const SCREENS: [string, (view: ArmyView, h: number) => Row[], string[]][] = [
  ["summary", (v, h) => summaryRows(v, FINISHED_SCENE, SUMMARY, h), SUMMARY_110],
];

describe.each(SCREENS)("%s screen", (_name, rowsOf, frame) => {
  it("matches the 110 frame", () => {
    expect(text(rowsOf(finishedTable(110), 31))).toEqual(frame);
  });
  it("is exactly the asked size at every width and height, and pure ASCII on request", () => {
    const bad: string[] = [];
    for (let w = 44; w <= 160; w++) for (let h = 16; h <= 50; h++) for (const ascii of [false, true]) {
      const rows = rowsOf(finishedTable(w, ascii), h);
      const fits = rows.length === h && rows.every((r) => rowWidth(r) === w);
      if (!fits || (ascii && !rows.every((r) => /^[\x20-\x7e]*$/.test(plain(r))))) bad.push(`${w}x${h} ${ascii}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 60_000);
});
