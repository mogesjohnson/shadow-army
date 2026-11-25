# Shadow Army v2: current state

A short current state, rewritten at each orchestrator handoff. The working detail is in [`handoffs/LATEST.md`](handoffs/LATEST.md). The log up to 2026-11-25 is in git: `git show 013be2e:docs/spec/review/STATE.md`.

- **Spec:** v0.28, frozen 2026-11-23 for the build (D-39, prototype first). M1 is cut to M1a (Windows-only slice) and M1b (the rest of M1).
- **Build:** M1a on draft PRs #89 to #104; M1b on #105 to #144, stacked on `claude/63-m1b` and its `claude/63-m1b-base-*` branches. #144 makes the Windows managed spawn fast (488 to 110 ms).
- **Codex:** reviews 1 to 16 are done (summaries on #63); reviews 15 and 16 requested changes on #119, #123, #125, #127 to #129, #132, #135, #136, #138, #140, #144. Approved so far: #89, #105, #112, #118, #122 (#122 merged into `claude/63-m1b`). Review 17 (#137 at `8d819d2`, all of review 11 answered) is written and waits for the owner.
- **Fixes:** Claude workers fix each review's C items on the PR's own branch, one worker per file. Since 2026-11-25 ~16:25 UTC the owner allows no new workers: only w110 (#138) and w111 (#128) finish. The queues are in LATEST.md.
- **Process:** RUNBOOK.md section 0 (orchestrator and workers; orchestrator hands off at 175k, workers stop at 150k).
