import type { Role } from "../adapters/Adapter.js";
import { loadConfig, type ShadowConfig } from "./config.js";
import { loadDelegate, type Delegate, type Difficulty } from "./delegate.js";

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
}

export interface Roster {
  monarch: { default: string; fallback?: string };
  soldiers: Map<string, SoldierSpec>;
  /** Delegate prose for the Monarch. */
  guide: string;
}

export class RosterError extends Error {}

/**
 * Merge config and delegate policy. A soldier in only one of the two files is an error: one with
 * no policy would run without its rules, and one with no CLI or model cannot run at all.
 */
export function buildRoster(config: ShadowConfig, delegate: Delegate): Roster {
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
    });
  }

  if (problems.length) {
    throw new RosterError(`shadow.config.json and orchestratorDelegate.md disagree:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return { monarch: delegate.policy.monarch, soldiers, guide: delegate.guide };
}

export function loadRoster(cwd = process.cwd()): Roster {
  return buildRoster(loadConfig(cwd), loadDelegate(cwd));
}
