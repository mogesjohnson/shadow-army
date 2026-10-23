# Handoff: Fork 1 to Fork 2 (session 8, 2026-10-23)

Written by **Fork 1** at its save point (the owner moved it to 150k tokens on 2026-10-23; `RUNBOOK.md` section 3). Read this after the runbook's section 1. No agent is running.

## The range

- Start `606214c` (the runbook), end: the commit that adds this file (`git log -1 -- docs/spec/review/handoffs/LATEST.md`).
- `git diff 606214c..<end> --stat`: 31 files, about 1,200 lines. The paths that matter: `docs/spec/v2.md` (v0.15 and v0.16's first parts), `ledger.md` (R-F-132 to R-F-156, R-M1-161 to R-M1-181), `decisions.md` (D-24 and D-25 answered; D-26 to D-29 opened), `raw/` (8 new reports), `batches/` (F-R3-V1 to V3, M1-R3-V1 to V3), `drafts/v015/`, `drafts/v016/`, `drafts/r3/` (ledger rows and cards), `tools/insert-rows.mjs` (new: splices ledger rows after the unit's last row).

## Finished

- **v0.15** (`8e45853`, snapshot `v2@8e45853.md` in the main checkout's `.shadow/v2-tools/review/snapshots/`): the owner's answers, pasted in chat, **D-24 B** (WSP-12's y/n card for an edit before a self-started turn; HOST-2 keys and list, M6-AC13, residual 11) and **D-25 A** (MSG-5: a summary for a brief from before `/clear` wakes Claude; M3-AC2). Both checkers 0 problems.
- **Fix check V14-FC1** (`raw/V14-FC1.md`): every v0.14 repair FIXED. New: R-F-132 to R-F-136, R-M1-163 to R-M1-166. R-M1-163 is card **D-26**. The orchestrator confirmed the three other P2s against the text and repaired all eight (`drafts/v016/repairs.txt`, `1c1dfce`).
- **Round 3, all five reviewers done:** M1 red team (`raw/M1-r3-redteam.md`, R-M1-161 P1, R-M1-162), M1 enterprise operator (`raw/M1-r3-enterprise.md`, R-M1-167 to R-M1-181), F implementer (`raw/F-r3-implementer.md`, R-F-137 to R-F-146), F owner's advocate (`raw/F-r3-advocate.md`, R-F-147 to R-F-156).
- **M1's round 3 is fully verified** (M1-R3-V1 to V3, `raw/M1-r3-verify-V1.md` to `V3.md`). Confirmed: R-M1-161 (P1), R-M1-168 (P1), R-M1-169 (P1), R-M1-172, R-M1-173 (in part), R-M1-174, R-M1-176 (P2), R-M1-171, R-M1-177 (P3). Refuted: R-M1-162. Big decisions: R-M1-167 (**D-27**), R-M1-170 (**D-28**), R-M1-173's relocation half (**D-29**). Parked decisions: R-M1-175 (M5), R-M1-178 (X3), R-M1-179 (X3 and M6; its format version is technical and should be settled before M1's formats freeze), R-M1-180 (M6). So **M1's round 3 is not clean**.
- Repaired in `docs/spec/v2.md` (not yet a numbered version): R-M1-161 (PO-5's "Its own folders", M1-AC2, the actors row; `f116f03`), and the P3s R-F-144, R-F-145, R-F-146, R-M1-181 (`b15d581`).

## Half done, with the exact next step

1. **Repair M1's confirmed findings**, drafting OLD/NEW blocks yourself from each verifier's `fix:` (`raw/M1-r3-verify-V2.md`, `V3.md`), into `drafts/v016/repairs4.txt`: R-M1-168 (HOST-2: the post office's Node.js from an absolute PATH entry; M1-AC10; Appendix D row 9), R-M1-169 (PO-13: a shrinkwrap or bundled deps, advisories, licenses; PO-21 and M1-AC17's install test), R-M1-172 (supported Node.js >=22 from 2.0 CFG-7, Claude Code host at least 2.1.286, an oldest git to set; checks and messages; CI oldest and newest), R-M1-173's technical half (WSP-11: the baseline beside the log, never in temp, removed when the guard closes; an Appendix D assets row), R-M1-174 (PO-2: no outbound connection or telemetry; M1-AC1's loopback-only check), R-M1-176 (WSP-10: `GIT_TERMINAL_PROMPT=0`, `credential.interactive=false`, 30 min for a snapshot, 5 min otherwise; M1-AC10's never-exiting fake git), R-M1-171 (P3: PO-1, a start refused by managed settings isn't a crash; M1-AC4), R-M1-177 (P3: WSP-11, a session opens at first use; PO-5's disk note). Dry-run on a copy, both checkers, apply, commit, push.
2. **Verify F's round 3**: three packets are built, `batches/F-R3-V1.md` (R-F-137 to R-F-143), `F-R3-V2.md` (R-F-147 to R-F-151), `F-R3-V3.md` (R-F-152 to R-F-156). Use NEXT-SESSION.md section 5's verifier prompt, with the reviewed snapshot `v2@8e45853.md` and the current spec `docs/spec/v2.md`, open decisions D-26 to D-29. Opus `high` for F-R3-V1 (vendor facts and a Windows quoting gap) and F-R3-V2 (trust card, autonomy); F-R3-V3 has decisions, Opus `high` too. At most three at once.
3. Then **v0.16**: bump the header, snapshot it, and run **fix check V16-FC1** (Opus, high) over v0.15, V14-FC1's repairs and round 3's, with the three P1 repairs (R-M1-161, R-M1-168, R-M1-169) looked at hardest. Count round 3 for both units: neither is clean (M1 has confirmed P1s). Round 4 then needs new lenses (flow section 6; chaos and consistency are left, with an implementer or red team).

## Agents owed, and where their prompts are

- F-R3-V1 to V3: NEXT-SESSION.md section 5 (the verifier prompt); packets built.
- V16-FC1: copy `drafts/r3/PROMPTS.md`'s V14-FC1 prompt, with a new packet `batches/V16-FC1.md` listing every repair since `02d5f84`.

## The owner's open questions and answers

- **Answered in chat 2026-10-23:** D-24 B, D-25 A (the doc "Spec 2.0 Review: New Decisions" returns `forbidden` to this account, so the owner pasted the table).
- **Waiting, sent in chat:** D-26 (recommended A), D-27 (recommended B for 2.0), D-28 (recommended A), D-29 (recommended A). Records in `decisions.md`. Apply their answers as small blocks when they come.
- The owner asked to make the repo public for macOS CI: it already is (since 2026-10-23), and #77's CI is green on all three systems.
- The owner asked which model the agents use: reviewers, fix checks and these verifiers are Opus at `high` (their definitions); Sonnet only for mechanical work (flow rule 6).

## What the files don't say

- The Write and Edit tools refuse paths in the main checkout from a forked background session (worktree isolation); Bash still writes there (snapshots, `.shadow/v2-tools/review/tmp/`). Edit the review worktree, which is accepted.
- Saving a report: this session's transcripts are under `~/.claude/projects/C--Users-johns-projects-AIConnections/25b69999-9a4a-4459-ba31-2db6d25aab66/subagents/`; `TASKS_DIR` was `.shadow/v2-tools/review/tmp/tasks`.
- Verdicts in the ledger were set with a small `sed` on the row's `| to verify | |` tail (`set_row` in this session's commands), which works because the rows are LF in the working tree.
