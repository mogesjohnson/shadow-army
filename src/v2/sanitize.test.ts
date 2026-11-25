import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error the generator is a plain .mjs script with no type declarations
import { BEGIN, block, END, PINNED_UNICODE } from "../../scripts/gen-sanitize.mjs";
import { CC_CF_RANGES, placeholder, sanitize, UNICODE_VERSION } from "./sanitize.js";

const MAX_CODE_POINT = 0x10ffff;
const CONTROL_OR_FORMAT = /^[\p{Cc}\p{Cf}]$/u;
const KEPT = new Set([0x09, 0x0a]);
const isSurrogate = (codePoint: number): boolean => codePoint >= 0xd800 && codePoint <= 0xdfff;

function* codePoints(): Generator<number> {
  for (let codePoint = 0; codePoint <= MAX_CODE_POINT; codePoint++) {
    if (!isSurrogate(codePoint)) yield codePoint;
  }
}

// The exact checks against Node's own Unicode data run only on the runtime the table was generated
// from. A supported Node with older or newer data still tests the committed table below.
const onPinnedRuntime = process.versions.unicode === UNICODE_VERSION;
const whenPinned = it.skipIf(!onPinnedRuntime);

describe("the generated table", () => {
  it("is generated for the Unicode version the generator pins", () => {
    expect(UNICODE_VERSION).toBe(PINNED_UNICODE);
  });

  whenPinned("matches a fresh generation from this Node's Unicode data", () => {
    const source = readFileSync(new URL("./sanitize.ts", import.meta.url), "utf8").replaceAll("\r\n", "\n");
    const committed = source.slice(source.indexOf(BEGIN), source.indexOf(END) + END.length);
    expect(committed).toBe(block());
  });

  it("lists sorted, separate, non-adjacent ranges", () => {
    CC_CF_RANGES.forEach(([first, last], index) => {
      expect(first).toBeLessThanOrEqual(last);
      if (index > 0) expect(first).toBeGreaterThan(CC_CF_RANGES[index - 1][1] + 1);
    });
  });

  it("shows each end of every range and keeps the code point beside it, on any Node", () => {
    for (const [first, last] of CC_CF_RANGES) {
      for (const codePoint of [first, last]) {
        const shown = KEPT.has(codePoint) ? String.fromCodePoint(codePoint) : placeholder(codePoint);
        expect(sanitize(String.fromCodePoint(codePoint))).toBe(shown);
      }
      for (const codePoint of [first - 1, last + 1]) {
        if (codePoint < 0 || codePoint > MAX_CODE_POINT || isSurrogate(codePoint)) continue;
        expect(sanitize(String.fromCodePoint(codePoint))).toBe(String.fromCodePoint(codePoint));
      }
    }
  });

  it("holds the whole of the control (Cc) set, which Unicode never changes", () => {
    const shown = (codePoint: number): boolean => CC_CF_RANGES.some(([first, last]) => codePoint >= first && codePoint <= last);
    for (let codePoint = 0; codePoint <= 0x9f; codePoint++) {
      expect(shown(codePoint)).toBe(codePoint <= 0x1f || codePoint >= 0x7f);
    }
  });
});

describe("sanitize (SEC-6, M1-AC12)", () => {
  whenPinned("shows every Cc and Cf code point but newline and tab as a placeholder", () => {
    let shown = 0;
    for (const codePoint of codePoints()) {
      const character = String.fromCodePoint(codePoint);
      if (!CONTROL_OR_FORMAT.test(character)) continue;
      if (KEPT.has(codePoint)) {
        expect(sanitize(character)).toBe(character);
      } else {
        expect(sanitize(character)).toBe(`\\u{${codePoint.toString(16)}}`);
        shown++;
      }
    }
    // 65 Cc (0-1f, 7f-9f) less two kept, plus every Cf of Unicode 17; a lower count means the set was not read.
    expect(shown).toBeGreaterThan(150);
  });

  whenPinned("keeps every other code point", () => {
    const kept: string[] = [];
    for (const codePoint of codePoints()) {
      const character = String.fromCodePoint(codePoint);
      if (!CONTROL_OR_FORMAT.test(character)) kept.push(character);
    }
    const text = kept.join("");
    expect(sanitize(text)).toBe(text);
  });

  it("names the cases the spec lists", () => {
    expect(sanitize("\u001b[31mred\u001b[0m")).toBe("\\u{1b}[31mred\\u{1b}[0m");
    expect(sanitize("\u009b")).toBe("\\u{9b}");
    expect(sanitize("a­b")).toBe("a\\u{ad}b");
    expect(sanitize("﻿x")).toBe("\\u{feff}x");
    expect(sanitize("a‮b")).toBe("a\\u{202e}b");
    expect(sanitize("a​b‍c")).toBe("a\\u{200b}b\\u{200d}c");
    expect(sanitize(String.fromCodePoint(0xe0001))).toBe("\\u{e0001}");
    for (let tag = 0xe0020; tag <= 0xe007f; tag++) {
      expect(sanitize(String.fromCodePoint(tag))).toBe(`\\u{${tag.toString(16)}}`);
    }
    expect(sanitize("\0")).toBe("\\u{0}");
    expect(sanitize("\u007f")).toBe("\\u{7f}");
  });

  it("keeps newline, tab and every ordinary character, including astral ones and a lone surrogate", () => {
    const text = "line one\n\tline two\r\nemoji 😀 café 日本語 \ud800  ";
    // carriage return is Cc: it is the one other character in that text that changes
    expect(sanitize(text)).toBe("line one\n\tline two\\u{d}\nemoji 😀 café 日本語 \ud800  ");
  });

  it("leaves a placeholder-looking text as it is, and is not applied twice by accident", () => {
    expect(sanitize("\\u{1b}")).toBe("\\u{1b}");
    expect(sanitize("")).toBe("");
    expect(sanitize(sanitize("\u001b"))).toBe("\\u{1b}");
  });

  it("finds only placeholders in a line holding each kind (the SEC-6 test)", () => {
    const kinds = ["\u001b", "\u009b", "­", "​", "‮", "⁦", "﻿", String.fromCodePoint(0xe0041)];
    const drawn = sanitize(`x${kinds.join("y")}z`);
    expect(drawn).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(drawn.match(/\\u\{[0-9a-f]+\}/g)).toHaveLength(kinds.length);
  });

  it("builds a placeholder in lowercase hex without padding", () => {
    expect(placeholder(0x1b)).toBe("\\u{1b}");
    expect(placeholder(0x202e)).toBe("\\u{202e}");
    expect(placeholder(0xe007f)).toBe("\\u{e007f}");
  });
});
