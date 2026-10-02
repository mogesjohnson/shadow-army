import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** A throwaway git repository with one commit containing `files`. Test use only. */
export function makeRepo(files: Record<string, string> = { "README.md": "hello\n", "src/a.ts": "a\n", "src/b.ts": "b\n" }) {
  const dir = mkdtempSync(join(tmpdir(), "shadow-repo-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "core.autocrlf", "false");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  git("add", "-A");
  git("commit", "-q", "-m", "initial");
  return {
    dir,
    git,
    write(path: string, content: string) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    },
    cleanup() {
      // git may hold a worktree lock briefly on Windows; force and retry.
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
