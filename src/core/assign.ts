import type { Adapter, Role } from "../adapters/Adapter.js";
import type { SoldierSpec } from "./roster.js";

export type Assignment = { ok: true; role: Role; write: boolean } | { ok: false; reason: string };

/** The role to use when the caller does not pick one: the first configured role that is not orchestrate. */
export function defaultRole(soldier: SoldierSpec): Role {
  return soldier.roles.find((r) => r !== "orchestrate") ?? soldier.roles[0]!;
}

/**
 * The hard rules, in one place. A soldier may take a role only if BOTH the roster (orchestratorDelegate.md)
 * and the adapter's built-in capabilities allow it. A delegate file can therefore only restrict an
 * adapter, never grant it more: Grok never reviews and agy never writes even if the file says otherwise.
 *
 * Returns the reason the assignment is refused, or undefined when it is allowed.
 */
export function whyNot(
  soldier: SoldierSpec,
  adapter: Adapter,
  role: Role,
  wantsWrite: boolean,
): string | undefined {
  const who = `${soldier.key} (${adapter.label})`;
  if (soldier.forbidden.includes(role)) return `${who} never takes ${role} tasks`;
  if (role === "review" && !adapter.capabilities.review) return `${who} never takes review tasks`;
  if (!soldier.roles.includes(role)) {
    return `${soldier.key} is not configured for the "${role}" role (it has: ${soldier.roles.join(", ")})`;
  }
  if (wantsWrite && (!adapter.capabilities.write || !soldier.write)) {
    return `${who} is read-only and can never be given write access`;
  }
  if (wantsWrite && role !== "build") {
    return `write access is only granted for the build role, not "${role}"`;
  }
  return undefined;
}

/** Rules for `summon`: the hard rules, plus orchestrate is the Monarch's job and not a task. */
export function checkAssignment(
  soldier: SoldierSpec,
  adapter: Adapter,
  role: Role,
  wantsWrite: boolean,
): Assignment {
  if (role === "orchestrate") {
    return { ok: false, reason: "orchestrate is the Monarch's role, not a task a soldier can be summoned for" };
  }
  const reason = whyNot(soldier, adapter, role, wantsWrite);
  return reason ? { ok: false, reason } : { ok: true, role, write: wantsWrite };
}
