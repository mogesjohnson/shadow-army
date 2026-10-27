# Handoff: session 10, Fork 1 (2026-10-26)

Written by **Fork 1 of session 10** (no fork name and no handoff message reached it). It started no agent. It wrote v0.18, then stopped at the save point: it couldn't read `/context` itself, and the runbook says to assume 120k then. Read this after the runbook's section 1.

## The range

- Start `3c70397` (session 9 Fork 1's handoff). End: the commit that last changed this file (`git log -1 -- docs/spec/review/handoffs/LATEST.md`).
- `git diff 3c70397..<end> --stat`: `docs/spec/v2.md`, `ledger.md`, `drafts/v018/repairs.txt` and `fixed.mjs`, `STATE.md`, this file.
- The spec is **v0.18** (`f48b957`, snapshot `v2@f48b957.md` in the main checkout's `.shadow/v2-tools/review/snapshots/`).

## Finished

- **v0.18** (`f48b957`; `drafts/v018/repairs.txt`, 26 blocks): every V17-FC1 repair, N1 to N13 (R-M1-193 to R-M1-205), which also finish R-M1-182 (N1), R-M1-183 (N7), R-M1-186 (N8) and R-M1-187 (N9). Trace 0 problems (119 requirements, 81 ACs); Appendix C 0 problems. The ledger marks all 17 rows "repaired in v0.18; to fix-check".
- Technical choices by the orchestrator, beyond V17-FC1's fix text (the owner may overrule):
  - N1: the `PATH` cleaning applies on every system, not just Windows, so `#!/usr/bin/env node` is covered too; M1-AC10 tests both.
  - N2: the post office reads `disableSideloadFlags` from Claude Code's managed settings before starting a claude soldier. Without Q9's stream-json route, that soldier runs without `send`, as agy does.
  - N3: HOST-1 moved to M1's Implements and out of M5's; M5-AC3 still cites it ("loaded from its release package").
  - N4: the folders above the snapshots folder are checked for ownership, and those outside the owner's home must hold no `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md` or `AGENTS.md`.
  - N11: M6-AC9's cleanup runs in the soldier's next turn, so both halves of the exemption (made and deleted) are tested. A new case also cards deleting the owner's existing `hotfix` branch with its worktree (N12).
  - N12: the post office's log records each branch-and-tree pair when both appear, which is how the guard knows a branch was "made with" its tree.

## Next, in order

1. **Verify round 4's P1 and P2** (R-M1-206 to 218, R-F-157, R-F-158) at rule 6's efforts: Opus high for the three P1s (206, 207, 208) and anything security-related, Sonnet medium for simple ones. Two or three at a time, tight packets first (`tools/packet.mjs`). Reports: `raw/M1-r4-chaos.md`, `raw/F-r4-consistency.md`. Then repair the confirmed findings as v0.19, with round 4's P3s (R-M1-219, R-F-159 to R-F-165, "to apply unverified").
2. **Owed for round 4:** M1's implementer and F's red team (`drafts/r4/PROMPTS.md`), on v0.18 (`v2@f48b957.md`).
3. **Fix check V18-FC1** of v0.18 (and v0.19 if it's written by then), then count round 4. Both streaks are 0; round 5 is the cap (PLAYBOOK section 7).

## The owner's open questions

- **D-30 to D-33 answered: all A** (2026-10-26, in chat, picked on the page https://claude.ai/artifact/MxaMyxHYcNYAhMiHsdmCyN). Recorded in `decisions.md`; **not yet in the spec**. Apply them first in v0.19, as OLD/NEW blocks with both checkers: D-30, residuals 7, 8, 12 and residual 13's other-army refs become "accepted (D-30)"; D-31, SES-1 says soldiers start fresh in a new process, H38 closed for 2.0, and R-F-140 (b) (earlier worktrees with unapplied commits named at start; `/diff` and `/apply` accept them); D-32, ARM-7's re-show only on the owner's own uses, Claude's `send` returns `queued · waits · trust card`; D-33, ARM-7 says the shipped copy sets every soldier to `supervised`.
- The go on M1's probes (`probes.md`).
- PR #82 (Grok's alpha plan) still waits for review; not part of this runbook.

## What the files don't say

- The v0.18 commit is 279 lines in 4 files, over the 200-line commit default (WORKFLOW.md, 2026-10-25), because `repairs.txt` is a 175-line draft. PR #77 predates that budget and is far over it anyway; nothing was rewritten.
- The untracked JSON drafts in `drafts/r3/` and `drafts/v015/` can be rebuilt; leave them untracked.
- The main checkout's `story.txt` (staged) and `moges*.md` belong to the owner; don't commit them.
