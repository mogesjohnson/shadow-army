# Handoff: orchestrator 62 (`6ec1cd7a`) to orchestrator 63 (2026-11-27 ~03:58 UTC)

This file is self-contained: do not read older handoffs. The 5-hour window was at 77% at 03:57 UTC and resets at 23:20 local time. **Start no new worker at 80% or more** unless the owner says so. RAM is tight, about 3.5 GB free.

## The owner's orders in force

- **Bottom-first** (memory `bottom-first.md`). Merge on approval without asking, from your own Bash: `gh pr ready <n>`, then `gh pr merge <n> --merge --match-head-commit <full sha>`. First retarget any PR stacked on the branch.
- **The owner hands Codex the review files.** Write the next file as soon as a PR's head is ready, and tell the owner its path. Independent PRs can each have a file at the same time.
- Model and effort: Sonnet by default. Opus medium for concurrency, process termination, launch security and design.

## Done by orch-62

- **#115 merged** at `9c833b8` (Codex 108 approved `c7187cb`; C7 is a nonblocking P2 checklist note).
- w211 merged main into #116, and w212 merged main into #113, #115, #117 and #123. Fixes were pushed for #106 (w210), #109 (w213), #116 (w215) and #111 (w214).

## With Codex (files in `~/codex-reviews/shadow-army/`)

| File | PR | Head | Status |
|---|---|---|---|
| 109 | #106 harness Git hold | `663dd27` | waiting; fixes C13 (review 102) |
| 110 | #109 Linux helper | `547a836` | waiting; fixes C10 and C11 (review 104) |
| 111 | #116 logs | `1a3c4a4` | waiting; fixes C13 and C14 (review 106) |
| 112 | #111 claude faults | `1c4eab7` | waiting; fixes C10 and C11 (review 105), with 2 build notes |

**Next free file: 113.** Read each file's `## Result`. Approved means merge it. Changes requested means start a fix worker (brief in `.shadow/v2-tools/tasks/`, pointing at `codex-fix-common.md`), then write the next file. Each brief now tells the worker to use a **detached worktree** and `git push origin HEAD:<branch>`, because stale w2x/w3x worktrees still hold the branches.

## Running (they report to orch-62: SendMessage each one your name first)

- **w217-fix123** (Opus medium, session `162ca938`, brief `tasks/w217-fix123.md`), on #123 (`claude/63-m1b-po-check-run`). C8 is fixed at `bbdda72`. It is now doing C2 and C4, a signal option and a no-grace `kill()` in `src/v2/contain/windows.ts` (plan under `## Left`), then C9, the Size line. The cockpit held it while w214 edited `windows.ts`. #111 also changes `windows.ts`, so expect a small merge conflict between #111 and #123 later.
- **w218-fix113** (Opus medium, session `50cf0b05`, brief `tasks/w218-fix113.md`), on #113: Codex 107's C6 [P1], rollback ownership after generation reuse.
- **w216-fix117** (Sonnet medium, just launched, brief `tasks/w216-fix117.md`), on #117: C1 and C4, both P1 from Codex review 20.

When one reports: check `git log`/`git show --stat` against its report, close its tab with TRACE, then write the next Codex file.

## Next, bottom-up

1. Merge #106, #109, #111 and #116 on approval. After each merge, check the others with `git merge-tree --write-tree origin/main origin/<branch>`. #111 and #123 both touch `contain/windows.ts`.
2. #113, #117 and #123 go to Codex once their fixes are in.
3. Stacks on `claude/63-m1b-base-*`: #125 -> #127, #129 -> #132; #126 -> #130; #135 -> #138 -> #144; #136 -> #137; #139 -> #140, #141. Singles: #128, #131, #133, #134, #142, #143. Each base PR needs main merged in, then it is retargeted to `main`. Paused briefs: `tasks/w192-fix138.md` and `tasks/w194-fix141.md` (`## Left`).
4. Paused until M1 merges: the Ink lane, #145 to #151. Outside the lane: #75, #81, #83 (the spec record, which stays open), #87, #88, #98 and #100. 42 PRs were open at 03:30 UTC, 41 after #115.

## Lessons

- Close a reporting worker's tab **before** launching the next one, or you briefly run four tabs.
- Unfixed P1s left from older reviews (#117, #123) only showed up when a sync worker listed open findings. Ask every sync worker for that list.
- The cockpit's same-file guard applies across worktrees. Two tasks that touch the same path run one after the other, even on different branches.
