import { Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import type { Report } from "../core/types.js";
import type { PlannedRun } from "../monarch/monarch.js";
import type { PlanTask } from "../monarch/plan.js";
import type { TaskOutcome } from "../monarch/schedule.js";

export const task = (id: string, role: PlanTask["role"], title: string, over: Partial<PlanTask> = {}): PlanTask => ({
  id,
  title,
  role,
  difficulty: "routine",
  claims: role === "build" ? [`${id}.txt`] : [],
  dependsOn: [],
  brief: "do it",
  ...over,
});

/** Two builds and a review of both, assigned the way the shipped rules would. */
export function samplePlanned(): PlannedRun {
  const tasks = [
    task("a", "build", "write the first file"),
    task("b", "build", "write the second file"),
    task("r", "review", "review both files", { dependsOn: ["a", "b"] }),
  ];
  const soldiers: Record<string, string> = { a: "grok", b: "codex-sol", r: "claude-opus" };
  return {
    runId: "20261002-abc123",
    monarch: "codex-astra",
    checked: { plan: { summary: "two files and a review", tasks }, order: ["a", "b", "r"] },
    assignments: new Map(tasks.map((t) => [t.id, { taskId: t.id, soldier: soldiers[t.id]!, effort: "medium", reason: "test" }])),
    rejected: [],
  };
}

export const report = (over: Partial<Report> = {}): Report => ({
  soldier: "grok",
  role: "build",
  model: "m",
  status: "ok",
  summary: "did it",
  filesTouched: [],
  openQuestions: [],
  notes: [],
  structured: true,
  durationMs: 1000,
  ...over,
});

export const outcome = (taskId: string, over: Partial<TaskOutcome> = {}): TaskOutcome => ({
  taskId,
  soldier: "grok",
  status: "ok",
  merged: false,
  ...over,
});

/** A stream Ink takes for a terminal, keeping everything written to it. Test use only. */
export function fakeTerminal(columns = 100) {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(String(chunk));
      done();
    },
  }) as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: true, columns, rows: 40 });
  return {
    stream,
    /** Everything written, without colors or cursor movement. */
    text: () => stripVTControlCharacters(chunks.join("")),
    writeLine: (line: string) => void stream.write(`${line}\n`),
  };
}
