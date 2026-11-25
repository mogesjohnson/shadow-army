# Handoff: orchestrator 29 (`16f5839e`) to orchestrator 30 (2026-11-25)

Range: `7dd7f34` (orch-28's handoff) and this commit. orch-28's handoff (`git show 7dd7f34:docs/spec/review/handoffs/LATEST.md`) still holds where not done below. orch-29 ran 23:08 to 00:35 UTC, started at 68k and made this save point at about 165k (an AskUserQuestion waited 70 minutes; TRACE launches cost about 8k each). **orch-29's tab still shows the title "orch-28"** (the owner reused orch-28's tab), so workers saw no "orch-29" in ListAgents. Close that tab once orch-29 is parked.

**Done.**
- **w71** (#106, Codex review 5): `75b28fa` pushed (`harness.ts`, `harness.test.ts`, `test/fakes/git-hang.mjs`, +122/-39). C1-C4 fixed fail-first, C5 build note, C6 body. Windows 9 + 1 skip, Linux 10/10. Tab closed.
- **w74** (M1b-28 part B): draft **#143** at `b3f66e9` (+302/-18, 4 files) on `claude/63-m1b-base-po-trust`. Tab closed. Its report never arrived (could not find orch-29); check its AC comment.
- **Owner, 2026-11-24:** #106 size "Yes, approve"; then for all fix rounds: **"for now all the commits that are beyond are ok, since we are making changes"**. Workers no longer ask about V6; they record it (`.shadow/v2-tools/tasks/codex-fix-common.md`, Size).
- `codex-reviews/11-24-2026-codex-review-13.md` written (re-review of the fixed heads #95, #90-#94, #96, #97, #99, #101, #103, #109, #110, and new #141, #142; #106, #120, #121, #143 if changed) and added to that README. Not yet given to Codex.
- **Codex reviews 6, 7, 8** posted (23:14, 23:26, 23:53 UTC on #63). Approved: **#112** at `e275b51`, **#118** at `2f6f66b`. Changes requested: #107, #108, #113, #126 (2 P0), #130 | #111, #124, #116 (3 P0), #114 | #115, #119, #117.

**Running** (Opus medium, both launched 00:30 UTC): **w72-fix120** (`src/v2/snapshot.ts`, its test, worktree `w36-snapshots`) and **w73-fix121** (`src/v2/git/hold.ts`, its test, `hostileRepo.testutil.ts`, `w37-git-hold`). They merge #106's `75b28fa` first. Briefs in `.shadow/v2-tools/tasks/`.

## Next

Memory is low (Claude Code stopped w71's hi timer for low memory): keep two workers at once.

1. When w72 and w73 report, verify (`git show --stat`), close their tabs, give the owner Codex batch 13's start line.
2. **Briefs for reviews 6-8**, each a short file naming PRs, worktree, files, model, and pointing to `codex-fix-common.md` for the rest. Planned grouping (one worker per line; server.ts lines run one after the other):
   - w75-fix107-108: #107 (`lease.ts`, `lease.test.ts`, `server.ts`, `server.test.ts`; `w25-lease`) then #108 (`plugins/shadow-army/hooks/register.ts` and test; `w30-mod-renewals-...`). Opus medium.
   - w76-fix126-130, after w75: #126 (`credential.ts`/test, `main.ts`, `server.ts`/test; `w42-server-wiring`), then #130 (`postOffice.ts`, `server.ts`/test, `docs/v2-m1a-live-run.md`; `w46-server-log`). Opus medium.
   - w77-fix111-124: #111 then #124 (`claude.ts`/test, `test/fakes/claude.mjs`, `test/fixtures/claude/README.md`; `w26-claude-faults`, `w39-claude-usage`). Opus medium.
   - w78-fix116 (`logs.ts`/test, `w29-logs-...`, 3 P0). Opus medium. w79-fix113 (`lock.ts`/test, `w27-lock`). Opus medium. w80-fix114 (`sanitize.ts`/test, `scripts/gen-sanitize.mjs`, `w33-sanitize-m1b-9`). Sonnet high. w81-fix115 (`trust.ts`/test, `w34-trust`). Opus medium. w82-fix119 (`roster.ts`, `instructions.ts` and tests, `w32-roster-...`; base #118). Sonnet medium. w83-fix117 (`scripts/check-spec-trace.mjs` and test, `w35-trace-check-...`). Sonnet medium.
3. Then the #90 WSL failure worker (orch-28's Next 2).
4. Update both `STATE.md` files (orch-29 did not) and watch Codex: `gh api 'repos/mogesjohnson/shadow-army/issues/63/comments?since=2026-11-25T00:00:00Z'`.

## For the owner

- **Merge the two approvals** (Codex approved each at its head; #119 is stacked on #118, so it moves first):
  `! gh pr ready 112 && gh pr merge 112 --merge --match-head-commit e275b51` (use the full SHA from `gh pr view 112 --json headRefOid`)
  `! gh pr edit 119 --base claude/63-m1b && gh pr ready 118 && gh pr merge 118 --merge --match-head-commit 2f6f66bf58486ecbd7e3526001bd53b4710c49d0`
- **#105** still waits (orch-28's command).
- **Codex batch 13:** `Do the task in C:/Users/johns/projects/AIConnections/codex-reviews/11-24-2026-codex-review-13.md`.
