# Handoff: orchestrator 11 (`c60839b3`) to orchestrator 12 (2026-11-24)

Range on this branch: `ff0aae6..` this commit. Changed: this file and `STATE.md`.

orch-11 started at 01:30 UTC at 72k and handed off at about 160k. The owner answered the cockpit's duplicate-task stop with "take over now". Closing and launching tabs costs about 6-10k each; launching three workers and one replacement cost most of the session.

**State.**
- M1b runs on `claude/63-m1b` (S-5). w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md` in the main checkout.
- **Waiting for Codex at their heads** (all draft, all based on `claude/63-m1b` unless stacked): #105 M1b-2 `129c211`, #106 M1b-6 `30069d8`, #107 M1b-3 `9cd931c`, #108 M1b-14 `1928a9d` (on #107), #109 M1b-1 C helper `915e619`, #110 M1b-1 build `96288b5` (on #109), #111 M1b-11 `c81ecf5`, #112 M1b-5 `e275b51`, #113 M1b-4 `d406d8a`, #114 M1b-9 `eabd77c`, #115 M1b-10 `642154b`. orch-11 checked #111 to #115: every commit is within V6's 200 lines and 4 files.
- Still for M1b-22's brief: #108's `open` returning the log path (`server.ts`), #107's session-id refusal in `main.ts` and `release`'s `reason` in `postOffice.ts`.
- GitHub Actions is still off. S7 (M1b-13) stays parked on it.

**w34-trust reported #115 and waits: close its tab first, then launch w35 in its slot.**

**Running, all reporting to orch-11. Tell each "report to orch-12 instead".**

| Worker | Model | Task | Files | Base |
|---|---|---|---|---|
| w29-logs | Sonnet high | M1b-7 | `src/v2/logs.ts`, `logs.test.ts` | `claude/63-m1b` |
| w32-roster | Sonnet medium | M1b-8 | `src/v2/roster.ts`, `instructions.ts`, their tests, `orchestratorDelegate.md`, `shadow.config.json` | `claude/63-m1b` |

## Next

1. Take each report: `gh pr view <n>` for base and `Size:`, per-commit `git show --numstat`. Then close its tab.
2. When a slot frees, launch `w35-trace-check.md` (M1b-12, Sonnet medium). Run `sed -i 's/orch-11/orch-12/g'` on it first. It is the last ready wave 1 brief.
3. Wave 2 waits for unmerged code (see the plan's section 1). Write its briefs next: M1b-15 needs 1 and 2; 16 and 20 need 2; 24 and 25 need 6; 22 needs 3, 4 and 5; 29 needs 14 and 9; 30 needs 29 and 10; 31 needs 11. Stack per S-5 or wait for Codex.

## For the owner

- Open question from orch-11 (2026-11-24): put a thin M2 slice (the codex channel, built like M1a) in `suggested.md`, ahead of most of M1b's hardening, so the prototype commands more than claude sooner? Not yet written; it waits for the owner's yes.
- The owner's live run M1-AC29 (`docs/v2-m1a-live-run.md`) is not recorded as done.
- Turn GitHub Actions back on, if that's intended. Still open: #103's size exception; B3 (Smart App Control check before M1b-16); B4 claude recordings; B5 live ACs; B6 esbuild; B9 the final PR's size exception.
- Unused cockpit worktrees `orch-8` to `orch-11` under `AIConnections-worktrees/`: removing them needs the owner's yes.

## Notes

- TRACE: after `invoke NewTabButton`, one window observation at depth 6 binds focus to the new tab's Text control, and `type_text` works straight from it. Then one `screenshot: "scaled"` check, then Enter.
- Previous handoff: `git show ff0aae6:docs/spec/review/handoffs/LATEST.md`.
