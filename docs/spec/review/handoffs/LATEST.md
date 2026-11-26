# Handoff: orchestrator 49 (`a365f188`) to orchestrator 50 (2026-11-26 ~03:20 UTC)

Self-contained: do not read older handoffs. Range `485244b` (orch-48's handoff) to this commit. The 5-hour figure was 59% at 03:17 UTC.

## Owner's instructions in force

- **Two lanes side by side: one Ink (v2.1) worker and one main (fix) worker** (the owner, 2026-11-25). No second worker below 1.5 GB free. At most three workers; none new at 5h 80%+.
- Timers: hi 50 min, watch 5 min. If Claude Code kills them for low memory, report it and wait for the owner.
- A Codex file for every pushed fix or new PR in `C:/Users/johns/codex-reviews/shadow-army/` (copy the newest file's layout). Files up to 62 are written or assigned; **next free: 63**. Last Codex tick `2026-11-26T03:15:18Z` (no new reviews since 02:57; Codex has not yet reviewed any of orch-49's pushes).
- Merges only when the owner asks in the session: `gh pr list --base <branch>` (V14), `gh pr ready <n>`, `gh pr merge <n> --merge --match-head-commit <40-char sha>`.
- At most two findings per worker brief. Ink briefs point at the local artifacts in `.shadow/artifacts/`.

## Running workers (report to orch-49; SendMessage them your name)

| Worker | Session | Task | Files | Codex file |
|---|---|---|---|---|
| w152-fix138-c9c10 (Opus) | `04266284` | #138 C9, C10, C12 body (review 33); C6 left for the owner | `src/v2/contain/sweep.ts`, `windows.ts`, `windows.test.ts`, `sweep.test.ts` | 57 |
| w154-v21-merge-up (Sonnet) | launched 03:16 | merge #147 into #148, #148 into #149, #149 into #150; switch #149's `summaryRows.ts` to the shared `layout.ts` width helpers | merge resolutions, `summaryRows.ts` | 60, 61, 62 |

Brief files: `.shadow/v2-tools/tasks/<name>.md`. A worker that reported and is under about 110k takes the next round of the **same PR and review** by an appended `## Round 2` in its brief plus a SendMessage (done twice this session, cheaper than a fresh worker).

## Done this session (all verified with `git log --stat` on the remote, tabs closed)

#149 `aaa1c0d` (C1, C2, C3) · #128 `430c3c9`, `73080b1` (C9 P0 by refusing every linked checkout, a flagged behavior change; C5) · #148 `1152554` (C1, C2; `string-width` direct dependency) · #120 `2c30a41` (C12) · #145 `99d8cd0`, `6362c61` (C1 to C4) · #134 `117d2e6` (C7) · #131 `999e45b` (C10; C5 waits for #143) · #146 `bd5affa` merge + `0e3b9fc` (C1, C2) · #147 `4cd67ba` merge + `3162158`, `e7c5c49` (C1 to C4).

## Queues (one worker per file)

- **Ink lane, after w154:** #150 review 43 C1 to C3 (two per brief; it sits on the merged stack). Then slice 5b (`shadow` command and keys, stacked on #150).
- **Main lane, after w152:** #136 C1, C2, C9 (review 32, P0, design-sized: per-command Git hold, Windows snapshot root ACL, adopt the repaired snapshot audit; Opus) → #144 C1 (P0), C6 → #132 C1 (P0), C5, C10 to C12. Then answer Codex's reviews of this session's pushes as they land.
- Fix briefs: copy `tasks/w149-fix134-c7.md` (main) or `tasks/w151-fix146-c1c2.md` (Ink, with its base-merge step).

## Open PR heads

#128 `73080b1` · #145 `6362c61` · #146 `0e3b9fc` · #147 `e7c5c49` · #148 `1152554` · #149 `aaa1c0d` · #150 `2bd55ab` (#148 to #150 move when w154 pushes) · #120 `2c30a41` · #134 `117d2e6` · #131 `999e45b` · #136 `4f8737c` · #138 `d11dbd9` (w152) · #144 `f251dc1` · #132 `3aa0c22`. Latest Codex verdict on all: changes requested (pre-fix).

## Waiting on the owner

1. #138 C6 (P0): change the profile ACL that grants Modify to `CodexSandboxUsers`, or change the check?
2. Spec Q11 (viewer credential and port): before M7.
3. Remove the unused worktree `AIConnections-worktrees/ui-v21-monarch`?
4. #128 C9 now refuses every linked checkout (the army starts only from the main checkout). Codex will judge it; the owner may want to know.

## Lessons

- Repository Actions is disabled, so no PR gets checks: `Validation:` says CI `blocked`, macOS `not_run`.
- Ink width fixes: measure with `string-width` via the shared `layout.ts` helpers (exported on #145/#146); stacked branches take them by a base merge, never a second width routine.
- Start each orchestrator with `claude -n orch-<n>` so workers find it in ListAgents.
