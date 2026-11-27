# Shadow Army v2: current state

A short current state, rewritten at each orchestrator handoff. The working detail is in [`handoffs/LATEST.md`](handoffs/LATEST.md). The log up to 2026-11-25 is in git: `git show 013be2e:docs/spec/review/STATE.md`.

- **orch-68 (2026-11-27 ~22:40 UTC, weekly limit reset):** the fix loop is done and waits for Codex. #106 at `98b58c1` (review 135 C25-C26, file 138), #116 at `00f4b73` (review 136 C27-C29, file 139), #117 at `3d86e92` (review 137 C22-C25, file 140). VER-7 now credits test titles only (`6eb55b9`). The owner runs Codex; orchs write review files (Review bar in each; Claude reviews when Codex is out). All GitHub workflows are disabled manually, so CI is `blocked`. Next free file: 141.
- **Order (the owner, 2026-11-26): bottom-first, merge on approval without asking, orchestrators merge from their own Bash.**
- **Spec:** v0.29 (2026-11-25): D-40 and D-41 applied (v2.1's standalone `shadow` app; PO-22, the viewer's read-only feed, milestone M7; open Q11). D-42 (2026-11-27, `410961e`): the Linux helper needs Linux 5.1. Frozen for the build since v0.28 (D-39, prototype first); M1 is cut to M1a (Windows-only slice) and M1b (the rest of M1).
- **Build:** M1a on PRs #89 to #104; M1b on #105 to #144, stacked on `claude/63-m1b` and its `claude/63-m1b-base-*` branches. 37 PRs open (2026-11-27 pm).
- **Merged:** M1a (#95, #94), the M1b base #152, #107, #115, #113, #123, #109 and #111 are in `main`. Folded and closed: #90, #92, #93. Fold 2 (#110, #120, #121, #124) lives in #109, #106 and #111.
- **Flatten plan (owner approved 2026-11-26):** fold 2 done by orch-56 (#110, #120, #121, #124 folded into #109, #106, #111); fold 1 and fold 3 queued (`.shadow/v2-tools/tasks/orch-51-flatten.md`).
- **Codex:** reviews a push within minutes. Review files live in `C:/Users/johns/codex-reviews/shadow-army/`.
- **Process (the owner, 2026-11-26):** Codex reviews, workers fix, test, then merge on approval, unasked. "Speed-up five": flat PRs (one per milestone part, at most one level of stacking, V6 commit sizes kept, PR size overridden), self-review before push, one lane until M1 is merged, Sonnet by default, merge on approval. Details in RUNBOOK.md section 0.
- **v2.1 (paused until M1 is merged):** a standalone Ink app showing War Table (S-9, D-40, D-41), on fixtures: draft slices #145 to #150 and #151 (the `shadow` keys), stacked off `main`, waiting for Codex.
- **Orchestrators:** RUNBOOK.md section 0 (orchestrator hands off at 175k, workers stop at 150k).
