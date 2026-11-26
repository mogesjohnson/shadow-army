import React from "react";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import stringWidth from "string-width";
import { ROSTER } from "./fixture.js";
import { cardEdge, cardRows, type CardInfo, type CardOpts } from "./cardRows.js";
import { Card } from "./Card.js";
import { plain } from "./layout.js";
import { needs, STATES, type Soldier, type SoldierState } from "./model.js";

// The War Table frames' cards, cut by column from the design's out/d1.txt (frames "work 144" and "needs 110").
const WORK_144: Record<string, string[]> = {
  iron: [
    "╭─  ▶ Iron  · build ─────────────────────────╮",
    "│ ◐ working  2:14              claude-sonnet │",
    "│ toggle in settings                         │",
    "│ ↳ Edit Page.tsx +18 −2                     │",
    "│ ▓▓▓▓▓▓░░░░ 112k/200k handoff               │",
    "│                                            │",
    "╰─────────────────────┬──────────────────────╯",
  ],
  igris: [
    "╭─ Igris · build ────────────────────────────╮",
    "│ ⚠ near handoff  6:02             codex-sol │",
    "│ theme tokens                               │",
    "│ ↳ Bash npm test                            │",
    "│ ▓▓▓▓▓▓▓▓▓░ 181k/200k handoff               │",
    "│            · 70% window                    │",
    "╰─────────────────────┬──────────────────────╯",
  ],
  beru: [
    "┏━ Beru · build ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓",
    "┃ ! waiting on you                      grok ┃",
    "┃ asks: Run this command?                    ┃",
    "┃ 1-3 answer in the card                     ┃",
    "┃ ▓▓▓░░░░░░░ 64k/200k handoff                ┃",
    "┃            · 25% window                    ┃",
    "┗━━━━━━━━━━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━━━━━━━┛",
  ],
  tusk: [
    "╭┄ Tusk · research ┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮",
    "┆ ○ idle                                 agy ┆",
    "┆ last: lint scan ✓                          ┆",
    "┆                                            ┆",
    "┆ ▓▓░░░░░░░░ 38k/200k handoff                ┆",
    "┆                                            ┆",
    "╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯",
  ],
  kaisel: [
    "╭┄ Kaisel · review ┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮",
    "┆ ❄ cold                         claude-opus ┆",
    "┆ review of the toggle                       ┆",
    "┆ ❄ cold · tools changed                     ┆",
    "┆ ▓▓▓▓▓▓▓░░░ 142k/200k handoff               ┆",
    "┆                                            ┆",
    "╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯",
  ],
  bellion: [
    "╭┄ Bellion · orchestra┴e ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮",
    "┆ · not started                  codex-astra ┆",
    "┆ not started                                ┆",
    "┆                                            ┆",
    "┆                                            ┆",
    "┆                                            ┆",
    "╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯",
  ],
};
const NEEDS_110: Record<string, string[]> = {
  iron: [
    "╭─ Iron ──────────────────────────╮",
    "│ ◐ working  2:14   claude-sonnet │",
    "│ build · toggle in settings      │",
    "│ ↳ Edit Page.tsx +18 −2          │",
    "│ ▓▓▓▓▓▓░░░░ 112k/200k handoff    │",
    "│                                 │",
    "╰────────────────┬────────────────╯",
  ],
  igris: [
    "┏━ Igris ━━━━━━━━━━━━━━━━━━━━━━━━━┓",
    "┃ ⇥ handoff ready       codex-sol ┃",
    "┃ build · handoff summary saved   ┃",
    "┃ a accept  e edit  g go on       ┃",
    "┃ ▓▓▓▓▓▓▓▓▓▓ 200k/200k handoff    ┃",
    "┃            · 77% window         ┃",
    "┗━━━━━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━┛",
  ],
  beru: [
    "┏━  ▶ Beru  ━━━━━━━━━━━━━━━━━━━━━━┓",
    "┃ ! waiting on you           grok ┃",
    "┃ build · asks: Run this command? ┃",
    "┃ 1-3 answer in the card          ┃",
    "┃ ▓▓▓░░░░░░░ 64k/200k handoff     ┃",
    "┃            · 25% window         ┃",
    "┗━━━━━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━┛",
  ],
  tusk: [
    "╭┄ Tusk ┄┄┄┄┄┄┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮",
    "┆ ○ idle                      agy ┆",
    "┆ research · last: lint scan ✓    ┆",
    "┆                                 ┆",
    "┆ ▓▓░░░░░░░░ 38k/200k handoff     ┆",
    "┆                                 ┆",
    "╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯",
  ],
  kaisel: [
    "╭┄ Kaisel ┄┄┄┄┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮",
    "┆ ❄ cold              claude-opus ┆",
    "┆ review · review of the toggle   ┆",
    "┆ ❄ cold · tools changed          ┆",
    "┆ ▓▓▓▓▓▓▓░░░ 142k/200k handoff    ┆",
    "┆                                 ┆",
    "╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯",
  ],
  bellion: [
    "╭┄ Bellion ┄┄┄┄┄┄┴┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮",
    "┆ · not started       codex-astra ┆",
    "┆ orchestrate · not started       ┆",
    "┆                                 ┆",
    "┆                                 ┆",
    "┆                                 ┆",
    "╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯",
  ],
};

const hint = (text: string): CardInfo["note"] => ({ text, tone: "wn", bold: true });
// What the frames show on a card beyond the roster: role, elapsed time, the card's task wording and third line.
const WORK: Record<string, CardInfo> = {
  iron: { role: "build", elapsed: "2:14", tool: "Edit Page.tsx +18 −2" },
  igris: { role: "build", elapsed: "6:02", tool: "Bash npm test", windowPct: 70 },
  beru: { role: "build", task: "asks: Run this command?", note: hint("1-3 answer in the card"), windowPct: 25 },
  tusk: { role: "research", task: "last: lint scan ✓" },
  kaisel: { role: "review", task: "review of the toggle", note: { text: "❄ cold · tools changed", tone: "in" } },
  bellion: { role: "orchestrate" },
};
const READY: CardInfo = { role: "build", task: "handoff summary saved", note: hint("a accept  e edit  g go on"), windowPct: 77 };

const who = (id: string, over: Partial<Soldier> = {}): Soldier => ({ ...ROSTER.find((s) => s.id === id)!, ...over });
const ink = (s: Soldier, info: CardInfo, opts: CardOpts): string[] =>
  stripVTControlCharacters(renderToString(<Card soldier={s} info={info} {...opts} />, { columns: opts.width })).split("\n");
const text = (s: Soldier, info: CardInfo, opts: CardOpts): string[] => cardRows(s, info, opts).map(plain);
const cells = (line: string): number => stringWidth(line);
const notch = (i: number): CardOpts["notch"] => (i < 3 ? "bottom" : "top");

describe("v2.1 War Table cards", () => {
  it("matches each card of the 'work 144' frame line for line at 46 columns", () => {
    ROSTER.forEach((s, i) => {
      expect(ink(s, WORK[s.id], { width: 46, focus: s.id === "iron", notch: notch(i) }), s.id).toEqual(WORK_144[s.id]);
    });
  });

  it("matches the 'needs 110' cards at 35 columns: no role in the title, the role leads the task", () => {
    ROSTER.forEach((r, i) => {
      const ready = r.id === "igris";
      const s = ready ? who("igris", { state: "ready", tokensK: 200 }) : r;
      const info = ready ? READY : WORK[r.id];
      expect(ink(s, info, { width: 35, focus: r.id === "beru", notch: notch(i) }), r.id).toEqual(NEEDS_110[r.id]);
    });
  });

  it("narrows to three across 80 columns (the 80x24 frame draws no cards): every row stays 25 cells", () => {
    for (const s of ROSTER) {
      const rows = ink(s, WORK[s.id], { width: 25, notch: "bottom" });
      // A waiting card grows to keep its question and keys whole; the others stay seven rows.
      expect(rows).toHaveLength(s.id === "beru" ? 9 : 7);
      for (const row of rows) expect(cells(row), row).toBe(25);
    }
    expect(text(who("beru"), WORK.beru, { width: 25 }).slice(1, 5))
      .toEqual(["┃ ! waiting on you grok ┃", "┃ build · asks: Run     ┃", "┃ this command?         ┃", "┃ 1-3 answer in the     ┃"]);
  });

  it("tells a needs-you card from a working one with colour off", () => {
    for (const ascii of [false, true]) {
      const edges = (["work", "wait", "idle"] as const).map((state) => {
        const rows = text(who("iron", { state }), { role: "build" }, { width: 30, ascii });
        return rows[0][0] + rows[1][0] + rows[6].slice(1, 4);
      });
      expect(edges).toEqual(ascii ? ["+|---", "+|===", "+:..."] : ["╭│───", "┏┃━━━", "╭┆┄┄┄"]);
    }
    for (const state of Object.keys(STATES) as SoldierState[]) expect(cardEdge(state) === "heavy", state).toBe(needs(state));
    expect((["work", "near", "prep", "idle", "cold", "start", "off"] as const).map(cardEdge))
      .toEqual(["round", "round", "round", "dashed", "dashed", "dashed", "dashed"]);
  });

  it("cuts a long name, host, task or tool with … and never overflows", () => {
    const long = "x".repeat(90);
    const s = who("iron", { name: `Iron${long}`, host: `claude-${long}`, task: long });
    for (const width of [46, 35, 25, 12]) {
      for (const focus of [false, true]) {
        const rows = text(s, { role: "build", elapsed: "2:14", tool: long }, { width, focus, notch: "top" });
        for (const row of rows) expect(cells(row), row).toBe(width);
        for (const i of [0, 2, 3]) expect(rows[i], rows[i]).toContain("…");
      }
    }
    expect(text(who("iron", { host: `claude-${long}` }), WORK.iron, { width: 35 })[1]).toBe("│ ◐ working  2:14 claude-xxxxxxx… │");
  });

  it("is all ASCII in the fallback, and shows a control from a soldier as a placeholder", () => {
    ROSTER.forEach((s, i) => {
      const rows = ink(s, WORK[s.id], { width: 46, focus: true, notch: notch(i), ascii: true });
      for (const row of rows) expect(row).toMatch(/^[\x20-\x7e]{46}$/);
    });
    expect(text(who("iron"), WORK.iron, { width: 46, ascii: true })[3]).toBe("| > Edit Page.tsx +18 -2                     |");
    const evil = text(who("iron", { name: "Ir\u202eon", host: "a\u001bb" }), { role: "r\u2066", elapsed: "\r", task: "t\n", note: { text: "n\u200f" } }, { width: 60 }).join("");
    for (const code of ["202E", "001B", "2066", "000D", "000A", "200F"]) expect(evil).toContain(`<U+${code}>`);
    expect(text(who("iron"), { role: "build", tool: "go\u202e" }, { width: 60 })[3]).toContain("go<U+202E>");
  });

  it("fits every row to the terminal cells with CJK and combining marks, borders intact", () => {
    const marks = "é".repeat(20);
    for (const name of ["鉄の兵士鉄の兵士", `Ir${marks}`]) {
      const s = who("iron", { name, host: "クロード", task: "設定を切り替える設定を切り替える設定を切り替える" });
      for (const width of [35, 25]) {
        for (const notch of ["top", "bottom"] as const) {
          const rows = text(s, { role: "ビルド", tool: "編集 ページ" }, { width, focus: true, notch });
          for (const row of rows) expect(cells(row), row).toBe(width);
          for (const row of rows.slice(1, 6)) expect(row[0] + row.slice(-1), row).toBe("││");
          expect(rows[0][0] + rows[0].slice(-1)).toBe("╭╮");
        }
      }
    }
  });

  it("keeps a waiting card's whole question and its keys in view at 35 columns", () => {
    const q = "Run the tests before publishing, or skip them for now?";
    const rows = text(who("beru"), { role: "build", task: `asks: ${q}`, note: hint("1 run  2 skip  3 ask me later") }, { width: 35 });
    for (const row of rows) expect(cells(row), row).toBe(35);
    const body = rows.slice(1, -1).map((r) => r.slice(2, -2).trim());
    expect(body.join(" ")).toContain(`build · asks: ${q}`);
    expect(body.join(" ")).toContain("1 run  2 skip  3 ask me later");
    expect(rows.length).toBeGreaterThan(7);
  });
});
