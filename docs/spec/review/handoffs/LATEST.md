# Handoff: orchestrator 43 (`95501e2c`) to the next orchestrator (2026-11-25 ~21:55 UTC)

Self-contained: do not read older handoffs. Range `32d1e47` to this commit. Written early as a checkpoint: memory pressure killed orch-43's timers and the 5-hour budget passed 76%.

## Owner's instructions in force

- Workers allowed, at most three; none new at 5h 80%+.
- Timers: hi 50 min, watch 5 min. **Claude Code killed orch-43's timers for low memory (~21:50); do not restart them until the owner asks.**
- A Codex file for every pushed fix: `codex-reviews/11-25-2026-codex-review-<n>.md` in the main checkout (copy review 30's layout); tell the owner. Tick: `codex_tick.sh <last ISO>`; last tick `2026-11-25T21:46:44Z`.
- Merges are blocked by auto mode: give the owner `! gh pr merge <n> --merge --match-head-commit <sha>`.
- Open owner question (orch-42): is `shadow` a launcher for `claude` with the mod, or a standalone app? Screen work waits for it.

## Waiting on the owner

1. Merge #114 at `bd826eb` (review 20 recommends approval).
2. Cockpit holds on w115 and w117 (`/cockpit task go` in their tabs); cause: writes to `codex-reviews/` are credited to running sessions. Ask whether to move `codex-reviews/` out of the main checkout.
3. Restart timers once memory recovers.

## Running workers (both held)

| Name | Session | PR | Task | Files |
|---|---|---|---|---|
| w115-fix136-guardbase | `2670decf` | #136 | review 15 C7, C8 (C8 fix ready, C7 test stalls) | `postOffice.ts` + test |
| w117-fix120-snapshot | `b2717b74` | #120 | review 14 C9, C10 + #136 C9 path check | `snapshot.ts` + test |

## Done by orch-43 (verified, tabs closed, Codex file written)

| PR | Head | Fixed | Left | Codex file |
|---|---|---|---|---|
| #138 | `543157c` | review 19 C10 | — | 25 (after 23) |
| #134 | `cb7d79a` | review 20 C1–C5 (sweep launch gated until #128, #132) | — | 26 |
| #131 | `eb3a3b6` | review 20 C3, C8, C9 | C5 (`/army` entry; needs integration stack, #143) | 27 |
| #128 | `6b0ad4e` | review 15 C5 | — | 28 (after 24) |
| #144 | `f251dc1` | merged #138; review 16 C1–C4 | — (do not merge before #138) | 29 |
| #132 | `3aa0c22` | review 15 C1, C2, C8, C9 | C5 (design in `tasks/w124-fix132-p0.md` `## Left`) | 30 |

Waiting for Codex: 22 (#119), 23 (#138), 24 (#128), 25 to 30.

## Queues (one worker per file)

1. `postOffice.ts` (after w115): #136 C1, C2 (design P0s), C9 once #120 is fixed; then #137 review 17.
2. `contain/sweep.ts`: #132 C5 (design ready), then #129, #125, #135.
3. `register.ts`: #131 C5 after the integration stack's `/army` exists.
4. Others: #117 review 20 (`scripts/check-spec-trace.mjs`), #123, #140.

## Lessons

- A WSL command that fails to clone can fall back to `/mnt/c` and run `npm ci` in the main checkout (w122 did; restored). Briefs should say: abort if the WSL clone fails.
- Memory is tight (3.6 GB free with 3 workers): one active worker at a time.
- Workers reach 150k after about four findings; one finding group per brief.
