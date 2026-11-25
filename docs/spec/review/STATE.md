# Shadow Army v2: current state

A short current state, rewritten at each orchestrator handoff. The working detail is in [`handoffs/LATEST.md`](handoffs/LATEST.md). The log up to 2026-11-25 is in git: `git show 013be2e:docs/spec/review/STATE.md`.

- **Spec:** v0.28, frozen 2026-11-23 for the build (D-39, prototype first). M1 is cut to M1a (Windows-only slice) and M1b (the rest of M1).
- **Build:** M1a on draft PRs #89 to #104; M1b on #105 to #144, stacked on `claude/63-m1b` and its `claude/63-m1b-base-*` branches. #144 makes the Windows managed spawn fast (488 to 110 ms).
- **Codex:** reviews 1 to 32 are done (summaries on #63); 33 (#138 at `d11dbd9`) waits for the owner. Review files live in `C:/Users/johns/codex-reviews/shadow-army/` since 2026-11-25. Merged into `claude/63-m1b`: #122, #114, #119.
- **Fixes and v2.1:** one main worker (Codex fixes, spec) and one Ink worker run side by side (the owner, 2026-11-25). v2.1 is a standalone Ink app showing War Table (S-9, D-40, D-41), built on fixtures first. Queues in LATEST.md.
- **Process:** RUNBOOK.md section 0 (orchestrator and workers; orchestrator hands off at 175k, workers stop at 150k).
