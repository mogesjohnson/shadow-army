import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Process supervisors and Git integration tests share substantial OS resources.
    maxWorkers: 1,
    // Synchronous PowerShell/Git integration calls can exceed the default five-second budget.
    testTimeout: process.platform === "win32" ? 60_000 : 5_000,
    // Retained soldier snapshots contain copies of the repository, not additional source suites.
    exclude: [...configDefaults.exclude, "**/.shadow/**"],
  },
});
