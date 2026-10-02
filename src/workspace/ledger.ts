import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppliedFile } from "./apply.js";
import { git, indexEntries } from "./git.js";

/** One apply of a run's (or a summon's) work to the folder. */
export interface AppliedEntry {
  type: "applied";
  /** What `sa undo` takes: the run id for `sa run`, the branch name for `sa summon --write`. */
  id: string;
  kind: "run" | "summon";
  /** What the work started from, and the branch that holds it. */
  base: string;
  branch: string;
  /** The branch's commit at the time, so undo still works if the branch is later deleted or moved. */
  tip: string;
  /** HEAD at the time, to tell whether anything was committed since. */
  head: string;
  /** The index entries of the applied files as the apply left them, to tell whether any was staged since. */
  index: Record<string, string>;
  files: AppliedFile[];
  at: string;
}

export interface UndoneEntry {
  type: "undone";
  id: string;
  at: string;
}

export type LedgerEntry = AppliedEntry | UndoneEntry;

/** The ledger lives in the Shadow Vault's folder, which ignores itself, so it is never committed. */
export const ledgerPath = (shadowRoot: string) => join(shadowRoot, "applied.jsonl");

const append = (shadowRoot: string, entry: LedgerEntry) => appendFile(ledgerPath(shadowRoot), `${JSON.stringify(entry)}\n`, "utf8");

/** Record that a branch's work was applied to the folder at `root`. Throws if the ledger cannot be written. */
export async function recordApplied(
  root: string,
  shadowRoot: string,
  applied: { id: string; kind: AppliedEntry["kind"]; base: string; branch: string; files: AppliedFile[] },
): Promise<AppliedEntry> {
  const entry: AppliedEntry = {
    type: "applied",
    ...applied,
    tip: (await git(root, ["rev-parse", "--verify", `${applied.branch}^{commit}`])).trim(),
    head: (await git(root, ["rev-parse", "--verify", "HEAD^{commit}"])).trim(),
    index: await indexEntries(root, applied.files.map((f) => f.path)),
    at: new Date().toISOString(),
  };
  await append(shadowRoot, entry);
  return entry;
}

export const recordUndone = (shadowRoot: string, id: string) => append(shadowRoot, { type: "undone", id, at: new Date().toISOString() });

/** Every entry, oldest first. No ledger yet means no entries; a damaged line is skipped. */
export async function readLedger(shadowRoot: string): Promise<LedgerEntry[]> {
  let text: string;
  try {
    text = await readFile(ledgerPath(shadowRoot), "utf8");
  } catch {
    return [];
  }
  const entries: LedgerEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as LedgerEntry;
      if (e.type === "applied" || e.type === "undone") entries.push(e);
    } catch {
      // a half-written line is not worth failing the whole ledger for
    }
  }
  return entries;
}

/** The applies that have not been undone, oldest first. */
export function notUndone(entries: LedgerEntry[]): AppliedEntry[] {
  const undone = new Set(entries.filter((e) => e.type === "undone").map((e) => e.id));
  return entries.filter((e): e is AppliedEntry => e.type === "applied" && !undone.has(e.id));
}
