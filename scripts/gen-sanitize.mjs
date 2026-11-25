// Writes the Cc and Cf table into src/v2/sanitize.ts (SEC-6), from Node's own Unicode data.
// Downloads nothing. `node scripts/gen-sanitize.mjs` rewrites the table; `--check` fails if it is out of date.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BEGIN = "// BEGIN GENERATED";
export const END = "// END GENERATED";
// The Unicode version the committed table is generated from. Only a Node with this version writes or
// checks the table; to move to a newer Unicode, change this and rerun the generator on that Node.
export const PINNED_UNICODE = "17.0";
const TARGET = fileURLToPath(new URL("../src/v2/sanitize.ts", import.meta.url));
const MAX_CODE_POINT = 0x10ffff;
const CONTROL_OR_FORMAT = /^[\p{Cc}\p{Cf}]$/u;
// Code points SEC-6 and M1-AC12 name; a Node whose data lacks one is not safe to generate from.
const MUST_HAVE = [0x00, 0x1b, 0x7f, 0x9b, 0xad, 0x200b, 0x202e, 0xfeff, 0xe0001, 0xe0020, 0xe007f];

/** Every Cc and Cf code point as inclusive [first, last] ranges, from this Node's Unicode data. */
export function ranges() {
  const found = [];
  let first = -1;
  for (let codePoint = 0; codePoint <= MAX_CODE_POINT + 1; codePoint++) {
    const hit = codePoint <= MAX_CODE_POINT && CONTROL_OR_FORMAT.test(String.fromCodePoint(codePoint));
    if (hit && first < 0) first = codePoint;
    if (!hit && first >= 0) {
      found.push([first, codePoint - 1]);
      first = -1;
    }
  }
  for (const codePoint of MUST_HAVE) {
    if (!found.some(([from, to]) => codePoint >= from && codePoint <= to)) {
      throw new Error(`U+${codePoint.toString(16).toUpperCase()} is missing from this Node's Cc and Cf sets`);
    }
  }
  return found;
}

/** The generated block, markers included, with LF line ends. */
export function block() {
  const hex = (n) => `0x${n.toString(16)}`;
  return [
    BEGIN,
    `// Unicode ${process.versions.unicode} (Node's process.versions.unicode). Control (Cc) and format (Cf) code points, inclusive ranges.`,
    `export const UNICODE_VERSION = ${JSON.stringify(process.versions.unicode)};`,
    "export const CC_CF_RANGES: readonly (readonly [number, number])[] = [",
    ...ranges().map(([from, to]) => `  [${hex(from)}, ${hex(to)}],`),
    "];",
    END,
  ].join("\n");
}

/** The text of `source` with its generated block replaced by `fresh`, keeping the file's own line ends. */
export function replaceBlock(source, fresh) {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const start = source.indexOf(BEGIN);
  const end = source.indexOf(END);
  if (start < 0 || end < start) throw new Error(`${BEGIN} and ${END} markers not found`);
  return source.slice(0, start) + fresh.replaceAll("\n", eol) + source.slice(end + END.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.versions.unicode !== PINNED_UNICODE) {
    console.error(
      `This Node has Unicode ${process.versions.unicode}; the table is pinned to ${PINNED_UNICODE}. ` +
        "Run the generator on a Node with that version, or change PINNED_UNICODE on purpose.",
    );
    process.exit(2);
  }
  const current = readFileSync(TARGET, "utf8");
  const next = replaceBlock(current, block());
  if (process.argv.includes("--check")) {
    if (next !== current) {
      console.error("src/v2/sanitize.ts is out of date: run node scripts/gen-sanitize.mjs");
      process.exit(1);
    }
    console.log(`sanitize table is current (Unicode ${process.versions.unicode})`);
  } else {
    if (next !== current) writeFileSync(TARGET, next);
    console.log(`wrote the Cc and Cf table for Unicode ${process.versions.unicode}`);
  }
}
