# Handoff: orchestrator 12 (`b0d026b4`) to orchestrator 13 (2026-11-24)

Range on this branch: `e58ed19..` this commit. Changed: this file and `STATE.md`.

orch-12 started at 01:40 UTC at 69k and handed off at about 160k. It closed orch-11, w34, w29, w35 and w32, launched w35, w36 and w37, and checked #116 to #119. Working notes: `.shadow/v2-tools/tasks/orch-12-notes.md` in the main checkout.

**State.**
- M1b runs on `claude/63-m1b` (S-5). w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md`.
- **Waiting for Codex at their heads** (all draft, based on `claude/63-m1b` unless stacked): #105 M1b-2 `129c211`, #106 M1b-6 `30069d8`, #107 M1b-3 `9cd931c`, #108 M1b-14 `1928a9d` (on #107), #109 M1b-1 C helper `915e619`, #110 M1b-1 build `96288b5` (on #109), #111 M1b-11 `c81ecf5`, #112 M1b-5 `e275b51`, #113 M1b-4 `d406d8a`, #114 M1b-9 `eabd77c`, #115 M1b-10 `642154b`, #116 M1b-7 `0322656`, #117 M1b-12 `92dc309`, #118 M1b-8 roster order `2f6f66b`, #119 M1b-8 roster and instructions `6f89bac` (on #118). orch-12 checked #116 to #119: every commit is within V6's 200 lines and 4 files, every PR within 400 lines and 6 files.
- Decision (orch-12): ARM-1's reorder (Bellion after claude-opus) broke v1 tests, so w32 changed the expectations in `src/core/roster.test.ts`, `src/core/router.test.ts` and `src/monarch/assign.test.ts` and split M1b-8 into #118 and #119 to stay within V6.
- GitHub Actions is still off. S7 (M1b-13) stays parked on it.

**Running, both reporting to orch-12. Tell each "report to orch-13 instead".**

| Worker | Model | Task | Files | Base |
|---|---|---|---|---|
| w36-snapshots | Sonnet high | M1b-25 | `src/v2/snapshot.ts`, `snapshot.test.ts` | `claude/63-m1b-harness-git` (#106) |
| w37-git-hold | Sonnet high | M1b-24 | `src/v2/git/hold.ts`, `hold.test.ts`, `hostileRepo.testutil.ts` | `claude/63-m1b-harness-git` (#106) |

w36 was at 143k at 01:59 and will stop at 150k with `## Left` in its brief; launch a fresh worker on what is left.

## Next

1. One slot is free. Write and launch the next brief, copying `w37-git-hold.md`'s shape. Ready to stack: **M1b-20** (PO-14's check, `v2/contain/check.ts`, `check.test.ts`, `messages.ts`, `native/probe.mjs`) on #105's branch, Sonnet high; **M1b-31** (claude usage figures, `v2/claude.ts`, `claude.test.ts`) on #111's branch, without AC3's fixture (B4). M1b-16 waits for the owner's B3. M1b-15 and M1b-22 need several unmerged bases: wait for Codex.
2. **Post-office wiring**, a later task once #116 and #119 merge (`postOffice.ts`, `postOffice.test.ts`): pass `loadV2Roster().names` to `buildStandingInstructions`; wire `logs`' `onFailure` and check `written` for the turn-opening line, since `write()` no longer throws, so a log failure no longer closes the office; `flushOpen` (PO-5's partial message at turn end); the marker `[REDACTED]` versus WSP-8's `[redacted]`. Plus orch-11's items for M1b-22: #108's `open` returning the log path (`server.ts`), #107's session-id refusal in `main.ts`, `release`'s `reason` in `postOffice.ts`.
3. For M1b-33 (from w35): `docs/spec/v2.md` on `claude/63-m1b` is stale (lacks M1-AC24 to 28), so #117's repo-spec test compares to a baseline; rule 8 and rule 5's base compare are not ported.

## For the owner

- Open question from orch-11: a thin M2 slice (the codex channel, built like M1a) ahead of most of M1b's hardening. Not yet in `suggested.md`; waits for the owner's yes.
- The owner's live run M1-AC29 (`docs/v2-m1a-live-run.md`) is not recorded as done.
- Turn GitHub Actions back on, if intended. Still open: #103's size exception; B3 (Smart App Control check before M1b-16); B4 claude recordings; B5 live ACs; B6 esbuild; B9 the final PR's size exception.
- Unused cockpit worktrees `orch-8` to `orch-12` under `AIConnections-worktrees/`: removing them needs the owner's yes.

## Notes

- Workers start at about 95-105k, so a 150k stop leaves them about 50k of work: keep tasks to one module and its test.
- TRACE as before: `invoke NewTabButton`, one window observation at depth 6, `type_text`, one `screenshot: "scaled"` check, Enter. Closing a tab is one TabView observation and one `invoke` of its `Close Tab`.
- Previous handoff: `git show e58ed19:docs/spec/review/handoffs/LATEST.md`.
