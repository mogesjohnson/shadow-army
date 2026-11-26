# Handoff: orchestrator 45 (`1086ea44`) to orchestrator 46 (2026-11-26 ~00:10 UTC)

Self-contained: do not read older handoffs. Range `147d6fc` to this commit (orch-44's handoff was the commit before `147d6fc`).

## Owner's instructions in force

- **Two lanes side by side: one Ink (v2.1) worker and one main (fix or spec) worker** (the owner, 2026-11-25). Check free memory before each launch; no second worker below 1.5 GB free. At most three workers; none new at 5h 80%+.
- Timers: hi 50 min, watch 5 min.
- A Codex file for every pushed fix or new PR in `C:/Users/johns/codex-reviews/shadow-army/` (copy the latest file's layout). Last tick `2026-11-26T00:00:17Z`.
- Merges only when the owner asks in the session: `gh pr list --base <branch>` (V14), `gh pr ready <n>`, `gh pr merge <n> --merge --match-head-commit <40-char sha>`.
- Brief at most two findings per worker.

## Done this session

- **Spec v0.29** (`147d6fc`, w128): D-40 (the full-screen Ink non-goal binds v2.0 only; v2.1 adds `shadow`) and D-41 (PO-22, the viewer's read-only feed, new milestone M7, open question Q11 on how the viewer gets its credential and port). Both checkers 0 problems.
- **v2.1 Ink slices, all draft, stacked:** #145 `183b8e6` (view model, strip, pane header; base `main`) → #146 `d5a70e4` (soldier cards, `tsconfig.json` excludes `*.test.tsx`; base `claude/63-v21-ui-start`) → #147 `bce5141` (Monarch panel, messages log; base `claude/63-v21-cards`). Windows tests pass; Linux not run.
- **#128** `2e54676` (w129): C9, C10 (P0) fixed, 93/93 Windows and WSL.
- Codex files written: 34 (#145), 35 (#128), 36 (#146), 38 (#147). 37 is reserved for w131 only if Codex has started 35.

## Waiting on the owner

1. Point Codex at files 33 to 39 (33 is #138; 39 comes from w133).
2. The profile ACL grants Modify to `CodexSandboxUsers`, so #138's C6 check marks every `.shadow` record unverified: change the ACL or the check? (Owner's setting.)
3. Spec Q11 (viewer credential and port): needed before M7, after M1b. No rush.
4. Remove the stray worktree `AIConnections-worktrees/ui-v21-monarch` (detached at `d5a70e4`, unused: the cockpit gave w132 its own `w132-ui-v21-monarch`). Deleting worktrees needs the owner's yes.

## Running workers (SendMessage each your name)

- **w131-fix128-c5** (`fc7095f4`, Opus medium; at 133k at 00:05, remind at 145k): #128 C5, the retirement barrier. orch-45 approved option (b): the relay reports the post office's exit code and signal, so its files are `register.ts`, `register.test.ts`, `src/v2/client.ts`, `src/v2/modRelay.ts` (and their existing tests). Open #126 also touches one of the `src/v2` files. It updates Codex file 35 (or writes 37). Brief `.shadow/v2-tools/tasks/w131-fix128-c5.md`.
- **w133-ui-v21-table** (`a8a303db`, Sonnet medium): slice 4, the whole War Table screen on fixtures plus `src/v21/shadow.tsx`, branch `claude/63-v21-table` off #147, worktree `w133-ui-v21-table`, Codex file 39. Brief `w133-ui-v21-table.md`.

## Queues (one worker per file)

- **Ink lane, after w133:** slice 5: the `shadow` command (`package.json` bin), keys (focus, `esc`), and the other d1 frames (`summary`, `ledger`, `replay`). Brief like `w133-ui-v21-table.md`, stacked on slice 4.
- **Main lane:**
  1. `snapshot.ts`: #120 C9 to C11 (review 31). Next, unless a review lands first.
  2. `register.ts`: after w131, #134 C5 → #131 C3, C9.
  3. `contain/sweep.ts`, `windows.ts`: after review 33 lands, #138 rest of C9 (Windows `leftOf`, `## Left` in `w126-fix138-review25.md`) + body → #144 C1, C6 → #132 C1, C5, C10 to C12 (align identity units with #138's FILETIME) → #129, #125, #135.
  4. `postOffice.ts`: after review 32 lands, #136 C1, C2.
  5. Others: #117 review 20, #123, #140.

## Codex results (all "changes requested" unless said)

| PR | Head | Review | Open |
|---|---|---|---|
| #138 | `d11dbd9` | 33 pending | C9 open |
| #128 | `2e54676`+ | 35 pending | C5 (w131) |
| #134 | `cb7d79a` | 26 | C5 |
| #131 | `eb3a3b6` | 27 | C3, C9 |
| #144 | `f251dc1` | 29 | C1 (P0), C6 |
| #132 | `3aa0c22` | 30 | C1 (P0), C5, C10 to C12 |
| #120 | `9d43b69` | 31 | C9 to C11 |
| #136 | `4f8737c` | 32 pending | C1, C2, C9 |
| #145, #146, #147 | above | 34, 36, 38 pending | first review |

## Lessons

- The cockpit gives each worker its own worktree, `AIConnections-worktrees/<worker name>`: name the worktree in a brief after the worker, or the brief's path goes unused.
- Ink slices take a Sonnet worker about 5 minutes; one slice per worker, stacked, keeps each PR under V6.
- A worker that needs a file outside its brief asks first (w131 did); widen the brief only by the files named.
