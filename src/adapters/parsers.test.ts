import { describe, expect, it } from "vitest";
import { parseAgyModels, parseCodexModels, parseGrokModels } from "./parsers.js";

describe("parseCodexModels", () => {
  it("reads slugs and display names from the catalog JSON", () => {
    const json = JSON.stringify({
      models: [
        { slug: "gpt-6.1-sol", display_name: "GPT-6.1-Sol" },
        { slug: "gpt-6-astra" },
        { display_name: "no slug" },
      ],
    });
    expect(parseCodexModels(json)).toEqual([
      { id: "gpt-6.1-sol", label: "GPT-6.1-Sol" },
      { id: "gpt-6-astra", label: undefined },
    ]);
  });

  it("returns nothing when the catalog has no models", () => {
    expect(parseCodexModels("{}")).toEqual([]);
  });
});

describe("parseGrokModels", () => {
  it("reads bullet lines and ignores prose", () => {
    const text = [
      "You are logged in with grok.com.",
      "",
      "Default model: grok-4.7",
      "",
      "Available models:",
      "  * grok-4.7 (default)",
      "  - grok-4.7-build-fast",
      "  - grok-4.6",
    ].join("\n");
    expect(parseGrokModels(text).map((m) => m.id)).toEqual([
      "grok-4.7",
      "grok-4.7-build-fast",
      "grok-4.6",
    ]);
  });
});

describe("parseAgyModels", () => {
  it("reads tab-separated id and label, skipping lines without a tab", () => {
    const text = "gemini-3.1-pro-high\tGemini 3.1 Pro (High)\r\nFetching available models...\r\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)";
    expect(parseAgyModels(text)).toEqual([
      { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
    ]);
  });
});
