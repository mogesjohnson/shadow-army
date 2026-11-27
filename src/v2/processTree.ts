// The post office's containment entry point. Per-system drivers live in ./contain/ (PO-12).
export { spawnManagedProcess } from "./contain/index.js";
export type { ManagedProcess, ManagedProcessOptions, ProcessExit } from "./contain/index.js";
// CH-1 path checks, exported for their tests (C17).
export { resolveLaunch, verifiedRoots, verifyExecutable, type LaunchTarget } from "./contain/windows.js";
