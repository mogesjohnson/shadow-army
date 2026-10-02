import type { Role } from "../adapters/Adapter.js";
import type { Difficulty } from "./delegate.js";
import { loadRoster, type Roster, type SoldierSpec } from "./roster.js";

type Partial_ = {
  cli: string;
  model: string;
  roles: Role[];
  cost?: 1 | 2 | 3;
  buildFor?: Difficulty[];
  forbidden?: Role[];
  write?: boolean;
};

/** Build a roster directly from plain objects, skipping file parsing. Test use only. */
export function makeRoster(
  soldiers: Record<string, Partial_>,
  monarch?: { default: string; fallback?: string },
): Roster {
  const map = new Map<string, SoldierSpec>();
  for (const [key, s] of Object.entries(soldiers)) {
    map.set(key, {
      key,
      cli: s.cli,
      model: s.model,
      roles: s.roles,
      cost: s.cost ?? 2,
      buildFor: s.buildFor,
      forbidden: s.forbidden ?? [],
      write: s.write ?? true,
    });
  }
  const first = Object.keys(soldiers)[0]!;
  return { monarch: monarch ?? { default: first }, soldiers: map, guide: "" };
}

/** The roster the project actually ships (shadow.config.json + orchestratorDelegate.md in the repo root). */
export const shippedRoster = (): Roster => loadRoster();
