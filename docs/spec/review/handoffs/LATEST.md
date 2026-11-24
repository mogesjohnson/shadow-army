# Handoff: orchestrator 22 (`4f815f96`) to orchestrator 23 (2026-11-24)

Range on this branch: `fa48dd0..` this commit (this file and `STATE.md`). orch-21's handoff is `git show fa48dd0:docs/spec/review/handoffs/LATEST.md`; its For the owner still holds. orch-22 started at 17:26 UTC at 70k and handed off at about 18:05 at about 165k (the owner closed its tab once by accident; it resumed). Working notes: `.shadow/v2-tools/tasks/orch-22-notes.md` in the main checkout.

**Done.**
- Closed the tabs of orch-21 and w55. Pointed the w57 and w58 briefs' report line at orch-22 (a later orch should re-point them to itself: line 3).
- **w55** stopped at 160k: `1cce5cb` on `claude/63-m1b-po-chain2b` (postOffice.ts and its two test files), pushed, **no PR**. 3 restart tests in `postOffice.test.ts` time out: a restart's fresh snapshot takes about 7.5 s on Windows, past `until`'s 6 s. Its brief's second `## Left` has the rest.
- **Codex review 1 of 12 is back:** #95 (M1a transport) changes requested at `2ab8925`: C1 to C4 are P1 (`client.ts`/`server.ts`, `claude.ts` twice, `processTree.ts`), C5 to C9 P2 (C7 and C8 in `postOffice.ts`, C9 the PR body). GitHub refused a formal change request from the author's account, so it is review 6044525743. The other 11 batches: none back at 18:05.

**Running.**
- **w59-fix95** (`852aa176`, Opus medium, brief `w59-fix95.md`): fixes C1 to C4, C5 and C6 if small, and C9's PR body on `claude/63-m1a-transport` in worktree `m1a-transport`. C7 and C8 stay build notes (post office chain owns `postOffice.ts`). It was at 148k at 18:03, so expect a `## Left` in its brief and a fresh worker for the rest.
- **w60-po-chain2b-finish** (`78de4bc6`, Sonnet medium, brief `w60-po-chain2b-finish.md`): fixes the 3 restart-test waits, runs Windows and WSL, opens the draft PR into `claude/63-m1b-po-chain2`, worktree `w55-po-chain2b`.

## Next

1. Close orch-22's tab once the cockpit marks it parked. Re-point line 3 of the w57, w58 (and any open) briefs to orch-23.
2. When w59 reports: `git show --stat`, close its tab; if a `## Left` remains, launch a fresh fix worker on it (same files only).
3. When w60 reports: check, close its tab, then **launch w57-guardian** (brief ready, Sonnet high), telling it w60's PR is open. After w57: **w58-po-trust** (brief ready, Opus medium). All serial on `postOffice.ts`.
4. **Watch Codex's results** on each 5-minute tick: `codex-reviews/*.md` `## Result` sections (main checkout, untracked). For each batch with changes requested, brief a fix worker on that PR's branch, keeping to files no live worker holds. P0/P1 must be fixed; P2s may be build notes. Codex also comments `Codex review <k> of 12` on #63.
5. Write `codex-reviews/11-24-2026-codex-review-13.md` (same shape as batch 12) once w60's, w57's and w58's PRs are open, and add it to that folder's README.
6. Memory: at most two workers and one full vitest at a time (about 4 GB free at 17:50; Codex sessions also run vitest).

## For the owner

- Codex's review queue: batches 2 to 12 not back yet. Batch 1 (#95) is being fixed by w59.
- orch-21's For the owner still holds (M1a's live run M1-AC29 waits for you).
