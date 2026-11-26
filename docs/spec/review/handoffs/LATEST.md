# Handoff: orchestrator 60 (`59e99e86`) to orchestrator 61 (2026-11-26 ~23:30 UTC)

Self-contained: do not read older handoffs. The 5-hour window reset at 18:20 local (0% at 23:21 UTC). RAM is tight (~3.5 GB free): Claude Code killed orch-60's background timers once under memory pressure.

## The owner's orders in force

- **Bottom-first** (memory `bottom-first.md`): work only the lowest unapproved PR, merge, repeat. No new PRs or `base-*` branches until the stack is a handful (the `claude/63-m1b` PR below is the agreed exception: the owner asked for the next review after #94).
- **Merge on approval, unasked**, and **merge from your own Bash** (to orch-60: "orchs are allowed to merge. we dont need to make new sessions for merging"). RUNBOOK 0.2 Merge is updated. Retarget stacked PRs first, `--match-head-commit <full sha>`.
- **The owner hands Codex the review files.** Write the next Codex file as soon as a PR's fixes are pushed, and tell the owner its path.
- **5-hour budget** (the owner, to orch-60): a worker may start above 80% if the owner says so; pause it at 97% (push what passes, `## Left`, wait for the reset).

## Done by orch-60

- **#95 merged** at `91c401c` (Codex review 97 approved `92f7552`). C18 (unbounded key scan in `logs.ts`) is the P2 follow-up Codex allowed: not yet filed.
- **#94 merged** at `19384ed` (Codex review 99 approved `4e6daac`, after w202 to w205 fixed reviews 96 and 98). #92 and #93 closed as folded; #90 shows merged (its head is in `main`). **M1a is in `main`.**

## Running

- **w206-m1bsync** (Opus medium, session `6e36aa75`, worktree `AIConnections-worktrees/w206-m1bsync-merge-main-into-claude-63-m1b-open-m1b-draft-pr`, brief `.shadow/v2-tools/tasks/w206-m1bsync.md`): merges `origin/main` into `claude/63-m1b` (37 ahead, 71 behind; one conflict, `src/v2/processTree.ts`: keep #95's C17 realpath refusals and M1b's changes), runs checks, pushes, opens the **draft PR `claude/63-m1b` -> `main`**. It reports to orch-60: SendMessage it your name first.

## Next

1. When w206 reports: `git show --stat` its merge commit, close its tab, write **Codex file 100** (`C:/Users/johns/codex-reviews/shadow-army/`, model on `11-26-2026-codex-review-99.md`) for the new M1b PR at its head, tell the owner the path.
2. Then the M1b children bottom-up. On `claude/63-m1b` directly: #106, #107, #109, #111, #113, #115, #116, #117, #123. Each child needs `claude/63-m1b` merged in after w206's push before Codex reviews it. Paused briefs with open Codex findings: #111 at `6d4ff2f`, #138 at `3e37186` (`tasks/w192-fix138.md`), #141 at `df61172` (`tasks/w194-fix141.md`, `## Left`). Stacks on `claude/63-m1b-base-*`: #125 -> #127, #129 -> #132; #126 -> #130; #135 -> #138 -> #144; #136 -> #137; #139 -> #140, #141; singles #128, #131, #133, #134, #142, #143.
3. Paused until M1 merges: Ink lane #145 to #151. Outside the lane: #98, #100, #81, #83 (spec record, stays open), #87, #88, #75.

## Codex files

97 (#95) approved, 98 (#94) changes requested, 99 (#94) approved. **Next free: 100.**

## Lessons

- The tab orch-59 called "not orch-59's" ("Merge PR stack #95 and #94 after Codex review") was orch-59's own tab (Claude Code retitles tabs from the session summary). Identify a tab by clicking it and taking one scaled screenshot.
- A worker's prompt must open with words that name its own task (the cockpit's duplicate-task stop compares openings).
- When no worker runs and Codex has nothing pending, one long sleep to the next event beats 5-minute ticks.
