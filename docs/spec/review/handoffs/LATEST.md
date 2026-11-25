# Handoff: orchestrator 34 (`1f7d8169`) to orchestrator 35 (2026-11-25)

Range: `d0c2180` (orch-33's handoff) to this commit. orch-33's handoff (`git show d0c2180:docs/spec/review/handoffs/LATEST.md`) still holds where not done below, especially its Next 3 to 7 and "For the owner". orch-34 started at 69k and handed off at about 160k.

**Owner, 2026-11-25:** check Codex's reviews at every 5-minute watch tick (comments on #63 and new PR reviews). Last tick: 02:07 UTC, nothing new after review 11's summary (01:52).

**Lessons:**
- **The three-worker cap counts every live worker.** orch-33's Next 2 ("launch w92 and w94 together") would have made four with w81 and w88 running. orch-34 launched w94, saw four, and closed it within a minute (its worktrees were clean), then relaunched it when w81 reported.
- **Never `git pull` another branch into the review worktree.** A typo (`pull --rebase=merges origin claude/63-m1b-sweep`) started a 300-step rebase. `git rebase --abort` restored `d0c2180`; nothing was pushed.
- Briefs now name the orchestrator as `orch-34`. Update the report line in queued briefs (`sed -i 's/orch-34/orch-35/'`), and SendMessage the running workers the new name.

**Done** (each report checked with `git show --stat` at the PR's head, tab closed):
- orch-33's tab closed.
- **w87-fix111-postoffice:** #111 at `bd988f8` (C3, C5, C6 as a CH-1 build note), #124 at `809ae51` (C1, C4; merges #111).
- **w81-fix115:** #115 at `9f49f90` (C1 to C4; 606 lines, size exception in the body).
- **w88-fix129-132:** #129 at `fd0c915` (C1 to C4, merges #125 `ba0816f`); #132 at `bbcccf4` (C1 to C7 fixed or answered; WSL run and body left, see w95).
- **Decision, #132 C2 [P0] (identity-bound kill):** Windows ends through a held process handle. Linux has no race-free kill from Node, so its `endIdentity` declines (no signal, "left running" warning) until a pidfd helper exists. Can be undone; queued as w95.

**Running** (three live):
- **w92-fix136-137** (`92bd8191`, Opus medium): #136, #137; `postOffice.ts`, `postOffice.test.ts`, `client.test.ts`. Was at 142k at 02:07: expect a `## Left`.
- **w94-fix135-138** (`19f1506d`, Opus medium): #135, #138; `channel.ts`, `claude.ts`, `contain/windows.ts` and tests.
- **w95-fix132-linux-end** (launched 02:09, Opus medium): brief `w95-fix132-linux-end.md`. #132: adds `sa-contain end <pid> <starttime> [group]` to `native/linux/sa-contain.c`, wires `systemOps("linux").endIdentity` in `sweep.ts`, and finishes w88's `## Left` (WSL run, body).

## Next

1. Close each worker when it reports (check the head first). If w92 stops with a `## Left`, brief the rest as its own task on the same files.
2. After w92 pushes and its tab is closed: `w93-fix133` (`postOffice.ts`).
3. After w92, w93 and w94: orch-33's Next 3 (the PO-14 gate, #127 C2). #127 must not merge before it.
4. Other launches, at most three live, no shared files: w80-fix114 (Sonnet high), w82-fix119 (Sonnet medium), w83-fix117 (Sonnet medium), w89-fix128, then w90-fix131, then w91-fix134 (`register.ts`, one at a time). Check each brief's files against the live workers' before launching.
5. orch-33's Next 5 to 7 (Codex review 12, each tick's review check, Codex batch 14, orch-32's Next 6).
6. Neither `STATE.md` was updated by orch-34: bring both up to date at the next milestone.
