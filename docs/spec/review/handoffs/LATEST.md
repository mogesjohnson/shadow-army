# Handoff: session 21, the main session (session "main"), to the next session (2026-10-30)

Written by the main session at its save point, well under 120k by the cockpit's context line. V23-FC1 is done and v0.24 is applied. The next session's one task is fix check V24-FC1. The previous handoff is `git show 44e8c2b:docs/spec/review/handoffs/LATEST.md`.

## How this session worked

As in session 20: the owner ran `/fork` three times and renamed the forks fork1 to fork3. Main sent fork1 the fix check (packet, one Opus `spec-verifier` at high, raw report). When it reported, main split the findings by spec section into two batches and sent them to fork2 and fork3 in parallel, each message naming the other fork's sections. fork3's one cross-reference (R-M1-260's verdict naming N3 as R-M1-271) was relayed to fork2 by main. Main applied both batches with no OLD-text clash. All three forks have done their one task and stopped.

## The range

- Start `44e8c2b`. End: the commit that last changed this file. `git diff 44e8c2b..HEAD --stat` shows it all.
- Paths: `docs/spec/v2.md`; `ledger.md`; `batches/V23-FC1.md` (the packet); `raw/V23-FC1.md`; `drafts/v024/` (`repairs2.txt`, `pairs2.json`, `rows2.txt`, `ledger2.json`, `repairs3.txt`, `pairs3.json`, `rows3.txt`, `ledger3.json`, and main's `rows-all.txt`, the two row files merged in number order).
- Commits: `f1ff7ee` (V23-FC1), `b1dc29b` and `cde9582` (the drafts of batches 3 and 2), `cf09e77` (v0.24 applied).

## What is finished

- **V23-FC1** (fork1; one Opus `spec-verifier`, high; `raw/V23-FC1.md`): FIXED 7 (V22-FC1's N1 (P2), N4 to N8, the Version row). SOUND 5, three with gaps (N3's `worktrees/<id>` deletion, S7's pointer, N2's copies, PO-16 413, HOST-2 120). NOT SOUND 1, P2: trusting `commondir` "as it is" lets a soldier point harness git at a config of its own with its own filter. New findings: N1 (P2, `commondir`: WSP-10 798, M1-AC10 1109) and N2 to N9 (P3).
- **v0.24 is applied** (`cf09e77`):
  - Batch 2 (fork2): 7 pairs, N1, N2, N4, N5, N9, at WSP-10 798, M1-AC10 1109, M2-AC5 1206 and section 5.1 957; 6 ledger verdicts (V22 N1 to N5 and R-F-171). fork2's own choice (`repairs2.txt` notes): a missing `commondir` counts as a change, not trusted, since it decides where git reads its config. The main fix for the carried comparison is kept.
  - Batch 3 (fork3): 6 pairs, N3 (D-38's cost now stated in residual 15 and In short), N6 (M1-AC16 tests the mod's sweep of a harness git command), N7 (PO-16 413's macOS wording), N8 (HOST-2 120: P-17's `/reload-plugins` result limited to WSL 2), and the **Version** row's 0.24 entry; 4 ledger verdicts. fork3's choice (`repairs3.txt` header): In short says "turn open or harness git held", not "without checking it", per N9. The Version row has no ledger row, so its FIXED verdict is noted only in `repairs3.txt`.
  - Main added batch 2's part to the Version row's 0.24 entry.
  - New rows R-M1-269 to 277 (V23-FC1's N1 to N9).
  - Both checkers give 0 problems: `trace-v2.mjs` on an LF copy, against `v2@e4cbdb5.md`, and `check-appendix-c.mjs` with `../the-future`. `git diff --check` is clean.
- **Snapshot frozen:** `.shadow/v2-tools/review/snapshots/v2@cf09e77.md` (LF, 1863 lines).

## First: record the owner's N1 decision (2026-10-30), before V24-FC1

The owner decided N1 (D-38's carried comparison): **keep the main fix**, and added two things. Draft them as small pairs, apply them in the same version as V24-FC1's own repairs or just before it, and give the fix check the new text:

1. **The hold message has three parts.** Wherever a start's comparison holds harness git (WSP-10's card from M2 and the M1 transcript line; M1-AC10 tests the M1 line), it must (a) name the file that changed, (b) say the change can't be told apart from the owner's own, and (c) say how to release the hold. In M1 the release is undoing the edit. The owner, 2026-10-30: "documentation is what most important so thing can get tied back."
2. **Two M2 ideas, recorded as ideas only (not drafted as requirements):**
   - **Accept this config:** on the M2 hold card, the owner confirms the change is theirs; Shadow Army takes the current config as its new trusted state and harness git goes on.
   - **Inspect the issue against the project's goals** (the owner's name for it): an Inspect step on the same card. It shows the diff of the changed file (from N2's copy beside the log) and says plainly what program a filter or similar setting would run and on which files. The Monarch then reads the change with `rules.md`, `agent.md` and the task that was running when the session ended, and says whether anything there explains it or it looks out of place, and gives a plain recommendation (accept or undo). Its three safety rules: it advises and never releases (only the owner accepts, since a soldier that planted a filter can also plant text aimed at the inspector); it reads the file as text and never runs git; it runs as the Monarch, read-only.
   Record both where the spec keeps M2 ideas, citing D-38 and R-M1-269, with no rules or wording beyond the above.

Then add a ledger row for the decision, and mark D-38's open question answered.

## Next: the one task, V24-FC1

Run fix check V24-FC1 on `v2@cf09e77.md`: one Opus `spec-verifier` at high, with a tight packet in the shape of `batches/V23-FC1.md` (a pair-to-line map from `drafts/v024/pairs2.json` and `pairs3.json`). It checks:

1. **N1 (P2)**: WSP-10 798's narrowed trust (`gitdir` and `commondir` trusted only where each holds what Shadow Army's own command writes there; a missing `commondir` is a change), and M1-AC10 1109's new case for a `commondir` pointed at a soldier's own config. Can any other file in a snapshot's or worktree's git metadata redirect where harness git reads config or objects (for example `objects/info/alternates`, `HEAD`, `config.worktree`)?
2. N2 (798 reads the turn still open from the soldiers' session logs, PO-5), N5 (a missing or changed copy of a trusted file, WSP-10 and M2-AC5 1206), N9 (section 5.1 957 now agrees with 798), N4 (M1-AC10's release case tests the rule).
3. fork3's batch: N3's statement of D-38's cost in residual 15 and In short, N6's M1-AC16 test, N7 at PO-16 413, N8 at HOST-2 120.
4. Whether any repair broke a neighbour.

Then save the report to `raw/V24-FC1.md`, set its verdicts, and repair what it confirms as v0.25. After a clean fix check, run round 5 for F and M1 (`drafts/r3/PROMPTS.md`'s lenses, two reviewers per unit).

## Left open

- **The owner's call on N1 is answered** (2026-10-30, after the save point): keep the main fix. See "First" above.
- The owner's other questions are unchanged: P-17's Windows cases, the haiku model mismatch, alpha Q4 deferred until A6, the `Co-Authored-By: Ziggy` line on PR #81, and the cockpit mod's "+" choice.
- The owner asked whether the process could be cheaper. Main suggested running drafting forks on Sonnet (`/model sonnet` right after `/fork`, before the first wait) and settling owner calls before forks start. Neither is adopted yet.
