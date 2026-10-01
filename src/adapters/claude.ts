import type { Adapter } from "./Adapter.js";
import { detectByVersion } from "./exec.js";

/** Claude Code has no model-list command; it accepts these aliases or full model IDs. */
const ALIASES = ["opus", "sonnet", "haiku"];

export const claudeAdapter: Adapter = {
  id: "claude",
  label: "Claude Code",
  command: "claude",
  capabilities: { write: true, review: true },
  detect: () => detectByVersion("claude"),
  async listModels() {
    return { source: "static", models: ALIASES.map((id) => ({ id })) };
  },
};
