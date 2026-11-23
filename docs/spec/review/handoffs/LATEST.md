# Handoff: orchestrator 5 (`aba81e8b`) to orchestrator 6 (2026-11-23)

**State.**
- **The live run can start.** `claude/63-m1a-integrate` (`22da257`, built by w17) is #94 with #96, #97 and #99 merged in (merge commits, no conflicts). On Windows, tsc, build and `npm test` pass (497 tests). It is a run branch with no PR. orch-5 told the owner on #94. The owner runs M1-AC29 from it.
- **Linux failures, being fixed:**

| PR | Head | Worker | Fix | Base | Size |
|---|---|---|---|---|---|
| #100 | `88f38bc` | w16 | git 2.43's `git apply --intent-to-add` also stages modified and deleted files: `src/workspace/apply.ts` now runs a plain apply, then `git add -N -f`. The links test writes a relative gitdir on git before 2.48. All 6 failures on `main` pass on Linux. | `main` | 23 lines, 2 files |
| #101 | `a73e593` | w16 | The same apply fix on #94: 3 of `src/v2/apply.test.ts`'s 4 failures pass. | #94 | 23 lines, 2 files |

- **Running: `w18-linux-channel`** (Sonnet, medium; brief `.shadow/v2-tools/tasks/w18-linux-channel.md`). It handles the 26 v2 tests that fail on Linux, plus `src/v2/slice.test.ts` and apply.test's "cancelled turn" test, which orch-5 added by message. The failure list is in `.shadow/v2-tools/tasks/w17-integrate-report.md`. Likely cause: session containment is Windows-only, so each native turn on Linux ends `interrupted` ("channel … is down"). **orch-5's decision:** M1a is Windows-only (D-39). Tests that fail only for that reason run on Windows only, through one shared guard that gives the reason. Any other cause gets fixed. No POSIX containment until M1b.
  - Its files: the v2 test files above, one testutil and `test/fakes/**`. Source files only for a non-containment bug.
  - Branches: `claude/63-m1a-linux-*`, with up to three stacked draft PRs (on #94, #96 and #99).
  - It was told to report to orch-5. orch-5 has redirected it to `orch-6`.
- Codex has reviewed none of #89 to #101.
- Closed tabs: orch-4, w16, w17. Open: w18.

## Next

1. **Take w18's report.** Check each PR with `git show --stat`, V6 and its body, then close its tab. Check that only containment-caused tests are guarded: each skip needs the reason.
2. **Re-run Linux on the integrate branch:** merge #101 and w18's PRs into `claude/63-m1a-integrate`, the same way w17 did, and run `npx vitest run` in a WSL clone. The target is 0 failures, with skips only for the stated reason. A small worker task: no source edits.
3. **Codex** reviews #95, #89 to #94 and #96 to #101 when the owner runs it. Merge only with Codex's approval at the head (V13, V14). #100 and #98 are based on `main`.

## Build notes for M1b

- W12-4: WSP-11 should cover ignored files outside `.shadow/`.
- The mod has no close: claims are fixed when the session opens.
- #97's mod finds the log root by walking up to the nearest `.git`. `open` should return the log path instead, so the mod does not guess.
- #99's session heartbeat needs a test.
- POSIX session containment, so the v2 native tests run on Linux (new, orch-5).

## For the owner

- The live run, from `claude/63-m1a-integrate`.
- Older: P-17's Windows cases; alpha Q4, deferred; the `Co-Authored-By: Ziggy` line on #81; the cockpit's "+" choice; build notes R-F-177, R-F-183, R-F-184.

## Notes

- WSL: Ubuntu 24.04, git 2.43.0, with no global git identity or `init.defaultBranch`, and Node in `~/.local/node/bin`. Each worker uses its own clone at `~/ci/<name>`. `ci:local` always uses the shared `~/ci/shadow-army`, so never run two of those at once.
- Worktrees left in place: `w16-linux-git`, `w16-linux-git-v2` and `w17-integrate`, plus those from orch-4's list. Removing them needs the owner's yes.
- Records are committed from `../AIConnections-worktrees/orchestrator-1-spec-review`, detached at the review branch, with `git push origin HEAD:claude/63-ultimate-spec-review`.
- Previous handoff: `git show b0021fc:docs/spec/review/handoffs/LATEST.md`.
