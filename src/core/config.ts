import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const Role = z.enum(["orchestrate", "build", "review", "research", "test"]);

const SoldierConfig = z.object({
  cli: z.string().min(1),
  model: z.string().min(1),
  roles: z.array(Role).min(1),
});

export const ConfigSchema = z
  .object({
    monarch: z.object({ default: z.string(), fallback: z.string().optional() }),
    soldiers: z.record(z.string(), SoldierConfig),
  })
  .superRefine((cfg, ctx) => {
    for (const key of [cfg.monarch.default, cfg.monarch.fallback]) {
      if (key && !(key in cfg.soldiers)) {
        ctx.addIssue({ code: "custom", message: `monarch "${key}" is not a configured soldier` });
      }
    }
  });

export type ShadowConfig = z.infer<typeof ConfigSchema>;
export type SoldierConfig = z.infer<typeof SoldierConfig>;

export function parseConfig(json: string): ShadowConfig {
  return ConfigSchema.parse(JSON.parse(json));
}

/** shadow.config.json in the working directory wins; otherwise the one shipped with the package. */
export function loadConfig(cwd = process.cwd()): ShadowConfig {
  const local = join(cwd, "shadow.config.json");
  const bundled = fileURLToPath(new URL("../../shadow.config.json", import.meta.url));
  const path = existsSync(local) ? local : bundled;
  return parseConfig(readFileSync(path, "utf8"));
}
