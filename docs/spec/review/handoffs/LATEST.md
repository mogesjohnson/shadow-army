# Handoff: orchestrator 40 (`8ce651b6`) to orchestrator 41 (2026-11-25)

Self-contained: do not read older handoffs. Range `94f4c86` to this commit.

## Owner's instructions in force

- **Workers resumed** (2026-11-25 ~14:00 UTC): at most three, none new at 80% of the 5-hour limit (46% at 15:20).
- **"everytime we have something new make a md for codex"** (2026-11-25): after verifying a worker's report, add its PR to the next `codex-reviews/11-25-2026-codex-review-<n>.md` in the main checkout (copy review 16's layout) and tell the owner it is ready.
- Every tick: `codex_tick.sh <last ISO>` AND each review file's `## Result` (review 15 landed between ticks and was missed for 9 hours). Most tick hits are workers' replies; Codex verdicts start "Codex review <n>:".
- #136's Windows fix is the faster spawn (#144), not a longer timeout.

## Running workers (report to orch-40; tell them your name)

- **w102-fix137-turns** (`78dd7ae8`): #137 review 11 C5 to C7, `postOffice.ts` + test, branch `claude/63-m1b-po-startup` (head moving, `a8a8f79`+).
- **w110-fix138-sweep** (launched 15:28): #138 review 15 C6 to C8, `contain/sweep.ts`, `windows.ts` + tests. Afterwards #144 must merge #138's new head (a new brief).

## Done by orch-40 (verified, tabs closed)

- #119 `64fa048` (w105, review 8 C1 to C3). #144 new at `db2a90e` (w107, spawn 488 to 110 ms, cached hash-verified supervisor). Both in **review 16** (written, waits for the owner to hand to Codex).
- #137 `099f5de` (w98 merged #136; w108 fixed C2, C3, C8).
- #136 `febf216` (w109): the five Windows failures were stale Windows-only tests (WSP-11 discard, MSG-4 interrupted); tests fixed, `postOffice.ts` unchanged. Windows + #144: 48/48.

## Codex review 15 results (changes requested; need fix briefs)

#123 C2, C4, C8, C9 · #125 C9, C10 · #127 C2 (PO-14 gate; must not merge before it) · #129 C5 · #132 C1, C2, C5, C8, C9 (2 P0) · #128 C1 (P0), C5 · #135 C5 · #138 (w110) · #140 C8 · #136 C1, C2, C9 (P0), C7, C8. Read each with `gh api repos/mogesjohnson/shadow-army/pulls/<n>/reviews --jq '.[-1].body'`; files are in each review. Write one brief per PR (or per file group), checking file overlap first.

## Queues (one worker per file)

1. **`postOffice.ts`:** w102 now; then `w103-fix137-records` (C1, C4; tell it #137's head and to merge #136's head first); then #136 review 15 (C1, C2, C7 to C9: also `snapshot.ts`); then `w93-fix133`; then #139, #141, #142, #143 from their last reviews; then the PO-14 gate. Build note: `postOffice.ts`'s process-tree line lacks `creationTime`.
2. **`contain/*`:** w110 now; then #144 merges #138; #132, #129, #125, #135 review 15 items as their files allow.
3. Others: #123 (`contain/check.ts`), #128, #140.
4. Windows runs of office tests need a scratch local merge with `origin/claude/63-m1b-win-spawn` (never pushed).
5. Merge only with Codex's approval at the exact head (V13, V14).

## Lessons

- Workers start near 95k context and reach 150k fast: one finding group per brief, commit after each finding, output through `tail`.
- A patch script with a cut range deleted code a merge brought in (w98): edit by hand after a merge.
- GitHub 503s happen: retry the tick from the same ISO.
