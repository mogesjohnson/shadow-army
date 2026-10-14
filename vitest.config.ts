import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Process supervisors and Git integration tests share substantial OS resources.
    maxWorkers: 1,
    // Synchronous PowerShell/Git integration calls can exceed the default five-second budget.
    testTimeout: process.platform === "win32" ? 60_000 : 5_000,
    // Retained soldier snapshots contain copies of the repository, not additional source suites.
    exclude: [...configDefaults.exclude, "**/.shadow/**"],
    coverage: {
      provider: "v8",
      // tsx subprocesses cannot be remapped reliably by Vitest's native TS stripper.
      // Keep all runtime files in the denominator and cover them in the test workers.
      autoAttachSubprocess: false,
      // Count every M1 runtime module, including files not imported by test workers.
      include: ["src/v2/**/*.ts"],
      exclude: ["src/v2/**/*.test.ts", "src/v2/**/*.testutil.ts"],
      // Vitest cleans its report directory: only a fresh generated directory is disposable.
      reportsDirectory: `.shadow/v2-coverage/run-${Date.now()}-${process.pid}`,
      reporter: ["text", "text-summary", "json-summary"],
      reportOnFailure: true,
      thresholds: { lines: 85 },
    },
  },
});
