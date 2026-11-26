# Handoff: orchestrator 52 (`b8b684ea`) to orchestrator 53 (2026-11-26 ~05:40 UTC)

Self-contained: do not read older handoffs. Range `6a49cf8` (orch-51's handoff) to this commit. The 5-hour figure was 59% at 05:34 (window reset 05:00); start no worker at 80% or more. Free RAM was 1.5 GB at 05:34: no new worker below 1.5 GB, at most three.

## Running workers (report to the newest orch; check with `check_workers.py <your id prefix>`)

| Worker | Session | Task | Files | Codex file |
|---|---|---|---|---|
| w161-fix136-c1-finish | `db47b10d` | #136 C1 [P0] finish (tests, hold leftovers, self-review, reply, body) | `postOffice.ts`, `apply.ts`, `src/v2/git/hold.ts`, `harness.ts` + tests | 67 |
| w166-fix110-c5c6 | `67728a77` | #110 C5, C6 [P1]: full static ELF check, private temp artifact; merges #109's new head first | `scripts/build-native.mjs` + test | 74 |

Briefs: `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tasks/<name>.md`. Next worker: w167. **Next Codex file: 75.**

## Fixes pushed this session (verified on the remote; waiting for Codex)

- #144 `8c3fab9` (w159): C6 launcher precompiled at `npm run build`, C1 runtime cache removed. File 68.
- #132 `aacc654` (w160 code `494b7d8`, w162 tests): C1, C5, C10, C11, C12. File 69. **Known limitation, decided:** C1 reads records through `Add-Type -TypeDefinition` (runtime C# compile), the same defect as #144 review 29 (PO-13, PO-19). No spec change: once #144's and #132's stacks reach `claude/63-m1b`, a worker adds a records-read op to the packaged launcher (`scripts/build-windows-launcher.mjs`, from #144) and the sweep calls it. Codex may flag it again meanwhile; answer with this plan.
- #115 `3e03066` (w163): C5. File 70. #113 `da90ba6` (w163): C4. File 71.
- #109 `957dd9a` (w164): C8, C9. File 72. #111 `18dc8bd` (w165): C8, C9. File 73.
- #107: still waiting for Codex at `83e99d9` (file 66). Merge into `claude/63-m1b` as soon as approved.

## Queue (main lane; one lane until M1 is merged)

1. Codex ticks (last `2026-11-26T05:35:05Z`). Worker replies show in `codex_tick.sh` too; Codex's own reviews carry `[P0]`/`[P1]` findings or an approval. Merge on approval, bottom-up, merge script in its own tab (RUNBOOK 0.2).
2. **Every open P0 is in files w161 holds**, so they wait for its report: #106 C7 (`harness.ts:74`), #121 C9 (`hold.ts:347`), #137 C1, #139 C1, #141 C1, #142 C1 (+`contain/trees.ts`), #143 C1 to C5 (`postOffice.ts`, `trust.ts`). They share `postOffice.ts`: run them one at a time, bottom of stack first, Opus medium, with a finisher planned for each.
3. P1s also behind `postOffice.ts`: #90 C7 C8, #92 C6, #93 C7 (C6 is `server.ts`), #99 C7 C8, #116 C10. Free files now: #101 C3 (`src/workspace/apply*`), #116 C9 (`logs.ts`), and #124, #126, #130, #133 (not scanned yet).
4. Scan: `bash C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tools/p0scan.sh <PR numbers>` prints head, base, latest review and P0/P1 counts per PR. To read the findings: `gh api repos/mogesjohnson/shadow-army/pulls/<n>/reviews --jq '[.[] | select(.body | test("P[0-3]"))] | last | .body' | grep -E "P[01]"` (no backslashes in jq under Git Bash).
5. Folds from the flatten plan, once the owner says yes.

## Waiting on the owner (unchanged)

1. Flatten plan (`.shadow/v2-tools/tasks/orch-51-flatten.md`): may child PRs be closed when their branches fold into the parent?
2. #138 C6 (P0): change the profile ACL that grants Modify to `CodexSandboxUsers`, or change the check?
3. Spec Q11 (viewer credential and port), before M7.
4. Remove the unused worktree `AIConnections-worktrees/ui-v21-monarch`?

## Owner's instructions in force

- Speed-up five ("yes do all five", 2026-11-26): flat PRs with `Overrides: V6, "yes do all five", 2026-11-26`; self-review before push; one lane (Ink #145 to #151 wait); Sonnet for most fixes, Opus for concurrency, process termination, security stores; merge on approval, unasked, at Codex's exact head (`gh pr ready`, `gh pr merge <n> --merge --match-head-commit <sha>`). Branch deletion needs the owner.
- A Codex file for every pushed fix or new PR in `C:/Users/johns/codex-reviews/shadow-army/`.
- Timers: hi 50 min, watch 5 min.

## Lessons

- Reading only RUNBOOK section 0 and this file kept orch-52's startup to about 70k. Each launch or close costs about 5k.
- Opus fix workers spend 100k to 120k on startup reads alone. Name exact file:line and the fix in the brief, and keep one or two findings per worker.
- Repository Actions is disabled: `Validation:` says CI `blocked`, macOS `not_run`.
