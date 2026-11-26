# Handoff: orchestrator 57 (`c71d0154`) to orchestrator 58 (2026-11-26 ~18:20 UTC)

Self-contained: do not read older handoffs. 5-hour window at 61% (resets 20:00 local 15:00). RAM ~3.5 GB free; Claude Code killed orch-57's hi and watch timers for low memory at ~18:00: restart yours only if memory allows (the note says not to restart unasked; the owner was told).

## THE OWNER'S NEW ORDER: bottom-first (2026-11-26, "we will have main as current then we do new stuff, begin this")

51 open PRs, none merged: we chased Codex's newest findings at the top while the bottom was never finished. Now: work only the lowest unapproved PR, get Codex approval, merge (merge commit, `--match-head-commit`, script in its own tab), repeat. No new PRs, no new `base-*` branches until the stack is a handful. Recorded on #63 (comment 7200367879) and in memory `bottom-first.md`.

The stack, bottom up:
1. **#95** `claude/63-m1a-transport` <- `main`, head `31e1448` (includes merged #89, #91 mod). Open: C10, C11, C12 P1 (claude.ts:284 UUID correlation, processTree.ts:46 `..name` boundary, claude.ts:154 redact before truncating), C13/C14 P2.
2. **M1a chain:** #90 <- transport, #92, #93, #94 (head branch `claude/63-m1a-slice`), with #96, #99, #101 on the slice. Plan: fold #90, #92, #93, #96, #99, #101 into #94 once Codex's list (below) says what is open.
3. **`claude/63-m1b`** has NO PR (86 commits ahead of main; ~15 PRs #106 to #123 target it). Open a draft PR for it onto the M1a slice when #94 is near approval.
4. M1b PRs bottom-up. `base-*` branches (`base-po-chain2`, `base-guardian`, `base-po-trust`) have no PRs: fold 3 removes them.

## Running

- **w195-fix95** (Opus medium): #95 C10 to C12 with fail-first tests, then replies, Validation, next Codex file. Brief `tasks/w195-fix95.md`. Worktree `AIConnections-worktrees/w195-fix95`.
- **Codex review 94** (`~/codex-reviews/shadow-army/11-26-2026-codex-review-94.md`): owner said Codex starts ~18:30. Part 1 reviews #95 at `31e1448`; Part 2 posts one ranked list of open findings for the M1a chain on #94. Read its `## Result`, then: fold the chain into #94 (one worker, Sonnet medium), fix the list bottom-up.
- **w194-fix141**: done and stopped; its tab is still open (TRACE refused: elevated window in front). Close it.

## Paused (above the bottom; resume only when the stack reaches them)

- #141 at `df61172`: Left in `tasks/w194-fix141.md` (whole postOffice.test.ts on Windows, body, Codex file, P1 build note startup misses moved HEAD/ARM-6).
- #138 at `3e37186` (C9, C10, C6 identity fixed; C6 `%LOCALAPPDATA%` move left, `tasks/w192-fix138.md`). #111 at `6d4ff2f` (C6 fixed, Codex file 91). Codex files 91 to 93 are for paused PRs: fine if Codex does them, but 94 comes first.
- #139 C3 follow-up, #142, #143, Ink lane #145 to #151, spec Q11.

## Lessons

- Same-file hold compares paths across worktrees; check live workers' files before launching.
- Workers stall waiting on background test runs whose notification never comes: nudge after ~10 min idle.
- `check_workers.py` STOPPED with "waiting for notification" is normal.
