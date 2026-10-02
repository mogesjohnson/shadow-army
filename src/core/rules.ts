import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Every brief carries these, so they are kept small enough to leave room for the task. */
export const MAX_RULES_CHARS = 4_000;
export const MAX_SOLDIER_RULES_CHARS = 2_000;

export interface Rules {
  /** rules.md: what every soldier must follow. */
  all: string;
  /** agent.md: rules for one soldier, by soldier key. */
  perSoldier: Map<string, string>;
}

export class RulesError extends Error {}

/** Drop a leading `# Title` line: it names the file, it is not a rule. */
const withoutTitle = (text: string) => text.replace(/^﻿?\s*#[^\n#][^\n]*\n/, "").trim();

/** agent.md: everything under `## <soldier>` belongs to that soldier; text before the first section is ignored. */
export function parseAgentRules(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = text.replace(/^﻿/, "").split(/^##[ \t]+(.+?)[ \t]*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i]!.trim();
    if (sections.has(key)) throw new RulesError(`agent.md has two "## ${key}" sections`);
    sections.set(key, (parts[i + 1] ?? "").trim());
  }
  return sections;
}

/** Strict checks: every section names a real soldier, and nothing is too long to fit in a brief. */
export function checkRules(rules: Rules, soldiers: Iterable<string>): string[] {
  const known = new Set(soldiers);
  const problems: string[] = [];
  if (rules.all.length > MAX_RULES_CHARS) {
    problems.push(`rules.md is ${rules.all.length} characters; the limit is ${MAX_RULES_CHARS}`);
  }
  for (const [key, text] of rules.perSoldier) {
    if (!known.has(key)) problems.push(`agent.md has a section for "${key}", which is not a soldier`);
    if (text.length > MAX_SOLDIER_RULES_CHARS) {
      problems.push(`agent.md section "${key}" is ${text.length} characters; the limit is ${MAX_SOLDIER_RULES_CHARS}`);
    }
  }
  return problems;
}

function readEither(cwd: string, name: string): string {
  const local = join(cwd, name);
  const bundled = fileURLToPath(new URL(`../../${name}`, import.meta.url));
  const path = existsSync(local) ? local : bundled;
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** rules.md and agent.md in the working directory win; otherwise the ones shipped with the package. */
export function loadRules(cwd = process.cwd()): Rules {
  return {
    all: withoutTitle(readEither(cwd, "rules.md")),
    perSoldier: parseAgentRules(readEither(cwd, "agent.md")),
  };
}
