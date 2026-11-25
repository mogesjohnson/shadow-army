# Handoff: orchestrator 42 (`7d53aaff`, same tab as orch-41 after `/clear`) to orchestrator 43 (2026-11-25 ~21:05 UTC)

Self-contained: do not read older handoffs. Range `f9ee37d` to this commit.

## Owner's instructions in force

- **Workers allowed again** (the owner, ~20:45 UTC: "keep normal workers working too... progress in parallel so codex can review and then we could push forward"). At most three at once.
- **Timers:** the owner said yes to both (hi 50 min, watch 5 min) at ~19:45 UTC.
- **A Codex file for every pushed fix:** after verifying a report, write the next `codex-reviews/11-25-2026-codex-review-<n>.md` in the main checkout (copy review 24's layout) and tell the owner. Every tick: `codex_tick.sh <last ISO>` and each file's `## Result`. Last tick: `2026-11-25T21:04:09Z`.
- **Merges are blocked by auto mode** (`gh pr merge` denied at 21:00). Do not route around it; give the owner the exact `! gh pr merge <n> --merge --match-head-commit <sha>` command.
- The owner asked about the CLI's visuals (~20:55): orch-42 showed the Margin design (canvas `https://claude.ai/artifact/D75uVeeX9HGrvf43BdyVxB`, `.shadow/v2-tools/v21/out/d5.txt`) and asked whether `shadow` should be a launcher for `claude` with the mod (the spec has no `shadow` command) or a standalone app. **Awaiting the owner's answer.** Screen work (M5, `plugins/shadow-army/`) touches no running worker's files but should wait for the `register.ts` PRs.

## Waiting on the owner

1. **Merge #114** at `bd826eb` (Codex review 20: approval recommended; C4 checkbox fixed by orch-42; nothing stacked on it).
2. **Cockpit holds:** w115 and w117 are stopped until the owner types `/cockpit task go` in their tabs. Cause: the cockpit credits writes to `codex-reviews/` (main checkout) to running sessions. Asked the owner whether to move `codex-reviews/` out of the shared checkout.

## Running workers

| Name | Session | PR | Task | Files |
|---|---|---|---|---|
| w115-fix136-guardbase | `2670decf` | #136 | review 15 C7, C8 (held) | `postOffice.ts` + test |
| w117-fix120-snapshot | `b2717b74` | #120 | review 14 C9, C10 + #136 C9's path check (held) | `snapshot.ts` + test |
| w119-fix138-c10 | `0afc8bb3` | #138 | review 19 C10 (from w113's `## Left`) | `contain/sweep.ts`, `windows.ts` + tests |

Briefs: `.shadow/v2-tools/tasks/<name>.md`. When each reports: `git show --stat`, close its tab, write the next Codex file.

## Done by orch-42 (verified, tabs closed)

- #128 `b752002` (w114, review 18 C1), then `e15d222` (w118, review 21 C9, C10: all checkouts and WSP-11 snapshot roots barred). C5 (P1, review 15) still open.
- #138 `4fe4de2` (w113, review 19 C6, C7, C9, C11).
- #119 `8ef4d0b` (w116, review 16 C2; C5 note).

## Codex

- Done: 20 (#114 approve; #117 C1, C4 P1; #131 C3, C5, C8, C9 P1; #134 C1 to C5, 2 P0) and 21 (#128 C9, C10, fixed since).
- Written, waiting: **22** (#119 `8ef4d0b`), **23** (#138 `4fe4de2`, C10 noted as in progress), **24** (#128 `e15d222`).
- Older open: review 15 (#123 C2, C4, C8, C9 · #125 C9, C10 · #127 C2 · #129 C5 · #132 C1, C2, C5, C8, C9 · #135 C5 · #140 C8 · #136 C1, C2, C9), review 16 (#144 C1 to C5), review 17 (#137: P0 1, P1 5, P2 1).

## Queues (one worker per file)

1. `register.ts` (free now): #134 review 20 (2 P0), then #131 review 20, then #128 C5 (Opus medium).
2. `postOffice.ts` (after w115): #136 C1, C2 (design P0s), C9 once #120 is fixed; then #137 review 17.
3. `contain/*` (after w119): #144 merges #138's head and fixes review 16; #132, #129, #125, #135.
4. Others: #117 review 20 (`scripts/check-spec-trace.mjs`), #123, #140.

## Lessons

- Workers reach 150k after about four findings; one finding group per brief.
- Close a TRACE session before opening the next (`desktop_busy`).
- The window's first tab, titled "orch-41", is the orchestrator itself (orch-41's tab reused via `/clear`): never close it as a worker.
