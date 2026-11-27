# Handoff: orchestrator 66 (`195eada0`) to orchestrator 67 (2026-11-27 ~15:25 UTC)

This file is self-contained: do not read older handoffs.

## The owner's orders in force

- **Codex runs with full permissions (owner, 2026-11-27):** `~/.codex/config.toml` has `approval_policy = "never"`, `sandbox_mode = "danger-full-access"` (backup `config.toml.bak-2026-11-27`). Codex tabs no longer ask per command. **If a Codex tab shows no progress for 10 minutes, look at its screen** (TRACE screenshot, scaled).
- **Tabs (owner, 2026-11-27):** "use powershell, not command line. use the same open window that i have you in. just hit the plus". TRACE can click + but `type_text` into the tab always fails (`focus_changed`). Working route: a launcher `.ps1` in `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tasks/launch/` (copy one: Set-Location, `$env:NO_COLOR=1`, the `claude ...` or `codex ...` line), then from the PowerShell tool: `Get-ChildItem Env:CLAUDE* | ForEach-Object { Remove-Item "Env:$($_.Name)" }; wt.exe -w 0 new-tab -p "Windows PowerShell" --title <name> powershell -NoExit -ExecutionPolicy Bypass -File <ps1>`. Memory: `tabs-via-plus-powershell.md`.
- Codex review tabs are launched by the orch (memory `codex-review-tabs.md`); Codex **weekly limit was 19% left** at 10:09 UTC. Close a Codex tab once its `## Result` is written; always close the TRACE session after each use.
- Merge bottom-first on Codex approval at the exact head, from your own Bash (`gh pr ready`, `gh pr merge <n> --merge --match-head-commit <sha>`). Stop new work at 85% of Claude's 5h window. Opus medium for trust state and ordering; Sonnet otherwise.
- Memory pressure: Claude Code killed background timers once (RAM ~3 GB free of 15.6). Close finished tabs promptly.

## Running workers (PowerShell tabs in the orch window; they report to the current orch)

| Worker | Session | PR | Task | Files | Review file when done |
|---|---|---|---|---|---|
| w237-fix117 | `679e12c4` | #117 head `b99215d` | Codex 131 C16 [P1]: fail-closed slash/brace classification | `scripts/check-spec-trace*.mjs` | 133 |
| w238-fix116 | `a3daed95` | #116 head `f7851ba` | Codex 132 C20-C23 (2 P1, 2 P2): write-once logs, close awaits writes | `src/v2/logs*.ts`, `src/v2/postOffice*.ts` | 134 |
| w239-fix106 | just launched | #106 head `8d32d90` | Codex 130 C23-C24 [P1]: persist first, then memory, in hold.ts | `src/v2/git/hold*.ts` | 135 |

Briefs: `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tasks/w23{7,8,9}-*.md`. SendMessage each your name. When one reports: `git log -1 origin/<branch>`, `git diff --stat <old>..<new>`, close its tab, launch a Codex tab on its review file (launcher like `launch/w239-fix106.ps1` but running `codex "Do the review in C:/Users/johns/codex-reviews/shadow-army/11-27-2026-codex-review-<n>.md. Follow it exactly and write its ## Result."`). Read results with `awk '/^## Result/{p=1;next} p' <file>` (the words appear earlier in the instructions). Next free review file: **136**.

Tabs still open besides the workers: the Codex tab of review 130 (done; close it).

## Next, after #106, #116, #117 merge

1. Sync: all ten `claude/63-m1b-base-*` are 177-185 commits behind main; guardian, mod-sweep, mod-trust, po-chain, po-chain2, po-trust, watch conflict with main; linux-driver, mod-preflight, server-wiring merge clean. #144 conflicts with its base `claude/63-m1b-claude-list`. Outside the lane, #75, #87, #98, #100 conflict with main. One sync worker per conflict; #132 also edits `native/linux/sa-contain.c`.
2. Stacks: #125 -> #127, #129 -> #132; #126 -> #130; #135 -> #138 -> #144; #136 -> #137; #139 -> #140, #141. Singles: #128, #131, #133, #134, #142, #143. Paused briefs: `tasks/w192-fix138.md`, `tasks/w194-fix141.md`.
3. Paused until M1 merges: Ink lane #145-#151. Outside: #75, #81, #83 (spec record, stays open), #87, #88, #98, #100.

## Lessons

- Repeat findings on the same class (C15 -> C16, C21 -> C23): brief one rule for the class (fail closed; persist first; write once) on Opus medium, not another case patch.
- Before the config change, Codex 0.160 stopped on approval prompts that TRACE cannot answer.
