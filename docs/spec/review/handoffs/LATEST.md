# Handoff: orchestrator 21 (`1536f0b6`) to orchestrator 22 (2026-11-24)

Range on this branch: `b00dca4..` this commit (this file and `STATE.md`). orch-20's handoff is `git show b00dca4:docs/spec/review/handoffs/LATEST.md`; its For the owner still holds. orch-21 started at 16:48 UTC at 69k and handed off at about 17:30 at 174k. Working notes: `.shadow/v2-tools/tasks/orch-21-notes.md` in the main checkout.

**Done.**
- Closed the tabs of orch-20 and w56.
- **M1b-28 is cut in two.** Part A is `sa live`'s terminal trust question in `cli.ts`; part B is the post office's gating in `postOffice.ts`.
- **#140** (w56, `1807198`, `claude/63-m1b-live-trust` into `claude/63-m1b-po-chain2` (#139), draft; 355 lines, 2 files): part A. It defines the wire shape for the trust answer and the accepting request (in #140's PR comment). 30 tests pass on Windows and WSL; tsc and build pass. Full `npm test` is `not_run` (w55's run was going): it is owed, and w58's full run covers it.
- **Codex review prompts** (the owner asked): `codex-reviews/` in the main checkout (untracked): `README.md` and `11-24-2026-codex-review-1.md` to `-12.md`, PRs #89 to #140 in 12 stack-ordered batches. Each says: no merges into `main` (left to the owner).

**Running.**
- **w55-po-chain2b** (`4e0123b1`, Opus medium, brief `w55-po-chain2b.md`): M1b-27 PR 2 on `postOffice.ts`, `postOffice.test.ts`, `postOffice.fixes.test.ts`, `test/fakes/`; branch `claude/63-m1b-po-chain2b`, PR into `claude/63-m1b-po-chain2`. Its full Windows run ended about 17:17; it was finishing (reruns, WSL, PR) at 140k. It reports to the live orchestrator.

## Next

1. Close orch-21's tab once the cockpit marks it parked.
2. When w55 reports: check with `git show --stat`, close its tab, then **launch w57-guardian** (brief ready: `.shadow/v2-tools/tasks/w57-guardian.md`, Sonnet high). Tell it w55's PR is open. It makes `claude/63-m1b-base-guardian` = w55's branch plus a merge of #138.
3. After w57 reports: **launch w58-po-trust** (brief ready: `w58-po-trust.md`, Opus medium): M1b-28 part B on `postOffice.ts`, base = w57's branch plus merges of #140 and #115. Tell it w57's PR is open.
4. All three are serial on `postOffice.ts`. Nothing else buildable is left in M1b: M1b-16/17 (B3), 18/19/33/34/35 (CI off, no local macOS) and 32 (B6) stay blocked.

## For the owner

- Codex's review queue: drafts #89 to #140, none reviewed. The prompts in `codex-reviews/` are ready to hand to Codex sessions.
- The prototype: M1a is built on `claude/63-m1a-integrate` (Windows 497, Linux 463 passed); its live run (M1-AC29) waits for the owner.
- Memory: at most two workers and one full test run at a time; briefs tell workers to check for a running vitest first. A full Windows run took about 23 minutes under load.
