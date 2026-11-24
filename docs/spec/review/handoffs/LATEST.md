# Handoff: orchestrator 17 (`87e76246`) to orchestrator 18 (2026-11-24)

Range on this branch: `95b0033..` this commit. Changed: this file and `STATE.md`.

orch-17 started at 06:48 UTC at 69k and handed off at about 07:00 at about 165k (TRACE observations cost it about 10k each round). It closed orch-16 and w48, made one combined base, and launched w49 and w50. Working notes: `.shadow/v2-tools/tasks/orch-17-notes.md` in the main checkout.

**State.**
- M1b runs on `claude/63-m1b` (S-5). w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md`.
- **Codex has reviewed none of #89 to #134.** All M1b PRs are drafts waiting at their heads: #105 to #133 as in the previous handoffs (`git show 95b0033:docs/spec/review/handoffs/LATEST.md`), plus:
  - #134 M1b-21's mod caller `3d3a8fe` (on `claude/63-m1b-base-mod-sweep`; 97 lines, 2 files, 1 commit; orch-17 corrected its `Size:` from 94). The mod runs `sweepMain` once when the relay ends with no shutdown event, with one transcript line.
- **S-7 bases**: as before, plus `claude/63-m1b-base-po-chain` `1584f3a` = #133 (`claude/63-m1b-watch`) + merges of #121 (git hold), #120 (snapshots) and #132 (sweep), all clean.
- **Decision B2** (w20's plan, line 134): M1 keeps v1's write path (`openWriteSession`: worktree, claims, apply); the post office's own git moves onto harness git in M1b-26. It can be undone, and it stays in the repo.
- 5-hour figure: 64% at 06:53 UTC. GitHub Actions is still off.

**Running, reporting to "orch-17, or the next orch":**

| Worker | Model | Task | Files | Base |
|---|---|---|---|---|
| w49-po-chain1 | Opus medium | M1b-26: post office onto harness git and `snapshot.ts`; PO-1 startup; the tree callers (`TreeRecord.create`, `listing()`, `sweepTrees`, `holdGuardOpen`, `DownSoldiers.mayStart`). Split past 300 lines: PR 2 on `claude/63-m1b-po-startup` | `src/v2/postOffice*` | `claude/63-m1b-base-po-chain` |
| w50-exit-grace | Sonnet high | #133's gaps: 10 s exit grace in `contain/windows.ts` (injectable), `pause()`/`resume()` on `NativeChannel` and `ClaudeChannel` | `contain/windows*`, `channel.ts`, `claude*` | `claude/63-m1b-base-po-chain` |

- **w49 is held by the cockpit's duplicate-task stop** (flagged as a duplicate of 87e7, orch-17: a false positive). Since 06:55 it has been waiting on its own question "Proceed as w49?". orch-17 did not answer it (RUNBOOK 0.2: never lift a hold by typing). It is the owner's to answer. orch-17 sent w49 a message confirming the launch. If it is still held when orch-17's tab is closed, the stop may clear by itself; otherwise re-plan: close w49 and relaunch it with the same brief.
- w50 works in a cockpit worktree (`AIConnections-worktrees/w50-exit-grace-10-s-...`). At its report, check that it pushed to `claude/63-m1b-exit-grace` and that its PR is into `claude/63-m1b-base-po-chain`.
- Check each report with `git show --stat` per commit and `gh pr view <n> --json additions,deletions` against the PR's `Size:` line (additions plus deletions), then close its tab.

## Next

1. Close orch-17's tab once the cockpit marks it parked. Then w49's hold (above).
2. **M1b-27** (post office chain 2, `postOffice*`, Opus medium) after w49 is done: base = a new S-7 base merging w49's top head and w50's head. Add w50's post office caller (forward `main.ts`'s `onBacklog(true/false)` to the channels' `pause()`/`resume()`; `main.ts` is then in its files). Then M1b-28 (with w45's `trust` command, below), serial on `postOffice.ts`.
3. Blocked as before: M1b-16/17 (B3), M1b-18/19/33/34/35 (CI off, no local macOS), M1b-32 (B6).
4. Caller work for later, as in the previous handoffs plus:
   - w45 (#131): the post office's `trust` command, `{action:"trust"}` -> `{files:[{name,status,hash|null}], details?}` and `{action:"trust",accept:[{name,hash}]}` -> `{ok}` or `{ok:false,reason}`, on `src/v2/trust.ts`. Goes with M1b-28.
   - w44 (#132): macOS sweep ops (needs M1b-18), the PO-13 checksum check, the Windows creation-time unit (Unix ms in M1b-17).
5. For M1b-33 (from w35): `docs/spec/v2.md` on `claude/63-m1b` is stale (lacks M1-AC24 to 28).

## For the owner

- **w49's tab asks "Duplicate? Proceed as w49 (Recommended)".** It is the M1b-26 worker orch-17 launched; answer 1 to let it work.
- Codex's review queue: open drafts #89 to #134, none reviewed. M1b keeps going on combined bases (S-7).
- As before: the thin M2 slice question (orch-11, not yet in `suggested.md`); M1-AC29 live run not recorded; GitHub Actions; #103's size exception; B3, B4, B5, B6, B9; unused cockpit worktrees `orch-8` to `orch-17` under `AIConnections-worktrees/` (orch-17's holds local branch `claude/63-m1b-base-po-chain`, pushed).

## Notes

- Read only RUNBOOK section 0 and this file; skip `orch-*-notes.md` unless needed. Each full TRACE observation with a scaled screenshot costs about 3k to 5k; use `screenshot: "none"` wherever the tree is enough.
