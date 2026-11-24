// ARM-7's trust store: the hashes the owner accepted for a folder's own policy files, kept per repository in
// `~/.shadow-army/trust/`, never in the folder. Nothing here shows the card; it hashes, compares and records.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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
}

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
export type AcceptResult = { ok: true; record: TrustRecord } | { ok: false; reason: string };

/**
 * Records exactly the hashes the card showed, for every working tree of the repository. `current` is this working
 * tree's present files as the card saw them; they become its last-trusted list. The record is read again just
 * before each write, merged, never stripped of another working tree's entries, and replaced by one rename of a
 * file written beside it. A rename that finds the record changed since the read retries, up to MAX_ATTEMPTS times.
 */
export async function accept(deps: TrustDeps, input: {
  commonDir: string; worktree: string; shown: readonly Untrusted[]; current: readonly { name: PolicyFile; hash: string }[];
}): Promise<AcceptResult> {
  const path = recordPath(deps.home, input.commonDir);
  try { await mkdir(join(deps.home, ".shadow-army", "trust"), { recursive: true }); } catch (error) {
    return { ok: false, reason: `the trust record can't be written: ${code(error) ?? String(error)}` };
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const before = await load(deps, input.commonDir);
    const record = merge(before.record, input);
    const temp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      // The compare and the rename happen under one short lock, so two writers can't both pass the compare.
      const renamed = await withLock(`${path}.lock`, async () => {
        if (await rawNow(path) !== before.raw) return false;
        await rename(temp, path);
        return true;
      });
      if (!renamed) { await rm(temp, { force: true }); continue; }
      return { ok: true, record };
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      return { ok: false, reason: `the trust record can't be written: ${code(error) ?? String(error)}` };
    }
  }
  return { ok: false, reason: `the trust record kept changing during ${MAX_ATTEMPTS} attempts; nothing was accepted` };
}
function merge(base: TrustRecord | null, input: { commonDir: string; worktree: string; shown: readonly Untrusted[]; current: readonly { name: PolicyFile; hash: string }[] }): TrustRecord {
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

const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 5_000;
async function withLock<T>(lock: string, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try { await writeFile(lock, String(process.pid), { flag: "wx" }); break; } catch (error) {
      if (code(error) !== "EEXIST") throw error;
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > LOCK_STALE_MS) { await rm(lock, { force: true }); continue; }
      if (Date.now() > deadline) throw Object.assign(new Error(`${lock} is held`), { code: "ELOCKED" });
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 20));
    }
  }
  try { return await fn(); } finally { await rm(lock, { force: true }); }
}

async function rawNow(path: string): Promise<string | null> {
  try { return await readFile(path, "utf8"); } catch (error) {
    if (code(error) === "ENOENT") return null;
    throw error;
  }
}
function code(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}
