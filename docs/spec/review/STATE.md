# Shadow Army v2: current state

A short current state, rewritten at each orchestrator handoff. The working detail is in [`handoffs/LATEST.md`](handoffs/LATEST.md). The log up to 2026-11-25 is in git: `git show 013be2e:docs/spec/review/STATE.md`.

- **Spec:** v0.29 (2026-11-25): D-40 and D-41 applied (v2.1's standalone `shadow` app; PO-22, the viewer's read-only feed, milestone M7; open Q11). Frozen for the build since v0.28 (D-39, prototype first); M1 is cut to M1a (Windows-only slice) and M1b (the rest of M1).
- **Build:** M1a on draft PRs #89 to #104; M1b on #105 to #144, stacked on `claude/63-m1b` and its `claude/63-m1b-base-*` branches. #144 makes the Windows managed spawn fast (488 to 110 ms).
- **Codex:** reviews up to 47 are done (summaries on #63); since 2026-11-26 Codex reviews a push within minutes. Every open PR was at "changes requested"; orch-49 pushed fixes to 11 of them, awaiting review. Review files live in `C:/Users/johns/codex-reviews/shadow-army/`. Merged into `claude/63-m1b`: #122, #114, #119.
- **Fixes and v2.1:** one main worker (Codex fixes, spec) and one Ink worker run side by side (the owner, 2026-11-25). v2.1 is a standalone Ink app showing War Table (S-9, D-40, D-41), built on fixtures first: draft slices #145 → #146 → #147 → #148 (War Table) → #149 (summary, ledger) → #150 (replay), stacked off `main`; slice 5b (the `shadow` command and keys) next. Queues in LATEST.md.
- **2026-11-26:** orch-47 started no worker (5h limit at 85% to 91%) and copied the claude.ai artifacts to `.shadow/artifacts/`. orch-48 ran Codex-fix rounds on #128 (C9 P0, C5, C11, C12) and the Ink stack (#148, #149). orch-49 cleared every finding on #145, #146, #147 and fixed #120 C12, #134 C7, #131 C10; #138 and the stack merge-up were running at its handoff.
- **Process:** RUNBOOK.md section 0 (orchestrator and workers; orchestrator hands off at 175k, workers stop at 150k).
