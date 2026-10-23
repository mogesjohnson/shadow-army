# Handoff: Fork 3 to Fork 4 (session 8, 2026-10-23)

Written by **Fork 3** at its save point. Its three agents have all reported, and their reports are saved in `raw/`; nothing is recorded in the ledger yet. Read it after the runbook's section 1. **Start no agent before you have checked `/context`; Fork 3 started three at about 232k by mistake.**

## The range

- Start `94a8355` (Fork 2's handoff). End: the commit that last changed this file (`git log -1 -- docs/spec/review/handoffs/LATEST.md`).
- The paths that matter: `docs/spec/v2.md` (v0.17), `decisions.md` (the answers to D-26 to D-29), `ledger.md` (V16-FC1's verdicts on 36 rows; new rows R-M1-182 to R-M1-192), `drafts/v017/repairs.txt` (33 blocks) with `rows.txt` and `marks.mjs`, `batches/V17-FC1.md`, `drafts/r3/PROMPTS.md` (the V17-FC1 entry), `drafts/r4/PROMPTS.md`, `STATE.md`.

## Finished

- The owner answered **D-26 A, D-27 B ("and list for future version"), D-28 A and D-29 A** in the doc "Spec 2.0 Review: Decisions D-26 to D-29" (rev 41). They are recorded in `decisions.md`.
- **v0.17** (`785cc17`, snapshot `v2@785cc17.md` in the main checkout's `.shadow/v2-tools/review/snapshots/`): the four answers, R-M1-176's guard half, R-M1-171 (section 5.1 C records the refused start), and V16-FC1's N1 to N11 as R-M1-182 to R-M1-192. Both checkers give 0 problems (119 requirements, 81 ACs; Appendix C 118 rows).
- Technical choices by the orchestrator, which the owner may overrule:
  - `NoDefaultCurrentDirectoryInExePath=1` for the CLI's `cmd.exe` (R-M1-182);
  - the host's oldest version is 2.1.294 (R-M1-187);
  - Windows ends harness git with `taskkill /t /f` (R-M1-186).
- PR #77 has a comment. The status board and the main checkout's `.shadow/v2-tools/STATE.md` are updated.

## The three agents (all reported and saved; none is running)

| Agent | Prompt | Report to save |
|---|---|---|
| Fix check V17-FC1 (spec-verifier, Opus high) | `drafts/r3/PROMPTS.md`, last entry; packet `batches/V17-FC1.md` | `raw/V17-FC1.md`: **saved**. R-M1-182 NOT FIXED (relative PATH entries), R-M1-183 NOT FIXED (the hold from M2 to M4), D-26 to D-29 and R-M1-184 FIXED; R-M1-186 and 187 wrong; new N1 to N13 (N1 to N4 P2). Not yet in the ledger |
| M1 round 4, chaos engineer (spec-reviewer) | `drafts/r4/PROMPTS.md` | `raw/M1-r4-chaos.md`: **saved**. 3 P1 (a deferred guard lost at a clean shutdown; how `sa live` reaches the post office; M1 has no session-service exception, so a language server blocks the soldier), 10 P2, 1 P3. No IDs or ledger rows yet (R-M1-193 on, after V17-FC1's) |
| F round 4, consistency auditor (spec-reviewer) | `drafts/r4/PROMPTS.md` | `raw/F-r4-consistency.md`: **saved**. 2 P2 (MSG-9, MSG-10 and three M3 ACs word lines as reaching Claude, against the glossary and HOST-11; VER-6's coverage bar per language or pooled), 7 P3. No IDs or ledger rows yet (R-F-157 on) |

## Next, in order

1. If a report above isn't in `raw/` yet, Fork 3 was cut off before saving it. Look for its transcript under `~/.claude/projects/C--Users-johns-projects-AIConnections/9d3fa05e-94c7-40e9-b0b1-ab06c8cebc07/subagents/`, extract it (`tools/extract.mjs`, as `STATE.md`'s "Saving a report" says), or rerun the prompt.
2. Record V17-FC1's verdicts in the ledger. Repair any NOT FIXED and its new findings (IDs from R-M1-193 / R-F-157 on) as v0.18.
3. Give round 4's findings IDs and ledger rows, then verify only P0 to P2 (verifiers at rule 6's efforts).
4. **Owed for round 4:** M1's implementer and F's red team, with the prompts in `drafts/r4/PROMPTS.md`. Run them only in a fresh session, two or three agents at a time.
5. Count round 4 (both streaks are 0; round 5 is the cap, PLAYBOOK section 7).

## The owner's open questions

- D-30 to D-33 (sent in chat on 2026-10-23; records in `decisions.md`; A recommended for each). They are not in any decisions doc yet.
- The go on M1's probes (`probes.md`).

## What the files don't say

- The owner objected to starting more agents this late. From 120k by `/context`, start none.
- D-29's card claimed "no repository can set" the variable. That was wrong: a Claude Code settings `env` block can set it. v0.17 says so, and `decisions.md` records the correction.
- The JSON drafts (`drafts/v017/pairs.json`, and earlier forks' ones) are left untracked. They can be rebuilt from the `.txt` files with `tools/pairs.mjs`.
