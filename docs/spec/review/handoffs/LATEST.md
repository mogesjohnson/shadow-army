# Handoff: orchestrator 4 (`c690b07d`) to orchestrator 5 (2026-11-23)

**State.**
- **The pre-review's fixes are all in,** as draft PRs based on `claude/63-m1a-slice` (#94), with disjoint files. Merge them after #94, in any order:

| PR | Head | Worker | Fixes | Files | Size |
|---|---|---|---|---|---|
| #96 | `6a404f3` | w14 | W11-2, W11-4 (P1: sends now go over `node:http`) | `src/v2/claude.ts`, `client.ts`, their tests, `test/fakes/claude.mjs` | 98 lines, 5 files |
| #97 | `0cf2427` | w15 | W12-5, W12-6, W12-4 as a known limit | `plugins/shadow-army/hooks/register.ts` and its test, `docs/v2-m1a-live-run.md` | 51 lines, 3 files |
| #99 | `0d0f836` | w13 | W12-1 (P1), W12-2, W12-3, W11-1, W11-3 | `src/v2/postOffice.ts`, `postOffice.test.ts`, `postOffice.fixes.test.ts` | 311 lines, 3 files |
| #98 | `82efdd3` | w10 | `npm run ci:local` (Windows, then WSL Ubuntu on a fresh clone) | `scripts/ci-local*.mjs`, `package.json`, `docs/ci-local.md` | 341 lines, 5 files, base `main` |

- Each fix PR reports `tsc`, build and `npm test` passing on Windows, with every new test failing on the old code. orch-4 checked each one's `git show --stat`, V6 sizes and body, and corrected the CI item in #96 and #97 to `not_run` (the workflows are disabled).
- **#99's limit:** the 20-minute session heartbeat is not exercised by a test, only the per-turn renewal.
- **Codex has not reviewed any of #89 to #99.**
- **No workers are running.** All their tabs are closed.

## Linux failures (from #98's PR comment)

- `main` (`383c9ba`): 6 tests fail on Linux only (apply x4, links, monarch). On Windows, one vault test failed once (load flake suspected).
- #94 (`8d3b298`): 36 tests fail in 9 files on Linux, and coverage falls to 86.24% lines. Windows passes in full (483 tests, 91.61%).

## Next

1. **Turn the Linux failures into tasks.** Start with a triage: read #98's comment (`gh pr view 98 --comments`), group the failures by cause and file. Then one fix task per file group, keeping files disjoint between live workers. The v1 failures (apply, links, monarch) go on `main`. A v2 failure in a file #96, #97 or #99 owns stacks on that PR's branch. To run `ci:local` before #98 merges, see `docs/ci-local.md` on #98's branch.
2. **An integration branch for the live run** (recommended, undoable, inside the repo): `claude/63-m1a-integrate` = #94 with #96, #97 and #99 merged in (merge commits), checked with `ci:local`. The owner runs M1-AC29 from it, since W11-4 and W12-1 both hit a live run. Tell the owner when it is ready.
3. **Codex** reviews #95, #89 to #94 and #96 to #99 when the owner runs it. In replies to findings already fixed, name the fix PR. Merge only with Codex's approval at the head (V13, V14).
4. **Build notes for M1b:**
   - W12-4: WSP-11 should cover ignored files outside `.shadow/`.
   - The mod's missing close: claims are fixed at session open.
   - #97's mod finds the log root by walking up to the nearest `.git`. `open` should return the log path, so the mod does not guess (thin orchestrator; a submodule would mislead the walk).
   - #99's session heartbeat needs a test.

## For the owner

- The live run, best from the integration branch above.
- Older: P-17's Windows cases; alpha Q4, deferred; the `Co-Authored-By: Ziggy` line on #81; the cockpit's "+" choice; build notes R-F-177, R-F-183, R-F-184.

## Notes

- Worker worktrees left in place: `../AIConnections-worktrees/w10-local-ci`, `w13-fix-office`, `w14-fix-channel`, `w15-fix-mod`, plus the reviewers' `w11-review` and `w12-review`. Removing them needs the owner's yes, after the merges.
- Records are committed from `../AIConnections-worktrees/orchestrator-1-spec-review`, detached at the review branch, with `git push origin HEAD:claude/63-ultimate-spec-review`.
- Three workers running `npm test` at once slow every run to several minutes. Expect that and don't treat it as a hang.
- Previous handoff: `git show 7c91a40:docs/spec/review/handoffs/LATEST.md`.
