# Handoff: session 20, the main session (session "main"), to the next session (2026-10-30)

Written by the main session at its save point, at about 110k by the cockpit's context line. V22-FC1 is done and v0.23 is applied. The next session's one task is fix check V23-FC1. The previous handoff is `git show 96d49ce:docs/spec/review/handoffs/LATEST.md`.

## How this session worked

The owner ran `/fork` three times and renamed the forks fork1 to fork3. Main sent fork1 the fix check. When it reported, main split its findings by spec section into two batches and sent them to fork2 and fork3 in parallel, each message naming the other fork's sections. Main applied both batches with no OLD-text clash. The three forks ended at 122k to 137k by their cockpit lines.

## The range

- Start `96d49ce`. End: the commit that last changed this file. `git diff 96d49ce..HEAD --stat` shows it all.
- Paths: `docs/spec/v2.md`; `ledger.md`; `batches/V22-FC1.md` (the packet); `raw/V22-FC1.md`; `drafts/v023/` (`ledger1.json`, `repairs2.txt`, `pairs2.json`, `rows2.txt`, `ledger2.json`, `repairs3.txt`, `pairs3.json`, `rows3.txt`, `ledger3.json`).
- Commits: `99f9256` (V22-FC1), `909082c` and `c172953` (the drafts of batches 2 and 3), `e4cbdb5` (v0.23 applied).

## What is finished

- **V22-FC1** (fork1; one Opus `spec-verifier`, high; `raw/V22-FC1.md`): D-38 (R-F-171 a) **FIXED, with gaps**. V21-FC1's N1 (R-M1-214's ready point) **FIXED**. fork2's three additions **SOUND**. Of the P3 repairs N2 to N13, 12 **FIXED**; S7's P-8 note **NOT SOUND** (P3). New findings: N1 (P2) and N2 to N8 (P3), plus one P3 outside the packet: HOST-2 120 counts `/reload-plugins` as a mod reload, but P-17 saw it reload nothing with the mod unchanged.
- **v0.23 is applied** (`e4cbdb5`):
  - Batch 2 (fork2): 15 pairs, N1 to N5, at WSP-10, PO-1, PO-5, ARM-6, section 5.1, M1-AC10, M2-AC5 and residuals 7 and 15. N1 is the main fix, not the residual-only alternative: a start whose last log ends with harness git held (for a change or after a timeout) or with a turn still open compares with the last trusted state before PO-1 finishes any turn. fork2's own choices, in `repairs2.txt`'s header: N3 trusts only this army's `gitdir` and `commondir` entries (a `config.worktree` is still compared), and N1 adds an M1-AC10 case.
  - Batch 3 (fork3): 8 pairs, N6 to N8, HOST-2 120 and the **Version** row (now 0.23, with 0.21 and 0.22 filled in). fork3's own choices: N7 also changes PO-16 413 for macOS; N8 points to M1-AC16. Main added N1 to the Version row's 0.23 entry.
  - The fix check's verdicts on 17 ledger rows (`ledger1.json`), R-F-171's row (`ledger2.json`), 4 more (`ledger3.json`), and 9 new rows: R-M1-260 to 267 (V22-FC1's N1 to N8) and R-M1-268 (HOST-2).
  - Both checkers give 0 problems: `trace-v2.mjs` on an LF copy, against `v2@e2d59b9.md`, and `check-appendix-c.mjs` with `../the-future`. `git diff --check` is clean.
- **Snapshot frozen:** `.shadow/v2-tools/review/snapshots/v2@e4cbdb5.md` (LF, 1863 lines).

## Next: the one task, V23-FC1

Run fix check V23-FC1 on `v2@e4cbdb5.md`: one Opus `spec-verifier` at high, with a tight packet in the shape of `batches/V22-FC1.md` (a pair-to-line map from `drafts/v023/pairs2.json` and `pairs3.json`). It checks:

1. **N1 (P2)**: the carried comparison at start for a change the last post office never checked (WSP-10 798, PO-1, section 5.1 957, residuals 7 and 15, the new M1-AC10 case), and that its card or M1 line says the change can't be told from the owner's.
2. fork2's N3 choice (only `gitdir` and `commondir` trusted) and N2's copy of each trusted file, which gives the card shown again its diff, with PO-5's flush.
3. fork3's two additions (PO-16 413 for macOS, N8's pointer to M1-AC16) and HOST-2's `/reload-plugins` fact against `raw/P-17.md` line 23.
4. Whether any P3 repair broke a neighbour.

Then save the report to `raw/V23-FC1.md`, set its verdicts, and repair what it confirms as v0.24. After a clean fix check, run round 5 for F and M1 (`drafts/r3/PROMPTS.md`'s lenses, two reviewers per unit).

## Left open

- **The owner's call on N1** (asked in chat on 2026-10-30, not yet answered): main had the main fix drafted. Its cost is the one D-38 accepted: after a normal exit with a turn open, or a timeout hold, an owner's own git config edit holds harness git, in M1 until it is undone. The alternative is to fix nothing and state the gap in residual 15. If the owner picks the alternative, revert N1's pairs in `pairs2.json` and write residual 15's sentence instead.
- The owner's other questions are unchanged: P-17's Windows cases, the haiku model mismatch, alpha Q4 deferred until A6, the `Co-Authored-By: Ziggy` line on PR #81, and the cockpit mod's "+" choice.
