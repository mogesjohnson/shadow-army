import type { Effort } from "../adapters/Adapter.js";
import type { Roster } from "../core/roster.js";
import {
  runGoal as realRunGoal,
  type ConfirmAnswer,
  type MonarchEvent,
  type PlannedRun,
  type RunGoalOptions,
  type RunResult,
} from "../monarch/monarch.js";
import type { SessionTurn } from "../monarch/prompts.js";
import { formatTokens, planOf, renderPlan, renderResult, renderUsage, renderUsageRows, UsageTally, type ModelUsage } from "../monarch/render.js";
import type { Steps, Working } from "../ui/Dashboard.js";
import { applyEvent, viewFromPlan, type RunView } from "../ui/runView.js";
import { cliArgsFor, helpText, parseInput } from "./commands.js";
import { folderChanges } from "./diff.js";

export type Mode = "ask" | "auto" | "plan";
export const MODES: Mode[] = ["ask", "auto", "plan"];
export const MODE_LABEL: Record<Mode, string> = {
  ask: "ask before running",
  auto: "run plans without asking",
  plan: "plan only",
};

/** One item of the transcript. Items never change once added; the screen prints each once. */
export type Entry =
  | { id: number; kind: "welcome" }
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "text"; text: string; tone: "normal" | "error" | "dim" }
  | { id: number; kind: "steps"; steps: Steps; now: number }
  | { id: number; kind: "dashboard"; view: RunView; now: number };

type NewEntry = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;

/** What is happening right now, drawn live under the transcript. */
export type Busy =
  | { kind: "steps"; steps: Steps }
  | { kind: "dashboard"; view: RunView }
  | { kind: "command"; work: Working };

/** The efforts the owner can pick, lowest first. */
export const EFFORTS: Effort[] = ["low", "medium", "high", "max"];

/** One task of a plan waiting for approval, with the effort it will run at. */
export interface ConfirmTask {
  id: string;
  title: string;
  soldier: string;
  model: string;
  /** What Shadow Army suggests, from the task's role and difficulty. */
  suggested: Effort;
  effort: Effort;
}

export interface ChatState {
  entries: Entry[];
  /** Changes when the transcript is cleared, so the screen starts printing it afresh. */
  epoch: number;
  mode: Mode;
  busy?: Busy;
  /** The Monarch's effort, being picked before it plans a goal. */
  pickEffort?: { soldier: string; model: string; suggested: Effort; choice: Effort };
  /**
   * A plan waiting for the owner. `row` is the highlighted line: a task (its effort can be changed),
   * then Yes at `tasks.length`, then No.
   */
  confirm?: { tasks: ConfirmTask[]; row: number };
  /** A one-line hint under the prompt, such as how to exit. */
  notice?: string;
  sessionCostUsd: number;
  /** Tokens this session, by soldier and the model that answered, counted as each call reports them. */
  tokens: ModelUsage[];
}

/**
 * The Monarch's suggested effort for a goal: low for a short question, high for anything else. Only a
 * suggestion: the owner picks the effort before the Monarch is called.
 */
export function suggestMonarchEffort(goal: string): Effort {
  const g = goal.trim().toLowerCase();
  const asks = g.endsWith("?") || /^(what|why|how|where|when|which|who|is|are|does|do|can|could|should|explain|describe|list|show|tell)\b/.test(g);
  return asks && g.length <= 200 ? "low" : "high";
}

export interface ChatDeps {
  cwd: string;
  roster: Roster;
  /** Runs `sa <args>` and returns what it printed. */
  runCommand: (args: string[]) => Promise<{ output: string; ok: boolean }>;
  exit: () => void;
  clearScreen: () => void;
  clock?: () => number;
  runGoal?: (opts: RunGoalOptions) => Promise<RunResult>;
  /** Extra options for every run (tests pass fake soldiers here). */
  goalOptions?: Partial<RunGoalOptions>;
  /** The soldier expected to be Monarch, named in the effort picker. Without one, the suggestion is used. */
  monarch?: string;
}

/** How long a first Ctrl+C waits for the second. */
export const EXIT_WINDOW_MS = 2000;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** A plan with no tasks and a summary is the Monarch answering a question itself: the summary is the answer. */
const answerOf = (r: RunResult): string | undefined => (r.order.length ? undefined : r.plan.summary.trim() || undefined);

const CHANGE_WORD: Record<string, string> = { A: "added", M: "modified", D: "deleted" };
const NAMED_FILES = 10;

/** Where a run's work ended up, so a follow-up knows whether it is in the owner's folder or only on the branch. */
function whereWorkIs(r: RunResult): string {
  if (!r.integration?.kept) return "";
  const { branch } = r.integration;
  if (r.applied?.applied && r.applied.files.length) {
    const files = r.applied.files.map((f) => `${CHANGE_WORD[f.change] ?? "changed"} ${f.path}`);
    const named = files.length > NAMED_FILES ? [...files.slice(0, NAMED_FILES), `and ${files.length - NAMED_FILES} more`] : files;
    return ` The changes were applied to the owner's folder as uncommitted edits (${named.join(", ")}); the work is also on ${branch}.`;
  }
  const notApplied = r.applied && !r.applied.applied ? ` It was not applied to the folder: ${r.applied.reason}.` : "";
  return ` The work is on ${branch}.${notApplied}`;
}

/** What the Monarch is told about a finished goal when the next one comes. */
function outcomeOf(r: RunResult): string {
  const answer = answerOf(r);
  if (answer) return `the Monarch answered it directly, with no soldiers. Answer: ${answer}`;
  if (r.status === "planned") return `planned only, not run. Plan: ${r.plan.summary}`;
  if (r.status === "declined") return `the owner declined the plan: ${r.plan.summary}`;
  if (!r.outcomes.length) return `nothing to do. ${r.plan.summary}`;
  const counts = new Map<string, number>();
  for (const o of r.outcomes) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  const tasks = [...counts].map(([s, n]) => `${n} ${s}`).join(", ");
  return `${r.synthesis?.summary.trim() ?? r.plan.summary} (tasks: ${tasks}).${whereWorkIs(r)}`;
}

/**
 * The chat session behind `sa`: a transcript, the mode, and whatever is running. Goals go to the
 * Monarch through `runGoal`; other commands run as `sa` subcommands. The screen subscribes to it.
 */
export class ChatSession {
  private state: ChatState;
  private readonly listeners = new Set<() => void>();
  private readonly history: SessionTurn[] = [];
  private nextId = 1;
  private answer?: (a: ConfirmAnswer) => void;
  private pickAnswer?: (effort: Effort | undefined) => void;
  private exitArmedAt?: number;
  private readonly clock: () => number;

  constructor(private readonly deps: ChatDeps) {
    this.clock = deps.clock ?? Date.now;
    this.state = { entries: [{ id: 0, kind: "welcome" }], epoch: 0, mode: "ask", sessionCostUsd: 0, tokens: [] };
  }

  getState = (): ChatState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The goals so far and how they ended, as the Monarch sees them. */
  turns(): SessionTurn[] {
    return [...this.history];
  }

  private set(change: Partial<ChatState>) {
    this.state = { ...this.state, ...change };
    for (const l of this.listeners) l();
  }

  private add(...entries: NewEntry[]) {
    this.set({ entries: [...this.state.entries, ...entries.map((e) => ({ ...e, id: this.nextId++ }) as Entry)] });
  }

  private say(text: string, tone: "normal" | "error" | "dim" = "normal") {
    this.add({ kind: "text", text, tone });
  }

  /** Whether the prompt takes input now: not while something runs, or an effort or a plan waits for an answer. */
  get idle(): boolean {
    return !this.state.busy && !this.state.confirm && !this.state.pickEffort;
  }

  cycleMode() {
    const mode = MODES[(MODES.indexOf(this.state.mode) + 1) % MODES.length]!;
    this.set({ mode, notice: undefined });
  }

  /** Move the highlight in the pending plan: through its tasks, then Yes and No, wrapping around. */
  moveChoice(step: 1 | -1 = 1) {
    const c = this.state.confirm;
    if (!c) return;
    const lines = c.tasks.length + 2;
    this.set({ confirm: { ...c, row: (c.row + step + lines) % lines } });
  }

  /** Change an effort: the Monarch's while it is being picked, or the highlighted task's in a pending plan. */
  moveEffort(step: 1 | -1) {
    const next = (e: Effort) => EFFORTS[Math.min(EFFORTS.length - 1, Math.max(0, EFFORTS.indexOf(e) + step))]!;
    const p = this.state.pickEffort;
    if (p) return this.set({ pickEffort: { ...p, choice: next(p.choice) } });
    const c = this.state.confirm;
    if (!c || c.row >= c.tasks.length) return;
    const tasks = c.tasks.map((t, i) => (i === c.row ? { ...t, effort: next(t.effort) } : t));
    this.set({ confirm: { ...c, tasks } });
  }

  /** Set the Monarch's effort in the picker directly, as the 1-4 keys do. */
  setEffort(effort: Effort) {
    const p = this.state.pickEffort;
    if (p && EFFORTS.includes(effort)) this.set({ pickEffort: { ...p, choice: effort } });
  }

  /** Enter in a pending plan: No declines; any other line runs it with the efforts shown. */
  choose() {
    const c = this.state.confirm;
    if (c) this.decide(c.row !== c.tasks.length + 1);
  }

  /** Answer the pending plan: run it or not, with the efforts shown. */
  decide(ok: boolean) {
    const answer = this.answer;
    const c = this.state.confirm;
    if (!answer || !c) return;
    this.answer = undefined;
    this.set({ confirm: undefined });
    answer({ run: ok, efforts: Object.fromEntries(c.tasks.map((t) => [t.id, t.effort])) });
  }

  /** Answer the Monarch's effort picker: start with the highlighted effort, or cancel the goal. */
  decideEffort(ok: boolean) {
    const answer = this.pickAnswer;
    const p = this.state.pickEffort;
    if (!answer || !p) return;
    this.pickAnswer = undefined;
    this.set({ pickEffort: undefined });
    answer(ok ? p.choice : undefined);
  }

  /** Ctrl+C on an empty prompt: the first press warns, a second within the window exits. */
  interrupt() {
    const now = this.clock();
    if (this.exitArmedAt !== undefined && now - this.exitArmedAt <= EXIT_WINDOW_MS) {
      this.deps.exit();
      return;
    }
    this.exitArmedAt = now;
    this.set({
      notice: this.state.busy
        ? "A run is working. Press Ctrl+C again to quit; its soldiers stop with it."
        : "Press Ctrl+C again to exit.",
    });
  }

  clearNotice() {
    this.exitArmedAt = undefined;
    if (this.state.notice) this.set({ notice: undefined });
  }

  /** Handle one line from the prompt. Resolves when whatever it started is over. */
  async submit(text: string): Promise<void> {
    if (!this.idle) return;
    const input = parseInput(text);
    if (input.kind === "empty") return;
    this.clearNotice();
    this.add({ kind: "user", text: text.trim() });
    switch (input.kind) {
      case "error":
        return this.say(input.message, "error");
      case "goal":
        return this.startGoal(input.goal, this.state.mode);
      case "unknown":
        return this.say(`Unknown command /${input.typed}.${input.suggestion ? ` Did you mean /${input.suggestion}?` : ""} Type /help for the list.`, "error");
      case "command":
        return this.command(input.name, input.args, input.rest);
    }
  }

  private async command(name: string, args: string[], rest: string) {
    switch (name) {
      case "help":
        return this.say(helpText());
      case "exit":
        return this.deps.exit();
      case "clear":
        this.history.length = 0;
        this.deps.clearScreen();
        this.set({ entries: [{ id: this.nextId++, kind: "welcome" }], epoch: this.state.epoch + 1 });
        return;
      case "mode": {
        if (!args.length) return this.cycleMode();
        const mode = args[0]!.toLowerCase() as Mode;
        if (!MODES.includes(mode)) return this.say(`Unknown mode "${args[0]}". The modes are ${MODES.join(", ")}.`, "error");
        this.set({ mode });
        return this.say(`Mode: ${MODE_LABEL[mode]}.`, "dim");
      }
      case "plan":
        return rest ? this.startGoal(rest, "plan") : this.say("Usage: /plan <goal>", "error");
      case "diff":
        // Free: git runs here, with no `sa` child and no Monarch or soldier.
        return this.working(name, "/diff", async () => ({ output: await folderChanges(this.deps.cwd), ok: true }));
    }
    const cli = cliArgsFor(name, args);
    if (!cli) return;
    if ("usage" in cli) return this.say(`Usage: ${cli.usage}`, "error");
    return this.working(name, `/${name}${rest ? ` ${clip(rest, 60)}` : ""}`, () => this.deps.runCommand(cli));
  }

  /** Show `label` as the live line while `work` runs, then its output in the transcript. */
  private async working(name: string, label: string, work: () => Promise<{ output: string; ok: boolean }>) {
    this.set({ busy: { kind: "command", work: { label, startedAt: this.clock() } } });
    try {
      const r = await work();
      this.say(r.output.trimEnd() || "(no output)", r.ok ? "normal" : "error");
    } catch (e) {
      this.say(`/${name} failed: ${(e as Error).message}`, "error");
    } finally {
      this.set({ busy: undefined });
    }
  }

  /**
   * Pick the Monarch's effort, then run the goal. In ask and plan mode the owner picks it, starting
   * from the suggestion; in auto mode the suggestion is used and said.
   */
  private async startGoal(goal: string, mode: Mode) {
    const suggested = suggestMonarchEffort(goal);
    const soldier = this.deps.monarch;
    if (mode === "auto" || !soldier) {
      if (soldier) this.say(`${soldier} plans at ${suggested} effort (suggested)`, "dim");
      return this.runTurn(goal, mode, suggested);
    }
    const model = this.deps.roster.soldiers.get(soldier)?.model ?? "?";
    const effort = await new Promise<Effort | undefined>((resolve) => {
      this.pickAnswer = resolve;
      this.set({ pickEffort: { soldier, model, suggested, choice: suggested } });
    });
    if (!effort) return this.say("Cancelled.", "dim");
    return this.runTurn(goal, mode, effort);
  }

  /** One goal: plan, maybe ask, run with the live dashboard, then the report into the transcript. */
  private async runTurn(goal: string, mode: Mode, effort: Effort) {
    let steps: Steps | undefined;
    let view: RunView | undefined;
    let planShown = false;
    const endSteps = (failed: boolean) => {
      if (!steps) return;
      this.add({ kind: "steps", steps: { ...steps, current: { ...steps.current, done: failed ? "error" : "ok" } }, now: this.clock() });
      steps = undefined;
    };
    // What this turn used, counted as each call reports it, so a failed turn still says it and the
    // status line moves while the run works.
    const turn = new UsageTally();
    const efforts = new Map<string, Effort>();
    const count = (soldier: string, model: string, effort: string | undefined, input = 0, output = 0) => {
      if (!input && !output) return;
      turn.add(soldier, model, effort, input, output);
      const tally = new UsageTally();
      for (const u of this.state.tokens) tally.add(u.soldier, u.model, undefined, u.inputTokens, u.outputTokens);
      tally.add(soldier, model, undefined, input, output);
      this.set({ tokens: tally.list() });
    };
    const onEvent = (e: MonarchEvent) => {
      if (e.type === "usage") return count(e.soldier, e.model, e.effort, e.inputTokens, e.outputTokens);
      if (e.type === "finish" && e.outcome.report) {
        const r = e.outcome.report;
        count(e.outcome.soldier, r.resolvedModel ?? r.model, efforts.get(e.outcome.taskId), r.inputTokens, r.outputTokens);
      }
      if (view) {
        view = applyEvent(view, e, this.clock());
        this.set({ busy: { kind: "dashboard", view } });
      } else if (e.type === "phase") {
        const current = { label: e.message, startedAt: this.clock() };
        steps = steps ? { past: [...steps.past, steps.current.label], current } : { past: [], current };
        this.set({ busy: { kind: "steps", steps } });
      }
    };
    const confirm = async (planned: PlannedRun): Promise<ConfirmAnswer> => {
      endSteps(false);
      this.say(renderPlan(planned));
      planShown = true;
      let answer: ConfirmAnswer = { run: true };
      if (mode === "ask") {
        this.set({ busy: undefined });
        const tasks: ConfirmTask[] = planned.checked.order.map((id) => {
          const task = planned.checked.plan.tasks.find((t) => t.id === id)!;
          const a = planned.assignments.get(id)!;
          const model = this.deps.roster.soldiers.get(a.soldier)?.model ?? "?";
          return { id, title: task.title, soldier: a.soldier, model, suggested: a.effort, effort: a.effort };
        });
        answer = await new Promise<ConfirmAnswer>((resolve) => {
          this.answer = resolve;
          this.set({ confirm: { tasks, row: tasks.length } });
        });
      }
      if (answer.run) {
        // The efforts the tasks will run at, for their tokens' lines.
        for (const id of planned.checked.order) efforts.set(id, answer.efforts?.[id] ?? planned.assignments.get(id)!.effort);
        view = viewFromPlan(planned, goal, this.clock());
        this.set({ busy: { kind: "dashboard", view } });
      }
      return answer;
    };

    this.set({ busy: { kind: "steps", steps: { past: [], current: { label: "starting", startedAt: this.clock() } } } });
    try {
      const result = await (this.deps.runGoal ?? realRunGoal)({
        goal,
        cwd: this.deps.cwd,
        roster: this.deps.roster,
        planOnly: mode === "plan",
        history: this.turns(),
        monarchEffort: effort,
        onEvent,
        confirm,
        ...this.deps.goalOptions,
      });
      endSteps(false);
      if (view) this.add({ kind: "dashboard", view: { ...view, ended: "done" }, now: this.clock() });
      const answer = answerOf(result);
      // A finished run's report and a declined plan's "Not run." both list tokens themselves.
      const reported = (result.status === "completed" && result.outcomes.length > 0) || result.status === "declined";
      if (answer) {
        // No tasks: the Monarch answered the question itself, so its summary is the answer, not a plan.
        this.say(answer);
        this.say(`answered by ${result.monarch} at ${effort} effort; no soldiers were needed`, "dim");
      } else {
        if (!planShown) this.say(renderPlan(planOf(result)));
        if (reported) this.say(renderResult(result));
      }
      if (!reported && renderUsage(result).length) this.say(renderUsage(result).join("\n"), "dim");
      this.history.push({ goal, outcome: outcomeOf(result) });
      this.set({ sessionCostUsd: this.state.sessionCostUsd + result.costUsd });
    } catch (e) {
      endSteps(true);
      if (view) this.add({ kind: "dashboard", view: { ...view, ended: "failed" }, now: this.clock() });
      const message = (e as Error).message;
      this.say(`error: ${message}`, "error");
      // The calls made before the failure still used tokens.
      const used = renderUsageRows(turn.list());
      if (used.length) this.say(used.join("\n"), "dim");
      this.history.push({ goal, outcome: `failed: ${message}` });
    } finally {
      this.answer = undefined;
      this.set({ busy: undefined, confirm: undefined });
    }
  }

}

/**
 * The status line's token summary: each soldier's tokens this session, in and out together. A soldier
 * that answered with more than one model gets one entry per model.
 */
export function tokenSummary(tokens: ChatState["tokens"]): string {
  const used = tokens.filter((t) => t.inputTokens + t.outputTokens > 0);
  const models = new Map<string, number>();
  for (const t of used) models.set(t.soldier, (models.get(t.soldier) ?? 0) + 1);
  return used
    .map((t) => `${models.get(t.soldier)! > 1 ? `${t.soldier} (${t.model})` : t.soldier} ${formatTokens(t.inputTokens + t.outputTokens)}`)
    .join(" · ");
}
