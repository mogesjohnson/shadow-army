import type { Adapter } from "./Adapter.js";
import { detectByVersion } from "./exec.js";

/** Claude Code has no model-list command; it accepts these aliases or full model IDs. */
const ALIASES = [
  { id: "opus", label: "Opus 5.5" },
  { id: "sonnet", label: "Sonnet 5.5" },
  { id: "haiku", label: "Haiku 4.5" },
];

export const claudeAdapter: Adapter = {
  id: "claude",
  label: "Claude Code",
  command: "claude",
  capabilities: { write: true, review: true },
  detect: () => detectByVersion("claude"),
  async listModels() {
    return { source: "static", models: ALIASES };
  },
};
