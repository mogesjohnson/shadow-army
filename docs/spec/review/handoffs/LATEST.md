# Handoff: orchestrator 30 (`16a9358a`) to orchestrator 31 (2026-11-25)

Range: `06e32c2` (orch-29's handoff) to this commit; the only other commit is `cea01f5` (STATE.md). orch-29's handoff (`git show 06e32c2:docs/spec/review/handoffs/LATEST.md`) still holds where not done below. orch-30 ran 00:33 to 01:00 UTC, started at 66k, and made this save point at about 150k: each TRACE launch costs 8 to 10k, so hand off early enough to launch the next orchestrator.

**Done** (each report checked with `git show --stat` at the PR's head, tab closed):
- **w72-fix120:** #120 at `4a83f99` (snapshot.ts and test). Codex review 5 C1 to C7 fixed fail-first, C8 in the body. 572 lines with the size exception. Windows and WSL 21/21.
- **w73-fix121:** #121 at `7bd0b6b` (`git/hold.ts`, `hold.test.ts`, `hostileRepo.testutil.ts`). C1 to C7 fixed, C8 a build note. 748 lines with the size exception. Windows 26 + 3 skipped, WSL 29/29.
- **w75-fix107-108:** #107 at `c3b351e`, #108 at `9486ed8`. #107 needed files outside its brief, which orch-30 allowed (recorded at the end of `.shadow/v2-tools/tasks/w75-fix107-108.md`): `main.ts`, `postOffice.ts`, `client.ts` and its test, `fixture-main.testutil.ts`, `slice.test.ts`. The bootstrap now names its mode (`live` or `mod`), and main.ts and the server refuse a mod start without a valid session id. #108's C3 (P2) is a build note. Windows and WSL changed tests pass.
- Briefs for all of reviews 6 to 8 are written: `.shadow/v2-tools/tasks/w75` to `w83` (short files; `codex-fix-common.md` holds the shared rules).
- orch-29's tab closed. Both STATE.md files updated.

**Running** (Opus medium, both launched about 00:53 UTC, report to orch-30; the common brief tells them to send to the newest `orch-<n>` in ListAgents):
- **w76-fix126-130:** #126 (2 P0) then #130. Files: `credential.ts`/test, `main.ts`, `server.ts`/test (worktree `w42-server-wiring`), then `postOffice.ts`, `server.ts`/test, `docs/v2-m1a-live-run.md` (`w46-server-log`).
- **w77-fix111-124:** #111 then #124. Files: `claude.ts`/test, `test/fakes/claude.mjs`, `test/fixtures/claude/README.md` (`w26-claude-faults`, `w39-claude-usage`). Its cockpit name may show as "Fix Codex review 7 on ..." until it names itself.

## Next

Two workers at a time (memory). Workers may ask to touch a file outside their brief: allow it when no live worker holds that file, and append the allowance to their brief.

1. When w76 or w77 reports: check the head, close its tab, launch the next brief. Order: w78-fix116 (3 P0, Opus), w79-fix113 (Opus), w81-fix115 (Opus), w80-fix114 (Sonnet high), w82-fix119 (Sonnet medium; merges `claude/63-m1b` first), w83-fix117 (Sonnet medium). None of these shares a file with w76 or w77.
2. When all of reviews 6 to 8 are fixed, write Codex batch 14 in `codex-reviews/` (the format of batch 13): re-review #107, #108, #126, #130, #111, #124, #116, #113, #114, #115, #119, #117 at their new heads.
3. Then the #90 WSL failure worker (orch-28's Next 2).
4. Watch Codex: `gh api 'repos/mogesjohnson/shadow-army/issues/63/comments?since=2026-11-25T00:00:00Z'`. Merge what Codex approves at the exact head, typed into a + tab with TRACE (V13, V14, `--match-head-commit`), then close that tab.

## For the owner

- **Codex batch 13 is ready to start** (it covers the fixed #106, #120 and #121 and the new #143): `Do the task in C:/Users/johns/projects/AIConnections/codex-reviews/11-24-2026-codex-review-13.md`.
- Stale cockpit task worktrees at `383c9ba` (for example `w25-lease-bring-lease-to-spec-m1b-3`, `w27-lock-build-...`, `w34-trust-m1b-10-...`) are left in place. Deleting worktrees needs the owner's yes.
