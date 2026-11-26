import React from "react";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import { ROSTER, warTable } from "./fixture.js";
import stringWidth from "string-width";
import { headerRows, plain, rowWidth, stripRow } from "./layout.js";
import { safeText } from "./model.js";
import { PaneHeader } from "./PaneHeader.js";
import { Strip } from "./Strip.js";

// Ink's own renderToString (ink-testing-library is not in the lockfile).
const ink = (node: React.ReactElement, columns: number): string[] =>
  stripVTControlCharacters(renderToString(node, { columns })).split("\n").map((l) => l.trimEnd());
const strip = (w: number, ascii = false, soldiers = ROSTER) => ink(<Strip view={warTable(w, ascii, soldiers)} />, w);
const header = (id: string, w: number, ascii = false) =>
  ink(<PaneHeader soldier={ROSTER.find((s) => s.id === id)!} width={w} ascii={ascii} />, w);

describe("v2.1 strip (HOST-6)", () => {
  it("matches the canvas's 110-column army row (d5.txt, tokens step)", () => {
    expect(strip(110)).toEqual([" army  ◐ Iron 112k  ⚠ Igris 181k  ! Beru waiting 64k  ○ Tusk 38k  ❄ Kaisel 142k  · Bellion"]);
  });

  it("matches the canvas's 80x24 army row (d5.txt, names step)", () => {
    expect(strip(80)).toEqual([" army  ◐ Iron  ⚠ Igris  ! Beru waiting  ○ Tusk  ❄ Kaisel  · Bellion"]);
  });

  it("shows meters at 144 and 110 for the three-soldier scene, and every row is exactly w cells", () => {
    for (const w of [144, 110]) {
      expect(strip(w, false, ROSTER.slice(0, 3))).toEqual([" army  ◐ Iron ▓▓▓░░ 112k  ⚠ Igris ▓▓▓▓▓ 181k  ! Beru waiting ▓▓░░░ 64k"]);
    }
    for (const w of [144, 110, 80, 44]) expect(Array.from(plain(stripRow(warTable(w, false, ROSTER)))).length).toBe(w);
  });

  it("steps down to tags, then folds soldiers that need nothing as +N more (44 columns)", () => {
    expect(strip(44)).toEqual([" army  ◐ Ir  ⚠ Ig  ! Be waiting  +3 more"]);
    expect(strip(44)[0]).not.toMatch(/working|idle|cold/);
  });

  it("keeps a late soldier who needs the owner, and counts overflow under /decisions", () => {
    const late = ROSTER.map((s) => (s.id === "bellion" ? { ...s, state: "wait" as const } : s));
    expect(strip(44, false, late)).toEqual([" army  ! Be waiting  ! Bl waiting  +4 more"]);
    const rows = strip(30, false, late);
    expect(rows[0]).toContain("/decisions");
    expect(rows[0]).toMatch(/\+\d+ · \/decisions/);
    expect(Array.from(rows[0]).length).toBeLessThanOrEqual(30);
  });

  it("keeps the right-hand segment when the strip folds", () => {
    const right = [{ text: "$1.2" }];
    for (const w of [44, 30]) {
      const row = plain(stripRow(warTable(w, false, ROSTER), right));
      expect(stringWidth(row)).toBe(w);
      expect(row.endsWith("$1.2")).toBe(true);
    }
  });

  it("tells soldiers apart with no colour: ASCII tags are distinct and every glyph is ASCII", () => {
    const [row] = strip(60, true);
    expect(row).toBe(" army  * Ir  ! Ig  ! Be waiting  o Tu  * Ka  . Bl");
    expect(row).toMatch(/^[\x20-\x7e]*$/);
    const tags = ROSTER.map((s) => s.tag);
    expect(new Set(tags).size).toBe(tags.length);
    for (const t of tags) expect(row).toContain(` ${t}`);
  });
});

describe("v2.1 pane header (HOST-4)", () => {
  it("is one line from 50 columns: name · id · model · queue, state on the right", () => {
    for (const w of [144, 110, 80]) {
      const rows = header("igris", w);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatch(/^ Igris · igris · gpt-6\.1-sol · 2 queued +⚠ near handoff$/);
    }
    expect(header("igris", 50)).toEqual([" Igris · igris · gpt-6… · 2 queued ⚠ near handoff"]);
    expect(header("tusk", 80)[0]).toMatch(/^ Tusk · tusk · gemini-3\.1-pro-high +○ idle$/);
  });

  it("keeps id, model and queue count across two lines at 44 columns", () => {
    expect(header("tusk", 44)).toEqual([" Tusk                                ○ idle", " tusk · gemini-3.1-pro-high"]);
    expect(header("igris", 44, true)).toEqual([" Igris                       ! near handoff", " igris . gpt-6.1-sol . 2 queued"]);
  });

  it("cuts a long model with an ellipsis below 50 columns, never the name or the queue count", () => {
    expect(header("tusk", 24)[1]).toBe(" tusk · gemini-3.1-pro…");
    expect(header("beru", 30)[1]).toMatch(/^ beru · grok-4\.7 · 1 queued$/);
    expect(header("igris", 28)[1]).toMatch(/… · 2 queued$/);
  });
});

describe("v2.1 terminal cells", () => {
  it("measures a 50-column header with CJK name and model by cells and keeps the state visible", () => {
    const wide = { ...ROSTER[1], name: "イグリス", id: "igris-ホスト-name-xxxxx", model: "モデル" };
    for (const ascii of [false, true]) {
      const [row] = headerRows(wide, 50, ascii);
      expect(rowWidth(row)).toBe(50);
      expect(stringWidth(plain(row))).toBe(50);
      expect(plain(row)).toMatch(ascii ? /near handoff $/ : /⚠ near handoff $/);
    }
  });

  it("clips on grapheme boundaries and keeps every two-line row at exactly w cells", () => {
    const wide = { ...ROSTER[3], model: "模型模型模型模型模型" };
    for (const row of headerRows(wide, 24)) expect(stringWidth(plain(row))).toBe(24);
    expect(headerRows(wide, 24)[1]).toBeDefined();
  });
});

describe("v2.1 untrusted text", () => {
  it("shows a bidirectional control in a model or a task as a placeholder, never the control", () => {
    const evil = { ...ROSTER[0], name: "Ir‮on", model: "son⁦net" };
    const out = [...headerRows(evil, 80).map(plain), plain(stripRow(warTable(110, false, [evil])))].join("\n");
    expect(out).toContain("son<U+2066>net");
    expect(out).toContain("Ir<U+202E>on");
    expect(out).not.toMatch(/[‪-‮⁦-⁩]/);
    expect(safeText("lint‏ scan\u001b[2J")).toBe("lint<U+200F> scan<U+001B>[2J");
  });
});
