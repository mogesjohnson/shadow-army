# Handoff: orchestrator 48 (`3889c94f`) to orchestrator 49 (2026-11-26 ~03:05 UTC)

Self-contained: do not read older handoffs. Range `7356098` (orch-47's handoff) to this commit. The 5-hour limit reset at 02:30 UTC; it was 24% at 02:57.

## Owner's instructions in force

- **Two lanes side by side: one Ink (v2.1) worker and one main (fix) worker** (the owner, 2026-11-25). No second worker below 1.5 GB free. At most three workers; none new at 5h 80%+.
- Timers: hi 50 min, watch 5 min. If Claude Code kills them for low memory, report it and wait for the owner.
- A Codex file for every pushed fix or new PR in `C:/Users/johns/codex-reviews/shadow-army/` (copy the newest file's layout). Files 48 to 50 are assigned below; **next free: 51**. Last tick `2026-11-26T02:56:53Z`.
- Merges only when the owner asks in the session: `gh pr list --base <branch>` (V14), `gh pr ready <n>`, `gh pr merge <n> --merge --match-head-commit <40-char sha>`.
- At most two findings per worker brief. Ink briefs point at the local artifacts in `.shadow/artifacts/` (the owner, 2026-11-26).

## Running workers (report to orch-48; tell them your name)

| Worker | Session | Task | Files | Codex file |
|---|---|---|---|---|
| w144-fix149-c1c2 (Sonnet) | `9d588ce0` | #149 C1, C2, C3 (review 41); merges `claude/63-v21-table` in first | `src/v21/ui/summaryRows.ts`, `ledgerRows.ts`, `screens.test.tsx`, `fixture.ts` | 48 |
| w145-fix128-c9c5-r2 (Opus) | `c12a3a91` | #128 C9 (P0), C5, second round (reviews 45, 46) | `plugins/shadow-army/hooks/register.ts`, `register.test.ts` | 49 |

## Codex now reviews within about 5 minutes of a push

Reviews 32 to 47 all landed 02:24 to 02:57 UTC, every one "changes requested". A worker that has reported and is under about 110k can take the next round of the **same** findings by SendMessage (cheaper than a fresh worker, which starts at 75k to 95k).

## Queues (one worker per file)

- **Ink lane, next:** `tasks/w146-fix148-r3.md` is written: #148 at `cab2238`, review 47 C1 (answers dropped by a long question) and C2 (use `string-width`, Ink's own width library, 8.3.0 already in `node_modules`; add it as a direct dependency). Codex file 50. Launch after w144 reports (both touch the War Table code paths). Then, bottom of the stack first: #145 (review 34: C1 to C4), #146 (36: C1, C2), #147 (38: C1 to C4), #150 (43: C1 to C3). Slice 5b (`shadow` command and keys, stacked on #150) after those.
- **Main lane, after w145:** #120 C12 (review 37, `src/v2/snapshot.ts:244-246`) → #134 C7 (review 40) → #131 C10 (review 42; C5 still open) → #138 C9, C10 (review 33, `contain/sweep.ts`, `windows.ts`) → #136 C1, C2, C9 (review 32, P0, design-sized: per-command Git hold, Windows snapshot root ACL, adopt the repaired snapshot audit; Opus) → #144 C1 (P0), C6 → #132 C1 (P0), C5, C10 to C12.
- Fix briefs: copy `tasks/w145-fix128-c9c5-r2.md` (points at `codex-fix-common.md`).

## Open PR heads (latest Codex verdict: changes requested on all)

#128 `7d0caf4` (46) · #148 `cab2238` (47) · #149 `e38e33e` (41) · #150 `2bd55ab` (43) · #145 `183b8e6` (34) · #146 `d5a70e4` (36) · #147 `bce5141` (38) · #120 `9ae8f9d` (37) · #134 `0c4aea1` (40) · #131 `a892da4` (42) · #136 `4f8737c` (32) · #138 `d11dbd9` (33) · #144 `f251dc1` (29) · #132 `3aa0c22` (30).

## Waiting on the owner

1. #138 C6 (P0): change the profile ACL that grants Modify to `CodexSandboxUsers`, or change the check?
2. Spec Q11 (viewer credential and port): before M7.
3. Remove the unused worktree `AIConnections-worktrees/ui-v21-monarch`?

## Lessons

- Workers could not find "orch-48" in ListAgents because orch-48 was started without `-n`; it is listed as `aiconnections-f3`. Start each orchestrator with `claude -n orch-<n>` so workers can address it.
- Repository Actions is disabled, so no PR gets checks: `Validation:` says CI `blocked` with that evidence, macOS `not_run`.
- Ink layout fixes keep reopening on width: measure with `string-width` (what Ink uses), never code points or a local table.
