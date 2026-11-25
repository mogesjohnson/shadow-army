# Handoff: orchestrator 38 (`a1eb4681`) to orchestrator 39 (2026-11-25)

Self-contained: do not read older handoffs. Range `1d612c9` to this commit.

## Owner's instructions in force

- The owner put a HOLD on new workers at 03:40 UTC and lifted it at 05:20 UTC. Normal queue running applies: at most three workers.
- **The 5-hour limit: 80% at most.** Stop all new work at 80% on the cockpit line.
- At every 5-minute tick, check Codex's reviews: `bash C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tools/codex_tick.sh <last tick ISO>`. Last tick: 05:22 UTC.
- Keep LATEST.md under 5 KB, and both STATE.md files short.

## Running workers (they report to orch-38; SendMessage them your name)

| Worker | Session | PR | Files |
|---|---|---|---|
| w104-fix136-wincalls (Opus medium) | `90fa6ba9` | #136: Windows timeouts, cut harness git calls per turn | `src/v2/postOffice.ts`, `postOffice.test.ts` |
| w106-fix138-filetime (Opus medium) | `85066789` | #138 C1: exact FILETIME through listing and sweep | `contain/windows.ts`, `channel.ts`, `contain/trees.ts`, `contain/sweep.ts` and their tests |

At 05:30 w104 had WSL green and was waiting on its Windows runs. Per its brief, if any file is still over 30 s after the cut, it stops and reports the numbers. A longer test timeout or a faster managed spawn in `processTree.ts` is then **the owner's call**: ask the owner, do not decide it yourself.

## Done by orch-38 (checked with `git show --stat` against each PR's head, tabs closed)

- **w90:** #131 at `6045a15`. Still open are build notes for the #143+#131 integration: C1's dispatcher test and C5's `/army` card.
- **w100:** #136 at `4ef57e4`, C1 to C6 replied. It left #136 red on Windows, which w104 is fixing.
- **w82:** #119 at `785f86f`: C4 fixed and `claude/63-m1b` merged in. C1 to C3 need `postOffice.ts` and `delegate.ts`, so they are in the brief `w105-fix119-office`.
- **w91:** #134 at `abf5926`: C3 to C5 fixed. C1 was answered as #128's `runtime.node` (the sweep spawn must switch to it at integration), C2 as #132, and C6's real-process sweep test is a build note.
- **w83:** #117 at `e5fd1ca`: C1 to C6 fixed, 19 tests pass on Windows and in WSL.
- orch-37's tab is closed, and the briefs name orch-38.

## Queues (one worker per file at a time; three workers at most)

1. **`postOffice.ts`:** after w104, run `w105-fix119-office` (#119 C1 to C3; also `delegate.ts` and `roster.ts`; Sonnet high; brief written). Then w98, w102 and w103 for #137 (briefs written; Opus medium; w98 first merges #136's fixed head). Then `w93-fix133`. Then #139, #141, #142 and #143 (review 12): write their briefs from each PR's last review with `gh api repos/mogesjohnson/shadow-army/pulls/<n>/reviews --jq '.[-1].body'`. Then the PO-14 gate (#127 C2; #127 must not merge before it).
2. **`sweep.ts`/`contain`:** w106 is running. #142 runs after it.
3. **Free slot now:** nothing else is free of the running workers' files. Fill the third slot from queue 1 once w104 finishes.
4. When Codex approves a PR at its exact head, merge per RUNBOOK 0.2 (V13, V14).

## Codex

Reviews 13 to 15 (`codex-reviews/` in the main checkout) are written and wait for the owner to give them to Codex. orch-38 has told the owner.

## Lessons

- Launch with the `wt.exe` line in RUNBOOK 0.2.
- Pipe TRACE and `gh` output through `cut -c1-200 | head`. Reuse an open TRACE session: opening a second one fails with `desktop_busy`.
- A worker's `## Left` items that need other files become a new brief in the queue of the file they need. w105 and w106 were made this way.
