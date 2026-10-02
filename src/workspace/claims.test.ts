import { describe, expect, it } from "vitest";
import { claimOverlap, claimsOverlap, ClaimError, matchesClaims, normalizeClaim, validateClaims } from "./claims.js";

describe("normalizeClaim", () => {
  it("accepts relative paths and globs, normalizing separators", () => {
    expect(normalizeClaim("src/auth/**")).toBe("src/auth/**");
    expect(normalizeClaim("./src\\auth\\x.ts")).toBe("src/auth/x.ts");
    expect(normalizeClaim("docs/")).toBe("docs/**");
    expect(normalizeClaim(".")).toBe("**");
  });

  it("refuses claims that could reach outside the repository or mean 'everything but'", () => {
    for (const bad of ["", "   ", "/etc/passwd", "C:\\Windows", "c:/x", "../x", "src/../../x", "!src/**"]) {
      expect(() => normalizeClaim(bad), bad).toThrow(ClaimError);
    }
  });
});

describe("validateClaims", () => {
  it("requires at least one claim and removes duplicates", () => {
    expect(() => validateClaims([])).toThrow(/at least one claim/);
    expect(validateClaims(["src/", "./src/", "README.md"])).toEqual(["src/**", "README.md"]);
  });
});

describe("matchesClaims", () => {
  it("matches files, whole directories named literally, and globs (dot files included)", () => {
    expect(matchesClaims("README.md", ["README.md"])).toBe(true);
    expect(matchesClaims("src/auth/deep/x.ts", ["src/auth"])).toBe(true);
    expect(matchesClaims("src/authority.ts", ["src/auth"])).toBe(false);
    expect(matchesClaims("src/auth/.env", ["src/auth/**"])).toBe(true);
    expect(matchesClaims("src/b.ts", ["src/*.ts"])).toBe(true);
    expect(matchesClaims("src/x/b.ts", ["src/*.ts"])).toBe(false);
    expect(matchesClaims("src\\a.ts", ["src/a.ts"])).toBe(true);
  });

  it("ignores case where the file system does (Windows, macOS), and not otherwise", () => {
    expect(matchesClaims("src/Auth/x.ts", ["src/auth/**"], true)).toBe(true);
    expect(matchesClaims("SRC/AUTH/X.TS", ["src/auth"], true)).toBe(true);
    expect(matchesClaims("src/Auth/x.ts", ["src/auth/**"], false)).toBe(false);
  });
});

describe("claim overlap", () => {
  it("finds every real overlap", () => {
    expect(claimOverlap("src/auth/**", "src/**")).toBe(true);
    expect(claimOverlap("src/**", "src/auth/x.ts")).toBe(true);
    expect(claimOverlap("README.md", "README.md")).toBe(true);
    expect(claimOverlap("**/*.ts", "docs/x.md")).toBe(true);
    expect(claimOverlap("src/Auth/**", "src/auth/x.ts")).toBe(true); // one directory on Windows/macOS
  });

  it("says no when the claims cannot meet", () => {
    expect(claimOverlap("src/auth/**", "src/billing/**")).toBe(false);
    expect(claimOverlap("src/a.ts", "src/a.ts.bak")).toBe(false);
    expect(claimOverlap("docs/**", "src/**")).toBe(false);
  });

  it("is conservative: it may report an overlap that is not there, never the reverse", () => {
    expect(claimOverlap("src/*.test.ts", "src/a.ts")).toBe(true);
  });

  it("compares claim sets pairwise", () => {
    expect(claimsOverlap(["docs/**", "src/a.ts"], ["src/**"])).toBe(true);
    expect(claimsOverlap(["docs/**"], ["src/**", "test/**"])).toBe(false);
  });
});
