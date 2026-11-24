# Interim record: orchestrator 18 (`ab8384c4`), 2026-11-24 07:20 UTC

Not a handoff yet: orch-18 is live and waiting for the 5-hour limit to reset. Range on this branch: `ca1765e..` this commit (this file and `STATE.md`). orch-17's handoff is `git show ca1765e:docs/spec/review/handoffs/LATEST.md`; its Next and For the owner still hold except as below. Working notes: `.shadow/v2-tools/tasks/orch-18-notes.md` in the main checkout.

**Done.**
- Closed orch-17's tab (07:00).
- w49 was still held at its duplicate question with no work done: closed its tab and relaunched it on the same brief (07:01). It then ran clean.
- **#135** (w50, `462c260`, `claude/63-m1b-exit-grace` into `claude/63-m1b-base-po-chain`; 203 lines, 5 files, 2 commits): 10 s Windows exit grace (injectable `exitGraceMs`; control-pipe loss still bypasses it), optional `pause?()`/`resume?()` on `NativeChannel`, implemented in `ClaudeChannel`. Checked; tab closed.
- **#136** (w49, `c0ce71a`, `claude/63-m1b-po-chain1` into `claude/63-m1b-base-po-chain`; 106 lines, 2 files, 1 commit): M1b-26 items 1 and 2, harness git and WSP-11's outside snapshots. w49 stopped at 150k. `npm test` fails 1 of 632: `src/v2/client.test.ts:78` expects the old in-folder snapshot path. **orch-18's call** (PR comment): the expectation is out of date; fix it on #136. Checked; tab closed.

**No worker is running.** The 5-hour figure reached 80% at 07:15 (it resets about 11:00 UTC), so RUNBOOK 0.2 allows no new worker.

## Next

1. At the reset, launch **w51-po-startup** (Opus medium, brief `.shadow/v2-tools/tasks/w51-po-startup.md`): fix #136's `client.test.ts:78` and run its skipped WSL check, then PR 2 on `claude/63-m1b-po-startup` (M1b-26 items 3 and 4: PO-1 startup, the tree callers, `HarnessHold`).
2. Then **M1b-27** (post office chain 2) on a new S-7 base merging w51's top head and #135's head, plus #135's post office caller (forward `main.ts`'s `onBacklog(true/false)` to the channels' `pause?()`/`resume?()`; `main.ts` joins its files). Then M1b-28 with w45's `trust` command. Serial on `postOffice.ts`.
3. Blocked as before: M1b-16/17 (B3), M1b-18/19/33/34/35 (CI off, no local macOS), M1b-32 (B6).

## For the owner

- Codex's review queue: drafts #89 to #136, none reviewed.
- The rest as in orch-17's handoff.
