# Handoff: session 23, the main session (session "main"), to the next session (2026-10-30)

Written by the main session at its save point, at about 118k by the cockpit's context line. V25-FC1 is done, v0.26 is applied, and **V26-FC1 is done and clean** (no new CONFIRMED P0 to P2, flow rule 7). The next session's one task is v0.27 (V26-FC1's six P3 repairs); round 5 follows. The previous handoff is `git show 66563ce:docs/spec/review/handoffs/LATEST.md`.

## How this session worked

Three forks, one after another, since each step needed the last one's result: fork1 ran V25-FC1 on `v2@5e90643.md`; fork2 drafted all six of its findings; main applied them as v0.26 and froze `v2@a411314.md`; fork3 ran V26-FC1 on that snapshot. Each fix check was one Opus `spec-verifier` at high. All three forks have done their one task and stopped. Main read only their one-line reports and the checkers' output.

## The range

- Start `66563ce`. End: the commit that last changed this file. `git diff 66563ce..HEAD --stat` shows it all.
- Paths: `docs/spec/v2.md`; `ledger.md`; `batches/V25-FC1.md` and `raw/V25-FC1.md`; `drafts/v026/` (`repairs2.txt`, `pairs2.json`, `ledger2.json`, `rows2.txt`); `batches/V26-FC1.md` and `raw/V26-FC1.md`.
- Commits: `f47290b` (V25-FC1), `0822676` (fork2's drafts), `a411314` (v0.26 applied), `d0ca51b` (V26-FC1).

## What is finished

- **V25-FC1** (fork1): FIXED 9, SOUND 5, NOT SOUND 1, CONFIRMED 5, REFUTED 2. The NOT SOUND was main's submodule alternative for V24 N2. New N1 (P2): a submodule whose `.git` is a folder, a `commondir` in a submodule's git folder, and a gitlink missing from `.gitmodules` each let a submodule's own config run a filter during the guard's listing. N2 to N6 (P3): 792's `--ignore-submodules=none` reaches only the top-level command; 1105's submodule cases; 840 and 798 on a read-only turn's `.git` file; `refs/replace/` at 795; 1109's `commondir` case for the folder's own commands.
- **v0.26** (fork2's drafts, applied by main at `a411314`): 8 spec pairs, rows R-M1-289 to 294, 11 ledger verdicts. fork2's choices are in `repairs2.txt`'s header: N5 moved to 792's `-c core.useReplaceRefs=false`, because git clears `GIT_NO_REPLACE_OBJECTS` inside submodules; N1's two paths became M1-AC10 1105 cases; no fix weakens the checkout guard. Both checkers give 0 problems: `trace-v2.mjs` on an LF copy against `v2@5e90643.md`, and `check-appendix-c.mjs docs/spec/v2.md docs/spec/v2.md C:/Users/johns/projects/the-future`. `git diff --check` is clean.
- **V26-FC1** (fork3, on `v2@a411314.md`): its table has FIXED 6, SOUND 7, CONFIRMED 4, and nothing NOT FIXED, NOT SOUND or REFUTED. Its counts line says SOUND 6, CONFIRMED 7, a miscount; the 17 rows are right, so follow the table. V25 N1 is FIXED, main's submodule alternative is now SOUND, and both of fork2's choices are SOUND. New N1 to N6, all P3: N1 residual 15's cost of new submodules; N2 `=` in names against `-c` at 792; N3 `rev-parse` against 1109 and 795; N4 792's grammar; N5 1105's missing cases; N6 795's "compared" wording.
- **Snapshot frozen:** `.shadow/v2-tools/review/snapshots/v2@a411314.md` (in the main checkout's `.shadow`, LF).

## Next

1. **The one task: v0.27, V26-FC1's six P3 repairs.** One fork drafts them all (WSP-10 792 and 795, M1-AC10 1105 and 1109, residual 15; rows from R-M1-295; ledger verdicts for V26-FC1's items), in `drafts/v027/`. Main applies, runs both checkers and freezes the snapshot.
2. **Then round 5 for F and M1** (`drafts/r3/PROMPTS.md`'s lenses, two reviewers per unit, flow section 4's models and efforts) on the v0.27 snapshot, as its own session. Verify only P0 to P2, repair, and count the round. **Round 5 is the last round the flow allows** (flow line 122: a unit still failing after five gets a design note to the owner). Round 5's four reviewers can run two at a time, F's pair and M1's pair.

## Left open

- Main's N2 call from session 22 is now SOUND (V26-FC1); the owner may still overrule it.
- The owner's other questions are unchanged: P-17's Windows cases, the haiku model mismatch, alpha Q4 deferred until A6, the `Co-Authored-By: Ziggy` line on PR #81, and the cockpit mod's "+" choice.
- The owner asked for progress figures. Main's estimate: the spec review is about 75% done by work (0 of the 2 clean rounds each milestone needs), the road to first alpha about 40 to 50% (0 of its 13 Part A and B items merged; PR #75 is a draft built against spec v0.5).
- Cheaper process (Sonnet drafting forks, owner calls settled before forks start): still not adopted.
