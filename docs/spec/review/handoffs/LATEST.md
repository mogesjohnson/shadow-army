# Handoff: orchestrator 69 (`2645e321`) to orchestrator 70 (2026-11-28 ~04:15 UTC)

This file is self-contained: do not read older handoffs.

## The owner's orders in force

- **The owner runs Codex** ("i will make sure to have codex run you dont do it anymore"). Orchs write the review file and tell the owner it is ready; no Codex tabs. Every review file carries the verbatim **Review bar** paragraph (`.shadow/v2-tools/tasks/codex-fix-common.md`, "Fewer Codex rounds"). Workers fix the class module-wide and self-review by 110k.
- **Claude reviews when Codex is out:** a fresh Claude reviewer (not the author; Opus medium) runs the same review file. Merging on a Claude-only approval still needs the owner's yes (asked, no answer).
- Weekly limit reset (owner, 2026-11-27 ~22:00 UTC). Keep at most two workers (RAM). Tabs: launcher `.ps1` in `.shadow/v2-tools/tasks/launch/` + `wt.exe -w 0 new-tab -p "Windows PowerShell" --title <name> powershell -NoExit -ExecutionPolicy Bypass -File <ps1>` from the PowerShell tool after clearing `Env:CLAUDE*`.
- Merge bottom-first on Codex approval at the exact head, from your own Bash (`gh pr ready`, `gh pr merge <n> --merge --match-head-commit <sha>`).
- **All GitHub workflows are disabled manually** (CI, mac probes, PR format): CI is `blocked` on every PR. Re-enabling is the owner's call; told the owner.

## The fix loop (all draft, mergeable, base `main`; no file overlap)

| PR | Head | Codex | Worker | Brief | Review file |
|---|---|---|---|---|---|
| #117 trace | `c6e421f` (review 142 C30-C34 fixed) | waits for file **144** | none | `tasks/w252-fix117.md` | 144 ready, told |
| #116 logs | `ed06929` (review 141 C32 fixed) | waits for file **145** | none | `tasks/w253-fix116.md` | 145 ready, told |
| #106 hold | `1fb2b17` on GitHub | review 143: C31-C40, ten P1 | **w255-fix106 `ca41540b` running** (worktree `w242-fix106`, local branch `w254-fix106-wip` from WIP `440471c`) | `tasks/w255-fix106.md` (plan: `w254-fix106.md` `## Left`; repros `review-143-body.md`) | 146 |

Next free review file: **147**. #106 is round five: w254 replaced the mechanism with one serial queue (`src/v2/git/serial.ts`) per state file; w255 finishes hold.ts, pushes, adds the C31-C40 tests. It will likely stop at 150k before the self-review, replies and file 146: launch a successor from its `## Left` (Opus high). If round six repeats on interleavings, suggest to the owner splitting #106 (hold state machine vs process identity).

Workers' SendMessage reaches the orch fine this session. Verify with `git diff --stat <old>..origin/<branch>` before closing a tab. Fresh workers sit at ~90-130k within minutes of launch, so the 150k stop leaves ~30-50k of work; brief small steps that commit as they go. The owner was told and asked whether to raise the worker limit; no answer yet.

## Decisions taken (the owner may overrule)

- VER-7 credits test titles only (spec `6eb55b9` on the review branch; both spec checkers 0 problems). Rule 9 reads each test's own title from `vitest list --json`.
- #106: fourth round (round five now: one serial queue) on hold durability, so w249's brief replaces the mechanism: the state file is a write-ahead record (in-flight inspection or pending hold saved before scan/spawn/release; memory never ahead of disk; gates re-checked after each await). C30: register Git's PID and OS start stamp before it runs.
- #117 C27: system tools by absolute path, bounded teardown, verified exit, explicit failure otherwise (third round on teardown).
- #116 C28 stays a P2 build note (Codex agreed under the review bar).

## Next, after #106, #116, #117 merge

1. Sync: the ten `claude/63-m1b-base-*` are ~180 commits behind main; guardian, mod-sweep, mod-trust, po-chain, po-chain2, po-trust, watch conflict. #144 conflicts with `claude/63-m1b-claude-list`. #75, #87, #98, #100 conflict with main.
2. Stacks: #125 -> #127, #129 -> #132; #126 -> #130; #135 -> #138 -> #144; #136 -> #137; #139 -> #140, #141. Singles: #128, #131, #133, #134, #142, #143. Paused: `tasks/w192-fix138.md`, `tasks/w194-fix141.md`.
3. Paused until M1 merges: Ink lane #145-#151. 37 PRs open. After M1: M2-M7 (spec section 6).

## Lessons

- Repeat findings on one class: replace the mechanism (tool output over hand parsing; write-ahead state over patched cases) or state the class rule; never patch one more case.
- Codex took ~3 hours to run after the files were ready; quiet ticks cost context. At about 80 minutes, offer the owner Claude reviews once.
- Codex ran ~2 hours after files 141-143 were ready; offering Claude reviews once at 80 minutes got no answer.
