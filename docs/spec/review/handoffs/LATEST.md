# Handoff: orchestrator 59 (`c2912f7d`) to orchestrator 60 (2026-11-26 ~21:10 UTC)

Self-contained: do not read older handoffs. 5-hour window at 61% (resets 18:20 local). RAM ~2.5 GB free.

## The owner's orders in force

- **Bottom-first** (memory `bottom-first.md`): work only the lowest unapproved PR, merge, repeat. No new PRs or `base-*` branches until the stack is a handful.
- **Merge without asking** (to orch-59, 2026-11-26): "merge what is good merge, [don't keep] asking me about merging. after review it may be merged." Once Codex approves the exact head and its `Validation:` passes, merge (merge commit, `--match-head-commit`, a script in its own tab, RUNBOOK 0.2). Closing PRs folded into a merged PR is covered too.

## The stack, bottom up

1. **#95** `claude/63-m1a-transport` <- `main`, head **`92f7552`**. Codex review 95 (at `f184ef0`, pinned review 6080376064) asked for C17 to C19. orch-59 fixed C17 in `9b1c5cc` (executable realpath) and `92f7552` (repository roots; ENOENT keeps the lexical path). C19 (body Size: 4162 lines, 35 files, 36 commits) is fixed. C18 (unbounded key scan in `logs.ts`) is a follow-up Codex allowed. Map: issuecomment-7203256294. **Codex file 97 is written, not yet run.** On approval: retarget #94 and #90 to `main` (V14), `gh pr ready 95`, `gh pr merge 95 --merge --match-head-commit 92f7552`.
2. **#94** `claude/63-m1a-slice` <- transport, head **`7f65691`** (orch-59 merged #95's C17 commits into it, as Codex asked). Codex review 96 (at `916f8be`, pinned review 6080400453) asked for C10 to C16: P1 6, P2 1.
   - **Running: w202-claude94** (Opus medium, session `995de78c`, worktree `AIConnections-worktrees/w202-claude94`): C11 and C13 in `src/v2/claude.ts`, its test and `test/fakes/claude.mjs`. Brief `tasks/w202-claude94.md`.
   - **Next: w203-office94** (brief written, `tasks/w203-office94.md`): C12, C14 and C15 in `postOffice.ts` and `apply.ts`. Launch it once w202 reports (see Lessons). It may start in parallel because the files differ, but only with a prompt that doesn't start like w202's.
   - **Then C10** (brief to write): `server.ts` misclassifies a writer under overlapping requests. Enforce matching claims in `PostOffice.send` against the selected session, so it waits for w203 (same file).
   - **Then C16**: the #94 body's Size and Validation at the final head, plus self-review and Codex file 98 for #94.
3. **Folded into #94:** #96, #99 and #101 are already merged into the slice. #90 (base transport), #92 and #93 are still open. Close each, with a comment naming the merge, once #94 merges.
4. After #94: a draft PR for `claude/63-m1b` (no PR yet), then the M1b PRs bottom-up.

Paused above the bottom: #141 at `df61172` (`tasks/w194-fix141.md`, `## Left`), #138 at `3e37186` (`tasks/w192-fix138.md`), #111 at `6d4ff2f`; #139 C3, #142, #143, Ink lane #145 to #151.

## Codex files (`~/codex-reviews/shadow-army/`)

95 done (#95 changes requested), 96 done (#94 changes requested), **97 pending (#95 at `92f7552`)**. Next free: 98. Results go in each file's `## Result`. A background `until` loop on those sections works as a watch.

## Lessons

- **The duplicate-task stop compares prompt openings.** w202's and w203's prompts both began "Fix PR 94 Codex C1…", and the cockpit held w203 as a duplicate. Per RUNBOOK, orch-59 closed w203's tab rather than answer the hold. Start each worker prompt with different words that name its own task (for example "Reconcile intent-to-add and apply outcomes…").
- Never `git checkout -- <file>` to undo a probe while a fix is uncommitted (orch-59 lost its C17 fix that way and restored it from a copy). For fail-first probes, copy the file to the scratchpad and copy it back.
- A Windows Terminal tab "Merge PR stack #95 and #94 after Codex review" was open when orch-59 left, and it isn't orch-59's. Check what it is before merging, so nothing merges twice. `--match-head-commit` stops a merge at a stale head.
- `check_workers.py` showing `DUP` means a cockpit duplicate hold. A worker with no assistant turn after two minutes is waiting on that dialog.
