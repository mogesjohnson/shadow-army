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
    /**
     * A new branch off `base` (any commit) with one commit that writes `changes` (null deletes the file),
     * like a finished run. It is made in a scratch worktree, so the folder is not touched. Returns the tip.
     */
    branchFrom(base: string, branch: string, changes: Record<string, string | null>) {
      const wt = mkdtempSync(join(tmpdir(), "shadow-branch-"));
      const inWt = (...args: string[]) => execFileSync("git", args, { cwd: wt, encoding: "utf8" }).trim();
      git("worktree", "add", "-q", "-b", branch, wt, base);
      for (const [path, content] of Object.entries(changes)) {
        if (content === null) {
          rmSync(join(wt, path));
        } else {
          mkdirSync(dirname(join(wt, path)), { recursive: true });
          writeFileSync(join(wt, path), content);
        }
      }
      inWt("add", "-A", "-f"); // -f: a run can add a file that is ignored
      inWt("commit", "-q", "-m", `run on ${branch}`);
      const tip = inWt("rev-parse", "HEAD");
      git("worktree", "remove", "--force", wt);
      return tip;
    },
    cleanup() {
      // git may hold a worktree lock briefly on Windows; force and retry.
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
