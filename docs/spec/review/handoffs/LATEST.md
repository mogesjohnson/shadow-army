# Handoff: orchestrator 9 (`1d93de76`) to orchestrator 10 (2026-11-23)

Range on this branch: `1d2b6b5..` this commit. Only this file and `STATE.md` changed.

orch-9 started at 01:03 UTC (2026-11-24), closed orch-8's tab, and handed off at 150k: the start cost about 70k, and one TRACE screenshot about 20k. Read a worker's screen only when its last words do not explain a stop.

**State.**
- **M1b** runs on `claude/63-m1b` (S-5). w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md` in the main checkout: section 2 gives the order, and each task's row gives its files.
- **Waiting for Codex at their heads** (draft PRs into `claude/63-m1b`): #105 M1b-2 seam `129c211`, #106 M1b-6 harness git `30069d8`, #107 M1b-3 lease `9cd931c`. No reviews on any of them yet.
- **#107 left two items outside its files:** the refusal to start without a session id (needs `main.ts`) and `release`'s `reason` field (needs `postOffice.ts`). Put them into M1b-22's brief and the post-office chain's (23 onward).
- **GitHub Actions is off on the repository** (`gh api repos/mogesjohnson/shadow-army/actions/permissions` gives `enabled: false`; nothing has run since 2026-11-07). The owner was told. PR checks don't run, so workers validate locally. Open #88 ("Make CI and PR format manual-only", grok) may be related.
- **S7 (M1b-13) is parked on Actions.** w24 pushed `spike/s7` at `2ce34ea` and wrote the finish steps under `## Left` in `.shadow/v2-tools/tasks/w24-s7-spike.md`. Once Actions is on, launch a fresh worker on that `## Left`. Its tab is closed.
- **w22 was stuck at its own V6 dialog** (TRACE screenshot 01:12). Its tab is closed. Its 2 local commits (`97735ba`, `69f9b2a`) sit in worktree `AIConnections-worktrees/w22-linux-helper`, branch `claude/63-m1b-linux-helper`.

**Running, all launched by orch-9 and reporting to orch-9. Tell each "report to orch-10 instead".**

| Worker | Task | Files | Base, PR |
|---|---|---|---|
| w26-claude-faults (Sonnet) | M1b-11 | `src/v2/claude.ts`, `claude.test.ts`, `test/fakes/claude.mjs` | `claude/63-m1b`, draft PR into it |
| w30-mod-renewals (Sonnet) | M1b-14 | `plugins/shadow-army/hooks/register.ts` and its test, `src/v2/modRelay.ts` and its test | stacked on #107: `claude/63-m1b-lease` |
| w31-linux-push (Sonnet) | M1b-1, push w22's work as option 3 | `native/linux/sa-contain.c`; `scripts/build-native.mjs` and its test, `package.json`, `.gitignore` | PR 1 into `claude/63-m1b`, PR 2 stacked on it |

w26 was at 141k at 01:18, so it may stop at 150k with a `## Left`.

## Next

1. Take each report. Check it with `git show --stat`, its Size line and its base. Then close its tab.
2. As slots free up, launch the ready briefs in `.shadow/v2-tools/tasks/`, each reporting to `orch-9`: change that to `orch-10` first (`sed -i 's/orch-9/orch-10/g'`).
   - `w27-lock.md` (M1b-4), `w28-bind.md` (M1b-5), `w29-logs.md` (M1b-7).
   - Then write briefs for 8, 9, 10 and 12 the same way, in w20's order.
3. Wave 2 waits for unmerged code. Stack it per S-5, or wait for Codex.
   - M1b-15 needs 1 and 2. M1b-16 and M1b-20 need 2. M1b-24 and M1b-25 need 6.
   - 22 needs 3, 4 and 5. 29 needs 14 and 9. 31 needs 11.
4. When S7 runs, turn its PO-14, PO-16, PO-18 and PO-19 lines into one spec task on this branch. Send any owner finding to the owner.

## For the owner

- Turn GitHub Actions back on, if that's intended (Settings → Actions → General).
- Still open from orch-7: #103's size exception; B9, the final `claude/63-m1b` → `main` PR's V6 size exception; B6, esbuild as a devDependency; B4, claude recordings; B5, the live ACs.
- Cockpit worktrees that orch-8 and orch-9 didn't use, `AIConnections-worktrees/orch-8-m1b-coordination` and `orch-9-orchestrate-m1b-workers`: removing them needs the owner's yes.

## Notes

- Some workers work in a cockpit-made worktree instead of the brief's path (w30 is in `w30-mod-renewals-renew-lease-from-mod-m1b-14`). Check the branch and base in each report, not the path.
- Previous handoff: `git show 1d2b6b5:docs/spec/review/handoffs/LATEST.md`.
