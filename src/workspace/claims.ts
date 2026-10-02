import picomatch from "picomatch";

export class ClaimError extends Error {}

const GLOB_CHARS = /[*?[\]{}()!+@]/;
const hasGlob = (claim: string) => GLOB_CHARS.test(claim);

/**
 * A claim is a path or glob relative to the repository root, e.g. `src/auth/**`, `README.md`,
 * or `docs/` (a trailing slash claims the whole directory).
 */
export function normalizeClaim(raw: string): string {
  let claim = raw.trim().replace(/\\/g, "/");
  while (claim.startsWith("./")) claim = claim.slice(2);
  if (!claim) throw new ClaimError("a claim cannot be empty");
  if (claim.startsWith("/") || /^[A-Za-z]:/.test(claim)) {
    throw new ClaimError(`claim "${raw}" must be relative to the repository root`);
  }
  if (claim.startsWith("!")) throw new ClaimError(`claim "${raw}" cannot be a negation`);
  if (claim.split("/").includes("..")) throw new ClaimError(`claim "${raw}" cannot contain ".."`);
  if (claim === ".") return "**";
  if (claim.endsWith("/")) claim += "**";
  return claim;
}

export function validateClaims(raws: string[]): string[] {
  if (raws.length === 0) throw new ClaimError("at least one claim is required (--claim <path or glob>)");
  return [...new Set(raws.map(normalizeClaim))];
}

/**
 * Windows and macOS file systems ignore case by default, so there `src/Auth/x.ts` and `src/auth/x.ts`
 * are the same file and a claim must match either spelling.
 */
export const CASE_INSENSITIVE_FS = process.platform === "win32" || process.platform === "darwin";

/** A literal claim (no glob characters) also claims everything under it, so `src/auth` covers `src/auth/x.ts`. */
function matcher(claim: string, nocase: boolean): (path: string) => boolean {
  if (!hasGlob(claim)) {
    const c = nocase ? claim.toLowerCase() : claim;
    return (p) => {
      const q = nocase ? p.toLowerCase() : p;
      return q === c || q.startsWith(`${c}/`);
    };
  }
  return picomatch(claim, { dot: true, nocase });
}

export function matchesClaims(path: string, claims: string[], nocase = CASE_INSENSITIVE_FS): boolean {
  const p = path.replace(/\\/g, "/");
  return claims.some((c) => matcher(c, nocase)(p));
}

/** Leading path segments with no glob characters: `src/auth/**` -> [src, auth]; `**\/*.ts` -> []. */
function staticPrefix(claim: string): string[] {
  const out: string[] = [];
  for (const seg of claim.split("/")) {
    if (hasGlob(seg)) break;
    out.push(seg);
  }
  return out;
}

const isPrefix = (a: string[], b: string[]) => a.length <= b.length && a.every((s, i) => s === b[i]);

/**
 * Could these two claims match the same file? Two claims overlap when one's static prefix is a prefix
 * of the other's. This is deliberately conservative: it may report an overlap that does not exist
 * (`src/*.test.ts` vs `src/a.ts`) but it never misses a real one. Case is ignored for the same reason:
 * on a case-insensitive file system `src/Auth` and `src/auth` are one directory.
 */
export function claimOverlap(a: string, b: string): boolean {
  const pa = staticPrefix(a.toLowerCase());
  const pb = staticPrefix(b.toLowerCase());
  return isPrefix(pa, pb) || isPrefix(pb, pa);
}

export function claimsOverlap(a: string[], b: string[]): boolean {
  return a.some((x) => b.some((y) => claimOverlap(x, y)));
}
