# Handoff: orchestrator 14 (`b023b28d`) to orchestrator 15 (2026-11-24)

Range on this branch: `34105ec..` this commit. Changed: this file, `STATE.md` and `suggested.md` (S-7).

orch-14 started at 06:04 UTC at 69k and handed off at 06:20 at about 170k. It closed orch-13 and w39, made three combined bases, and launched w41, w42 and w43. Working notes: `.shadow/v2-tools/tasks/orch-14-notes.md` in the main checkout.

**State.**
- M1b runs on `claude/63-m1b` (S-5). w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md`.
- **Codex has reviewed none of #89 to #124** (0 reviews as of 06:10 UTC). All M1b PRs are drafts waiting at their heads: #105 to #123 as in the previous handoff (`git show 34105ec:docs/spec/review/handoffs/LATEST.md`), plus #124 M1b-31 claude usage `802a776` (on #111; 156 lines, 3 files, 1 commit; orch-14 fixed its Size line from 175). w40 finished: #122 and #123 pass on Linux (23/23), no code change.
- **S-7, combined bases** (going ahead): a task whose dependencies are unmerged PRs gets `claude/63-m1b-base-<task>`, merging their heads with merge commits; the task PR targets it. When the dependencies merge, retarget the task PR to `claude/63-m1b`. If Codex changes a dependency PR, merge its new head into the base. Deleting a base needs the owner's yes.
  - `claude/63-m1b-base-linux-driver` `665cea7` = #110 + #105 (M1b-15)
  - `claude/63-m1b-base-server-wiring` `08ba067` = #107 + #113 + #112 (M1b-22)
  - `claude/63-m1b-base-mod-preflight` `bb85f2f` = #108 + #114 (M1b-29)
- 5-hour figure: 17% at 06:18 UTC. GitHub Actions is still off; S7 (M1b-13) stays parked on it.

**Running, all reporting to "orch-14, or the next orch".**

| Worker | Model | Task | Files | Base |
|---|---|---|---|---|
| w41-linux-driver | Opus medium | M1b-15 in two stacked PRs: driver + tests, then registration | `src/v2/contain/linux*`, `contain/index.ts`, `contain/index.test.ts` (orch-14 added it), `test/fakes/tree-writer.mjs`, `windowsOnly.testutil.ts`, `vitest.config.ts` | `claude/63-m1b-base-linux-driver` |
| w42-server-wiring | Sonnet high | M1b-22 without the Windows DACL line (B3/M1b-17) | `src/v2/server*`, `main.ts`, `credential*` | `claude/63-m1b-base-server-wiring` |
| w43-mod-preflight | Sonnet medium | M1b-29 | `plugins/shadow-army/hooks/register*` | `claude/63-m1b-base-mod-preflight` |

w41 was at 124k and w42 at 149k at 06:18, so expect w42's 150k report with a `## Left` in its brief. orch-14 told w42: `startTimeOf` injectable (Linux `/proc`, darwin `ps`, win32 reuse a reader in `contain/windows.ts` if one exists, else PowerShell marked for M1b-17); no second writer on `post-office.jsonl`, take the log as a `ServerOptions` field. Check each report with `git show --stat` and `git diff --shortstat` against the PR's `Size:` line, then close its tab.

## Next

1. When a slot frees: w42's leftover, if any, goes to a fresh worker on its branch. Then, by w20's plan, the tasks left are: M1b-21 (after 15), M1b-23 (after 22 and 21), M1b-30 (after 29 and 10), M1b-19 (after 15 and 18). M1b-16/17 wait on B3; M1b-18, 33, 34, 35 need CI (Actions off; macOS has no local run); M1b-32 needs B6.
2. Caller work for later, once bases merge: as in the previous handoff, plus whatever w41, w42 and w43 report.
3. For M1b-33 (from w35): `docs/spec/v2.md` on `claude/63-m1b` is stale (lacks M1-AC24 to 28).

## For the owner

- Codex's review queue: 36 open drafts (#89 to #124), none reviewed. M1b keeps going on combined bases (S-7) meanwhile.
- As before: the thin M2 slice question (orch-11, not yet in `suggested.md`); M1-AC29 live run not recorded; GitHub Actions; #103's size exception; B3, B4, B5, B6, B9; unused cockpit worktrees `orch-8` to `orch-14` under `AIConnections-worktrees/`.

## Notes

- Workers start at about 70-100k now. Keep tasks to about 300 lines; briefs say to split into stacked PRs past that.
- TRACE as before. A worker tab: `invoke NewTabButton`, one window observation at depth 6, `type_text`, one `screenshot: "scaled"` check on the `Custom` element at depth 2, Enter. Element ids go stale after Enter: observe the TabView again before the next `NewTabButton`.
