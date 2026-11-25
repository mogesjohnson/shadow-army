import React from "react";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import { ROSTER, warTable } from "./fixture.js";
import { headerRows, plain, stripRow } from "./layout.js";
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

  it("steps down to tags at 44 columns, and only needs-you states carry a word", () => {
    expect(strip(44)).toEqual([" army  ◐ Ir  ⚠ Ig  ! Be waiting  ○ Tu  ❄ Ka…"]);
    expect(strip(44)[0]).not.toMatch(/working|idle|cold/);
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
  it("is one line from 50 columns: name · host · model, state on the right", () => {
    for (const w of [144, 110, 80, 50]) {
      const rows = header("igris", w);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatch(/^ Igris · codex-sol · gpt-6\.1-sol +⚠ near handoff$/);
    }
  });

  it("keeps name, host and model across two lines at 44 columns", () => {
    expect(header("tusk", 44)).toEqual([" Tusk                                ○ idle", " agy · gemini-3.1-pro-high"]);
    expect(header("igris", 44, true)).toEqual([" Igris                       ! near handoff", " codex-sol . gpt-6.1-sol"]);
  });

  it("cuts a long model with an ellipsis below 50 columns, never the name", () => {
    expect(header("tusk", 24)[1]).toBe(" agy · gemini-3.1-pro-…");
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
