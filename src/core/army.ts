import type { Adapter, Detection, ModelList } from "../adapters/Adapter.js";
import { allAdapters } from "../adapters/registry.js";
import type { ShadowConfig } from "./config.js";

export type ModelStatus = "ok" | "unknown" | "unlisted" | "n/a";

export interface SoldierStatus {
  soldier: string;
  cli: string;
  found: boolean;
  version?: string;
  model: string;
  modelStatus: ModelStatus;
  roles: string[];
  write: boolean;
  review: boolean;
}

interface Probe {
  det: Detection;
  list: ModelList;
}

/**
 * Check every configured soldier against its CLI.
 *  ok       the model is in the CLI's own list
 *  unknown  the CLI listed models but this one is not among them
 *  unlisted the CLI has no list command (static aliases), so the model cannot be verified
 *  n/a      the CLI is not installed
 */
export async function checkArmy(
  config: ShadowConfig,
  adapters: Adapter[] = allAdapters(),
): Promise<SoldierStatus[]> {
  const byId = new Map(adapters.map((a) => [a.id, a]));
  // Soldiers can share a CLI (two codex soldiers), so probe each CLI once.
  const cache = new Map<string, Promise<Probe>>();

  const probe = (a: Adapter): Promise<Probe> => {
    let p = cache.get(a.id);
    if (!p) {
      p = a.detect().then(async (det) => ({
        det,
        list: det.found ? await a.listModels() : { models: [], source: "cli" as const },
      }));
      cache.set(a.id, p);
    }
    return p;
  };

  return Promise.all(
    Object.entries(config.soldiers).map(async ([soldier, s]): Promise<SoldierStatus> => {
      const adapter = byId.get(s.cli);
      if (!adapter) {
        return { soldier, cli: s.cli, found: false, model: s.model, modelStatus: "n/a", roles: s.roles, write: false, review: false };
      }
      const { det, list } = await probe(adapter);
      let modelStatus: ModelStatus = "n/a";
      if (det.found) {
        if (list.source === "static") modelStatus = "unlisted";
        else modelStatus = list.models.some((m) => m.id === s.model) ? "ok" : "unknown";
      }
      return {
        soldier,
        cli: s.cli,
        found: det.found,
        version: det.version,
        model: s.model,
        modelStatus,
        roles: s.roles,
        write: adapter.capabilities.write,
        review: adapter.capabilities.review,
      };
    }),
  );
}

export function renderArmy(rows: SoldierStatus[]): string {
  const head = ["SOLDIER", "CLI", "VERSION", "MODEL", "MODEL CHECK", "ROLES"];
  const body = rows.map((r) => [
    r.soldier,
    r.found ? r.cli : `${r.cli} (missing)`,
    r.version ?? "-",
    r.model,
    r.modelStatus,
    r.roles.join(","),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i]!.length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();
  return [fmt(head), fmt(widths.map((w) => "-".repeat(w))), ...body.map(fmt)].join("\n");
}
