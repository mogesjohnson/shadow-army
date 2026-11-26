# Handoff: orchestrator 46 (`06902c0d`) to orchestrator 47 (2026-11-26 ~01:10 UTC)

Self-contained: do not read older handoffs. Range `ddc210f` (orch-45's handoff) to this commit; no spec change this session.

## Owner's instructions in force

- **Two lanes side by side: one Ink (v2.1) worker and one main (fix or spec) worker** (the owner, 2026-11-25). No second worker below 1.5 GB free. At most three workers; **none new at 5h 80%+** (it was 83% at 01:07, resets 23:20 local).
- Timers: hi 50 min, watch 5 min.
- A Codex file for every pushed fix or new PR in `C:/Users/johns/codex-reviews/shadow-army/` (copy the latest file's layout). Next free number: **44**. Last tick `2026-11-26T01:07:14Z`.
- Merges only when the owner asks in the session: `gh pr list --base <branch>` (V14), `gh pr ready <n>`, `gh pr merge <n> --merge --match-head-commit <40-char sha>`.
- Brief at most two findings per worker.

## Done this session (all workers closed; none running)

| PR | New head | What | Codex file |
|---|---|---|---|
| #128 | `2fb0f78` | C5: relay reports `post_office_exit`; barrier lifts only on it (w131) | 35 (updated) |
| #120 | `9ae8f9d` | C9, C11 (`a78852e`, w134), C10 (w135). PR is 682 lines, 2 files (fix-round exception) | 37 |
| #134 | `0c4aea1` | C5: sweep barrier lifts only on terminal `return()` or later read exit (w137) | 40 |
| #131 | `a892da4` | C3 (each use keeps its first card), C9 (closing rechecked before every post) (w139) | 42 |
| #148 | `38dc6ab` | v2.1 slice 4, War Table screen + `src/v21/shadow.tsx`; base `claude/63-v21-monarch` (w133, w136) | 39 |
| #149 | `e38e33e` | slice 5a: summary + ledger screens; base `claude/63-v21-table` (w138) | 41 |
| #150 | `2bd55ab` | slice 5a part 2: replay screen; base `claude/63-v21-screens` (w140) | 43 |

All Windows tests pass per the workers; WSL Linux passed for the fix PRs, `not_run` for the Ink slices. **Stacked PRs get no CI**: `ci.yml` runs only on PRs into `main`; workers say so in `Validation:`.

## Waiting on the owner

1. Point Codex at files 33 to 43 (33 is #138).
2. #138's C6 check vs the profile ACL granting Modify to `CodexSandboxUsers`: change the ACL or the check?
3. Spec Q11 (viewer credential and port): before M7. No rush.
4. Remove stray worktree `AIConnections-worktrees/ui-v21-monarch` (unused). Worktree deletes need the owner's yes.

## Queues (one worker per file)

- **Ink lane:** slice 5b: the `shadow` command (`package.json` bin), keys (focus, `esc`, switching War Table / summary / ledger / replay), in `src/v21/shadow.tsx` and a new keys module; stacked on #150 (branch `claude/63-v21-replay`). Copy the layout of `tasks/w140-ui-v21-replay.md`. Sonnet medium.
- **Main lane:**
  1. `contain/sweep.ts`, `windows.ts`: after review 33 lands, #138 rest of C9 (Windows `leftOf`, `## Left` in `tasks/w126-fix138-review25.md`) + body → #144 C1 (P0), C6 → #132 C1 (P0), C5, C10 to C12 (align identity units with #138's FILETIME) → #129, #125, #135.
  2. `postOffice.ts`: after review 32 lands, #136 C1, C2.
  3. Others: #117 review 20, #123, #140.
  4. Whatever Codex reopens on files 35, 37, 40, 42.
- Fix briefs: copy `tasks/w139-fix131-c3c9.md` (points at `codex-fix-common.md`).

## Codex results still open (all "changes requested")

#138 `d11dbd9` (33 pending, C9) · #144 `f251dc1` (29: C1 P0, C6) · #132 `3aa0c22` (30: C1 P0, C5, C10-C12) · #136 `4f8737c` (32 pending: C1, C2, C9) · #145 `183b8e6`, #146 `d5a70e4`, #147 `bce5141` (34, 36, 38 pending, first review).

## Lessons

- Name the worktree in a brief after the worker (`AIConnections-worktrees/<worker name>`); the cockpit makes it.
- Ink slices: a Sonnet worker runs out near 150k on one screen plus tests; give one or two screens per worker and let it open the PR before 400 lines / 6 files.
- Briefs to workers that may outlive you: "report to the newest orch-<n> in ListAgents".
