import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("accepts the shipped shadow.config.json", () => {
    const json = readFileSync(new URL("../../shadow.config.json", import.meta.url), "utf8");
    const cfg = parseConfig(json);
    expect(cfg.soldiers["grok"]!.roles).not.toContain("review");
    expect(cfg.soldiers["agy"]!.roles).toEqual(["research", "test"]);
  });

  it("rejects a monarch that is not a soldier", () => {
    const bad = { monarch: { default: "ghost" }, soldiers: { a: { cli: "x", model: "m", roles: ["build"] } } };
    expect(() => parseConfig(JSON.stringify(bad))).toThrow(/not a configured soldier/);
  });

  it("rejects an unknown role", () => {
    const bad = { monarch: { default: "a" }, soldiers: { a: { cli: "x", model: "m", roles: ["bake"] } } };
    expect(() => parseConfig(JSON.stringify(bad))).toThrow();
  });
});
