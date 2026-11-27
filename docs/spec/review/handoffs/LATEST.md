# Handoff: orchestrator 63 (`23085a41`) to orchestrator 64 (2026-11-27 ~04:50 UTC)

This file is self-contained: do not read older handoffs. The 5-hour window reset at 04:20 UTC and was at 29% at 04:47. **Start no new worker at 80% or more.** (The owner's one-off exception before the reset is over.) RAM is tight.

## The owner's orders in force

- **Bottom-first** (memory `bottom-first.md`). Merge on approval without asking, from your own Bash: `gh pr ready <n>`, then `gh pr merge <n> --merge --match-head-commit <full sha>`. First retarget any PR stacked on the branch.
- **Codex review files:** write the next file as soon as a PR's head is ready, and **give the owner its full path at once** (the owner asked again, 2026-11-27). Independent PRs can each have a file at the same time.
- Model and effort: Sonnet by default. Opus medium for concurrency, process termination, launch security and design.

## Done by orch-63

- **#113 merged** at `f1f61be` (Codex 113 approved `97587be`, one nonblocking P2).
- Fixes pushed and sent to Codex: #123 `ec1b0b3` (file 114, then changes requested), #117 three rounds, #109 `2a2d272`, #116 `0e9bca3`, #111 `00697ab`.

## With Codex (files in `~/codex-reviews/shadow-army/`)

| File | PR | Head | Status |
|---|---|---|---|
| 117 | #109 Linux helper | `2a2d272` | waiting; fixes C12 to C14 (review 110) |
| 118 | #116 logs | `0e9bca3` | waiting; fixes C15 to C17 (review 111) |
| 119 | #111 claude faults | `00697ab` | waiting; fixes C12 to C15 (review 112) |
| 120 | #117 trace check | `9c59313` | waiting; fixes C11 to C13 (review 116), token lexer |

**Next free file: 121.** Read each file's `## Result`. Approved: merge it. Changes requested: start a fix worker (brief in `.shadow/v2-tools/tasks/`, pointing at `codex-fix-common.md`, detached worktree, `git push origin HEAD:<branch>`), then write the next file. Copy the brief format of `tasks/w223-fix111.md`.

## Running (they report to orch-63: SendMessage each one your name first)

- **w221-fix106** (Opus medium, session `986f1655`, brief `tasks/w221-fix106.md`), on #106 (`claude/63-m1b-harness-git`): Codex 109's C15 to C18 in `src/v2/git/hold.ts` (trust baseline, overlapping registrations, hold persisted with the registration). Old head `663dd27`. When done, write file 121.
- **w224-fix123** (Opus medium, just launched, brief `tasks/w224-fix123.md`), on #123 (`claude/63-m1b-po-check-run`): Codex 114's C10 [P1] (stop launch before spawning on abort, `contain/windows.ts`) and C11 [P2]. Old head `ec1b0b3`.

When one reports: check `git log`/`git show --stat` against its report, close its tab with TRACE, then write the next Codex file and give the owner its path.

## Next, bottom-up

1. Merge #106, #109, #111, #116, #117, #123 on approval. After each merge, check the others with `git merge-tree --write-tree origin/main origin/<branch>`. **#111 and #123 conflict in `contain/windows.ts`**: whichever merges second needs a sync worker (Opus medium; it is process code) to merge main in, then a short Codex file.
2. Stacks on `claude/63-m1b-base-*`: #125 -> #127, #129 -> #132; #126 -> #130; #135 -> #138 -> #144; #136 -> #137; #139 -> #140, #141. Singles: #128, #131, #133, #134, #142, #143. Each base PR needs main merged in, then it is retargeted to `main`. Wait until the batch above has merged (each merge moves main). Paused briefs: `tasks/w192-fix138.md`, `tasks/w194-fix141.md`.
3. Paused until M1 merges: the Ink lane, #145 to #151. Outside the lane: #75, #81, #83 (the spec record, stays open), #87, #88, #98, #100.

## Lessons

- Codex now reviews in minutes. Expect a result for each file within about 15 minutes, and keep three workers busy.
- #117's regex scanner took three rounds. For parsers, brief the approach (tokens, normalization) and ask for sibling test inputs, not only Codex's exact cases.
- Two PRs that touch the same file are fixed one after the other (the cockpit's same-file guard works across worktrees).
