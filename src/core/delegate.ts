import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const ROLES = ["orchestrate", "build", "review", "research", "test"] as const;
const Role = z.enum(ROLES);
const Difficulty = z.enum(["routine", "hard"]);

export type Difficulty = z.infer<typeof Difficulty>;

/**
 * Routing policy for one soldier. `.strict()` everywhere: these are safety rules, so a misspelled key
 * (say `forbiden`) must be an error and not a rule that silently does nothing.
 */
const SoldierPolicy = z
  .object({
    roles: z.array(Role).min(1),
    /** Relative price: 1 cheap, 3 expensive. Routine work goes to the cheapest soldier that qualifies. */
    cost: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
    /** If set, the soldier takes build tasks only of these difficulties. */
    buildFor: z.array(Difficulty).min(1).optional(),
    /** Roles this soldier must never be given, whatever else says otherwise. */
    forbidden: z.array(Role).default([]),
    /** false = never given write access. */
    write: z.boolean().default(true),
  })
  .strict();

type Role = z.infer<typeof Role>;
const MonarchBlock = z.object({ default: z.string(), fallback: z.string().optional() }).strict();
type Soldiers = Record<string, z.infer<typeof SoldierPolicy>>;

/** The checks on each soldier's own policy. Shared by v1 and v2: neither may skip a hard rule. */
function checkSoldiers(soldiers: Soldiers, add: (message: string) => void, ignore?: Role): void {
  for (const [key, s] of Object.entries(soldiers)) {
    for (const r of s.forbidden) {
      if (r === ignore) continue;
      if (s.roles.includes(r)) add(`${key}: "${r}" is both granted in roles and listed in forbidden`);
    }
    if (!s.write && s.roles.includes("build")) {
      add(`${key}: write is false, so it cannot have the build role`);
    }
    if (s.buildFor && !s.roles.includes("build")) {
      add(`${key}: buildFor is set but the soldier does not have the build role`);
    }
  }
}

export const PolicySchema = z
  .object({
    monarch: MonarchBlock,
    soldiers: z.record(z.string(), SoldierPolicy),
  })
  .strict()
  .superRefine((p, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: "custom", message });
    checkSoldiers(p.soldiers, add);
    for (const [label, key] of [
      ["monarch.default", p.monarch.default],
      ["monarch.fallback", p.monarch.fallback],
    ] as const) {
      if (key === undefined) continue;
      const s = p.soldiers[key];
      if (!s) add(`${label} "${key}" is not a soldier in this file`);
      else if (!s.roles.includes("orchestrate")) add(`${label} "${key}" does not have the orchestrate role`);
    }
  });

/**
 * The 2.0 policy: Claude Code is the Monarch, so a legacy `monarch` block may be absent, and when present
 * it is not read at all (its shape, its references and the `orchestrate` role are all ignored, and the
 * role is removed from every soldier). Every other soldier check is the v1 one, and the keys stay strict.
 */
export const V2PolicySchema = z
  .object({
    monarch: z.unknown().optional(),
    soldiers: z.record(z.string(), SoldierPolicy),
  })
  .strict()
  .superRefine((p, ctx) =>
    checkSoldiers(p.soldiers, (message) => ctx.addIssue({ code: "custom", message }), "orchestrate"),
  )
  .transform(({ soldiers }) => ({
    // The legacy `orchestrate` role means nothing in 2.0: project it out of what v2 callers see.
    soldiers: Object.fromEntries(
      Object.entries(soldiers).map(([k, s]) => [
        k,
        {
          ...s,
          roles: s.roles.filter((r) => r !== "orchestrate"),
          forbidden: s.forbidden.filter((r) => r !== "orchestrate"),
        },
      ]),
    ) as Soldiers,
  }));

export type DelegatePolicy = z.infer<typeof PolicySchema>;
export type DelegatePolicyV2 = z.infer<typeof V2PolicySchema>;
export type SoldierPolicy = z.infer<typeof SoldierPolicy>;

export interface Delegate<P = DelegatePolicy> {
  policy: P;
  /** The prose after the front-matter: judgment guidance for the Monarch (used from F7). */
  guide: string;
}
export type DelegateV2 = Delegate<DelegatePolicyV2>;

export class DelegateError extends Error {}

const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

function parseWith<S extends z.ZodType>(markdown: string, schema: S): Delegate<z.infer<S>> {
  const m = FRONT_MATTER.exec(markdown);
  if (!m) throw new DelegateError("orchestratorDelegate.md must start with a YAML front-matter block between --- lines");

  let raw: unknown;
  try {
    raw = parseYaml(m[1]!);
  } catch (e) {
    throw new DelegateError(`front-matter is not valid YAML: ${(e as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`);
    throw new DelegateError(`invalid orchestratorDelegate.md front-matter:\n${lines.join("\n")}`);
  }
  return { policy: parsed.data, guide: m[2]!.trim() };
}

export function parseDelegate(markdown: string): Delegate {
  return parseWith(markdown, PolicySchema);
}

/** The 2.0 parse: see `V2PolicySchema`. v1 callers keep `parseDelegate`. */
export function parseDelegateV2(markdown: string): DelegateV2 {
  return parseWith(markdown, V2PolicySchema);
}

/** orchestratorDelegate.md in the working directory wins; otherwise the one shipped with the package. */
function delegateText(cwd: string): string {
  const local = join(cwd, "orchestratorDelegate.md");
  const bundled = fileURLToPath(new URL("../../orchestratorDelegate.md", import.meta.url));
  return readFileSync(existsSync(local) ? local : bundled, "utf8");
}

export function loadDelegate(cwd = process.cwd()): Delegate {
  return parseDelegate(delegateText(cwd));
}

export function loadDelegateV2(cwd = process.cwd()): DelegateV2 {
  return parseDelegateV2(delegateText(cwd));
}
