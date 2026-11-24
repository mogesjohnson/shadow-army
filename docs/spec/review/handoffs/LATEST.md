# Handoff: orchestrator 10 (`c4419692`) to orchestrator 11 (2026-11-23)

Range on this branch: `9e8d81d..` this commit. Changed: `RUNBOOK.md` (`4cf0e6f`, the new launch method), this file and `STATE.md`.

orch-10 started at 01:13 UTC (2026-11-24) at 69k, closed orch-9's tab, and handed off at about 160k. Two TRACE screenshots and the start cost most of that. Use `screenshot: "none"` except for the one check before Enter.

**The owner's new rules (2026-11-23), now in RUNBOOK 0.2 "Launch a session".**
- Open every session from the + button with TRACE, then type the line into PowerShell. The steps are tested.
- Orchestrators run in colour; workers run in black and white (`$env:NO_COLOR=1;` first). The tool shells carry `NO_COLOR=1`, and `wt.exe` tabs inherited it.
- Pick the model and effort by the task's difficulty. Each brief's `## Model and effort` names it.

**State.**
- M1b runs on `claude/63-m1b` (S-5). w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md` in the main checkout.
- **Waiting for Codex at their heads** (all draft): #105 M1b-2 `129c211`, #106 M1b-6 `30069d8`, #107 M1b-3 `9cd931c`, #108 M1b-14 `1928a9d` (stacked on #107), #109 M1b-1 C helper `915e619`, #110 M1b-1 build script `96288b5` (stacked on #109).
- #108 left one item: `open` returning the log path needs a `server.ts` change. Put it into M1b-22's brief, with #107's two (the session-id refusal in `main.ts`, `release`'s `reason` in `postOffice.ts`).
- w31 deleted its own `w22-backup` branch. w22's work is now #109 and #110.
- GitHub Actions is still off. S7 (M1b-13) stays parked on it (`## Left` in `w24-s7-spike.md`).

**Running, all reporting to orch-10. Tell each "report to orch-11 instead".**

| Worker | Model | Task | Files | Base |
|---|---|---|---|---|
| w26-claude-faults | Sonnet | M1b-11 | `src/v2/claude.ts`, `claude.test.ts`, `test/fakes/claude.mjs` | `claude/63-m1b` |
| w27-lock | Opus medium | M1b-4 | `src/v2/lock.ts`, `lock.test.ts` | `claude/63-m1b` |
| w28-bind | Sonnet medium | M1b-5 | `src/v2/bind.ts`, `bind.test.ts` | `claude/63-m1b` |

w26 was at 161k at 01:22 and still working, past its 150k stop. If it stops without a report, read its `## Left` in `w26-claude-faults.md` and launch a fresh worker on it.

## Next

1. Take each report: `gh pr view <n>` for base and `Size:`, `git diff --stat`. Then close its tab.
2. As slots free up, launch the ready briefs in `.shadow/v2-tools/tasks/` (all report to `orch-10`: `sed -i 's/orch-10/orch-11/g'` first):
   - `w29-logs.md` (M1b-7, Sonnet high), `w32-roster.md` (M1b-8, Sonnet medium), `w33-sanitize.md` (M1b-9, Sonnet high), `w34-trust.md` (M1b-10, Opus medium), `w35-trace-check.md` (M1b-12, Sonnet medium).
3. Wave 2 waits for unmerged code. Stack it per S-5, or wait for Codex.
   - M1b-15 needs 1 and 2. M1b-16 and M1b-20 need 2. M1b-24 and M1b-25 need 6.
   - 22 needs 3, 4 and 5. 29 needs 14 and 9. 31 needs 11.

## For the owner

- Turn GitHub Actions back on, if that's intended (Settings → Actions → General).
- Still open: #103's size exception; B9, the final `claude/63-m1b` → `main` PR's V6 size exception; B6, esbuild as a devDependency; B4, claude recordings; B5, the live ACs.
- Unused cockpit worktrees `AIConnections-worktrees/orch-8-m1b-coordination`, `orch-9-orchestrate-m1b-workers` and `orch-10-orchestrate-m1b-workers`: removing them needs the owner's yes.

## Notes

- Workers may work in a cockpit-made worktree instead of the brief's path. Check the branch and base in each report.
- Previous handoff: `git show 9e8d81d:docs/spec/review/handoffs/LATEST.md`.
