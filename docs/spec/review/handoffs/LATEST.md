# Handoff: orchestrator 31 (`7741be16`) to orchestrator 32 (2026-11-25)

Range: `904b2ba` (orch-30's handoff) to this commit. orch-30's handoff (`git show 904b2ba:docs/spec/review/handoffs/LATEST.md`) still holds where not done below. orch-31 started at 54k: a TRACE launch or close costs 5 to 10k, and idle watch ticks about 1.5k each.

**Done** (each report checked with `git show --stat` at the PR's head, tab closed):
- orch-30's tab closed.
- **Codex review 9** (comment on #63, 00:37 UTC): #122 approved; changes requested on #123 (1 P0, 5 P1), #125 (2 P0, 4 P1) and #127 (1 P0, 1 P1). **#122 merged** into `claude/63-m1b` at `68e0cf4` (Codex approved `5065f20`, typed into a + tab with TRACE, tab closed). #123 was retargeted onto `claude/63-m1b` first. Branch `claude/63-m1b-po-check` is not deleted (needs the owner's yes).
- **w76-fix126-130:** #126 at `bddfd0f` (C1, C2, C4, C6 fixed; C3 server half; C5 in #130), #130 at `8c25168`. orch-31 fixed #130's stale body sentence. #126 C7 (two pushed subjects over 72 characters) needs a history rewrite: left for the owner. Its shutdown-count question is `suggested.md` S-8.
- **w77-fix111-124:** #111 at `252846e`, #124 at `02c59b3` (merge `53d6a7f`). The post-office half is briefed as w87.
- w76 popped w77's stash by mistake (the stash list is shared across worktrees). Repaired by w76; w77 confirmed its commit is intact. `codex-fix-common.md` now forbids `git stash`.
- New briefs in `.shadow/v2-tools/tasks/`: `w84-fix123`, `w85-fix125-127`, `w86-fix126-starter` (#126 C3's client half: `client.ts`, `modRelay.ts`), `w87-fix111-postoffice` (#111 C3, C5; #124 C1, C4: `postOffice.ts`, `channel.ts`, `claude.ts`).

**Running** (reports to orch-31; it should send to the newest `orch-<n>` in ListAgents):
- **w78-fix116** (Opus medium, launched 01:05 UTC): #116, `src/v2/logs.ts` and its test, worktree `w29-logs-m1b-7-redacting-logs-src-v2-logs.ts`.

## Next

The 5-hour figure reached 80% at 01:09 UTC, so no new worker until it resets (23:00 local on the cockpit line). Two workers at a time.

1. When w78 reports: check the head, close its tab.
2. Once the 5-hour figure is under 80%, launch in this order (no two share a file): w85-fix125-127 (Opus), w84-fix123 (Opus), w86-fix126-starter (Sonnet high), w87-fix111-postoffice (Opus), w79-fix113 (Opus), w81-fix115 (Opus), w80-fix114 (Sonnet high), w82-fix119 (Sonnet medium), w83-fix117 (Sonnet medium).
3. When all of reviews 6 to 9 are fixed, write Codex batch 14 in `codex-reviews/` (batch 13's format): re-review #107, #108, #126, #130, #111, #124, #116, #113, #114, #115, #119, #117, #123, #125, #127 at their new heads.
4. Then #111 C6 (CH-1 trusted-executable resolution, `processTree.ts`) as its own task, S-8's partial count, and the #90 WSL failure worker (orch-28's Next 2).
5. Watch Codex: `gh api 'repos/mogesjohnson/shadow-army/issues/63/comments?since=2026-11-25T00:40:00Z'`. Merge what Codex approves at the exact head (V13, V14 retarget first, `gh pr ready`, `--match-head-commit`, typed into a + tab with TRACE), then close that tab.

## For the owner

- **Codex batch 13 is ready to start**: `Do the task in C:/Users/johns/projects/AIConnections/codex-reviews/11-24-2026-codex-review-13.md`.
- #126 C7: two pushed commit subjects are over 72 characters. Fixing them means rewriting pushed history; say so if you want it, otherwise they stay.
- Merged branch `claude/63-m1b-po-check` and the stale cockpit task worktrees at `383c9ba` can be deleted with your yes.
