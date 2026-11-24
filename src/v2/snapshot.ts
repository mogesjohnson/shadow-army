import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { GitResult, HarnessKind } from "./git/harness.js";

export type RunGit = (args: string[], kind?: HarnessKind, cwd?: string) => Promise<GitResult>;
export type GitFactory = (repo: { gitDir: string; workTree: string; commonDir: string }) => { run: RunGit };
export class SnapshotError extends Error {}
export const FOLDER_FILE = "folder-path";
const GUIDANCE = ["CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md", "AGENTS.md", ".claude/AGENTS.md"];
/** ARM-6's paths, hashed even where git ignores them: root files, `.env*`, and everything under these folders. */
const HASHED_FILES = [".mcp.json", "AGENTS.md", "CLAUDE.md", "shadow.config.json", "orchestratorDelegate.md", "rules.md", "agent.md"];
const HASHED_DIRS = [".claude", ".githooks"];
const fold = (path: string) => (process.platform === "linux" ? path : path.toLowerCase());
export function within(root: string, path: string) {
  const rel = relative(fold(root), fold(path));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
/** The real path of the nearest existing ancestor, with the rest appended: a link anywhere in it is followed. */
export function realish(path: string): string {
  const full = resolve(path);
  try { return realpathSync(full); } catch { const up = dirname(full); return up === full ? full : join(realish(up), basename(full)); }
}
/** The first 12 hex digits of the SHA-256 of the folder's path, lower-cased on Windows. */
export const armyMark = (folder: string, platform: NodeJS.Platform = process.platform) =>
  createHash("sha256").update(platform === "win32" ? folder.toLowerCase() : folder, "utf8").digest("hex").slice(0, 12);
export const snapshotSubfolder = (root: string, folder: string) => join(root, `${basename(folder)}-${armyMark(folder)}`);
export interface FolderFacts { owner: "owner" | "trusted" | "other"; writableByOthers: boolean }
/** POSIX facts. Windows needs an ACL reader (M1b-17); it is not tested here. */
export function posixInspect(dir: string): FolderFacts {
  const info = lstatSync(dir);
  return { owner: info.uid === process.getuid?.() ? "owner" : info.uid === 0 ? "trusted" : "other", writableByOthers: (info.mode & 0o022) !== 0 };
}
/** `SHADOW_ARMY_SNAPSHOTS` (or the default in `home`), checked as WSP-11 says. A failure starts no soldier. */
export function validateSnapshotRoot(value: string | undefined, ctx: { home: string; folder: string; workTrees: string[]; inspect: (dir: string) => FolderFacts; exists?: (path: string) => boolean }) {
  const bad = (reason: string) => ({ ok: false as const, reason: `SHADOW_ARMY_SNAPSHOTS ${reason}` });
  if (value === undefined || value === "") return { ok: true as const, root: join(ctx.home, ".shadow-army", "snapshots") };
  if (!isAbsolute(value)) return bad("must be an absolute path");
  const root = realish(value);
  if (within(realish(ctx.folder), root)) return bad("is inside the folder");
  if (ctx.workTrees.some((tree) => within(realish(tree), root))) return bad("is inside a working tree of the repository");
  const home = realish(ctx.home);
  for (let dir = root, past = ""; dir !== past; past = dir, dir = dirname(dir)) {
    if (existsSync(dir)) {
      const facts = ctx.inspect(dir);
      if (facts.owner === "other") return bad(`has ${dir}, which another user owns`);
      if (facts.writableByOthers) return bad(`has ${dir}, which another user can write`);
    }
    if (dir !== root && !within(home, dir)) {
      const found = GUIDANCE.find((name) => (ctx.exists ?? existsSync)(join(dir, name)));
      if (found) return bad(`has ${join(dir, found)} above it, which soldiers' CLIs would load`);
    }
  }
  return { ok: true as const, root };
}
/** Deletes `path` only if it lies strictly inside `root` once links are resolved, and is no link itself. A path already gone is no error. */
export function removeInside(root: string, path: string) {
  const link = (() => { try { return lstatSync(path).isSymbolicLink(); } catch { return undefined; } })();
  if (link === undefined) return;
  const real = realish(path);
  if (link || real === realish(root) || !within(realish(root), real)) throw new SnapshotError(`refusing to remove ${path}: not a folder inside ${root}`);
  rmSync(real, { recursive: true, force: true, maxRetries: 3 });
}
