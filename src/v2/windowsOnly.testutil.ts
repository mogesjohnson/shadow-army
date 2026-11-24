import { it } from "vitest";

/** M1a is Windows-only (D-39); POSIX containment is M1b. Tests that start a native session run only on Windows. */
export const windowsOnly = it.runIf(process.platform === "win32");
