# Handoff: orchestrator 44 (`53a1b611`) to orchestrator 45 (2026-11-25 ~23:55 UTC)

Self-contained: do not read older handoffs. Range `31531c3` to this commit. The owner said "yes launch your self": orch-44 launched orch-45.

## Owner's instructions in force

- **Two active workers: one Ink (v2.1) and one main (fix or spec), side by side** (the owner asked "can we have both ink and main work at the same time?", orch-44 said yes, 2026-11-25). Memory is tight: check free memory before each launch; no second worker below 1.5 GB free. A worker waiting on the owner does not count. At most three workers; none new at 5h 80%+.
- Timers: hi 50 min, watch 5 min.
- A Codex file for every pushed fix, now in **`C:/Users/johns/codex-reviews/shadow-army/`** (moved out of the main checkout at the owner's request, 33 files verified; the owner points Codex there). Next is **34**; copy review 33's layout; tell the owner. Tick: `codex_tick.sh <last ISO>`; last tick `2026-11-25T23:46:41Z`.
- Merges only when the owner asks in the session: `gh pr list --base <branch>` (V14), `gh pr ready <n>`, `gh pr merge <n> --merge --match-head-commit <40-char sha>`.
- Workers overshoot 150k fast (w126: 120k to 169k in five minutes). Brief at most two findings per worker.

## Done this session

- **#119 merged** into `claude/63-m1b` (`22fd08d`), owner's request; branch kept.
- **v2.1 UI decided** (S-9): War Table, a standalone full-screen Ink app `shadow`, fixtures now, connect after M1b. Owner approved **D-40** (v2.1 lifts the Ink non-goal) and **D-41** (a read-only viewer feed) in `decisions.md` (`fbe9b76`). Owner's view: build the Ink screens on fixtures, alternating with the fix queues; connect after M1b (first option: the app starts its own post office, as `sa live` does).
- **w126:** #138 at `d11dbd9`: C6, C10 fixed; C9 partly (Windows `leftOf` unwired, its live test skipped). Codex file 33 written. PR body `Validation:`/`Size:` not updated; Linux not run. `## Left` in `w126-fix138-review25.md`.

## Waiting on the owner

1. Tell Codex about review 33 (and the new folder).
2. This machine's profile ACL grants Modify to `CodexSandboxUsers`, so #138's new C6 check marks every `.shadow` record unverified. Ask whether the ACL or the check should change (owner's setting: do not change it yourself).

## Running workers

- **w127-ui-v21-slice** (Opus medium), launched 23:55: the first v2.1 slice, brief `.shadow/v2-tools/tasks/w127-ui-v21-slice.md`, worktree `AIConnections-worktrees/ui-v21-start`, new files `src/v21/ui/` only, one draft PR off `main`. Reports to orch-45. SendMessage it your name.

## Queues (one worker per file; one Ink lane and one main lane)

1. `w128-spec-d40-d41.md` (Sonnet medium): D-40 and D-41 into `docs/spec/v2.md` in the review worktree; do not edit that worktree while it runs.
2. `contain/sweep.ts`, `windows.ts`: #138 rest of C9 + PR body (`## Left` in w126's brief) → #144 C1, C6 → #132 C1, C5, C10 to C12 (align identity units with #138's FILETIME) → #129, #125, #135.
3. `register.ts`: #128 C5, C9, C10 → #134 C5 → #131 C3, C9.
4. `postOffice.ts`: #136 C1, C2 (design P0s); then #137 review 17.
5. `snapshot.ts`: #120 C9 to C11 (review 31).
6. Others: #117 review 20, #123, #140. Then the next v2.1 slices (screens on fixtures).

## Codex results (all "changes requested" unless said)

| PR | Head | Review | Open |
|---|---|---|---|
| #138 | `d11dbd9` | 33 pending | C9 open |
| #128 | `6b0ad4e` | 24, 28 | C5, C9, C10 (P0) |
| #134 | `cb7d79a` | 26 | C5 |
| #131 | `eb3a3b6` | 27 | C3, C9 (C5 after `/army`) |
| #144 | `f251dc1` | 29 | C1 (P0), C6 |
| #132 | `3aa0c22` | 30 | C1 (P0), C5, C10 to C12 |
| #120 | `9d43b69` | 31 | C9 to C11 |
| #136 | `4f8737c` | 32 pending | C1, C2, C9 |

## Lessons

- This tab was orch-43's, reused with `/clear`; `/rename orch-44` fixed the name other sessions see. Launch each orchestrator with `-n`.
- A WSL clone that fails must not fall back to `/mnt/c`. Codex runs Windows tests with PowerShell 7's `PSModulePath`; clear it process-locally in such tests.
