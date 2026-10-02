import type { Roster } from "../core/roster.js";
import { runGoal as realRunGoal, type MonarchEvent, type PlannedRun, type RunGoalOptions, type RunResult } from "../monarch/monarch.js";
import type { SessionTurn } from "../monarch/prompts.js";
import { planOf, renderPlan, renderResult } from "../monarch/render.js";
import type { Steps, Working } from "../ui/Dashboard.js";
import { applyEvent, viewFromPlan, type RunView } from "../ui/runView.js";
import { cliArgsFor, helpText, parseInput } from "./commands.js";

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

export interface ChatState {
  entries: Entry[];
  /** Changes when the transcript is cleared, so the screen starts printing it afresh. */
  epoch: number;
  mode: Mode;
  busy?: Busy;
  /** A plan waiting for the owner's yes or no; choice 0 is yes. */
  confirm?: { tasks: number; choice: 0 | 1 };
  /** A one-line hint under the prompt, such as how to exit. */
  notice?: string;
  sessionCostUsd: number;
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
}

/** How long a first Ctrl+C waits for the second. */
export const EXIT_WINDOW_MS = 2000;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** What the Monarch is told about a finished goal when the next one comes. */
function outcomeOf(r: RunResult): string {
  if (r.status === "planned") return `planned only, not run. Plan: ${r.plan.summary}`;
  if (r.status === "declined") return `the owner declined the plan: ${r.plan.summary}`;
  if (!r.outcomes.length) return `nothing to do. ${r.plan.summary}`;
  const counts = new Map<string, number>();
  for (const o of r.outcomes) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  const tasks = [...counts].map(([s, n]) => `${n} ${s}`).join(", ");
  const where = r.integration?.kept ? ` The work is on ${r.integration.branch}.` : "";
  return `${r.synthesis?.summary.trim() ?? r.plan.summary} (tasks: ${tasks}).${where}`;
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
  private answer?: (ok: boolean) => void;
  private exitArmedAt?: number;
  private readonly clock: () => number;

  constructor(private readonly deps: ChatDeps) {
    this.clock = deps.clock ?? Date.now;
    this.state = { entries: [{ id: 0, kind: "welcome" }], epoch: 0, mode: "ask", sessionCostUsd: 0 };
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

  /** Whether the prompt takes input now: not while something runs or a plan waits for an answer. */
  get idle(): boolean {
    return !this.state.busy && !this.state.confirm;
  }

  cycleMode() {
    const mode = MODES[(MODES.indexOf(this.state.mode) + 1) % MODES.length]!;
    this.set({ mode, notice: undefined });
  }

  moveChoice() {
    if (this.state.confirm) this.set({ confirm: { ...this.state.confirm, choice: this.state.confirm.choice === 0 ? 1 : 0 } });
  }

  /** Answer the pending plan: run it or not. */
  decide(ok: boolean) {
    const answer = this.answer;
    if (!answer) return;
    this.answer = undefined;
    this.set({ confirm: undefined });
    answer(ok);
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
      case "goal":
        return this.runTurn(input.goal, this.state.mode);
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
        return rest ? this.runTurn(rest, "plan") : this.say("Usage: /plan <goal>", "error");
    }
    const cli = cliArgsFor(name, args);
    if (!cli) return;
    if ("usage" in cli) return this.say(`Usage: ${cli.usage}`, "error");
    this.set({ busy: { kind: "command", work: { label: `/${name}${rest ? ` ${clip(rest, 60)}` : ""}`, startedAt: this.clock() } } });
    try {
      const r = await this.deps.runCommand(cli);
      this.say(r.output.trimEnd() || "(no output)", r.ok ? "normal" : "error");
    } catch (e) {
      this.say(`/${name} failed: ${(e as Error).message}`, "error");
    } finally {
      this.set({ busy: undefined });
    }
  }

  /** One goal: plan, maybe ask, run with the live dashboard, then the report into the transcript. */
  private async runTurn(goal: string, mode: Mode) {
    let steps: Steps | undefined;
    let view: RunView | undefined;
    let planShown = false;
    const endSteps = (failed: boolean) => {
      if (!steps) return;
      this.add({ kind: "steps", steps: { ...steps, current: { ...steps.current, done: failed ? "error" : "ok" } }, now: this.clock() });
      steps = undefined;
    };
    const onEvent = (e: MonarchEvent) => {
      if (view) {
        view = applyEvent(view, e, this.clock());
        this.set({ busy: { kind: "dashboard", view } });
      } else if (e.type === "phase") {
        const current = { label: e.message, startedAt: this.clock() };
        steps = steps ? { past: [...steps.past, steps.current.label], current } : { past: [], current };
        this.set({ busy: { kind: "steps", steps } });
      }
    };
    const confirm = async (planned: PlannedRun): Promise<boolean> => {
      endSteps(false);
      this.say(renderPlan(planned));
      planShown = true;
      let ok = true;
      if (mode === "ask") {
        this.set({ busy: undefined });
        ok = await new Promise<boolean>((resolve) => {
          this.answer = resolve;
          this.set({ confirm: { tasks: planned.checked.order.length, choice: 0 } });
        });
      }
      if (ok) {
        view = viewFromPlan(planned, goal, this.clock());
        this.set({ busy: { kind: "dashboard", view } });
      }
      return ok;
    };

    this.set({ busy: { kind: "steps", steps: { past: [], current: { label: "starting", startedAt: this.clock() } } } });
    try {
      const result = await (this.deps.runGoal ?? realRunGoal)({
        goal,
        cwd: this.deps.cwd,
        roster: this.deps.roster,
        planOnly: mode === "plan",
        history: this.turns(),
        onEvent,
        confirm,
        ...this.deps.goalOptions,
      });
      endSteps(false);
      if (view) this.add({ kind: "dashboard", view: { ...view, ended: "done" }, now: this.clock() });
      if (!planShown) this.say(renderPlan(planOf(result)));
      if (result.status !== "planned" && (result.status !== "completed" || result.outcomes.length)) this.say(renderResult(result));
      this.history.push({ goal, outcome: outcomeOf(result) });
      this.set({ sessionCostUsd: this.state.sessionCostUsd + result.costUsd });
    } catch (e) {
      endSteps(true);
      if (view) this.add({ kind: "dashboard", view: { ...view, ended: "failed" }, now: this.clock() });
      const message = (e as Error).message;
      this.say(`error: ${message}`, "error");
      this.history.push({ goal, outcome: `failed: ${message}` });
    } finally {
      this.answer = undefined;
      this.set({ busy: undefined, confirm: undefined });
    }
  }
}
