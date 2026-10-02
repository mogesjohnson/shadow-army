import type { Autonomy, Role } from "../adapters/Adapter.js";
import type { WorkspaceInfo } from "../workspace/session.js";

/** Everything a soldier is told. Nothing else crosses the boundary. */
export interface Brief {
  task: string;
  role: Role;
  constraints: string[];
  /** Curated notes from the Shadow Vault (F4). */
  vaultNotes: string[];
  /** Reports from the tasks this one depends on (F7). Only the reports: never another soldier's transcript. */
  context?: string[];
  /** rules.md: what every soldier must follow. */
  rules?: string;
  /** This soldier's section of agent.md. */
  soldierRules?: string;
  /** Whether the soldier may modify files. */
  write: boolean;
}

/** What comes back from a soldier. The soldier's transcript stays private. */
export interface Report {
  soldier: string;
  role: Role;
  model: string;
  status: "ok" | "error";
  summary: string;
  filesTouched: string[];
  openQuestions: string[];
  notes: string[];
  /** false when the soldier did not return a parseable shadow-report block. */
  structured: boolean;
  error?: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  /** The model the CLI says actually answered. */
  resolvedModel?: string;
  /** Id of the run record saved in the Vault, when a vault was used. */
  runId?: string;
  /** Set when the vault could not be read or written; the report itself is still complete. */
  vaultError?: string;
  /** For write runs: the branch, what git says was touched, and what the audit reverted. */
  workspace?: WorkspaceInfo;
  /** The autonomy level the soldier actually ran at. */
  autonomy?: Autonomy;
  /** Why it differs from the configured level, if it does. */
  autonomyNote?: string;
  /** The checkout guard's findings: changes outside the soldier's own workspace. Any makes the task an error. */
  guard?: string[];
}
