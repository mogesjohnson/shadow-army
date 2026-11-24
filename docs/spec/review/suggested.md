# Suggestions for the owner

Big changes and architecture questions. Only the orchestrator writes this file (RUNBOOK section 0.2).

The owner pre-approved the orchestrator's recommendations on 2026-11-23. Each entry says whether the work went ahead on its recommendation or waits for the owner. Newest first.

## S-7 Combined bases for M1b tasks while Codex's queue waits (2026-11-24, orch-14)

Codex has reviewed none of the M1b PRs (#105 to #123), and every M1b task still to build needs two or more of them. M1b-15 needs #110 and #105; M1b-22 needs #107, #113 and #112.

- **Options:** A, wait until Codex merges the dependencies into `claude/63-m1b`; B, push a base branch per task, `claude/63-m1b-base-<task>`, that merges the dependency PRs' heads with merge commits, and open the task PR into it.
- **Recommendation: B.** Workers keep going while the review queue waits, and each task PR's diff stays its own work. When the dependencies merge, the task PR is retargeted to `claude/63-m1b` and its diff does not change. If Codex changes a dependency PR, its new head is merged into the base branch (merge commit, V13). The cost is rework if a dependency's API changes in review. Can be undone; deleting the base branches afterwards needs the owner's yes.
- **Status:** going ahead. `claude/63-m1b-base-linux-driver` (M1b-15, w41) and `claude/63-m1b-base-server-wiring` (M1b-22, w42).

## S-6 Two M1a stand-ins that M1b keeps (2026-11-23, orch-7)

From w20's plan (`.shadow/v2-tools/tasks/w20-m1b-plan-report.md`, blockers B1 and B2).

- **B1, `/send` opens a session.** WSP-11 says only `sa live` opens one in M1, but M1a's `/send` does. Options: A, remove it in M1b (the prototype loses it until M3's HOST-10); B, keep it as a listed stand-in until HOST-10. **Recommendation: B.** Prototype first (D-39): the owner's live run drives the slice through `/send`. Tasks M1b-28 and M1b-29 keep the path and name it a stand-in. Can be undone.
- **B2, the write path.** M1a's write path (v1 worktree, claims, apply) stands in for WSP-1 and WSP-2, which are M6; no M1 requirement replaces it. **Recommendation:** keep it, with its git calls moved onto harness git in M1b-26. Can be undone.
- **Status:** going ahead on both.

## S-5 Where M1b's branches start and land (2026-11-23, orch-7)

M1a is 16 unmerged draft PRs (#89 to #104), and its run branch `claude/63-m1a-integrate` has no PR.

- **Options:** A, base M1b on `main` (waits for 16 unreviewed PRs); B, stack on single M1a PRs (16 bases and V14 retarget churn); C, target `claude/63-m1a-integrate` (mixes M1b into the owner's live-run head); D, a new integration branch.
- **Recommendation: D.** `claude/63-m1b`, cut from `claude/63-m1a-integrate` at `2b78df6`. Each task branches from it, and its draft PR targets it. The orchestrator merges a task PR into it with a merge commit only once Codex approves it at its head (RUNBOOK 0.2). Until then, a task that needs an unmerged one branches from that task's branch, and its PR is based there (V14, as M1a's stacks were); a task that needs two takes the second by a merge commit and names it in `Tracking:`. Codex fixes to M1a land on their M1a PRs, then reach M1b by merging `claude/63-m1a-integrate` into `claude/63-m1b`, never by rebase. Codex reviews each task PR on its own diff. M1b reaches `main` through one merge-only PR, `claude/63-m1b` → `main`, after M1a merges. That PR is far over V6 and needs the owner's `Size exception` before it opens (w20's B9).
- **Can be undone:** yes, it is one branch.
- **Status:** going ahead. `claude/63-m1b` was pushed at `2b78df6`. Wave 1 started: w21 (M1b-2), w22 (M1b-1), w23 (M1b-6).

## S-3 How #75's ported code reaches review (2026-11-23, orch-1)

- **Question:** T4 (`.shadow/v2-tools/tasks/T4-report.md`) found the slice can keep most of #75's code: the post office, the claude channel, the server, the client, the lease and the logs, at 92 to 100% line coverage. That base is about 3,300 lines without tests. V6 allows 400 lines per PR. How should it reach Codex?
- **Options:**
  - A: one PR for the base, with a V6 size exception in the owner's words. The code was already written and reviewed on #75.
  - B: a stack of PRs of at most 400 lines each, about 12 to 15 of them.
- **Recommended:** A. It is a port of reviewed code, a stack of 15 adds PR overhead without making review easier, and Codex can review it against #75. It needs the owner's words (CLAUDE.md, V6), so it **waits for the owner**.
- **Meanwhile:** worker `w4-port-transport` (task B1) ports the base on `claude/63-m1a-transport` from `main` in commits of V6 size and opens no PR. Either option can be cut from those commits afterwards.
- **Also decided (can be undone, inside the repository):**
  - CI keeps all three operating systems. Windows-only containment tests skip elsewhere with a "Not tested" note (D-34). The 85% coverage threshold is not lowered. A file is excluded only if it runs only as a subprocess, with a reason in the config.
  - The Linux and macOS containment helper (`native/process-supervisor.c`) is left out of M1a.
  - #75's roster edits (T4's B6) stay out of the slice.
- **Risk:** if S-1's T3 Code trial passes, B1 and the mod (B2) become throwaway; B3 and B4 (claims, audit, guard, apply) do not. B1 is still the shortest way to a prototype the owner can watch.
- **B1's result:** 19 commits on `claude/63-m1a-transport` (head `2ab8925`), each within V6, 3,309 lines in 30 files. Locally on Windows: `tsc` passes, 457 tests pass and 4 skip, and line coverage is 91.51% with the threshold kept at 85. `processTree.ts` is now Windows-only, so it is excluded from coverage on Linux and macOS only; orch-1 accepted that.
- **CI is off:** the CI, PR format and mac probes workflows are all `disabled_manually` on GitHub, so CI and the PR-format check can't run, even by hand. Local runs are the only evidence until the owner turns them back on. Turning them on is the owner's call.
- **Status:** answered by the owner, 2026-11-23: "for B1 do whatever is easier (we dont want merge conflicts)". B1 is one draft PR, #95, under a V6 size exception in those words; the slice's stacks sit on its branch, so nothing has to be rebased.

## S-2 Who builds the M1 slice (2026-11-23, session 25)

- **Question:** who builds the slice? PR #75 is Codex's M1 draft:
  - paused since 2026-10-13 at `04ab953`;
  - CI red on coverage (68 to 73% against 85%);
  - written against spec v0.6.

  Codex works only when the owner runs it.
- **Options:**
  - A: Codex resumes #75, cut down to the slice.
  - B: Claude workers build the slice on a new branch from `main`, reusing #75's code where it fits, and Codex reviews the PRs.
  - C: both, split by files.
- **Recommended:** B. The work moves without waiting for Codex runs, and Codex stays the cross-model reviewer (CLAUDE.md). #75 stays open as a reference until Codex or the owner closes it.
- **Can be undone:** yes; it is a new branch.
- **Status:** going ahead with B after task T4 in `handoffs/LATEST.md`.

## S-1 Build on T3 Code instead of our own post office? (2026-11-23, session 25)

- **Question:** T3 Code (MIT, github.com/pingdotgg/t3code, about 74k stars, daily releases) may make our own post office unnecessary. The source audit is second-brain note `c6c9cf8e`.
  - **It already has:** live sessions for claude, codex, grok and agy, with stop, queue and steer; context meters; delegation across vendors; and an MCP server that a Claude Code session can drive.
  - **It lacks:** routing policy, the hard rules, claims, the claim audit, the checkout guard, throwaway snapshots and apply.
- **Options:**
  - A: keep building our post office.
  - B: a one-week trial, then decide. Install T3 Code, connect the Monarch over MCP, and run one real task. Measure the token cost: it injects about 12 KB of instructions and a 95-tool MCP server into every thread. Check Windows, where its own Windows test lane says nothing passes yet, and check agy.
  - C: pivot now to a thin policy layer on T3.
- **Recommended:** B. If T3 passes, Shadow Army becomes the policy layer (v1's router, claims, audit, guard and apply) and the post office stops. If it fails, the measured reasons sharpen our own design.
- **Can be undone:** yes. But installing T3 Code on this machine is outside the repository, so it **waits for the owner**.
- **Status:** declined by the owner, 2026-11-23: "s-1 we are not downlaoding t3". We build our own post office.

## S-4 Where the checks run (2026-11-23, the owner)

- **Decision (the owner):** "we will only do Local CI windows is all we are working for, forget mac, if linux tests if you can create the ci iniside of wsl and then run in that enviroment do that".
- **What follows:** GitHub's workflows stay off. `w10-local-ci` builds `npm run ci:local`: Windows, then Linux inside WSL Ubuntu. macOS is dropped, so the spec's "Not tested: macOS" notes stand. PR `Validation:` lines quote the script's output.
- **Status:** in progress (`w10-local-ci`).
