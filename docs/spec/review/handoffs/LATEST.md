# Handoff: orchestrator 3 (`9db80795`) to orchestrator 4 (2026-11-23)

**State.**
- M1a's code is the same as at orch-2's handoff: drafts #95 (B1), #91, #89, #90, #92, #93, #94 (see `git show 3daeb76:docs/spec/review/handoffs/LATEST.md` for the table). The spec is v0.28 (`7055b8d`). **Codex has not reviewed any of them yet.**
- **Pre-review done** (read-only, as Codex would review, with the owner's seven failure simulations). Reports in `.shadow/v2-tools/tasks/`:
  - `w11-review-transport-report.md` (B1, #95): **1 P1, 3 P2.** W11-4 P1, confirmed by a probe: `client.ts`'s `fetch` fails a send whose turn runs past 300 s (undici `HeadersTimeoutError`), and `sa live` then shuts the office down mid-turn. W11-1: a guard failure drops the native error kind (PO-8). W11-2: one non-JSON stdout line kills the channel (CH-1 says ten in a row). W11-3: restarts have no backoff or reset and restart after `login_needed` (PO-1).
  - `w12-review-slice-report.md` (#89 to #94): **1 P1, 5 P2.** W12-1 P1: a failed or interrupted claims turn's partial edit reaches the owner's folder through the next completed turn. W12-2: the lease is not renewed after turn 1. W12-3: one soldier's apply fails another's concurrent guard. W12-4: ignored files are unguarded (v1 guard). W12-5: the card's log path comes from Claude's cwd. W12-6: the card hides the audit error and does not mark a refusal.
- **Fix plan:** three sibling draft PRs, each based on `claude/63-m1a-slice` (#94), with disjoint files. Merge them after #94, in any order.

## Running workers

| Worker | Session | Model | Task | Files | Branch |
|---|---|---|---|---|---|
| `w10-local-ci` | `01b1c8c6` | Sonnet | `npm run ci:local` (Windows and WSL Ubuntu) | `scripts/ci-local.mjs` and its test, `package.json`, `docs/ci-local.md` | `claude/63-local-ci` on `main` |
| `w13-fix-office` | `5b52c065` | Opus | W12-1, W12-2, W12-3, W11-1, W11-3 | `src/v2/postOffice.ts`, `apply.ts`, `lease.ts` and their tests | `claude/63-m1a-fix-office` on #94 |
| `w14-fix-channel` | `33cd0424` | Sonnet | W11-2, W11-4 (with `node:http`, no new dependency) | `src/v2/claude.ts`, `client.ts` (`server.ts` only if needed) and their tests, `test/fakes/claude.mjs` | `claude/63-m1a-fix-channel` on #94 |

All are at medium effort, with briefs in `.shadow/v2-tools/tasks/<name>.md`. **They report to `orch-3`.** When you start, SendMessage each one: "orch-3 handed off: report to orch-4." w14's cockpit title is its prompt ("Fix W11-2 ..."), because it had not named its task yet at the last check.

## Next

1. **Launch `w15-fix-mod`** (brief ready: `.shadow/v2-tools/tasks/w15-fix-mod.md`, Sonnet, medium; W12-5, W12-6, and W12-4 as a known limit in `docs/v2-m1a-live-run.md`; files `plugins/shadow-army/hooks/register.ts` and its test, and that doc). Launch it as soon as a slot frees: at most three workers at once, and three are running.
2. **Check each fix PR** as it reports: `git show --stat`, the PR body against CLAUDE.md, tests that fail before and pass after. Close the tab.
3. **w10's PR:** check it, close the tab, then use `npm run ci:local` as the Validation evidence for every PR. Turn its Linux failures into tasks.
4. **The live run (M1-AC29)** is the owner's: tell the owner to run it from a branch with the fixes, since W11-4 and W12-1 both hit a live run.
5. **Codex** reviews #95, #89 to #94 and the fix PRs when the owner runs it. In replies to findings already fixed, name the fix PR. Merge only with Codex's approval at the head (V13, V14).
6. **Build notes for M1b:** W12-4 (WSP-11 should cover ignored files outside `.shadow/`), and the mod's missing close (claims fixed at session open).

## For the owner

- The live run, now best run with the fix PRs on top.
- Older: P-17's Windows cases; alpha Q4, deferred; the `Co-Authored-By: Ziggy` line on #81; the cockpit's "+" choice; build notes R-F-177, R-F-183, R-F-184.

## Notes

- The reviewers' detached worktrees `../AIConnections-worktrees/w11-review` (`2ab8925`) and `w12-review` (`8d3b298`) hold uncommitted probes (`probe-fetch-timeout.mjs`, `src/v2/w12.probe.test.ts`). The fix workers may read them. Removing a worktree needs the owner's yes.
- The cockpit offers this session a task worktree (`orchestrator-3-m1a`). Records are still committed from `../AIConnections-worktrees/orchestrator-1-spec-review`, detached at the review branch, with `git push origin HEAD:claude/63-ultimate-spec-review`.
- A reviewer worker filled 150k in about five minutes: give review tasks a narrower range.
- Previous handoff: `git show 3daeb76:docs/spec/review/handoffs/LATEST.md`.
