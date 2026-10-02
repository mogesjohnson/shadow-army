import { createHash, randomBytes } from "node:crypto";
import { access, link, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Report } from "../core/types.js";

export type NoteStatus = "proposed" | "accepted" | "rejected";

export interface Note {
  id: string;
  text: string;
  /** A soldier name, or "you" for notes added by hand. */
  source: string;
  status: NoteStatus;
  createdAt: string;
  runId?: string;
}

/** What is kept about a run: the brief's essentials and the report. Never the soldier's transcript. */
export interface RunRecord {
  id: string;
  createdAt: string;
  soldier: string;
  task: string;
  role: string;
  write: boolean;
  report: Report;
}

export const MAX_NOTE_CHARS = 500;
/** Upper bound on accepted-note text injected into one brief. */
export const DEFAULT_NOTES_BUDGET = 4000;

export class VaultError extends Error {}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Names and ids become path segments, so refuse anything that could point outside the vault. */
function assertSafe(kind: string, value: string): void {
  if (!SAFE_NAME.test(value) || value.includes("..")) {
    throw new VaultError(`invalid ${kind} ${JSON.stringify(value)}`);
  }
}

async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, data, "utf8");
    await rename(tmp, path);
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

/**
 * Publish `data` at `path` only if nothing is there yet; returns false if another writer got there first.
 * The content goes to a temp file and is then hard-linked into place. That is atomic and fails with
 * EEXIST for every writer but one, so readers never see a half-written file and concurrent writers
 * cannot both succeed.
 */
async function writeNew(path: string, data: string): Promise<boolean> {
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, data, "utf8");
    await link(tmp, path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw e;
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

const missing = (e: unknown): boolean => (e as NodeJS.ErrnoException).code === "ENOENT";

function parseNote(json: string, id: string): Note | undefined {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const note = value as Record<string, unknown>;
  if (
    note.id !== id ||
    typeof note.text !== "string" ||
    typeof note.source !== "string" ||
    typeof note.createdAt !== "string" ||
    !["proposed", "accepted", "rejected"].includes(String(note.status))
  ) return undefined;
  return note as unknown as Note;
}

async function readNote(path: string, id: string): Promise<Note | undefined> {
  try {
    return parseNote(await readFile(path, "utf8"), id);
  } catch (e) {
    if (missing(e)) return undefined;
    throw e;
  }
}

function parseRun(json: string, id: string): RunRecord | undefined {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const run = value as Record<string, unknown>;
  if (!run.report || typeof run.report !== "object") return undefined;
  const report = run.report as Record<string, unknown>;
  if (
    run.id !== id ||
    typeof run.createdAt !== "string" ||
    typeof run.soldier !== "string" ||
    typeof run.task !== "string" ||
    typeof run.role !== "string" ||
    typeof run.write !== "boolean" ||
    !["ok", "error"].includes(String(report.status)) ||
    (report.costUsd !== undefined && typeof report.costUsd !== "number")
  ) return undefined;
  return run as unknown as RunRecord;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

export class Vault {
  constructor(readonly root: string) {}

  /** The vault for a project lives in `<project>/.shadow`. */
  static forCwd(cwd: string): Vault {
    return new Vault(join(cwd, ".shadow"));
  }

  private get notesDir() {
    return join(this.root, "shared", "notes");
  }
  private get runsDir() {
    return join(this.root, "runs");
  }

  private async ensure(): Promise<void> {
    await mkdir(this.notesDir, { recursive: true });
    await mkdir(this.runsDir, { recursive: true });
    await mkdir(join(this.root, "soldiers"), { recursive: true });
    // The vault is working memory, not source: never let it be committed to the user's project.
    const ignore = join(this.root, ".gitignore");
    if (!(await exists(ignore))) await writeFile(ignore, "*\n", "utf8");
  }

  /** A soldier's private directory. Only that soldier's own adapter should ever be pointed at it. */
  async soldierDir(soldier: string): Promise<string> {
    assertSafe("soldier name", soldier);
    await this.ensure();
    const dir = join(this.root, "soldiers", soldier);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * Add a note. An identical note (any status) is not added twice, so a note you rejected
   * does not keep coming back and an accepted one is not duplicated; the existing note is returned.
   *
   * The note's id is a hash of its normalized text and the file is created exclusively, so identical
   * notes converge on one file even when many are added at the same moment.
   */
  async addNote(input: { text: string; source: string; status: NoteStatus; runId?: string }): Promise<Note> {
    assertSafe("note source", input.source);
    let text = input.text.trim();
    if (!text) throw new VaultError("a note cannot be empty");
    if (text.length > MAX_NOTE_CHARS) text = `${text.slice(0, MAX_NOTE_CHARS - 1)}…`;

    await this.ensure();
    const key = normalize(text);
    // Notes written before content-addressed IDs were introduced still count as duplicates.
    const old = (await this.listNotes()).find((n) => normalize(n.text) === key);
    if (old) return old;
    const hash = createHash("sha256").update(key).digest("hex");

    // A longer id is only tried if a different text happens to share the shorter prefix.
    for (let len = 12; len <= 64; len += 12) {
      const note: Note = {
        id: `n-${hash.slice(0, len)}`,
        text,
        source: input.source,
        status: input.status,
        createdAt: new Date().toISOString(),
        ...(input.runId ? { runId: input.runId } : {}),
      };
      const path = join(this.notesDir, `${note.id}.json`);
      if (await writeNew(path, JSON.stringify(note, null, 2))) return note;
      const existing = await readNote(path, note.id);
      if (existing && normalize(existing.text) === key) return existing;
      if (!existing) throw new VaultError(`cannot read existing note: ${note.id}`);
    }
    throw new VaultError("could not allocate a note id");
  }

  /** All notes, oldest first. Malformed files are skipped; I/O errors are reported. */
  async listNotes(status?: NoteStatus): Promise<Note[]> {
    let files: string[];
    try {
      files = await readdir(this.notesDir);
    } catch (e) {
      if (missing(e)) return [];
      throw e;
    }
    const notes: Note[] = [];
    for (const f of files.filter((f) => f.endsWith(".json"))) {
      const note = await readNote(join(this.notesDir, f), f.slice(0, -5));
      if (note) notes.push(note);
    }
    notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return status ? notes.filter((n) => n.status === status) : notes;
  }

  async setNoteStatus(id: string, status: NoteStatus): Promise<Note> {
    assertSafe("note id", id);
    const path = join(this.notesDir, `${id}.json`);
    const note = await readNote(path, id);
    if (!note) throw new VaultError(`no such note: ${id}`);
    const updated = { ...note, status };
    await writeAtomic(path, JSON.stringify(updated, null, 2));
    return updated;
  }

  /**
   * The only vault content that ever reaches a soldier: accepted notes, newest preferred when the
   * budget is tight, returned in the order they were written.
   */
  async acceptedNotes(budget = DEFAULT_NOTES_BUDGET): Promise<string[]> {
    const accepted = await this.listNotes("accepted");
    const picked: string[] = [];
    let used = 0;
    for (const n of accepted.reverse()) {
      if (used + n.text.length > budget) break;
      picked.push(n.text);
      used += n.text.length;
    }
    return picked.reverse();
  }

  async saveRun(input: Omit<RunRecord, "id" | "createdAt">): Promise<RunRecord> {
    assertSafe("soldier name", input.soldier);
    await this.ensure();
    for (let attempt = 0; attempt < 3; attempt++) {
      const record: RunRecord = {
        ...input,
        id: `${stamp()}-${input.soldier}-${randomBytes(8).toString("hex")}`,
        createdAt: new Date().toISOString(),
      };
      if (await writeNew(join(this.runsDir, `${record.id}.json`), JSON.stringify(record, null, 2))) return record;
    }
    throw new VaultError("could not allocate a run id");
  }

  /** Newest first. */
  async listRuns(limit?: number): Promise<RunRecord[]> {
    let files: string[];
    try {
      files = await readdir(this.runsDir);
    } catch (e) {
      if (missing(e)) return [];
      throw e;
    }
    const runs: RunRecord[] = [];
    for (const f of files.filter((f) => f.endsWith(".json"))) {
      try {
        const run = parseRun(await readFile(join(this.runsDir, f), "utf8"), f.slice(0, -5));
        if (run) runs.push(run);
      } catch (e) {
        if (!missing(e)) throw e;
      }
    }
    runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return limit ? runs.slice(0, limit) : runs;
  }

  async getRun(id: string): Promise<RunRecord> {
    assertSafe("run id", id);
    let run: RunRecord | undefined;
    try {
      run = parseRun(await readFile(join(this.runsDir, `${id}.json`), "utf8"), id);
    } catch (e) {
      if (!missing(e)) throw e;
    }
    if (!run) throw new VaultError(`no such run: ${id}`);
    return run;
  }
}
