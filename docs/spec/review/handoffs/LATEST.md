# Handoff: orchestrator 68 (`90559323`) to orchestrator 69 (2026-11-28 ~01:50 UTC)

This file is self-contained: do not read older handoffs.

## The owner's orders in force

- **The owner runs Codex** ("i will make sure to have codex run you dont do it anymore"). Orchs write the review file and tell the owner it is ready; no Codex tabs. Every review file carries the verbatim **Review bar** paragraph (`.shadow/v2-tools/tasks/codex-fix-common.md`, "Fewer Codex rounds"). Workers fix the class module-wide and self-review by 110k.
- **Claude reviews when Codex is out:** a fresh Claude reviewer (not the author; Opus medium) runs the same review file. Merging on a Claude-only approval still needs the owner's yes (asked, no answer).
- Weekly limit reset (owner, 2026-11-27 ~22:00 UTC). Keep at most two workers (RAM). Tabs: launcher `.ps1` in `.shadow/v2-tools/tasks/launch/` + `wt.exe -w 0 new-tab -p "Windows PowerShell" --title <name> powershell -NoExit -ExecutionPolicy Bypass -File <ps1>` from the PowerShell tool after clearing `Env:CLAUDE*`.
- Merge bottom-first on Codex approval at the exact head, from your own Bash (`gh pr ready`, `gh pr merge <n> --merge --match-head-commit <sha>`).
- **All GitHub workflows are disabled manually** (CI, mac probes, PR format): CI is `blocked` on every PR. Re-enabling is the owner's call; told the owner.

## The fix loop (all draft, mergeable, base `main`; no file overlap)

| PR | Head | Codex | Worker | Brief | Next review file |
|---|---|---|---|---|---|
| #116 logs | `1d7e8b0` (C30-C31 of review 139 fixed) | waits for file **141** | done, tab closed | `tasks/w247-fix116.md` | 141 written |
| #117 trace | `3d86e92` | review 140: C26-C28 P1, C29 P2 | **w248-fix117 `7febf412` running** (worktree `w244-fix117`) | `tasks/w248-fix117.md` | 142 |
| #106 hold | `98b58c1` | review 138: C27-C30 P1 | **w249-fix106 running** (just launched; worktree `w242-fix106`) | `tasks/w249-fix106.md` | 143 |

Next free review file: **144**. Workers' SendMessage to the orch bounces while the orch is between turns: they write `## Report` at the end of their brief; read that and the worker's last words (`check_workers.py`) at each tick. Verify with `git diff --stat <old>..origin/<branch>` before closing a tab.

Tell the owner when 142 and 143 are ready (141 is ready now; told).

## Decisions taken (the owner may overrule)

- VER-7 credits test titles only (spec `6eb55b9` on the review branch; both spec checkers 0 problems). Rule 9 reads each test's own title from `vitest list --json`.
- #106: fourth round on hold durability, so w249's brief replaces the mechanism: the state file is a write-ahead record (in-flight inspection or pending hold saved before scan/spawn/release; memory never ahead of disk; gates re-checked after each await). C30: register Git's PID and OS start stamp before it runs.
- #117 C27: system tools by absolute path, bounded teardown, verified exit, explicit failure otherwise (third round on teardown).
- #116 C28 stays a P2 build note (Codex agreed under the review bar).

## Next, after #106, #116, #117 merge

1. Sync: the ten `claude/63-m1b-base-*` are ~180 commits behind main; guardian, mod-sweep, mod-trust, po-chain, po-chain2, po-trust, watch conflict. #144 conflicts with `claude/63-m1b-claude-list`. #75, #87, #98, #100 conflict with main.
2. Stacks: #125 -> #127, #129 -> #132; #126 -> #130; #135 -> #138 -> #144; #136 -> #137; #139 -> #140, #141. Singles: #128, #131, #133, #134, #142, #143. Paused: `tasks/w192-fix138.md`, `tasks/w194-fix141.md`.
3. Paused until M1 merges: Ink lane #145-#151. 37 PRs open. After M1: M2-M7 (spec section 6).

## Lessons

- Repeat findings on one class: replace the mechanism (tool output over hand parsing; write-ahead state over patched cases) or state the class rule; never patch one more case.
- Codex took ~3 hours to run after the files were ready; quiet ticks cost context. At about 80 minutes, offer the owner Claude reviews once.
