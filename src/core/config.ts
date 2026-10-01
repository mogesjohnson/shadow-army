import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Runtime settings only: which CLI and model each soldier uses. Who may do what lives in
 * orchestratorDelegate.md; the two are merged into a roster (see roster.ts).
 */
const SoldierConfig = z.object({
  cli: z.string().min(1),
  model: z.string().min(1),
});

export const ConfigSchema = z.object({
  soldiers: z.record(z.string(), SoldierConfig),
});

export type ShadowConfig = z.infer<typeof ConfigSchema>;
export type SoldierConfig = z.infer<typeof SoldierConfig>;

export class ConfigError extends Error {}

export function parseConfig(json: string): ShadowConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new ConfigError(`shadow.config.json is not valid JSON: ${(e as Error).message}`);
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new ConfigError(`invalid shadow.config.json:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

/** shadow.config.json in the working directory wins; otherwise the one shipped with the package. */
export function loadConfig(cwd = process.cwd()): ShadowConfig {
  const local = join(cwd, "shadow.config.json");
  const bundled = fileURLToPath(new URL("../../shadow.config.json", import.meta.url));
  const path = existsSync(local) ? local : bundled;
  return parseConfig(readFileSync(path, "utf8"));
}
