# Handoff: orchestrator 37 (`df8b84a6`) to orchestrator 38 (2026-11-25)

Self-contained: do not read older handoffs. Range `013be2e` to this commit.

## Owner's instructions in force

- **HOLD (the owner, 2026-11-25 03:40 UTC): start no new worker sessions until the owner says so. Only let the running workers finish, check their reports and close their tabs.** The queues below wait.
- **The 5-hour limit: 80% at most.** Stop all new work at 80% on the cockpit line.
- At every 5-minute tick, check Codex's reviews: `bash C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tools/codex_tick.sh <last tick ISO>`. Last tick: 03:35 UTC.
- Keep startup context small (2026-11-25): orch-37 cut RUNBOOK.md to section 0 and both STATE.md files to short current states (old logs: `git show 013be2e:docs/spec/review/STATE.md` and `.shadow/v2-tools/STATE-log-to-2026-11-25.md`). Keep LATEST.md under 5 KB.

## Running workers (all report to orch-38 once you SendMessage them your name)

| Worker | Session | PR | Files |
|---|---|---|---|
| w100-fix136-close (Sonnet high) | `1b861682` | #136 close-out: checks, replies, body | `postOffice.ts`, `postOffice.test.ts`, `client.test.ts`, `src/workspace/session.ts`, `snapshot.ts`, `snapshot.test.ts` |
| w90-fix131 (Opus medium) | `ce1a5a8f` | #131, review 10 | `plugins/shadow-army/hooks/register.ts` and its test |

Run `sed -i 's/orch-37/orch-38/g'` on every brief in `.shadow/v2-tools/tasks/` that names orch-37.

## Done by orch-37

- orch-36's tab closed. w99 (#128 at `b48a5fd`, C1 to C7, 62 tests on Windows and Linux) and w101 (#140 at `846e5ea`, C1 to C6 fixed, C7 answered) checked and closed. w80 (#114 at `bd826eb`, C1 fixed, C2 answered, files within its brief) checked.
- #137 split into three briefs, run in order after w100: `w98-fix137-start` (C2, C3, C8; merges #136's fixed head first), `w102-fix137-turns` (C5 to C7), `w103-fix137-records` (C1, C4). All Opus medium.
- Codex prompts for the unreviewed fixes: `codex-reviews/11-25-2026-codex-review-14.md` (12 M1b-1 PRs) and `-15.md` (10 containment and post office PRs). Review 13 (M1a re-review) was never run; it now drops #141, #142 (reviewed in 12) and #106/#120/#121 (in 14). **Tell the owner 13, 14 and 15 are ready to give to Codex.**

## Queues (one worker per file at a time; three workers at most)

1. **`postOffice.ts`:** w100, then w98, w102, w103 (#137), then `w93-fix133`, then #139, #141, #142, #143 (review 12; write their briefs from each PR's last review: `gh api repos/mogesjohnson/shadow-army/pulls/<n>/reviews --jq '.[-1].body'`), then the PO-14 gate (#127 C2; #127 must not merge before it).
2. **#138 C1** (lossless FILETIME through `contain/trees.ts`, `sweep.ts`, `windows.ts`; Opus medium; brief not yet written): before #142, and not beside w91.
3. **`register.ts`:** w90, then `w91-fix134` (also `sweep.ts`: not beside #138 C1).
4. **Free to run beside the others:** `w82-fix119` (roster and instructions, Sonnet medium), `w83-fix117` (`scripts/check-spec-trace.mjs`, Sonnet medium).
5. When Codex approves a PR at its exact head, merge per RUNBOOK 0.2 (V13, V14).

## Lessons

- Launch with the `wt.exe` line in RUNBOOK 0.2: it costs far less context than the TRACE + button route.
- TRACE and `gh` output is large: pipe through `cut -c1-200` and `head`. orch-37 reached 150k in about 15 minutes of reading.
