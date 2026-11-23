# Handoff: orchestrator 2 (`99e6c5ce`) to orchestrator 3 (2026-11-23)

**State.**
- **M1a's code is complete and joined.** The spec is still v0.28 (`7055b8d`). The slice's PRs, all drafts:

  | PR | Branch | Base | What |
  |---|---|---|---|
  | (none, S-3) | `claude/63-m1a-transport` | `main` | B1: #75's transport cut to M1a |
  | #91 | `claude/63-m1a-mod-core` | B1 | B2: `/send` and its card |
  | #89 | `claude/63-m1a-mod` | #91 | B2: the mod's manifest, hook list, README |
  | #90 | `claude/63-m1a-write` | B1 | B3: claims, claim audit, guard |
  | #92 | `claude/63-m1a-apply-core` | #90 | B4: apply to the owner's folder, uncommitted |
  | #93 | `claude/63-m1a-apply-claims` | #92 | B4: claims through `server.ts` |
  | #94 | `claude/63-m1a-slice` | #93 | B5: joins #89; two fixes to #91's code; the end-to-end test; `docs/v2-m1a-live-run.md` |

- **Evidence, all local on Windows; CI is off.** On #94's head: tsc and build pass; 482 tests pass, `vault.test.ts` timed out under load and passes alone. `src/v2/slice.test.ts` runs the real command server with the fake claude: an applied turn, a reverted out-of-claims file, a clash, each with its card. A real claude has not run.
- **Known limits:** a session's claims are fixed at open and the mod has no close, so a claims change needs a new session; a second turn that edits a file an earlier turn already applied is refused with the clash reason.
- **The owner's answers (2026-11-23, `suggested.md`):** S-3: B1 is draft **#95** on `main` under a V6 size exception in the owner's words. S-1 declined (no T3 Code). S-4: checks run locally only, Windows plus Linux in WSL Ubuntu; GitHub's workflows stay off; macOS is dropped. The unused branch `claude/63-m1a-apply` is deleted. The owner has the live-run steps.
- **Running: `w10-local-ci`** (Sonnet, medium; brief `.shadow/v2-tools/tasks/w10-local-ci.md`): `npm run ci:local` in `scripts/ci-local.mjs`, `package.json`, `docs/ci-local.md`; branch `claude/63-local-ci` on `main`; it may install Node in WSL. It reports to orch-3. Check its PR, close its tab, then use `ci:local` as the Validation evidence for every PR, and turn its Linux failures into tasks.
- **Previous handoff:** `git show 0324c20:docs/spec/review/handoffs/LATEST.md`.

## Next

1. **M1-AC29, the live run, is the owner's.** Steps: `docs/v2-m1a-live-run.md` on `claude/63-m1a-slice` (worktree `../AIConnections-worktrees/m1a-slice`). The write-up goes on #94.
2. **Codex reviews #95 and #89 to #94.** Fix Codex's findings with one worker per PR stack; merge only with Codex's approval at the head, merge commits, retargeting first (V13, V14). Merge order: B1, then #91 and #90, then #89, #92, #93, #94.
3. While waiting, open candidates (none blocks M1a): T4-report's B5 spec trace checker and B6 roster edits; the mod's missing close (so claims can change), a build note for M1b.

## For the owner

- **The live run** (above).


- Older: P-17's Windows cases; alpha Q4, deferred; the `Co-Authored-By: Ziggy` line on #81; the cockpit's "+" choice; build notes R-F-177, R-F-183, R-F-184.

## Notes

- B2's first PR (#89, 428 lines) was split by pushing a new branch at its third commit and retargeting #89 onto it: no history rewrite, both PRs within V6. Use the same move for any over-size PR.
- Running the joined slice end to end found two mod bugs that every unit test had missed (their fakes matched the wrong shapes). Have tests use the real types from `channel.ts`.
- Records are committed from `../AIConnections-worktrees/orchestrator-1-spec-review`, detached at the review branch, with `git push origin HEAD:claude/63-ultimate-spec-review`.
