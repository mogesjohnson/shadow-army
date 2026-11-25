# Handoff: orchestrator 39 (`ea21e675`) to orchestrator 40 (2026-11-25)

Self-contained: do not read older handoffs. Range `c4d4773` to this commit.

## Owner's instructions in force

- **No workers are running.** On 2026-11-25 at about 05:35 UTC the owner told orch-39 to make no new sessions and to hand off once w104 and w106 finished. orch-40 starts only when the owner launches it. **Ask the owner before launching any worker.**
- **The 5-hour limit: 80% at most.** Stop all new work at 80% on the cockpit line (49% at 05:47 UTC).
- At every 5-minute tick, check Codex's reviews: `bash C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tools/codex_tick.sh <last tick ISO>`. Last tick: 05:46 UTC.
- Keep LATEST.md under 5 KB, and both STATE.md files short.

## Owner's call, open: #136 is still red on Windows

w104 cut a read-only turn's harness git calls from 34 to 28 (`7d225bc`, #136's head), but Windows still times out. Files run alone at `7d225bc`: postOffice 11/32 failed, fixes 5/8, client 2/5, apply 1/7, server 1/11. The server failure (interrupted instead of failed) also happens at `4ef57e4`, so it is older than the cut. Under load a call costs about 440 to 640 ms. WSL passes (postOffice 22 passed), and tsc and the build pass. The two remaining options are **a longer test timeout** or **a faster managed spawn in `processTree.ts`**. Ask the owner which one; do not decide it yourself. The evidence is in #136's body and its evidence comment.

## Done by orch-39 (checked with `git show --stat` against each PR's head, tabs closed)

- **w106:** #138 at `20cc929` (with `1f401b1`): C1 fixed, exact FILETIME through listing, records and sweep. Old millisecond records only prove a difference and never end a process. Passes on Windows and in WSL; replied in-thread. **Build note:** `postOffice.ts` still writes its own process-tree line without `creationTime` (judged by ms, the safe side). Give it to the next `postOffice.ts` worker.
- **w104:** #136 at `7d225bc`, see above.
- orch-38's tab is closed.

## Queues (one worker per file at a time; three workers at most; each needs the owner's go first)

1. **`postOffice.ts`:** first the owner's #136 call above. Then `w105-fix119-office` (#119 C1 to C3; also `delegate.ts` and `roster.ts`; Sonnet high; brief written). Then w98, w102 and w103 for #137 (briefs written; Opus medium; w98 first merges #136's fixed head). Then `w93-fix133`. Then #139, #141, #142 and #143 (review 12): write their briefs from each PR's last review with `gh api repos/mogesjohnson/shadow-army/pulls/<n>/reviews --jq '.[-1].body'`. Then the PO-14 gate (#127 C2; #127 must not merge before it).
2. **`sweep.ts`/`contain`:** free now that w106 is done. #142 can run here.
3. Briefs still name orch-38 as the one to report to: edit the name before launching a worker.
4. When Codex approves a PR at its exact head, merge per RUNBOOK 0.2 (V13, V14).

## Codex

Reviews 13 to 15 (`codex-reviews/` in the main checkout) are written and wait for the owner to give them to Codex. #138 and #136 have new heads (`20cc929`, `7d225bc`) for re-review. No new Codex review came between 05:22 and 05:46 UTC.

## Build notes, still open

- The #143+#131 integration: C1's dispatcher test and C5's `/army` card.
- #134: the sweep spawn switches to #128's `runtime.node` at integration, and C6 (a real-process sweep test) is a build note.

## Lessons

- Launch with the `wt.exe` line in RUNBOOK 0.2.
- Pipe TRACE and `gh` output through `cut -c1-200 | head`. Reuse an open TRACE session: opening a second one fails with `desktop_busy`.
- A worker's `## Left` items that need other files become a new brief in the queue of the file they need.
- The cockpit's duplicate-task stop can flag a new orchestrator against the parked previous one. Confirm with the owner, then go on.
