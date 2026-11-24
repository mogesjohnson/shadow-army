# Handoff: orchestrator 26 (`46758ef1`) to orchestrator 27 (2026-11-24)

Range on this branch: `5fadd1d` (orch-25's handoff) and this commit. orch-25's handoff is `git show 5fadd1d:docs/spec/review/handoffs/LATEST.md`; its For the owner, orch-24's and orch-21's still hold. orch-26 ran 21:04 to about 21:16 UTC and handed off at 144k: it starts at 81k, and each TRACE close-and-launch costs about 12k, so hand off after two launches.

**Done.**
- Closed the tabs of orch-25, w66 and w57. Re-pointed the w57, w58 and w65 to w69 briefs to orch-26 (re-point them to yourself).
- **#102 and #104 merged** by the owner from orch-26's commands (auto mode refuses `gh pr merge`; give the owner `! gh pr ready <n> && gh pr merge <n> --merge --match-head-commit <sha>`): #102 into `claude/63-m1a-slice` at `7922578`, #104 into `claude/63-m1a-fix-office` (#99's head) at `1080bca`. Branches kept. Their P2s are build notes. w69's brief notes the #104 merge.
- **w66** (#94, #97): #94 at `8ef9b2f` (now under `7922578` on `claude/63-m1a-slice`), #97 at `e046ec8` (`claude/63-m1a-fix-mod`). All 8 review-3 findings fixed with tests, replies and V9 bodies posted. #97 C1 needed `src/v2/modRelay.ts` (the `ready` event now carries `root` from `repoRoot`); orch-26 approved it and recorded it in w66's brief. Linux and the full suite not run. **#94 is now 689 lines, 7 files: needs the owner's V6 exception.**
- **w57** (guardian): **#142** at `1ddfdbb` (`claude/63-m1b-guardian` <- `claude/63-m1b-base-guardian`, `postOffice.ts` and its test, +63/-2). tsc, build and WSL pass (base 40, branch 42 passed). Full Windows `npm test`: 4 failed under load, and "waits the given delay before each restart" fails on w55's base `201d0d5` alone too (its PR comment has the details).

**Running** (5-hour figure 44% at 21:13 UTC; it resets 00:30 UTC).
- **w68-fix101** (`3f42e66d`, Sonnet medium, launched 21:12): #101 in `src/workspace/apply.ts`, `links.test.ts` and a new `apply.rollback.test.ts`, worktree `w16-linux-git-v2`.
- **w65-fix92** (`7005b10e`, Opus medium, launched 21:13): #92 in `src/v2/apply.ts`, `apply.test.ts`, `postOffice.ts`, `postOffice.test.ts` (and `channel.ts` if needed). First merges #90's fix branch.

## Next

1. Close orch-26's tab once the cockpit marks it parked.
2. When w68 reports: `git show --stat`, close its tab. Do not launch w67 yet.
3. When w65 reports: check, close, then launch **w67-fix96-103** (Opus medium; it touches `apply.test.ts`, so never beside w65) and **w69-fix99** (#99; `postOffice.ts`, after w65), two workers at most.
4. `postOffice.ts` queue, one at a time: w65 (#92), w69 (#99), w58-po-trust, then a worker for #90's WSL failures in `postOffice.test.ts`.
5. orch-24's Next 6: write `codex-reviews/11-24-2026-codex-review-13.md` (same shape as batch 12: #141, #142, w58's PR, and the new fix heads of #90 to #97) once w58's PR is open, and add it to that folder's README.
6. Watch Codex on each 5-minute tick: `gh api 'repos/mogesjohnson/shadow-army/issues/63/comments?since=2026-11-24T20:58:00Z'`. Batches 4 to 12 were not back at 21:13 UTC.
7. Memory: at most two workers and one full vitest at a time.

## For the owner

- **V6 size exceptions:** #91 (480 lines) and #94 (689 lines, 7 files).
- **The WSL clones:** may `~/ci`'s 42 old clones (5.8 GB) be deleted? Recommended, with three reused clones (`~/ci/slot1` to `slot3`).
- orch-21's For the owner still holds (M1a's live run M1-AC29 waits for you).
