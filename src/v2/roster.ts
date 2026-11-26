import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../core/config.js";
import { loadDelegateV2 } from "../core/delegate.js";
import { buildRoster, RosterError, type Roster } from "../core/roster.js";
import { loadRules, RulesError, type Rules } from "../core/rules.js";

/** ARM-3: the shadow names 2.0 sets by default. */
export const DEFAULT_SHADOW_NAMES: Readonly<Record<string, string>> = {
  "codex-astra": "Bellion",
  "codex-sol": "Igris",
  "claude-opus": "Kaisel",
  "claude-opus-build": "Tank",
  "claude-sonnet": "Iron",
  grok: "Beru",
  agy: "Tusk",
};

/** A soldier's default name, or its key when it has none. Ignores `shadowName` overrides. */
export function shadowName(key: string): string {
  return Object.hasOwn(DEFAULT_SHADOW_NAMES, key) ? DEFAULT_SHADOW_NAMES[key]! : key;
}

/**
 * ARM-3: resolve every soldier's name from its `shadowName` (when configured), else its default,
 * else its key. Names are unique without regard to case, and no name is another soldier's key.
 * A clash is refused, naming both soldiers.
 */
export function resolveShadowNames(keys: readonly string[], configured: Readonly<Record<string, string | undefined>> = {}): Map<string, string> {
  const names = new Map<string, string>();
  const problems: string[] = [];
  for (const key of keys) {
    const own = Object.hasOwn(configured, key) ? configured[key] : undefined;
    if (own !== undefined && own.trim() === "") {
      problems.push(`"${key}" has an empty shadowName`);
      continue;
    }
    names.set(key, own?.trim() ?? shadowName(key));
  }
  const byName = new Map<string, string>();
  const byKey = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const [key, name] of names) {
    const lower = name.toLowerCase();
    const sameName = byName.get(lower);
    if (sameName !== undefined) {
      problems.push(`shadow name "${name}" is taken by both "${sameName}" and "${key}" (names are unique in any case)`);
    } else {
      byName.set(lower, key);
    }
    const owner = byKey.get(lower);
    if (owner !== undefined && owner !== key) {
      problems.push(`shadow name "${name}" of "${key}" is the key of soldier "${owner}"`);
    }
  }
  if (problems.length) throw new RosterError(`shadow names clash:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  return names;
}

/** Read each soldier's `shadowName` from shadow.config.json (the same file `loadConfig` picks). */
export function loadConfiguredShadowNames(cwd = process.cwd()): Record<string, string> {
  const local = join(cwd, "shadow.config.json");
  const bundled = fileURLToPath(new URL("../../shadow.config.json", import.meta.url));
  const raw: unknown = JSON.parse(readFileSync(existsSync(local) ? local : bundled, "utf8"));
  const soldiers = (raw as { soldiers?: Record<string, { shadowName?: unknown }> } | null)?.soldiers ?? {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(soldiers)) {
    const value = entry?.shadowName;
    if (value === undefined) continue;
    if (typeof value !== "string") throw new RosterError(`"${key}" has a shadowName that is not a string`);
    out[key] = value;
  }
  return out;
}

export interface V2Roster {
  roster: Roster;
  /** Soldier key to shadow name. */
  names: ReadonlyMap<string, string>;
}

/**
 * Load the roster and the shadow names at start (ARM-1, ARM-3, M1-AC6). Throws `RosterError` when the two
 * config files list different soldiers or when a shadow name clashes. Claude is the Monarch: the delegate is
 * parsed by `loadDelegateV2`, which ignores the legacy `monarch` block (absent, stale or valid) and the
 * `orchestrate` role, and `roster.monarch` is an empty placeholder no v2 code reads.
 */
export function loadV2Roster(cwd = process.cwd()): V2Roster {
  let rules: Rules;
  try {
    rules = loadRules(cwd);
  } catch (e) {
    if (e instanceof RulesError) throw new RosterError(e.message);
    throw e;
  }
  const delegate = loadDelegateV2(cwd);
  const roster = buildRoster(loadConfig(cwd), { guide: delegate.guide, policy: { soldiers: delegate.policy.soldiers, monarch: { default: "" } } }, rules);
  return { roster, names: resolveShadowNames([...roster.soldiers.keys()], loadConfiguredShadowNames(cwd)) };
}
