# Handoff: orchestrator 23 (`5fbdf366`) to orchestrator 24 (2026-11-24)

Range on this branch: `8ee9028..` this commit (this file only; orch-23 did not update either `STATE.md`: do that first). orch-22's handoff is `git show 8ee9028:docs/spec/review/handoffs/LATEST.md`; orch-21's For the owner still holds. orch-23 ran 18:08 to 19:35 UTC, at 70k to about 170k; it waited about an hour with the 5-hour figure at 83 to 88%. Working notes: `.shadow/v2-tools/tasks/orch-23-notes.md` in the main checkout.

**Done.**
- Closed the tabs of orch-22, w59 and w60. Re-pointed the w57 and w58 briefs' line 3 to orch-23 (re-point them, and w61 to w63, to yourself).
- **w59** (#95, M1a transport): C1 to C6 fixed with failing-first tests, pushed at `10384ef` (`942ba88`, `45ef7f4`, `08fcd30`, `10384ef`). Its brief's `## Left` (Linux run, full npm test, C9 body, C1 to C9 reply) is brief `w62-fix95-finish.md`, not launched.
- **w60**: draft **#141** (`claude/63-m1b-po-chain2b` into `claude/63-m1b-po-chain2`) at `201d0d5`. Restart tests wait 60 s; both files pass alone on Windows and WSL; full npm test `not_run`.
- **Codex batch 2** is on GitHub (the `codex-reviews/` files still say "not started"; check the PRs): #91 changes requested (P1 C1 to C3 in `register.ts`, P2 C4 body, C5 AC comment); #90 changes requested (P1 C1 to C3 in `postOffice.ts`); #89 approved at `fab6f82` with two P2 text findings (in w62's brief).

**Running** (launched 19:32 UTC with the 5-hour figure at 0%; it next resets at 19:30 local, 00:30 UTC).
- **w61-fix91** (`038bb70a`, Sonnet high, brief `w61-fix91.md`): #91's P1s and text, `register.ts`/`register.test.ts`, new worktree `m1a-mod-core`.
- **w63-fix90** (Opus medium, brief `w63-fix90.md`): #90's P1s, `postOffice.ts` and its tests on `claude/63-m1a-write`, worktree `m1a-write`. Its tab was still starting at 19:33: check `check_workers.py` that it named itself; if it did not start, relaunch it.

## Next

1. Close orch-23's tab once the cockpit marks it parked. Update both `STATE.md` files with the above.
2. When w61 or w63 reports: `git show --stat`, close its tab. Then launch **w62-fix95-finish** (Sonnet medium, PR text and runs only; brief ready).
3. After w63 has pushed and its tab is closed: **w57-guardian** (Sonnet high), then **w58-po-trust** (Opus medium). All serial on `postOffice.ts`. Tell w57 that #141 is open and that w63 changed `postOffice.ts` on `claude/63-m1a-write` (the chain is stacked on it; merging that fix up the chain is a later step, at merge time).
4. Watch Codex on each 5-minute tick: the PRs' latest reviews (`gh pr view <n> --json reviews`) and `Codex review <k> of 12` comments on #63, not only the files. Brief a fix worker per batch with changes requested, on files no live worker holds.
5. Write `codex-reviews/11-24-2026-codex-review-13.md` (same shape as batch 12; #141, w57's and w58's PRs, and the new fix heads) once w57's and w58's PRs are open, and add it to that folder's README.
6. Memory: at most two workers and one full vitest at a time. Screenshots are costly: each scaled launch check took about 5k of orch context.

## For the owner

- Codex batches 3 to 12 not back yet. Batch 2's fixes are running (w61, w63).
- orch-21's For the owner still holds (M1a's live run M1-AC29 waits for you).
