import type { Autonomy, Role } from "../adapters/Adapter.js";
import { loadConfig, type ShadowConfig } from "./config.js";
import { loadDelegate, type Delegate, type Difficulty } from "./delegate.js";
import { checkRules, loadRules, RulesError, type Rules } from "./rules.js";

/** Everything known about one soldier: how to run it (config) and what it may do (delegate). */
export interface SoldierSpec {
  key: string;
  cli: string;
  model: string;
  roles: Role[];
  cost: 1 | 2 | 3;
  buildFor?: Difficulty[];
  forbidden: Role[];
  write: boolean;
  autonomy: Autonomy;
}

export interface Roster {
  monarch: { default: string; fallback?: string };
  soldiers: Map<string, SoldierSpec>;
  /** Delegate prose for the Monarch. */
  guide: string;
  /** rules.md and agent.md: put into every brief. */
  rules: Rules;
}

export class RosterError extends Error {}

const NO_RULES: Rules = { all: "", perSoldier: new Map() };

/**
 * Merge config, delegate policy and rules. A soldier in only one of config and delegate is an error:
 * one with no policy would run without its rules, and one with no CLI or model cannot run at all.
 * So is an agent.md section for a soldier that does not exist.
 */
export function buildRoster(config: ShadowConfig, delegate: Delegate, rules: Rules = NO_RULES): Roster {
  const problems: string[] = [];
  const soldiers = new Map<string, SoldierSpec>();

  for (const key of Object.keys(config.soldiers)) {
    if (!(key in delegate.policy.soldiers)) {
      problems.push(`"${key}" is in shadow.config.json but has no policy in orchestratorDelegate.md`);
    }
  }
  for (const [key, policy] of Object.entries(delegate.policy.soldiers)) {
    const runtime = config.soldiers[key];
    if (!runtime) {
      problems.push(`"${key}" is in orchestratorDelegate.md but has no cli/model in shadow.config.json`);
      continue;
    }
    soldiers.set(key, {
      key,
      cli: runtime.cli,
      model: runtime.model,
      roles: policy.roles,
      cost: policy.cost,
      buildFor: policy.buildFor,
      forbidden: policy.forbidden,
      write: policy.write,
      autonomy: runtime.autonomy,
    });
  }
  problems.push(...checkRules(rules, Object.keys(delegate.policy.soldiers)));

  if (problems.length) {
    throw new RosterError(`the configuration files disagree:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return { monarch: delegate.policy.monarch, soldiers, guide: delegate.guide, rules };
}

export function loadRoster(cwd = process.cwd()): Roster {
  let rules: Rules;
  try {
    rules = loadRules(cwd);
  } catch (e) {
    if (e instanceof RulesError) throw new RosterError(e.message);
    throw e;
  }
  return buildRoster(loadConfig(cwd), loadDelegate(cwd), rules);
}
