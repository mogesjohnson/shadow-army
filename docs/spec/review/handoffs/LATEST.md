# Handoff: orchestrator 53 (`adaacfec`) to orchestrator 54 (2026-11-26 ~10:30 UTC)

Self-contained: do not read older handoffs. Range `dbe144f` (orch-52's handoff) to this commit. The 5-hour window reset at 10:00 (18% at 10:28); start no worker at 80% or more. Free RAM 5.7 GB at 10:28; no new worker below 1.5 GB, at most three.

## Running workers

None. orch-53 closed w166 to w171. Next worker: **w172**. **Next Codex file: 80.**

Workers launched by `wt.exe -w 0` may open in a second Terminal window: list windows with TRACE (`processName: WindowsTerminal`) before closing tabs.

## Fixes pushed this session (verified on the remote; waiting for Codex at these heads)

- #110 `a678eb0` (w166): C5, C6. File 74.
- #106 `6348339` (w167): C7 [P0], C8. File 75.
- #136 `8dc4b3e` (w168, self-review P1s in `apply.ts`, `hold.ts`) then `e101e26` (w169, `postOffice.ts:552` held apply no longer throws). Files 76, 77.
- #121 `5f47b04` (w170): C9 [P0], C10; #106 merged in at `1859e54`. File 78.
- #116 `86bfb98` (w171): C9, C11. File 79. **CONFLICTING** with `claude/63-m1b` in `postOffice.ts` and `postOffice.test.ts`.
- Still waiting from orch-52: #144 `8c3fab9`, #132 `aacc654`, #115 `3e03066`, #113 `da90ba6`, #109 `957dd9a`, #111 `18dc8bd`, #107 `83e99d9`.
- No Codex review arrived 05:40 to 10:03 UTC. Last tick `2026-11-26T10:03:08Z`.

## Queue (one lane; `postOffice.ts` tasks one at a time)

1. Codex ticks; merge on approval, bottom-up, merge script in its own tab (RUNBOOK 0.2).
2. **#137 C1 [P0]** (Opus medium): step-by-step plan under `## Left` in `.shadow/v2-tools/tasks/w169-fix137-c1.md` (Windows FILETIME ticks via `GetProcessTimes`; Linux fails closed, no signal; record trust; optional `trees` param on `sweepTrees` in `src/v2/contain/sweep.ts`; C5 and C6 live half). First `git merge origin/claude/63-m1b-po-chain1` into `claude/63-m1b-po-startup`. Files: `postOffice.ts`, its test, `contain/sweep.ts`.
3. **#116** after #137: merge `claude/63-m1b` (resolve `postOffice.ts` and its test), C10 (`postOffice.ts:123`, partial tool input), one `log_failed` line per failure (`logFailed()`, M1-AC4).
4. Then #139, #141, #142 (+`contain/trees.ts`), #143 (`trust.ts`), all in `postOffice.ts`; #101 C3 (`src/workspace/apply.ts`, free file, Sonnet medium). Scan with `tools/p0scan.sh`.
5. Known limitation (unchanged): #132 C1 uses runtime `Add-Type`; plan is a records-read op in the packaged launcher once #144 and #132 reach `claude/63-m1b`.

## Waiting on the owner (unchanged)

1. Flatten plan (`.shadow/v2-tools/tasks/orch-51-flatten.md`).
2. #138 C6 (P0): change the profile ACL that grants Modify to `CodexSandboxUsers`, or change the check?
3. Spec Q11 (viewer credential and port), before M7.
4. Remove the unused worktree `AIConnections-worktrees/ui-v21-monarch`?

## Owner's instructions in force

- Speed-up five ("yes do all five", 2026-11-26): flat PRs with `Overrides: V6, "yes do all five", 2026-11-26`; self-review before push; one lane; Sonnet for most fixes, Opus for concurrency, process termination, security stores; merge on approval at Codex's exact head (`gh pr ready`, `gh pr merge <n> --merge --match-head-commit <sha>`). Branch deletion needs the owner.
- A Codex file for every pushed fix or new PR.
- Timers: hi 50 min, watch 5 min.

## Lessons

- At 10:05, launching three workers at once made Claude Code reap orch-53's background timers for low memory (its note says: do not restart them unasked). Launch workers one at a time and check RAM between launches.
- Opus workers on `postOffice.ts` reach 140k on startup reads plus one fix; the full `postOffice.test.ts` run takes ~12 min on Windows with 30 s timeouts under load. Give one finding per Opus worker there, and point it at the WSL run.
- Sonnet high (w171) finished two P1s but overran to 193k: name the exact lines in the brief.
