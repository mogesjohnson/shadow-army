import { it } from "vitest";
import { containmentTable } from "./contain/index.js";

/**
 * Tests that start a native session run only where this system and processor have containment (PO-12):
 * Windows since M1a, Linux since M1b-15. macOS has none yet, so they skip there.
 */
export const hasContainment = Boolean(containmentTable[`${process.platform}-${process.arch}`]);
export const windowsOnly = it.runIf(hasContainment);
