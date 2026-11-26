import { applyToCheckout, type ApplyResult } from "../workspace/apply.js";
import type { WriteOutcome } from "./channel.js";

/**
 * M1-AC28: after a turn that passed its claim audit and the checkout guard, put the soldier's audited change
 * into the owner's folder as uncommitted edits (new files intent-to-add, nothing committed, HEAD unmoved).
 * A turn that was cut short, failed, lost its lease or changed nothing is not applicable, so nothing is
 * applied and the soldier's branch keeps the work. A clash with the owner's own edits, or a checkout that
 * moved on, applies nothing and says why. Never throws for a git failure.
 */
export async function applyAudited(root: string, write: WriteOutcome): Promise<ApplyResult> {
  if (!write.applicable) return { applied: false, reason: write.reason ?? "the turn is not applicable", clashes: [] };
  if (!write.tip) return { applied: false, reason: "the audit resolved no commit to apply", clashes: [] };
  // Only this turn's audited delta, between immutable IDs: the branch may move after the audit, and an earlier
  // turn's unapplied work (before `start`) stays on the branch for the owner to recover explicitly.
  return applyToCheckout(root, write.start, write.tip);
}
