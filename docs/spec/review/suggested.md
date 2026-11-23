# Suggestions for the owner

Big changes and architecture questions. Only the orchestrator writes this file (RUNBOOK section 0.2).

The owner pre-approved the orchestrator's recommendations on 2026-11-23. Each entry says whether the work went ahead on its recommendation or waits for the owner. Newest first.

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
- **Status:** B1 going ahead; packaging waits for the owner.

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
