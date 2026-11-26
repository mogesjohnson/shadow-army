import { noContainmentMessage } from "./index.js";

/** Smart App Control's `VerifiedAndReputablePolicyState`: 0 off, 1 on, 2 evaluation (PO-19). */
export type SmartAppControl = 0 | 1 | 2;

/** One failure cause of PO-14's check; each has its own message. */
export type Failure =
  | { cause: "no-helper" }
  /** Step 1: the helper, or on Windows the script and its DLL, is missing or can't be run. */
  | { cause: "cannot-run"; detail?: string; smartAppControl?: SmartAppControl }
  /** Step 2: a file's SHA-256 is not the one in the post office's code (PO-13). */
  | { cause: "changed"; file?: string }
  /** Step 3 on Windows: the script refused to run outside FullLanguage mode (PO-19). */
  | { cause: "constrained-language"; smartAppControl?: SmartAppControl }
  /** Step 1 or 3 on Windows: `Add-Type -Path` failed to load the DLL (PO-19). */
  | { cause: "dll-load"; code?: string; smartAppControl?: SmartAppControl }
  /** Step 1 on Windows: Group Policy's execution policy stopped the unsigned script (PO-19). */
  | { cause: "execution-policy"; policy: string }
  /** Steps 3 and 4: the helper or the probe did not behave as PO-14 lists. */
  | { cause: "helper-failed"; detail: string }
  /** Step 4: the probe's pipe was still open after the tree was killed. */
  | { cause: "outlived" }
  /** The check had not passed 10 seconds after it began. */
  | { cause: "timeout"; step: string }
  /** A per-system step this Shadow Army doesn't have yet. */
  | { cause: "not-built"; step: string };

/** What every message names: the system and its version, the processor and Shadow Army's version (PO-14). */
export interface Where {
  platform: string;
  system: string;
  version: string;
  arch: string;
  shadowArmy: string;
  /** False on a Windows build where Smart App Control can't be turned back on once off (before KB5083769). */
  smartAppControlCanBeUndone?: boolean;
}

const sacOn = (failure: Failure): boolean => "smartAppControl" in failure && failure.smartAppControl === 1;

function body(failure: Failure, w: Where): string {
  if (sacOn(failure)) {
    const undone = w.smartAppControlCanBeUndone === false
      ? " On this Windows build, turning it off can't be undone without resetting Windows."
      : "";
    return `Smart App Control blocked Shadow Army's Windows script or its DLL, so no soldier can start. Turn Smart App Control off in Windows Security.${undone}`;
  }
  switch (failure.cause) {
    case "no-helper": return noContainmentMessage(w.platform, w.arch);
    case "cannot-run": return `The containment helper can't be run${failure.detail ? `: ${failure.detail}` : ""}. No soldier can start. Reinstall Shadow Army.`;
    case "changed": return `The containment helper doesn't match Shadow Army ${w.shadowArmy}${failure.file ? ` (${failure.file})` : ""}. If Shadow Army was just updated, start Claude Code again; otherwise reinstall it. No soldier can start.`;
    case "constrained-language": return "PowerShell ran Shadow Army's script in ConstrainedLanguage mode, so no soldier can start. An AppLocker or App Control policy doesn't allow the script; an administrator can allow it and its DLL with a hash rule made from the installed files.";
    case "dll-load": return `Windows would not load Shadow Army's DLL${failure.code ? ` (${failure.code})` : ""}, so no soldier can start. An AppLocker or App Control policy may not allow it; an administrator can allow it with a hash rule made from the installed file.`;
    case "execution-policy": return `PowerShell's ${failure.policy} execution policy, set by Group Policy, stops Shadow Army's unsigned script, so no soldier can start on this machine.`;
    case "helper-failed": return `Containment failed its check on ${w.system} ${w.version} (${w.arch}): ${failure.detail}. No soldier can start. A newer Shadow Army may fix this.`;
    case "outlived": return `Containment failed its check on ${w.system} ${w.version} (${w.arch}): a test process outlived its containment. No soldier can start. A newer Shadow Army may fix this.`;
    case "timeout": return `Containment's check did not finish in 10 seconds; it was still in the ${failure.step} step. No soldier can start.`;
    case "not-built": return `Shadow Army ${w.shadowArmy} has no ${failure.step} check for ${w.platform}-${w.arch} yet, so no soldier can start.`;
  }
}

/** PO-14's message for a cause, naming the system, processor and Shadow Army version. */
export function failureMessage(failure: Failure, w: Where): string {
  return `${body(failure, w)} (${w.system} ${w.version}, ${w.arch}, Shadow Army ${w.shadowArmy})`;
}
