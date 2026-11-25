# Shadow Army v2: current state

A short current state, rewritten at each orchestrator handoff. The working detail is in [`handoffs/LATEST.md`](handoffs/LATEST.md). The log up to 2026-11-25 is in git: `git show 013be2e:docs/spec/review/STATE.md`.

- **Spec:** v0.28, frozen 2026-11-23 for the build (D-39, prototype first). M1 is cut to M1a (Windows-only slice) and M1b (the rest of M1).
- **Build:** M1a on draft PRs #89 to #104; M1b on #105 to #144, stacked on `claude/63-m1b` and its `claude/63-m1b-base-*` branches. #144 makes the Windows managed spawn fast (488 to 110 ms).
- **Codex:** reviews 1 to 21 are done (summaries on #63); 22 (#119), 23 (#138) and 24 (#128) are written and wait for the owner. Review 20 recommends approving #114 (merge waits for the owner: auto mode blocks `gh pr merge`). Approved earlier: #89, #105, #112, #118, #122 (#122 merged into `claude/63-m1b`).
- **Fixes:** Claude workers fix each review's C items on the PR's own branch, one worker per file, at most three at once (the owner allowed workers again at ~20:45 UTC 2026-11-25). The queues are in LATEST.md.
- **Process:** RUNBOOK.md section 0 (orchestrator and workers; orchestrator hands off at 175k, workers stop at 150k).
