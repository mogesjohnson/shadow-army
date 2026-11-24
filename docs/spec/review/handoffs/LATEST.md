# Handoff: orchestrator 18 (`ab8384c4`) to orchestrator 19 (2026-11-24)

Range on this branch: `ca1765e..` this commit (this file and `STATE.md`). orch-17's handoff is `git show ca1765e:docs/spec/review/handoffs/LATEST.md`; its Next and For the owner still hold except as below. orch-18 started at 06:59 UTC at 82k and handed off at 14:40 at about 165k. Working notes: `.shadow/v2-tools/tasks/orch-18-notes.md` in the main checkout.

**Done.**
- Closed orch-17's tab. w49 was still held at its duplicate question with no work done: closed its tab and relaunched it on the same brief; it then ran clean.
- **#135** (w50, `462c260`, `claude/63-m1b-exit-grace` into `claude/63-m1b-base-po-chain`; 203 lines, 5 files, 2 commits): 10 s Windows exit grace (injectable `exitGraceMs`; control-pipe loss still bypasses it), optional `pause?()`/`resume?()` on `NativeChannel`, implemented in `ClaudeChannel`.
- **#136** (w49, `c0ce71a`, `claude/63-m1b-po-chain1` into `claude/63-m1b-base-po-chain`; 106 lines, 2 files, 1 commit): M1b-26 items 1 and 2, harness git and WSP-11's outside snapshots. w49 stopped at 150k. `npm test` failed 1 of 632: `src/v2/client.test.ts:78` expects the old in-folder snapshot path. **orch-18's call** (PR comment): the expectation is out of date; fix it on #136.
- The 5-hour figure hit 80% at 07:15 and reset at 14:30; nothing ran in between. Claude Code killed the hi timer once for low memory (09:19); the owner restarted it.

**Running, reporting to "orch-18" (it means you):**

| Worker | Model | Task | Files | Base |
|---|---|---|---|---|
| w51-po-startup (`0036184a`, launched 14:35) | Opus medium | Fix #136's `client.test.ts:78` and run its skipped WSL check, then PR 2 on `claude/63-m1b-po-startup` stacked on #136: M1b-26 items 3 (PO-1 startup) and 4 (the tree callers), and `HarnessHold` | `src/v2/client.test.ts` (line 78), `src/v2/postOffice*` | `claude/63-m1b-po-chain1` |

Check each report with `git show --stat` per commit and `gh pr view <n> --json additions,deletions` against the PR's `Size:` line, then close its tab.

## Next

1. Close orch-18's tab once the cockpit marks it parked.
2. **M1b-27** (post office chain 2, Opus medium) after w51 is done: a new S-7 base merging w51's top head and #135's head, plus #135's post office caller (forward `main.ts`'s `onBacklog(true/false)` to the channels' `pause?()`/`resume?()`; `main.ts` joins its files). w20's plan row: `.shadow/v2-tools/tasks/w20-m1b-plan-report.md` line 58. Then M1b-28 (line 59) with w45's `trust` command. Serial on `postOffice.ts`.
3. Blocked as before: M1b-16/17 (B3), M1b-18/19/33/34/35 (CI off, no local macOS), M1b-32 (B6).

## For the owner

- Codex's review queue: drafts #89 to #136, none reviewed.
- The rest as in orch-17's handoff.
