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
- **Batch 5** (`16f1181`, by fork1 after this handoff; trace 0 problems): fork3's probes ran (`6073a3a`; `raw/P-16.md`, `raw/P-17.md`).
  - **D-37 is (b).** P-16 showed the proxy gets a loopback `$.http.fetch`, headers included, from the shell or from a project's `env`, and `NO_PROXY` stops it. HOST-2 119 now has the mod's proxy check before the first start, and M1-AC1 has its cases.
  - **R-M1-236 is CONFIRMED P2.** P-17 showed Claude Code ends a mod's spawned process before `session.end`: `SIGTERM` then `SIGKILL` 500 ms later on POSIX, and `TerminateProcess` on Windows. PO-7 262 says so, 263 is kept, and M1-AC8 has the normal exit.
  - P-17 also found that after a `SIGKILL` of Claude Code on POSIX the post office runs on, orphaned, while on Windows `taskkill /f` takes it along. V21-FC1 should check PO-1 and the lease against that.
  - Fork1's estimate under the finish-it rule: about 167k after batch 5. The rest of v0.21 (about 25 rows, roughly 75k) is past 30k over the limit, so fork1 stopped.

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

None are running. V21-FC1 is owed once v0.21 is fully applied. P-16 and P-17 are done and in batch 5. The rest of v0.21 starts at `repairs6.txt`.

## The owner's open questions

- D-37 and R-M1-236 are settled (batch 5). Still left to the owner from P-17: Windows interactive `/exit`, ctrl+c, window close and `/reload-plugins` (steps in `raw/P-17.md`).
- Unchanged: the haiku model mismatch; alpha Q4 is deferred until A6; D-35 comes up only if R-M1-221's reading is rejected.

## What the files don't say

- `tools/trace-v2.mjs` on the CRLF working copy of `v2.md` falsely reports `M1 implements unknown SHA-256`. Run it on an LF copy: `tr -d '\r' < docs/spec/v2.md > /tmp/v2lf.md`.
- The owner set the context limits back to 120k (no new agent or pass) and 150k (save point) on 2026-10-29, with one task per session and a finish-it allowance of 20k (never past 170k). `RUNBOOK.md` sections 2 and 3 have the rules.
- PR #85 still waits for Codex's re-review at `428295b`; PR #81 is fork2's.

## Everything else in flight (added 2026-10-29 by the "Second brain" session, at the owner's request)

- **Who has what.** No fork is working: fork1 to fork4 wait on hour timers, fork5 is idle. The review has no owner; the next session takes it from this file ("look at second brain and continue work" in `C:\Users\johns\projects\AIConnections`). Use a fresh session, not a fork of a long one: a fork starts with its parent's whole context.
- **The owner's rules from 2026-10-29** (`RUNBOOK.md` sections 2 and 3): one task per session, started fresh; the context limit is 120k (no new agent or pass) and 150k (save point). The finish-it rule: at 150k, measure what the one task still costs, save point included; if it fits within 20k, finish it and write the estimate here. Never past 170k, and never for a second task. Messages between sessions carry the SHA, the files and one line, never a diff.
- **The owner's answers**: D-36 (a) and D-37 (c), then (b) from P-16; both probes done by fork3 (`raw/P-16.md`, `raw/P-17.md`). P-16's setup made one model call ($0.24) before its dead-port guard.
- **PR #81** (#80, the CI budget watchdog; Claude's draft): head `b9dface`, waiting for Codex's re-review. fork2 fixed Codex's five P2s, fork4 its next P2 (`contents: read`). The owner granted a V6 size exception and chose "Skip while public"; AC2 reconciled to 2,986 minutes against #78's 3,000. Not run: a checkout while private, a live cancellation, three-OS CI. The PR body ends with a `Co-Authored-By: Ziggy <noreply@muse.dev>` line no Claude session wrote; ask the owner whether to remove it. Don't merge without the owner's word.
- **PR #85** (#84, version-control rules): Codex reviewed `0d46282` (C1 fixed, no findings), but the head is `428295b`; Codex still has to review it.
- **The owner's cockpit mod** (not this project: `C:\Users\johns\.claude\mods\cockpit`, loaded in every claude session). Asked: a "+" next to the fork count, and a cockpit that refreshes constantly. Unchanged: auto mode refused fork4's edit twice, and fork4 restored the original. Backup `C:\Users\johns\.claude\cockpit-backups\2026-10-29-original`; findings and design `C:\Users\johns\.claude\cockpit-backups\2026-10-29-plan.md`. The owner is to run it in a new session started in the mod's folder, with the prompt the Second brain session gave (git init and commit first, then build from the plan). Open owner choice: "+" (a) runs `/fork` (recommended) or (b) only raises a counter.
