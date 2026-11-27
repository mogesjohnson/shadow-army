# Handoff: orchestrator 65 (`94e1d72f`) to orchestrator 66 (2026-11-27 ~05:05 local)

This file is self-contained: do not read older handoffs. Times are local (EST).

## The owner's orders in force (owner away until 09:00)

- **New (memory `codex-review-tabs.md`):** you launch Codex review sessions yourself, like worker tabs: `wt.exe -w 0 new-tab -d C:\Users\johns\projects\AIConnections codex "Do the review in C:/Users/johns/codex-reviews/shadow-army/<file>. Follow it exactly and write its ## Result."` (config defaults to `gpt-6.2-sol`, high effort). Use Codex only for reviews. Drive and read its tab with TRACE (screenshots); check Codex's 5h usage with `/status` at the first launch (it reset about 05:05). Close the Codex tab once its Result is written. **Always close the TRACE session after each use** (the glow stays on otherwise).
- **Stop starting work at 85% of Claude's 5h window** (window reset 04:20, next 09:20). Keep the hi timer for a warm cache.
- Focus on merging, bottom-first; merge on approval at the exact head from your own Bash (`gh pr ready`, `gh pr merge <n> --merge --match-head-commit <sha>`). When this batch is merged, continue with section "Next".
- Opus medium for trust state, process termination and design; Sonnet otherwise.

## Done by orch-65

- **#109 merged** (`1364b0a`), **#111 merged** (`40a3091`, Codex 129 approved `21eec09`; two nonblocking P2s).
- C: disk was full (0 bytes) at 01:15; the owner had Halo, Unreal, the Spotify cache and 3 ISOs removed: 132 GB free.

## Open batch (the one-at-a-time rule ended at the 04:20 reset: the three touch different files, run them in parallel)

| PR | Branch | Head | State | Brief |
|---|---|---|---|---|
| #106 harness git | `claude/63-m1b-harness-git` | `183007b` | Codex 126: C21, C22 [P1]. Fix committed locally as `0588317` in worktree `w233-fix106`, untested | `tasks/w236-fix106.md` (Opus medium), file 130 |
| #117 trace check | `claude/63-m1b-trace-check` | `03cf725` | Codex 127: C15 [P1] | `tasks/w234-fix117.md` (Sonnet high), file 131 |
| #116 logs | `claude/63-m1b-logs` | `155d7fe` | Codex 128: C19 [P1]; **conflicts with main** in `src/v2/postOffice.test.ts` since #111 (brief syncs first) | `tasks/w235-fix116.md` (Sonnet medium), file 132 |

Launch w236, w234 and w235 together (briefs live in `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tasks/`). When a worker reports: `git log -1 origin/<branch>`, `git diff --stat <old>..<new>`, close its tab, launch a Codex tab on its review file. Next free review file: **133**.

## Next, after the batch merges

1. `git merge-tree --write-tree origin/main origin/<branch>` for every open M1 PR; a sync worker per conflict. #132 also edits `native/linux/sa-contain.c`: sync it with main (#109 merged).
2. Stacks on `claude/63-m1b-base-*`: #125 -> #127, #129 -> #132; #126 -> #130; #135 -> #138 -> #144; #136 -> #137; #139 -> #140, #141. Singles: #128, #131, #133, #134, #142, #143. Each base PR needs main merged in, then retargeting to `main`. Paused briefs: `tasks/w192-fix138.md`, `tasks/w194-fix141.md`.
3. Paused until M1 merges: the Ink lane, #145 to #151. Outside the lane: #75, #81, #83 (spec record, stays open), #87, #88, #98, #100.

## Lessons

- After closing a tab with TRACE, call `trace_computer_close_session` at once.
- Check free disk space (`(Get-PSDrive C).Free`) before launching a worker; ENOSPC shows as 25 ms test failures.
- For parsers and trust checks, brief one rule that covers the whole class plus sibling inputs.
