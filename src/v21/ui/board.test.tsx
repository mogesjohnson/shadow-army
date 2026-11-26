import React from "react";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import { BRIEFS, MESSAGES, ROSTER, warTable } from "./fixture.js";
import { messageRows, monarchRows } from "./boardRows.js";
import { Monarch } from "./Monarch.js";
import { Messages } from "./Messages.js";
import { plain, rowWidth, type Row } from "./layout.js";

// The "work 144" frame of the design's out/d1.txt, without the canvas's right padding.
const MONARCH_144 = [
  "╔═ MONARCH you + Claude ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗",
  "║ briefs  4 sent · 1 answered · 1 queued                                                                            2:41 since the first brief ║",
  "║ 2 working  1 needs you                                                                                    $0.41 where the CLIs report a cost ║",
  "║ talk  Igris ◆▸ Iron  \"tokens ready: bg.dark, text.dark\"  (one line in Claude's transcript, MSG-6)                                            ║",
  "╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝",
];
const MESSAGES_144 = [
  "╭─ messages  ■ brief   □ summary   ◆ soldier to soldier   ! asks you ──────────────────────────────────────────────────────────────────────────╮",
  "│ 14:31:02  Monarch ■ Iron     brief \"dark-mode toggle…\"                                                                           ✓ delivered │",
  "│ 14:31:40  Igris   ◆ Iron     \"tokens ready: bg.dark, text.dark\"                                                                  → delivered │",
  "│ 14:32:11  Tusk    □ Monarch  summary · lint scan · 0 findings                                                                     ✓ answered │",
  "│ 14:32:30  Beru    ! you      asks: Run this command?                                                                          waiting on you │",
  "│ 14:32:40  Monarch ■ Kaisel   brief \"review the toggle\" · queued, cold                                                               … queued │",
  "╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯",
];

const six = (width: number, ascii = false) => warTable(width, ascii, ROSTER);
const text = (rows: Row[]) => rows.map(plain);
const monarch = (width: number, briefs = BRIEFS, ascii = false) => text(monarchRows(six(width, ascii), briefs, MESSAGES));
const log = (width: number, height = 7, messages = MESSAGES, ascii = false) =>
  text(messageRows(six(width, ascii), messages, height));
/** Cuts the middle of a 144-column line's padding or rule, which is how the box narrows. */
const narrowed = (line: string, by: number) => {
  const run = [...line.matchAll(/ {2,}|═+|─+/g)].sort((a, b) => b[0].length - a[0].length)[0];
  return line.slice(0, run.index) + line.slice(run.index + by);
};

describe("War Table Monarch panel", () => {
  it("matches the work 144 frame", () => {
    expect(monarch(144)).toEqual(MONARCH_144);
  });

  it("narrows to 110 columns by losing only padding and rule", () => {
    expect(monarch(110)).toEqual(MONARCH_144.map((l) => narrowed(l, 34)));
  });

  it("folds to the 80x24 frame's one line below 110 columns", () => {
    expect(monarch(72, { ...BRIEFS, costUsd: 0.58 })).toEqual([
      " MONARCH briefs 4 sent · 1 answered · 1 queued              2:41 · $0.58",
    ]);
    expect(monarch(109)).toHaveLength(1);
    const tight = monarch(40);
    expect(tight[0]).toHaveLength(40);
    expect(tight[0]).toMatch(/… 2:41 · \$0\.41$/);
  });

  it("shows nothing when no CLI reported a cost", () => {
    for (const width of [144, 72]) {
      for (const costUsd of [undefined, Number.NaN]) {
        const out = monarch(width, { ...BRIEFS, costUsd }).join("\n");
        expect(out).not.toMatch(/\$|cost|NaN/);
        expect(out).toContain("2:41");
      }
    }
    expect(monarch(144, { ...BRIEFS, costUsd: 0 })[2]).toContain("$0.00 where the CLIs report a cost");
  });

  it("names the waiting soldiers in the needs 110 scene, beside the cost", () => {
    const view = six(110);
    view.soldiers = view.soldiers.map((s) => (s.id === "igris" ? { ...s, state: "ready" } : s));
    const out = text(monarchRows(view, { ...BRIEFS, costUsd: 0.58 }, MESSAGES));
    expect(out[2].startsWith("║ ! waiting on you  Beru, Igris ")).toBe(true);
    expect(out[2].endsWith(" $0.58 where the CLIs report a cost ║")).toBe(true);
    expect(out[2]).not.toMatch(/working|need you/);
    expect(out.map((l) => l.length)).toEqual(Array(5).fill(110));
  });

  it("names the waiting soldiers by urgency and drops the talk line without a peer message", () => {
    const view = six(144);
    view.soldiers = view.soldiers.map((s) => (s.id === "igris" ? { ...s, state: "ready" } : s));
    const out = text(monarchRows(view, BRIEFS, []));
    expect(out[2]).toContain("! waiting on you  Beru, Igris");
    expect(out).toHaveLength(4);
  });
});

describe("War Table messages log", () => {
  it("matches the work 144 frame", () => {
    expect(log(144)).toEqual(MESSAGES_144);
  });

  it("narrows to 110 columns by losing only padding and rule", () => {
    expect(log(110)).toEqual(MESSAGES_144.map((l) => narrowed(l, 34)));
  });

  it("keeps the newest rows that fit, newest at the bottom", () => {
    expect(log(144, 4)).toEqual([MESSAGES_144[0], ...MESSAGES_144.slice(4)]);
    expect(log(144, 20)).toEqual(MESSAGES_144);
    expect(log(144, 2)).toEqual([MESSAGES_144[0], MESSAGES_144[6]]);
    expect(log(144, 1)).toEqual([]);
  });

  it("cuts a long message with an ellipsis and keeps the status column", () => {
    const long = MESSAGES.map((m) => ({ ...m, text: "x".repeat(200) }));
    for (const width of [144, 72, 50]) {
      const out = messageRows(six(width), long, 7);
      expect(out.map(rowWidth)).toEqual(Array(7).fill(width));
      const ends = ["✓ delivered", "→ delivered", "✓ answered", "waiting on you", "… queued"];
      text(out).slice(1, 6).forEach((l, i) => expect(l.endsWith(`… ${ends[i]} │`)).toBe(true));
    }
    expect(log(50)[1]).not.toContain("14:31:02");
  });

  it("fits wide characters by terminal cells and keeps the status whole", () => {
    const wide = MESSAGES.map((m) => ({ ...m, text: "你好世界，请确认这个很长的消息并回答我们的问题" }));
    const rows = messageRows(six(50), wide, 7);
    expect(rows.map(rowWidth)).toEqual(Array(7).fill(50));
    const ends = ["✓ delivered", "→ delivered", "✓ answered", "waiting on you", "… queued"];
    text(rows).slice(1, 6).forEach((l, i) => expect(l.endsWith(`${ends[i]} │`)).toBe(true));
    const ink = stripVTControlCharacters(renderToString(<Messages view={six(50)} messages={wide} height={7} />, { columns: 50 })).split("\n");
    expect(ink).toEqual(text(rows));
    const talk = monarchRows(six(110), BRIEFS, wide).map(rowWidth);
    expect(talk).toEqual(Array(5).fill(110));
  });

  it("shows control and bidirectional characters as placeholders", () => {
    const bad = [{ ...MESSAGES[1], text: "a\u001b[2J‮b\nc" }];
    for (const out of [log(144, 7, bad).join(""), text(monarchRows(six(144), BRIEFS, bad)).join("")]) {
      expect(out).toContain("a<U+001B>[2J<U+202E>b<U+000A>c");
      expect(out).not.toMatch(/[\u001b‮\n]/);
    }
  });
});

describe("ASCII fallback and Ink", () => {
  it("uses ASCII only, with a different glyph for each message kind", () => {
    const out = [...monarch(144, BRIEFS, true), ...monarch(72, BRIEFS, true), ...log(144, 7, MESSAGES, true)];
    expect(out.join("")).toMatch(/^[\x20-\x7e]+$/);
    const rows = log(144, 7, MESSAGES, true);
    expect(rows[0]).toContain("# brief   = summary   * soldier to soldier   ! asks you");
    expect(rows.slice(1, 5).map((l) => l[20])).toEqual(["#", "*", "=", "!"]);
  });

  it("renders both parts through Ink as the plain rows", () => {
    const ink = (el: React.ReactElement) =>
      stripVTControlCharacters(renderToString(el, { columns: 144 })).split("\n");
    expect(ink(<Monarch view={six(144)} briefs={BRIEFS} messages={MESSAGES} />)).toEqual(MONARCH_144);
    expect(ink(<Messages view={six(144)} messages={MESSAGES} height={7} />)).toEqual(MESSAGES_144);
  });
});
