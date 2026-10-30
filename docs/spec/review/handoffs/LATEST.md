# Handoff: session 18, the main session (session `main`), to the next session (2026-10-30)

Written by the main session at its save point, at exactly 120k by the owner's `/context`. That is the limit for a new agent, so V21-FC1 was not started. It is the next session's one task. The previous handoff is `git show 7cee874:docs/spec/review/handoffs/LATEST.md`; its sections "Everything else in flight" and "The owner's open questions" still hold, except for the review itself.

## How this session worked (new: RUNBOOK section 4)

The owner ran `/fork` three times from a fresh session renamed "main". The forks fork1, fork2 and fork3 waited on hour timers. Main split the rest of v0.21 into three draft-only tasks and sent one to each fork. Each fork wrote `repairsN.txt`, `pairsN.json` and `ledgerN.json`, dry-ran them, reported one line and stopped. No fork edited `v2.md` or `ledger.md` or committed. Main committed each batch's drafts, applied the three batches one after another, ran the checkers and pushed. No fork started an agent: by flow rule 5, drafting from given fix text is the orchestrator's job. `RUNBOOK.md` section 4 (`94fac81`) now says this for every future main session.

## The range

- Start `7cee874`. End: the commit that last changed this file. `git diff 7cee874..HEAD --stat` shows it all.
- Paths: `docs/spec/v2.md`; `docs/adr/0012-local-only-post-office.md` (R-F-165); `ledger.md`; `decisions.md`; `drafts/v021/repairs6.txt` to `repairs8.txt`, `pairs6.json` to `pairs8.json`, `pairs6-adr0012.json`, `ledger6.json` to `ledger8.json` and `pairs9-marks.json`; `RUNBOOK.md`.
- Commits: `94fac81` (RUNBOOK section 4), `2c43463`, `6bf7a92` and `2c1f1c3` (the drafts of batches 7, 6 and 8), and `e2d59b9` (all three applied).

## What is finished

**v0.21 is fully applied** (`e2d59b9`). `trace-v2.mjs` (on an LF copy, also against the `16f1181` snapshot) gives 0 problems, and so does `check-appendix-c.mjs`. `git diff --check` is clean.

- **Batch 6** (fork1, 38 spec pairs and 14 ledger rows): R-F-157 to 160 and 162 to 170. R-F-161 is marked as already fixed in v0.18 (`f48b957`). R-F-165 edits ADR-0012.
- **Batch 7** (fork2, 27 pairs and 11 rows): R-M1-224 to 234 (V18-FC1's N1 to N11).
- **Batch 8** (fork3, 11 pairs and 1 row): R-M1-223 (SET-2, CH-11, M6-AC17), and D-34's `Not tested:` notes at PO-18 Signing, S7's Mac bullet, VER-10, M6-AC8, M6-AC11, PO-12's release-notes line and a new Appendix D residual 14. `decisions.md` now records R-M1-212's start-time sources, R-M1-208's PO-8 placement, R-M1-214's 60 s and 30 s, and D-34's Applied line.
- **Marks** (main, `pairs9-marks.json`): the trace checker found five forward marks placed away from the ID they qualify (PO-1 on PO-4, HOST-10 on SES-1, SES-1 and M4-AC3 on WSP-1). Each mark now sits next to its ID. The wording is otherwise unchanged.
- **Snapshot frozen**: `.shadow/v2-tools/review/snapshots/v2@e2d59b9.md` (LF, 1861 lines). V21-FC1 cites its lines.
- **New ledger row R-F-171** (P2, "to verify in V21-FC1"): as WSP-10 is written, every post office start trusts the config as it stands then, so from M2 a change the owner answered `n` to becomes trusted at the next start. Fork 1 raised it; it is V1b's unfiled `filter.*` point from the last handoff. Check it against R-F-168's residual 14.

## Next: the one task, V21-FC1

Run fix check V21-FC1 on `v2@e2d59b9.md`: one Opus `spec-verifier` at high (flow rule 6's fix-check row), with a tight packet of exact line ranges. It checks:

1. Every P0 and P1 fix: R-M1-206, 207 and 221, and R-F-166.
2. R-F-171: CONFIRMED, REFUTED or DECISION, with the place to fix it.
3. The technical choices made while drafting:
   - R-M1-212's start-time sources, R-M1-208's PO-8 in M1, and R-M1-214's 60 s and 30 s (`decisions.md`).
   - From batch 6: M1-AC3 now cites VER-4 (the trace checker requires it once VER-4 is in M1); WSP-8 now matches a URL's password (the ledger's D-36 note); R-F-170 is answered by stating the gap in Appendix D's intro instead of adding X evidence.
   - From batch 7: R-M1-234 (N11) goes beyond V18-FC1's text: a `PATH` entry that can't be resolved is dropped.
   - From the marks: PO-1 (M1) handles a refusal of `--mcp-config` "as PO-4 (→M3) says". Check that M1 doesn't depend on PO-4.
4. P-17's finding from the last handoff: after a `SIGKILL` of Claude Code on POSIX, the post office runs on orphaned, while on Windows `taskkill /f` takes it along. Check PO-1 and the lease against that.

Then save the report to `raw/V21-FC1.md`, set its verdicts in the ledger, and repair what it confirms as v0.22. After a clean fix check, the next step is round 5 for F and M1 (`drafts/r3/PROMPTS.md`'s lenses, two reviewers per unit from round 2).

## Agents owed

V21-FC1 (above). None are running. fork1, fork2 and fork3 each did their one task and stopped.

## Left open, outside the task

- From fork3: P-8's CI result, with its SIP-off limit, is still not in S7's first bullet. It is a P3 for v0.22.
- `codex-claude-status.md` (the status board RUNBOOK section 2 names) was not found in the review branch's `docs/spec/review/` or in `.shadow/v2-tools/`. Find it or drop it from the runbook.
- The owner's questions are unchanged from the last handoff: P-17's Windows cases, the haiku model mismatch, alpha Q4 deferred until A6, the `Co-Authored-By: Ziggy` line on PR #81, and the cockpit mod's "+" choice.
