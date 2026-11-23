import { describe, expect, it } from "vitest";
import { judge, parseCoverage, parseVitest } from "./ci-local-parse.mjs";

const pass = " Test Files  3 passed (3)\n      Tests  12 passed (12)\n";
const fail = " FAIL  src/a.test.ts > does a thing\n Test Files  1 failed | 2 passed (3)\n      Tests  1 failed | 11 passed (12)\n";
const cov = "Lines        : 91.20% ( 912/1000 )\n";

describe("ci-local summary parsing", () => {
  it("reads vitest's pass summary", () => {
    expect(parseVitest(pass)).toMatchObject({ ok: true, tests: "12 passed (12)" });
  });
  it("reads failures and their names", () => {
    const v = parseVitest(fail);
    expect(v.ok).toBe(false);
    expect(v.failed).toEqual(["src/a.test.ts > does a thing"]);
  });
  it("returns null without a Tests line", () => {
    expect(parseVitest("nothing here")).toBeNull();
  });
  it("reads coverage and the threshold error", () => {
    expect(parseCoverage(cov).linesPct).toBe(91.2);
    const c = parseCoverage(`${cov}ERROR: Coverage for lines (84%) does not meet global threshold (85%)\n`);
    expect(c.thresholdFailure).toContain("84%");
  });
  it("does not trust a zero exit without a summary", () => {
    expect(judge("test", 0, "").status).toBe("fail");
    expect(judge("test", 0, pass).status).toBe("pass");
    expect(judge("test", 1, pass).status).toBe("fail");
    expect(judge("coverage", 0, pass).status).toBe("fail");
    expect(judge("coverage", 0, pass + cov).status).toBe("pass");
    expect(judge("tsc", 2, "error TS1").status).toBe("fail");
  });
});
