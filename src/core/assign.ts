import type { Adapter, Role } from "../adapters/Adapter.js";
import type { SoldierConfig } from "./config.js";

export type Assignment = { ok: true; role: Role; write: boolean } | { ok: false; reason: string };

/** The role to use when the caller does not pick one: the first configured role that is not orchestrate. */
export function defaultRole(soldier: SoldierConfig): Role {
  return soldier.roles.find((r) => r !== "orchestrate") ?? soldier.roles[0]!;
}

/**
 * Hard rules, enforced before anything is dispatched:
 *  - the role must be one the soldier is configured for
 *  - orchestrate is the Monarch's job, not a summonable task
 *  - review is refused for any CLI that cannot review (Grok)
 *  - writing needs the build role and a CLI that can write (never agy)
 */
export function checkAssignment(
  soldierKey: string,
  soldier: SoldierConfig,
  adapter: Adapter,
  role: Role,
  wantsWrite: boolean,
): Assignment {
  if (role === "orchestrate") {
    return { ok: false, reason: "orchestrate is the Monarch's role, not a task a soldier can be summoned for" };
  }
  if (!soldier.roles.includes(role)) {
    return {
      ok: false,
      reason: `${soldierKey} is not configured for the "${role}" role (it has: ${soldier.roles.join(", ")})`,
    };
  }
  if (role === "review" && !adapter.capabilities.review) {
    return { ok: false, reason: `${soldierKey} (${adapter.label}) never takes review tasks` };
  }
  if (wantsWrite && !adapter.capabilities.write) {
    return { ok: false, reason: `${soldierKey} (${adapter.label}) is read-only and can never be given write access` };
  }
  if (wantsWrite && role !== "build") {
    return { ok: false, reason: `write access is only granted for the build role, not "${role}"` };
  }
  return { ok: true, role, write: wantsWrite };
}
