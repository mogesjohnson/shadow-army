import type { Adapter, Effort, Role } from "../adapters/Adapter.js";
import { whyNot } from "./assign.js";
import type { Difficulty } from "./delegate.js";
import type { Roster, SoldierSpec } from "./roster.js";

export interface TaskProfile {
  role: Role;
  difficulty?: Difficulty;
  /** Defaults to true for build tasks and false otherwise. */
  write?: boolean;
  /** The soldier who wrote the change under review; nobody reviews their own work. */
  author?: string;
}

export interface Candidate {
  soldier: string;
  cli: string;
  model: string;
  effort: Effort;
  /** Why this soldier ranks where it does. */
  reasons: string[];
}

export interface Excluded {
  soldier: string;
  reason: string;
}

export interface RouteResult {
  candidates: Candidate[];
  excluded: Excluded[];
}

/** Suggested reasoning effort, from the guide in orchestratorDelegate.md. */
export function suggestEffort(role: Role, difficulty: Difficulty): Effort {
  if (role === "review" || role === "orchestrate") return "high";
  if (role === "build") return difficulty === "hard" ? "high" : "medium";
  return "medium"; // research, test
}

/**
 * Decide who may take a task and in what order they are preferred. Pure rules, no model involved:
 * exclusions are the hard rules (never overridden), ranking follows the tie-breaks in the delegate guide.
 * The Monarch chooses among the candidates; if there are none, nobody is eligible.
 */
export function route(
  roster: Roster,
  getAdapter: (cli: string) => Adapter | undefined,
  profile: TaskProfile,
): RouteResult {
  const difficulty = profile.difficulty ?? "routine";
  const write = profile.write ?? profile.role === "build";
  const excluded: Excluded[] = [];
  const eligible: SoldierSpec[] = [];

  for (const soldier of roster.soldiers.values()) {
    const adapter = getAdapter(soldier.cli);
    if (!adapter) {
      excluded.push({ soldier: soldier.key, reason: `no adapter for CLI "${soldier.cli}"` });
      continue;
    }
    const refusal = whyNot(soldier, adapter, profile.role, write);
    if (refusal) {
      excluded.push({ soldier: soldier.key, reason: refusal });
      continue;
    }
    if (profile.role === "review" && profile.author === soldier.key) {
      excluded.push({ soldier: soldier.key, reason: "wrote the change, so it never reviews its own work" });
      continue;
    }
    if (profile.role === "build" && soldier.buildFor && !soldier.buildFor.includes(difficulty)) {
      excluded.push({
        soldier: soldier.key,
        reason: `builds only ${soldier.buildFor.join("/")} tasks, and this one is ${difficulty}`,
      });
      continue;
    }
    eligible.push(soldier);
  }

  const order = new Map([...roster.soldiers.keys()].map((k, i) => [k, i]));
  const byOrder = (a: SoldierSpec, b: SoldierSpec) => order.get(a.key)! - order.get(b.key)!;
  const monarchRank = (k: string) =>
    k === roster.monarch.default ? 0 : k === roster.monarch.fallback ? 1 : 2;
  const hardSpecialist = (s: SoldierSpec) => (s.buildFor?.includes("hard") ? 0 : 1);

  const ranked = [...eligible].sort((a, b) => {
    if (profile.role === "orchestrate") return monarchRank(a.key) - monarchRank(b.key) || byOrder(a, b);
    if (profile.role === "build" && difficulty === "routine") return a.cost - b.cost || byOrder(a, b);
    if (profile.role === "build") return hardSpecialist(a) - hardSpecialist(b) || b.cost - a.cost || byOrder(a, b);
    return b.cost - a.cost || byOrder(a, b); // review, research, test: most capable first
  });

  const candidates = ranked.map((s, i): Candidate => ({
    soldier: s.key,
    cli: s.cli,
    model: s.model,
    effort: suggestEffort(profile.role, difficulty),
    reasons: explain(s, i, profile.role, difficulty, roster),
  }));
  return { candidates, excluded };
}

function explain(s: SoldierSpec, index: number, role: Role, difficulty: Difficulty, roster: Roster): string[] {
  const reasons: string[] = [];
  if (role === "orchestrate") {
    if (s.key === roster.monarch.default) reasons.push("the configured Monarch");
    else if (s.key === roster.monarch.fallback) reasons.push("the configured fallback Monarch");
  } else if (role === "build" && difficulty === "routine") {
    reasons.push(index === 0 ? `cheapest soldier that qualifies (cost ${s.cost})` : `cost ${s.cost}`);
  } else if (role === "build") {
    if (s.buildFor?.includes("hard")) reasons.push("specialist for hard builds");
    reasons.push(`cost ${s.cost}, more capable ranks higher on hard work`);
  } else {
    reasons.push(`cost ${s.cost}, most capable ranks first`);
  }
  return reasons;
}

export function renderRoute(profile: TaskProfile, result: RouteResult): string {
  const difficulty = profile.difficulty ?? "routine";
  const head = `Routing: ${profile.role}${profile.role === "build" ? ` (${difficulty})` : ""}${
    profile.author ? `, written by ${profile.author}` : ""
  }`;
  const lines = [head, ""];
  if (result.candidates.length) {
    lines.push("Eligible, best first:");
    result.candidates.forEach((c, i) =>
      lines.push(`  ${i + 1}. ${c.soldier}  (${c.cli} ${c.model}, effort ${c.effort})  ${c.reasons.join("; ")}`),
    );
  } else {
    lines.push("Nobody is eligible for this task.");
  }
  if (result.excluded.length) {
    lines.push("", "Excluded:");
    for (const e of result.excluded) lines.push(`  - ${e.soldier}: ${e.reason}`);
  }
  return lines.join("\n");
}
