# Handoff: orchestrator 24 (`90963422`) to orchestrator 25 (2026-11-24)

Range on this branch: `f684c83` (both `STATE.md` files updated for orch-23 and orch-24) and this commit. orch-23's handoff is `git show f684c83:docs/spec/review/handoffs/LATEST.md`; orch-21's For the owner still holds. orch-24 ran 20:20 to about 20:40 UTC and reached 150k early (TRACE launch checks cost about 5k each), so it handed off before launching more.

**Done.**
- Closed the tabs of orch-23, w61 and w63. Checked both reports with `git show --stat`; each is pushed and is its PR's head.
  - **#91** at `c6a2233` (w61): C1 to C3 fixed with tests, C4 body, C5 comment. The PR is now 480 lines, over V6's 400: it needs the owner's size exception (For the owner). Merge note: the integrate branch rewrites lines next to the C2 fix (`0cf2427`, `9320360`), so stacking it there needs a one-line merge.
  - **#90** at `3c779ef` (w63): C1 to C3 fixed with failing-first tests, C4 build note, C5 body, C6 map in a reply. In WSL, 11 of `postOffice.test.ts`'s 27 tests fail; 10 of 24 already failed at `298dbd4` (same fixtures). Not yet assigned.
- Codex batch 2 (comment "Codex review 2 of 12" on #63, 20:25 UTC) also requested changes on **#92** (`839a0d1`, 3 P1) and **#93** (`f44b4a4`, 3 P1). Briefs written: `w64-fix93.md` and `w65-fix92.md`.
- Re-pointed the w57, w58 and w62 briefs to orch-24 (re-point them, and w64, w65, to yourself). Added a `## From orch-24` section to w57's brief (start now; #90's `postOffice.ts` change; Linux baseline).

**Running** (5-hour figure 17% at 20:35 UTC; it resets 00:30 UTC).
- **w62-fix95-finish** (`04b97b01`, Sonnet medium, brief `w62-fix95-finish.md`): #95's Linux run, full npm test, body and reply, and #89's two P2s. No code.
- **w57-guardian** (`1d87c0a5`, Sonnet high, brief `w57-guardian.md`): the guardian identity into the tree records; `postOffice.ts` and its tests on `claude/63-m1b-guardian` (base `claude/63-m1b-base-guardian` = #141 + #138), worktree `w57-guardian`.

## Next

1. Close orch-24's tab once the cockpit marks it parked.
2. When w62 reports: `git show --stat`, close its tab, then launch **w64-fix93** (Opus medium; `server.ts`/`server.test.ts` on `claude/63-m1a-apply-claims`, worktree `m1a-apply`). No file overlap with w57.
3. When w57 reports and its tab is closed: launch **w65-fix92** (Opus medium; `apply.ts`, `postOffice.ts` and tests on `claude/63-m1a-apply-core`, new worktree `m1a-apply-core`; it first merges #90's fix). Then **w58-po-trust** (Opus medium) after w65. All three are serial on `postOffice.ts`; the review fixes go before w58's new feature because Codex's changes-requested block the merges.
4. A worker for #90's WSL failures in `postOffice.test.ts` (fixtures that fail on Linux since `298dbd4`), after w65, since it is the same file.
5. Watch Codex on each 5-minute tick: `gh api 'repos/mogesjohnson/shadow-army/issues/63/comments?since=<time>'` for `Codex review <k> of 12`, and the PRs' latest reviews. Batches 3 to 12 are not back. Brief a fix worker per PR with changes requested, on files no live worker holds.
6. Write `codex-reviews/11-24-2026-codex-review-13.md` (same shape as batch 12; #141, w57's and w58's PRs, and the new fix heads of #90 to #95) once w57's and w58's PRs are open, and add it to that folder's README.
7. Memory: at most two workers and one full vitest at a time. Keep TRACE checks lean: the scaled screenshot of the typed line is the costly step.

## For the owner

- **#91 needs a V6 size exception** (480 lines against 400) before it can go forward. Codex's batch 2 fixes took it over.
- Codex batches 3 to 12 not back yet. Batch 2's fixes: #91 and #90 pushed, #95 finishing (w62), #92 and #93 briefed.
- orch-21's For the owner still holds (M1a's live run M1-AC29 waits for you).
