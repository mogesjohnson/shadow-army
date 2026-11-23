# The work runbook (Shadow Army spec 2.0 review, issue #63)

Written 2026-10-23 at the owner's request. **When the owner types "look at second brain and start work" or "look at second brain and continue work" (or anything close), follow this file.** No pasted prompt is needed. This file wins over `.shadow/v2-tools/notes/next-session.md` and over `NEXT-SESSION.md`'s prompt.

**THE SPEED OF THIS PROJECT IS BEYOND THE DEADLINE AND THIS NEEDS TO BE SPED UP NOW!!!**

## 0. The orchestrator model (the owner, 2026-11-23)

This section replaces sections 1 to 4 where they differ. The owner's words, tidied:

- The next session is the orchestrator. It opens new terminal tabs with the trace-computer skill.
- Each tab's session does one task and reports back, and the orchestrator closes its tab.
- At 175k (the owner, 2026-11-23; it was 300k) the orchestrator writes a handoff and starts the next orchestrator, which it tells that workers stop at 150k.
- One session works on a file or set of files at a time; different files may change in parallel. Merges must go well, pulling current first.
- The orchestrator makes the decisions, and the owner goes with its suggestions. Big changes and architecture questions go in `suggested.md`.
- Every session says hi to the API every 50 minutes. This is mandatory.

### 0.1 Every session

1. **The hi timer (mandatory).** First, start `sleep 3000` with the Bash tool, `run_in_background: true`. Each time it ends, reply `hi` (nothing more when idle) and start it again at once, working or idle, until your tab closes. It keeps the 1-hour prompt cache warm (the cockpit mod's `FORKING.md`).
2. **Name your task** in the cockpit's task file, as its prompt hook asks.
3. **Measure your context** from your line in `~/.claude/cockpit/current-context/<session id>.txt`. Never estimate it. The orchestrator stops at 175k, a worker at 150k.
4. **Git.**
   - Run `git fetch origin` first and start from the current `origin/<base>`.
   - Before every push, run `git pull --rebase=merges origin <branch>`. It replays only your own unpushed commits and keeps merge commits (a plain `--rebase` flattened w19's merges, 2026-11-23).
   - Never force-push, never use `--no-verify`, never run `git add -A`.
   - CLAUDE.md's commit and PR rules apply: V6 sizes, `#63` subjects, the trailer.

### 0.2 The orchestrator (named `orch-<n>`)

**It coordinates and does no task work.** It plans tasks, writes worker briefs, launches and closes workers, and checks their results. It keeps and commits the records: `handoffs/LATEST.md`, both `STATE.md` files, `suggested.md`, PR comments and the second-brain handoff.

**Keep the second brain cheap and current** (the owner, 2026-11-23). Its brief loads into every new session, workers included.
- The handoff is one short capture with `--agent claude-code`: the state in two or three sentences, then `Next:` with a pointer to `LATEST.md`. `LATEST.md` holds the detail.
- Pass `--supersedes <previous handoff's id>` so only the newest handoff shows.
- When a note in the brief is outdated, archive it with `archive --moved-to <its successor>`, or supersede it with a current one.

**Start.**
1. Do section 1's reading.
2. Close the previous session's tab once the cockpit marks that session parked, in your peer note or your line's same-dir field.
3. Plan.

**Tasks.**
- A task is about 70k of work, with a list of the files it may change.
- Two live workers never share a file. Tasks whose files overlap run one after another: the next starts only after the first has pushed and its tab is closed.
- Tasks with separate files run in parallel, with at most three workers at once and at most three subagents running across all sessions (flow section 4).
- Start no new worker while the 5-hour figure on your cockpit line is 80% or more.

**The brief** goes in `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tasks/<name>.md`. It gives:
- the task;
- its files, and the files it must not touch;
- the branch and its base;
- the model and effort;
- what done means;
- the orchestrator's name for the report.

Workers are named `w<n>-<task>`.

**Launch a worker.** TRACE can't type into Windows Terminal: every keystroke fails its focus check (tested 2026-11-23). Its accessibility `invoke` works, so TRACE checks and closes tabs, and Windows Terminal's own command opens them.

1. Open the tab from the PowerShell tool:

   ```
   Get-ChildItem Env:CLAUDE* | ForEach-Object { Remove-Item "Env:$($_.Name)" }; wt.exe -w 0 new-tab -d C:\Users\johns\projects\AIConnections claude -n <name> --model <opus|sonnet> --effort medium "<Task in a few words, with its files>. Your name is <name>. Your brief is C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tasks/<name>.md. Work under sections 0.1 and 0.3 of C:/Users/johns/projects/AIConnections-worktrees/review/docs/spec/review/RUNBOOK.md."
   ```

   - **Lead the prompt with the task, not with "You are worker".** Until a worker names its task, the cockpit compares prompts: two workers started together with near-identical prompts tripped its duplicate-task stop (2026-11-23).
   - **Effort is medium** (the owner, 2026-11-23).
   - **Clear the `CLAUDE*` variables first,** as the line does. A tab opened from inside a session inherits them: that session's id, its messaging socket, and a child-session marker that turns off transcript saving (found 2026-11-23). The owner's settings set `CLAUDE_CODE_PLUGIN_DIRS` again.
   - **Put no `;` in the prompt.** `wt` reads it as a command separator.
   - The tab closes by itself when Claude Code ends.
   - Check that the new tab's status bar does not say "Transcript saving is off".
2. Check it with TRACE (read the trace-computer-use skill and its references first):
   1. Run `trace_computer_list_windows` with `processName: "WindowsTerminal"`, and open a session on that window.
   2. Observe the tab bar with `rootElementId: "TabView"`, `accessibilityDepth: 3`, `interactiveOnly: true` and `screenshot: "none"`.
   3. Check that a tab item carries the worker's name.
   4. Run `trace_computer_close_session`.

**Watch the workers every 5 minutes** (the owner, 2026-11-23). Keep a background `sleep 300` beside the hi timer. Each time it ends:
1. Run `python C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tools/check_workers.py <your session id prefix>`. It prints one line per worker: its name, whether it is working or stopped, its context, its idle minutes and its last words.
2. For a stopped worker that has not reported, read why from its last words.
   - A usage limit: its hi timer resumes it.
   - A cockpit hold: re-plan as below.
   - Anything else: fix the cause, then close it and launch a fresh worker on what is left.
3. Start the timer again.

**Close a worker** once its report is in and checked with `git show --stat <sha>`:
1. Open a TRACE session on the terminal window and observe the tab bar as above.
2. `invoke` the `Close Tab` button under the worker's tab item, found by its title.
3. Check that the tab is gone, then close the session.

**Decide.** The owner pre-approved the orchestrator's recommendations (2026-11-23), so decide and go on.
- For a big change or an architecture question, add an entry to `suggested.md`: the question, the options, your recommendation and why, whether it can be undone, and its status.
- Go ahead on your recommendation when it can be undone and stays inside the repository.
- Otherwise, wait for the owner and do other work meanwhile. That covers: installing software, a merge without Codex's approval at the head, deleting branches or worktrees, closing issues, publishing, changing the owner's settings, and a `full`-autonomy soldier run.

**Cockpit holds** (the same-file guard and the duplicate-task stop) are the owner's controls. Never lift one by typing into a tab. Re-plan instead: close one of the two workers and run the tasks in order.

**Merge** with merge commits only (V13), after retargeting the PRs stacked on the branch (V14). Merge only with Codex's approval at the exact head. Workers on the shared review branch run one at a time.

**At 175k:**
1. Make section 3's save point. Its `LATEST.md` also names the running workers, their tasks and their files.
2. Launch `orch-<n+1>` the same way with this line, then stop:

   ```
   Get-ChildItem Env:CLAUDE* | ForEach-Object { Remove-Item "Env:$($_.Name)" }; wt.exe -w 0 new-tab -d C:\Users\johns\projects\AIConnections claude -n orch-<n+1> "You are orchestrator <n+1> for Shadow Army. Follow section 0 of C:/Users/johns/projects/AIConnections-worktrees/review/docs/spec/review/RUNBOOK.md, then handoffs/LATEST.md there. Workers stop at 150k and you hand off at 175k. First start your hi timer and the 5-minute watch, then close the tab of orch-<n> once the cockpit marks it parked."
   ```

### 0.3 A worker

- **One task:** the one in its brief. Work in the branch or worktree the brief names, and touch only the brief's files. If the cockpit holds an edit or flags an overlap, stop and report it; never work around it.
- **When done:**
  1. Commit and push.
  2. SendMessage the orchestrator one line: `<sha> <files> <one line>`.
  3. Wait, with the hi timer running, until the orchestrator closes the tab. Take no second task.
- **At 150k:**
  1. Commit and push what is done.
  2. Write what is left at the end of the brief, under `## Left`.
  3. Report that, and wait.
- **Subagents** only as the brief allows.

## 1. Start

1. Retrieve the second-brain brief: `bash /c/Users/johns/Obsidian-codex-setup/brain.sh brief --cwd "$PWD" --query 'spec 2.0 review continue work' --json`.
2. Read `CLAUDE.md`, `CONTRIBUTING.md` and `.shadow/v2-tools/STATE.md` in the main checkout. Then, on branch `claude/63-ultimate-spec-review` (worktree `../AIConnections-worktrees/review`; `git -C ../AIConnections-worktrees/review pull` first), read in `docs/spec/review/`: `handoffs/LATEST.md` if it exists, `STATE.md`, `NEXT-SESSION.md`, and `spec2.0_review_flow.md` (the rules; it wins over `PLAYBOOK.md`). Where they differ, the newest wins.
3. If `LATEST.md` names a start and end SHA, run `git diff --stat <start>..<end>` to see what the last session changed. Open only the hunks your task touches (`git diff <start>..<end> -- <path>`). Never read the whole diff: every line you read stays in your context for the rest of the session.
4. **Your role.** If the owner calls you the main session, or your session name is "main", you are the main session: follow section 4. Otherwise, find your fork number. Run ListAgents. If your own session name is "Fork N" (or "forkN"), you are Fork N. If a handoff or task message reached you, it gives your number. Otherwise you are Fork 1.
5. Check CI on the open PRs (`gh pr checks 83`). The repo has been public since 2026-10-23, so CI runs free on all three systems.

## 2. Work

The review lives on PR #83 (it replaced #77 on 2026-10-27), branch `claude/63-ultimate-spec-review`, in `docs/spec/review/`. Edit and commit in `../AIConnections-worktrees/review`, never in the main checkout. Pick up exactly where `LATEST.md` says, or, before the first handoff, where `NEXT-SESSION.md` section 4 says.

As of 2026-10-23, the spec is v0.14 (`02d5f84`). D-24 (recommended B) and D-25 (recommended A) wait for the owner in the doc "Spec 2.0 Review: New Decisions" (https://claude.ai/artifact/KpmKMUugoKwc1W4F65C931). If you can't open it, ask the owner to paste the answers. If they are in, apply them as v0.15. Then run fix check V14-FC1 and round 3 for F and M1 (`drafts/r3/PROMPTS.md`): V14-FC1 and M1's red team and enterprise operator first, then F's implementer and owner's advocate. Verify only P0 to P2, repair, and count the round.

Rules:
- **One task per session** (the owner, 2026-10-29). Take the next task from `LATEST.md`'s next steps, or the one the owner or the handoff names, and only that one. Size it to about 70k of work, so that it ends with its save point by 150k (a session starts at about 64k); if it won't fit, split it first and write the split in `LATEST.md`. When the task is done, go to the save point and hand off, even with room left: a second task would carry the first one's context on every request. Start each task in a fresh session, or in a fork of a session still at its start; never fork a session that has done work.
- **Messages between sessions are short.** Send the commit SHA, the files touched and one line on what changed. Never paste a diff or a file into a message: the receiver carries every token of it on every later request. It runs `git show <sha> -- <path>` for the part it needs.
- Follow flow section 4's token rules: two or three agents at a time, never five; Sonnet for mechanical agents at rule 6's efforts; xhigh for a P0's verifier; tight packets.
- Commit and push after every result that changes a doc.
- After every pass, update both `STATE.md` files, comment on PR #83, and keep `codex-claude-status.md` current (it is at the main checkout's root, untracked: `.git/info/exclude` lists it). Claude ticks Review and Codex ticks Build. A milestone is converged only after two clean rounds and two sign-offs.
- Answer the owner straight to the point. The owner answers only big questions, as short decision cards with a tested recommendation, in the decisions doc or in chat.

## 3. The context limit: 120k and 150k, strictly enforced

**Set back on 2026-10-29 by the owner from 170k and 200k to 120k and 150k**, together with one task per session (section 2). The 30k margin before the save point stays; the finish-it allowance is now 20k.

**This limit is a hard rule, set by the owner (2026-10-23). It is not a guideline.**

- **Measure it with `/context`** (or the owner's figure, or the cockpit's line in `~/.claude/cockpit/current-context/<session id>.txt`; the id is in the background tasks' output paths), before every agent start and at every milestone. Never estimate it from the `total_tokens left` counter, which undercounts context badly: Fork 3 judged itself at about 50k when it was at 232k, and fork2 at about 140k when it was at 208k. If you can't tell, assume you are over 120k.
- **At 120k:** start no agent, for any reason, the agents this runbook owes included. Let the agents already running finish, and save each report to `raw/` the moment it arrives. A cut-off agent can only be resumed in the session that started it.
- **From 120k to 150k:** only finish the task in hand: save reports, commit, push. Start no new pass: no verifying, no repair drafting, no new spec version.
- **At 150k, or as soon as the task is done and the running agents have reported, whichever comes first:** go to the save point below, then hand off or stop. Never work past 150k, except under the finish-it rule below, and never past 170k.
- **The finish-it rule (the owner, 2026-10-29; 20k since the limit came back to 150k).** At 150k, evaluate the session's one task: what is left of it, and what that costs in context, its save point included, measured with `/context`, not estimated. If it can be finished within 20k past 150k, finish it instead of handing it off: a handoff makes the next session re-read the same files. Write the evaluation as one line in `LATEST.md` (the task, the estimate, the reason). The rule never covers a new agent, a new pass or a second task. If the estimate is unsure or over 20k, stop as before. Never past 170k.

**Save point (always):**
1. Commit everything, work in progress included, to `claude/63-ultimate-spec-review`, and push.
2. Write `docs/spec/review/handoffs/LATEST.md`, replacing the old one (git keeps the history), then commit and push it. It holds:
   - your fork number;
   - the start and end SHAs, with `git diff <start>..<end> --stat` and the paths that matter;
   - what is finished;
   - what is half-done, with its exact next step;
   - agents still owed, and where their prompts are;
   - the owner's open questions and answers;
   - anything the files don't say.
3. Update both `STATE.md` files and the status board, and comment on PR #83 with a link to `LATEST.md`.
4. Capture a handoff in the second brain (subject `spec-2-0-review`, with `--supersedes` set to the previous handoff) that points at `LATEST.md` and the end SHA.

**Handoff (only if a fork is there).** Run ListAgents and look for a session named "Fork N+1".
- **Found:** SendMessage it: "You are Fork N+1. Look at second brain and continue work. Handoff: docs/spec/review/handoffs/LATEST.md at <end SHA>." Then stop.
- **Not found:** tell the owner "No fork." and stop. Don't send anything. The next chat, the same day or the next, starts again from section 1 when the owner says "look at second brain and continue work".

## 4. The main session and its forks

Added 2026-10-30 at the owner's request, so that every future main session knows its role. The owner sets this up by hand: in a fresh session renamed "main", the owner runs `/fork` two or three times. Each fork waits on an hour timer and is renamed "fork1", "fork2" and so on. Every fork starts at main's small starting context.

**The main session coordinates and does not draft.** Its one task is to move the review forward through its forks:
1. Do section 1, then split `LATEST.md`'s next steps into tasks of about 70k each, one per waiting fork (ListAgents shows them as `bg`). **Split by spec section, not only by row:** rows that touch the same requirement or the same sentence go to the same fork, so that no two batches edit the same text. **Use only as many forks as the work needs** (the owner, 2026-10-30): a fork that takes a task pays a full cache write of its starting context (about 64k), while a waiting fork costs only a cache read at each timer restart. A small batch goes to one fork, and the others keep waiting.
2. SendMessage each fork its task. Give its fork number, the handoff (`LATEST.md` at its SHA), the rows and sources, the file names it writes (`drafts/<version>/repairsN.txt`, `pairsN.json`, and `ledgerN.json` for the ledger rows), **every other fork's rows and spec sections in one line**, and the rules: **draft only**; don't edit `v2.md` or `ledger.md`; don't commit; dry-run the pairs with `tools/rep.mjs` on a temporary copy; keep each OLD to one sentence; stay out of the other forks' sections; when done, send main one line and stop.
   - **In parallel, or one after another** (the owner, 2026-10-30). Batches in separate sections run at the same time. When a task needs another one's result, or two batches can't avoid the same section, send the second task only after the first fork has reported and main has committed its files. The message then gives the commit SHA, the files and one line on what changed (section 2), never the diff, and the second fork drafts on top of that text, so its OLD text still matches.
3. When a fork reports, commit its files at once, by explicit path.
4. Apply the batches to `v2.md` and `ledger.md` one at a time with `tools/rep.mjs`, fix any OLD text an earlier batch changed, run both checkers (`trace-v2.mjs` on an LF copy), and commit and push.
5. Run the agent work that follows: freeze the snapshot, then the fix check (one `spec-verifier`) or the next round's reviewers, in flow section 4's numbers. Any new agent waits until section 3's 120k limit is checked.
6. Make the save point (section 3) for the whole range, then hand off as section 3 says.

**Who starts agents.** A fork drafting repairs from fix text a verifier or reviewer already wrote starts no agents: flow rule 5 makes that the orchestrator's job, and a drafter agent is only for a big merge. Reviewers, verifiers, fix checks and probes are agent work. The main session runs them, or hands one to a fork as that fork's single task, with the packet and the flow's model and effort.

**Why only main writes the shared files.** Every fork works in the same worktree (`../AIConnections-worktrees/review`). Two sessions that write `v2.md` or `ledger.md`, or commit at once, overwrite each other's edits or collide on git's index lock. Draft files at separate paths never collide.

The 120k and 150k limits apply to main as to any session. Main stays small because it reads only the forks' one-line reports and the checkers' output, never their drafts in full.
