import { describe, expect, it } from "vitest";
import { samplePlanned } from "../ui/fixtures.testutil.js";
import type { RunResult } from "./monarch.js";
import { formatTokens, renderPlan, renderUsage, usageByModel } from "./render.js";

describe("formatTokens", () => {
  it("writes counts short, without rounding up to the next unit's worth of the smaller one", () => {
    expect([0, 950, 1000, 1234, 9_960, 12_345, 999_499, 999_500, 1_234_567].map(formatTokens)).toEqual([
      "0",
      "950",
      "1k",
      "1.2k",
      "10k",
      "12k",
      "999k",
      "1M",
      "1.2M",
    ]);
  });
});

describe("efforts and tokens in the plan and the report", () => {
  it("shows each task's effort in the plan", () => {
    const planned = samplePlanned();
    const lines = renderPlan(planned).split("\n");
    for (const id of planned.checked.order) {
      const a = planned.assignments.get(id)!;
      expect(lines.find((l) => l.trimStart().startsWith(`${id} `))).toContain(` ${a.effort} `);
    }
  });

  it("totals tokens by soldier, the Monarch's calls first, and lists the efforts used", () => {
    const planned = samplePlanned();
    const [first, second] = planned.checked.order;
    const r = {
      monarch: planned.monarch,
      plan: planned.checked.plan,
      order: planned.checked.order,
      assignments: [
        { ...planned.assignments.get(first!)!, soldier: "grok", effort: "medium" },
        { ...planned.assignments.get(second!)!, soldier: "grok", effort: "high" },
      ],
      monarchUsage: [{ soldier: "codex-astra", model: "gpt-6-astra", effort: "low", calls: 2, inputTokens: 2400, outputTokens: 600 }],
      outcomes: [
        { taskId: first!, soldier: "grok", status: "ok", merged: true, report: { model: "grok-4.7", inputTokens: 10_000, outputTokens: 2_000 } },
        { taskId: second!, soldier: "grok", status: "ok", merged: true, report: { model: "grok-4.7", inputTokens: 5_000, outputTokens: 500 } },
      ],
    } as unknown as RunResult;

    expect(usageByModel(r)).toEqual([
      { soldier: "codex-astra", model: "gpt-6-astra", efforts: ["low"], inputTokens: 2400, outputTokens: 600 },
      { soldier: "grok", model: "grok-4.7", efforts: ["medium", "high"], inputTokens: 15_000, outputTokens: 2_500 },
    ]);
    expect(renderUsage(r)).toEqual([
      "Tokens:",
      "  codex-astra (gpt-6-astra)  effort low     2.4k in · 600 out",
      "  grok (grok-4.7)            effort medium/high  15k in · 2.5k out",
    ]);
  });

  it("says nothing about tokens when no CLI reported any", () => {
    const r = { assignments: [], outcomes: [], monarchUsage: [{ soldier: "agy", model: "m", effort: "low", calls: 1, inputTokens: 0, outputTokens: 0 }] } as unknown as RunResult;
    expect(renderUsage(r)).toEqual([]);
  });
});
