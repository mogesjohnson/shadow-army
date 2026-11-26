# Shadow Army v2: current state

A short current state, rewritten at each orchestrator handoff. The working detail is in [`handoffs/LATEST.md`](handoffs/LATEST.md). The log up to 2026-11-25 is in git: `git show 013be2e:docs/spec/review/STATE.md`.

- **Order (the owner, 2026-11-26): bottom-first, merge on approval without asking, orchestrators merge from their own Bash.** orch-60 (2026-11-26 ~23:30 UTC): **M1a is in `main`**: #95 merged at `91c401c` (Codex review 97), #94 at `19384ed` (review 99); #90, #92, #93 closed as folded. Now: w206 merges `main` into `claude/63-m1b` and opens its draft PR; Codex file 100 reviews it. Paused above: #141 at `df61172`, #138 at `3e37186`, #111 at `6d4ff2f`.
- **Spec:** v0.29 (2026-11-25): D-40 and D-41 applied (v2.1's standalone `shadow` app; PO-22, the viewer's read-only feed, milestone M7; open Q11). Frozen for the build since v0.28 (D-39, prototype first); M1 is cut to M1a (Windows-only slice) and M1b (the rest of M1).
- **Build:** M1a on PRs #89 to #104; M1b on #105 to #144, stacked on `claude/63-m1b` and its `claude/63-m1b-base-*` branches. 55 PRs open (2026-11-26).
- **Merged:** into `claude/63-m1b`: #122, #114, #119. 2026-11-26: #91 and #89 into the transport branch, #97, #96, #99 and #101 into the slice, #103 and #108 into their bases. Folded into #94 and still open: #90, #92, #93 (close once #94 merges). The many M1b fix heads waiting for Codex stay paused until the stack reaches them.
- **Flatten plan (owner approved 2026-11-26):** fold 2 done by orch-56 (#110, #120, #121, #124 folded into #109, #106, #111); fold 1 and fold 3 queued (`.shadow/v2-tools/tasks/orch-51-flatten.md`).
- **Codex:** reviews a push within minutes. Review files live in `C:/Users/johns/codex-reviews/shadow-army/`.
- **Process (the owner, 2026-11-26):** Codex reviews, workers fix, test, then merge on approval, unasked. "Speed-up five": flat PRs (one per milestone part, at most one level of stacking, V6 commit sizes kept, PR size overridden), self-review before push, one lane until M1 is merged, Sonnet by default, merge on approval. Details in RUNBOOK.md section 0.
- **v2.1 (paused until M1 is merged):** a standalone Ink app showing War Table (S-9, D-40, D-41), on fixtures: draft slices #145 to #150 and #151 (the `shadow` keys), stacked off `main`, waiting for Codex.
- **Orchestrators:** RUNBOOK.md section 0 (orchestrator hands off at 175k, workers stop at 150k).
