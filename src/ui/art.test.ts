import { describe, expect, it } from "vitest";
import { plainBanner, SHADOW_ART, ARMY_ART } from "./art.js";

describe("plainBanner", () => {
  it("includes both art blocks, tagline and version", () => {
    const out = plainBanner("1.2.3");
    for (const line of [...SHADOW_ART, ...ARMY_ART]) expect(out).toContain(line);
    expect(out).toContain("Zero shared baggage");
    expect(out).toContain("v1.2.3");
  });
});
