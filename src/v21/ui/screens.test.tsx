import React from "react";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import { FINISHED_SCENE, LEDGER, LEDGER_SCENE, REPLAY, REPLAY_SCENE, SUMMARY, finishedTable, replayTable } from "./fixture.js";
import { replayRows } from "./replayRows.js";
import { Replay } from "./Replay.js";
import { summaryRows } from "./summaryRows.js";
import { Summary } from "./Summary.js";
import { ledgerRows } from "./ledgerRows.js";
import { Ledger } from "./Ledger.js";
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

// The "ledger 110" frame is the same board under its own focus line and drawer.
const LEDGER_110 = [
  SUMMARY_110[0],
  " focus: pane  nothing needs you   the ledger counts briefs, answers, peak context, time and cost per soldier",
  ...SUMMARY_110.slice(2, 23),
  ...String.raw`
╭─ ✓ war ledger  what each soldier did this run  t summary ──────────────────────────────────────────────────╮
│ soldier  briefs answers  peak ctx   time    cost   outcome                                                 │
│ Iron          2       2  112k       2:14   $0.22   ✓ 2 files +42 −2 on shadow/iron                         │
│ Igris         1       1  200k ⇥     2:45   $0.29   ⇥ handed off once, then a fresh session                 │
│ Kaisel        1       1  142k ❄     0:22   $0.09   ✓ no blocking findings · began cold                     │
│ Beru          1       1  64k        2:23   $0.04   ! 1 ask · answered Allow once                           │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────╯`.slice(1).split("\n"),
  SUMMARY_110[30],
];

const REPLAY_110 = String.raw`
 REPLAY   14:31:40  ◂ [  2/5  ] ▸  14:31 ■·◆·····□····!···■ 14:33                                 history only
 focus: pane  the table as it was at 14:31:40   a dash is something the records do not hold · esc back to live
 ╭─  ▶ Iron  ──────────────────────╮ ╭─ Igris ─────────────────────────╮ ╭─ Beru ──────────────────────────╮
 │ ◐ working  0:38   claude-sonnet │ │ ◐ working             codex-sol │ │ ○ idle                     grok │
 │ build · toggle in settings      │ │ build · theme tokens            │ │ build · no message yet          │
 │ from the records: delivered     │ │ from the records: sent          │ │                                 │
 │ ░░░░░░░░░░ — not in the records │ │ ░░░░░░░░░░ — not in the records │ │ ░░░░░░░░░░ — not in the records │
 │                                 │ │                                 │ │                                 │
 ╰────────────────┬────────────────╯ ╰────────────────┬────────────────╯ ╰────────────────┬────────────────╯
                  │                                   │                                   │
╔═ MONARCH you + Claude ═════════════════════════════════════════════════════════════════════════════════════╗
║ briefs  2 sent · 0 answered                                                                       14:31:40 ║
║ from the records                                                                              history only ║
║ talk  Igris ◆▸ Iron  "tokens ready: bg.dark, text.dark"  (one line in Claude's transcript, MSG-6)          ║
╚════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
                  │                                   │                                   ┆
 ╭─ Tusk ─────────┴────────────────╮ ╭─ Kaisel ───────┴────────────────╮ ╭┄ Bellion ┄┄┄┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮
 │ ◐ working                   agy │ │ ○ idle              claude-opus │ ┆ · not started       codex-astra ┆
 │ research · lint scan            │ │ review · review of the toggle   │ ┆ orchestrate · not started       ┆
 │ from the records: delivered     │ │                                 │ ┆                                 ┆
 │ ░░░░░░░░░░ — not in the records │ │ ░░░░░░░░░░ — not in the records │ ┆                                 ┆
 │                                 │ │                                 │ ┆                                 ┆
 ╰─────────────────────────────────╯ ╰─────────────────────────────────╯ ╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯
╭─ messages  ■ brief   □ summary   ◆ soldier to soldier   ! asks you ────────────────────────────────────────╮
│ 14:31:02  Monarch ■ Iron     brief "dark-mode toggle…"                                         → delivered │
│ 14:31:40  Igris   ◆ Iron     "tokens ready: bg.dark, text.dark"                                → delivered │
│ 14:32:11  Tusk    □ Monarch  summary · lint scan · 0 findings                                   ✓ answered │
│ 14:32:30  Beru    ! you      asks: Run this command?                                        waiting on you │
│ 14:32:40  Monarch ■ Kaisel   brief "review the toggle" · queued, cold                             … queued │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
 army  ◐ Iron  ◐ Igris  ○ Beru  ◐ Tusk  ○ Kaisel  · Bellion`.slice(1).split("\n");

const text = (rows: Row[]) => rows.map((r) => plain(r).trimEnd());
type Table = (width: number, ascii?: boolean) => ArmyView;
const SCREENS: [string, (view: ArmyView, h: number) => Row[], (view: ArmyView) => React.ReactElement, string[], Table][] = [
  ["summary", (v, h) => summaryRows(v, FINISHED_SCENE, SUMMARY, h), (v) => <Summary view={v} scene={FINISHED_SCENE} summary={SUMMARY} height={31} />, SUMMARY_110, finishedTable],
  ["ledger", (v, h) => ledgerRows(v, LEDGER_SCENE, LEDGER, h), (v) => <Ledger view={v} scene={LEDGER_SCENE} ledger={LEDGER} height={31} />, LEDGER_110, finishedTable],
  ["replay", (v, h) => replayRows(v, REPLAY_SCENE, REPLAY, h), (v) => <Replay view={v} scene={REPLAY_SCENE} replay={REPLAY} height={31} />, REPLAY_110, replayTable],
];

// The drawer's own rows, border and padding stripped, wrapped lines joined by one space.
const drawerText = (rows: string[]) => rows.filter((r) => r.startsWith("│")).map((r) => r.replace(/^│ ?| ?│$/g, "").trim()).join(" ").replace(/\s+/g, " ");
const from = (rows: string[], top: string) => rows.slice(rows.findIndex((r) => r.startsWith(top)));

it.each([[110, 28], [110, 24], [120, 30]])("keeps the whole ledger drawer at %ix%i, the board giving up its rows", (w, h) => {
  const rows = text(ledgerRows(finishedTable(w), LEDGER_SCENE, LEDGER, h));
  expect(rows).toHaveLength(h);
  const drawer = drawerText(from(rows, "╭─ ✓ war ledger"));
  for (const name of ["Iron", "Igris", "Kaisel", "Beru"]) expect(drawer).toContain(name);
});

it("keeps the whole summary drawer at 110x28", () => {
  const drawer = from(text(summaryRows(finishedTable(110), FINISHED_SCENE, SUMMARY, 28)), "╭─ ✓ summary");
  expect(drawer.filter((r) => r.startsWith("│"))).toHaveLength(5);
  expect(drawer.join("\n")).toContain("nothing is running");
});

describe("a narrow screen reflows instead of clipping", () => {
  it("keeps each ledger row's time, cost and outcome at 44x24", () => {
    const drawer = drawerText(from(text(ledgerRows(finishedTable(44), LEDGER_SCENE, LEDGER, 24)), "╭─ ✓ war ledger"));
    for (const l of LEDGER) {
      expect(drawer).toContain(l.time);
      expect(drawer).toContain(`$${l.costUsd!.toFixed(2)}`);
      expect(drawer).toContain(l.outcome.text);
    }
  });
  it("keeps each summary label with its value at 44x24", () => {
    const drawer = drawerText(from(text(summaryRows(finishedTable(44), FINISHED_SCENE, SUMMARY, 24)), "╭─ ✓ summary"));
    for (const pair of ["answered Reviewed the dark-mode toggle", "changes none (a review)", "tests not run", "applied nothing to apply"]) expect(drawer).toContain(pair);
  });
});

it("shows a dash for a cost no CLI reported", () => {
  const unpriced = LEDGER.map(({ costUsd: _, ...line }) => line);
  const rows = text(ledgerRows(finishedTable(110), LEDGER_SCENE, unpriced, 31));
  expect(rows.find((r) => r.startsWith("│ Beru "))).toContain("2:23       —   ! 1 ask");
});

it("replays no meter, window or cost, whatever the view and the scene carry", () => {
  const priced = { ...REPLAY_SCENE, briefs: { ...REPLAY_SCENE.briefs, costUsd: 0.64 }, cards: FINISHED_SCENE.cards };
  for (const [w, h] of [[110, 31], [80, 24]]) {
    const all = text(replayRows(finishedTable(w), priced, REPLAY, h)).join("\n");
    expect(all).not.toMatch(/\d+k\b|% window|\$\d|▓/);
    expect(all).toContain("not in the records");
  }
});

it("keeps the way back to live on a narrow focus line", () => {
  expect(text(replayRows(replayTable(80), REPLAY_SCENE, REPLAY, 24))[1]).toContain("esc back to live");
});

describe.each(SCREENS)("%s screen", (_name, rowsOf, element, frame, table) => {
  it("matches the 110 frame", () => {
    expect(text(rowsOf(table(110), 31))).toEqual(frame);
  });
  it("is exactly the asked size at every width and height, and pure ASCII on request", () => {
    const bad: string[] = [];
    for (let w = 44; w <= 160; w++) for (let h = 16; h <= 50; h++) for (const ascii of [false, true]) {
      const rows = rowsOf(table(w, ascii), h);
      const fits = rows.length === h && rows.every((r) => rowWidth(r) === w);
      if (!fits || (ascii && !rows.every((r) => /^[\x20-\x7e]*$/.test(plain(r))))) bad.push(`${w}x${h} ${ascii}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 60_000);
  it("renders through Ink as the plain rows", () => {
    const out = renderToString(element(table(110)), { columns: 110 });
    expect(stripVTControlCharacters(out).split("\n").map((l) => l.trimEnd())).toEqual(frame);
  });
});
