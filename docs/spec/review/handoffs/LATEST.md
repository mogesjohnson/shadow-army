# Handoff: orchestrator 32 (`f634ab2c`, lists as `aiconnections-7e`) to orchestrator 33 (2026-11-25)

Range: `9791595` (orch-31's handoff) to this commit. orch-31's handoff (`git show 9791595:docs/spec/review/handoffs/LATEST.md`) still holds where not done below. orch-32 started at 65k and handed off at about 165k after 4 launches and 2 closes: a TRACE launch costs 5 to 15k (skip the depth-6 observation: the terminal's `Custom` element kept the id `elm-dbd5` across tabs, so observe it directly after `NewTabButton`).

**Owner, 2026-11-25:** check Codex's reviews at every 5-minute watch tick (comments on #63 and new PR reviews, see Next 5).

**Done** (each report checked with `git show --stat` at the PR's head, tab closed):
- orch-31's tab was already gone (its session had ended).
- **w84-fix123:** #123 at `648cd9e` (`check.ts`, `check.test.ts`), review 9 C1 to C7 fixed. Left from C4: a true no-grace tree kill needs a new driver operation in `src/v2/contain/windows.ts`, `linux.ts` and the macOS driver; `check.ts` has a `killTree` seam that defaults to `close()`. Brief it as its own task once #125, #127 and #135 are done (they own those files).
- **w86-fix126-starter:** #126 at `acbb886` (`client.ts`, `modRelay.ts` and tests), #130 merge at `81f080a`. C3 answered. Left: the mod (`plugins/shadow-army/hooks/register.ts:131`) does not send `starter`, so the relay's parent pid stands in; a one-line follow-up, after w89 to w91 (they own `register.ts`).
- Codex review 10 (comment on #63, 01:22 UTC): changes requested on #129, #132, #134, #128, #131. Briefs written: `w88-fix129-132` (Opus), `w89-fix128` (Sonnet high), `w90-fix131` (Opus), `w91-fix134` (Opus). w89, w90 and w91 share `register.ts`: one at a time.

**Running:**
- **w85-fix125-127** (`6d0cb99e`): #125 pushed at `b64b4d1` and checked; now on #127 (`contain/index.ts`, `index.test.ts`, `windowsOnly.testutil.ts`, `vitest.config.ts`). It was at 143k: expect a `## Left` in its brief and relaunch the rest.
- **w87-fix111-postoffice** (`6df24004`, launched 01:44 UTC): `postOffice.ts`, `channel.ts`, `claude.ts` and tests.

## Next

1. Close w85 and w87 when they report (check the heads first).
2. Launch, at most three live, no shared files: w79-fix113 (Opus), w81-fix115 (Opus), w80-fix114 (Sonnet high), w82-fix119 (Sonnet medium), w83-fix117 (Sonnet medium), w88-fix129-132 (Opus; after #125 it merges the new `linux-driver` base), w89-fix128, then w90-fix131, then w91-fix134. Check each brief's files against the running workers first.
3. Codex reviews 11 and 12 are in progress: reviews already posted (no summary yet) request changes on #133 (`main.ts`, `watch.ts`, `postOffice.ts` + tests; first item P1), #135 (`channel.ts`, `claude.ts`, `contain/windows.ts` + tests; P1) and #136 (`postOffice.ts`, `client.test.ts`, `postOffice.test.ts`; P0). Brief them once the summary lands; all three wait for w87 (`postOffice.ts`, `channel.ts`, `claude.ts`), and #136 shares `postOffice.ts` with #133: run in order.
4. When reviews 6 to 12 are fixed, write Codex batch 14 in `codex-reviews/` (batch 13's format) for the new heads.
5. Each 5-minute tick: `check_workers.py`, then `gh api 'repos/mogesjohnson/shadow-army/issues/63/comments?since=<last>'` and each open PR's `reviews` since the last tick. Merge only what Codex approves at the exact head (V13, V14 retarget first).
6. Then orch-31's Next 4 (#111 C6, S-8, the #90 WSL worker), the C4 driver operation and the `starter` line above.

## For the owner

orch-31's three items still stand (Codex batch 13 start line, #126 C7 history rewrite, deleting merged branches and stale worktrees).
