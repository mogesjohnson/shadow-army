# Handoff: orchestrator 25 (`d553ccc4`) to orchestrator 26 (2026-11-24)

Range on this branch: `a5f7f2e` (orch-24's handoff) and this commit. orch-24's handoff is `git show a5f7f2e:docs/spec/review/handoffs/LATEST.md`; its For the owner and orch-21's still hold. orch-25 ran 20:28 to about 21:10 UTC and handed off at 145k (it starts at 78k, and each TRACE launch costs about 8k).

**Done.**
- Closed the tabs of orch-24, w62 and w64. Re-pointed the w57, w58, w62, w64 and w65 briefs to orch-25 (re-point them to yourself, with w66 to w69).
- **w62** (#95, #89; no code): #95's body edited and its C1 to C9 reply posted; #89's body fixed to V9 and its B2 mapping comment posted. Linux run of #95's files: 17 passed, 17 failed, 9 skipped (containment is Windows-only). Full `npm test` on Windows: 463 passed, 1 failed, `scripts/pr-format.test.mjs`'s commit-msg hook test (null exit code; fails alone too; unchanged on main since #14). A local problem: CI decides.
- **w64** (#93): head `f6b2912` (`server.ts`, `server.test.ts`, +143/-23), C1 to C3 fixed with tests, C4 in the body, C5 in a comment. In WSL, the existing "shutdown settles an active native turn" test fails, at `f6b2912` and at `f44b4a4`. Build note: the card's Log path names the replaced read-only session. Its note for #92 (a second turn on the same file clashes with the first turn's applied edit) is in w65's brief.
- **Codex batch 3** (comment "Codex review 3 of 12" on #63, 20:57 UTC): changes requested on #94, #96, #97, #99 (5 P1), #101 and #103; **approved #102 (`f86ae1b`) and #104 (`f4ac137`)**, two P2s each. Briefs written: `w66-fix94-97`, `w67-fix96-103`, `w68-fix101`, `w69-fix99`.
- **WSL (the owner asked, 20:40 UTC):** Linux test runs stay in each worker's own clone on WSL's disk, never `/mnt/c`. Measured: listing files is about 175 times slower per file over `/mnt/c` (3.9 s for 8,251 files against 0.02 s for 13,393), and the Windows `node_modules` holds win32 binaries. Every brief from w65 on says so. `~/ci` holds 42 old clones, 5.8 GB; deleting them waits for the owner.

**Running** (5-hour figure 30% at 21:05 UTC; it resets 00:30 UTC).
- **w57-guardian** (`1d87c0a5`, Sonnet high): the guardian identity in `postOffice.ts` and its tests on `claude/63-m1b-guardian`. Its full suite ran over 16 minutes; told at 20:55 to stop it at 25 minutes and run the changed files plus tsc and build instead.
- **w66-fix94-97** (`80e76b90`, Opus medium, launched 21:03): #94 then #97, in `plugins/shadow-army/**`, `docs/v2-m1a-live-run.md` and `src/v2/slice.test.ts`; worktrees `m1a-slice` and `w15-fix-mod`. #94 is already 657 lines (V6).

## Next

1. Close orch-25's tab once the cockpit marks it parked.
2. When w57 reports: `git show --stat`, close its tab, launch **w65-fix92** (Opus medium; `postOffice.ts` serial).
3. When w66 reports: check, close, then launch **w67-fix96-103** (Opus medium) and **w68-fix101** (Sonnet medium) as the two-worker limit allows. Their files overlap no running worker. w67 touches `src/v2/apply.test.ts`, which w65 may also touch: run w67 after w65 if w65's diff includes that file.
4. `postOffice.ts` queue, one at a time: w57, then w65 (#92), then **w69-fix99** (#99), then w58-po-trust, then a worker for #90's WSL failures in `postOffice.test.ts`.
5. **#102 and #104 are approved at their heads.** They may be merged (merge commit, V13) after retargeting the PRs stacked on them (V14). Their P2s become build notes. Check their bases first: `gh pr view <n> --json baseRefName`.
6. Watch Codex on each 5-minute tick: `gh api 'repos/mogesjohnson/shadow-army/issues/63/comments?since=2026-11-24T20:58:00Z'`. Batches 4 to 12 are not back.
7. orch-24's Next 6 (codex-review-13 file) still holds.
8. Memory: at most two workers and one full vitest at a time.

## For the owner

- **The WSL clones:** may `~/ci`'s 42 old clones (5.8 GB) be deleted? Recommended, with three reused clones (`~/ci/slot1` to `slot3`) for later workers: fetch, check out the SHA, clean, and `npm ci` only when the lockfile changes.
- **#91 (480 lines) and #94 (657 lines) need V6 size exceptions.**
- orch-21's For the owner still holds (M1a's live run M1-AC29 waits for you).
