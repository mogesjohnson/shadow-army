import { spawnManagedProcess as spawnLinux } from "./linux.js";
import { spawnManagedProcess as spawnWindows, type ManagedProcess, type ManagedProcessOptions } from "./windows.js";

export type { ManagedProcess, ManagedProcessOptions, ProcessExit } from "./windows.js";

type Driver = (options: ManagedProcessOptions) => Promise<ManagedProcess>;

/**
 * PO-12's table, keyed `<process.platform>-<process.arch>`. `null` is a pair the spec lists whose
 * driver is not built yet (M1b); a pair missing from the table is one the spec does not list.
 * Both get PO-14's "no helper" message.
 */
export const containmentTable: Readonly<Record<string, Driver | null>> = {
  "linux-x64": spawnLinux,
  "linux-arm64": spawnLinux,
  "darwin-arm64": null,
  "darwin-x64": null,
  "win32-x64": spawnWindows,
  "win32-arm64": spawnWindows,
};

export function noContainmentMessage(platform: string, arch: string): string {
  return `No containment helper for ${platform}-${arch}, so no soldier can start. Supported: Linux x64 and arm64, macOS, Windows x64 and arm64.`;
}

/** The driver for a system and processor, or an error saying there is none (PO-14). */
export function containmentFor(platform: string = process.platform, arch: string = process.arch): Driver {
  const driver = Object.hasOwn(containmentTable, `${platform}-${arch}`) ? containmentTable[`${platform}-${arch}`] : null;
  if (!driver) throw new Error(noContainmentMessage(platform, arch));
  return driver;
}

export async function spawnManagedProcess(
  options: ManagedProcessOptions,
  platform: string = process.platform,
  arch: string = process.arch,
): Promise<ManagedProcess> {
  return containmentFor(platform, arch)(options);
}
