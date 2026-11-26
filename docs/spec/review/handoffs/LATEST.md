# Handoff: orchestrator 55 (`b6c8725e`) to orchestrator 56 (2026-11-26 ~15:05 UTC)

Self-contained: do not read older handoffs. Range `719d909` (orch-54's handoff) to this commit. The 5-hour window reset at 15:00 (2% at 15:01). RAM about 3 GB free; no new worker below 1.5 GB.

## Running workers (report to orch-56; tell them your name)

- **w184-fix128-finish** (Sonnet medium): finish #128 C13 after w183 (code `1b53e0f`, tests `42d45cc`): WSL run, self-review, C13 reply, fix the PR body (it still says linked worktrees don't start), Codex file. Brief `w184-fix128-finish.md` -> `## Left` in `w183-fix128-c13.md`.
- **w185-fix139-finish** (Sonnet medium): finish #139 C2 driver after w181 (head `3741e28`): self-review, C2 reply, Validation/Size, Codex file, Linux rerun. Brief `w185-fix139-finish.md` -> `## Left` in `w181-fix139-c2-driver.md`.
- **w182-fix141** (Opus): stopped at 150k, tab still open: **close it**. Next worker: **w186**.

## Queue (one lane; `postOffice.ts` tasks one at a time)

1. **w186-fix141** (Opus medium, first): `## Left` in `w182-fix141.md`. #141 head `60a9f43` (merged #139's base at `c416ba0`). The AC11 branch-backed and C2 tests fail because the read-only snapshot's `diffState` counts the refs it shares with the repository; the fix is written there. Then C3, C4 (P1), C5, C6 (P2).
2. Then **#142** (C1 P0 `postOffice.ts:363`, C2 to C4 P1, C5 P2), then **#143** (C1 to C5 P0, C6/C7 P1, C8 P2). Write new briefs (`w142-*`/`w143-*` are old). Findings: `gh pr view <n> --json reviews -q '.reviews|last|.body' | grep -E 'C[0-9]+ ?\[?P[0-9]'` (the `^- C` pattern misses bold-styled reviews).
3. **#148** (Ink lane, Codex review 50: C1/C2 P1, C4 P2) waits until M1 is merged.
4. Codex ticks; merge on approval at the exact head, bottom-up, merge script in its own tab (RUNBOOK 0.2). Last tick `2026-11-26T13:35:51Z`: Codex reviewed #128 (review 49, C13 only) and #148 (review 50) at 13:35; nothing else since 11:07.

## Owner's instructions in force

- "we will keep pushing through prs as fast as we can, i will have codex review and after then we will merge" (2026-11-26): keep fix workers running past the 80% 5-hour line; Codex is the bottleneck.
- "stop the workers at 95% weekly and have them ping the api every 30 min ... then 5h reset happens then resume" (2026-11-26): in `codex-fix-common.md` (Limits). Workers' hi timer is `sleep 1800`. The cockpit line shows no weekly figure, so the 95% stop cannot be checked yet; asked the owner whether the cockpit should add it (no answer).
- Speed-up five; merge on approval at Codex's exact head; branch deletion needs the owner; a Codex file per pushed fix.

## Waiting on the owner

1. Weekly figure in the cockpit line (above).
2. Carried from orch-54: CodexSandboxUsers ACL (#138 C6, #137 trust check); #139 C4 paused close ends by containment's 10 s force; flatten plan; spec Q11; removing worktrees `ui-v21-monarch`, `w174-fix137`, `w174-fix137-finish-*`.

## Lessons

- The cockpit's duplicate-task stop held w180 for its whole life (it overlapped w178 on #139). Don't launch two workers on one PR at once; run them in order. Never answer the hold in the worker's tab.
- Workers start near 70k to 100k context: a full P0 plus three P1s does not fit in 150k. Give one P0 (or two P1s) per Opus worker, and use short Sonnet finish-up briefs (`w184`/`w185`) for replies, self-review and Codex files.
- With the 5-hour limit at 99%, workers stop mid-task; with the Limits rule they resume after the reset, but most hit 150k first. Plan for a finish-up worker.
