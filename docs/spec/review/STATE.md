# Shadow Army v2: current state

A short current state, rewritten at each orchestrator handoff. The working detail is in [`handoffs/LATEST.md`](handoffs/LATEST.md). The log up to 2026-11-25 is in git: `git show 013be2e:docs/spec/review/STATE.md`.

- **Spec:** v0.29 (2026-11-25): D-40 and D-41 applied (v2.1's standalone `shadow` app; PO-22, the viewer's read-only feed, milestone M7; open Q11). Frozen for the build since v0.28 (D-39, prototype first); M1 is cut to M1a (Windows-only slice) and M1b (the rest of M1).
- **Build:** M1a on PRs #89 to #104; M1b on #105 to #144, stacked on `claude/63-m1b` and its `claude/63-m1b-base-*` branches. 55 PRs open (2026-11-26).
- **Merged:** into `claude/63-m1b`: #122, #114, #119. 2026-11-26 (orch-50, Codex-approved heads): #91 and #89 into `claude/63-m1a-transport`, #97 into `claude/63-m1a-slice`, #103 into `claude/63-m1a-fix-channel`, #108 into `claude/63-m1b-lease`; #107 brought up to `claude/63-m1b` at `83e99d9`, waiting for Codex. Fixes pushed by orch-52 (2026-11-26), waiting for Codex: #144 (C1, C6), #132 (C1, C5, C10, C11), #115, #113, #109, #111. Fixing now: #136 C1, #110. The other open P0s (#106, #121, #137, #139, #141 to #143) share `postOffice.ts` and run one at a time after #136.
- **Flatten plan (waits for the owner):** fold the 42 main-lane PRs to about 14 (`.shadow/v2-tools/tasks/orch-51-flatten.md`).
- **Codex:** reviews a push within minutes. Review files live in `C:/Users/johns/codex-reviews/shadow-army/`.
- **Process (the owner, 2026-11-26):** Codex reviews, workers fix, test, then merge on approval, unasked. "Speed-up five": flat PRs (one per milestone part, at most one level of stacking, V6 commit sizes kept, PR size overridden), self-review before push, one lane until M1 is merged, Sonnet by default, merge on approval. Details in RUNBOOK.md section 0.
- **v2.1 (paused until M1 is merged):** a standalone Ink app showing War Table (S-9, D-40, D-41), on fixtures: draft slices #145 to #150 and #151 (the `shadow` keys), stacked off `main`, waiting for Codex.
- **Orchestrators:** RUNBOOK.md section 0 (orchestrator hands off at 175k, workers stop at 150k).
