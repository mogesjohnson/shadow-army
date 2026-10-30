# The work runbook (Shadow Army spec 2.0 review, issue #63)

Written 2026-10-23 at the owner's request. **When the owner types "look at second brain and start work" or "look at second brain and continue work" (or anything close), follow this file.** No pasted prompt is needed. This file wins over `.shadow/v2-tools/notes/next-session.md` and over `NEXT-SESSION.md`'s prompt.

**THE SPEED OF THIS PROJECT IS BEYOND THE DEADLINE AND THIS NEEDS TO BE SPED UP NOW!!!**

## 1. Start

1. Retrieve the second-brain brief: `bash /c/Users/johns/Obsidian-codex-setup/brain.sh brief --cwd "$PWD" --query 'spec 2.0 review continue work' --json`.
2. Read `CLAUDE.md`, `CONTRIBUTING.md` and `.shadow/v2-tools/STATE.md` in the main checkout. Then, on branch `claude/63-ultimate-spec-review` (worktree `../AIConnections-review`; `git -C ../AIConnections-review pull` first), read in `docs/spec/review/`: `handoffs/LATEST.md` if it exists, `STATE.md`, `NEXT-SESSION.md`, and `spec2.0_review_flow.md` (the rules; it wins over `PLAYBOOK.md`). Where they differ, the newest wins.
3. If `LATEST.md` names a start and end SHA, run `git diff --stat <start>..<end>` to see what the last session changed. Open only the hunks your task touches (`git diff <start>..<end> -- <path>`). Never read the whole diff: every line you read stays in your context for the rest of the session.
4. **Your role.** If the owner calls you the main session, or your session name is "main", you are the main session: follow section 4. Otherwise, find your fork number. Run ListAgents. If your own session name is "Fork N" (or "forkN"), you are Fork N. If a handoff or task message reached you, it gives your number. Otherwise you are Fork 1.
5. Check CI on the open PRs (`gh pr checks 83`). The repo has been public since 2026-10-23, so CI runs free on all three systems.

## 2. Work

The review lives on PR #83 (it replaced #77 on 2026-10-27), branch `claude/63-ultimate-spec-review`, in `docs/spec/review/`. Edit and commit in `../AIConnections-review`, never in the main checkout. Pick up exactly where `LATEST.md` says, or, before the first handoff, where `NEXT-SESSION.md` section 4 says.

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

- **Measure it with `/context`** (or the owner's figure), before every agent start and at every milestone. Never estimate it from the `total_tokens left` counter, which undercounts context badly: Fork 3 judged itself at about 50k when it was at 232k, and fork2 at about 140k when it was at 208k. If you can't tell, assume you are over 120k.
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

**Why only main writes the shared files.** Every fork works in the same worktree (`../AIConnections-review`). Two sessions that write `v2.md` or `ledger.md`, or commit at once, overwrite each other's edits or collide on git's index lock. Draft files at separate paths never collide.

The 120k and 150k limits apply to main as to any session. Main stays small because it reads only the forks' one-line reports and the checkers' output, never their drafts in full.
