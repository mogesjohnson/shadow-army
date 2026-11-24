# Handoff: orchestrator 8 (`b1e83e65`) to orchestrator 9 (2026-11-23)

Range on this branch: `18b2395..` this commit. Only this file changed.

orch-8 waited out the 5-hour limit, which rose from 94% to 99% between 18:10 and 20:00. It launched no worker before the 20:00 reset.

**State.**
- **M1b:** it runs on `claude/63-m1b` (S-5).
  - w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md`, in the main checkout. Its section 2 gives the order, and each task's row gives that task's files.
- **Done before orch-8, not merged yet:** both PRs wait for Codex's approval at their heads.
  - #105, M1b-2 (the seam), head `129c211`.
  - #106, M1b-6 (harness git), head `30069d8`.
- **Blocked: w22-linux-helper** (M1b-1, Opus) sits at its own AskUserQuestion about V6.
  - It has been there since before 18:10, at 135k, and has pushed nothing. TRACE's screenshot at 18:20 shows the dialog.
  - Its work is built and checked on both systems, and committed locally only.
  - Two messages wait behind the dialog: orch-7's "option 3", and orch-8's "report to orch-8, option 3 stands".
  - **The owner must press 3 or Esc in its tab.** TRACE can't type into Windows Terminal.
  - After that, w22 pushes two PRs into `claude/63-m1b`:
    - PR 1: `native/linux/sa-contain.c`, in two commits of 200 lines or fewer each.
    - PR 2: `scripts/build-native.mjs`, its test and `package.json`, stacked on PR 1.
  - w22 reports to orch-8. **Send it "report to orch-9 instead".**
- **Running since 20:01, both launched by orch-8 and reporting to orch-8.** Tell each one "report to orch-9 instead".
  - **w24-s7-spike** (M1b-13, Opus). Brief: `.shadow/v2-tools/tasks/w24-s7-spike.md`. Files: `.github/workflows/spike-s7.yml` and `spike/s7/**`, on branch `spike/s7` only, with no PR. Its report goes to `w24-s7-spike-report.md` and a comment on #63.
  - **w25-lease** (M1b-3, Sonnet). Brief: `.shadow/v2-tools/tasks/w25-lease.md`. Files: `src/v2/lease.ts`, `lease.test.ts`, `server.ts` and `server.test.ts`. It opens a draft PR into `claude/63-m1b`.
- **Brief ready, not launched:** `w26-claude-faults.md` (M1b-11, Sonnet).
  - Files: `src/v2/claude.ts`, `claude.test.ts`, `test/fakes/claude.mjs`.
  - It waits for a free slot (at most three workers at once).
  - Change its "Report to" lines to orch-9 before launching it.

## Next

1. Take each worker's report. Check it with `git show --stat`, its Size line and its base. Then close its tab.
2. As slots free up, launch in this order:
   - w26.
   - M1b-14 (mod renewals). It needs M1b-3's lease routes, so start it after w25.
   - Then 4, 5, 7, 8, 9, 10 and 12, in w20's order.

   Model each brief on `w25-lease.md`: base `origin/claude/63-m1b`, WSL clone `~/ci/w<n>` with `export PATH=$HOME/.local/node/bin:$PATH`, and a draft PR into `claude/63-m1b`.
3. Wave 2 still waits for unmerged code. Stack it per S-5, or wait for Codex.
   - M1b-15 needs 1 and 2.
   - M1b-16 and M1b-20 need 2.
   - M1b-24 and M1b-25 need 6.
4. When w24's S7 report is in, turn its PO-14, PO-16, PO-18 and PO-19 lines into one spec task on this branch. Send any **owner** finding to the owner.

## For the owner

- w22's dialog: press 3 or Esc in its tab.
- Still open from orch-7:
  - #103's size exception.
  - B9: the final `claude/63-m1b` → `main` PR needs a V6 size exception.
  - B6: esbuild as a devDependency.
  - B4: claude recordings.
  - B5: the live ACs.
- The cockpit made a worktree, `AIConnections-worktrees/orch-8-m1b-coordination`, and orch-8 didn't use it. Removing it needs the owner's yes.

## Notes

- An orchestrator at xhigh starts at about 80k of context. Each 5-minute watch cycle adds about 1k, so a long wait for the 5-hour reset costs about 30k.
- Previous handoff: `git show 18b2395:docs/spec/review/handoffs/LATEST.md`.
