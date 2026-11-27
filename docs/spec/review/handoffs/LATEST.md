# Handoff: orchestrator 64 (`fae69e64`) to orchestrator 65 (2026-11-27 ~05:35 UTC)

This file is self-contained: do not read older handoffs. The 5-hour window was at 74% at 05:30 (it reset at 04:20 UTC). **New limit (the owner, 2026-11-27): "we can push 95% for 5h": start no new worker at 95% or more.** RAM is tight.

## The owner's orders in force

- **Bottom-first** (memory `bottom-first.md`). Merge on approval without asking, from your own Bash: retarget any PR stacked on the branch, then `gh pr ready <n>`, `gh pr merge <n> --merge --match-head-commit <full sha>`.
- **Codex review files:** the worker writes the next file when its fix is pushed; **give the owner each file's full path at once.** The owner asked about file 123 still being unreviewed: if a file sits for over 15 minutes, tell the owner its path again.
- Sonnet by default; Opus medium for concurrency, process termination, launch security, trust state and design.

## Done by orch-64

- **#123 merged** at `99bf3a3` (Codex 121 approved `07f7fb7`; one nonblocking P2, C12).
- **D-42** (orch-64): the Linux helper's minimum is Linux 5.1 (`pidfd_send_signal`); it refuses before `ready` on an older kernel, no non-pidfd fallback. Spec PO-12 and decisions.md at `410961e` on this branch.
- #111 synced with main after #123 (w227, `c305f27`, `windows.ts` resolved), then fixed (w228).
- File 124 is marked SUPERSEDED (by 125).

## With Codex (files in `~/codex-reviews/shadow-army/`)

| File | PR | Head | Fixes |
|---|---|---|---|
| 123 | #109 Linux helper | `7bc9add` | review 117's C15 to C17 (D-42) |
| 125 | #111 claude faults | `97e83d6` | merge `c305f27` + review 119's C16 to C18 |
| 127 | #117 trace check | `03cf725` | review 120's C14 (lexer: previous-token slash rule; TS 7 has no JS parser API) |

**Next free file: 129** (126 and 128 are reserved by the running workers). Read each file's `## Result`. Approved: merge it. Changes requested: a fix worker with a brief in `.shadow/v2-tools/tasks/` (copy `w228-fix111.md`: detached worktree, `git push origin HEAD:<branch>`, the worker writes the next file).

## Running (they report to orch-64: SendMessage each one your name first)

- **w229-fix106** (Opus medium, session `95319114`, brief `tasks/w229-fix106.md`), #106 (`claude/63-m1b-harness-git`, old head `c9dabc8`): Codex 122's C19 and C20 in `src/v2/git/hold.ts` (verify every pointer slot, present or absent, at registration, scan and startup). Writes file 126.
- **w231-fix116** (Sonnet medium, session `d1d62664`, brief `tasks/w231-fix116.md`), #116 (`claude/63-m1b-logs`, old head `0e9bca3`): Codex 118's C18 in `plugins/shadow-army/hooks/register.ts` (one transcript line for a refused send). Writes file 128.

When one reports: `git log -1 origin/<branch>` and `git diff --stat <old>..<new>` against its report, close its tab with TRACE, give the owner the file path.

## Next, bottom-up

1. Merge #106, #109, #111, #116, #117 on approval. After each merge, `git merge-tree --write-tree origin/main origin/<branch>` for the others (all clean against `99bf3a3` at 05:30) and send a sync worker for a conflict.
2. **Known issues to carry:** #111 has 4 Linux-only test failures that predate the last round (3 claude synthetic-protocol tests, "Unexpected end of JSON input", and the postOffice tool_call case): if Codex raises them, a Linux fix worker in `~/ci/w<n>`. #109's driver must show the pre-ready "Linux 5.1" refusal as a refused start, no retry (build note). #132 also edits `native/linux/sa-contain.c`: sync after #109 merges.
3. Stacks on `claude/63-m1b-base-*`: #125 -> #127, #129 -> #132; #126 -> #130; #135 -> #138 -> #144; #136 -> #137; #139 -> #140, #141. Singles: #128, #131, #133, #134, #142, #143. Each base PR needs main merged in, then it is retargeted to `main`, after the batch above merges. Paused briefs: `tasks/w192-fix138.md`, `tasks/w194-fix141.md`.
4. Paused until M1 merges: the Ink lane, #145 to #151. Outside the lane: #75, #81, #83 (the spec record, stays open), #87, #88, #98, #100.

## Lessons

- Codex returns most files in 10 to 25 minutes; a Codex result often lands while a sync worker runs on the same PR. Check the PR's latest review before writing a review file for a sync, or the file is wasted (124).
- For parsers and trust checks, brief one rule that covers the whole class plus sibling test inputs; it cut #117 and #106 rounds.
