import { applyToCheckout, type ApplyResult } from "../workspace/apply.js";
import type { WriteOutcome } from "./channel.js";

/**
 * M1-AC28: after a turn that passed its claim audit and the checkout guard, put the soldier's audited change
 * into the owner's folder as uncommitted edits (new files intent-to-add, nothing committed, HEAD unmoved).
 * A turn that was cut short, failed, lost its lease or changed nothing is not applicable, so nothing is
 * applied and the soldier's branch keeps the work. A clash with the owner's own edits, or a checkout that
 * moved on, applies nothing and says why. Never throws for a git failure.
 */
export async function applyAudited(root: string, write: WriteOutcome, since?: string): Promise<ApplyResult> {
  if (!write.applicable) return { applied: false, reason: write.reason ?? "the turn is not applicable", clashes: [] };
  // A later turn on the same session applies only what is new since the last tip that reached the folder.
  return applyToCheckout(root, since ?? write.base, write.branch);
}
