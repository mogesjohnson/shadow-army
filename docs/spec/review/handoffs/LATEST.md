# Handoff: orchestrator 51 (`300d1f3f`) to orchestrator 52 (2026-11-26 ~05:20 UTC)

Self-contained: do not read older handoffs. Range `29de50a` (orch-50's handoff) to this commit. orch-51 handed off early (startup reads cost 140k). The 5-hour figure reset at 05:00 UTC: 21% at 05:11 with three Opus workers (it climbs about 2% a minute). Start no worker at 80% or more.

## Running workers (report to the newest orch; check with `check_workers.py <your id prefix>`)

| Worker | Session | Task | Files | Codex file |
|---|---|---|---|---|
| w159-fix144-c1c6 | `ea73c2a3` | #144 C1 [P0], C6 [P1]: back to PO-19's packaged launcher, precompiled at `npm run build`, no runtime compile | `src/v2/contain/windows.ts` + test, `scripts/build-windows-launcher.mjs`, `package.json` | 68 |
| w160-fix132-c1c5 | `eecee9fd` | #132 C1 [P0], C5, C10, C11 [P1], C12 [P2], the sweep | `src/v2/contain/sweep.ts` + test, `src/v2/sweepMain.ts`, `native/linux/sa-contain.c` | 69 |
| w161-fix136-c1-finish | new | #136 C1 [P0] finish: w158's `## Left` (tests, the worktree left after a hold, self-review, reply, body) | `postOffice.ts`, `apply.ts`, `src/v2/git/hold.ts`, `harness.ts` + tests | 67 |

Briefs: `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tasks/<name>.md`. w159 was at 135k at 05:10: expect its 150k stop and a `## Left` soon; give the rest to a fresh worker the same way (w161's brief is the pattern). Next worker number: w162. **Next Codex file: 70.**

## Done this session (verified on the remote)

- #107: w157 merged `claude/63-m1b` (`22fd08d`) into `claude/63-m1b-lease`, head `83e99d9` (one import conflict, no follow-up commit; Windows checks pass; Linux skipped slice/modRelay). Codex file 66. **Merge #107 into `claude/63-m1b` as soon as Codex approves `83e99d9`** (no PR is stacked on it).
- #136: w158 pushed `35fe77a` (hold checked before and after each harness git command) and `ed47e43` (apply the audited commit by id through held harness git); tests unfinished (w161).
- Flatten plan written: `.shadow/v2-tools/tasks/orch-51-flatten.md` (42 main-lane PRs -> about 14). Waits for the owner (below).
- orch-50's tab was already gone at start.

## Queue (main lane; one lane until M1 is merged)

1. Answer Codex on files 65 to 69 as they land; merge on approval (bottom-up, merge script in its own tab, RUNBOOK 0.2).
2. When w159, w160, w161 finish: next fixes by Codex's latest review, P0s first. Unfixed at head since review 14/15 (2026-11-25): #90, #92, #93, #99, #101 (M1a), #106, #109, #110, #111, #113, #115, #116, #121, #124, #126, #130, #133, #137, #139, #141, #142, #143. Fixes pushed and waiting for re-review: #95, #94, #96. Pick ones whose files no live worker holds. Brief template: `tasks/w160-fix132-c1c5.md`.
3. Folds from the flatten plan, once the owner says yes.

## Waiting on the owner

1. Flatten plan: may child PRs be closed (GitHub marks them merged) when their branches fold into the parent? Plan file above.
2. #138 C6 (P0): change the profile ACL that grants Modify to `CodexSandboxUsers`, or change the check?
3. Spec Q11 (viewer credential and port), before M7.
4. Remove the unused worktree `AIConnections-worktrees/ui-v21-monarch`?

## Owner's instructions in force

- Speed-up five ("yes do all five", 2026-11-26): flat PRs with `Overrides: V6, "yes do all five", 2026-11-26`; self-review before push; one lane (Ink #145 to #151 wait, merge if approved); Sonnet for most fixes, Opus for concurrency, process termination, security stores; merge on approval, unasked, at Codex's exact head (`gh pr ready`, `gh pr merge <n> --merge --match-head-commit <sha>`). Branch deletion needs the owner.
- A Codex file for every pushed fix or new PR in `C:/Users/johns/codex-reviews/shadow-army/`. Last Codex tick `2026-11-26T05:10:32Z`.
- Timers: hi 50 min, watch 5 min. No new worker below 1.5 GB free RAM; at most three.

## Lessons

- An orchestrator's startup costs about 120k here (prompt, briefs, PR map). Read nothing the next step does not need: `verdicts.py`-style one-liners, `cut -c1-200`, no full PR lists.
- Opus fix workers reach 150k in about 10 minutes of work; write briefs so they push early, and plan a finisher worker per P0.
- Repository Actions is disabled: `Validation:` says CI `blocked`, macOS `not_run`.
