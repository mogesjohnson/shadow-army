// SEC-6 (M1b-9): text the mod draws, or sends to Claude, shows each Unicode control (Cc) and format (Cf)
// character as a visible placeholder, except newline and tab. Every other character is kept.
//
// The table between the markers is written by `node scripts/gen-sanitize.mjs`, never by hand.
// sanitize.test.ts compares it with a fresh generation, so a Node with newer Unicode data shows up as a diff.

// BEGIN GENERATED
// Unicode 17.0 (Node's process.versions.unicode). Control (Cc) and format (Cf) code points, inclusive ranges.
export const UNICODE_VERSION = "17.0";
export const CC_CF_RANGES: readonly (readonly [number, number])[] = [
  [0x0, 0x1f],
  [0x7f, 0x9f],
  [0xad, 0xad],
  [0x600, 0x605],
  [0x61c, 0x61c],
  [0x6dd, 0x6dd],
  [0x70f, 0x70f],
  [0x890, 0x891],
  [0x8e2, 0x8e2],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfeff, 0xfeff],
  [0xfff9, 0xfffb],
  [0x110bd, 0x110bd],
  [0x110cd, 0x110cd],
  [0x13430, 0x1343f],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
  [0xe0001, 0xe0001],
  [0xe0020, 0xe007f],
];
// END GENERATED

/** The two Cc characters SEC-6 keeps, so that multi-line text and tab-aligned text stay readable. */
const KEPT = [0x09, 0x0a] as const;

/** The placeholder for a code point: `\u{1b}` for ESC, `\u{202e}` for the right-to-left override. */
export function placeholder(codePoint: number): string {
  return `\\u{${codePoint.toString(16)}}`;
}

function characterClass(): string {
  const parts: string[] = [];
  for (const [first, last] of CC_CF_RANGES) {
    let from = first;
    for (const kept of KEPT) {
      if (kept < from || kept > last) continue;
      if (kept > from) parts.push(`\\u{${from.toString(16)}}-\\u{${(kept - 1).toString(16)}}`);
      from = kept + 1;
    }
    if (from <= last) parts.push(`\\u{${from.toString(16)}}-\\u{${last.toString(16)}}`);
  }
  return `[${parts.join("")}]`;
}

const CONTROL_OR_FORMAT = new RegExp(characterClass(), "gu");

/** Replaces each Cc and Cf character except newline and tab with its placeholder. Nothing else changes. */
export function sanitize(text: string): string {
  return text.replace(CONTROL_OR_FORMAT, (character) => placeholder(character.codePointAt(0) as number));
}
