# Suggestions for the owner

Big changes and architecture questions. Only the orchestrator writes this file (RUNBOOK section 0.2).

The owner pre-approved the orchestrator's recommendations on 2026-11-23. Each entry says whether the work went ahead on its recommendation or waits for the owner. Newest first.

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
- **Status:** waiting for the owner. Until then the slice goes ahead: its policy parts are needed either way.
