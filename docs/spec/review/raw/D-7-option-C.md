# D-7 drafter, option C: under auto or full, each read-only turn runs in its CLI's own read-only mode where that mode holds, switched per turn inside the live session, and otherwise as option A. Against the frozen v0.8 snapshot (v2@1580e87), following v0.9 (v2@b6f4315) where it touches WSP-10 or WSP-11. Run 2026-10-17: 391,298 tokens, 76 tool calls, 32 min.

# D-7 option C, drafted as spec text

This is drafted against the frozen v0.8 snapshot (`C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@1580e87.md`), and every line number is from that snapshot. Where the text touches WSP-10 or WSP-11 it follows v0.9 (`v2@b6f4315.md`), and the v0.9 line is given next to the v0.8 one.

**Where it goes.** NEW-1 and NEW-3 go in §4.7, after ARM-6 (after line 471; v0.9 line 478). NEW-2 goes in §4.8, after WSP-11 (after line 505; v0.9 line 515). The changed lines follow in spec order, each with the text it replaces. The new ACs and the Appendix A rows come after them.

## New requirements

- **NEW-1** (M6; U, C, I, R) **A read-only turn runs in its CLI's own read-only mode where that mode holds** (from v1: each adapter's flags for a task that doesn't write, and `src/core/summon.ts`, which gives a read-only task it can't snapshot those flags).
  - **Holding.** Each adapter keeps a table of its CLI's read-only mode at `auto` and at `full`. The table says whether the mode holds at each level, and names the CLI version it was read from (CH-8). A mode is marked as holding only when all four of these are true:
    - the vendor documents that in that mode the CLI's tools edit no file and run no command that can write, except inside a sandbox the vendor documents as read-only;
    - at that level, during a turn, only the owner's own answer to a request (CH-6) can let a tool out of the mode. No classifier, automatic reviewer or default setting can;
    - the adapter can set the mode for one turn inside the live session, and the CLI confirms it;
    - the CLI's contract fixtures (section 5.1, C) show a file edit refused in that mode after the mode was set inside the session, and a shell command that writes refused too. The fixtures are recorded with that CLI version on each system the table names.

    The owner's standing configuration doesn't count against a mode. That covers an allow rule, a codex `prefix_rule` or a hook. Shadow Army leaves that configuration whole (CH-7), and NEW-2 reverts whatever it lets a read-only turn write. A CLI newer than its table's version connects with CH-8's warning. None of its modes holds until its fixtures are recorded again.
  - **Each CLI**, as read for this spec:
    - **claude.** Its read-only mode is `plan`, and it doesn't hold.
      - claude sends the owner its file edits, and the shell commands it recognizes as changing files, such as `touch` and `rm`.
      - Wherever auto mode is available, its classifier reviews every other shell command during planning instead of asking, and runs the ones it approves (D-16). Auto mode is available for the roster's Opus and Sonnet models.
      - Only the owner's user, local or managed settings can turn that off (`useAutoModeDuringPlan`, on by default), and no adapter does (CH-7).
      - `dontAsk` is not claude's read-only mode. It runs whatever the configuration pre-approves, and it refuses AskUserQuestion, which CH-2 keeps.
      - Where claude's mode changes for a turn (CH-2), the adapter sends the stream-json control request behind the Agent SDK's `setPermissionMode()`. The new mode applies to every tool request after it.
    - **codex.** Its read-only mode is the sandbox policy `readOnly`.
      - At `full` it can hold, because the approval policy `never` leaves nothing to approve. The table marks it as holding only for a system where codex's fixtures show both refusals: Seatbelt on macOS, bubblewrap on Linux, and codex's own sandbox on Windows.
      - At `auto` it doesn't hold. codex's auto-review, which v1 turns on with `--approve-for-me`, approves two things without the owner: a shell command that asks to leave the sandbox, and a file edit outside the writable roots.
      - In `readOnly`, commands that write fail, including a test run that writes a cache, and the session shows codex's own denial.
      - The mode is set in each turn's own `turn/start` (CH-3).
    - **grok.** Its read-only mode is plan mode, and it doesn't hold. xAI documents only a file-edit gate: in plan mode only the plan file can be edited, whatever the permission mode. Nothing is documented for shell commands, which its classifier lets run at `auto`, and always-approve lets run at `full`. Where grok's mode changes for a turn, the adapter sets it with ACP's `session/set_mode` (CH-4).
    - **agy.** It has no read-only mode that holds: in spike S5 it wrote a file with `--mode plan` (CH-5). It has no way to change its mode inside a session either, because a control message ends the session (CH-6). It always runs in a snapshot (ARM-6).

    So, as written, the only read-only mode that can hold is codex's `readOnly` at `full`. Every other read-only turn under `auto` or `full` goes as NEW-2 and NEW-3 say.
  - **Per turn.** Under `auto` or `full`, where the CLI's read-only mode holds, each read-only turn (ARM-5) runs in that mode, and each writing turn in the mode its autonomy chooses (CH-7). Where the mode doesn't hold, every turn runs in the autonomy's mode. At `supervised`, a turn runs in the mode CH-7 has the autonomy and the turn's kind choose, and it is set the same way.
    - The adapter sets a turn's mode after the turn before it is over (PO-8, →M2) and before the message goes in. So a mode never changes during a turn, or while that turn's background work runs. A turn the CLI takes by itself within its message's work keeps that message's mode.
    - For a CLI whose mode is set by a request of its own (claude, grok), a session opens and resumes in its read-only mode where that mode holds (CH-9, →M2). The adapter sets that mode again as soon as each writing turn is over, so a turn the CLI starts by itself runs in it. For codex, the mode is part of every `turn/start`.
    - A message goes in only once the CLI has answered the request that set its turn's mode. If the CLI refuses the request, or doesn't answer it within 10 seconds on the monotonic clock, nothing is sent:
      - the message stays queued, and its row says why, as in `waits · mode not set · <the CLI's words>`;
      - the queue is held (MSG-3, →M3);
      - the soldier's log and one line in Claude's transcript say so, and g tries again.
    - A CLI that has no way to set its mode inside a live session keeps the mode it opened in for the session's life: for a soldier that can write, that is its autonomy's mode. NEW-2 audits its read-only turns.
    - If the CLI leaves the mode during a turn, as when the owner approves leaving plan mode (CH-6, →M2), the turn stays read-only, and NEW-2 audits it.
  - **What the owner sees.**
    - The soldier's log records each turn's kind, the mode set for it, and the mode its CLI reported, where the CLI reports one.
    - An approval request in a read-only turn has one more line under the request: `read-only turn: whatever this writes is reverted`.
    - When NEW-2 finds a write after a turn that ran in a mode that holds, its line in Claude's transcript adds `the read-only mode didn't stop it`.

- **NEW-3** (M6; I, F) **Under `auto` or `full`, a soldier that can't write runs in a snapshot unless its CLI's read-only mode holds** (from v1's design rules and `src/core/summon.ts`, and 2.0 WS-3).
  - A soldier can't write when it lacks the build role, when its entry in `orchestratorDelegate.md` says `write: false` (ARM-1), or when it is agy (ARM-2). Under `auto` or `full`:
    - where its CLI's read-only mode holds (NEW-1), it runs in its own worktree (WSP-1). Every turn runs in that mode and is audited as NEW-2 says;
    - otherwise each of its sessions opens in its own throwaway snapshot, with no worktree and no branch. The snapshot is made, kept and removed as WSP-11 says. agy runs this way at every level (ARM-6).
  - Where a soldier runs is decided when each session opens, from its roles and its adapter's table. It stays the same for that session's life, a resumed session included (CH-9, →M2).
  - **No snapshot.** When the snapshot can't be made, as with a full disk or while harness git is held (WSP-10), the soldier doesn't start. The same applies after a crash or `/fresh`.
    - Its state is down (VIS-2), with the reason, and it sits in the decisions list among the channels down (HOST-14).
    - Messages for it stay queued, and each row gives the reason, as in `waits · no snapshot · disk full` (MSG-3).
    - Its log and a line in Claude's transcript give the reason, and r starts it again.

    Nothing stands in for the snapshot. The soldier never runs in the folder or in a worktree instead. Shadow Army never starts it at a lower autonomy level, as v1 did outside a repository (`src/core/summon.ts`).

- **NEW-2** (M6; I, X, F) **A read-only turn in a worktree is audited with no claims, and its writes are reverted** (from v1's design rules and v1 #16, and 2.0 WS-2 and WS-3).
  - This holds at every autonomy level and in every mode, including a read-only mode that holds. Writes need a writing turn (ARM-5), and no read-only mode stops what the owner's own configuration lets through (NEW-1).
  - It covers a builder's review, research or test brief, every other read-only turn of a builder, and each turn of a soldier that can't write and runs in its worktree (NEW-3).
  - **The start state.** Before a read-only turn's message is recorded as delivered (MSG-4, →M3), the post office saves the worktree's start state to disk and flushes it. It goes beside the turn's guard baseline (PO-8, →M2), never inside a worktree or a snapshot, and is kept until the turn's audit and revert have run. It holds:
    - the soldier's branch tip, the worktree's `HEAD`, and its index;
    - the bytes and mode of each file that differs from `HEAD`, and of each file git neither tracks nor ignores;
    - the bytes and mode of the worktree's own copies of the paths ARM-6 hashes, such as `.claude/` and `.env*`, whether git ignores them or not;
    - the worktree's ignore rules. The audit reads from these what is ignored, so an ignore rule the turn adds hides nothing.

    If the start state can't be saved, or harness git is held (WSP-10), the message isn't sent. It stays queued, and its row gives the reason, as in `waits · can't save the worktree's start state · disk full`.

    The post office also saves the state each time it finishes a turn in a worktree. That gives a start state to a turn the CLI starts by itself after its message's work is over (PO-8). If such a turn comes, an edit the owner made in that worktree after that point is reverted too.
  - **The audit** runs once, when the turn is over (PO-8), after the turn's guard closes and before anything else goes to the soldier. It compares the worktree with the start state, never with the base. There are no claims, so every difference is a write.
  - **What reverted means.** The worktree goes back to its start state:
    - each path the turn created is removed;
    - each path it changed or deleted gets back its start bytes and mode, from `HEAD` or from the saved copy;
    - the branch tip, `HEAD` and the index go back to their start values, so a commit the turn made leaves the branch;
    - the builder's own work, committed or not, stays as it was at the start. Its uncommitted files come back byte for byte from the copy. The same goes for the owner's edits made before the message went in;
    - nothing is removed or restored through a link (WSP-3). A link the turn made is removed without being followed;
    - an edit the owner makes in that worktree during the turn can't be told apart from the soldier's, so it is reverted too.

    Other paths git ignores are not audited. What a read-only turn leaves there, such as build output or installed packages, stays for later turns. It never reaches the branch, `/diff` or `/apply`. That is a stated residual risk.
  - **Apply waits.** While a soldier's read-only turn is open, and until its revert has succeeded, `/apply <soldier>` (WSP-9) is refused with the reason, as in `apply waits · Igris's read-only turn isn't checked yet`. So nothing the turn committed reaches the folder.
  - **What the owner sees.** A write found here doesn't change how the message ends (PO-8): a turn that completed is still answered.
    - The soldier's log lists each path the turn wrote, as created, changed or deleted, and each commit it made, and says that each was reverted.
    - The summary card's changes fact says "none", then `read-violation:` and the paths (MSG-11).
    - Claude's transcript gets one line, as in `Igris · 2 files written in a read-only turn were reverted (read-violation): src/a.ts, src/b.ts`.
    - A turn that wrote nothing the audit covers adds nothing.
  - **Failures.** Whatever ends the turn, its audit and revert run once, before the next message:
    - **a stop** (MSG-9): once the stopped turn has ended. g, or the owner's new message, goes in only after that;
    - **a crash**, including one in the middle of a tool call: once the CLI's process tree has been ended, before the session is resumed or the channel restarted (PO-1);
    - **the post office dying** mid-turn: the start state is on disk. Before it opens any channel, the next post office reverts the worktree from it, and the message ends as PO-1 says;
    - **harness git held** when the turn ends (WSP-10): the message ends as interrupted and the queue is held. The revert runs first once harness git goes on;
    - **a revert that fails**, as when another process holds a file open: the soldier's queue is held (MSG-3), and its log and one line in Claude's transcript name each path still changed. The revert is tried again before anything else goes to that soldier, also after `/fresh` (SES-5), and `/apply` stays refused until it succeeds.

## Changed lines

**Glossary, Autonomy (line 60).** Replaces:
> - **Autonomy:** a soldier's permission level in `shadow.config.json`: `supervised`, `auto` or `full`, as in v1. It chooses only that CLI's documented flags (CH-7).

With:
- **Autonomy:** a soldier's permission level in `shadow.config.json`: `supervised`, `auto` or `full`, as in v1. Among the CLI's flags it chooses only documented ones (CH-7). With `auto` or `full`, a read-only turn also runs in its CLI's own read-only mode where that mode holds (NEW-1). Otherwise it runs in a throwaway snapshot (NEW-3), or, for a soldier that can write, is audited with no claims and its writes reverted (NEW-2).

**Glossary, after Claims (line 78).** Adds:
- **Writing turn, read-only turn:** a turn whose message's kind is build, sent to a soldier that can write, is a writing turn. Every other turn is read-only (ARM-5).
- **Read-only mode:** a CLI's own mode for work that doesn't write, such as claude's `plan` or codex's `readOnly` sandbox. Whether it holds is in its adapter's table (NEW-1).

**HOST-9 (line 164).** Replaces:
> - `/send` takes an optional kind of work, `/send <soldier> --kind <kind> <message>`, checked as ARM-2 says. With or without a kind, a `/send` message is the owner's own (MSG-7); a kind only adds ARM-2's check.

With:
  - `/send` takes an optional kind of work, `/send <soldier> --kind <kind> <message>`, checked as ARM-2 says. With or without a kind, a `/send` message is the owner's own (MSG-7). A kind adds ARM-2's check, and only `--kind build` lets the turn write. Without a kind the turn is read-only, as it is for a message typed in the pane's field (ARM-5, →M6).

**HOST-10 (line 166).** Replaces:
> - `kind` is the kind of work the brief asks for: build, review, research or test. It is required, and the brief is checked against it before it is sent (ARM-2). The kind is checked and recorded (PO-6), never sent: the soldier receives only the brief's text.

With:
  - `kind` is the kind of work the brief asks for: build, review, research or test. It is required, and the brief is checked against it before it is sent (ARM-2). Only build makes a writing turn: build includes writing tests, and test means running them (ARM-5, →M6). The kind is checked and recorded (PO-6), never sent: the soldier receives only the brief's text.

**HOST-14 (line 177).** Replaces:
> - Everything that waits on the owner, across all soldiers, is in one list, oldest first: approval requests, the guard's attribution cards (ARM-6), handoffs ready, queues held after a stop, logins needed, channels down and messages not delivered.

With:
  - Everything that waits on the owner, across all soldiers, is in one list, oldest first:
    - approval requests;
    - the guard's attribution cards (ARM-6);
    - handoffs ready;
    - held queues: after a stop, after a turn's mode couldn't be set (NEW-1, →M6), or while a read-only turn's writes haven't been reverted (NEW-2, →M6);
    - logins needed;
    - channels down, including a soldier whose snapshot can't be made (NEW-3, →M6);
    - messages not delivered.

**PO-1 (line 204).** After the sentence that ends "and its message ends as interrupted.", adds:
A read-only turn left open in a worktree is reverted from the start state kept on disk for it (NEW-2, →M6).

In v0.9 this paragraph is a list (lines 205-209), and the sentence ends its first bullet (line 206).

**PO-8, Finishing (line 267).** In that line, replaces:
> It closes the turn's checkout guard (ARM-6, WSP-4, →M6) and runs its claim audit (WSP-2, →M6), once each, on the files as they are then.

With:
It closes the turn's checkout guard (ARM-6, WSP-4, →M6), then audits the turn:
- a writing turn against its claims (WSP-2, →M6);
- a read-only turn in a worktree with no claims, reverting what it wrote (NEW-2, →M6);
- a turn in a snapshot, by finding what it wrote there (WSP-11).

Each runs once, on the files as they are then.

**PO-8, interrupted (line 269).** In that line, replaces:
> The changes made so far stay, and the message's row shows them (MSG-4, →M3);

With:
A writing turn's changes made so far stay, and a read-only turn's are reverted or discarded (NEW-2, →M6; WSP-11). The message's row shows them (MSG-4, →M3);

**PO-8, a turn the CLI starts by itself (line 275).** In that line, replaces:
> A turn the CLI starts by itself after a message's work is over belongs to that message: it gets a guard and an audit of its own,

With:
A turn the CLI starts by itself after a message's work is over belongs to that message, but it is read-only (ARM-5, →M6): it gets a guard and an audit of its own, with no claims (NEW-2, →M6),

**CH-2 (line 292).** Replaces:
> - It passes the permission mode of the soldier's autonomy on every start and resume, as v1 does (`src/adapters/claude.ts`): `--permission-mode plan` for supervised, or `acceptEdits` for a writing turn (ARM-5, →M6); `--permission-mode auto` for auto; and `--permission-mode bypassPermissions` for full.

With:
  - It passes the permission mode of the soldier's autonomy on every start and resume, as v1 does (`src/adapters/claude.ts`): `--permission-mode plan` for supervised, `--permission-mode auto` for auto, and `--permission-mode bypassPermissions` for full.
  - From M6, where a turn needs a mode other than the session's, the adapter sets it inside the live session before the message goes in, and sets the session's mode back once the turn is over (NEW-1, →M6). It uses the control request behind the Agent SDK's `setPermissionMode()`. At supervised, that mode is `acceptEdits` for a writing turn (ARM-5, →M6).
  - claude's `plan` doesn't hold at auto or full (NEW-1). There no turn changes the mode, and a read-only turn is audited instead (NEW-2, →M6).

**CH-3 (after line 306).** Adds:
  - From M6, every `turn/start` carries that turn's `sandboxPolicy`, because codex keeps a turn's settings as the thread's defaults for later turns. A read-only turn gets `readOnly` where that holds; any other turn gets the policy its autonomy chooses (NEW-1, →M6; CH-7). The approval policy stays the autonomy's. Where `readOnly` holds, the thread opens and resumes with it.

**CH-4 (after line 310).** Adds:
  - grok's plan mode doesn't hold at auto or full (NEW-1, →M6). Where a turn's mode differs from the session's, the adapter sets it before `session/prompt` with ACP's `session/set_mode`, to a mode listed in `session/new`'s result, and waits for the answer.

**CH-7 (line 331).** Replaces:
> - Autonomy chooses only each vendor's documented flags (from 2.0 SAFE-10). Each adapter passes its CLI's permission mode at every autonomy level, on every start and resume, so the mode never comes from a settings file or the CLI's own default: claude's in CH-2, and codex's, grok's and agy's with their channels (CH-3 to CH-5, →M2).

With these two bullets. v0.9's two added sentences after this one (the mode a CLI refuses, and a reported mode that differs) stay as they are.
  - Autonomy chooses only each vendor's documented flags (from 2.0 SAFE-10). From M6, a turn's kind also chooses between the autonomy's mode and the CLI's read-only mode (NEW-1). Each adapter passes its CLI's permission mode at every autonomy level, on every start and resume, and from M6 for every turn. So the mode never comes from a settings file or the CLI's own default: claude's in CH-2, and codex's, grok's and agy's with their channels (CH-3 to CH-5, →M2).
  - A read-only mode (NEW-1, →M6) is the CLI's own documented mode for work that doesn't write. It is the mode v1 passes at `supervised` for such a task, and for a read-only task v1 can't snapshot (`src/adapters/*.ts`, `src/core/summon.ts`). Only a mode the adapter's table says holds is used for the read-only rule. No adapter changes a setting, rule, allow list, hook or reviewer to make a mode hold, such as claude's `useAutoModeDuringPlan`.

**MSG-3 (line 368).** Replaces:
> - A held queue waits for the owner instead: after a stop (MSG-9), and while a handoff card (SES-4, →M4) or an attribution card (ARM-6) is open.

With:
  - A held queue waits for the owner instead:
    - after a stop (MSG-9);
    - while a handoff card (SES-4, →M4) or an attribution card (ARM-6) is open;
    - from M6, after a turn's mode couldn't be set (NEW-1), or while a read-only turn's writes haven't been reverted (NEW-2).

**MSG-4, interrupted (line 373).** In that line, replaces:
> The turn may already have changed files, so the row shows the changes made since the turn began (MSG-11, →M6);

With:
The turn may already have changed files, so the row shows the changes made since the turn began. For a read-only turn it shows the paths reverted (MSG-11, NEW-2, →M6);

**MSG-4, sending again (line 380).** Replaces:
> - r puts an interrupted message's text back in the field instead, above the changes its turn made (d). The owner edits it or keeps it, and Enter sends it as a new message with its own id. Its row says which message it repeats.

With:
    - r puts an interrupted message's text back in the field instead, above the changes its turn made (d). The owner edits it or keeps it, and Enter sends it as a new message with its own id. Its row says which message it repeats. From M6 it has that message's kind (ARM-5, →M6).

**MSG-9 (line 393).** Replaces:
> - The session stays open with its history, and the work done so far stays in the soldier's worktree. This is not starting fresh (SES-5, →M4).

With:
  - The session stays open with its history. A writing turn's work done so far stays in the soldier's worktree. A read-only turn's writes are reverted, or discarded in a snapshot (NEW-2, WSP-11, →M6). This is not starting fresh (SES-5, →M4).

**MSG-11 (line 403).** Replaces:
> - **changes:** the files and lines the turn changed on the soldier's branch, or "none";

With:
  - **changes:** the files and lines the turn changed on the soldier's branch, or "none". For a read-only turn it says "none", then `read-violation:` and each path the turn wrote, reverted or discarded (NEW-2, WSP-11);

**SES-1 (line 410).** Replaces:
> - **SES-1** (M4; I) **One session per soldier.** Each soldier has one open session per Claude session, and related work accumulates in it.

With:
- **SES-1** (M4; I) **One session per soldier.** Each soldier has one open session per Claude session, and related work accumulates in it.
  - From M6, a builder's read-only turns are turns of that same session, in its worktree. Only each turn's mode changes, where its CLI's read-only mode holds (NEW-1, →M6), and no second session or snapshot is opened for them.
  - A soldier that runs in a snapshot keeps one snapshot for its session's life (WSP-11).

**SES-6 (line 433).** In that line, replaces:
> - **A change to the soldier's model, effort or tools** (MCP servers included) moves the estimate

With:
  - **A change to the soldier's model, effort, tools or permission mode** (MCP servers included, and a mode set for one turn, NEW-1, →M6) moves the estimate

**ARM-2 (line 456).** Replaces:
> - A brief carries its kind of work (HOST-10). One whose kind the hard rules forbid (a review for grok, a build for agy), or that is not among the soldier's roles, is refused before it is sent, and the refusal says why.

With:
  - A brief carries its kind of work (HOST-10). It is refused before it is sent, and the refusal says why, when:
    - its kind is one the hard rules forbid (a review for grok, a build for agy);
    - it is a build for a soldier whose entry says `write: false` (ARM-1);
    - its kind is not among the soldier's roles.

**ARM-5 (line 459).** Replaces:
> - **ARM-5** (M6; I) **Writes need the build role**, and happen only in the soldier's own worktree, under its claims (from v1's design rules).

With:
- **ARM-5** (M6; U, I) **Writes need the build role**, and happen only in the soldier's own worktree, under its claims, in a writing turn (from v1's design rules, where a write also needs `--write`).
  - **A writing turn** is the turn of a message whose kind is build, sent to a soldier that can write (NEW-3).
    - The kind is the one recorded with the message (PO-6, →M3): the Monarch's on `send` (HOST-10, →M3), or the owner's on `/send <soldier> --kind build` (HOST-9, →M5). These are the kinds of work the owner settled with the v2.1 picks.
    - Build includes writing tests. Test means running them and reporting.
  - **Every other turn is read-only:**
    - a brief whose kind is review, research or test;
    - a message with no kind. That covers the owner's message from the pane's field or from a `/send` without `--kind` (MSG-7), since v1's runs were read-only without `--write`. It also covers a soldier's message (MSG-6) and the request for a handoff summary (SES-4, →M4);
    - a turn the CLI starts by itself after its message's work is over (PO-8, →M2). A turn it takes within that work belongs to the message and has its kind.
  - **The post office decides**, from the recorded kind, before the message goes in. It never decides from anything the soldier writes or does, and the soldier never receives the kind (HOST-10, →M3). A message the owner sends again with r (MSG-4, →M3) has the kind of the message it repeats, and ARM-2 checks it again.
  - A writing turn is audited against its claims (WSP-2). A read-only turn runs as NEW-1, NEW-2 and NEW-3 say: under `auto` or `full` it runs in its CLI's own read-only mode where that mode holds. Otherwise it runs in a snapshot, or is audited with no claims.

**ARM-6 (lines 461-462).** Replaces:
> - Every agy session runs in a read-only snapshot of its base, never in a worktree that merges.
> - Any file it writes is discarded and reported as a read-violation (from 2.0 WS-3).

With:
  - agy has no read-only mode that holds, and no way to change its mode inside a session (NEW-1). So each agy session runs in a throwaway snapshot at every autonomy level, never in a worktree. WSP-11 says where the snapshot goes, and when it is made and removed.
  - Its writes there are found when each turn is over, reported as a read-violation, and discarded before its next turn (WSP-11; from 2.0 WS-3).

**ARM-6 (line 464; v0.9 line 470).** Replaces:
> - The guard also hashes these paths, even where git ignores them or doesn't track them (from 2.0 GUARD-2, less its vendor home configs; the user's global git config is WSP-10's): the shared git config, `hooks/` and `info/`, and each worktree's metadata; `.githooks/`, `.claude/`, `.mcp.json` and `.env*`; and `AGENTS.md`, `CLAUDE.md`, `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` and `agent.md`.

With:
  - The guard also hashes these paths, even where git ignores them or doesn't track them (from 2.0 GUARD-2, less its vendor home configs; the user's global git config is WSP-10's):
    - the shared git config, `hooks/` and `info/`, and each worktree's metadata, as WSP-10 defines it;
    - `.githooks/`, `.claude/`, `.mcp.json` and `.env*`;
    - `AGENTS.md`, `CLAUDE.md`, `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` and `agent.md`.

    These are the checkout's own paths. Inside Shadow Army's own snapshots and worktrees the guard hashes nothing. A write there is the soldier's own, which WSP-11, WSP-2 and NEW-2 (→M6) check. Their metadata counts as WSP-10 defines and trusts it.

**ARM-6 (after line 467; as v0.9 line 474).** Adds a third trusted record:
    - Shadow Army's own commands that made or removed a snapshot or a worktree, for the worktree metadata they changed (WSP-10).

**WSP-1 (line 475).** Replaces:
> - **WSP-1** (M6; I) One worktree per soldier per Claude session (from 2.0 WS-1).

With:
- **WSP-1** (M6; I) One worktree per soldier per Claude session (from 2.0 WS-1). A soldier that runs in a snapshot (ARM-6, NEW-3) has none, and `/diff` and `/apply` say that it has no branch (WSP-9).

**WSP-2 (line 476).** Replaces:
> - **WSP-2** (M6; I) Claims, and the claim audit at the end of every writing turn (from v1 #16 and 2.0 WS-7). The audit runs once, when the turn is over (PO-8): after any background work the turn left running, and also for a turn that was cut short. It always runs before the soldier's next message.

With:
- **WSP-2** (M6; I) Claims, and the claim audit at the end of every writing turn (from v1 #16 and 2.0 WS-7). A read-only turn in a worktree is audited as well, with no claims, and against its own start state rather than the base. So its writes are reverted and the builder's earlier work stays (NEW-2). Each audit runs once, when the turn is over (PO-8): after any background work the turn left running, and also for a turn that was cut short. It always runs before the soldier's next message.

**WSP-4 (line 478).** Replaces:
> - **WSP-4** (M6; I) The checkout guard (from v1 #22, and 2.0 GUARD-1 to GUARD-4). It covers every soldier's turns, with the scope, the trusted records and the attribution card that ARM-6 gives agy.

With:
- **WSP-4** (M6; I, X) The checkout guard (from v1 #22, and 2.0 GUARD-1 to GUARD-4 and GUARD-6). It covers every turn of every soldier, writing or read-only, at every autonomy level and in every mode. It has the scope, the trusted records and the attribution card that ARM-6 gives agy.
  - Shadow Army's own worktrees, like its snapshots, are not the checkout (ARM-6, WSP-11). A soldier's turn is checked there by its claim audit (WSP-2), or, for a read-only turn, by NEW-2. In a soldier's worktree, a `HEAD` that moved during its read-only turn is a write there (NEW-2).
  - A move of one of Shadow Army's `shadow/*` branches is exempt only where its records explain it: harness git's own commands, and a soldier's own branch during that soldier's turn. Any other move goes on the card, such as one soldier's commit on another soldier's branch (2.0 GUARD-6). v1 exempts every `shadow/*` branch (`src/workspace/guard.ts`).

**WSP-11 (lines 501-505; v0.9 lines 510-515).** Takes v0.9's text, which this option leaves as it is apart from the first line. v0.8's line 501:
> - **WSP-11** (M1; I, F) **Before a soldier has its worktree** (from v1's design rules). Until WSP-1 (→M6) gives each soldier its worktree, each session opens in its own throwaway snapshot of HEAD under `.shadow/v2/`, made by harness git (WSP-10) when the session opens and removed when it closes.

and v0.9's line 510, which drops "under `.shadow/v2/`" and puts the snapshot in `~/.shadow-army/snapshots/` on line 511, both become:
- **WSP-11** (M1; I, F) **Snapshots** (from v1's design rules). Until WSP-1 (→M6) gives each soldier its worktree, each session opens in its own throwaway snapshot of HEAD, made by harness git (WSP-10) when the session opens and removed when it closes. From M6 the same rules hold for each soldier that still runs in a snapshot: agy at every level (ARM-6, →M2), and, under `auto` or `full`, a soldier that can't write and whose CLI's read-only mode doesn't hold (NEW-3, →M6).

**VIS-2, disconnected row (line 527).** Replaces:
> | disconnected | ✗ | `x` | down | its channel is down after three failed restarts (PO-1); r reconnects it |

With:
    | disconnected | ✗ | `x` | down | its channel is down after three failed restarts (PO-1), or its snapshot can't be made (NEW-3, →M6); r reconnects it |

**§5.1, contract tests (line 582).** Replaces:
> - a session that goes cold.

With:
  - a session that goes cold;
  - for claude, codex and grok, one session with a read-only turn and a writing turn, each in the mode NEW-1 sets. In the read-only turn, a file edit and a shell command that writes. For a mode the adapter's table marks as holding, the recording is made on each system the table names, and shows both writes refused.

**§5.1, integration tests (line 591).** Replaces:
> - crash, restart and resume.

With:
  - crash, restart and resume;
  - a builder's read-only turn that writes in its worktree, and a soldier that can't write, in its snapshot (NEW-2, NEW-3).

**§5.1, security tests (after line 597).** Adds:
  - A read-only turn does each of these: commits on its own branch, moves another soldier's `shadow/*` branch, adds an ignore rule over a file it writes, replaces a file with a link to a checkout file, and writes `.claude/settings.local.json`. None of it reaches `/diff`, `/apply` or a later turn, the checkout file is unchanged, and the other branch's move is on the card (NEW-2, WSP-4).

**§5.1, fault tests (line 619).** Replaces:
> - a broken link in a worktree.

With:
  - a broken link in a worktree;
  - a read-only turn that wrote and then was stopped, was killed in the middle of a tool call, or was cut short when the post office died;
  - a start state that can't be saved, a revert that fails, a mode the CLI refuses or doesn't confirm, and a snapshot that can't be made (NEW-1, NEW-2, NEW-3).

**M6 Implements (line 856).** Replaces:
> Implements: WSP-1 to WSP-7, WSP-9; ARM-5; MSG-11; LEG-1; VER-10.

With:
Implements: WSP-1 to WSP-7, WSP-9, NEW-2; ARM-5, NEW-1, NEW-3; MSG-11; LEG-1; VER-10.

**M6-AC2 (line 859).** In that line, replaces:
> A soldier writes only in its own worktree under its claims, and only with the build role.

With:
A soldier writes only in its own worktree under its claims, only with the build role, and only in a writing turn (ARM-5).

## New ACs (M6, after line 870)

- **M6-AC9** Each turn's mode, with fake CLIs (NEW-1, CH-2, CH-3, CH-4, CH-7):
  - a fake codex soldier with `build` and `review`, at `full`, takes a review brief, a build brief and a message from its pane's field, in that order. The first and third `turn/start` carry `sandboxPolicy` `readOnly`; the second carries the policy `full` chooses. Each carries `full`'s approval policy. The thread opens with `readOnly`, and after a crash resumes with it;
  - at `auto`, every `turn/start` of the same fake carries `auto`'s policy, and its review turn is audited as M6-AC10 says;
  - fake claude and grok soldiers at `auto` and at `full` get no mode change for any turn;
  - at `supervised`, the claude fake gets the request that sets `acceptEdits` before a build brief, and the one that sets `plan` once that turn is over. Each message goes in only after the fake has answered;
  - a fake claude at `supervised` that refuses the change gets no message, and so does one that doesn't answer within 10 seconds. The message stays queued with the reason in its row, the queue is held and shows in the decisions list, and g tries again;
  - a fake grok at `supervised` that lists no modes keeps the mode it opened in, and its read-only turns are audited;
  - the codex fake at `full` writes a tracked file in a read-only turn even so. The file is reverted as M6-AC10 says, and the line in Claude's transcript says the read-only mode didn't stop it;
  - in a read-only turn of a fake claude at `supervised`, the owner approves the request to leave plan mode. The request showed the read-only line, and what the turn then wrote is reverted;
  - a codex newer than the version its fixtures name connects with CH-8's warning, and gets no `readOnly` turn until its fixtures are recorded again;
  - review confirms each row of each adapter's table against its vendor's documentation, with the CLI version it was read from.
- **M6-AC10** A builder's read-only turn (NEW-2, ARM-5, WSP-2, MSG-11). The setup is a fake claude soldier with `build` and `review`, at `auto`. Its worktree holds:
  - a commit from a build brief;
  - an uncommitted change to `src/a.ts`, left by a build turn whose audit was held (WSP-10);
  - an untracked `notes.md`;
  - a `dist/` that git ignores;
  - an ignored `.claude/settings.local.json`.

  Checks:
  - a review brief's turn changes `src/a.ts` again, creates `src/new.ts` and adds it to `.gitignore`, deletes `README.md`, commits, and rewrites `.claude/settings.local.json`. It also adds files to `dist/`, and replaces `notes.md` with a link to a checkout file;
  - once the turn is over, `src/a.ts` holds its uncommitted change byte for byte, and `src/new.ts` is gone. `README.md`, `.gitignore`, `notes.md` and `.claude/settings.local.json` are as they were at the start, and the checkout file is unchanged. The branch tip, `HEAD` and the index are as they were at the start. What the turn added to `dist/` stays, unreported, and `/diff` shows only the earlier commit;
  - the message ends as answered. The card's changes fact says none, then the read-violation with its paths. Claude's transcript gets one line, and `/apply` during the turn was refused with its reason;
  - the same holds for a message from its pane's field, a `/send` without a kind, a teammate's `send`, a handoff request, and a turn the fake starts by itself after its message's work is over;
  - a build brief and a `/send --kind build` are writing turns, audited against their claims. So is a message sent again with r after an interrupted build brief;
  - a read-only turn that wrote nothing the audit covers adds no line.
- **M6-AC11** Failures of a read-only turn that wrote (NEW-2, PO-8, PO-1, MSG-9, WSP-10):
  - s stops it. What it wrote is reverted once, before g or a new message goes in, and the message ends as interrupted;
  - the fake dies in the middle of a tool call. What it wrote is reverted before the session is resumed;
  - the post office is killed mid-turn. Before it opens any channel, the next post office reverts the worktree from the start state on disk, and the message ends as interrupted with `the post office stopped unexpectedly`;
  - a start state that can't be saved keeps the message queued with the reason in its row, and nothing reaches the fake;
  - harness git is held when the turn ends. The message ends as interrupted, the queue is held, and the revert runs first once harness git goes on;
  - a file that another process holds open makes the revert fail. The path is named, and the queue is held and shows in the decisions list. The revert is tried again before the next message and after `/fresh`, and `/apply` is refused until it succeeds.
- **M6-AC12** Soldiers that can't write (NEW-3, WSP-11, WSP-1, ARM-6, VIS-2):
  - a fake claude soldier whose only role is review, at `auto`, opens each session in a snapshot under `~/.shadow-army/snapshots/`, outside the folder. It has no worktree or branch, and `/diff` and `/apply` say so. A file it writes there, a commit it makes, and a `.claude/settings.local.json` it writes are reported as a read-violation once the turn is over, and are gone before its next turn;
  - a fake codex soldier whose only role is review, at `full`, opens in its worktree, and every `turn/start` carries `readOnly`;
  - a fake agy opens in a snapshot at `supervised` and at `full`;
  - with the disk full, and again with harness git held, the claude fake's snapshot can't be made. It doesn't start and shows down with the reason. A message to it waits with the reason in its row, and r tries again. It never opens in the folder or in a worktree, or at another autonomy level.
- **M6-AC13** The guard and Shadow Army's own work (WSP-4, ARM-6, WSP-10, NEW-2):
  - one soldier's turn is open. Meanwhile harness git makes a snapshot for a second soldier and removes a third's, and a fourth soldier's build turn commits on its own branch. The first turn passes the guard with no card;
  - a read-only turn that moves another soldier's `shadow/*` branch raises its attribution card. One that moves its own branch raises none, and the move is reverted (NEW-2).

## Appendix A

- Line 904: `| WSP-4 | v1 #22; 2.0 GUARD-1 to GUARD-4 |` becomes `| WSP-4 | v1 #22; 2.0 GUARD-1 to GUARD-4, GUARD-6 |`.
- After line 911 (WSP-11), a new row: `| NEW-2 | v1 (CLAUDE.md design rules); v1 #16; 2.0 WS-2, WS-3 |`.
- After line 917 (ARM-6), two new rows: `| NEW-1 | v1 (`src/adapters/*.ts`: each level's flags for a task that doesn't write; `src/core/summon.ts`) |` and `| NEW-3 | v1 (CLAUDE.md design rules; `src/core/summon.ts`); 2.0 WS-3 |`.

---

# Sources

**The frozen spec, v0.8**, `C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@1580e87.md`, at these lines:
- 31, 40 (G2) and 60-79 (glossary);
- 145-166 and 176-182 (HOST);
- 192-204, 224 and 251-277 (PO);
- 288-292, 303-342 (CH; CH-7 at 329-331);
- 364-406 (MSG), 410 (SES-1), 431-436 (SES-6);
- 452-471 (ARM; ARM-5 at 459, ARM-6 at 460-471);
- 475-505 (WSP), 527 (VIS-2);
- 574-627 (§5.1), 856-870 (M6), 897-931 (Appendices A and B).

**v0.9**, `...\snapshots\v2@b6f4315.md`, at these lines:
- 205-209 (PO-1's cleanup, with snapshots);
- 335-337 (CH-7, a refused or differing mode);
- 466-478 (ARM-6: line 470 "as WSP-10 defines it", line 474 the trusted record);
- 500-509 (WSP-10: the metadata is `gitdir`, `commondir` and `config.worktree`, and HEAD is checked against the commit Shadow Army expects);
- 510-515 (WSP-11: `~/.shadow-army/snapshots/`, and Shadow Army's snapshots and worktrees are not the checkout).

**Review records**, under `C:\Users\johns\projects\AIConnections-review\docs\spec\review\`:
- settled.md:28, 30, 36-41;
- decisions.md, D-7 (options, the judge's note on kindless messages, R-F-58's glossary wording) and D-16 (claude's plan mode and classifier);
- raw\F-r1-verify-V6.md:10-16 (R-F-3 and options A to D);
- raw\D-7-option-A.md, read for its scope only, and not copied.

**Design rules**, `C:\Users\johns\projects\AIConnections\CLAUDE.md:56`: "Writes need the build role and `--write`".

**v1 code**, `C:\Users\johns\projects\AIConnections-review\src\`:
- core\summon.ts:63-65 and 67-85: a run writes only when asked to, in a worktree under claims;
- core\summon.ts:93-109: a read-only run at auto or full gets a snapshot of HEAD, and outside a repository falls back to supervised;
- core\summon.ts:144-161 and 197-207: the guard, then the audit reverts out-of-claim edits and commits what is left;
- workspace\guard.ts:14-21 and 50-54: only `refs/heads/shadow/*` is exempt;
- each level's flags in adapters\claude.ts:13-22 (`plan` for a task that doesn't write), codex.ts:11-20 (`read-only`; `--approve-for-me` at auto; `danger-full-access` with `never` at full), grok.ts:7-16 (`plan`) and agy.ts:11-13 (`--mode plan`).

**Roster**, in `C:\Users\johns\projects\AIConnections-review\`:
- orchestratorDelegate.md:10-30: claude-opus has review and build. agy has research and test with `write: false`;
- shadow.config.json:3-8: Kaisel and Iron are at auto; Igris, grok and agy are at full; Bellion has no level set, so it is supervised.

**2.0 spec**, `docs\legacy\spec\shadow-army-2.0.md`:
- :814: WS-1;
- :815-820: WS-2, a reset before every wake;
- :821: WS-3, "A non-ignored change after a read wake is a `read-violation`, and it is discarded";
- :834-840: WS-7;
- :1077: GUARD-6.

**Probe**, `C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\m0-report.md:55-61`: S5, where agy wrote a file with `--mode plan`.

**Vendor documentation:**
- [Claude Code, permission modes](https://code.claude.com/docs/en/permission-modes):
  - plan mode: "Auto mode available and the `useAutoModeDuringPlan` setting on, which it is by default: the classifier reviews shell commands … Approved commands run";
  - "Plan mode keeps its blocks wherever Claude Code runs without an interactive terminal, including non-interactive runs with `-p`";
  - dontAsk runs `permissions.allow` matches and "denies the built-in `AskUserQuestion` tool";
  - auto mode is available for the current Opus and Sonnet models.
- [Agent SDK, permissions](https://code.claude.com/docs/en/agent-sdk/permissions):
  - "Call … `setPermissionMode()` (TypeScript) to change the mode mid-session. The new mode takes effect immediately for all subsequent tool requests";
  - in plan mode, file edits and "shell commands that modify files, such as `touch` and `rm`", go to `canUseTool`.
- [Agent SDK, TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript): `setPermissionMode()` "only available in streaming input mode"; `SDKSystemMessage.permissionMode`; `SDKStatusMessage.permissionMode?`.
- [Claude Code, settings reference](https://code.claude.com/docs/en/settings-reference): `useAutoModeDuringPlan` scope "User, local, or managed".
- [Claude Code, sessions](https://code.claude.com/docs/en/sessions): permission mode on resume. With `-p`, passing `--permission-mode` sets it.
- [Codex app-server](https://learn.chatgpt.com/docs/app-server), redirected from developers.openai.com/codex/app-server:
  - per-turn overrides of the sandbox policy "become the defaults for later turns on the same thread";
  - the `readOnly` policy;
  - `item/permissions/requestApproval` with `scope: "session"`.
- [Codex sandboxing](https://learn.chatgpt.com/docs/sandboxing): "`read-only`: The agent can inspect files, but it can't edit files or run commands without approval"; Seatbelt, bubblewrap, and the native Windows sandbox; `never`.
- [Codex auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review): it evaluates "Shell or exec tool calls that request escalated sandbox permissions" and "File edits outside the allowed writable roots"; "If the action is approved, execution continues"; "With `approval_policy = "never"`, there is nothing to review".
- [Codex rules](https://learn.chatgpt.com/docs/agent-configuration/rules): "`allow`: Run the command outside the sandbox without prompting"; user rules, and trusted project rules.
- [Codex Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox): it enforces the active permissions for commands, and warns about folders writable by `Everyone`.
- [xAI Grok Build permissions](https://docs.x.ai/build/features/permissions) and [modes and commands](https://docs.x.ai/build/modes-and-commands): "only the session plan file can be edited until you approve. That file-edit gate is independent of the permission mode"; auto uses a classifier; always-approve.
- [ACP session modes](https://agentclientprotocol.com/protocol/session-modes): `availableModes`, `session/set_mode`, `current_mode_update`, and the `switch_mode` permission. Mode methods "will be removed in a future version" in favour of session config options.
- [Antigravity CLI headless](https://antigravity.google/docs/cli/headless): `control_request` or `control_response` events end the session; tools that need approval are soft-denied.

**NEEDS-PROBE** (each one is recorded as a contract fixture before M6):
1. claude: the exact stream-json control request behind `setPermissionMode()`, whether claude answers it between turns, and whether it reports the new mode. Also whether a mode change resets its prompt cache (SES-6).
2. claude: whether a shell command that claude doesn't recognize as writing runs under the classifier in plan mode at `auto` and `full`. D-16 and the docs say yes.
3. codex, on each system: whether `readOnly` set on one `turn/start` refuses a file edit and a shell write at `full`; whether a sandbox it can't enforce shows in the app-server events; and whether a `sandboxPolicy` change resets its cache.
4. codex: whether the MCP servers it starts run inside its sandbox; whether a worktree's `.codex/rules/` loads (project trust for that path); and whether an `acceptForSession` or session-scoped grant from a writing turn applies in a later `readOnly` turn. NEW-2 catches writes inside the worktree, but nothing catches writes elsewhere.
5. grok: whether `grok agent stdio` lists modes in `session/new` and accepts `session/set_mode`, and whether plan mode lets shell commands write at `auto` and `full`.
6. Any CLI: whether it writes into its working folder by itself, outside a tool call. Under this text, such a write would be reverted and reported as a read-violation.

**Where this draft reads the option, for the judge** (these are not arguments for C):
- **The audit runs in every case.** NEW-2 audits every read-only turn in a worktree, including one in a mode that holds, and at `supervised` too. The reasons:
  - no vendor mode holds against the owner's allow rules, `prefix_rule`s and hooks, which ADR-0010 keeps whole;
  - ARM-5 forbids writes outside a writing turn at every level;
  - without the audit, such a write would have no defined outcome, and could end up in the next writing turn's commit.
- **Practical reach.** As written, only codex's `readOnly` at `full` can hold, which today means Igris. Claude, grok and agy soldiers go exactly as option A's fallback. Codex's read-only turns can't run commands that write, tests included.
- **Kindless messages are read-only.** As in A, a message without a kind is read-only, the owner's typed messages included (ARM-5, from CLAUDE.md:56). This changes what the owner does to get a write, so the judge decides whether it needs a card.
- **Left open:**
  - where a writing turn's claims come from (HOST-10's `send` has no claims field);
  - D-16's choice of claude's mode at `supervised` (this text keeps CH-2's `plan`);
  - where WSP-1 puts worktrees. R-M1-76's reason for moving snapshots out of the folder applies to a worktree under the folder too;
  - a HEAD snapshot made when a long-lived session opens never sees the folder's later or uncommitted changes (WSP-6);
  - the start state and guard baseline are files a soldier running as the same user can reach (D-4's threat model).
