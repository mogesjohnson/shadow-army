# Handoff: orchestrator 43 (`95501e2c`) to orchestrator 44 (2026-11-25 ~23:00 UTC)

Self-contained: do not read older handoffs. Range `32d1e47` to this commit. The owner stopped new sessions here ("stop new session after this latest"); orch-44 is started by the owner, not by orch-43.

## Owner's instructions in force

- Workers: at most three; none new at 5h 80%+. **Memory is tight: run one active worker at a time.**
- Timers: hi 50 min, watch 5 min. Claude Code killed orch-43's timers for low memory (~21:50); start yours, and if they are killed again, do not restart them until the owner asks.
- A Codex file for every pushed fix: `codex-reviews/11-25-2026-codex-review-<n>.md` in the main checkout (copy review 31's layout; next is **32**); tell the owner. Tick: `codex_tick.sh <last ISO>`; last tick `2026-11-25T21:46:44Z`.
- Merges: auto mode refuses them unless the owner asks in the session. When the owner asks, check `gh pr list --base <branch>` (V14), `gh pr ready <n>`, then `gh pr merge <n> --merge --match-head-commit <full 40-char sha>` (short SHAs are rejected).
- **New task from the owner: the v2.1 Ink UI**, brief `.shadow/v2-tools/tasks/ui-v2-start.md`. v2.0 keeps its screens in the mod (M5; the Ink non-goal binds v2.0 only). The brief's step 1 is a decision note and owner questions (which v2.1 design, Ink inside the mod or a standalone `shadow` app, which v2.0 pieces first), then a first Ink slice in new files (`src/v21/ui/`), based on `main`. It touches no running worker's files, so it can run beside the fixes. Opus, high.

## Waiting on the owner

1. **Merge #119** at `8ef4d0bd79da0bca39fa0681f2bac91325125ad1` (Codex review 22: approval recommended, one P2 note). Check for stacked PRs first.
2. **w115's cockpit hold** (`/cockpit task go` in its tab). Cause each time: Codex writes results into `codex-reviews/` in the main checkout, and the cockpit credits them to running sessions. Ask again whether to move `codex-reviews/` out of the main checkout.
3. The UI decision (above).

Done: **#114 merged** into `claude/63-m1b` (`7d2ec3a`, at the owner's request); its branch `claude/63-m1b-sanitize` is kept until the owner agrees to delete it.

## Running worker

| Name | Session | PR | Task | Files |
|---|---|---|---|---|
| w115-fix136-guardbase | `2670decf` | #136 | review 15 C7, C8 (C8 ready; C7 test hangs: tank's send never reaches makeSession during medic's turn; temporary debug logs in `postOffice.ts`, nothing committed) | `postOffice.ts` + test |

## Codex results (all "changes requested" unless said)

| PR | Head | Review | Still open |
|---|---|---|---|
| #119 | `8ef4d0b` | 22 | **approval recommended** |
| #138 | `543157c` | 23, 25 | C6, C9, C10 (P0 1, P1 2): deadline ends the wait while work stays active; ownership checks and helper lookup outside the timeout |
| #128 | `6b0ad4e` | 24, 28 | C5 (stream end does not prove the relay saw the post office exit; a stream failure before the stall misses the barrier); C9, C10 (P0) |
| #134 | `cb7d79a` | 26 | C5 (restart decision lacks terminal process-exit evidence) |
| #131 | `eb3a3b6` | 27 | C3 (a newer card replacing an overlapped one loses the decline), C9 (stale-card retry after an independent refusal); C5 plan must keep the roster response `/send` reads |
| #144 | `f251dc1` | 29 | C1 (permissions on compiler inputs and cache record; executable's resolved identity), C6 (PO-19 packaged guardian departure) |
| #132 | `3aa0c22` | 30 | C1 (Windows checks a path apart from the opened file), C5, C10 (Security module load failure; `PSModulePath`), C11 (unreported unreadable records), C12 (body). #132 and #138 must agree on identity units (#138 uses exact FILETIME) |
| #120 | `9d43b69` | 31 | pending |

## Queues (one worker per file; one finding group per brief)

1. `postOffice.ts` (after w115): #136 C1, C2 (design P0s); then #137 review 17.
2. `contain/sweep.ts`, `windows.ts`: #138 C6, C9, C10 → #144 C1, C6 → #132 C1, C5, C10 to C12 (align identity units with #138) → #129, #125, #135.
3. `register.ts`: #128 C5, C9, C10 → #134 C5 → #131 C3, C9 (C5 after `/army` exists).
4. `snapshot.ts`: wait for review 31 on #120.
5. Others: #117 review 20 (`scripts/check-spec-trace.mjs`), #123, #140.
6. v2.1 UI: `ui-v2-start.md` (new files only; parallel).

## Lessons

- A WSL command whose clone fails can fall back to `/mnt/c` and run `npm ci` in the main checkout (w122 did; restored). Briefs: abort if the WSL clone fails.
- Codex runs Windows tests with PowerShell 7's `PSModulePath`; clear it process-locally in tests that load Windows PowerShell modules.
- Workers reach 150k after about four findings.
