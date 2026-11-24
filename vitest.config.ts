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
      exclude: [
        "src/v2/**/*.test.ts",
        "src/v2/**/*.testutil.ts",
        // Runs only as a spawned process (`sa post-office`); v8 cannot see a subprocess (autoAttachSubprocess is off).
        // Covered end to end by fixture-main and client tests that launch it. Not measured.
        "src/v2/main.ts",
        // Runs only as a spawned process (the mod's relay); the modRelay test launches the built file. Not measured.
        "src/v2/modRelay.ts",
        // Holds only types (NativeChannel, TurnResult, ChannelEvent): no executable lines.
        "src/v2/channel.ts",
        // Each containment driver runs only on its own system; elsewhere its live tests skip with a
        // "Not tested" note (D-34), so it is left out of the count there. On its system it is measured.
        ...(process.platform === "win32" ? [] : ["src/v2/contain/windows.ts"]),
        ...(process.platform === "linux" ? [] : ["src/v2/contain/linux.ts"]),
      ],
      // Vitest cleans its report directory: only a fresh generated directory is disposable.
      reportsDirectory: `.shadow/v2-coverage/run-${Date.now()}-${process.pid}`,
      reporter: ["text", "text-summary", "json-summary"],
      reportOnFailure: true,
      thresholds: { lines: 85 },
    },
  },
});
