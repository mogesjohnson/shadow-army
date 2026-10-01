import type { Adapter } from "./Adapter.js";
import { capture, detectByVersion } from "./exec.js";
import { parseGrokModels } from "./parsers.js";

export const grokAdapter: Adapter = {
  id: "grok",
  label: "Grok Build",
  command: "grok",
  // Hard rule from orchestratorDelegate.md: Grok never reviews.
  capabilities: { write: true, review: false },
  detect: () => detectByVersion("grok"),
  async listModels() {
    const r = await capture("grok", ["models"]);
    return { source: "cli", models: r.ok ? parseGrokModels(r.stdout) : [] };
  },
};
