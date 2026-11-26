import React from "react";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import stringWidth from "string-width";
import { NEEDS_SCENE, ROSTER, WORK_SCENE, needsSoldiers, warTable } from "./fixture.js";
import { tableRows } from "./tableRows.js";
import { WarTable } from "./WarTable.js";
import { plain, rowWidth } from "./layout.js";
// The design's out/d1.txt without the canvas's right padding and the host's own last three lines.
const WORK_144 = String.raw`
 SHADOW ARMY  war table  run r-0412 · 6 soldiers                                                                  2 working  1 needs you  1 cold
 focus: pane   ! 1 NEEDS YOU   Beru asks: Run this command?   the table is the pane zoomed; esc returns it to its width
 ╭─  ▶ Iron  · build ─────────────────────────╮ ╭─ Igris · build ────────────────────────────╮ ┏━ Beru · build ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 │ ◐ working  2:14              claude-sonnet │ │ ⚠ near handoff  6:02             codex-sol │ ┃ ! waiting on you                      grok ┃
 │ toggle in settings                         │ │ theme tokens                               │ ┃ asks: Run this command?                    ┃
 │ ↳ Edit Page.tsx +18 −2                     │ │ ↳ Bash npm test                            │ ┃ 1-3 answer in the card                     ┃
 │ ▓▓▓▓▓▓░░░░ 112k/200k handoff               │ │ ▓▓▓▓▓▓▓▓▓░ 181k/200k handoff               │ ┃ ▓▓▓░░░░░░░ 64k/200k handoff                ┃
 │                                            │ │            · 70% window                    │ ┃            · 25% window                    ┃
 ╰─────────────────────┬──────────────────────╯ ╰─────────────────────┬──────────────────────╯ ┗━━━━━━━━━━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━━━━━━━┛
                       │                                              │                                              ┃
╔═ MONARCH you + Claude ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║ briefs  4 sent · 1 answered · 1 queued                                                                            2:41 since the first brief ║
║ 2 working  1 needs you                                                                                    $0.41 where the CLIs report a cost ║
║ talk  Igris ◆▸ Iron  "tokens ready: bg.dark, text.dark"  (one line in Claude's transcript, MSG-6)                                            ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
                       □                                              ■                                              ┆
 ╭┄ Tusk · research ┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮ ╭┄ Kaisel · review ┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮ ╭┄ Bellion · orchestra┴e ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮
 ┆ ○ idle                                 agy ┆ ┆ ❄ cold                         claude-opus ┆ ┆ · not started                  codex-astra ┆
 ┆ last: lint scan ✓                          ┆ ┆ review of the toggle                       ┆ ┆ not started                                ┆
 ┆                                            ┆ ┆ ❄ cold · tools changed                     ┆ ┆                                            ┆
 ┆ ▓▓░░░░░░░░ 38k/200k handoff                ┆ ┆ ▓▓▓▓▓▓▓░░░ 142k/200k handoff               ┆ ┆                                            ┆
 ┆                                            ┆ ┆                                            ┆ ┆                                            ┆
 ╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯ ╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯ ╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯
╭─ messages  ■ brief   □ summary   ◆ soldier to soldier   ! asks you ──────────────────────────────────────────────────────────────────────────╮
│ 14:31:02  Monarch ■ Iron     brief "dark-mode toggle…"                                                                           ✓ delivered │
│ 14:31:40  Igris   ◆ Iron     "tokens ready: bg.dark, text.dark"                                                                  → delivered │
│ 14:32:11  Tusk    □ Monarch  summary · lint scan · 0 findings                                                                     ✓ answered │
│ 14:32:30  Beru    ! you      asks: Run this command?                                                                          waiting on you │
│ 14:32:40  Monarch ■ Kaisel   brief "review the toggle" · queued, cold                                                               … queued │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
 army  ◐ Iron ▓▓▓░░ 112k  ⚠ Igris ▓▓▓▓▓ 181k  ! Beru waiting ▓▓░░░ 64k  ○ Tusk ▓░░░░ 38k  ❄ Kaisel ▓▓▓▓░ 142k  · Bellion`.slice(1).split("\n");
const NEEDS_110 = String.raw`
 SHADOW ARMY  war table  run r-0412 · 6 soldiers                                 1 working  2 need you  1 cold
 focus: pane   ! 2 NEED YOU   Beru asks: Run this command? · Igris handoff ready   Tab jumps · 1-3 answer
 ╭─ Iron ──────────────────────────╮ ┏━ Igris ━━━━━━━━━━━━━━━━━━━━━━━━━┓ ┏━  ▶ Beru  ━━━━━━━━━━━━━━━━━━━━━━┓
 │ ◐ working  2:14   claude-sonnet │ ┃ ⇥ handoff ready       codex-sol ┃ ┃ ! waiting on you           grok ┃
 │ build · toggle in settings      │ ┃ build · handoff summary saved   ┃ ┃ build · asks: Run this command? ┃
 │ ↳ Edit Page.tsx +18 −2          │ ┃ a accept  e edit  g go on       ┃ ┃ 1-3 answer in the card          ┃
 │ ▓▓▓▓▓▓░░░░ 112k/200k handoff    │ ┃ ▓▓▓▓▓▓▓▓▓▓ 200k/200k handoff    ┃ ┃ ▓▓▓░░░░░░░ 64k/200k handoff     ┃
 │                                 │ ┃            · 77% window         ┃ ┃            · 25% window         ┃
 ╰────────────────┬────────────────╯ ┗━━━━━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━┛ ┗━━━━━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━┛
                  │                                   ⇥                                   !
╔═ MONARCH you + Claude ═════════════════════════════════════════════════════════════════════════════════════╗
║ briefs  4 sent · 1 answered · 1 queued                                          2:41 since the first brief ║
║ ! waiting on you  Beru, Igris                                           $0.58 where the CLIs report a cost ║
║ talk  Igris ◆▸ Iron  "tokens ready: bg.dark, text.dark"  (one line in Claude's transcript, MSG-6)          ║
╚════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
                  │                                   ┊                                   ┆
 ╭┄ Tusk ┄┄┄┄┄┄┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮ ╭┄ Kaisel ┄┄┄┄┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮ ╭┄ Bellion ┄┄┄┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮
 ┆ ○ idle                      agy ┆ ┆ ❄ cold              claude-opus ┆ ┆ · not started       codex-astra ┆
 ┆ research · last: lint scan ✓    ┆ ┆ review · review of the toggle   ┆ ┆ orchestrate · not started       ┆
 ┆                                 ┆ ┆ ❄ cold · tools changed          ┆ ┆                                 ┆
 ┆ ▓▓░░░░░░░░ 38k/200k handoff     ┆ ┆ ▓▓▓▓▓▓▓░░░ 142k/200k handoff    ┆ ┆                                 ┆
 ┆                                 ┆ ┆                                 ┆ ┆                                 ┆
 ╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯ ╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯ ╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯
┏━ ! Beru grok asks   2 need you  Tab: next → Igris ⇥ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ worktree  shadow/beru-4      asked  14:32:30      waiting  0:15                                            ┃
┃ grok asks:  Run this command?    npm run lint -- --fix                                                     ┃
┃ 1 Allow once      2 Allow for this session      3 Reject      grok own prompt, relayed unchanged           ┃
┃ Beru turn is paused until you answer · 64k / 200k handoff · 25% window · grok has no known cache lifetime  ┃
┃ 1-3 answer with the pane keys (HOST-5) · esc later · the table keeps this card pinned                      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 army  ◐ Iron 112k  ⇥ Igris handoff 181k  ! Beru waiting 64k  ○ Tusk 38k  ❄ Kaisel 142k  · Bellion`.slice(1).split("\n");
const FOLD_72 = String.raw`
 SHADOW ARMY  war table                            1 working  2 need you
 focus: pane   ! 2 NEED YOU   Tab next
 MONARCH briefs 4 sent · 1 answered · 1 queued              2:41 · $0.58
 ├─ Ir ◐ working         ▓▓▓▓▓▓░░░░ 112k  ↳ Edit Page.tsx
 ├─ Ig ⇥ handoff ready   ▓▓▓▓▓▓▓▓▓▓ 200k  a accept  e edit
 ├─ Be ! waiting on you  ▓▓▓░░░░░░░  64k  1-3 answer
 ├─ Tu ○ idle            ▓▓░░░░░░░░  38k
 ├─ Ka ❄ cold            ▓▓▓▓▓▓▓░░░ 142k  cold · tools changed
 └─ Bl · not started     ░░░░░░░░░░

┏━ ! Beru grok asks  1/2 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ grok asks: Run this command?  npm run lint -- --fix                  ┃
┃ 1 Allow once   2 Allow for this session   3 Reject                   ┃
┃ grok own prompt, relayed unchanged                                   ┃
┃ Tab: next → Igris ⇥ handoff ready                                    ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`.slice(1).split("\n");

const work = (w: number, ascii = false) => warTable(w, ascii, ROSTER);
const needs = (w: number, ascii = false) => warTable(w, ascii, needsSoldiers);
const SCENES = [[work, WORK_SCENE], [needs, NEEDS_SCENE]] as const;
const screen = (...args: Parameters<typeof tableRows>) => tableRows(...args).map((r) => plain(r).trimEnd());
describe("War Table screen", () => {
  it("matches the work 144 frame", () => {
    expect(screen(work(144), WORK_SCENE, 31)).toEqual(WORK_144);
  });
  it("matches the needs 110 frame with the decision pinned", () => {
    expect(screen(needs(110), NEEDS_SCENE, 31)).toEqual(NEEDS_110);
  });
  it("folds to the 80x24 frame's tree and pinned card at 72 columns", () => {
    expect(screen(needs(72), NEEDS_SCENE, 24).slice(0, 16)).toEqual(FOLD_72);
  });
  it("folds one column or one row under the board's threshold", () => {
    const folded = (w: number, h: number) => screen(work(w), WORK_SCENE, h).some((l) => l.startsWith(" ├─ "));
    expect([folded(110, 28), folded(109, 28), folded(110, 27)]).toEqual([false, true, true]);
    const seven = { ...work(144), soldiers: [...ROSTER, { ...ROSTER[0], id: "extra" }] };
    expect(screen(seven, WORK_SCENE, 31).filter((l) => /^ [├└]─ /.test(l))).toHaveLength(7);
  });
  it("keeps the whole pinned decision when the screen is short or narrow (VIS-3)", () => {
    const p = NEEDS_SCENE.pinned!;
    for (const [w, h] of [[110, 28], [110, 27], [80, 24], [44, 24], [50, 20]]) {
      const text = screen(needs(w), NEEDS_SCENE, h).join(" ").replace(/┃/g, " ").replace(/\s+/g, " ");
      for (const part of [p.question, ...p.command.split(" "), ...p.options.map((o, i) => `${i + 1} ${o}`)]) {
        expect(text, `${w}x${h} ${part}`).toContain(part);
      }
    }
  });
  it("caps a decision taller than the screen: the answers and the board header stay, the command gives way", () => {
    const paths = Array.from({ length: 20 }, (_, i) => `src/module${i}/index.ts`).join(" ");
    const scene = { ...NEEDS_SCENE, pinned: { ...NEEDS_SCENE.pinned!, command: `npm run lint -- --fix ${paths}` } };
    for (const [w, h] of [[44, 24], [44, 16], [60, 16]]) {
      const lines = screen(needs(w), scene, h);
      const text = lines.join(" ").replace(/┃/g, " ").replace(/\s+/g, " ");
      expect(lines[0], `${w}x${h}`).toContain("SHADOW ARMY");
      for (const o of scene.pinned.options.map((o, i) => `${i + 1} ${o}`)) expect(text, `${w}x${h} ${o}`).toContain(o);
      expect(text).toContain("more command lines");
      expect(lines).toHaveLength(h);
    }
  });
  it("wraps by terminal columns, so wide characters are not clipped by Ink at 44 columns", () => {
    const question = "このコマンドを実行してもよろしいですか？本当にこのまま実行しても大丈夫ですか";
    const scene = { ...NEEDS_SCENE, pinned: { ...NEEDS_SCENE.pinned!, question } };
    const out = stripVTControlCharacters(renderToString(<WarTable view={needs(44)} scene={scene} height={24} />, { columns: 44 }));
    const lines = out.split(String.fromCharCode(10)).map((l) => l.trimEnd());
    const box = lines.filter((l) => l.startsWith("┃"));
    expect(box.length).toBeGreaterThan(3);
    expect(box.every((l) => l.endsWith("┃"))).toBe(true);
    const text = box.join("").replace(/[┃\s]/g, "");
    expect(text).toContain(question);
    expect(text).toContain("npmrunlint----fix");
  });
  it("measures like Ink: a flag emoji keeps every drawer row at 44 columns", () => {
    const question = `Deploy to ${Array.from({ length: 24 }, () => "🇯🇵").join(" ")} now?`;
    const scene = { ...NEEDS_SCENE, pinned: { ...NEEDS_SCENE.pinned!, question } };
    const out = stripVTControlCharacters(renderToString(<WarTable view={needs(44)} scene={scene} height={24} />, { columns: 44 }));
    const lines = out.split(String.fromCharCode(10)).map((l) => l.trimEnd());
    const box = lines.filter((l) => l.startsWith("┃") || l.startsWith("┏") || l.startsWith("┗"));
    expect(box.length).toBeGreaterThan(3);
    expect(box.every((l) => stringWidth(l) === 44 && /[┃┓┛]$/.test(l))).toBe(true);
    expect(box.join("").replace(/[┃\s]/g, "")).toContain("🇯🇵");
  });
  it("keeps every numbered answer when a long question takes the room (VIS-3)", () => {
    const question = Array.from({ length: 877 / 8 | 0 }, (_, i) => `word${i % 10}xx`).join(" ");
    const scene = { ...NEEDS_SCENE, pinned: { ...NEEDS_SCENE.pinned!, question } };
    for (const [w, h] of [[44, 24], [44, 16], [60, 16]]) {
      const lines = screen(needs(w), scene, h);
      const text = lines.join(" ").replace(/┃/g, " ").replace(/\s+/g, " ");
      for (const o of scene.pinned.options.map((o, i) => `${i + 1} ${o}`)) expect(text, `${w}x${h} ${o}`).toContain(o);
      expect(text, `${w}x${h}`).toContain("more question lines");
      expect(lines).toHaveLength(h);
    }
  });
  it("is exactly the asked size at every width and height, and pure ASCII on request", () => {
    const bad: string[] = [];
    for (let w = 44; w <= 160; w++) for (let h = 16; h <= 50; h++) for (const ascii of [false, true]) {
      SCENES.forEach(([view, scene], i) => {
        const rows = tableRows(view(w, ascii), scene, h);
        const fits = rows.length === h && rows.every((r) => rowWidth(r) === w);
        if (!fits || (ascii && !rows.every((r) => /^[\x20-\x7e]*$/.test(plain(r))))) bad.push(`${i} ${w}x${h} ${ascii}`);
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 60_000);
  it("tells needs-you from working with colour off", () => {
    for (const [w, h] of [[144, 31], [72, 24]]) for (const ascii of [false, true]) {
      const iron = (state: "work" | "wait") => {
        const view = work(w, ascii);
        view.soldiers = view.soldiers.map((s) => (s.id === "iron" ? { ...s, state } : s));
        return screen(view, WORK_SCENE, h).join("\n");
      };
      expect(iron("wait")).not.toBe(iron("work"));
      expect(iron("wait").match(/waiting on you/g)!.length).toBeGreaterThan(iron("work").match(/waiting on you/g)!.length);
    }
  });
  it("renders through Ink as the plain rows", () => {
    const out = renderToString(<WarTable view={work(144)} scene={WORK_SCENE} height={31} />, { columns: 144 });
    expect(stripVTControlCharacters(out).split("\n").map((l) => l.trimEnd())).toEqual(WORK_144);
  });
});
