# Handoff: orchestrator 27 (`347b1d0e`) to orchestrator 28 (2026-11-24)

Range on this branch: `5689724` (orch-26's handoff) and this commit. orch-26's handoff is `git show 5689724:docs/spec/review/handoffs/LATEST.md`; its For the owner and orch-25's, orch-24's and orch-21's still hold. orch-27 ran 21:15 to about 21:32 UTC and handed off at about 140k: it starts at 75k, a close costs about 3k, a launch about 10k. Hand off after two launches.

**Done.**
- Closed the tabs of orch-26, w68 and w65. Re-pointed the w65 and w58 briefs to orch-27 (re-point w58's to yourself; w67, w69 and w70 say "the orchestrator that launched you" or orch-27).
- **w68** (#101): `ee17065` on `claude/63-m1a-linux-git` (`src/workspace/apply.ts`, new `apply.rollback.test.ts`, +75/-3). C1 fixed (a failed rollback returns the paths left changed), C2 answered by the body. Linux 30 passed, 1 skipped.
- **w65** (#92): `b84fc7e` on `claude/63-m1a-apply-core` (`src/v2/apply.ts`, `apply.test.ts`, `postOffice.ts`, `channel.ts`, +91/-15), after merging #90's fixes (`027d83d`). C1 to C3 fixed (the apply uses only the turn's audited start..tip by full commit ID; a log failure after an apply returns the files plus `logFailure`), C4/C5 by body and comment. Windows full `npm test` 477 passed, 4 skipped. WSL `apply.test.ts`: 14/34 failed at base, 15/38 at head; the extra one is the new C1 test, same synthetic-fixture `tool_call` wait on Linux (#90's WSL failures, queue item below). The same-file follow-up clash (w64's finding) is a build note: its check lives in `src/workspace/apply.ts`. `channel.ts` gained `WriteOutcome.start/tip` and `TurnResult.logFailure`.
- **Codex review 4 of 12** (21:16 UTC on #63): **#105 approved** at `129c211` (3 P2s, build notes); **#109** changes requested at `915e619` (1 P0, 4 P1, 2 P2); **#110** changes requested at `96288b5` (2 P1, 2 P2). Batches 5 to 12 were not back at 21:30 UTC.

**Running** (5-hour figure 60% at 21:30 UTC; it resets 00:30 UTC).
- **w70-fix109-110** (`e16cf22d`, Opus medium, launched 21:22): #109 then #110, in worktree `w22-linux-helper`. Files: `native/linux/sa-contain.c`, `scripts/build-native.mjs`, `scripts/build-native.test.mjs`, `package.json`, `.gitignore`. Brief: `.shadow/v2-tools/tasks/w70-fix109-110.md`.
- **w69-fix99** (`b287fd42`, Opus medium, launched 21:28): #99 in `src/v2/postOffice.ts` and `postOffice.test.ts`, worktree `w13-fix-office`.

## Next

1. Close orch-27's tab once the cockpit marks it parked.
2. When w70 or w69 reports: `git show --stat <sha>`, close its tab, then launch **w67-fix96-103** (Opus medium; brief ready; `src/v2/claude.ts`, `client.ts`, their tests, and #103's test files for gating; no overlap with w69 or w70). At most two workers at once.
3. `postOffice.ts` queue, one at a time: w69 (#99, running), then w58-po-trust, then a worker for #90's WSL failures (the synthetic fixture's `tool_call` never arrives on Linux; it fails `postOffice.test.ts` and now `apply.test.ts` on the base too).
4. orch-24's Next 6: write `codex-reviews/11-24-2026-codex-review-13.md` (same shape as batch 12: #141, #142, w58's PR, and the new fix heads of #90 to #97, #99, #101, #109, #110) once w58's PR is open, and add it to that folder's README.
5. Watch Codex on each 5-minute tick: `gh api 'repos/mogesjohnson/shadow-army/issues/63/comments?since=2026-11-24T21:17:00Z'`. For each approval at the head, give the owner the merge command (auto mode refuses `gh pr merge`).
6. Memory: at most two workers and one full vitest at a time.

## For the owner

- **Merge #105** (Codex approved at the head; it moves #122, stacked on it, first):
  `! gh pr edit 122 --base claude/63-m1b && gh pr ready 105 && gh pr merge 105 --merge --match-head-commit 129c211ed701bca2a3907b73633559298540cab5`
- **V6 size exceptions:** #91 (480 lines) and #94 (689 lines, 7 files).
- **Worktree cleanup:** the cockpit worktree `AIConnections-worktrees/w65-fix92` (branch `w65-fix92`, at main, unused) may be removed; also the WSL clones question from orch-26.
