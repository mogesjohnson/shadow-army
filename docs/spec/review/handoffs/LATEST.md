# Handoff: orchestrator 61 (`a86625cd`) to orchestrator 62 (2026-11-27 ~03:25 UTC)

This file is self-contained: do not read older handoffs. The 5-hour window was at 37% at 03:20 UTC. RAM is tight, about 3 to 5 GB free. Claude Code killed orch-61's background timers once under memory pressure. If that happens, do not restart them until the owner says "restart timers".

## The owner's orders in force

- **Bottom-first** (memory `bottom-first.md`). Merge on approval without asking, from your own Bash. Before merging, retarget the stacked PRs and use `--match-head-commit <full sha>`.
- **The owner hands Codex the review files.** Write the next Codex file as soon as a PR's head is ready, and tell the owner its path. Independent PRs can each get a file at once.
- **5-hour budget:** no new worker at 80% or more, unless the owner says so.

## Done by orch-61

- **#152 (the M1b base, `claude/63-m1b`) merged** at `e0935f4` (Codex 100 asked for changes; w208 fixed C1 to C3; Codex 101 approved `2b3b5f1`). Its P2 follow-ups are not filed: C4 (stale Size, now moot) and C5 (the probe test's teardown when no descendant PID arrives). Its nine children were retargeted to `main`.
- **#107 merged** at `fde2593` (Codex 103 approved `b62ce59`).
- w207 merged `claude/63-m1b@2b3b5f1` into #106, #109, #113, #115, #116, #117 and #123. w209 merged `main` into #111 (`fc8b256`).

## Running

- **w210-fix106** (Opus medium, session `8d98986a`, worktree `AIConnections-worktrees/w210-fix106`, brief `.shadow/v2-tools/tasks/w210-fix106.md`). It is fixing Codex 102 on #106: C13 [P1], where shared Git state is trusted at registration (`src/v2/git/hold.ts`, `hold.test.ts`), and C14 [P2], long subjects in pushed history, which gets a reply only. It reports to orch-61: SendMessage it your name first. When it reports, check `git show --stat`, close its tab, and write Codex file **106** for #106 at its new head.

## With Codex (files the owner hands over)

| File | PR | Head | Status |
|---|---|---|---|
| 104 | #109 Linux helper | `ae68ef2` | written; C8/C9 fixes and #110 fold unreviewed |
| 105 | #111 claude faults | `fc8b256` | written; C8, C9 and #124 C6 unverified; a known P2: a refusal at the session spawn reads as transport, not refusedStart (w209's brief `## Left`). Codex says whether it blocks |

**Next free file: 106.** Read each file's `## Result`. Approved means merge. Changes requested means a fix worker on that branch, then the next file.

## Next, bottom-up

1. Merge #109 and #111 on approval, and #106 after its re-review.
2. Then #113, #115, #116, #117 and #123. Each already has `2b3b5f1` merged in. Update each `Tracking:` line to `main` (sed on the body; see #106, #107 and #109) and write one Codex file per PR. Since #107 merged, main has moved, so check for conflicts with `git merge-tree` before writing each file.
3. Stacks on `claude/63-m1b-base-*`: #125 -> #127, #129 -> #132; #126 -> #130; #135 -> #138 -> #144; #136 -> #137; #139 -> #140, #141. Singles: #128, #131, #133, #134, #142, #143. Each base PR needs `main` merged in, then it is retargeted. Paused briefs: `tasks/w192-fix138.md` and `tasks/w194-fix141.md` (`## Left`).
4. Paused until M1 merges: the Ink lane, #145 to #151. Outside the lane: #98, #100, #81, #83 (the spec record, which stays open), #87, #88 and #75.

## Lessons

- Workers merging a base into many children: brief them to fetch before each merge. If the base moves, re-merge (w207 did all of them on the new tip).
- A child's merge can need small fixes, such as a missing field (`droppedPath`) or a fixture (`root`, `live: true`). List them in the Codex file.
- Codex numbers findings per PR. Tell it where to continue.
