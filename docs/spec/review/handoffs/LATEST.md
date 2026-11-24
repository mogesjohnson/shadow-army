# Handoff: orchestrator 19 (`7bc327ea`) to orchestrator 20 (2026-11-24)

Range on this branch: `712d602..` this commit (this file and `STATE.md`). orch-18's handoff is `git show 712d602:docs/spec/review/handoffs/LATEST.md`; its Next and For the owner still hold except as below. orch-19 started at 14:35 UTC at 80k and handed off at about 15:05 at about 165k. Working notes: `.shadow/v2-tools/tasks/orch-19-notes.md` in the main checkout.

**Done.**
- Closed orch-18's tab.
- **#136** (w51, fix `5d8da6c`): `client.test.ts:78` now expects the snapshot outside the folder. 109 lines, 3 files, 2 commits. Windows: 618 passed, 14 skipped. WSL passes.
- **#137** (w51, `7112624`, `claude/63-m1b-po-startup` into `claude/63-m1b-po-chain1`, draft; 214 lines, 2 files): PO-1 startup (sweep, a late guard from an on-disk baseline, the last post office's snapshots) and the tree callers (record before start, listing, `holdGuardOpen`, `mayStart`). `npm test` fails 1 of 636: the new startup test's afterEach `rmSync` gets EPERM on Windows, though its assertions pass. WSL not run. w51 stopped at 162k; its `## Left` is in its brief. Tab closed.

**Running, reporting to "orch-19" (it means you):**

| Worker | Model | Task | Files | Branch |
|---|---|---|---|---|
| w52-po-finish (`54572d22`, launched 15:01) | Opus medium | Finish #137: the EPERM teardown flake, wire `HarnessHold` (M1b-24), the WSL run, #137's `Size:`/`Validation:` and AC comment | `src/v2/postOffice*`, `test/fakes/` (new) | `claude/63-m1b-po-startup` |

Check its report with `git show --stat` per commit and `gh pr view 137 --json additions,deletions` against `Size:`, then close its tab.

## Next

1. Close orch-19's tab once the cockpit marks it parked.
2. **M1b-27** once w52 has reported and its tab is closed (serial on `postOffice.ts`): the brief is ready, `.shadow/v2-tools/tasks/w53-po-chain2.md` (Opus medium). It makes the base `claude/63-m1b-base-po-chain2` = #137's head plus a merge of #135, then PR 1 (PO-8 session services for the guard, plus #135's `onBacklog` to `pause?()`/`resume?()` caller in `main.ts`) and PR 2 (worktree lines, two soldiers, M1 restarts, the #99 heartbeat test). Launch line as RUNBOOK 0.2 with `-n w53-po-chain2`.
3. **Parallel candidate (separate files):** #137's caller work in `src/v2/claude.ts`: the Claude channel's `list()` and guardian identity, which the tree callers need. Based on #135 (`claude/63-m1b-exit-grace`, which also changes `claude.ts`). No brief yet. Sonnet or Opus medium. Its PR then joins the chain 2 base by a merge.
4. Then M1b-28 (w20 plan line 59, with w45's `trust` command). Blocked as before: M1b-16/17 (B3), M1b-18/19/33/34/35 (CI off, no local macOS), M1b-32 (B6).

## For the owner

- Codex's review queue: drafts #89 to #137, none reviewed.
- The rest as in orch-17's handoff.
