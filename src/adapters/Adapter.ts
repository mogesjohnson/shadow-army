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

export type Effort = "low" | "medium" | "high" | "max";

/**
 * How freely a soldier acts, set per soldier in shadow.config.json. What it may actually run is decided
 * by the vendor's own controls at each level:
 *  supervised  the CLI's guarded modes (plan / accept-edits / sandbox); commands that need approval are refused
 *  auto        the vendor's own classifier or auto-review decides each action
 *  full        the vendor's unrestricted mode: no approval at all
 */
export type Autonomy = "supervised" | "auto" | "full";

export interface RunRequest {
  prompt: string;
  model: string;
  /** Directory the soldier works in. */
  cwd: string;
  /** false = read-only (plan mode / read-only sandbox). Adapters that cannot write ignore true. */
  write: boolean;
  /** Default: supervised. Under `auto` and `full`, `write` no longer limits the CLI; Shadow Army isolates read-only work instead. */
  autonomy?: Autonomy;
  effort?: Effort;
  timeoutMs: number;
}

export interface RunUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface RunResult {
  /** The soldier's final answer text. */
  text: string;
  isError: boolean;
  errorMessage?: string;
  usage?: RunUsage;
  costUsd?: number;
  sessionId?: string;
  /** The model the CLI says actually answered, when it reports one. */
  resolvedModel?: string;
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
  /** Run one headless turn. Never throws for CLI failures; returns isError instead. */
  run(req: RunRequest): Promise<RunResult>;
}
