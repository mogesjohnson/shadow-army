import { describe, expect, it } from "vitest";
import type { Adapter } from "../adapters/Adapter.js";
import { checkArmy, renderArmy } from "./army.js";
import { makeRoster } from "./roster.testutil.js";

function fake(id: string, opts: { found: boolean; models?: string[]; source?: "cli" | "static" }): Adapter {
  return {
    id,
    label: id,
    command: id,
    capabilities: { write: true, review: true },
    detect: async () => ({ found: opts.found, version: opts.found ? "1.0.0" : undefined }),
    listModels: async () => ({
      source: opts.source ?? "cli",
      models: (opts.models ?? []).map((m) => ({ id: m })),
    }),
    run: async () => ({ text: "", isError: false }),
  };
}

const config = makeRoster({
  a: { cli: "one", model: "m1", roles: ["orchestrate"] },
  b: { cli: "one", model: "ghost", roles: ["build"] },
  c: { cli: "two", model: "x", roles: ["build"] },
  d: { cli: "three", model: "opus", roles: ["review"] },
  e: { cli: "nope", model: "x", roles: ["build"] },
});

describe("checkArmy", () => {
  it("classifies each soldier's model against its CLI", async () => {
    const rows = await checkArmy(config, [
      fake("one", { found: true, models: ["m1"] }),
      fake("two", { found: false }),
      fake("three", { found: true, source: "static", models: ["opus"] }),
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.soldier, r]));
    expect(by.a!.modelStatus).toBe("ok");
    expect(by.b!.modelStatus).toBe("unknown");
    expect(by.c).toMatchObject({ found: false, modelStatus: "n/a" });
    expect(by.d!.modelStatus).toBe("unlisted");
    expect(by.e).toMatchObject({ found: false, modelStatus: "n/a" });
  });

  it("probes a shared CLI only once", async () => {
    let detects = 0;
    const shared = fake("one", { found: true, models: ["m1"] });
    const counting: Adapter = { ...shared, detect: async () => (detects++, { found: true, version: "1.0.0" }) };
    await checkArmy(config, [counting]);
    expect(detects).toBe(1);
  });
});

describe("model labels", () => {
  it("shows the CLI's label next to the model id", async () => {
    const labeled: Adapter = {
      ...fake("one", { found: true }),
      listModels: async () => ({ source: "cli", models: [{ id: "m1", label: "Model One" }] }),
    };
    const rows = await checkArmy(config, [labeled]);
    expect(rows.find((r) => r.soldier === "a")!.modelLabel).toBe("Model One");
    expect(renderArmy(rows)).toContain("m1 (Model One)");
  });
});

describe("renderArmy", () => {
  it("renders a header, a rule, and one line per soldier", async () => {
    const rows = await checkArmy(config, [fake("one", { found: true, models: ["m1"] })]);
    const lines = renderArmy(rows).split("\n");
    expect(lines).toHaveLength(2 + rows.length);
    expect(lines[0]).toContain("SOLDIER");
    expect(lines.join("\n")).toContain("nope (missing)");
  });
});
