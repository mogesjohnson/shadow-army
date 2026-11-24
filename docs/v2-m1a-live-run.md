# M1a live run (M1-AC29): the owner's steps

This is the run that closes M1a. You send two briefs to one real claude soldier from inside Claude Code, in one of your own repositories, and check what lands in the folder. Plain steps, about ten minutes.

Windows only. macOS and Linux: Not tested (D-34).

The offline version of this run passes already: `src/v2/slice.test.ts` drives the real command server and the fake claude through the same steps. Nothing here has run against a real model yet. That is what you are checking.

## Before you start

- Windows, Node on the PATH, `claude` installed and logged in.
- A git repository of yours with a committed `HEAD`. Commit or stash your own edits to the files the soldier will touch (a clash is refused, see below).
- This branch (`claude/63-m1a-slice`) checked out in a folder of yours, written `<shadow-army>` below (for example `C:\src\shadow-army`).

## 1. Build the mod

```powershell
cd <shadow-army>
npm install
npm run build
```

The mod finds its runtime at `dist\v2\modRelay.js` next to the plugin. If `dist` is missing, `/send` says "Shadow Army runtime is missing; run npm run build".

## 2. Load it in Claude Code

Go to your own repository and start Claude Code with the plugin by its full path:

```powershell
cd C:\path\to\your\repo
claude --plugin-dir <shadow-army>\plugins\shadow-army
```

No settings file changes are needed. `/send` should now show in the slash-command list. The soldiers come from the roster bundled with this checkout (`shadow.config.json`, `orchestratorDelegate.md`) unless your repository has its own copies. The soldier to use is `claude-sonnet` (claude, build role).

## 3. Brief one: inside its claims

Pick a folder that does not exist yet in your repo, here `notes`. Run:

```
/send claude-sonnet --claim notes/** Create notes/live-run-1.md with three lines about what this repository is for.
```

Wait. The first send starts the post office, which takes a few seconds, then waits for the turn.

You should see, in the transcript, one card:

```
Shadow Army · <soldier name> · completed
<up to five lines of the soldier's summary>
Log: <your repo>/.shadow/v2/logs/<session>.jsonl
Applied: notes/live-run-1.md
```

In your folder run `git status --short` and `git log -1 --oneline`:

- `notes/live-run-1.md` shows as a new file (` A`), uncommitted and not staged.
- `HEAD` has not moved. Nothing is committed.
- `.shadow/` does not show; it ignores itself.

## 4. Brief two: writes outside its claims

Use the **same** `--claim`, and ask for a different file inside `notes` plus one outside it:

```
/send claude-sonnet --claim notes/** Create notes/live-run-2.md with one line, and also add a line to README.md.
```

You should see the card say:

```
Applied: notes/live-run-2.md
Reverted, outside its claims: README.md
```

In the folder, `git status --short` shows `notes/live-run-2.md` as new, and `README.md` is **not** changed. The soldier's own copy of `README.md` was reset in its worktree (`.shadow\...`), so the edit is gone, and the card names it.

If the soldier does not touch README.md, rerun the brief and say plainly "you must edit README.md". The point is to see a write outside the claims reverted.

## 5. Stop the post office

Exit Claude Code with `/exit` (or close the window). The mod releases the lease at the session's end and the post office closes by itself. If the mod is killed, the lease runs out after 20 seconds and it closes anyway.

Check: `.shadow\v2\post-office.lock` is gone, and there is no leftover `node` process running `modRelay.js` or the post office (Task Manager, Details tab). If the lock stays after 30 seconds, end that node process, then delete the lock file. That clean-up is not tested live.

## 6. What to paste on the build PR (VER-8)

The repository is public. Before you paste, read every line and replace anything private with `[redacted]`: a path with your user name, a repository or file name you keep private, text the soldier quoted from your files.

Paste these, in this order:

1. Date, Windows version, `node --version`, `claude --version`, and the branch commit (`git rev-parse --short HEAD` in `<shadow-army>`).
2. The two cards, copied as text.
3. The output of `git status --short` and `git log -1 --oneline` in your folder after each brief.
4. The applied files' contents. They are added with intent to add (` A`), so `git diff -- notes` shows them in full; `Get-Content notes\live-run-1.md, notes\live-run-2.md` works too. Then `git diff README.md`, which should be empty.
5. Whether the post office stopped on `/exit` (lock file gone, no node process).
6. Tokens and cost for each brief. In the session log (the card's `Log:` path), `Select-String '"type":"usage"' <log>` finds the usage records: input, cached input and output tokens, and `costUsd` where claude reports one. Paste the figures, not the whole lines.
7. The spend: these briefs' tokens and cost added to the release's spend so far, against the budget in spec section 5.1, and any go you gave to pass it, with your words and the date.
8. The result: **pass** if both cards and both folder checks match the steps above and the post office stopped, otherwise **fail**, naming the step that did not match.
9. Anything odd: a long wait, a wrong card, a prompt from claude you had to answer. If a step failed, paste the card or error text as it is and the last 20 lines of the session log, redacted as above.

## Known not to work

- **Changing claims needs a new session.** A soldier's claims are fixed when its session opens. A later `/send` with different claims is refused with the post office's reason, shown on the card, for example `claude-sonnet holds claims notes/**; close its session before sending other claims`. The mod has no close command yet. To change claims, exit Claude Code and start it again, then send. The earlier work stays on the soldier's branch.
- **A second turn that edits a file an earlier turn already applied is refused.** The card says `Not applied:` with the clash reason and the file. Your folder is unchanged and the work stays on the soldier's branch (`shadow/...`). Ask for a new file instead, as brief two does.
- **Your own edits.** If you changed a file in your folder that the soldier also changed, it is not applied and the card says so.
- **One command, one soldier.** `/send` takes one claude soldier with the build role. There is no pane, no cancel command and no merge or commit of the result.

## Not tested

- macOS and Linux (D-34).
- Any real claude session: the offline run uses the fake claude.
- The lease expiring after Claude Code is killed, and the clean-up in step 5.
- Whether a new Claude Code session in the same repository can reuse the soldier's old branch and claims right after an earlier session.
