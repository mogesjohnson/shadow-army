import type { Adapter } from "./Adapter.js";
import { capture, detectByVersion } from "./exec.js";
import { parseCodexModels } from "./parsers.js";

export const codexAdapter: Adapter = {
  id: "codex",
  label: "Codex CLI",
  command: "codex",
  capabilities: { write: true, review: true },
  detect: () => detectByVersion("codex"),
  async listModels() {
    const r = await capture("codex", ["debug", "models"]);
    return { source: "cli", models: r.ok ? parseCodexModels(r.stdout) : [] };
  },
};
