# Handoff: Fork 2 to Fork 3 (session 8, 2026-10-23)

Written by **Fork 2** at its save point (about 150k tokens; `RUNBOOK.md` section 3). Read this after the runbook's section 1. No agent is running.

## The range

- Start `1ba37b5` (Fork 1's handoff), end: the commit that adds this file (`git log -1 -- docs/spec/review/handoffs/LATEST.md`).
- `git diff 1ba37b5..<end> --stat`: about 20 files, 800 lines. The paths that matter: `docs/spec/v2.md` (v0.16), `ledger.md` (verdicts for R-F-137 to R-F-156 and R-M1-168 to R-M1-177), `decisions.md` (D-30 to D-33 opened; R-F-140 added to D-31), `raw/` (`F-r3-verify-V1.md` to `V3.md`, `V16-FC1.md`), `drafts/v016/repairs4.txt` to `repairs7.txt` and `header.txt`, `drafts/r3/d30-31.txt`, `d32-33.txt`, `d31-140.txt`, `batches/V16-FC1.md`, `STATE.md`.

## Finished

- **M1's round-3 repairs** (`repairs4.txt`, `26d6db5`): R-M1-168, 169 (P1), 172, 173's technical half, 174, 176 (P2), 171, 177 (P3). Values set by the orchestrator: Node.js 22, git 2.34 (Ubuntu 22.04 LTS's), host Claude Code 2.1.286; CI fails on advisories of moderate and above.
- **F's round 3 verified** (F-R3-V1 to V3) and repaired (`repairs5.txt` to `repairs7.txt`): confirmed R-F-137, 139, 143, 147, 148's list, 149, 151 (P2), R-F-152, 154, 155 (P3); refuted R-F-138, 141, 142; cards D-30 (R-F-153), D-31 (R-F-156 with R-F-140), D-32 (R-F-148's re-show), D-33 (R-F-150).
- **v0.16** (`bfa5d6f`, snapshot `v2@bfa5d6f.md` in the main checkout's `.shadow/v2-tools/review/snapshots/`): both checkers 0 problems (119 requirements, 81 ACs; Appendix C 118 rows).
- **Round 3 counted:** neither unit is clean (M1 confirmed P1s, F confirmed P2s). Both streaks are 0.
- **Fix check V16-FC1** done (`raw/V16-FC1.md`, Opus high, 210k tokens, 14 min). FIXED: R-M1-161, R-M1-168 (its own Node.js), R-M1-169 (npm from the public registry or a tarball), D-24 B, D-25 A, R-F-132, 134, R-M1-164, 172, 173's half, 174, R-F-137, 139, 143, 147, 148, 149, 151, and every P3 but one. **NOT FIXED:** R-M1-176's guard half (a timed-out guard command holds harness git with nothing to lift it). **Wrong P3:** R-M1-171 relies on a contract recording §5.1 C doesn't list.

## Half done, with the exact next step

1. **Record V16-FC1's new findings as ledger rows** (`tools/insert-rows.mjs`; IDs from R-M1-182 on, since every one touches M1 text): N1 (P1: on Windows, `cmd.exe /d /s /c` for a `.cmd` CLI searches the current folder, so npm's shim runs a committed `node.bat`/`node.exe`; PO-18's `launchctl` by name), N2 (P2: the guard-timeout hold has no way out, and the limit counts sleep), N3 (P2: shrinkwrap is ignored by pnpm and by npm from mirrors without `_hasShrinkwrap`; fix: bundle every runtime dependency, no `dependencies`; depends on D-28), N4 to N11 (P3). Mark the V16-FC1 rows FIXED or NOT FIXED in the ledger.
2. **Write v0.17** from V16-FC1's `fix:` lines, drafting the OLD/NEW blocks yourself into `drafts/v017/repairs.txt`: N1, N2 (with R-M1-176's guard half), N3, R-M1-171 (add the recording to §5.1 C's list, or mark the rule pending a probe), and N4 to N11. N1 is a P1, so v0.17 needs a fix check (V17-FC1, Opus high): copy V16-FC1's prompt (`drafts/r3/PROMPTS.md`, last section) with a new packet. Dry-run on a copy, both checkers, apply, commit, snapshot, push.
3. **Round 4** for F and M1, on v0.17 or later, with new lenses (flow section 6): chaos and consistency, each unit with an implementer or a red team. Write the prompts into `drafts/r4/PROMPTS.md` from `drafts/r3/PROMPTS.md`'s, with the new snapshot's line ranges and the refuted lists brought up to date (R-F-138, 141, 142; R-M1-162).

## Agents owed, and where their prompts are

- V17-FC1 after v0.17: as above.
- Round 4's reviewers: to be written (step 3).

## The owner's open questions and answers

- **D-26 to D-29**: in the doc "Spec 2.0 Review: Decisions D-26 to D-29" (https://claude.ai/artifact/5KpM8yYoanEJbhSKVQwEio, doc id `23051f0a-159c-41cd-a6a8-e4348c50f1ac`), made by the "Second brain" session. Read its answer table first (Claude Docs `read`, through ToolSearch); Fork 2 didn't read it.
- **D-30 to D-33**: sent in chat 2026-10-23; records in `decisions.md`. Recommended A for each.
- Apply answers as small blocks when they come. D-28's answer settles N3's fix.

## What the files don't say

- The tasks folder's `.output` files are empty for this session; copy each transcript from `~/.claude/projects/C--Users-johns-projects-AIConnections/4f05fd65-802c-4586-839e-4b4e8d7ba31e/subagents/agent-<id>.jsonl` to `.shadow/v2-tools/review/tmp/tasks/<id>.output` in the main checkout, then run `extract.mjs` with `TASKS_DIR` set there.
- The trace checker rejects a →Mx marker on an ID from an earlier milestone than the requirement's (it caught `MSG-4, →M3` inside M5's HOST-15).
- Fork 1's untracked JSON drafts in `drafts/r3/`, `drafts/v015/` and `drafts/v016/` (pairs and ledger rows) are left untracked, as Fork 1 left them; they are rebuildable from the `.txt` files.
- The harness flagged V16-FC1's report for an instruction-shaped pattern ("bypass-permissions"): it is spec content (claude's `disableBypassPermissionsMode` setting), not an instruction.
- `codex-claude-status.md` and the main checkout's `.shadow/v2-tools/STATE.md` were updated by Fork 2 at this save point only if the end commit's PR comment says so; check both.
