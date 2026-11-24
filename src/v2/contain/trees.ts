import { mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

/** PO-16: a process is named by its pid and its start time, so a reused pid never matches (PO-11). */
export interface Identity { pid: number; startTime: number }

/**
 * One line of a tree's file. It holds no secret and no nonce (PO-16). `git` is a harness git command's
 * entry (WSP-10): it runs in no job, so the sweep ends it by its own identity.
 */
export type TreeLine =
  | ({ kind: "post-office" } & Identity)
  | ({ kind: "guardian" } & Identity)
  | ({ kind: "cli" } & Identity)
  | ({ kind: "process" } & Identity)
  | ({ kind: "git" } & Identity)
  | { kind: "job"; label: string; coalition: string };

export const treesDir = (root: string): string => join(root, ".shadow", "v2", "trees");

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A parsed line, or `undefined` for one that is not a record this version writes. */
export function parseTreeLine(text: string): TreeLine | undefined {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return undefined; }
  if (typeof value !== "object" || value === null) return undefined;
  const line = value as Record<string, unknown>;
  if (line.kind === "job") {
    return typeof line.label === "string" && typeof line.coalition === "string"
      ? { kind: "job", label: line.label, coalition: line.coalition } : undefined;
  }
  const kinds = ["post-office", "guardian", "cli", "process", "git"] as const;
  const kind = kinds.find((candidate) => candidate === line.kind);
  return kind && isCount(line.pid) && line.pid > 0 && isCount(line.startTime)
    ? { kind, pid: line.pid, startTime: line.startTime } : undefined;
}

/** A reader skips a line that doesn't parse, as for logs (PO-5). */
export function parseTreeFile(text: string): TreeLine[] {
  return text.split("\n").flatMap((line) => parseTreeLine(line) ?? []);
}

/** Every tree file under the folder, as `{ id, lines }`. A file that can't be read is skipped. */
export async function readTrees(root: string): Promise<{ id: string; lines: TreeLine[] }[]> {
  const directory = treesDir(root);
  let names: string[];
  try { names = await readdir(directory); } catch { return []; }
  const trees = await Promise.all(names.filter((name) => name.endsWith(".jsonl")).map(async (name) => {
    try { return { id: name.slice(0, -".jsonl".length), lines: parseTreeFile(await readFile(join(directory, name), "utf8")) }; } catch { return undefined; }
  }));
  return trees.filter((tree): tree is { id: string; lines: TreeLine[] } => tree !== undefined);
}

const sameIdentity = (a: Identity, b: Identity): boolean => a.pid === b.pid && a.startTime === b.startTime;

/** One tree's entry under `.shadow/v2/trees/`: one JSON Lines file, each line flushed as it is written (PO-16). */
export class TreeRecord {
  private readonly listed: Identity[] = [];
  private reported = false;

  private constructor(private readonly file: string, private readonly onListingFailure: (error: unknown) => void) {}

  /**
   * Writes the post office's identity, and the guardian's if known, before the CLI starts. A failure
   * throws: the CLI must not start, and the caller reports the containment failure (PO-15).
   */
  static async create(
    root: string, id: string, postOffice: Identity, guardian?: Identity,
    onListingFailure: (error: unknown) => void = () => {},
  ): Promise<TreeRecord> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id)) throw new Error("invalid tree id");
    await mkdir(treesDir(root), { recursive: true });
    const record = new TreeRecord(join(treesDir(root), `${id}.jsonl`), onListingFailure);
    await record.append({ kind: "post-office", ...postOffice }, "wx");
    if (guardian) await record.add({ kind: "guardian", ...guardian });
    return record;
  }

  private async append(line: TreeLine, flag: "a" | "wx" = "a"): Promise<void> {
    const handle = await open(this.file, flag, 0o600);
    try {
      await handle.appendFile(`${JSON.stringify(line)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  /** Adds a line, such as the CLI's identity once it has started, or a macOS job. A failure throws. */
  add(line: TreeLine): Promise<void> { return this.append(line); }

  /**
   * Adds each process of a listing that is not yet recorded (PO-11). A line that can't be added is reported
   * once, as PO-5 says for a log write that fails; it does not stop the session.
   */
  async listing(processes: readonly Identity[]): Promise<void> {
    for (const process of processes) {
      if (this.listed.some((known) => sameIdentity(known, process))) continue;
      try {
        await this.append({ kind: "process", pid: process.pid, startTime: process.startTime });
        this.listed.push({ pid: process.pid, startTime: process.startTime });
      } catch (error) {
        if (!this.reported) { this.reported = true; this.onListingFailure(error); }
      }
    }
  }

  /** The entry is removed once the tree has ended. */
  async remove(): Promise<void> {
    try { await unlink(this.file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}
