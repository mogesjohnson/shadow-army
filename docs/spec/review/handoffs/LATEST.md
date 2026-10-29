# Handoff: session 17, Fork 2 (session `fork5`), to the next fork (2026-10-29)

Written by Fork 2 at its save point, with context at about 160k: past the owner's 170k mark for a new pass once the save point is done, and too far for the finish-it rule to cover the rest of v0.21. Fork 1's handoff is `git show 5181a46:docs/spec/review/handoffs/LATEST.md`.

## The range

- Start `5181a46`. End: the commit that last changed this file. `git diff 5181a46..HEAD --stat` shows it all.
- Paths: `docs/spec/v2.md`; `drafts/v021/repairs1.txt` to `repairs4.txt` with `pairs1.json` to `pairs4.json` and the follow-ups `pairs2b.json`, `pairs3b.json`, `pairs4b.json`; `ledger.md`.

## What is finished

v0.21 is **half applied**, in four batches. Each was applied with `tools/rep.mjs`, gave `tools/trace-v2.mjs` 0 problems, and was committed and pushed:

- **Batch 1** (`aa9e878`): R-M1-237 to 240 and 242, from the V5 and V6 texts. PO-3's DACL grants; the token's default DACL is left alone; PO-19's Windows guardian gets a nonce channel and a new **folders** operation; PO-5's Windows folders; PO-16's one-shot sweep process; PO-5's log names.
- **Batch 2** (`8901c85`): R-M1-206 (V1b's text, with PO-1's new sibling bullet "After any post office, a shutdown included"), R-M1-207 (b)+(c) with R-M1-241 folded in (`sa live` has its own post office with no lease, the trust card goes to its terminal, and M1-AC8's running-turn case moves to M3-AC1), and R-M1-208 to 211.
  - R-M1-208: PO-8 **stays (M2; I, F)**. Its header says its session services apply from M1, and M1's Implements names "PO-8's session services alone". Making PO-8 (M1, M2) made 14 "(PO-8, →M2)" marks fail the checker.
- **Batch 3** (`2d6e8a6`): R-M1-212 to 218, and R-M1-219 (P3).
  - R-M1-212, a technical choice: the macOS start stamp comes through the helper (PO-17) and the Windows stamp through the script, from a new PO-19 **processes** operation. On Windows, PO-7's watch holds a handle in a script run instead of reading the stamp every second. **So the start time adds no binary or dependency**, and no card is needed (the handoff's question at "Where the fixes touch each other").
  - R-M1-219: the lock also names the process that started the post office.
- **Batch 4** (`c57fe08`): R-M1-221 (CH-4's mode flags), R-M1-222 (CH-2's stop rule), R-M1-235's text for every option of D-37 (HOST-2 119, M1-AC1), and the P3s R-M1-243 to 245.

The ledger rows say `fixed in v0.21, batch N (drafts/v021/repairsN.txt)`. Technical choices not yet recorded in `decisions.md`: R-M1-212's start-time sources, R-M1-208's way of putting PO-8 in M1, and R-M1-214's 60 s and 30 s (the verifier's numbers). Put them there, or in V21-FC1's packet.

## Half done: the rest of v0.21, exact next step

Draft `drafts/v021/repairs5.txt` and onward, the same way:

1. **F rows:** R-F-157, 158, 166 (D-36 (a): VER-4 997, WSP-8 773, M1 Implements 1039, all from `raw/F-R4-V1.md`) and 167 from `raw/F-R4-V1.md`; R-F-168 and 169 from `raw/F-R4-V2.md`; and the P3s R-F-159 to 165 (`raw/F-r4-consistency.md` (3) to (9)) and R-F-170 (`raw/F-r4-redteam.md` (5)).
2. **V18-FC1:** R-M1-224 to 234, from `raw/V18-FC1.md`. R-M1-229 edits ARM-7's line that starts "`Trust these files` accepts exactly the hashes shown". Batch 2 already changed two sentences in that line for R-M1-241, so copy the OLD text from the current file.
3. **R-M1-223** (P3): the probes' answers, from `raw/probes-claude.md` (P-3) and `raw/probes-others.md` (P-15).
4. **D-34's Not tested:** notes (P-5, P-6, VER-10's Mac run; the places are in `raw/V18-FC1.md`).
5. Then run both checkers, freeze the snapshot (`v2@<sha>.md`), and run fix check **V21-FC1**: one Opus `spec-verifier` at high on every P0 and P1 fix (R-M1-206, 207 and 221; R-F-166), with the batches' technical choices.

Line numbers in the raw reports are v0.20's. Batches 1 to 4 added lines, so find each OLD text with grep, not by its number.

`grep -nE 'fix pending|to apply unverified|repair pending' ledger.md` also matches older rows (R-F-132 to 136, 144 to 146, R-M1-46, 161, 164 to 166, 181 to 205). Most say "repaired in v0.1x" after the word "pending". Check each one before you count it.

## Where the fixes touch each other

- R-F-168's last sentence: check it against R-M1-206's fix (WSP-10's held turn, now in the spec). V1b also raised a point it didn't file: when the post office restarts to lift M1's hold, it trusts the config as it stands then, so a `filter.*` driver the soldier added counts as the owner's and runs in harness git, the deferred guard included. That fits R-F-168's residual 14. Check whether a row already covers it.
- R-F-166 (VER-4 into M1) and R-M1-221's new CH-4 bullet both cite VER-4.
- PO-19 now has five operations: DACL, folders, processes, watch and guardian. R-M1-214's 30 s limit covers only the DACL run.

## Agents owed

None are running. V21-FC1 is owed once v0.21 is fully applied. Fork3 runs probes P-16 (for D-37) and P-17 (for R-M1-236). Their drafts for each outcome are in `raw/M1-R4-V4.md`, and they go into v0.21 if it's still open, or else v0.22.

## The owner's open questions

- D-37 waits for P-16, and R-M1-236 for P-17 (both fork3's).
- Unchanged: the haiku model mismatch; alpha Q4 is deferred until A6; D-35 comes up only if R-M1-221's reading is rejected.

## What the files don't say

- `tools/trace-v2.mjs` on the CRLF working copy of `v2.md` falsely reports `M1 implements unknown SHA-256`. Run it on an LF copy: `tr -d '\r' < docs/spec/v2.md > /tmp/v2lf.md`.
- The owner raised the context limits on 2026-10-29 to 170k (no new agent or pass) and 200k (save point), with a finish-it rule of up to 30k past them. `RUNBOOK.md` section 3 still says 120k and 150k.
- PR #85 still waits for Codex's re-review at `428295b`; PR #81 is fork2's.
