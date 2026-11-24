# Handoff: orchestrator 15 (`9b3fdb94`) to orchestrator 16 (2026-11-24)

Range on this branch: `fd89dc3..` this commit. Changed: this file and `STATE.md`.

orch-15 started at 06:18 UTC at 77k and handed off at 06:28 at about 165k. It closed orch-14, w41, w42 and w43, made one combined base, and launched w44, w45 and w46. Working notes: `.shadow/v2-tools/tasks/orch-15-notes.md` in the main checkout.

**State.**
- M1b runs on `claude/63-m1b` (S-5). w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md`.
- **Codex has reviewed none of #89 to #128.** All M1b PRs are drafts waiting at their heads: #105 to #124 as in the previous handoffs (`git show fd89dc3:docs/spec/review/handoffs/LATEST.md`), plus these four, each checked against its `Size:` line and within V6:
  - #125 M1b-15 Linux driver `aa54244` (on `claude/63-m1b-base-linux-driver`; 323 lines, 3 files, 3 commits)
  - #127 M1b-15 registration and the "has containment" predicate `93a9da7` (on #125; 29 lines, 4 files, 1 commit)
  - #126 M1b-22 server wiring `13ab6db` (on `claude/63-m1b-base-server-wiring`; 355 lines, 5 files, 2 commits)
  - #128 M1b-29 mod preflight `e8799bc` (on `claude/63-m1b-base-mod-preflight`; 212 lines, 2 files, 2 commits)
- **S-7 bases**: as before (`linux-driver` `665cea7`, `server-wiring` `08ba067`, `mod-preflight` `bb85f2f`), plus `claude/63-m1b-base-mod-trust` `1c6c264` = #128 + #115 (M1b-30).
- 5-hour figure: 36% at 06:27 UTC. GitHub Actions is still off.

**Running, all reporting to "orch-15, or the next orch".**

| Worker | Model | Task | Files | Base |
|---|---|---|---|---|
| w44-trees-sweep | Sonnet high | M1b-21, two stacked PRs: trees + failure path, then sweep + entry | `src/v2/contain/trees*`, `contain/sweep*`, `src/v2/sweepMain.ts` | `claude/63-m1b-linux-driver` (#125) |
| w45-mod-trust-dialog | Sonnet medium | M1b-30 | `plugins/shadow-army/hooks/register*` | `claude/63-m1b-base-mod-trust` |
| w46-server-log | Sonnet medium | w42's leftover: pass the post office's log into the server (`ServerOptions.log`, one writer on `post-office.jsonl`) and fix the old lock path in `docs/v2-m1a-live-run.md` | `src/v2/postOffice.ts`, `main.ts`, `server*`, `docs/v2-m1a-live-run.md` | `claude/63-m1b-server-wiring` (#126) |

At 06:27: w44 119k, w45 90k, w46 79k. Briefs: `.shadow/v2-tools/tasks/<name>.md`. Check each report with `git show --stat` per commit and `git diff --shortstat` against the PR's `Size:` line, then close its tab.

## Next

1. **M1b-23** (watch and shutdown: `watch*`, `main.ts`, `postOffice.ts` close path) after w44 and w46 are done: its base merges w46's head (which carries #126) and w44's top head (S-7). Opus medium (shutdown under time limits is concurrency work). Split past 300 lines.
2. Then: M1b-19 (macOS driver) waits on M1b-18 (CI; Actions off, no local macOS). M1b-16/17 wait on B3. M1b-33, 34, 35 need CI. M1b-32 needs B6.
3. Caller work for later, once bases merge, as in the previous handoffs plus:
   - w41: `ManagedProcess` in `contain/windows.ts` lacks `list()` and `close({grace:false})`; PO-10's log of ended processes needs a caller of the helper's `reaped` reports; the never-ready and over-limit paths need M1-AC15's test build of the helper.
   - w42: the Windows DACL line (M1b-17, B3); the win32/darwin `processStartTime` stop-gap, to swap for M1b-17's script and M1b-1's helper.
   - w43: none (sanitize bundling belongs to M1b-32).
4. For M1b-33 (from w35): `docs/spec/v2.md` on `claude/63-m1b` is stale (lacks M1-AC24 to 28).

## For the owner

- Codex's review queue: open drafts #89 to #128, none reviewed. M1b keeps going on combined bases (S-7).
- As before: the thin M2 slice question (orch-11, not yet in `suggested.md`); M1-AC29 live run not recorded; GitHub Actions; #103's size exception; B3, B4, B5, B6, B9; unused cockpit worktrees `orch-8` to `orch-15` under `AIConnections-worktrees/` (orch-15's holds the local branch `claude/63-m1b-base-mod-trust`, pushed).

## Notes

- orch-15 ran out of room fast: three TRACE screenshots and the start-up reading took it from 77k to 160k in ten minutes. Use one `screenshot: "scaled"` per launch only, and skip it when the typed line is short.
- A fresh tab's window observation at depth 6 already binds focus to the new Text control; typing from that observation worked (no second depth-2 observation needed).
