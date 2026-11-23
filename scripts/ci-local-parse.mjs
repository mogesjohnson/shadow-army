// Parsing of vitest's summary lines for scripts/ci-local.mjs. No dependencies.
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const strip = (text) => text.replace(ANSI, "");

/** Read vitest's own summary lines. Returns null when there is no `Tests` line. */
export function parseVitest(output) {
  const text = strip(output);
  const grab = (label) => {
    const m = text.match(new RegExp(`^\\s*${label}\\s+(.+)$`, "m"));
    return m ? m[1].trim() : null;
  };
  const tests = grab("Tests");
  if (!tests) return null;
  const files = grab("Test Files");
  const all = [...text.matchAll(/^\s*(?:FAIL|×|✗)\s+(.+)$/gm)].map((m) => m[1].replace(/\s+\d+ms$/, "").trim());
  const failed = [...new Set(all.some((n) => n.includes(" > ")) ? all.filter((n) => n.includes(" > ")) : all)];
  const failedCount = Number(tests.match(/(\d+) failed/)?.[1] ?? 0);
  return { files, tests, failed, ok: failedCount === 0 && /\d+ passed/.test(tests) };
}

/** Read the text-summary coverage lines and the threshold verdict. Null when no coverage table. */
export function parseCoverage(output) {
  const text = strip(output);
  const lines = text.match(/^\s*Lines\s*:\s*([\d.]+)%\s*\(\s*(\d+)\/(\d+)\s*\)/m);
  if (!lines) return null;
  const threshold = text.match(/ERROR: Coverage for (\w+) \(([\d.]+)%\) does not meet[^\n]*threshold \(([\d.]+)%\)/);
  return {
    linesPct: Number(lines[1]),
    covered: Number(lines[2]),
    total: Number(lines[3]),
    thresholdFailure: threshold ? threshold[0].replace(/^ERROR: /, "") : null,
  };
}

export function lastLines(output, n = 6) {
  return strip(output)
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(-n)
    .join(" | ");
}

/** Turn a finished command into { status, line } for one check. */
export function judge(name, code, output) {
  if (name === "test") {
    const v = parseVitest(output);
    if (!v) return { status: "fail", line: `no vitest summary found (exit ${code}): ${lastLines(output, 3)}` };
    const base = `Test Files ${v.files ?? "?"}; Tests ${v.tests}`;
    if (!v.ok || code !== 0) {
      const names = v.failed.length ? `; failing: ${v.failed.slice(0, 20).join(", ")}` : "";
      return { status: "fail", line: `${base} (exit ${code})${names}` };
    }
    return { status: "pass", line: base };
  }
  if (name === "coverage") {
    const v = parseVitest(output);
    const c = parseCoverage(output);
    if (!v || !c) return { status: "fail", line: `no coverage summary found (exit ${code}): ${lastLines(output, 3)}` };
    const base = `Tests ${v.tests}; lines ${c.linesPct}% (${c.covered}/${c.total})`;
    if (!v.ok || c.thresholdFailure || code !== 0) {
      return { status: "fail", line: `${base} (exit ${code})${c.thresholdFailure ? `; ${c.thresholdFailure}` : ""}` };
    }
    return { status: "pass", line: base };
  }
  if (code !== 0) return { status: "fail", line: `exit ${code}: ${lastLines(output, 4)}` };
  return { status: "pass", line: "exit 0" };
}

