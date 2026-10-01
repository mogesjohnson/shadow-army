import type { Adapter } from "./Adapter.js";
import { capture, detectByVersion } from "./exec.js";
import { parseAgyModels } from "./parsers.js";

export const agyAdapter: Adapter = {
  id: "agy",
  label: "Antigravity",
  command: "agy",
  // Hard rule from orchestratorDelegate.md: research and testing only, no writes.
  capabilities: { write: false, review: false },
  detect: () => detectByVersion("agy"),
  async listModels() {
    const r = await capture("agy", ["models"]);
    return { source: "cli", models: r.ok ? parseAgyModels(r.stdout) : [] };
  },
};
