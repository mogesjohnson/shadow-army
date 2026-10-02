import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("accepts the shipped shadow.config.json", () => {
    const json = readFileSync(new URL("../../shadow.config.json", import.meta.url), "utf8");
    const cfg = parseConfig(json);
    expect(Object.keys(cfg.soldiers)).toEqual(["codex-astra", "codex-sol", "claude-opus", "claude-sonnet", "grok", "agy"]);
    expect(cfg.soldiers["codex-sol"]).toEqual({ cli: "codex", model: "gpt-6.1-sol" });
  });

  it("holds runtime settings only: roles and rules live in orchestratorDelegate.md", () => {
    const json = readFileSync(new URL("../../shadow.config.json", import.meta.url), "utf8");
    expect(json).not.toMatch(/roles|forbidden|monarch/);
  });

  it("rejects a soldier with no model", () => {
    expect(() => parseConfig(JSON.stringify({ soldiers: { a: { cli: "x" } } }))).toThrow(ConfigError);
    expect(() => parseConfig(JSON.stringify({ soldiers: { a: { cli: "x" } } }))).toThrow(/soldiers\.a\.model/);
  });

  it("reports invalid JSON as a config error", () => {
    expect(() => parseConfig("{nope")).toThrow(/not valid JSON/);
  });
});
