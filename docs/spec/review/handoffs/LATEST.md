# Handoff: orchestrator 28 (`ce66d8d9`) to orchestrator 29 (2026-11-24)

Range on this branch: `2e2294f` (orch-27's handoff) and this commit. orch-27's handoff is `git show 2e2294f:docs/spec/review/handoffs/LATEST.md`; its For the owner and orch-26's, orch-25's, orch-24's and orch-21's still hold where not done below. orch-28 ran 21:28 to about 22:45 UTC, started at 69k and made this save point at about 150k: two launches cost about 16k, three closes about 9k, the owner's size questions about 5k.

**Done.**
- Closed the tabs of orch-27, w70, w69, w67 and w58. No worker is running.
- **Owner's V6 size exceptions** (asked in orch-28's question, 2026-11-24): #109 "Yes, approve" (about 560 lines, 1 file), #99 "Yes, approve" (441 lines, 3 files), #91 and #94 "Yes, approve both". The workers recorded #109 and #99 in their bodies; orch-28 recorded #91 and #94.
- **w70** (#109, #110, Codex review 4): #109 `37bf42b` (`native/linux/sa-contain.c`, +128/-38: kill only through a verified /proc, keep watching during exec; C1-C5 fixed, C6/C7 recorded), #110 `326d4c3` (`scripts/build-native.mjs`, its test, `package.json`: fail the Linux build without a fresh helper for the processor; C1-C4). WSL hand checks 11/11, tests 14/14.
- **w69** (#99, Codex review 3): `645e373` on `claude/63-m1a-fix-office` (`src/v2/postOffice.ts`, `postOffice.fixes.test.ts`, +131/-22). C1-C5 fixed with fail-first tests, C6 heartbeat test added, base merged. Windows 37/37; WSL has the same pre-existing W12-3 failure at base and head.
- **w67** (#96, #103, Codex review 3): #96 at `0f829b1`, #103 at `50f5705` (`src/v2/claude.ts`, `claude.test.ts`, `client.ts`, `test/fakes/claude.mjs`). Bad-line quiet recovery, whole redacted record, tenth-line diagnostic, the missing-usage test gated. #96 merged the slice (#102's guard), so #103 is now 47 lines, 2 files. Linux `apply.test.ts` fails 2 at `50f5705` and 3 on the slice base `8ef9b2f` (#90's WSL queue item).
- **w58** (M1b-28 part B, trust gate in the post office) stopped at its limit, half done: `7ca3629` (gate) and `3878436` (4 tests, failing on rerun, cause unread) on `claude/63-m1b-po-trust`, base `claude/63-m1b-base-po-trust` (#140 and #115 merged onto #142) pushed. No PR. Its `## Left` is in `.shadow/v2-tools/tasks/w58-po-trust.md`.
- **Codex review 5 of 12** (22:36 UTC on #63): changes requested on **#106** at `30069d8` (1 P0, 3 P1, 2 P2), **#120** at `9034437` (2 P0, 5 P1, 1 P2), **#121** at `f13e3ef` (2 P0, 4 P1, 2 P2). #120 and #121 are stacked on #106.

## Next

The 5-hour figure was 87% at 22:42 UTC and resets 00:30 UTC: start no worker while it is 80% or more.

1. Launch, at most two at once (memory), briefs ready in `.shadow/v2-tools/tasks/`, all Opus medium:
   - **w71-fix106** (`src/v2/git/harness.ts`, its test, `hostileRepo.testutil.ts`, `test/fakes/git-hang.mjs`, worktree `w23-harness-git`) first, beside
   - **w74-po-trust-2** (finish w58: the failing tests, `src/v2/server.ts`'s `trust` case and `TrustNeeded` answer, the draft PR; worktree `w58-po-trust`). No file overlap with w71.
   - After w71 pushes: **w72-fix120** (`src/v2/snapshot.ts`, its test, `w36-snapshots`) and **w73-fix121** (`src/v2/git/hold.ts`, its test, `hostileRepo.testutil.ts`, `w37-git-hold`). They merge #106's new head first. Tell each at launch that w71 has pushed.
2. Then the queue: a worker for #90's WSL failures (the synthetic fixture's `tool_call` never arrives on Linux; it fails `postOffice.test.ts` and `apply.test.ts` on the base too, and w67 saw it again).
3. orch-24's Next 6: write `codex-reviews/11-24-2026-codex-review-13.md` (same shape as batch 12: #141, #142, w74's PR, and the new fix heads of #90 to #97, #99, #101, #103, #109, #110, then #106, #120, #121 once fixed) and add it to that folder's README.
4. Watch Codex on each 5-minute tick: `gh api 'repos/mogesjohnson/shadow-army/issues/63/comments?since=2026-11-24T22:37:00Z'`. For each approval at the head, give the owner the merge command (auto mode refuses `gh pr merge`).
5. A worker over 400 lines asks before pushing; ask the owner with a question and pass on the exact words. The owner answered all four within minutes.

## For the owner

- **Merge #105** (still waiting; Codex approved at the head; it moves #122, stacked on it, first):
  `! gh pr edit 122 --base claude/63-m1b && gh pr ready 105 && gh pr merge 105 --merge --match-head-commit 129c211ed701bca2a3907b73633559298540cab5`
- **Worktree cleanup:** the cockpit worktree `AIConnections-worktrees/w65-fix92` (unused) and `orch-28-orchestrate-workers` (made by the cockpit, unused) may be removed; also the WSL clones question from orch-26.
