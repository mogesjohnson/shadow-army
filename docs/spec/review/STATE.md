# Shadow Army v2: current state

A short current state, rewritten at each orchestrator handoff. The working detail is in [`handoffs/LATEST.md`](handoffs/LATEST.md). The log up to 2026-11-25 is in git: `git show 013be2e:docs/spec/review/STATE.md`.

- **Spec:** v0.28, frozen 2026-11-23 for the build (D-39, prototype first). M1 is cut to M1a (Windows-only slice) and M1b (the rest of M1).
- **Build:** M1a on draft PRs #89 to #104; M1b on #105 to #143, stacked on `claude/63-m1b` and its `claude/63-m1b-base-*` branches.
- **Codex:** reviews 1 to 12 are done (summaries on #63). Approved so far: #89, #105, #112, #118, #122 (#122 merged into `claude/63-m1b`). Reviews 13 to 15 (re-reviews of the fixed heads) are written in `codex-reviews/` in the main checkout and wait for the owner to run them.
- **Fixes:** Claude workers fix each review's C items on the PR's own branch, one worker per file, at most three at once. The queues are in LATEST.md.
- **Process:** RUNBOOK.md section 0 (orchestrator and workers; orchestrator hands off at 175k, workers stop at 150k).
