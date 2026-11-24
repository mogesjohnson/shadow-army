# Handoff: orchestrator 13 (`7032c924`) to orchestrator 14 (2026-11-24)

Range on this branch: `9ae4f34..` this commit. Changed: this file and `STATE.md`.

orch-13 started at 02:05 UTC at 83k and handed off at about 165k. It closed orch-12, w36, w37 and w38, launched w38, w39 and w40, and checked #120 to #123. Working notes: `.shadow/v2-tools/tasks/orch-13-notes.md` in the main checkout.

**State.**
- M1b runs on `claude/63-m1b` (S-5). w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md`.
- **Waiting for Codex at their heads** (all draft): #105 to #119 as in the previous handoff (`git show 9ae4f34:docs/spec/review/handoffs/LATEST.md`), plus #120 M1b-25 snapshots `9034437` (on #106), #121 M1b-24 git hold `f13e3ef` (on #106), #122 M1b-20 part 1, messages and probe `5065f20` (on #105), #123 M1b-20 part 2, check and gate `3e8bf60` (on #122). orch-13 checked #120 to #123: every commit is within V6's 200 lines and 4 files, every PR within 400 lines and 6 files.
- The owner, 03:16 UTC: "do one more session we still have 18% left", so w38 started at 82% of the 5-hour figure. The figure reset at 06:00 UTC.
- GitHub Actions is still off. S7 (M1b-13) stays parked on it.

**Running, both reporting to "orch-13, or orch-14 if orch-13 has handed off".**

| Worker | Model | Task | Files | Base |
|---|---|---|---|---|
| w39-claude-usage | Sonnet medium | M1b-31, without AC3's fixture (B4) | `src/v2/claude.ts`, `claude.test.ts`, `test/fixtures/claude/README.md` | `claude/63-m1b-claude-faults` (#111) |
| w40-po-check-linux | Sonnet medium | `check.test.ts` on Linux for #122/#123, then both PRs' Validation lines | `src/v2/contain/check*`, `messages.ts`, `native/probe.mjs` | `claude/63-m1b-po-check-run` (#123) |

Both launched at 06:02 UTC. Check each report with `git show --stat` and the PR's size, then close its tab.

## Next

1. One slot is free. M1b-16 waits for the owner's B3. M1b-15 and M1b-22 need several unmerged bases: wait for Codex. Look in w20's plan for any other task whose bases are all open PRs and whose files no live worker holds.
2. **Caller work for later, once the bases merge** (post office, `postOffice.ts`): orch-12's list in the previous handoff, plus:
   - #120: the post office, guard and `sa live` pass a `GitFactory` over `HarnessGit`; on Windows, an ACL inspect from M1b-17.
   - #121: call `start()`, `check()` or `run()` around each harness git command, and `setTurnOpen()` during a turn's guard. w37 left out worktree metadata and own-snapshot trust, trusted-file copies for the M2 card, git 2.34 and 2.54, and macOS.
   - #122/#123: add `"native"` to `package.json`'s `files`; wire `createContainmentGate` where the post office starts and reconnects; `SystemSteps` come from M1b-15, 16 and 19; pass `smartAppControlCanBeUndone` (S7's build) and `testedMacOS` (PO-21).
3. For M1b-33 (from w35): `docs/spec/v2.md` on `claude/63-m1b` is stale (lacks M1-AC24 to 28).

## For the owner

- Open question from orch-11: a thin M2 slice (the codex channel, built like M1a) ahead of most of M1b's hardening. Not yet in `suggested.md`; waits for the owner's yes.
- The owner's live run M1-AC29 (`docs/v2-m1a-live-run.md`) is not recorded as done.
- Turn GitHub Actions back on, if intended. Still open: #103's size exception; B3 (Smart App Control check before M1b-16); B4 claude recordings; B5 live ACs; B6 esbuild; B9 the final PR's size exception.
- Unused cockpit worktrees `orch-8` to `orch-13` (and `w36-snapshots-m1b-25-wsp-11-snapshots-outside-folder`) under `AIConnections-worktrees/`: removing them needs the owner's yes.

## Notes

- WSL: w38's Linux run failed because the Windows PATH has parentheses that break quoting. The w39 and w40 briefs say to run `export PATH=$HOME/.local/node/bin:/usr/bin:/bin` first. `scripts/ci-local.mjs` exists only on `claude/63-local-ci`, not on the M1b bases.
- Workers start at about 100-120k and still overrun 150k: w38 reached 163k on a ~490-line task. Keep tasks to about 300 lines.
- TRACE as before: `invoke NewTabButton`, one window observation at depth 6, `type_text`, one `screenshot: "scaled"` check, Enter. Closing a tab is one TabView observation and one `invoke` of its `Close Tab`.
- Previous handoff: `git show 9ae4f34:docs/spec/review/handoffs/LATEST.md`.
