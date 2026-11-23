# Handoff: orchestrator 6 (`c6d2c417`) to orchestrator 7 (2026-11-23)

**State.**
- **M1a's run branch is green on Windows and Linux.** `claude/63-m1a-integrate` is at `2b78df6`: #94 with #96, #97, #99, #101, #102, #103 and #104 merged in (merge commits). Windows: tsc, build, `npm test` pass (497 passed, 4 skipped). Linux (WSL, git 2.43): 463 passed, 38 skipped, 0 failed. w19 commented on #94. The owner's live run (M1-AC29) can use this head.
- **Linux fix PRs, all drafts:**

| PR | Head | Base | What |
|---|---|---|---|
| #100 | `88f38bc` | `main` | git 2.43 apply fix (w16) |
| #101 | `a73e593` | #94 | the same fix on the slice (w16) |
| #102 | `f86ae1b` | #94 | `src/v2/windowsOnly.testutil.ts` (`it.runIf(win32)`, reason D-39) and 4 guarded tests (w18) |
| #103 | `99d0517` | #96 | 16 channel tests guarded; contains #102 (w18) |
| #104 | `f4ac137` | #99 | 10 post office tests guarded; contains #102 (w18) |

- Every guarded test starts a native session; on POSIX `spawnManagedProcess` throws "Session process containment is Windows only". orch-6 checked each diff.
- **#103 needs the owner's yes:** 7 files, over V6's 6, because #102's 5 files ride in until #102 merges (own change 2 files, 50 lines in all). Asked in chat; no answer yet. When it comes, add `Size exception: <reason>, "<the owner's words>", <date>` to #103's body.
- **Running: `w20-m1b-plan`** (Opus, medium, read-only; brief `.shadow/v2-tools/tasks/w20-m1b-plan.md`). It splits M1b into ~70k worker tasks with files, order and a base-branch recommendation, into `.shadow/v2-tools/tasks/w20-m1b-plan-report.md`. It reports to orch-6 or, after the handoff, to `orch-7`.
- Codex has reviewed none of #89 to #104.
- Closed tabs: orch-5, w18, w19. Open: w20.
- RUNBOOK 0.1 now says `git pull --rebase=merges` before a push. w19's plain `--rebase` flattened its merge commits; it was repaired with an empty-diff merge (`2b78df6`), no force-push.

## Next

1. **Take w20's report.** Check that parallel tasks share no file, then write briefs and launch up to three M1b workers (5-hour figure under 80%). Record the base-branch choice in `suggested.md` if it is a big change.
2. **Codex** reviews #95, #89 to #94 and #96 to #104 when the owner runs it. Merge only with Codex's approval at the head (V13, V14). #100 and #98 are based on `main`.
3. The owner's #103 size exception (above).

## Build notes for M1b

- W12-4: WSP-11 should cover ignored files outside `.shadow/`.
- The mod has no close: claims are fixed when the session opens.
- #97's mod finds the log root by walking up to the nearest `.git`. `open` should return the log path instead.
- #99's session heartbeat needs a test.
- POSIX session containment, so the guarded v2 tests run on Linux (then remove their `windowsOnly`).

## For the owner

- #103's size exception. The live run, from `claude/63-m1a-integrate` at `2b78df6`.
- Older: P-17's Windows cases; alpha Q4, deferred; the `Co-Authored-By: Ziggy` line on #81; the cockpit's "+" choice; build notes R-F-177, R-F-183, R-F-184.

## Notes

- WSL: Ubuntu 24.04, git 2.43.0, Node in `~/.local/node/bin`. Each worker uses its own clone at `~/ci/<name>`; never two `ci:local` runs at once.
- Worktrees left in place: `w16-linux-git`, `w16-linux-git-v2`, `w17-integrate`, `w18-*`, `w19-integrate-linux`, plus orch-4's list. Removing them needs the owner's yes.
- Records are committed from `../AIConnections-worktrees/orchestrator-1-spec-review`, detached at the review branch, with `git push origin HEAD:claude/63-ultimate-spec-review`.
- Previous handoff: `git show 0b6d799:docs/spec/review/handoffs/LATEST.md`.
