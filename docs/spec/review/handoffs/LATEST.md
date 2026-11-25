# Handoff: orchestrator 41 (`7d53aaff`) to orchestrator 42 (2026-11-25)

Self-contained: do not read older handoffs. Range `25e7677` to this commit.

## Owner's instructions in force

- **No new worker sessions** (the owner, 2026-11-25 ~16:25 UTC: "stop making new sessions after them"). Only w110 and w111 below may run. When they report: verify, close their tabs, write the Codex file. Launch nothing else until the owner says so; the queues below wait.
- **A Codex file for everything new** (2026-11-25): after verifying a report, add the PR to the next `codex-reviews/11-25-2026-codex-review-<n>.md` in the main checkout (copy review 17's layout) and tell the owner it is ready.
- Every tick: `codex_tick.sh <last ISO>` AND each review file's `## Result`. Codex verdicts start "Codex review <n>:".
- **Memory is low.** Claude Code killed orch-41's hi and watch timers (and w110's) for low memory around 16:00. Its note says: restart them only when the owner asks. Ask the owner at start; workers' reports arrive as messages anyway.

## Running workers (report to orch-41: tell them your name)

- **w110-fix138-sweep** (`785433b7`): #138 review 15 C6 to C8, worktree `w54-claude-list`, `contain/sweep.ts`, `windows.ts` + tests. C6 built and passing, uncommitted when a false cockpit hold stopped it (Codex's write to review 16 at 15:28 was credited to it); the owner released it ~16:25. C7, C8 not started.
- **w111-fix128-paths** (`82035940`): #128 review 15 C1 [P0] (canonical exclusion paths), worktree `w43-mod-preflight`, `plugins/shadow-army/hooks/register.ts` + test. Same false hold, released ~16:25; had barely started.

## Done by orch-41 (verified, tabs closed)

- #137 at `8d819d2`: w102 C5 to C7 (`dff7192`, `fb08174`, `a8a8f79`, after merging #136 at `a908b45`); w103 C1, C4 (`48c9973`); w112 checks, replies (issuecomment-7167851286), body, fix `8d819d2`. All of review 11 answered. Windows full postOffice file: 39 pass, 11 known synthetic-native 30 s spawn timeouts.
- **Review 17** (#137 at `8d819d2`) written, waiting for the owner to hand to Codex. Review 16 is done (below).

## Codex results not yet briefed

- **Review 16:** #119 `64fa048` changes requested (C2, C5: P1 1, P2 1); #144 `db2a90e` changes requested (C1 to C5: P0 1, P1 2, P2 2). #144 touches `windows.ts`: only after w110.
- **Review 15** (still open): #123 C2, C4, C8, C9 · #125 C9, C10 · #127 C2 (PO-14 gate) · #129 C5 · #132 C1, C2, C5, C8, C9 (2 P0) · #128 C5 (C1 is w111) · #135 C5 · #138 (w110) · #140 C8 · #136 C1, C2, C9 (P0), C7, C8.
- Read each with `gh api repos/mogesjohnson/shadow-army/pulls/<n>/reviews --jq '.[-1].body'`.

## Queues (when the owner allows workers again; one worker per file)

1. **`postOffice.ts`:** #136 review 15 (C1, C2, C7 to C9; also `snapshot.ts`); `w93-fix133`; #139, #141 to #143 from their last reviews; the PO-14 gate.
2. **`contain/*`:** after w110: #144 merges #138's new head and fixes review 16 C1 to C5; #132, #129, #125, #135.
3. Others: #119 review 16, #123 (`contain/check.ts`), #128 C5 after w111 (Opus medium: process lifecycle), #140.
4. **#137 and #144 clash:** a scratch merge fails tsc in `postOffice.ts` (tree identity, channel list), also before review 11's fixes. Whoever merges #138 into #144 or works #137 next must resolve it.
5. Merge only with Codex's approval at the exact head (V13, V14).

## Lessons

- The cockpit credits Codex's writes to `codex-reviews/` (in the main checkout) to whichever sessions are running, and holds them. Consider asking the owner to move `codex-reviews/` out of the shared checkout.
- `git pull --rebase=merges origin <other branch>` in the review worktree rebases the review branch onto it (orch-41 did it by mistake and aborted): pull only `claude/63-ultimate-spec-review` there.
- Workers start near 95k and reach 150k fast: one finding group per brief; a finisher worker picks up `## Left`.
