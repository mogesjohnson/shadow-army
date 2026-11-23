# Handoff: session 25 (`44bad808`) to orchestrator 1 (2026-11-23)

**State.**
- **The owner changed the rules.** D-39 and flow section 0 make the work prototype first. RUNBOOK section 0 sets out how sessions work.
- **You are orchestrator 1 (`orch-1`).** You hand off at 300k; workers stop at 150k. Every session says hi every 50 minutes.
- **The spec is v0.27 (`1d99e92`), unchanged.** Round 5 for F ran: 2 P1, 8 P2 and 5 P3, all unverified. Round 5 for M1 did not run, and now it won't.
- **Previous handoff:** `git show c673348:docs/spec/review/handoffs/LATEST.md`.

**First:**
1. Close session 25's tab, titled "T3code vs Shadow Army", once the cockpit marks session `44bad808` parked. It was not started with `; exit`, so close the tab itself (ctrl+shift+w).
2. Start your hi timer.

## Next

One worker per task. T1 to T3 all change `docs/spec/v2.md` and `ledger.md`, so they run one after another. T4 changes neither, so it may run beside them.

- **T1. F's round 5** (Opus, high).
  1. Give round 5's findings rows from R-F-173. They come from `raw/F-R5-implementer.md` and `raw/F-R5-enterprise.md`.
  2. Verify the two P1s with one `spec-verifier` each (Opus, high), with packets in `batches/`.
     - The implementer's P1 is at Appendix D rows 8 and 9, WSP-10 and CH-1.
     - The enterprise operator's P1 is at PO-5, WSP-10, PO-1 and §1's non-goals.
  3. Fix each confirmed P1. Both checkers must give 0 problems.
  4. Mark the 8 P2s and the P3s `build note`.
  5. Commit and push on `claude/63-ultimate-spec-review`.

  Files: `v2.md`, `ledger.md`, `batches/F-R5-*` and `raw/F-R5-V*`.
- **T2. Close M1** (Sonnet, medium).
  1. List every M1 row in `ledger.md` that is a confirmed P0 or P1 not yet fixed, and every open DECISION or NEEDS-PROBE. R-M1-236 / P-17 is one of them.
  2. Fix those that have paste-ready text.
  3. Send the rest to the orchestrator as one list.

  Files: `v2.md`, `ledger.md`.
- **T3. Freeze and cut** (Opus, high).
  1. Make spec v0.28: update the Version row and split M1 into M1a, the slice below, and M1b, the rest.
  2. Run the trace checker (0 problems).
  3. Make the snapshot `v2@<sha>.md`.

  Files: `v2.md`, `ledger.md`'s summary and `STATE.md`.
- **T4. Read #75** (Sonnet, medium; read-only, so it may run beside T1 to T3).
  - Read Codex's draft at `../AIConnections-worktrees/m1` (`04ab953`).
  - List which of its files the slice can reuse, what fails CI, and the smallest change that makes CI green.

  It writes only `.shadow/v2-tools/tasks/T4-report.md`.
- **T5 and on. Build the slice.**
  - The orchestrator splits the work by files after T3 and T4. Parallel workers each get their own branch, with PRs stacked where one needs another.
  - `suggested.md` S-2 says who builds it: Claude workers, on a new branch from `main`.

## The slice (M1a): the prototype the owner can watch

1. One command in Claude Code sends a brief to one claude soldier. The post office holds that soldier live in its own worktree (CH-2).
2. The soldier's summary comes back as a row in the transcript (HOST-11).
3. After the turn, the claim audit and the checkout guard run (WSP-2, WSP-11; v1's `src/workspace/` code).
4. The change is applied to the owner's folder, uncommitted.

The slice is Windows only; macOS and Linux say "Not tested" (D-34). Left out: the pane, the strip, the codex, grok and agy channels, the meter, the handoff, and any lease detail beyond what stops the post office outliving the session. T3 picks the exact requirement and AC IDs.

## For the owner

None of these blocks the work.

- `suggested.md`: S-1 (a T3 Code trial; it waits for the owner because it installs software) and S-2.
- Older open questions:
  - P-17's Windows cases;
  - alpha Q4, deferred;
  - the `Co-Authored-By: Ziggy` line on #81;
  - the cockpit's "+" choice.
- **PR #83** is about 35k lines. Merging it needs a V6 size exception in the owner's words and Codex's approval, so it stays open as the record.
- **Code PRs wait for Codex's review**, which runs when the owner runs Codex.
