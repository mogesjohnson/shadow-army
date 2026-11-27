# Handoff: orchestrator 67 (`facc5354`) to orchestrator 68 (2026-11-27 ~16:55 UTC)

This file is self-contained: do not read older handoffs.

## Why it stopped

Claude's weekly limit was at **1%** (owner, 16:50 UTC). The owner stopped all workers and is restarting the computer. **Start no worker until the weekly limit has reset**; check the cockpit line first.

## The owner's orders in force (2026-11-27)

- **The owner runs Codex now:** "i will make sure to have codex run you dont do it anymore". Orchs write the review file and tell the owner it is ready; no Codex tabs.
- **Fewer Codex rounds** ("fix 1 then so we have less codex reviews"): `.shadow/v2-tools/tasks/codex-fix-common.md`, section "Fewer Codex rounds". Every review file carries the verbatim **Review bar** paragraph (block only on supported-path defects against spec/AC/class rule with a repro; unnamed threats are P2 build notes; all blockers in one round). Workers fix the class module-wide and self-review as Codex would, starting by 110k.
- **Claude reviews when Codex is out** ("can we also do our own reviews if codex is not avaivble"): a fresh Claude reviewer (never the author; Opus medium, high for trust code) runs the same review file, posts "Claude review" C items and the `## Result`. Merging on a Claude-only approval still needs the owner's yes; the owner was asked and has not answered.
- Tabs: launcher `.ps1` in `.shadow/v2-tools/tasks/launch/` + `wt.exe -w 0 new-tab -p "Windows PowerShell" --title <name> powershell -NoExit -ExecutionPolicy Bypass -File <ps1>` from the PowerShell tool, after clearing `Env:CLAUDE*`.
- Merge bottom-first on approval at the exact head, from your own Bash. Opus medium for trust state; Sonnet otherwise.
- Memory pressure: Claude Code killed orch-67's background timers (RAM under 1 GB free). Keep at most two workers; close tabs promptly. If timers are killed, do not restart them unasked; act on worker messages.

## The three PRs in the fix loop (all draft, mergeable, base `main`)

| PR | Head before | Last review | Open findings | Worker (stopped) | Brief | Review file when done |
|---|---|---|---|---|---|---|
| #106 hold | `f949e6b` -> pushed `6991ebf` (C25-C26 fixed; no self-review, replies, body refresh or file 138 yet) | 135 | C25-C26 (P1) | w242-fix106 `3ac03d4d` | `tasks/w242-fix106.md` | 138 |
| #116 logs | `9e7d54d` -> pushed `6b28a18` (C27 fixed+test; C29 fixed, no test; C28 prep moved, rest P2 note; no self-review, replies or file 139 yet) | 136 | C27-C29 (P1) | w243-fix116 `f2e52368` | `tasks/w243-fix116.md` | 139 |
| #117 trace | `26d1d35` | 137 | C22-C25 (P1) | not launched | `tasks/w244-fix117.md` + `launch/w244-fix117.ps1` | 140 |

w242 and w243 were told to push only passing work and write `## Left` in their briefs. **First:** `git log -1 origin/<branch>` for each, read each brief's `## Left`, and relaunch fresh workers on what is left (same brief; their worktrees `AIConnections-worktrees/w242-fix106` and `w243-fix116` were pushed (6991ebf, 6b28a18): check for leftovers). Then launch w244. Next free review file: **141**.

Decisions taken by orch-67 (the owner may overrule): #117 rule 9 reads titles from `vitest list --json --staticParse=false` (lexer removed, 26d1d35); VER-7 will credit test titles only (w244 edits that spec line). #116 C28 (file replaced mid-call) may be a P2 build note under the review bar.

## Next, after #106, #116, #117 merge

1. Sync: the ten `claude/63-m1b-base-*` are ~180 commits behind main; guardian, mod-sweep, mod-trust, po-chain, po-chain2, po-trust, watch conflict. #144 conflicts with `claude/63-m1b-claude-list`. #75, #87, #98, #100 conflict with main.
2. Stacks: #125 -> #127, #129 -> #132; #126 -> #130; #135 -> #138 -> #144; #136 -> #137; #139 -> #140, #141. Singles: #128, #131, #133, #134, #142, #143. Paused: `tasks/w192-fix138.md`, `tasks/w194-fix141.md`.
3. Paused until M1 merges: Ink lane #145-#151. 37 PRs open in all. After M1: M2-M7 (spec section 6).

## Lessons

- Repeat findings on one class: replace the mechanism (tool output over hand parsing) or state the class rule; never patch one more case.
- A worker at 150k with an unread self-review pushed anyway, and Codex found five more P1s. Self-review starts by 110k.
