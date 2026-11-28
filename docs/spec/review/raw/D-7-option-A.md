# D-7 drafter, option A: under auto or full a soldier that can't write runs in a snapshot, and every read-only turn in a worktree is audited with no claims and reverted (NEW-1, NEW-2, M6). Against the frozen v0.8 snapshot (v2@1580e87). Cut off by the usage limit and resumed in the same session; 264,656 tokens at the end.

# D-7 option A, drafted as spec text (against v2@1580e87)

Where it goes: NEW-1 goes in §4.7 after ARM-6 (after line 471), and NEW-2 in §4.8 after WSP-11 (after line 505). The changed lines follow in spec order, each with the text it replaces, then the new ACs and Appendix A. Line numbers are the frozen snapshot's.

## New requirements

- **NEW-1** (M6; I, F) **Under `auto` or `full`, a soldier that can't write runs in a snapshot** (from v1's design rules and 2.0 WS-3).
  - A soldier can never take a writing turn (ARM-5) if it lacks the build role or if its entry in `orchestratorDelegate.md` says `write: false` (ARM-1). When such a soldier's autonomy is `auto` or `full`, it runs each session in its own throwaway snapshot, as agy does at every level (ARM-6).
    - The snapshot is of its base, the folder as it is when the session opens (WSP-6). It is made, kept and removed as WSP-11 says.
    - The soldier has no worktree and no branch (WSP-1), and `/diff` and `/apply` say so.
  - Every turn it takes is read-only. Once the turn is over (PO-8), and before anything else, its snapshot is put back and its writes are reported as WSP-11 says. The owner sees them as NEW-2 says.
  - The checkout guard covers each of its turns (WSP-4).
  - **No snapshot.** The soldier doesn't start, or doesn't start again after a crash, when its snapshot can't be made or is needed while harness git is held (WSP-10). Then:
    - it shows down (VIS-2) with the reason, and joins the decisions list as a channel down (HOST-14);
    - messages to it wait in its queue, and their rows say why, as in `waits · snapshot not made · disk full` (MSG-3);
    - its log and one line in Claude's transcript say why, and r tries again.

    It never runs in the folder or in a worktree instead, and its autonomy is never lowered so that it can start.
  - Where a soldier's sessions run is fixed for the post office's life. It comes from the roles and autonomy the post office read at its start (ARM-1).
  - At `supervised`, such a soldier runs in its worktree (WSP-1). Whatever any of its turns writes is reverted as NEW-2 says.

- **NEW-2** (M6; I, X, F) **A read-only turn's writes are reverted** (from v1's design rules, v1 #16 and 2.0 WS-3). Every read-only turn (ARM-5) that runs in a worktree is audited with no claims, at every autonomy level. That includes a builder's review, research or test brief.
  - **The start state.** Before the turn's message is recorded as delivered (MSG-4), the post office records the worktree as it is. The record holds:
    - the branch's tip, the worktree's `HEAD`, its index and its `.git` file;
    - a copy of each audited file that differs from `HEAD` or that git doesn't track.

    The record is on disk beside the guard's baseline (PO-8). If it can't be written, the message isn't sent: it stays queued, and its row says why, as in `waits · start state not written · disk full`. A turn the CLI starts by itself after its message's work is over (PO-8) starts from the state that the message's own turn was put back to.
  - **What is audited.**
    - Every path in the worktree that git tracks or lists as untracked.
    - The worktree's own copies of the paths ARM-6 hashes in the checkout, such as `.claude/`, `.mcp.json` and `.env*`, even where git ignores them.

    What git ignores is read from the start state's ignore rules, so an ignore rule the turn added hides nothing. Other paths git ignores, such as build output, caches and installed packages, are not audited. Whatever a read-only turn leaves there stays for the soldier's later turns, but never reaches its branch, `/diff` or `/apply` (WSP-9). That is a stated residual risk.
  - **The audit** runs once the turn is over (PO-8). It compares the worktree with the start state, never with the worktree's base. With no claims, every difference is out of scope.
  - **Reverted** means that the worktree is put back as the start state records it:
    - each audited path the turn created is removed. Each one it changed or deleted gets back the bytes and mode it had at the start: from `HEAD`, or from the copy where it wasn't committed then;
    - the soldier's branch, the worktree's `HEAD` and its index go back to where they were, so a commit the turn made is taken off the branch. A ref the turn changed outside its own branch is the guard's to handle (WSP-4);
    - everything the turn didn't change stays as it was. That covers the soldier's earlier work, whether or not a writing turn's audit committed it (WSP-2), the owner's edits made between turns, and ignored output;
    - nothing is removed or restored through a link (WSP-3). A link the turn left is removed without being followed. A worktree folder or `.git` file the turn replaced is put back before any harness git runs there;
    - the post office can't tell a change the owner makes in the soldier's worktree during the turn from the soldier's own, so that change is reverted too.
  - **Apply.** While a read-only turn of a soldier is open, and while its revert is pending, `/apply <soldier>` refuses and says why, as in `Kaisel's review turn is still open`. So nothing the turn committed reaches the folder (WSP-9).
  - **Each CLI.** This relies on no vendor mode (CH-7), so it works the same way for claude, codex and grok, whatever mode their autonomy chose (CH-2 to CH-5).
    - claude reloads its settings files when they change. A `.claude/` settings file that a read-only turn writes is therefore live for the rest of that turn, until the revert puts it back.
    - agy never takes a writing turn (ARM-2), and always runs in a snapshot (ARM-6).
  - **What the owner sees.** A read-violation is not an ending: the message ends as PO-8 says.
    - The soldier's log names each reverted path and what the turn did to it (created, changed or deleted), and each commit taken off the branch.
    - The summary card's changes fact says "none", then the read-violation and its paths (MSG-11).
    - Claude's transcript gets one line, as in `Kaisel · review turn wrote 2 files · reverted (read-violation) · src/a.ts, src/b.ts`.
    - An approval the owner gives during the turn (CH-6) answers only the CLI's request. The turn stays read-only, and whatever the approved tool wrote is reverted too.
    - A turn that changed nothing audited adds no line.
  - **Failures.**
    - The revert runs once, whether the turn completed, failed, was stopped (MSG-9) or was cut short by a crash (PO-8). It runs before the session is resumed, the channel restarted or the next message sent.
    - A post office that stops mid-turn leaves the start state on disk. The next post office reverts the turn from it before it opens any channel (PO-1).
    - While harness git is held (WSP-10), the revert waits. The turn's message ends as interrupted and the soldier's queue is held. Once harness git goes on, the revert runs before anything else, as WSP-10 says.
    - A revert can fail, as when another process holds a file open. Then it holds the soldier's queue (MSG-3), and the soldier's log and one line in Claude's transcript name each path still changed. It is tried again before any message goes in to that soldier, also after a fresh start (SES-5).

## Changed lines

**Glossary, Autonomy (line 60).** Replaces:
> - **Autonomy:** a soldier's permission level in `shadow.config.json`: `supervised`, `auto` or `full`, as in v1. It chooses only that CLI's documented flags (CH-7).

With:
- **Autonomy:** a soldier's permission level in `shadow.config.json`: `supervised`, `auto` or `full`, as in v1. Of the CLI's flags, it chooses only documented ones (CH-7). With `auto` or `full`, a soldier that can't write also runs in a throwaway snapshot (NEW-1). At every level, a read-only turn's writes are discarded or reverted (ARM-5, NEW-2).

**Glossary, Worktree (line 75).** Replaces:
> - **Worktree:** a soldier's own git worktree and branch, one per soldier per Claude session (WSP-1).

With:
- **Worktree:** a soldier's own git worktree and branch, one per soldier per Claude session, unless the soldier runs in a snapshot (WSP-1).

**Glossary, Snapshot (line 76).** Replaces:
> - **Snapshot:** a throwaway copy of a base, whose writes are discarded and reported (ARM-6, WSP-11).

With:
- **Snapshot:** a throwaway copy of a base. Its writes are discarded and reported once each turn is over (ARM-6, WSP-11, NEW-1).

**Glossary, Claims (line 78).** Replaces:
> - **Claims, claim audit:** the paths a writing turn may change, and the check, once the turn is over, of what it changed against them (WSP-2).

With these three entries:
- **Claims, claim audit:** the paths a writing turn may change, and the check, once the turn is over, of what it changed against them (WSP-2). A read-only turn in a worktree is audited with no claims (NEW-2).
- **Writing turn, read-only turn:** a turn whose message has the kind build is a writing turn. Every other turn is read-only, and its writes are discarded or reverted (ARM-5).
- **Read-violation:** a write that a read-only turn made in its snapshot or worktree, which is discarded or reverted and reported (WSP-11, NEW-2). Answering n on the attribution card also fails a turn as a read-violation (ARM-6).

**HOST-9 (line 164).** Replaces:
> - `/send` takes an optional kind of work, `/send <soldier> --kind <kind> <message>`, checked as ARM-2 says. With or without a kind, a `/send` message is the owner's own (MSG-7); a kind only adds ARM-2's check.

With:
  - `/send` takes an optional kind of work, `/send <soldier> --kind <kind> <message>`, checked as ARM-2 says. With or without a kind, a `/send` message is the owner's own (MSG-7). A kind adds ARM-2's check, and only `--kind build` makes a writing turn. Without it, the turn is read-only (ARM-5, →M6).

**HOST-10 (line 166).** Replaces:
> - `kind` is the kind of work the brief asks for: build, review, research or test. It is required, and the brief is checked against it before it is sent (ARM-2). The kind is checked and recorded (PO-6), never sent: the soldier receives only the brief's text.

With:
  - `kind` is the kind of work the brief asks for: build, review, research or test. It is required, and the brief is checked against it before it is sent (ARM-2). Only build makes a writing turn, so writing tests is a build; a turn of any other kind is read-only (ARM-5, →M6). The kind is checked and recorded (PO-6), never sent: the soldier receives only the brief's text.

**HOST-14 (line 177).** Replaces:
> - Everything that waits on the owner, across all soldiers, is in one list, oldest first: approval requests, the guard's attribution cards (ARM-6), handoffs ready, queues held after a stop, logins needed, channels down and messages not delivered.

With:
  - Everything that waits on the owner, across all soldiers, is in one list, oldest first: approval requests, the guard's attribution cards (ARM-6), handoffs ready, queues held after a stop or after a read-only turn's revert failed (NEW-2, →M6), logins needed, channels down and messages not delivered.

**PO-1 (line 204).** Replaces:
> - **After a post office that didn't close its channels.** Before it opens any channel, a post office finishes what the last one's records left open (PO-6, →M3). Each turn still open is finished (PO-8, →M2): its guard is closed against the baseline kept on disk for it, any change goes on that turn's attribution card (ARM-6, →M2), or before M2 into one line in Claude's transcript, and its message ends as interrupted. Each queued message ends as not delivered. Both carry the reason `the post office stopped unexpectedly`, and nothing is sent again by itself (MSG-4, →M3).

With:
  - **After a post office that didn't close its channels.** Before it opens any channel, a post office finishes what the last one's records left open (PO-6, →M3). Each turn still open is finished (PO-8, →M2):
    - its guard is closed against the baseline kept on disk for it, and any change goes on that turn's attribution card (ARM-6, →M2), or before M2 into one line in Claude's transcript;
    - a snapshot's writes are discarded and reported as WSP-11 says, and a read-only turn's writes in a worktree are reverted from the start state kept on disk for it (NEW-2, →M6);
    - its message ends as interrupted.

    Each snapshot whose session the last post office left open is then removed (WSP-11). Each queued message ends as not delivered. Both carry the reason `the post office stopped unexpectedly`, and nothing is sent again by itself (MSG-4, →M3).

**PO-6 (line 224).** Replaces:
> - **PO-6** (M3; U, F) **Records.** Every brief, summary and message is stored with its id, time, sender, recipient and delivery state, and a brief with its kind of work (HOST-10). Full reports go under `.shadow/reports/`.

With:
- **PO-6** (M3; U, F) **Records.** Every brief, summary and message is stored with its id, time, sender, recipient and delivery state. A brief, or a `/send` that gave a kind, is also stored with its kind of work (HOST-10; HOST-9, →M5). Full reports go under `.shadow/reports/`.

**PO-8, Finishing (line 267).** In that line, replaces the sentence:
> It closes the turn's checkout guard (ARM-6, WSP-4, →M6) and runs its claim audit (WSP-2, →M6), once each, on the files as they are then.

With:
It closes the turn's checkout guard (ARM-6, WSP-4, →M6). Then it runs the turn's claim audit (WSP-2, →M6), or for a read-only turn discards its snapshot's writes (WSP-11) or reverts its worktree (NEW-2, →M6). Each runs once, on the files as they are then.

**PO-8, interrupted (line 269).** In that line, replaces:
> The changes made so far stay, and the message's row shows them (MSG-4, →M3);

With:
The changes made so far stay, except in a snapshot (WSP-11) or after a read-only turn (NEW-2, →M6), and the message's row shows them (MSG-4, →M3);

**CH-7 (lines 329-331).** Adds a third bullet after line 331:
  - The read-only rule (ARM-5, NEW-1, NEW-2, →M6; ARM-6, →M2; WSP-11) works through where a session runs and through Shadow Army's own checks once each turn is over, never through a vendor's mode. No adapter passes, drops or switches a vendor flag or mode to enforce it. The rule therefore holds whatever the CLI's mode allows, as it must for agy (spike S5).

**MSG-3 (line 368).** Replaces:
> - A held queue waits for the owner instead: after a stop (MSG-9), and while a handoff card (SES-4, →M4) or an attribution card (ARM-6) is open.

With:
  - A held queue waits for the owner instead: after a stop (MSG-9), while a handoff card (SES-4, →M4) or an attribution card (ARM-6) is open, and after a read-only turn's revert failed (NEW-2, →M6).

**MSG-4, interrupted (line 373).** In that line, replaces:
> The turn may already have changed files, so the row shows the changes made since the turn began (MSG-11, →M6);

With:
The turn may already have changed files, so the row shows the changes made since the turn began, or for a read-only turn what was reverted (MSG-11, NEW-2, →M6);

**MSG-4, sending again (line 380).** Replaces:
> - r puts an interrupted message's text back in the field instead, above the changes its turn made (d). The owner edits it or keeps it, and Enter sends it as a new message with its own id. Its row says which message it repeats.

With:
    - r puts an interrupted message's text back in the field instead, above the changes its turn made (d). The owner edits it or keeps it, and Enter sends it as a new message with its own id. Its row says which message it repeats, and it takes that message's kind (ARM-5, →M6).

**MSG-9 (line 393).** Replaces:
> - The session stays open with its history, and the work done so far stays in the soldier's worktree. This is not starting fresh (SES-5, →M4).

With:
  - The session stays open with its history, and the work done so far stays in the soldier's worktree, except a read-only turn's writes, which are reverted (NEW-2, →M6). This is not starting fresh (SES-5, →M4).

**MSG-11 (line 403).** Replaces:
> - **changes:** the files and lines the turn changed on the soldier's branch, or "none";

With:
  - **changes:** the files and lines the turn changed on the soldier's branch, or "none". For a read-only turn that wrote, it says "none", then the read-violation and each path reverted (NEW-2);

**SES-1 (line 410).** Replaces:
> - **SES-1** (M4; I) **One session per soldier.** Each soldier has one open session per Claude session, and related work accumulates in it.

With:
- **SES-1** (M4; I) **One session per soldier.** Each soldier has one open session per Claude session, and related work accumulates in it. A builder's read-only briefs go to that same session, in its worktree (ARM-5, NEW-2, →M6). A soldier that runs in a snapshot keeps one snapshot for the session's life (WSP-11).

**ARM-2 (line 456).** Replaces:
> - A brief carries its kind of work (HOST-10). One whose kind the hard rules forbid (a review for grok, a build for agy), or that is not among the soldier's roles, is refused before it is sent, and the refusal says why.

With:
  - A brief carries its kind of work (HOST-10). A brief is refused before it is sent, and the refusal says why, in any of these cases:
    - its kind is one the hard rules forbid (a review for grok, a build for agy);
    - it is a build for a soldier whose entry says `write: false`, as v1 refuses one (ARM-1);
    - its kind is not among the soldier's roles.

**ARM-5 (line 459).** Replaces:
> - **ARM-5** (M6; I) **Writes need the build role**, and happen only in the soldier's own worktree, under its claims (from v1's design rules).

With:
- **ARM-5** (M6; U, I) **Writes need the build role**, and happen only in the soldier's own worktree, under its claims (from v1's design rules).
  - **A writing turn** is the turn of a message whose kind is build: the Monarch's brief (HOST-10), or the owner's `/send <soldier> --kind build` (HOST-9). ARM-2 has already refused such a message to any soldier that can't write.
  - **Every other turn is read-only.** That covers:
    - a brief whose kind is review, research or test;
    - a message with no kind: the owner's from the pane's field, a `/send` without `--kind` (MSG-7), a soldier's (MSG-6), and the request for a handoff summary (SES-4).

    So the owner's own writing turn goes through `/send <soldier> --kind build`.
  - **Who decides.** The post office decides, from the kind recorded with the message (PO-6), when the message goes in.
    - The soldier never sees the kind (HOST-10), and nothing it writes or does changes it.
    - A turn the CLI takes by itself belongs to its message and takes that message's kind (PO-8).
    - A message that repeats an interrupted one (MSG-4) takes the interrupted message's kind, and ARM-2 checks it again.
  - A read-only turn's writes are discarded in a snapshot (WSP-11, NEW-1) and reverted in a worktree (NEW-2). A writing turn is audited against its claims (WSP-2).

**ARM-6 (lines 460-462).** Replaces:
> - **ARM-6** (M2; I, X, F) **agy runs in a throwaway snapshot.**
>   - Every agy session runs in a read-only snapshot of its base, never in a worktree that merges.
>   - Any file it writes is discarded and reported as a read-violation (from 2.0 WS-3).

With:
- **ARM-6** (M2; I, X, F) **agy runs in a throwaway snapshot.**
  - Every agy session runs in a read-only snapshot of its base, never in a worktree that merges, at every autonomy level. The snapshot is made, kept and removed as WSP-11 says.
  - What it writes is discarded once each turn is over, and reported as a read-violation, as WSP-11 says (from 2.0 WS-3).

**ARM-6 (line 464).** Replaces:
> - The guard also hashes these paths, even where git ignores them or doesn't track them (from 2.0 GUARD-2, less its vendor home configs; the user's global git config is WSP-10's): the shared git config, `hooks/` and `info/`, and each worktree's metadata; `.githooks/`, `.claude/`, `.mcp.json` and `.env*`; and `AGENTS.md`, `CLAUDE.md`, `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` and `agent.md`.

With:
  - The guard also hashes these paths, even where git ignores them or doesn't track them (from 2.0 GUARD-2, less its vendor home configs; the user's global git config is WSP-10's):
    - the shared git config, `hooks/` and `info/`, and each worktree's metadata, less what WSP-10 exempts for Shadow Army's own snapshots and worktrees;
    - `.githooks/`, `.claude/`, `.mcp.json` and `.env*`;
    - `AGENTS.md`, `CLAUDE.md`, `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` and `agent.md`.

    Nothing inside Shadow Army's own snapshots and worktrees is a change to the checkout: what a soldier writes there falls under WSP-11 or NEW-2 (→M6).

**WSP-1 (line 475).** Replaces:
> - **WSP-1** (M6; I) One worktree per soldier per Claude session (from 2.0 WS-1).

With:
- **WSP-1** (M6; I) One worktree per soldier per Claude session (from 2.0 WS-1). A soldier that runs in a snapshot (ARM-6, NEW-1) has no worktree and no branch.

**WSP-2 (line 476).** Replaces:
> - **WSP-2** (M6; I) Claims, and the claim audit at the end of every writing turn (from v1 #16 and 2.0 WS-7). The audit runs once, when the turn is over (PO-8): after any background work the turn left running, and also for a turn that was cut short. It always runs before the soldier's next message.

With:
- **WSP-2** (M6; I) Claims, and the claim audit at the end of every writing turn (from v1 #16 and 2.0 WS-7). A read-only turn in a worktree is audited with no claims, and its writes are reverted (NEW-2). The audit runs once, when the turn is over (PO-8): after any background work the turn left running, and also for a turn that was cut short. It always runs before the soldier's next message.

**WSP-4 (line 478).** Replaces:
> - **WSP-4** (M6; I) The checkout guard (from v1 #22, and 2.0 GUARD-1 to GUARD-4). It covers every soldier's turns, with the scope, the trusted records and the attribution card that ARM-6 gives agy.

With:
- **WSP-4** (M6; I, X) The checkout guard (from v1 #22, and 2.0 GUARD-1 to GUARD-4 and GUARD-6). It covers every turn of every soldier, writing or read-only, at every autonomy level, with the scope, the trusted records and the attribution card that ARM-6 gives agy.
  - Shadow Army's own snapshots and worktrees are outside its scope (ARM-6, WSP-10).
  - Shadow Army's own branches (`shadow/*`) are exempt only for what harness git does to them, and for moves while their own soldier's turn is open. NEW-2 reverts a read-only turn's moves of its own branch.
  - Any other move of one of those branches is a change like any other and goes on the card, such as a commit one soldier makes on another soldier's branch (from 2.0 GUARD-6).

**WSP-10 (line 498).** Replaces:
> Before and after each command, the config git reads for that repository (every scope but the command line, includes followed, and any `config.worktree`), the shared `hooks/` and `info/`, and each worktree's metadata are compared with the state Shadow Army last trusted: their state when the post office started, or as the owner last accepted it (2.0 GIT-3). Changes to `branch.*` and `remote.*`, such as `git push -u` makes, don't count.

With:
  Before and after each command, these are compared with the state Shadow Army last trusted, meaning their state when the post office started or as the owner last accepted it (2.0 GIT-3):
  - the config git reads for that repository (every scope but the command line, includes followed, and any `config.worktree`);
  - the shared `hooks/` and `info/`;
  - each worktree's metadata.

  These changes don't count:
  - changes to `branch.*` and `remote.*`, such as `git push -u` makes;
  - for the snapshots and worktrees Shadow Army made and recorded, their making or removal by harness git, and what git writes in their metadata as a soldier or harness git works in them, such as `HEAD`, the index and logs. The design rules exempt Shadow Army's own worktrees.

  Their `config.worktree` and `commondir` still count, because they change what git runs and which repository it reads.

**WSP-11 (line 501).** Replaces:
> - **WSP-11** (M1; I, F) **Before a soldier has its worktree** (from v1's design rules). Until WSP-1 (→M6) gives each soldier its worktree, each session opens in its own throwaway snapshot of HEAD under `.shadow/v2/`, made by harness git (WSP-10) when the session opens and removed when it closes.

With:
- **WSP-11** (M1; I, F) **Snapshots** (from v1's design rules and 2.0 WS-3). Until WSP-1 (→M6) gives each soldier its worktree, each session opens in its own throwaway snapshot of HEAD under `.shadow/v2/`. Harness git (WSP-10) makes the snapshot when the session opens and removes it when the session closes. From M6 the same holds, with a snapshot of the soldier's base (WSP-6, →M6), for every soldier that runs in a snapshot: agy at every level (ARM-6, →M2), and a soldier that can't write, under `auto` or `full` (NEW-1, →M6).

**WSP-11 (line 504).** Replaces:
> - A file it writes in its snapshot is discarded before its next turn and reported as a read-violation, as ARM-6 (→M2) says for agy.

With:
  - Once each turn is over, and always before the next one, the snapshot is put back as it was made. That covers its files, ignored ones included, its index and its `HEAD`, so a commit made there goes too.
  - These changes are reported as a read-violation: a change to a path git doesn't ignore, by the snapshot's ignore rules as it was made; and a change to a path ARM-6 (→M2) hashes, such as `.claude/settings.local.json`. Other ignored output, such as build output and installed packages, is discarded without a report (2.0 WS-3: "a non-ignored change").
  - A snapshot whose session a post office left open when it stopped is handled by the next post office: once that turn is finished, it puts the snapshot back, reports what was written, and removes it (PO-1).

**WSP-11 (line 505).** Replaces:
> - The checkout guard covers each of its turns, from the moment its message goes in until its end event, or until its process tree has been ended. It covers the checkout and the paths that ARM-6 (→M2) hashes. Until the attribution card exists, any change it finds fails the turn: the soldier's log names each path, and Claude's transcript gets one line.

With:
  - The checkout guard covers each of its turns, from the moment its message goes in until its end event, or until its process tree has been ended. It covers the checkout and the paths that ARM-6 (→M2) hashes. It never covers what lies inside Shadow Army's own snapshots and worktrees, whose making, removal and metadata count as WSP-10 says. Until the attribution card exists, any change it finds fails the turn: the soldier's log names each path, and Claude's transcript gets one line.

**VIS-2, disconnected row (line 527).** Replaces:
> | disconnected | ✗ | `x` | down | its channel is down after three failed restarts (PO-1); r reconnects it |

With:
    | disconnected | ✗ | `x` | down | its channel is down after three failed restarts (PO-1), or its snapshot can't be made (NEW-1, →M6); r reconnects it |

**§5.1 Integration tests (line 591).** Replaces:
> - crash, restart and resume.

With:
  - crash, restart and resume;
  - a read-only turn that writes, at `auto`, both in a builder's worktree and in the snapshot of a soldier that can't write (NEW-1, NEW-2).

**§5.1 Security tests (adds a bullet after line 597):**
  - A read-only turn commits on its own branch, moves another soldier's branch, adds an ignore rule over a file it writes, and writes `.claude/settings.local.json` in its worktree. None of it reaches `/diff`, `/apply` or a later turn, and the branch move goes on its card (NEW-2, WSP-4).

**§5.1 Fault tests (line 619).** Replaces:
> - a broken link in a worktree.

With:
  - a broken link in a worktree;
  - a read-only turn that writes in a worktree holding uncommitted work, and is then stopped, dies in the middle of a tool call, or loses its post office;
  - a start state that can't be written, a revert that fails, and a snapshot that can't be made (NEW-1, NEW-2).

**M1-AC11 (lines 715-721).** Replaces the heading:
> - **M1-AC11** A fake claude soldier at `auto` (WSP-11, PO-1):

with `- **M1-AC11** A fake claude soldier at `auto` (WSP-11, WSP-10, PO-1):`. Adds, after line 717:
  - a commit it makes there is gone too, and so is output in a folder git ignores, which is not reported;

and adds, after line 721:
  - a snapshot made for a second soldier, and one removed, during its turn fail nothing;
  - the post office is killed mid-turn: before opening any channel, the next one puts the snapshot back, reports what was written, and removes it.

**M2-AC5 (lines 734-739).** Replaces the heading:
> - **M2-AC5** Fault tests with a fake agy (ARM-6):

with `- **M2-AC5** Fault tests with a fake agy (ARM-6, WSP-11, WSP-10):`. Adds, after line 735:
  - agy writes `.claude/settings.local.json`, which git ignores, in its snapshot: it is discarded and reported as a read-violation. A snapshot made and removed for another soldier during an agy turn raises no card;

**M6 Implements (line 856).** Replaces:
> Implements: WSP-1 to WSP-7, WSP-9; ARM-5; MSG-11; LEG-1; VER-10.

With:
Implements: WSP-1 to WSP-7, WSP-9, NEW-2; ARM-5, NEW-1; MSG-11; LEG-1; VER-10.

**M6-AC2 (line 859).** In that line, replaces:
> A soldier writes only in its own worktree under its claims, and only with the build role.

With:
A soldier writes only in its own worktree under its claims, only with the build role, and only in a turn whose kind is build.

## New ACs (append to M6, after line 870)

- **M6-AC9** A fake claude soldier whose only role is review, at `auto` and again at `full` (NEW-1, WSP-11, WSP-1, WSP-4):
  - each session opens in a snapshot of its base under `.shadow/v2/`, with no worktree and no branch;
  - a file it writes there, a commit it makes and a `.claude/settings.local.json` it writes are gone once the turn is over. Its log names each one as a read-violation, its summary card says so, and Claude's transcript gets one line;
  - what it writes in `node_modules/`, which git ignores, is gone too, with no report;
  - a checkout file it changes goes on its attribution card;
  - at `supervised`, the same soldier opens in its worktree, and what it writes is reverted as M6-AC10 says;
  - a snapshot that can't be made, or one needed while harness git is held, keeps it from starting. It shows down with the reason, a message to it waits with the reason in its row, and r tries again. It never opens in the folder or in a worktree.
- **M6-AC10** A fake claude builder (`build` and `review`) at `auto` takes a review brief. Its worktree holds a commit from an earlier writing turn, a file the owner changed between turns and left uncommitted, and a `dist/` folder git ignores (NEW-2, ARM-5, WSP-2):
  - in the turn it changes a tracked file, creates one, deletes one, changes the owner's file, adds an ignore rule and a file it covers, commits, writes `.claude/settings.local.json`, adds to `dist/`, and leaves a link to a checkout file;
  - once the turn is over, each of those paths is as it was at the start, the owner's change included. The link is gone and the file it named is unchanged. The branch's tip, `HEAD` and index are as at the start, and `/diff` shows only the earlier commit. What it added to `dist/` stays, unreported;
  - the message ends as answered. The card's changes fact says none, with the read-violation and its paths, and Claude's transcript gets one line. `/apply` during the turn is refused, saying why;
  - the same holds for a message typed into its field, a `/send` without a kind, a teammate's message, a handoff request, and, at `supervised`, a write the owner approved during a review turn;
  - a build brief and a `/send --kind build` are writing turns, audited against their claims. A message that repeats an interrupted build brief takes its kind;
  - a read-only turn that changes nothing audited adds no line.
- **M6-AC11** Fault tests with that builder's read-only turn after it wrote (NEW-2, PO-8, PO-1, MSG-9, WSP-10):
  - s stops it: its writes are reverted once, before the next message, and the message ends as interrupted;
  - the fake dies in the middle of a tool call: the turn is reverted before the session is resumed, and its message ends as interrupted;
  - the post office is killed mid-turn: before opening any channel, the next one reverts the turn from the start state on disk, and the message ends as interrupted, with `the post office stopped unexpectedly`;
  - a start state that can't be written keeps the message queued, with the reason in its row, and nothing reaches the fake;
  - harness git is held when the turn ends: the message ends as interrupted, the queue is held, and the revert runs before anything else once harness git goes on;
  - a revert that fails on a file another process holds open names the path and holds the queue. It is tried again before the next message, also after `/fresh`, and `/apply` refuses that soldier's work until it succeeds.
- **M6-AC12** The guard and Shadow Army's own work (WSP-4, WSP-10, ARM-6):
  - during one soldier's turn, harness git makes a snapshot for a second soldier and removes a third soldier's, and a builder commits on its own branch in its own writing turn. The first soldier's turn passes the guard with no card;
  - a read-only turn that moves another soldier's branch, or creates a tag, raises its attribution card;
  - a `config.worktree` or `commondir` written in a soldier's own worktree metadata holds harness git, and the log names it.

## Appendix A

- Line 904: `| WSP-4 | v1 #22; 2.0 GUARD-1 to GUARD-4 |` becomes `| WSP-4 | v1 #22; 2.0 GUARD-1 to GUARD-4, GUARD-6 |`.
- Line 911: `| WSP-11 | v1 (CLAUDE.md design rules; `src/core/summon.ts`) |` becomes `| WSP-11 | v1 (CLAUDE.md design rules; `src/core/summon.ts`); 2.0 WS-3 |`. A new row follows it: `| NEW-2 | v1 (CLAUDE.md design rules); v1 #16 (`src/workspace/audit.ts`); 2.0 WS-3 |`.
- After line 917 (ARM-6), a new row: `| NEW-1 | v1 (CLAUDE.md design rules; `src/core/summon.ts`); 2.0 WS-3 |`.

---

## Sources

- **The frozen spec**, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@1580e87.md, at these lines:
  - 40 (G2) and 60, 75-79 (glossary);
  - 164-166, 177 (HOST);
  - 204, 224, 251-277 (PO; 267, 269, 275 and 276 in particular);
  - 292 (CH-2), 329-331 (CH-7);
  - 366-380, 385, 393, 403 (MSG); 410, 421-425 (SES);
  - 455-471 (ARM), 475-505 (WSP), 527 (VIS-2);
  - 585-619 (§5.1); 715-721, 734-739, 856-870 (ACs);
  - 899-921 (Appendix A), 934 (rule 8);
  - 1081 (H28, keeping a violating snapshot, stays after v2.0, so reverted bytes are not kept).
- **Review records**, under C:\Users\johns\projects\AIConnections-review\docs\:
  - spec\review\settled.md:28, 30, 37-41;
  - spec\review\decisions.md:14, 185-195 (D-7, and the glossary wording from R-F-58);
  - spec\review\raw\F-r1-verify-V6.md:10-16 (R-F-3 and option A);
  - adr\0010-vendor-harnesses-stay-whole.md:11, adr\0013-v1-legacy-and-carry-overs.md:14-15, adr\0014-the-owner-steers.md:30.
- **v1 code**, C:\Users\johns\projects\AIConnections-review\src\:
  - core\summon.ts:63-64: a run writes only when asked to;
  - core\summon.ts:93-109: a read-only run at auto or full gets a snapshot of HEAD;
  - core\summon.ts:144-161, 188-195: the guard fails the run;
  - workspace\guard.ts:20-21, 50-54: only `shadow/*` refs are exempt;
  - workspace\audit.ts:18-22: the audit diffs against the worktree's base and skips ignored files through `--exclude-standard`;
  - workspace\audit.ts:51-70: reverts come from the base, and links are handled first;
  - workspace\audit.ts:77-87: what is left gets committed;
  - workspace\session.ts:59-67, 154-183: `.shadow/` ignores itself, and the order a run finishes in;
  - workspace\worktree.ts:38-40, 48-56: branches are `shadow/<soldier>/<task>`, and a snapshot is a detached worktree;
  - core\assign.ts:30-35: a write needs the build role and `write` not false;
  - adapters\claude.ts:12-20, codex.ts:11-19, grok.ts:7-15 and agy.ts:11-12: each level's flags. At auto and full every CLI can write, and codex's auto only inside its folder.
- **Roster**, in C:\Users\johns\projects\AIConnections-review\:
  - orchestratorDelegate.md:10-30, 62: Kaisel has review and build; agy has research and test with `write: false`, so test is read-only;
  - shadow.config.json:3-8.
- **2.0 spec**, C:\Users\johns\projects\AIConnections-review\docs\legacy\spec\shadow-army-2.0.md:
  - :814-821: WS-1 to WS-3. WS-3 reads "A non-ignored change after a read wake is a `read-violation`, and it is discarded";
  - :834-840: WS-7;
  - :1060: GIT-3, where a workspace's HEAD is checked against the commit the harness expects, not hashed;
  - :1063-1069: GUARD-2;
  - :1077: GUARD-6, where Shadow Army's refs are exempt only while they match its records.
- **Probes**, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\m0-report.md:
  - :60-61: agy writes even with `--mode plan`;
  - :39: grok's `signals.json` is "on disk", but where was not recorded.
- **Vendor documentation**, https://code.claude.com/docs/en/settings, on `.claude/settings.local.json`:
  - "Claude Code adds it to your global git excludes the first time it writes the file";
  - "Claude Code watches your settings files and reloads them when they change, so it applies most edits to the running session without a restart, including edits to `permissions`, `hooks`…";
  - "For the project's `.claude/` folder, it loads the file even when you create the folder in the same session."
- **NEEDS-PROBE:**
  - Does any CLI write into its working folder by itself, outside a tool call? grok's `signals.json` and agy's own files are the open cases. If one does, every read-only turn of that CLI reports a read-violation, and the revert removes the CLI's own file.
  - Does claude save an approval's "don't ask again" rule in the worktree's `.claude/`? If it does, NEW-2 reverts that rule after a read-only turn.
- **v0.8 text this draft does not change:**
  - Where a writing turn's claims come from: HOST-10's `send` has no claims field.
  - WSP-2's audit of a writing turn still diffs against the worktree's base and skips ignored `.claude/` files, as v1's does.
  - CH-2's `acceptEdits` "for a writing turn" at `supervised`, within one long-lived session (R-M1-24, D-16).
  - HOST-10 never sends the kind, so a builder is not told that a turn is read-only.
