// ARM-7's trust store: the hashes the owner accepted for a folder's own policy files, kept per repository in
// `~/.shadow-army/trust/`, never in the folder. Nothing here shows the card; it hashes, compares and records.
import { createHash, randomBytes } from "node:crypto";
import { link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { z } from "zod";

export const POLICY_FILES = ["shadow.config.json", "orchestratorDelegate.md", "rules.md", "agent.md", ".mcp.json"] as const;
export type PolicyFile = (typeof POLICY_FILES)[number];

export interface PolicyFileRead { name: PolicyFile; bytes: Buffer; hash: string }
export interface Untrusted { name: PolicyFile; status: "new" | "changed" | "gone"; hash: string | null }
export interface McpServer { name: string; target: string }

export interface TrustDeps {
  /** The user's home directory. Injected so that tests never touch the real one. */
  home: string;
  platform?: NodeJS.Platform;
  log?: (message: string) => void;
  /** Test seams: the file operations a commit uses, a pause before each attempt's commit, and the lock wait. */
  io?: Partial<TrustIo>;
  beforeCommit?: (attempt: number) => Promise<void>;
  lockWaitMs?: number;
}
const realIo = { link, readFile, rename, rm, writeFile };
type TrustIo = typeof realIo;

const recordSchema = z.object({
  version: z.literal(1),
  commonDir: z.string(),
  accepted: z.record(z.string(), z.array(z.string())),
  worktrees: z.record(z.string(), z.record(z.string(), z.string())),
});
export type TrustRecord = z.infer<typeof recordSchema>;

export const MAX_ATTEMPTS = 5;
export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Reads each policy file at the folder's top level once and hashes those same bytes. Absent files are left out. */
export async function readPolicyFiles(folder: string): Promise<PolicyFileRead[]> {
  const read: PolicyFileRead[] = [];
  for (const name of POLICY_FILES) {
    let bytes: Buffer;
    try { bytes = await readFile(join(folder, name)); } catch (error) {
      if (code(error) === "ENOENT") continue;
      throw error;
    }
    read.push({ name, bytes, hash: sha256(bytes) });
  }
  return read;
}

/** The servers a `.mcp.json` declares, each with its command line or its URL. Unparseable bytes declare none. */
export function mcpServers(bytes: Buffer | string): McpServer[] {
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString()); } catch { return []; }
  const servers = (parsed as { mcpServers?: unknown } | null)?.mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
  return Object.entries(servers as Record<string, unknown>).map(([name, value]) => {
    const server = (value ?? {}) as { command?: unknown; args?: unknown; url?: unknown };
    if (typeof server.url === "string") return { name, target: server.url };
    const args = Array.isArray(server.args) ? server.args.map(String) : [];
    return { name, target: [typeof server.command === "string" ? server.command : "", ...args].join(" ").trim() };
  });
}

/** The repository's common git directory, as `git rev-parse` prints it, lower-cased on Windows (as WSP-11's mark). */
export async function gitCommonDir(folder: string, platform: NodeJS.Platform = process.platform): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder });
  return normalizeCommonDir(stdout, platform);
}

export function normalizeCommonDir(path: string, platform: NodeJS.Platform = process.platform): string {
  const trimmed = path.replace(/\r?\n$/, "");
  return platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

export function recordPath(home: string, commonDir: string): string {
  return join(home, ".shadow-army", "trust", `${sha256(Buffer.from(commonDir, "utf8")).slice(0, 12)}.json`);
}
interface Loaded { record: TrustRecord | null; raw: string | null }

async function load(deps: TrustDeps, commonDir: string): Promise<Loaded> {
  const path = recordPath(deps.home, commonDir);
  let raw: string;
  try { raw = await readFile(path, "utf8"); } catch (error) {
    if (code(error) !== "ENOENT") deps.log?.(`trust record ${path} can't be read (${code(error) ?? String(error)}); it counts as none`);
    return { record: null, raw: null };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    deps.log?.(`trust record ${path} can't be parsed; it counts as none`);
    return { record: null, raw };
  }
  const result = recordSchema.safeParse(parsed);
  if (!result.success || result.data.commonDir !== commonDir) {
    deps.log?.(`trust record ${path} can't be parsed; it counts as none`);
    return { record: null, raw };
  }
  return { record: result.data, raw };
}

export async function readRecord(deps: TrustDeps, commonDir: string): Promise<TrustRecord | null> {
  return (await load(deps, commonDir)).record;
}
/**
 * The files the card must show for one working tree: present files whose hash was accepted in no working tree of
 * the repository, and files last trusted in this working tree that are now gone.
 */
export function untrustedFiles(record: TrustRecord | null, worktree: string, current: readonly { name: PolicyFile; hash: string }[]): Untrusted[] {
  const untrusted: Untrusted[] = [];
  for (const file of current) {
    const accepted = record?.accepted[file.name] ?? [];
    if (!accepted.includes(file.hash)) untrusted.push({ name: file.name, status: accepted.length > 0 ? "changed" : "new", hash: file.hash });
  }
  const present = new Set(current.map((file) => file.name));
  for (const name of POLICY_FILES) {
    if (!present.has(name) && record?.worktrees[worktree]?.[name] !== undefined) untrusted.push({ name, status: "gone", hash: null });
  }
  return untrusted;
}

/** Whether one file's bytes, as a session's snapshot or worktree holds them, were accepted anywhere in the repository. */
export function isAccepted(record: TrustRecord | null, name: PolicyFile, hash: string): boolean {
  return record?.accepted[name]?.includes(hash) ?? false;
}
export type AcceptResult = { ok: true; record: TrustRecord; warning?: string } | { ok: false; reason: string };
export type ObserveResult = { ok: true; record: TrustRecord | null; warning?: string } | { ok: false; reason: string };
type Input = { commonDir: string; worktree: string; shown: readonly Untrusted[]; current: readonly { name: PolicyFile; hash: string }[] };

/**
 * Records exactly the hashes the card showed, for every working tree of the repository. `current` is this working
 * tree's present files as the card saw them; they become its last-trusted list. The record is read again just
 * before each write, merged, never stripped of another working tree's entries, and replaced by one rename of a
 * file written beside it. A rename that finds the record changed since the read retries, up to MAX_ATTEMPTS times.
 */
export async function accept(deps: TrustDeps, input: Input): Promise<AcceptResult> {
  return commit(deps, input.commonDir, (base) => merge(base, input)) as Promise<AcceptResult>;
}

/**
 * Adds to this working tree's last-trusted list the present files whose hashes are already accepted, as a check
 * with no card finds them, so a file trusted here and later deleted shows as gone. It accepts no hash and removes
 * no entry, and writes nothing when the list wouldn't change.
 */
export async function observe(deps: TrustDeps, input: Omit<Input, "shown">): Promise<ObserveResult> {
  return commit(deps, input.commonDir, (base) => {
    if (!base) return null;
    const list = { ...base.worktrees[input.worktree] };
    let changed = false;
    for (const file of input.current) {
      if (base.accepted[file.name]?.includes(file.hash) && list[file.name] !== file.hash) { list[file.name] = file.hash; changed = true; }
    }
    return changed ? { ...base, worktrees: { ...base.worktrees, [input.worktree]: list } } : null;
  });
}

function merge(base: TrustRecord | null, input: Input): TrustRecord {
  const record: TrustRecord = base
    ? { version: 1, commonDir: base.commonDir, accepted: { ...base.accepted }, worktrees: { ...base.worktrees } }
    : { version: 1, commonDir: input.commonDir, accepted: {}, worktrees: {} };
  for (const file of input.shown) {
    if (file.hash === null) continue;
    const hashes = record.accepted[file.name] ?? [];
    if (!hashes.includes(file.hash)) record.accepted[file.name] = [...hashes, file.hash];
  }
  const list: Record<string, string> = {};
  for (const file of input.current) if (record.accepted[file.name]?.includes(file.hash)) list[file.name] = file.hash;
  record.worktrees[input.worktree] = list;
  return record;
}

/** `change` returns the record to write, or null when nothing needs writing. Once the rename lands, the result is ok. */
async function commit(deps: TrustDeps, commonDir: string, change: (base: TrustRecord | null) => TrustRecord | null): Promise<ObserveResult> {
  const io: TrustIo = { ...realIo, ...deps.io };
  const path = recordPath(deps.home, commonDir);
  const failed = (error: unknown) => ({ ok: false as const, reason: `the trust record can't be written: ${describe(error)}` });
  try { await mkdir(join(deps.home, ".shadow-army", "trust"), { recursive: true }); } catch (error) { return failed(error); }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const before = await load(deps, commonDir);
    const record = change(before.record);
    if (!record) return { ok: true, record: before.record };
    const temp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    let renamed = false;
    let releaseError: unknown;
    try {
      await io.writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      await deps.beforeCommit?.(attempt);
      // The compare and the rename happen under one lock, so two writers can't both pass the compare.
      const lock = await acquire(io, `${path}.lock`, deps.lockWaitMs ?? LOCK_WAIT_MS);
      try {
        if (await rawNow(io, path) === before.raw) { await io.rename(temp, path); renamed = true; }
      } finally {
        await release(io, lock).catch((error: unknown) => { releaseError = error; });
      }
    } catch (error) {
      await io.rm(temp, { force: true }).catch(() => undefined);
      return failed(error);
    }
    if (!renamed) { await io.rm(temp, { force: true }).catch(() => undefined); continue; }
    if (releaseError === undefined) return { ok: true, record };
    const warning = `the trust record was written, but its lock ${path}.lock can't be removed: ${describe(releaseError)}`;
    deps.log?.(warning);
    return { ok: true, record, warning };
  }
  return { ok: false, reason: `the trust record kept changing during ${MAX_ATTEMPTS} attempts; nothing was accepted` };
}

// The lock names its owner. It is made whole by one link, removed only by its owner, and taken over only when its
// owner is gone: a process on this host that no longer runs, or this process when it no longer holds it. An owner
// that is alive keeps it however long it stalls; a writer that can't get it in time accepts nothing.
const LOCK_WAIT_MS = 5_000;
interface LockOwner { pid: number; host: string; token: string }
interface Held extends LockOwner { path: string }
const heldHere = new Set<string>();

async function acquire(io: TrustIo, path: string, waitMs: number): Promise<Held> {
  const me: Held = { pid: process.pid, host: hostname(), token: randomBytes(8).toString("hex"), path };
  const temp = `${path}.${me.token}.tmp`;
  await io.writeFile(temp, JSON.stringify({ pid: me.pid, host: me.host, token: me.token }), "utf8");
  try {
    const deadline = Date.now() + waitMs;
    for (;;) {
      try { await io.link(temp, path); heldHere.add(me.token); return me; } catch (error) {
        if (code(error) !== "EEXIST") throw error;
      }
      const owner = await readOwner(io, path);
      if (owner === null) continue;
      // A gone owner is taken over; the pass still ends with the deadline check, in case recovery is itself stuck.
      const gone = owner !== "unreadable" && isGone(owner);
      if (gone) await takeOver(io, path, owner);
      if (Date.now() > deadline) {
        const who = owner === "unreadable" ? "an owner it doesn't name"
          : `process ${owner.pid} on ${owner.host}${gone ? `, which is gone, but ${path}.recover blocks taking it over` : ""}`;
        throw Object.assign(new Error(`${path} is held by ${who}`), { code: "ELOCKED" });
      }
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 20));
    }
  } finally {
    await io.rm(temp, { force: true }).catch(() => undefined);
  }
}

async function release(io: TrustIo, held: Held): Promise<void> {
  try {
    const owner = await readOwner(io, held.path);
    if (owner !== null && owner !== "unreadable" && owner.token === held.token) await io.rm(held.path);
  } finally {
    heldHere.delete(held.token);
  }
}

/** Removes a gone owner's lock. One recovery at a time, under its own guard, and only if the lock is still that owner's. */
async function takeOver(io: TrustIo, path: string, gone: LockOwner): Promise<void> {
  const guard = `${path}.recover`;
  try { await io.writeFile(guard, String(process.pid), { flag: "wx" }); } catch (error) {
    if (code(error) === "EEXIST") return;
    throw error;
  }
  try {
    const owner = await readOwner(io, path);
    if (owner !== null && owner !== "unreadable" && owner.token === gone.token) await io.rm(path);
  } finally {
    await io.rm(guard, { force: true });
  }
}

async function readOwner(io: TrustIo, path: string): Promise<LockOwner | null | "unreadable"> {
  const raw = await rawNow(io, path);
  if (raw === null) return null;
  try {
    const owner = JSON.parse(raw) as Partial<LockOwner>;
    if (typeof owner.pid === "number" && typeof owner.host === "string" && typeof owner.token === "string") return owner as LockOwner;
  } catch { /* falls through */ }
  return "unreadable";
}

function isGone(owner: LockOwner): boolean {
  if (owner.host !== hostname()) return false;
  if (owner.pid === process.pid) return !heldHere.has(owner.token);
  try { process.kill(owner.pid, 0); return false; } catch (error) { return code(error) === "ESRCH"; }
}

async function rawNow(io: TrustIo, path: string): Promise<string | null> {
  try { return await io.readFile(path, "utf8"); } catch (error) {
    if (code(error) === "ENOENT") return null;
    throw error;
  }
}
function describe(error: unknown): string {
  if (code(error) === "ELOCKED") return (error as Error).message;
  return code(error) ?? (error instanceof Error ? error.message : String(error));
}
function code(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}
