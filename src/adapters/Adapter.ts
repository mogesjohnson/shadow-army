export type Role = "orchestrate" | "build" | "review" | "research" | "test";

export interface Capabilities {
  /** May the soldier modify files? */
  write: boolean;
  /** May the soldier be assigned reviews? */
  review: boolean;
}

export interface ModelInfo {
  id: string;
  label?: string;
}

export interface Detection {
  found: boolean;
  version?: string;
}

export interface ModelList {
  models: ModelInfo[];
  /** "cli" when read from the CLI itself, "static" when the CLI offers no listing command. */
  source: "cli" | "static";
}

export interface Adapter {
  /** CLI family id, e.g. "codex". Several soldiers can share one adapter. */
  readonly id: string;
  readonly label: string;
  /** The executable looked up on PATH. */
  readonly command: string;
  /** What this CLI can do at all; the roster (orchestratorDelegate.md) can restrict further. */
  readonly capabilities: Capabilities;
  detect(): Promise<Detection>;
  listModels(): Promise<ModelList>;
}
