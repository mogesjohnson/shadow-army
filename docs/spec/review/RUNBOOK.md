# Runbook: orchestrators and workers (issue #63)

When the owner says "look at second brain and start (or continue) work", or launches `orch-<n>`, follow this file. **Speed is urgent.**

The spec-review-era sections (old 1 to 4: forks, rounds, the 120k rule) were removed on 2026-11-25 to cut startup context. Read them with `git show 013be2e:docs/spec/review/RUNBOOK.md` only if a task needs them.

## 0. The model (the owner, 2026-11-23)

The orchestrator (`orch-<n>`) opens one terminal tab per task. Each worker (`w<n>-<task>`) does one task, reports, and the orchestrator closes its tab. The orchestrator decides; the owner goes with its suggestions. Big changes and architecture questions go in `suggested.md`.

### 0.1 Every session

1. **Hi timer (mandatory).** First, run `sleep 3000` in the Bash tool with `run_in_background: true`. When it ends, reply `hi` and start it again, until your tab closes.
2. **Name your task** in the cockpit's task file, as its prompt hook asks.
3. **Context:** read your line in `~/.claude/cockpit/current-context/<session id>.txt`; never estimate. Workers stop at 150k, the orchestrator at 175k.
4. **Git:** `git fetch origin` first; `git pull --rebase=merges origin <branch>` before every push; never force-push, `--no-verify` or `git add -A`. CLAUDE.md's rules apply (V6 sizes, `#63` subjects, the trailer).
5. **Read only what your task needs.** Every line you read stays in your context: read files in parts, diffs by path, and long tool output through `head` or `cut`.

### 0.2 The orchestrator

**It coordinates and does no task work:** plans tasks, writes briefs, launches and closes workers, checks results, and keeps the records (`handoffs/LATEST.md`, both short `STATE.md` files, `suggested.md`, the second-brain handoff).

**Start.** Read `handoffs/LATEST.md` only. It is self-contained: do not read older handoffs, `STATE.md`, `NEXT-SESSION.md`, `PLAYBOOK.md` or the flow file unless a task needs them. Start the hi timer and a `sleep 300` watch timer. Close the previous orchestrator's tab once the cockpit marks it parked. SendMessage each running worker your name.

**Tasks and briefs.**
- A task is about 70k of work with a list of the files it may change. Two live workers never share a file; overlapping tasks run in order. At most three workers at once. No new worker while the cockpit's 5-hour figure is 80% or more.
- The brief goes in `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tasks/<name>.md`: the task, its files and the files it must not touch, branch and base, model and effort, what done means, and the orchestrator's name. Codex-fix briefs point at `codex-fix-common.md` beside them.
- **Model and effort:** Opus medium for concurrency, security stores, process termination and design; Sonnet high for safety code (redaction, filters); Sonnet medium for ordinary modules; Haiku low for mechanical edits.
- **Lead the prompt with the task**, not "You are worker": the cockpit's duplicate-task stop compares prompts.

**Launch** from the PowerShell tool (cheapest; no `;` inside the prompt):

```
Get-ChildItem Env:CLAUDE* | ForEach-Object { Remove-Item "Env:$($_.Name)" }; $env:NO_COLOR=1; wt.exe -w 0 new-tab -d C:\Users\johns\projects\AIConnections claude -n <name> --model <opus|sonnet|haiku> --effort <low|medium|high> "<Task in a few words, with its files>. Your name is <name>. Your brief is C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tasks/<name>.md. Work under sections 0.1 and 0.3 of C:/Users/johns/projects/AIConnections-worktrees/review/docs/spec/review/RUNBOOK.md. Report to orch-<n>."
```

For an orchestrator, replace `$env:NO_COLOR=1;` with `Remove-Item Env:NO_COLOR;` so it starts in colour. The TRACE + button route (orch-10's recipe in the old runbook) also works, at more context.

**Watch every 5 minutes.** When `sleep 300` ends:
1. `python C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tools/check_workers.py <your session id prefix>`: one line per worker (state, context, idle minutes, last words). Remind a busy worker at 145k.
2. **Codex check (the owner, 2026-11-25):** `bash C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tools/codex_tick.sh <last tick ISO>` prints new reviews and comments on the open PRs and #63.
3. A stopped worker that has not reported: a usage limit resumes by its hi timer; a cockpit hold means re-plan; anything else, fix the cause, close it and launch a fresh worker on what is left.
4. Start the timer again. With nothing to do, end the turn at once (a quiet tick costs about 1.5k).

**Close a worker** once its report is in and `git show --stat <sha>` matches: open a TRACE session on the WindowsTerminal window, observe with `rootElementId: "TabView"`, `accessibilityDepth: 3`, `interactiveOnly: true`, `screenshot: "none"`, `invoke` the `Close Tab` button under the worker's tab (`returnObservation: "none"` between closes), check it is gone, close the session.

**Decide.** The owner pre-approved the orchestrator's recommendations (2026-11-23). Go ahead when the step can be undone and stays inside the repository. Wait for the owner on: installing software, a merge without Codex's approval at the exact head, deleting branches or worktrees, closing issues, publishing, changing the owner's settings, and any `full`-autonomy soldier run.

**Cockpit holds** (same-file guard, duplicate-task stop) are the owner's controls. Never lift one by typing into a tab; close one of the two workers and run the tasks in order.

**Merge** with merge commits only (V13), after retargeting the PRs stacked on the branch (V14), and only with Codex's approval at the exact head.

**At 175k (the save point):**
1. Commit and push the records.
2. Rewrite `handoffs/LATEST.md` (git keeps the old one). Keep it **self-contained and under 5 KB**: range SHAs, running workers (name, session id, task, files), the queues with their briefs, Codex's review status, owner's instructions still in force, and lessons that change what to do. Nothing the next orchestrator will not act on.
3. Update both `STATE.md` files: each is a **short current state (under 3 KB)**, not a log.
4. Second brain: one short capture (`--agent claude-code`, `--supersedes <previous handoff id>`): two or three sentences, then `Next: docs/spec/review/handoffs/LATEST.md at <sha>`. Archive any note in the brief that is outdated.
5. Launch `orch-<n+1>` as above, with this prompt:
   `You are orchestrator <n+1> for Shadow Army. Follow section 0 of C:/Users/johns/projects/AIConnections-worktrees/review/docs/spec/review/RUNBOOK.md, then handoffs/LATEST.md there. Workers stop at 150k and you hand off at 175k. First start your hi timer and the 5-minute watch, then close the tab of orch-<n> once the cockpit marks it parked.`
6. Until it closes your tab, check it every 5 minutes: with TRACE, click its tab and take one `screenshot: "scaled"`. If the cockpit's block dialog shows, pick "Take over now" and press `Enter`. Keep each check short and end the turn at once (the cockpit counts you parked only between turns). Pass any report that reaches you on to it.

### 0.3 A worker

- **One task:** the one in its brief, in the branch or worktree it names, touching only its files. If the cockpit holds an edit or flags an overlap, stop and report it.
- **Done:** commit and push; SendMessage the orchestrator one line, `<PR>:<sha> <files> <one line>`; then wait with the hi timer running until your tab is closed. Take no second task.
- **At 150k:** commit and push what is done, write what is left at the end of your brief under `## Left`, report that, and wait.
- **Subagents** only as the brief allows.
