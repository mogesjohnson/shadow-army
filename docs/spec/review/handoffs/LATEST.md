# Handoff: orchestrator 54 (`bab83f0f`) to orchestrator 55 (2026-11-26 ~12:05 UTC)

Self-contained: do not read older handoffs. Range `fd53f7d` (orch-53's handoff) to this commit. The 5-hour window reset at 10:00 and was at 75% at 12:00: **start no worker at 80% or more** (at that point only finish, tick and merge). RAM 3.4 GB free at 12:00; no new worker below 1.5 GB.

## Running workers (report to orch-55)

- **w178-fix139-c2c3** (Opus medium, session `7db3ea61`): #139 C2 postOffice half (failed list = incomplete, re-list per poll), C3 (services from adapter config, matched by identity), C5 (`it.todo`). Files: `src/v2/postOffice.ts`, its test. Brief `.shadow/v2-tools/tasks/w178-fix139-c2c3.md`. Was told to report as orch-54; it may SendMessage orch-54: if it is silent, check its tab.
- **w180-fix139-c2-driver** (Opus medium): #139 C2 driver wiring: `list()` in `src/v2/claude.ts`, Windows job listing in `src/v2/contain/windows.ts`, Linux driver into `containmentTable` (`src/v2/contain/index.ts`), their tests. Brief `w180-fix139-c2-driver.md`; reports to the orchestrator named here.
- Both push to `claude/63-m1b-po-chain2`. Next worker: **w181**. **Next Codex file: 86** (check the folder; workers write them).

Workers may open in the second Terminal window (id 66972): list windows with TRACE (`processName: WindowsTerminal`) before closing tabs.

## Fixes pushed this session (waiting for Codex at these heads)

- #137 `1425660` (w172 to w174): C1 [P0] both halves (FILETIME ticks, Linux fail closed, record trust), C5, C6 live, 2 self-review P1s. Linux full file passes. C4, C7, C9, C6 recovery = build notes (Codex had them P1). File 81.
- #116 `7c7befe` (w175): merged `claude/63-m1b` (now MERGEABLE), C10, one `log_failed` per failure. File 82.
- #101 `f710f35` (w176): C3, C4. File 83.
- #139 `01a4106` (w177, w179): C1 [P0] (file 84), C4 nonblocking event transport via helper process (file 85). C2, C3, C5 in progress.
- Still waiting from orch-53/52: #110 `a678eb0`, #106 `6348339`, #136 `e101e26`, #121 `5f47b04`, #144, #132, #115, #113, #109, #111, #107.
- No Codex review arrived 10:03 to 12:00 UTC. Last tick `2026-11-26T11:07:42Z` (later ticks were skipped, see below).

## Queue (one lane; `postOffice.ts` tasks one at a time)

1. Codex ticks; merge on approval, bottom-up, merge script in its own tab (RUNBOOK 0.2).
2. After w178: **#141** (C1 P0 `postOffice.ts:625`, C2 to C4 P1, C5/C6 P2), then **#142** (C1 P0 `:363`, C2 to C4 P1, C5 P2), then **#143** (C1 to C5 P0, C6/C7 P1, C8 P2 `server.test.ts`). Read findings with `gh pr view <n> --json reviews -q '.reviews|last|.body' | grep -E '^- C[0-9]+'`. One P0 per Opus worker. Or `tools/p0scan.sh <PR numbers>` (it needs the numbers; with none it prints nothing).

## Waiting on the owner

1. **Timers:** Claude Code reaped orch-54's hi and watch timers for low memory at ~11:12 and said not to restart them unasked. orch-54 asked the owner; no answer yet. Start yours as RUNBOOK 0.1 says (that is the owner's standing rule) unless reaped again.
2. **CodexSandboxUsers ACL** (#138 C6 and #137's new trust check): the group has Modify on `%TEMP%` and `C:\Users\johns\projects`, so startup recovery refuses whenever a trees record exists (fails closed). Remove the grant, or accept the group?
3. #139 C4 (w179): a paused close now ends by containment's 10 s force. Acceptable?
4. Flatten plan (`orch-51-flatten.md`); spec Q11 (viewer credential and port); remove worktrees `ui-v21-monarch`, `w174-fix137` (unused) and the cockpit's `w174-fix137-finish-*`.

## Owner's instructions in force

- Speed-up five ("yes do all five", 2026-11-26), merge on approval at Codex's exact head (`gh pr ready`, `gh pr merge <n> --merge --match-head-commit <sha>`). Branch deletion needs the owner. A Codex file for every pushed fix. Timers: hi 50 min, watch 5 min.

## Lessons

- Two workers on one branch in disjoint files works (w177/w179, w178/w180) with `pull --rebase=merges` before push; check test files too when splitting (C5 sat in the other worker's test file).
- The cockpit gives workers their own worktree; briefs should say "or the cockpit's; never both" to avoid leftovers.
- Sonnet medium handled finish-up work (Linux runs, self-review, replies) at low cost; Opus for P0s.
