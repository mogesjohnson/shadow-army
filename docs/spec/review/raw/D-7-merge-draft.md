D-7 merge drafter (spec-reviewer, Sonnet, effort high), against v0.12 (v2@2493a82.md), 2026-10-20; prompt in drafts/v013/PROMPTS.md; 350k tokens, 94 tool calls, 16.5 min


D-7 merge against v0.12 (snapshot v2@2493a82.md). Every OLD text was grepped and occurs once. Where I give a v0.12 line, it is that snapshot's. I could not run pairs.mjs (read-only). Placeholder IDs: NEW-D7-1 (a soldier that can't write runs in a snapshot), NEW-D7-2 (a read-only turn's writes in a worktree are reverted), NEW-D7-3 (the supervised per-turn mode). ACs are NEW-D7-AC1 to NEW-D7-AC6. Placement of the three requirements and of the ACs is in the first comment lines below.

Placement, all by anchors that don't overlap other blocks. NEW-D7-3 goes at the end of §4.3, after CH-10, before the §4.4 heading (it is M6; say CH-11 if numbered there). NEW-D7-1 goes at the end of §4.7, after ARM-7, before the §4.8 heading. NEW-D7-2 goes at the end of §4.8, after WSP-11, before the §4.9 heading. The ACs go after M6-AC11. M6-AC9 to M6-AC11 exist now, so the D-7 ACs are new, not M6-AC9 to M6-AC12.

Evidence codes: ARM-5 stays (M6; I) and WSP-4 stays (M6; I). A's U for ARM-5 and X for WSP-4 are not taken: the kind-to-turn rule is covered by NEW-D7-AC1, and the branch-move security test sits under NEW-D7-2's X. New: NEW-D7-1 (M6; I, F), NEW-D7-2 (M6; I, X, F), NEW-D7-3 (M6; C, I, F). C is for NEW-D7-3 because the vendor switches need recorded sessions.

BLOCKS (spec order)

Glossary, Autonomy (v0.12 line 61). R-F-58's wording is kept; I added the builder case, because a builder under auto runs in its worktree, not in a snapshot.
<<< OLD
It chooses only that CLI's documented flags (CH-7).
=== NEW
Among the CLI's flags it chooses only documented ones (CH-7); with `auto` or `full`, a read-only task also runs in a throwaway snapshot (NEW-D7-1), or, for a builder, is reverted in its worktree (NEW-D7-2).
>>> END

Glossary, Worktree (line 80).
<<< OLD
- **Worktree:** a soldier's own git worktree and branch, one per soldier per Claude session (WSP-1).
=== NEW
- **Worktree:** a soldier's own git worktree and branch, one per soldier per Claude session, unless the soldier runs in a snapshot (WSP-1, NEW-D7-1).
>>> END

Glossary, Claims (line 83), with two new entries after it.
<<< OLD
- **Claims, claim audit:** the paths a writing turn may change, and the check, once the turn is over, of what it changed against them (WSP-2).
=== NEW
- **Claims, claim audit:** the paths a writing turn may change, and the check, once the turn is over, of what it changed against them (WSP-2). A read-only turn in a worktree is audited with no claims (NEW-D7-2).
- **Writing turn, read-only turn:** a turn whose message has the kind build is a writing turn. Every other turn is read-only, and its writes are discarded or reverted (ARM-5).
- **Read-violation:** a write that a read-only turn made in its snapshot or worktree, which is discarded or reverted and reported (WSP-11, NEW-D7-2). Answering n on the attribution card also fails a turn as a read-violation (ARM-6).
>>> END

HOST-5, the g key: it also retries after a held mode or revert.
<<< OLD
g goes on: at the handoff card it keeps going, and after a stop it sends the held queue;
=== NEW
g goes on: at the handoff card it keeps going, after a stop it sends the held queue, and after a mode couldn't be set or a revert failed it tries again first (NEW-D7-3, NEW-D7-2, →M6);
>>> END

HOST-9, the command table's description of /send. This one is optional; it tells the owner that a typed message is read-only. It touches M5-AC1's screen snapshots of the slash menu.
<<< OLD
| `/send` | `<soldier> [--kind <kind>] <message>` | message a soldier yourself; Claude is told |
=== NEW
| `/send` | `<soldier> [--kind <kind>] <message>` | message a soldier yourself; it writes only with `--kind build`; Claude is told |
>>> END

HOST-9, the owner's answer: this reverses "a kind only adds ARM-2's check".
<<< OLD
With or without a kind, a `/send` message is the owner's own (MSG-7); a kind only adds ARM-2's check.
=== NEW
With or without a kind, a `/send` message is the owner's own (MSG-7). A kind adds ARM-2's check, and only `--kind build` makes a writing turn: without it the turn is read-only (ARM-5, →M6).
>>> END

HOST-10.
<<< OLD
The kind is checked and recorded (PO-6), never sent: the soldier receives only the brief's text.
=== NEW
Only build makes a writing turn, so writing tests is a build, and a brief of any other kind is a read-only turn (ARM-5, →M6). The kind is checked and recorded (PO-6), never sent: the soldier receives only the brief's text.
>>> END

HOST-14.
<<< OLD
queues held after a stop, logins needed, channels down and messages not delivered.
=== NEW
queues held after a stop, after a turn's mode couldn't be set (NEW-D7-3, →M6) or after a read-only turn's revert failed (NEW-D7-2, →M6), logins needed, channels down and messages not delivered.
>>> END

PO-1, a new bullet before the snapshot bullet (line 215), from C:133-136. It adds the hash check from R-F-88.
<<< OLD
In each snapshot the last one left (WSP-11; ARM-6, →M2), every write
=== NEW
In a worktree where the last one left a read-only turn open, the turn is reverted from the start state kept on disk for it, once the start state has passed its hash check (NEW-D7-2, →M6).
    - In each snapshot the last one left (WSP-11; ARM-6, →M2), every write
>>> END

PO-6. A `/send` that gave a kind is recorded with it, and one without a kind is recorded as having none. ARM-5 decides from this record.
<<< OLD
and a brief with its kind of work (HOST-10).
=== NEW
and a brief, or a `/send` that gave a kind, with its kind of work (HOST-10; HOST-9, →M5). A message with no kind is stored as having none, and its turn is read-only (ARM-5, →M6).
>>> END

PO-8, Finishing (line 286).
<<< OLD
It closes the turn's checkout guard (ARM-6, WSP-4, →M6) and runs its claim audit (WSP-2, →M6), once each, on the files as they are then.
=== NEW
It closes the turn's checkout guard (ARM-6, WSP-4, →M6). Then it runs the turn's claim audit (WSP-2, →M6) or, for a read-only turn, discards the writes in its snapshot (WSP-11) or reverts its worktree (NEW-D7-2, →M6). Each runs once, on the files as they are then.
>>> END

PO-8, interrupted (line 288).
<<< OLD
The changes made so far stay, and the message's row shows them (MSG-4, →M3);
=== NEW
The changes made so far stay, except in a snapshot (WSP-11) or after a read-only turn (NEW-D7-2, →M6), and the message's row shows them (MSG-4, →M3);
>>> END

PO-8, a turn the CLI starts by itself (line 294). It takes its message's kind, not C:159's "always read-only".
<<< OLD
it gets a guard and an audit of its own, the queue waits for its end event,
=== NEW
it takes that message's kind (ARM-5, →M6), it gets a guard and an audit of its own (after a read-only message, NEW-D7-2's, →M6), the queue waits for its end event,
>>> END

New requirement NEW-D7-3, inserted before the §4.4 heading. It fixes R-F-87 and covers R-M1-93.
<<< OLD
### 4.4 Standing instructions (SI)
=== NEW
- **NEW-D7-3** (M6; C, I, F) **At `supervised`, each turn runs in the mode its kind chooses, set between turns.**
  - The read-only rule never depends on a vendor's mode: it holds whatever mode the CLI runs in (NEW-D7-1, NEW-D7-2, CH-7). What this requirement sets is the mode at `supervised`, where v1 chooses a CLI's flags by its autonomy and by whether the task writes (`src/adapters/claude.ts`, `codex.ts`, `grok.ts`). From M6, a turn that doesn't write (ARM-5) and a writing turn each run in the mode v1 gives them:
    - claude: `plan` (CH-2), and `acceptEdits`;
    - codex: the `readOnly` sandbox policy, and `workspaceWrite`;
    - grok: `plan`, and `acceptEdits`.

    At `auto` and `full` no turn changes the CLI's mode: every turn runs in the mode its autonomy chose (CH-7).
  - **Set between turns.** The adapter sets a turn's mode after the turn before it is over (PO-8, →M2) and before its message goes in, so a mode never changes during a turn. It does so before every message, whatever mode it believes the CLI is in, because a CLI can leave a mode by itself (below). A turn the CLI starts by itself keeps its message's mode (PO-8, →M2).
    - claude: through the stream-json control request behind the Agent SDK's `setPermissionMode()`, which the SDK documents as taking effect immediately for all later tool requests.
    - codex: in the `sandboxPolicy` of the turn's own `turn/start`. codex keeps a turn's overrides as the thread's defaults for later turns, so every `turn/start` at `supervised` carries its turn's policy. The approval policy stays the autonomy's.
    - grok: through ACP's `session/set_mode`, to a mode that `session/new` lists.
  - **A message goes in only once the CLI has answered** the request that sets its turn's mode, which for codex is the `turn/start` that carries it. If the CLI refuses, or doesn't answer within 10 seconds on the monotonic clock, nothing is sent:
    - the message stays queued, and its row says why, as in `waits · mode not set · <the CLI's words>`;
    - the queue is held (MSG-3, →M3) and joins the decisions list (HOST-14, →M5);
    - the soldier's log and one line in Claude's transcript say so, and g tries again.
  - A CLI that has no way to set its mode in a live session, such as a grok that lists no modes, keeps the mode it opened in, and the soldier's log says so. The read-only rule still holds (NEW-D7-2). A mode that the CLI reports and that differs from the one set is logged as CH-7 says.
  - **A plan approved in claude.** In `plan`, a soldier can call ExitPlanMode. From M2, approving it through the relay (CH-6, →M2) may switch the live session out of `plan`, as the vendor's documentation says approving a plan does in an interactive session; whether it does in a stream-json `-p` session is for a probe (R-M1-93). Because the adapter sets the mode again before every message, a mode left that way lasts until the next message, and the turn stays read-only (NEW-D7-2).
  - **Cold.** A mode that differs from the one before is a change to the soldier's permission mode (SES-6, →M4).
  - **What the vendors document.** claude's `setPermissionMode()` is in the Agent SDK's permissions page, and codex's per-turn `sandboxPolicy` override in its app-server page. These are not documented: the control request that claude's CLI takes in stream-json for the first, and whether `grok agent stdio` lists modes and takes `session/set_mode` for the third, as ACP's session-modes page describes. A contract fixture shows each before M6 (section 5.1, C; VER-4).

### 4.4 Standing instructions (SI)
>>> END

CH-3 (codex).
<<< OLD
  - Usage and the context window come from `thread/tokenUsage/updated`.
=== NEW
  - Usage and the context window come from `thread/tokenUsage/updated`.
  - From M6, at `supervised` each `turn/start` carries its turn's `sandboxPolicy` (NEW-D7-3, →M6), because codex keeps a turn's overrides as the thread's defaults for later turns.
>>> END

CH-4 (grok).
<<< OLD
  - Usage comes from the prompt result's `_meta.usage`.
=== NEW
  - Usage comes from the prompt result's `_meta.usage`.
  - From M6, at `supervised` the adapter sets a turn's mode before `session/prompt` with ACP's `session/set_mode`, to a mode that `session/new` lists, and waits for the answer (NEW-D7-3, →M6).
>>> END

CH-6: the approval-card line from C:46.
<<< OLD
  - Each request is shown word for word, with the CLI's own options, and the owner's answer goes back unchanged.
=== NEW
  - Each request is shown word for word, with the CLI's own options, and the owner's answer goes back unchanged.
  - In a read-only turn (ARM-5, →M6), each request has one more line under it, Shadow Army's own and not the CLI's: `read-only turn: whatever this writes is reverted`. The answer still goes back unchanged, and whatever the approved tool writes is reverted, or discarded in a snapshot (NEW-D7-2, →M6; WSP-11).
>>> END

CH-7: a third bullet. This is the R-F-87 wording.
<<< OLD
the soldier's log and one line in Claude's transcript name both.
=== NEW
the soldier's log and one line in Claude's transcript name both.
  - The read-only rule (ARM-5, NEW-D7-1, NEW-D7-2, →M6) never depends on a vendor's mode. It works through where a session runs and through Shadow Army's own checks once each turn is over, so it holds whatever mode the CLI runs in, as it must for agy (spike S5). The one mode a turn's kind chooses is at `supervised`, between turns, as v1's flags do (NEW-D7-3, →M6); at `auto` and `full` no turn changes the CLI's mode. Apart from that, no adapter passes, drops or switches a vendor flag or mode to enforce the rule.
>>> END

MSG-3.
<<< OLD
after a stop (MSG-9), and while a handoff card (SES-4, →M4) or an attribution card (ARM-6) is open.
=== NEW
after a stop (MSG-9), while a handoff card (SES-4, →M4) or an attribution card (ARM-6) is open, after a turn's mode couldn't be set (NEW-D7-3, →M6), and after a read-only turn's revert failed (NEW-D7-2, →M6).
>>> END

MSG-4, interrupted.
<<< OLD
so the row shows the changes made since the turn began (MSG-11, →M6);
=== NEW
so the row shows the changes made since the turn began, or for a read-only turn what was reverted (MSG-11, NEW-D7-2, →M6);
>>> END

MSG-4, sending again.
<<< OLD
Its row says which message it repeats.
=== NEW
Its row says which message it repeats, and it takes that message's kind (ARM-5, →M6).
>>> END

MSG-7. Not in the plan, but the owner's answer needs it.
<<< OLD
as "you". Claude's transcript gets one line saying that soldier's context changed.
=== NEW
as "you". Such a message is a read-only turn unless `/send` gave it the kind build (ARM-5, →M6). Claude's transcript gets one line saying that soldier's context changed.
>>> END

MSG-9.
<<< OLD
and the work done so far stays in the soldier's worktree. This is not starting fresh
=== NEW
and the work done so far stays in the soldier's worktree, except a read-only turn's writes, which are reverted (NEW-D7-2, →M6). This is not starting fresh
>>> END

MSG-11.
<<< OLD
the files and lines the turn changed on the soldier's branch, or "none";
=== NEW
the files and lines the turn changed on the soldier's branch, or "none". For a read-only turn that wrote, it says "none", then `read-violation:` and each path reverted or discarded (NEW-D7-2, WSP-11);
>>> END

SES-6, adding C:227's "permission mode".
<<< OLD
**A change to the soldier's model, effort or tools** (MCP servers included) moves
=== NEW
**A change to the soldier's model, effort, tools or permission mode** (MCP servers included; a mode set for one turn, NEW-D7-3, →M6) moves
>>> END

ARM-2, the refusal for `write: false`.
<<< OLD
One whose kind the hard rules forbid (a review for grok, a build for agy), or that is not among the soldier's roles, is refused before it is sent, and the refusal says why.
=== NEW
A brief is refused before it is sent, and the refusal says why, when its kind is one the hard rules forbid (a review for grok, a build for agy), when it is a build for a soldier whose entry says `write: false` (ARM-1), or when its kind is not among the soldier's roles.
>>> END

ARM-5.
<<< OLD
- **ARM-5** (M6; I) **Writes need the build role**, and happen only in the soldier's own worktree, under its claims (from v1's design rules).
=== NEW
- **ARM-5** (M6; I) **Writes need the build role**, and happen only in the soldier's own worktree, under its claims, in a writing turn (from v1's design rules).
  - **A writing turn** is the turn of a message whose kind is build: the Monarch's brief (HOST-10), or the owner's `/send <soldier> --kind build` (HOST-9). ARM-2 has already refused such a message to any soldier that can't write.
  - **Every other turn is read-only.** That covers:
    - a brief whose kind is review, research or test;
    - a message with no kind: one the owner types in the pane's field or sends with `/send` and no `--kind` (MSG-7), a soldier's (MSG-6), and the request for a handoff summary (SES-4).

    So the owner's own writing turn always goes through `/send <soldier> --kind build`.
  - **The post office decides**, before the message goes in, from the kind recorded with the message (PO-6).
    - The soldier never receives the kind (HOST-10), and nothing it writes or does changes it.
    - A turn the CLI starts by itself takes the kind of the message it belongs to (PO-8).
    - A message the owner sends again with r takes the kind of the message it repeats, and ARM-2 checks it again (MSG-4).
  - A read-only turn's writes are discarded in a snapshot (WSP-11, NEW-D7-1) and reverted in a worktree (NEW-D7-2). A writing turn is audited against its claims (WSP-2).
>>> END

New requirement NEW-D7-1, inserted before the §4.8 heading. It fixes R-F-86.
<<< OLD
### 4.8 Workspaces and safety, carried over (WSP)
=== NEW
- **NEW-D7-1** (M6; I, F) **Under `auto` or `full`, a soldier that can't write runs in a snapshot** (from v1's design rules and 2.0 WS-3).
  - A soldier can never take a writing turn (ARM-5) when it lacks the build role, when its entry in `orchestratorDelegate.md` says `write: false` (ARM-1), or when it is agy (ARM-2). When such a soldier's autonomy is `auto` or `full`, it runs each session in its own throwaway snapshot, as agy does at every level (ARM-6). At `supervised`, any such soldier but agy runs in its worktree (WSP-1), and NEW-D7-2 reverts whatever its turns write.
  - **Where a session runs** is decided when it opens, from the soldier's roles, its `write` setting and its autonomy as the post office reads them then (ARM-1, ARM-7), and holds for that session's life, a resumed one included (CH-9, →M2).
  - **The snapshot** is of the soldier's base as WSP-6 defines it, and is made, kept and removed as WSP-11 says. The soldier has no worktree and no branch (WSP-1): `/diff` and `/apply` refuse and say so (WSP-9), as in `Kaisel has no branch · it runs in a snapshot`.
  - **Following the base.** Before each turn's message goes in, harness git (WSP-10) brings the snapshot to the soldier's base as WSP-6 defines it then, in the same folder, so the paths in the session's history still hold. The post office logs the commit (PO-5), and that is the HEAD WSP-10 expects there. So a review brief sent after the owner applied work (WSP-9) sees that work. If the snapshot can't be brought to the base, as on a full disk or while harness git is held (WSP-10), the message isn't sent: it stays queued, its row says why, as in `waits · snapshot not updated · disk full`, and it goes by itself once the snapshot can be brought.
  - **Every turn it takes is read-only.** Once the turn is over (PO-8), and before anything else, the snapshot is put back as it was before the turn: its files, ignored ones included, its index and its `HEAD`, so a commit made there goes too, and nothing a turn wrote reaches the next. What it wrote is reported as WSP-11 says. The checkout guard covers each of its turns (WSP-4).
  - **No snapshot.** A soldier whose snapshot can't be made, or is needed while harness git is held (WSP-10), doesn't start, whether it is a first start, a restart after a crash or a fresh start (WSP-11). Then:
    - it shows down (VIS-2) with the reason, and is among the channels down in the decisions list (HOST-14);
    - messages to it wait in its queue, and each row says why, as in `waits · snapshot not made · disk full` (MSG-3);
    - its log and one line in Claude's transcript say why, and r tries again.

    It never runs in the folder or in a worktree instead, and its autonomy is never lowered so that it can start.

### 4.8 Workspaces and safety, carried over (WSP)
>>> END

WSP-1.
<<< OLD
It stays, with its branch, for the owner.
=== NEW
It stays, with its branch, for the owner. A soldier that runs in a snapshot (ARM-6, NEW-D7-1) has no worktree and no branch.
>>> END

WSP-2.
<<< OLD
at the end of every writing turn (from v1 #16 and 2.0 WS-7).
=== NEW
at the end of every writing turn (from v1 #16 and 2.0 WS-7). A read-only turn in a worktree is audited as well, with no claims and against its own start state rather than the base, and its writes are reverted (NEW-D7-2).
>>> END

WSP-4. Evidence stays (M6; I). The "own snapshots and worktrees are not the checkout" bullet in A is dropped, because v0.12 line 721 has it. The ref coverage comes from v1's guard.
<<< OLD
The checkout guard (from v1 #22, and 2.0 GUARD-1 to GUARD-4). It covers every soldier's turns, with the scope, the trusted records and the attribution card that ARM-6 gives agy.
=== NEW
The checkout guard (from v1 #22, and 2.0 GUARD-1 to GUARD-4 and GUARD-6). It covers every turn of every soldier, writing or read-only, at every autonomy level and in every mode, with the scope, the trusted records and the attribution card that ARM-6 gives agy.
  - Inside a soldier's own worktree, a turn is checked by its claim audit (WSP-2) or, for a read-only turn, by NEW-D7-2. A `HEAD` that moved during a read-only turn is a write there.
  - Refs are covered too, as in v1 (`src/workspace/guard.ts`). Shadow Army's own branches (`shadow/*`) are exempt only for what harness git does to them and for moves of a soldier's own branch during that soldier's turn; NEW-D7-2 reverts a read-only turn's moves of it. Any other ref move, such as another branch, a tag, or one soldier's commit on another soldier's branch, is a change like any other and goes on the card.
>>> END

New requirement NEW-D7-2, inserted before the §4.9 heading. It fixes R-F-88 and covers R-M1-93.
<<< OLD
### 4.9 Security (SEC)
=== NEW
- **NEW-D7-2** (M6; I, X, F) **A read-only turn's writes in a worktree are reverted** (from v1's design rules, v1 #16 and 2.0 WS-3).
  - Every read-only turn (ARM-5) that runs in a worktree is audited with no claims, at every autonomy level and whatever mode the CLI is in. That covers a builder's review, research and test briefs and its other read-only messages, and each turn of a soldier that can't write and runs in its worktree at `supervised` (NEW-D7-1). Such a turn is one more turn of the soldier's one session (SES-1), in its one worktree.
  - **What is audited.**
    - Every path in the worktree that git tracks or lists as untracked.
    - The worktree's own copies of the paths ARM-6 hashes, such as `.claude/`, `.mcp.json` and `.env*`, even where git ignores them.

    What git ignores is read from the start state's ignore rules. Other ignored paths, such as build output, caches and installed packages, are not audited. Whatever a read-only turn leaves there stays for the soldier's later turns, though never on its branch or in `/diff` or `/apply` (WSP-9). That is a stated residual risk (Appendix D, residual 11).
  - **The start state.** Before the turn's message is recorded as delivered (MSG-4), the post office saves the worktree as it is. The start state holds:
    - the soldier's branch tip, the worktree's `HEAD`, its index and its `.git` file;
    - the bytes and mode of each audited file that differs from `HEAD` or that git doesn't track;
    - the ignore rules git reads there: its `.gitignore` files, `info/exclude` and the global excludes file. So an ignore rule that the turn adds hides nothing.

    It is written whole and flushed, beside the turn's guard baseline (PO-8) and outside every worktree and snapshot, and is kept until the turn's revert has run. The post office hashes it with SHA-256, and keeps the hash in memory and in the line that opens the turn (PO-5), written and flushed with that line. If the start state can't be written, or harness git is held (WSP-10), the message isn't sent: it stays queued, and its row says why, as in `waits · start state not written · disk full`.

    A turn the CLI starts by itself after its message's work is over (PO-8) has no message to wait for. It starts from the state that the post office saves, in the same way, once the message's own turn has been reverted. So an edit that the owner makes in that worktree after that point is reverted with that turn.
  - **The audit** runs once, when the turn is over (PO-8), after the turn's guard has closed and before anything else goes to the soldier. First the post office hashes the saved start state and compares the hash with the one it kept. Then it compares the worktree with the start state, never with the base. With no claims, every difference is a write.
  - **Reverted** means that the worktree goes back to the start state:
    - each audited path the turn created is removed, and each one it changed or deleted gets back its bytes and mode, from `HEAD` or, where it wasn't committed then, from the saved copy;
    - the soldier's branch, the worktree's `HEAD` and its index go back to where they were, so a commit the turn made leaves the branch. A ref the turn moved outside its own branch is the guard's (WSP-4);
    - everything the turn didn't change stays as it was: the soldier's earlier work, committed or not, the owner's edits made between turns, and ignored output;
    - nothing is removed or restored through a link (WSP-3). A link the turn left is removed without being followed. A worktree folder or `.git` file the turn replaced is put back before any harness git runs there;
    - an edit that the owner makes in that worktree during the turn can't be told from the soldier's, so it is reverted too, and no copy is kept.
  - **Apply.** While a read-only turn of a soldier is open, and while its revert is pending or has failed, `/apply <soldier>` refuses and says why, as in `apply waits · Kaisel's review turn is still open`. So nothing the turn committed reaches the folder (WSP-9).
  - **Each CLI.** This depends on no vendor's mode (CH-7), so it works the same way for claude, codex and grok. agy never takes a writing turn (ARM-2) and always runs in a snapshot (ARM-6), so this requirement doesn't apply to it.
    - claude reloads its settings files when they change, so a `.claude/` settings file that a read-only turn writes in the worktree is live for the rest of that turn, until the revert puts it back.
    - On Linux and macOS, claude keeps `.claude/settings.local.json` for a linked worktree at the main checkout's root, not in the worktree (CH-2). A write there, such as the rule that an approval's "don't ask again" saves, is outside the worktree: the revert doesn't undo it, and the checkout guard sees it only where that checkout is the folder (ARM-6, WSP-4).
    - An approval that the owner gives during the turn (CH-6) answers only the CLI's request. The turn stays read-only, and whatever the approved tool wrote in the worktree is reverted too. That holds if the approval leaves claude's `plan` mode (NEW-D7-3).
  - **What the owner sees.** A read-violation is not an ending: the message ends as PO-8 says.
    - The soldier's log names each reverted path and what the turn did to it (created, changed or deleted), and each commit taken off the branch.
    - The summary card's changes fact says "none", then `read-violation:` and the paths (MSG-11).
    - Claude's transcript gets one line, as in `Kaisel · review turn wrote 2 files · reverted (read-violation) · src/a.ts, src/b.ts`. Paths are shown as SEC-6 says.
    - A turn that changed nothing audited adds no line.
  - **Failures.** Whatever ends the turn, the audit and the revert run once, before the session is resumed, the channel restarted or the next message sent.
    - A stop (MSG-9, →M3), a crash in the middle of a tool call, or a turn cut short (PO-8, →M2) is reverted once the CLI's process tree has been ended (PO-1).
    - A post office that dies mid-turn leaves the start state on disk and its hash in the log. Before it opens any channel, the next one checks the hash and reverts the turn from the start state (PO-1), and the message ends as interrupted with `the post office stopped unexpectedly`.
    - While harness git is held (WSP-10), the revert waits. The message ends as interrupted, with the change named, and the queue is held. Once harness git goes on, the revert runs before anything else, as WSP-10 says.
    - A revert that fails, as when another process holds a file open, holds the soldier's queue (MSG-3), which joins the decisions list (HOST-14). The soldier's log and one line in Claude's transcript name each path still changed. The revert is tried again before any message goes in to that soldier, also after a fresh start (SES-5), which doesn't drop it, and `/apply` stays refused until it succeeds.
    - A start state whose hash doesn't match the one kept, or that is gone, is never restored from. The revert counts as failed, as in the previous bullet, and the log and Claude's transcript say that the start state changed. Trying again can't clear it: the soldier stays held, and the owner decides what to do with its worktree outside Shadow Army.

### 4.9 Security (SEC)
>>> END

VIS-2, the disconnected row.
<<< OLD
its channel is down after three failed restarts (PO-1); r reconnects it
=== NEW
its channel is down after three failed restarts (PO-1), or its snapshot can't be made (NEW-D7-1, →M6); r reconnects it
>>> END

§5.1 Integration tests (not on the orchestrator's list).
<<< OLD
  - crash, restart and resume;
=== NEW
  - crash, restart and resume;
  - a read-only turn that writes, at `auto`, both in a builder's worktree and in the snapshot of a soldier that can't write, and a turn's mode set between turns at `supervised` (NEW-D7-1, NEW-D7-2, NEW-D7-3);
>>> END

M3-AC5, so that ARM-2's new refusal has an AC.
<<< OLD
when its kind breaks a hard rule (a review for grok, a build for agy) or is not among the soldier's roles.
=== NEW
when its kind breaks a hard rule (a review for grok, a build for agy), is a build for a soldier whose entry says `write: false`, or is not among the soldier's roles.
>>> END

M6 Implements.
<<< OLD
Implements: PO-18, PO-20; WSP-1 to WSP-7, WSP-9; ARM-5; MSG-11; LEG-1; VER-10.
=== NEW
Implements: PO-18, PO-20; WSP-1 to WSP-7, WSP-9; ARM-5, NEW-D7-1, NEW-D7-2, NEW-D7-3; MSG-11; LEG-1; VER-10.
>>> END

M6-AC2.
<<< OLD
A soldier writes only in its own worktree under its claims, and only with the build role.
=== NEW
A soldier writes only in its own worktree under its claims, only with the build role, and only in a turn whose kind is build.
>>> END

New ACs, after M6-AC11.
<<< OLD
Closing the soldier leaves no process and no launchd job behind. The run is written up on the PR (PO-13, PO-18, VER-8).
=== NEW
Closing the soldier leaves no process and no launchd job behind. The run is written up on the PR (PO-13, PO-18, VER-8).
- **NEW-D7-AC1** The kind makes the turn, with a fake claude builder (`build` and `review`) at `auto` and a fake claude soldier whose entry says `write: false` (ARM-5, ARM-2, HOST-9, HOST-10, PO-6, MSG-4, MSG-7, PO-8):
  - a build brief and a `/send <soldier> --kind build` are writing turns: what they write stays in the worktree and is audited against its claims (WSP-2);
  - a review, a research and a test brief, a message typed in the pane's field, a `/send` without `--kind`, a teammate's `send` and a handoff request are read-only turns: what each writes is reverted as NEW-D7-AC2 says;
  - the record of each message holds its kind, or none (PO-6), and the fake's input holds the brief's text only, never the kind (HOST-10);
  - a message sent again with r after an interrupted build brief is a writing turn, and ARM-2 checks it again. One sent again after an interrupted review is read-only;
  - a turn the fake starts by itself after a build message's work is over is a writing turn, and after a review message a read-only one (PO-8);
  - a build brief, and a `/send --kind build`, for the `write: false` soldier is refused before it is sent, with the reason and no id (ARM-2).
- **NEW-D7-AC2** A builder's read-only turn is reverted (NEW-D7-2, ARM-5, WSP-2, MSG-4, MSG-11, CH-6, PO-5). The setup is a fake claude builder (`build` and `review`) at `auto`. Its worktree holds:
  - a commit from an earlier writing turn;
  - a tracked `src/a.ts` with an uncommitted change that the owner left;
  - an untracked `notes.md`;
  - a `dist/` folder that git ignores;
  - an ignored `.claude/settings.local.json`.

  Checks:
  - in a review turn the fake changes `src/a.ts` again, creates `src/new.ts` and adds it to `.gitignore`, deletes `README.md`, commits, rewrites `.claude/settings.local.json`, adds files to `dist/`, and replaces `notes.md` with a link to a checkout file;
  - once the turn is over, `src/a.ts` holds the owner's uncommitted change byte for byte and `src/new.ts` is gone. `README.md`, `.gitignore`, `notes.md` and `.claude/settings.local.json` are as they were at the start, and the checkout file is unchanged. The branch's tip, `HEAD` and index are as at the start, and `/diff` shows only the earlier commit. What the turn added to `dist/` stays, and no line reports it;
  - the start state is on disk outside the worktree, and the log line that opens the turn holds its hash;
  - the message ends as answered. The card's changes fact says none, then `read-violation:` and the paths. The log names each path as created, changed or deleted, and Claude's transcript gets one line. `/apply` is refused with its reason during the turn and until the revert has run;
  - an edit that the owner makes in the worktree during the turn is reverted too, with no copy kept;
  - the same holds for each kind of read-only message in NEW-D7-AC1, and for a turn the fake starts by itself after its message's work is over, which also reverts an edit that the owner made in the worktree after the first revert;
  - an approval request in the turn shows the line `read-only turn: whatever this writes is reverted`. At `supervised`, the owner approves a write in a review turn, and it is reverted too;
  - a read-only turn that changes nothing audited adds no line.
- **NEW-D7-AC3** Failures of a read-only turn that wrote, with that builder (NEW-D7-2, PO-8, PO-1, PO-5, MSG-9, MSG-3, WSP-10, HOST-14):
  - s stops it: its writes are reverted once, before the next message, and the message ends as interrupted;
  - the fake dies in the middle of a tool call: the turn is reverted before the session is resumed, and the message ends as interrupted;
  - the post office is killed mid-turn: before it opens any channel, the next one checks the start state against the hash in the log and reverts the turn from it, and the message ends as interrupted with `the post office stopped unexpectedly`;
  - a start state that can't be written keeps the message queued, with the reason in its row, and nothing reaches the fake. Harness git held at the start does the same;
  - harness git is held when the turn ends: the message ends as interrupted, the queue is held, and the revert runs before anything else once harness git goes on;
  - a revert that fails on a file another process holds open names the path, holds the queue and shows in the decisions list. It is tried again before the next message and after `/fresh`, and `/apply` refuses that soldier's work until it succeeds;
  - the fake rewrites the start state's copy of `src/a.ts` during the turn, in one case; in another the post office is killed and the copy is changed before the next one starts. Each time the revert counts as failed and restores nothing from that copy. The queue is held, `/apply` is refused, and the log and Claude's transcript say that the start state changed.
- **NEW-D7-AC4** Soldiers that can't write (NEW-D7-1, WSP-11, WSP-1, WSP-6, WSP-4, ARM-6, VIS-2, HOST-14, MSG-3):
  - a fake claude soldier whose only role is `review`, at `auto` and again at `full`, opens each session in a snapshot under `~/.shadow-army/snapshots/`, outside the folder, with no worktree and no branch. `/diff` and `/apply` refuse and say so;
  - a file it writes there, a commit it makes, a `.claude/settings.local.json` it writes and a file in a folder git ignores are gone once the turn is over, before its next turn. The first three are reported as read-violations in its log, on its summary card and in one line in Claude's transcript. A checkout file it changes goes on its attribution card;
  - between two of its turns the owner applies work to the folder (WSP-9). Before the next message goes in, the snapshot is at the base as the folder is then, in the same folder, so a path from the earlier turn still resolves. The log has the commit, and the guard raises nothing for the moved `HEAD`. If the post office is killed after that, the next one expects that commit;
  - a snapshot that can't be brought to its base keeps the message queued with the reason in its row, with the disk full and again with harness git held, and the message goes once it can;
  - a fake agy does the same at `supervised`, `auto` and `full`;
  - at `supervised`, the same claude fake opens in its worktree, and what it writes is reverted as NEW-D7-AC2 says;
  - with the disk full, and again with harness git held, the snapshot can't be made at a first start, after a crash and after `/fresh`. The soldier doesn't start. It shows down with the reason, among the channels down in the decisions list, and a message to it waits with the reason in its row. r tries again. It never opens in the folder or in a worktree, or at another autonomy level;
  - the owner trusts a changed `shadow.config.json` that gives this soldier a different autonomy (ARM-7): its open session stays where it is, and its next fresh session runs where the new autonomy says.
- **NEW-D7-AC5** The guard and Shadow Army's own work (WSP-4, WSP-10, ARM-6, NEW-D7-2):
  - during one soldier's turn, harness git makes a snapshot for a second soldier, removes a third soldier's and brings a fourth's to its base, and a builder commits on its own branch in its own writing turn. The first soldier's turn passes the guard with no card;
  - a read-only turn that moves another soldier's branch, or creates a tag, raises its attribution card. One that moves its own branch raises none, and the move is reverted;
  - a `config.worktree` or `commondir` written in a soldier's own worktree metadata holds harness git, and the log names it.
- **NEW-D7-AC6** The mode at `supervised`, with fake claude, codex and grok builders (`build` and `review`) (NEW-D7-3, CH-2, CH-3, CH-4, CH-7, SES-6, MSG-3, HOST-14):
  - the claude fake gets the request that sets `acceptEdits` before a build brief and the one that sets `plan` before a review brief or a message from the pane's field. Each message goes in only after the fake has answered. At `auto` and at `full` it gets no mode request for any turn;
  - the codex fake's `turn/start` carries the `workspaceWrite` policy for a build brief and the `readOnly` policy for a review brief, each with the autonomy's approval policy. At `auto` and `full` every `turn/start` carries the one policy its autonomy chose;
  - the grok fake gets `session/set_mode` before each message. One that lists no modes keeps the mode it opened in, and its log says so; its read-only turns are still reverted;
  - a fake that refuses the request, and one that doesn't answer within 10 seconds on a fake clock, get no message. The message stays queued with `waits · mode not set` and the CLI's words in its row, the queue is held and shows in the decisions list, and g tries again;
  - in a review turn of the claude fake, the owner approves ExitPlanMode and the fake leaves `plan`. What it writes afterwards is reverted, and the next message first gets the request that sets `plan` again;
  - a mode that differs from the one before gives `cache unknown · permission mode changed`, unless the adapter's table says otherwise (SES-6);
  - the owner records, with their go, one stream-json claude session in `plan` with ExitPlanMode allowed through `can_use_tool`, and checks whether the next edit runs; and one claude, one codex and one grok session with a mode set between two turns. The recordings are written up on the PR (VER-4, VER-8).
>>> END

Appendix A, WSP-4.
<<< OLD
| WSP-4 | v1 #22; 2.0 GUARD-1 to GUARD-4 |
=== NEW
| WSP-4 | v1 #22; 2.0 GUARD-1 to GUARD-4, GUARD-6 |
>>> END

Appendix A, rows for the new requirements.
<<< OLD
| WSP-11 | v1 (CLAUDE.md design rules; `src/core/summon.ts`) |
=== NEW
| WSP-11 | v1 (CLAUDE.md design rules; `src/core/summon.ts`) |
| NEW-D7-1 | v1 (CLAUDE.md design rules; `src/core/summon.ts`); 2.0 WS-3 |
| NEW-D7-2 | v1 (CLAUDE.md design rules); v1 #16; 2.0 WS-3 |
>>> END

Appendix D, row 7, the control cell.
<<< OLD
What a soldier writes in its snapshot is discarded and reported (WSP-11, ARM-6). Writes need the build role, and stay in the soldier's worktree under its claims (ARM-5, ARM-2, WSP-2).
=== NEW
What a soldier writes in its snapshot is discarded and reported (WSP-11, ARM-6), and a soldier that can't write runs in one under `auto` or `full` (NEW-D7-1). Writes need the build role and a message of the kind build, and stay in the soldier's worktree under its claims (ARM-5, ARM-2, WSP-2); what a read-only turn writes there is reverted (NEW-D7-2).
>>> END

Appendix D, row 7, the evidence and outcome cells.
<<< OLD
WSP-5 (I, F); M1-AC11, M2-AC5, M3-AC5, M6-AC2, M6-AC5, M6-AC7 | prevented through Shadow Army's own paths; a direct write is row 6
=== NEW
WSP-5 (I, F), NEW-D7-1 (I, F), NEW-D7-2 (I, X, F); M1-AC11, M2-AC5, M3-AC5, M6-AC2, M6-AC5, M6-AC7, NEW-D7-AC1 to NEW-D7-AC5 | prevented through Shadow Army's own paths, except residual 11; a direct write is row 6
>>> END

Appendix D, residual 6.
<<< OLD
turn `useAutoModeDuringPlan` off (CH-2).
=== NEW
turn `useAutoModeDuringPlan` off (CH-2). What such a command writes in a read-only turn is discarded in a snapshot or reverted in a worktree (NEW-D7-1, NEW-D7-2), but not what it does outside them (the paragraph below).
>>> END

Appendix D, residuals 11 and 12 before the paragraph, with the paragraph's heading changed. Residual 10 is the orchestrator's and sits above, so the blank line before residual 11 makes a loose list.
<<< OLD
**Pending the owner's answer to D-7** (this paragraph is replaced once D-7 is answered). Under
=== NEW
11. **What a read-only turn leaves where git ignores files** (D-7). NEW-D7-2 reverts a read-only turn's writes in a builder's worktree, except where git ignores files. So:
    - what a read-only turn writes where git ignores files (build output, caches, installed packages) stays in a builder's worktree for its later turns, though never on its branch or in `/apply`;
    - an edit the owner makes in a soldier's worktree during its read-only turn is reverted, and no copy is kept;
    - a `.claude/` settings file that a read-only turn writes takes effect until the revert.
12. **The start state and the guard's baseline are files the soldier's user can write** (NEW-D7-2; for the owner to accept). Soldiers run as the owner. The post office checks the start state against a hash that it keeps in memory and in the log line that opens the turn, so a rewrite while the post office runs is found, and the revert restores nothing from it. A post office that died has only the log's hash to check against, and the log is a file the soldier can write too. The guard's baseline (PO-8) has the same exposure and no hash. A turn that rewrites both could get its own copy restored as the builder's work. Also, an edit that the owner makes in a worktree after a read-only turn's revert is reverted with a turn the CLI then starts by itself; the D-7 card did not state this.

**Writes outside the snapshot, the worktree and the checkout** (D-4, D-19). Under
>>> END

Appendix D, the end of the paragraph. The three bullets are removed, because they are now residual 11.
<<< OLD
This holds whatever D-7's answer. If the read-only rule reaches every soldier (D-7), three more things remain:
- what a read-only turn writes where git ignores files (build output, caches, installed packages) stays in a builder's worktree for its later turns, though never on its branch or in `/apply`;
- an edit the owner makes in a soldier's worktree during its read-only turn is reverted, and no copy is kept;
- a `.claude/` settings file that a read-only turn writes takes effect until the revert.
=== NEW
A read-only turn's snapshot and its revert don't reach them either (NEW-D7-1, NEW-D7-2).
>>> END

OVERLAP with the orchestrator:

PO-5 (the opening line of a turn). Two clauses of line 239.
<<< OLD
with where its guard's baseline is kept (WSP-11),
=== NEW
with where its guard's baseline is kept (WSP-11) and, for a read-only turn in a worktree, where its start state is kept and that start state's hash (NEW-D7-2, →M6),
>>> END

<<< OLD
with the commit it was made at and its metadata,
=== NEW
with the commit it was made at or, for a snapshot, brought to (NEW-D7-1, →M6) and its metadata,
>>> END

CH-2, the mode passed (line 471).
<<< OLD
or `acceptEdits` for a writing turn (ARM-5, →M6);
=== NEW
and from M6 `acceptEdits` for a writing turn (ARM-5, →M6), set inside the live session before its message goes in (NEW-D7-3, →M6);
>>> END

CH-2, the classifier's writes (line 473).
<<< OLD
where its writes are reported as WSP-11 says.
=== NEW
where its writes are discarded and reported as WSP-11 says in a snapshot, and reverted as NEW-D7-2 says (→M6) in a worktree.
>>> END

ARM-6 (line 655), for R-F-86.
<<< OLD
read-only snapshot of its base, never in a worktree that merges.
=== NEW
read-only snapshot of its base, never in a worktree that merges. From M6 the snapshot is brought to the base again before each turn (NEW-D7-1, →M6).
>>> END

WSP-11 (line 711), the first line extended to M6 (C:299).
<<< OLD
made by harness git (WSP-10) when the session opens and removed when it closes.
=== NEW
made by harness git (WSP-10) when the session opens and removed when it closes. From M6 the same holds, with a snapshot of the soldier's base (WSP-6, →M6), for every soldier that runs in a snapshot: agy at every level (ARM-6, →M2), and a soldier that can't write, under `auto` or `full` (NEW-D7-1, →M6). NEW-D7-1 also says how the snapshot follows the base from turn to turn.
>>> END

§5.1 Contract tests (C).
<<< OLD
  - a session that goes cold.
=== NEW
  - a session that goes cold;
  - for claude, codex and grok at `supervised`, one session with a writing turn and a read-only turn, each in the mode NEW-D7-3 sets: for claude the control request and its answer, for codex both turns' `turn/start`, and for grok `session/set_mode` where `session/new` lists modes.
>>> END

§5.1 Security tests (X).
<<< OLD
  - The mod has no approval path.
=== NEW
  - The mod has no approval path.
  - A read-only turn does each of these: commits on its own branch, moves another soldier's branch, adds an ignore rule over a file it writes, replaces a file with a link to a checkout file, and writes `.claude/settings.local.json` in its worktree. None of it reaches `/diff`, `/apply` or a later turn, the checkout file is unchanged, and the other branch's move is on the attribution card (NEW-D7-2, WSP-4). A start state that the turn rewrote is not restored from (NEW-D7-2).
>>> END

§5.1 Fault tests (F).
<<< OLD
  - a broken link in a worktree;
=== NEW
  - a broken link in a worktree;
  - a read-only turn that writes in a worktree holding uncommitted work, and is then stopped, killed in the middle of a tool call, or cut short when the post office dies (NEW-D7-2);
  - a start state that can't be written, a revert that fails, a start state that fails its hash, a mode the CLI refuses or doesn't confirm, and a snapshot that can't be made or brought to its base (NEW-D7-1, NEW-D7-2, NEW-D7-3);
>>> END

PARTS OF THE MERGE PLAN (decisions.md 229-243)

Take from A:
- NEW-1: taken as NEW-D7-1. Changes: it covers agy through "as agy does". "Where it runs" is decided at each session's open, not "fixed for the post office's life", because ARM-7 re-reads the policy files for a fresh session. R-F-86's bring-to-base is added.
- NEW-2: taken as NEW-D7-2, with C's start-state parts and R-F-88's hash.
- ARM-5's writing turn: taken.
- ARM-2's refusal for `write: false`: taken, with M3-AC5.
- Lines for WSP-1, WSP-2, HOST-14, MSG-3, MSG-4 (two), MSG-9, MSG-11: taken.
- WSP-4 (2.0 GUARD-6): taken, but only the branch and ref bullets. Its "own snapshots and worktrees are outside the scope" bullet is already v0.12 line 721.
- Glossary entries: taken. R-F-58 is in the Autonomy entry, extended by the builder case. The Snapshot entry (line 81) is the orchestrator's.
- §5.1: taken (I, F, plus X and C in OVERLAP).
- New ACs: taken as NEW-D7-AC1 to NEW-D7-AC6, not M6-AC9 to M6-AC12. A's M6-AC12 became NEW-D7-AC5. NEW-D7-AC1 (the kind) and NEW-D7-AC6 (the mode) are new.
- Taken beyond the plan's list, because the owner's answer or the new text needs them: HOST-9 (the reversal, plus the optional command-table description), HOST-10, PO-6 (a `/send` kind is recorded), PO-8 (three places), CH-7, VIS-2, M6 Implements, M6-AC2, Appendix A.
- SES-1: left out. Its content (a builder's read-only briefs are turns of the same session; a snapshot soldier keeps one snapshot per session) is in NEW-D7-2's first bullet and NEW-D7-1.

Dropped because v0.12 already has it:
- the snapshot outside the folder: line 712;
- writes found after each turn and discarded before the next: line 720;
- a moved HEAD is a write: lines 708 and 720;
- a restart's old snapshot: line 713;
- a dead post office's snapshots: PO-1, line 215;
- each snapshot logged with its commit: PO-5, line 239;
- what harness git trusts after its own command: lines 708 and 662;
- `.shadow/v2/` and Shadow Army's own folders are not the checkout: line 721;
- no start while harness git is held: line 710;
- most of A's M1-AC11 additions: lines 952-962, where line 954 covers a file and a commit gone after the turn.

Not merged because v0.12 contradicts it:
- snapshots under `.shadow/v2/`: line 712 puts them under `~/.shadow-army/snapshots/`;
- A's WSP-10 exemption for what git writes in a worktree's metadata: line 708 says metadata is `gitdir`, `commondir` and `config.worktree`;
- ARM-6's "less what WSP-10 exempts": line 658;
- A's PO-1 paragraph: it became one bullet.

Take from C:
- The between-turn mode switch at supervised only: NEW-D7-3, with CH-2, CH-3, CH-4 and SES-6's "permission mode". There is no holding table. It sets the mode before every message, not "after each writing turn". C restores the mode afterwards because C:159 makes a self-started turn read-only; that part is left out, and a self-started turn keeps its message's mode.
- The start state flushed to disk outside any worktree or snapshot, with the ignore rules (C:64-68): taken.
- Nothing sent while harness git is held (C:70): taken.
- C:72, the owner's edit reverted with a self-started turn: taken, but see finding 5.
- WSP-11's first line extended to M6's snapshot soldiers (C:299): taken (OVERLAP).
- PO-1's bullet (C:133-136): taken.
- WSP-4's "a HEAD that moved during its read-only turn is a write there" (C:292): taken.
- The approval card's line (C:46): taken in CH-6.
- M6-AC10's setup and checks: taken as NEW-D7-AC2. M6-AC12's claude case at `~/.shadow-army/snapshots/`: taken in NEW-D7-AC4. M6-AC9's supervised cases: taken in NEW-D7-AC6.

Left out of C:
- the holding table and read-only modes at auto and full;
- NEW-3's worktree for a codex soldier that can't write;
- CH-7's "a turn's kind also chooses" at every level;
- C:159.

Optional, not taken:
- Report only non-ignored paths plus the paths ARM-6 hashes, and discard other ignored output unreported (A:266). It is technical and not the owner's, and it would edit WSP-11 line 720 and M1-AC11, which the orchestrator owns. See finding 8.
- The start state also lists ignored files, and the revert removes those the turn created. Not taken, because the owner accepted the residual "as the card stated it".

The judge's R-F-86, R-F-87 and R-F-88: fixed as proposed. Where each lives:
- R-F-86: NEW-D7-1 "Following the base", ARM-6 line 655, WSP-11 line 711, PO-5.
- R-F-87: NEW-D7-3, CH-7's bullet, CH-2, CH-3, CH-4, SES-6.
- R-F-88: NEW-D7-2 "The start state", "The audit" and "Failures", PO-5, PO-1, residual 12.
- R-M1-93: NEW-D7-3's "A plan approved in claude" bullet, NEW-D7-2's "Each CLI" bullet and NEW-D7-AC6's last bullet. It is stated as a probe and not settled.

COULDN'T PLACE
- A definition of "base". v0.12 never defines it: only "a throwaway copy of a base" (line 81), "its base" (lines 655 and 699) and WSP-6's "the folder as it is". See finding 1.
- Probes for the three mode switches. They are in NEW-D7-3 and NEW-D7-AC6, but not as an open question. A new Q10 after Q9 would be the orchestrator's numbering.
- A glossary entry for "start state". Glossary additions are on the orchestrator's side, so I left it.
- A fix for "g tries again" on a held queue. HOST-5 and the two requirements name g, but MSG-9 describes g only as "sends the held queue". I changed HOST-5 only.

FINDINGS (review schema, against v0.12)

- severity: P2
  type: ambiguity
  location: WSP-6 (docs/spec/v2.md:692), WSP-11 (711), glossary Snapshot (81), NEW-D7-1
  claim: "Base" is undefined, so "bring the snapshot to the base as WSP-6 defines it" has no definition. WSP-6 says only "the folder as it is", and WSP-11 makes the snapshot "of HEAD" with harness git.
  scenario: the owner has an uncommitted fix in the folder and the Monarch briefs a review-only soldier at auto. Reading A: the snapshot is the committed HEAD, so the reviewer reviews the old code. Reading B: the snapshot includes the uncommitted folder state, so harness git needs a stash-like commit that nothing specifies.
  evidence: lines 692, 711, 81, 655, 699; R-F-86's fix says "the soldier's base as WSP-6 defines it then".
  fix: decision: A, base = the commit the folder's branch stands at (HEAD), and the owner's uncommitted work is not seen; B, base = HEAD plus the folder's uncommitted and untracked files, made by a defined harness git step.

- severity: P2
  type: vendor-fact
  location: NEW-D7-2 "Each CLI" (drafted); A:44; CH-2 line 475
  claim: On Linux and macOS, claude keeps `.claude/settings.local.json` for a linked worktree at the main checkout's root, so a write there, such as the rule an approval's "don't ask again" saves, is outside the worktree and the revert can't undo it.
  scenario: a builder at supervised takes a review turn; the owner chooses "don't ask again" on a shell approval. The rule lands in the owner's main checkout `.claude/settings.local.json`; the revert in the worktree leaves it, so it applies to the owner's own sessions. The guard sees it only where that checkout is the folder.
  evidence: https://code.claude.com/docs/en/settings, "In a worktree, it uses the file at the main checkout's root", with exceptions for Windows and a home-directory root. A's own text and AC assumed the worktree's copy. NEEDS-PROBE: whether the stream-json relay offers "don't ask again" at all.
  fix: I stated the limit in NEW-D7-2. Decision for the owner: accept it in Appendix D, or drop "allow for this session"-style options in read-only turns, which is a new rule.

- severity: P2
  type: defect
  location: NEW-D7-2 "Failures" (hash mismatch); R-F-88's fix
  claim: A start state that fails its hash makes the revert fail forever, and nothing says how the owner gets out. The queue is held and `/apply` refused, and a retry can't change the result.
  scenario: a review turn rewrites the start state's copy, or the post office dies and the copy is touched. Every later g retries and fails; `/apply` stays refused for the rest of the Claude session.
  evidence: R-F-88: "the revert counts as failed (queue held, /apply refused)"; WSP-1 gives one worktree per soldier per Claude session.
  fix: decision: A, as drafted (held; the owner deals with the worktree by hand); B, a card where the owner accepts the worktree as it is and the queue goes on (a new card); C, the soldier is ended and gets a fresh worktree (new behaviour).

- severity: P2
  type: gap
  location: NEW-D7-2 "The start state"
  claim: The start state copies the bytes of every dirty or untracked file, with no size or time limit and no outcome when it is too big.
  scenario: the owner leaves a 4 GB untracked file in a builder's worktree; every review brief copies and hashes it before the message goes in, filling the disk or stalling the queue with `start state not written · disk full`.
  evidence: A:27 and C:66 copy "each file"; no cap in v0.12 (compare MSG-1, PO-6).
  fix: decision: a cap on the start state with the message waiting `start state too big`, or a hash and hard link instead of a copy for large files.

- severity: P2
  type: decision-needed
  location: NEW-D7-2 (the start state for a self-started turn); decisions.md 241 and 239
  claim: The owner accepted the residual "as the card stated it", and the card said an edit made "during its read-only turn" is reverted. The plan's C:72 also reverts an edit made after the last finished turn if the CLI then starts a turn by itself.
  scenario: a read-only review answers; the owner fixes a typo in that worktree; background output makes the CLI start a turn by itself 20 seconds later; the typo is reverted with no copy kept, though the owner made it between turns.
  evidence: decisions.md 239 against 229-236 (the plan takes C:72); PO-8 line 295 ("the owner's own edits between turns stay exempt") is the guard's rule for the checkout, not the worktree's.
  fix: decision: A, as drafted and listed as residual 12 for the owner to accept; B, the self-started turn gets a start state taken when its first event arrives (a race with the CLI's own writes); C, a self-started turn after a read-only message is not audited.

- severity: P2
  type: gap
  location: HOST-10 (172), NEW-D7-2 (the owner's answer)
  claim: The builder is never told that a turn was read-only, so after the revert its own history still says it edited files that are back as they were.
  scenario: the owner types "fix the typo in a.ts" in the pane; the turn is read-only; the soldier replies "done", the edit is reverted, and the soldier's next brief builds on a.ts as if edited.
  evidence: HOST-10 "the soldier receives only the brief's text"; A:415 leaves it open; failure simulation "cross-model output".
  fix: decision: tell the soldier in the next message, which breaks "only the brief's text", or accept it as a residual and document the risk.

- severity: P3
  type: gap
  location: HOST-4 / HOST-5 (the pane's field), MSG-7
  claim: Nothing in the pane tells the owner that a typed message is read-only. They find out from the revert line afterwards.
  scenario: the owner types an instruction expecting a change and sees `reverted (read-violation)` on a turn that did what they asked.
  evidence: the answered card says "to have a soldier write, use /send <soldier> --kind build".
  fix: decision: a hint in the field and the keys row (new UI text), or only the optional command-table description I drafted.

- severity: P2
  type: ambiguity
  location: WSP-11 (720)
  claim: "A file it writes in its snapshot" doesn't say whether ignored output counts as a write to report. The text reads two ways, and the plan's optional refinement is not taken.
  scenario: reading A: a review-only claude at auto runs `npm test`, which writes `.cache/`, and every turn reports a read-violation. Reading B (2.0 WS-3, "a non-ignored change"): only non-ignored changes are reported, and ignored output is discarded silently.
  evidence: line 720; 2.0 spec line 821; A:266.
  fix: decision: A, report everything; B, report non-ignored paths and the paths ARM-6 hashes, and discard other ignored output unreported.

- severity: P2
  type: gap
  location: ARM-6 (657-665), WSP-4 (686)
  claim: v0.12 never says the guard covers refs, though settled.md 41 and v1's guard do. A read-only turn moving `main` or creating a tag is outside ARM-6's stated scope.
  scenario: a review-only agy (snapshot) at auto runs `git branch -f main <commit>` through a shared repo: no checkout file changes, so no card, and `main` has moved.
  evidence: src/workspace/guard.ts:14 ("every ref except Shadow Army's own `shadow/*` branches"); 2.0 GUARD-6 is about `refs/shadow-army/**` only, so my Appendix A cite for WSP-4 is by analogy.
  fix: WSP-4's second bullet in this draft; the orchestrator should check that ARM-6's scope sentence agrees.

- severity: P2
  type: vendor-fact
  location: NEW-D7-3 (grok and claude rows)
  claim: Three of the switches are not documented by a vendor.
  scenario: the adapter sends `session/set_mode` to grok and it answers with an error, or lists no modes: the message is queued with `mode not set` and the queue is held for a supervised grok soldier. Likewise for the claude CLI's wire request.
  evidence: documented: claude's `setPermissionMode()` at https://code.claude.com/docs/en/agent-sdk/permissions ("takes effect immediately for all subsequent tool requests"); codex's per-turn sandbox override at https://learn.chatgpt.com/docs/app-server ("these settings become the defaults for later turns on the same thread"; the page doesn't describe `approvalPolicy`); ACP `session/set_mode` at https://agentclientprotocol.com/protocol/session-modes ("will be removed in a future version" in favour of config options). Not documented: whether `grok agent stdio` implements it; xAI's https://docs.x.ai/build/modes-and-commands lists ask, auto and always-approve and does not mention `acceptEdits`, which v1 passes (src/adapters/grok.ts:14). NEEDS-PROBE: claude's stream-json control request behind `setPermissionMode()`, whether a mode change resets claude's cache (SES-6), grok's modes and `session/set_mode`, and R-M1-93.
  fix: contract fixtures before M6, as NEW-D7-3 and §5.1 C say.

- severity: P2
  type: gap
  location: CH-3 and CH-4 (487-494), CH-7 (515)
  claim: CH-7 says CH-3 to CH-5 give each CLI's permission mode at every level, but they don't (R-M1-71). NEW-D7-3 gives only the supervised modes, from v1.
  scenario: the codex and grok adapters have no stated mode at auto or full, so what NEW-D7-3's "at auto and full no turn changes the mode" leaves in place is unspecified.
  evidence: lines 487-494 against 515; ledger R-M1-71, "parked for M2".
  fix: R-M1-71's own fix; not part of D-7.

- severity: P3
  type: gap
  location: VIS-2 (743), PO-14, PO-15
  claim: "Down" appears in PO-14, PO-15 and now NEW-D7-1, but VIS-2's disconnected row defined it only as "three failed restarts". I added the snapshot case only.
  scenario: a soldier with no containment has no state defined.
  evidence: lines 743, 347-374.
  fix: the orchestrator may widen the row.

- severity: P3
  type: editorial
  location: glossary Autonomy (61)
  claim: R-F-58's wording says "a read-only task also runs in a throwaway snapshot", which is wrong for a builder under auto; I added "or, for a builder, is reverted in its worktree (NEW-D7-2)".
  scenario: none; wording only.
  evidence: the task's wording; NEW-D7-1 and NEW-D7-2.
  fix: keep my addition, or cut it to the given wording.

SOURCES
- https://code.claude.com/docs/en/agent-sdk/permissions (setPermissionMode; plan mode; acceptEdits)
- https://code.claude.com/docs/en/permission-modes#review-and-approve-a-plan ("Approving a plan exits plan mode and switches the session to the permission mode each approve option describes")
- https://code.claude.com/docs/en/settings (settings reload; the local settings file lives at the main checkout's root for a worktree; "Claude Code adds it to your global git excludes")
- https://learn.chatgpt.com/docs/app-server (reached from https://developers.openai.com/codex/app-server by a 308 redirect; per-turn overrides become later defaults; `readOnly` and `workspaceWrite` as sandbox policy examples; I read the first 100,000 of 143,470 characters)
- https://agentclientprotocol.com/protocol/session-modes
- https://docs.x.ai/build/modes-and-commands (grok: ask, auto, always-approve; plan mode)
- Not re-fetched by me, from C's sources: https://docs.x.ai/build/features/permissions and https://learn.chatgpt.com/docs/sandboxing
- v1 code in the repo: src/adapters/claude.ts:13-22, codex.ts:11-20, grok.ts:7-16 (supervised: plan, read-only and plan without write; acceptEdits, workspace-write and acceptEdits with it); src/workspace/guard.ts:14
- 2.0 spec docs/legacy/spec/shadow-army-2.0.md: WS-3 at 821 and GUARD-6 at 1077
- Review records: docs/spec/review/settled.md 28 and 39-41; decisions.md 225-243; raw/D-7-option-A.md; raw/D-7-option-C.md; raw/D-7-judge.md; ledger.md rows R-F-58, R-F-86 to R-F-88, R-M1-93, R-M1-71, R-M1-76; drafts/v013/PROMPTS.md
- Snapshot: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@2493a82.md (lines cited above)