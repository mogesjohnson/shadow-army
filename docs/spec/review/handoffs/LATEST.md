# Handoff: orchestrator 33 (`0012a9c0`) to orchestrator 34 (2026-11-25)

Range: `7410d14` (orch-32's handoff) to this commit. orch-32's handoff (`git show 7410d14:docs/spec/review/handoffs/LATEST.md`) still holds where not done below. orch-33 started at 77k and handed off at about 150k after 3 launches and 3 closes. A launch costs about 8k: invoke `NewTabButton`, then observe `elm-dbd5` (the terminal's `Custom`, same id in every tab) at depth 2, type, one scaled screenshot, `Enter`.

**Owner, 2026-11-25:** check Codex's reviews at every 5-minute watch tick (comments on #63 and new PR reviews, see Next 6). Last tick: 01:58 UTC, nothing new after review 11's summary (01:52).

**Done** (each report checked with `git show --stat` at the PR's head, tab closed):
- orch-32's tab closed.
- **w85-fix125-127:** #125 at `ba0816f` (`linux.ts`, `linux.test.ts`, review 9 C1 to C8), #127 at `db1c9c9` (`contain/index.ts`, `index.test.ts`, `windowsOnly.testutil.ts`, `vitest.config.ts`; merges #125). #127 C2 [P1] (no PO-14 gate on Linux start and reconnect) is decided in a #127 comment: keep the Linux entries, add the gate as its own task (Next 3). #127 must not merge before it.
- **w79-fix113:** #113 at `e1570d9` (`lock.ts`, `lock.test.ts`), review 6 C1 to C3.
- Codex review 11 (`codex-reviews/11-24-2026-codex-review-11.md`, #63 comment 01:52): changes requested on #133, #135, #136, #137, #138. Briefs written: `w92-fix136-137`, `w94-fix135-138`, `w93-fix133` (all Opus medium).

**Running:**
- **w87-fix111-postoffice** (`6df24004`): `postOffice.ts`, `channel.ts`, `claude.ts` and tests. Was at 133k at 01:58: expect a `## Left`.
- **w81-fix115** (`50105fbe`, launched 01:52): `trust.ts`, `trust.test.ts`.
- **w88-fix129-132** (launched 01:54): `contain/trees.ts`, `sweep.ts`, `sweepMain.ts` and tests.

## Next

1. Close each worker when it reports (check the head first).
2. After w87 pushes: launch `w92-fix136-137` and `w94-fix135-138` together (separate files), then `w93-fix133` after w92 (`postOffice.ts`).
3. Then brief the PO-14 gate (#127 C2): `claude.ts` and/or `postOffice.ts` run #123's verified check before the Linux driver starts or reconnects a channel; branch on a base that merges #123 and #127. Opus medium. After w92, w93 and w94.
4. Other launches, at most three live, no shared files: w80-fix114 (Sonnet high), w82-fix119 (Sonnet medium), w83-fix117 (Sonnet medium), w89-fix128, then w90-fix131, then w91-fix134 (`register.ts`: one at a time).
5. Codex review 12 is still to land; brief it when its summary is on #63.
6. Each 5-minute tick: `check_workers.py`, then `gh api 'repos/mogesjohnson/shadow-army/issues/63/comments?since=<last>'` and the open PRs' reviews since the last tick (one GraphQL query over `pullRequests(states:OPEN)`). Merge only what Codex approves at the exact head (V13, V14 retarget first).
7. When reviews 6 to 12 are fixed, write Codex batch 14 in `codex-reviews/` for the new heads. Then orch-32's Next 6 (#111 C6, S-8, the #90 WSL worker, the C4 driver operation, the `starter` line).

## For the owner

orch-31's three items still stand (Codex batch 13 start line, #126 C7 history rewrite, deleting merged branches and stale worktrees).
