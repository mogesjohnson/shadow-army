# Handoff: orchestrator 37 (`df8b84a6`) to orchestrator 38 (2026-11-25), updated by orch-38

Self-contained: do not read older handoffs. Range `013be2e` to this commit.

## Owner's instructions in force

- HOLD (03:40 UTC) lifted by the owner at 05:20 UTC.
- **The 5-hour limit: 80% at most.** Stop all new work at 80% on the cockpit line.
- At every 5-minute tick, check Codex's reviews: `bash C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tools/codex_tick.sh <last tick ISO>`. Last tick: 04:07 UTC.
- Keep startup context small (2026-11-25): orch-37 cut RUNBOOK.md to section 0 and both STATE.md files to short current states (old logs: `git show 013be2e:docs/spec/review/STATE.md` and `.shadow/v2-tools/STATE-log-to-2026-11-25.md`). Keep LATEST.md under 5 KB.

## Running workers

The owner lifted the HOLD at 05:20 UTC ("Hold lifted, launch w104"). orch-38 launched:

| Worker | PR | Files |
|---|---|---|
| w104-fix136-wincalls (Opus medium) | #136 Windows timeouts | `postOffice.ts`, `postOffice.test.ts` |
| w91-fix134 (Opus medium) | #134, review 10 | `register.ts`, `sweep.ts` per brief (not beside #138 C1) |
| w82-fix119 (Sonnet medium) | #119, review 8 | roster and instructions per brief |

## Done by orch-38 (`a1eb4681`)

- orch-37's tab is closed, and the briefs now say orch-38.
- **w90:** #131 at `6045a15`, 2 files, within its brief; tab closed. C2, C3, C4 and C6 are fixed, and C1 is fixed on the mod side. Still open are build notes for the #143+#131 integration: C1's dispatcher test (needs #143's `server.ts`) and C5's `/army` card. For C7, old commit `7166886` kept its subject (no rewrite).
- **w100:** #136 at `4ef57e4` (one fixture fix to `postOffice.test.ts`); C1 to C6 replied, body posted; tab closed. **#136 is red on Windows:** 5 test files time out (cause: about 30 harness git calls per turn at about 440 ms each, from `5279ee7`). WSL passes. The next brief is written: `w104-fix136-wincalls` (`postOffice.ts` and its test; Opus medium).

## Done by orch-37

- orch-36's tab closed. w99 (#128 at `b48a5fd`, C1 to C7, 62 tests on Windows and Linux) and w101 (#140 at `846e5ea`, C1 to C6 fixed, C7 answered) checked and closed. w80 (#114 at `bd826eb`, C1 fixed, C2 answered, files within its brief) checked.
- #137 split into three briefs, run in order after w100: `w98-fix137-start` (C2, C3, C8; merges #136's fixed head first), `w102-fix137-turns` (C5 to C7), `w103-fix137-records` (C1, C4). All Opus medium.
- Codex prompts for the unreviewed fixes: `codex-reviews/11-25-2026-codex-review-14.md` (12 M1b-1 PRs) and `-15.md` (10 containment and post office PRs). Review 13 (M1a re-review) was never run; it now drops #141, #142 (reviewed in 12) and #106/#120/#121 (in 14). **Tell the owner 13, 14 and 15 are ready to give to Codex.**

## Queues (one worker per file at a time; three workers at most)

1. **`postOffice.ts`:** `w104-fix136-wincalls` (#136 Windows timeouts), then w98, w102, w103 (#137), then `w93-fix133`, then #139, #141, #142, #143 (review 12; write their briefs from each PR's last review: `gh api repos/mogesjohnson/shadow-army/pulls/<n>/reviews --jq '.[-1].body'`), then the PO-14 gate (#127 C2; #127 must not merge before it).
2. **#138 C1** (lossless FILETIME through `contain/trees.ts`, `sweep.ts`, `windows.ts`; Opus medium; brief not yet written): before #142, and not beside w91.
3. **`register.ts`:** w90, then `w91-fix134` (also `sweep.ts`: not beside #138 C1).
4. **Free to run beside the others:** `w82-fix119` (roster and instructions, Sonnet medium), `w83-fix117` (`scripts/check-spec-trace.mjs`, Sonnet medium).
5. When Codex approves a PR at its exact head, merge per RUNBOOK 0.2 (V13, V14).

## Lessons

- Launch with the `wt.exe` line in RUNBOOK 0.2: it costs far less context than the TRACE + button route.
- TRACE and `gh` output is large: pipe through `cut -c1-200` and `head`. orch-37 reached 150k in about 15 minutes of reading.
