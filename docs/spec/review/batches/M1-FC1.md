# Unit M1, round 1, fix check M1-FC1: the post office's life

Each P1 as raised (copied from `batches/M1-V7.md` or `M1-V8.md`), then its verifiers and where spec v0.8 (`1580e87`) fixes it. Line numbers are v0.8's, `docs/spec/v2.md` in the review worktree. The verifiers' reports are `raw/M1-r1-verify-V1.md` to `V9.md`, and each finding's ledger row gives its resolution.

## R-M1-3

- severity: P1
  type: gap
  location: PO-1 "One per folder" (docs/spec/v2.md:164); HOST-2 (:94); M1-AC1 (:546)
  claim: The text says what the lock holds, but not what a start does when a lock already exists (owner alive, owner gone, file unreadable), nor what "folder" means. After a crash or a quick restart, either the army can't start or two post offices run.
  scenario: (1) The post office was killed or the power failed, and its lock remains. At the next session's first `/send`, reading A refuses until the owner finds and deletes the lock by hand (Codex's draft: "remove its stale lock after checking the recorded PID"); reading B sees a dead pid or a different start time and takes over. (2) The owner quits and reopens Claude Code while the old post office is still closing (shutdown finding). Its owner is alive: is the start refused, made to wait, or does it take over? (3) A second Claude Code session in the same repository, or in one of its subfolders, can't use the first post office (it lacks the secret, PO-3), and what it shows is undefined. (4) A crash or a full disk between creating and writing the lock leaves an empty file. (5) "Start time" can mean the OS's record or the post office's own clock. A clock change or a precision mismatch makes a living owner look stale, and a second post office starts.
  evidence: :164 "A lock in the folder holds the post office's pid, its process start time and its port. The start time tells the process that wrote the lock apart from a later one that reuses its pid." It gives the purpose but no action. :94 "at most one post office per folder". M1-AC1 checks only what the lock holds. Codex's draft (C:\Users\johns\projects\AIConnections-m1\src\v2\server.ts, folderLock) writes only `{pid}` and refuses any existing lock. Settled decision 2 fixes only what the lock holds.
  fix: "PO-1: The folder is the top level of the git working tree. A start that finds a lock reads it. The lock is stale if no process has that pid with that start time as the OS reports it (compared to the second), or if the file is empty or unreadable. A stale lock is replaced atomically, and the new post office's log says so. If the lock's owner is alive, the start is refused with 'the army is already running in this folder (pid N, started T)', which the mod shows. Nothing deletes a live lock." M1-AC1 adds cases for a stale, a live and an empty lock. (Whether a second session may wait for a closing post office or take it over: decision.)

**Verified by:** M1-V2, M1-V7.
**Fixed in** `1580e87`: PO-1's lock, 193-195 (the folder, the lock written whole, stale and live locks); M1-AC1's first bullet, 678. The mod learns the port only from standard output (193).

## R-M1-8

- severity: P1
  type: gap
  location: PO-7 (docs/spec/v2.md:185-186); HOST-2 (:94); M1-AC1 (:546)
  claim: Closing each soldier "through that CLI's own exit" has no time limit and no rule for a soldier that is mid-turn or has background work. A claude soldier can keep working long after the session ended, while the post office keeps the folder's lock.
  scenario: Kaisel (autonomy auto) is mid-turn and has started a dev server in the background; the owner quits Claude Code. Reading A: close claude's input, as the SDK does, and wait for it to exit. Nothing documented says the end of input stops the running turn (NEEDS-PROBE). claude then stays open for the background command (30 min by default, 2 h at most) and takes one more model turn with the outcome, all after the session ended and with nobody watching. Meanwhile the post office holds the lock, so the owner's next session can't start the army (lock finding). Reading B: SIGTERM at once; claude "leaves the turn ... unfinished and records no result". Also undefined: a crash restart that completes after shutdown has begun starts a CLI that nothing will close. M1-AC1 tests only idle soldiers.
  evidence: :185 "closes every soldier session through that CLI's own exit"; :186 "closes each session through its CLI, and exits"; PO-1 :168 ends the tree, but nothing sets the time in between. https://code.claude.com/docs/en/headless#background-tasks-at-exit: "After Claude finishes its turn and stdin has closed, a claude -p run can stay open to wait for background work ... the run waits until the command exits or reaches its time limit. Claude then takes one more turn with the outcome." https://code.claude.com/docs/en/tools-reference (Time limit for background commands): "30 minutes ... up to a maximum of 2 hours". The same headless page, on SIGTERM: "leaves the turn that was in progress unfinished and records no result for it". SessionEnd hooks "share a 1.5-second budget" (https://code.claude.com/docs/en/hooks), so the mod can't wait either. Codex's draft does bound it (input closed, 2 s, SIGTERM, then kill: C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts), but the text doesn't require it.
  fix: "PO-7: When the session ends, the post office stops each running turn through its CLI's interrupt where the channel has one (CH-10, from M2), closes the CLI's input, and ends its process tree (PO-1) if the CLI hasn't exited N seconds later. It never waits for background work. Once shutdown has begun, no channel starts or restarts. The post office exits within M seconds of the session's end, whatever its soldiers do, and a turn ended this way finishes as PO-8's 'cut short'." M1-AC1 adds a fake that is mid-turn, ignores the end of its input and keeps a child running: within M seconds both trees are gone and the post office has exited. (N and M: decision.)

**Verified by:** M1-V2, M1-V7.
**Fixed in** `1580e87`: PO-7, 225-250 (D-2's option A, with option B's parts the judge chose: `raw/D-2-judge.md`): what starts the shutdown, the shutdown for every soldier at once, 10 s then the tree ended; M1-AC1, 677-688 (the mid-turn fake, the crash restart that falls due after the shutdown starts); §5.1 F 598-620.

## R-F-11

- severity: P1
  type: contradiction
  location: PO-7 (docs/spec/v2.md:185-186); HOST-14 (:148); ARM-6 (:393); CH-6 (:244); SEC-3 (:418)
  claim: The end of a Claude session (or a lapsed lease) has no order and no time limit, and it loses every open decision. Attribution cards, handoff cards and approval requests vanish with the mod, and their messages never end.
  scenario: Tusk (agy) is mid-turn, Kaisel (claude) has a `can_use_tool` request open, and the owner quits Claude Code. PO-7 closes each session "through that CLI's own exit". Kaisel may wait for the answer (NEEDS-PROBE: does claude exit on stdin EOF with a request pending?), and CH-6 and SEC-3 forbid answering or cancelling it without the owner. So the close has no time limit, and the post office may never exit or free the lock. Tusk's turn is cut short and its guard raises a card for an unexplained checkout change. No mod is left to show the card, and nothing records it. Tusk's message stays "delivered" forever, because ARM-6 says "The turn's summary waits for the answer".
  evidence: PO-7 says "closes every soldier session through that CLI's own exit", with no stop first and no limit. CH-6 says "An unanswered request stays pending … until the owner answers it or stops its turn". SEC-3 says "No code path answers … without the owner". PO-6 records only briefs, summaries and messages. H38 covers soldier sessions on resume, not open decisions.
  fix: In PO-7: "At the session's end, the post office stops each running turn through its CLI's interrupt (CH-10). After at most N s it ends each CLI's process tree; ending a process answers nothing (SEC-3). Each turn is finished as PO-8 says, and every decision still open is recorded with its paths and hashes. A message whose card was never answered ends interrupted, reason 'session ended before the owner answered'." What the next session does with those decisions is a decision: show them in its decisions list (beside H38), or end them with a recorded reason shown at the next start. Add fault cases: the lease lapses, and the session ends, with each kind of decision open.

**Verified by:** M1-V2, M1-V7.
**Fixed in** `1580e87`: PO-7's shutdown bullets, 238-246 (queued messages, running turns, open requests, cards recorded as unanswered); CH-6, 317-328 (a shutdown closes a request as a stop does); MSG-4, 370-380; SEC-3, 511; PO-5's decisions logged, 222; M2-AC7, 741-749; M2-AC8, 750-755; M3-AC11, 796; §5.1 F.

## R-M1-10

- severity: P1
  type: gap
  location: HOST-2 (docs/spec/v2.md:94); PO-7 lease (:186); PO-3 (:171)
  claim: No requirement says what happens when the post office ends while the mod and the Claude session live on, or when the mod loses the secret. The army can vanish mid-session, with no restart defined and nothing shown to the owner.
  scenario: The post office exits early. Its lease may have lapsed while the mod still lives: Claude Code's event loop was blocked for more than 30 s, or a sleep counted on the clock (D-2 settles the timing, not this outcome). It may have crashed. Or a log write failed, and under Codex's reading that closes it (log finding). It closes every soldier and exits, and the mod sees its output end. Reading A: at the next use the mod starts a new post office with a new secret and a new lock, and every soldier opens a new session with no history (resume only arrives with CH-9 in M4). Reading B: HOST-2 starts the post office only "the first time the army is used in a session", so the army stays down until Claude Code restarts. Neither reading says what the owner sees. The mod may also be reloaded, or crash, inside a live session (NEEDS-PROBE that the mod API allows this). The secret lived only in the old mod instance, so nobody can command or hear the old post office until its lease lapses, and the new instance meets the live lock.
  evidence: :94 "starts the post office the first time the army is used in a session, and stops it when the session ends"; :186 "After 30 seconds without a renewal ... closes each session through its CLI, and exits"; :171 a new secret "each time it starts". M3-AC12 (:631) relies on a post office "restart" that no requirement defines. M1-AC1 tests only an expiry with the mod gone.
  fix: "HOST-2: When the post office ends while the session lives, the mod adds one line to the transcript: 'the army stopped: <reason>'. At the next use of the army it starts a new post office with a new secret, and the soldiers open new sessions (resumed by id from M4, CH-9). A secret is never reused. A mod that restarts within a session starts its own post office once the old lock is stale (PO-1)." M1-AC1 adds: kill the post office while the mod lives; the next use starts a new one and says so. (Whether the mod restarts it at once or at the next use: decision.)

**Verified by:** M1-V2 (confirmed), M1-V7 (duplicate of R-F-10 and R-F-30; the fix stays here).
**Fixed in** `1580e87`: HOST-2, 103-106 (again at the first use after a shutdown); PO-7's 'What the owner sees', 247-250 (the reason `the post office stopped unexpectedly`, with its exit code or signal); M1-AC1's kill and lease cases, 687.

## R-F-30

- severity: P1
  type: gap
  location: §3 (docs/spec/v2.md:82-83); HOST-2 (:94); PO-1 (:164); PO-7 (:186)
  claim: The secret and the event pipe live only in the mod instance that started the post office. Nothing says what happens when any other instance finds that post office's lock: after a reload or worker respawn, from a second session in the folder, or after a restart within the lease.
  scenario: `claude --plugin-dir ./mod` is running in this repository and Iron is mid-turn. Claude edits a file under `mod/`, and the hooks module reloads: session.start runs again with no secret and no stdout handle, and the lease timer stops. 30 s later PO-7 closes every soldier session, cutting off Iron's turn. The new instance finds a live lock it can't command: HOST-2 says to start a post office, PO-1 allows one per folder. `/reload-plugins`, a second `claude` in the folder, or `/exit` followed by `claude` within 30 s hit the same gap.
  evidence: The mods reference says session.start runs "again after a reload of that mod", `--plugin-dir` "reloads its hooks module when you save", and lists `/reload-plugins` (https://code.claude.com/docs/en/plugins/mods/reference). The mods API says "Timers stop when the module reloads" (https://code.claude.com/docs/en/plugins/mods/api). The types file adds "an enable, a worker respawn, or a reload". `$.store` survives reloads but is on disk, which PO-3 forbids for the secret. NEEDS-PROBE: whether a spawned process outlives a reload.
  fix: Decision, one of: (a) refuse with a defined message, plus a defined takeover that first finishes open turns (PO-8); (b) a reload-safe handover; (c) one post office per Claude session instead of per folder. Add the chosen case to §5.1 F.

**Verified by:** M1-V2, M1-V8 (a decision; D-12 chose option a).
**Fixed in** `1580e87`: HOST-2's reload bullet, 106; M1-AC1's last bullet, 688; §5.1 F's reload case.

## R-M1-9

- severity: P1
  type: gap
  location: PO-1 (docs/spec/v2.md:168); PO-7 (:186); M1-AC4 (:549-553)
  claim: Nothing requires a soldier's process tree to end when the post office itself dies abruptly, and no M1 test kills the post office. An orphaned soldier can run on with no supervisor, guard or log, and no way to stop it.
  scenario: The post office dies while Iron (claude, autonomy full) is mid-turn: the OOM killer, Task Manager, a native crash, or taken down with Claude Code's own process on Windows. PO-1's cleanup runs only "when a channel closes or restarts", which a dead post office can't do. Iron's input ends; nothing documented says that stops its turn (NEEDS-PROBE). claude then stays open up to 30 min for its background commands and takes one more turn. Nobody reads its output, nothing guards or logs it, and the owner has no pane or command to stop it.
  evidence: :168 "When a channel closes or restarts, the post office ends the CLI's whole process tree". :186 names "its process containment (PO-1)", which no requirement defines. 5.1 F (:477) kills a CLI, never the post office. M3-AC12 (:631) kills the post office but checks only the message state. The vendor docs are cited in the shutdown finding. Codex's draft does contain it: in C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts, the Linux guardian ends the process group when its IPC channel closes, "even when the post office is killed without running finally"; Windows uses a kill-on-close job and macOS a coalition. C:\Users\johns\projects\AIConnections-m1\src\v2\client.ts notes "Windows' default child job dies with its launcher before guard finalization can run". NEEDS-PROBE: whether claude exits once its output pipe breaks.
  fix: "PO-1: Each soldier's process tree is contained so that it ends within N seconds of the post office's own process ending, however that happens, a kill or a crash included." 5.1 F and M1-AC4 add: "the post office killed mid-turn, with a fake CLI that left a child running: both are gone within N seconds."

**Verified by:** M1-V3, M1-V8.
**Fixed in** `1580e87`: PO-1's Containment, 201-202 (the tree ends within 10 s however the post office ends, through Q8's containment; the residual of services outside the tree); PO-7's Containment, 236; M1-AC1, 687; §5.1 F.

## R-F-10

- severity: P1
  type: gap
  location: §3 Architecture (docs/spec/v2.md:82-87); HOST-2 (:94); PO-1 (:164, :168); M3-AC12 (:631); §5.1 F (:476-491)
  claim: The spec never says what happens when the post office itself dies. It doesn't say who notices or who restarts it. It doesn't say what becomes of the soldiers' CLIs, their open turns and guards, the queued and delivered messages, or the folder lock, or what the owner sees.
  scenario: Three soldiers are mid-turn and two briefs are queued when the post office is killed (OOM or a crash). Reading A, as in Codex's draft: every later `send` throws "post office is closed", and the lock stays until the owner deletes it by hand. Reading B: the mod restarts it with a new secret. Either way, five things are undefined: (1) whether the CLIs die or run on with no guard (a Linux subreaper's orphans go to init); (2) whether the cut-short turns are ever finished as PO-8 says, when the guard's baseline was only in memory; (3) whether "queued" records become "not delivered"; (4) what the pane shows: its spinners keep turning on stale "working" states, and no toast fires; (5) M3-AC12 tests behavior "after a restart", but no requirement defines a restart.
  evidence: HOST-2 starts the post office only "the first time the army is used in a session". PO-1:168 covers only "When a channel closes or restarts". The fault level has "a CLI killed mid-turn" but no post office kill. Codex's draft: client.ts:76 throws "post office is closed"; server.ts:33 says "remove its stale lock after checking the recorded PID".
  fix: Add to §3 and PO-1: "If the post office exits unexpectedly, the mod shows the army as down (strip, status entry, one transcript line). On start, a post office: reclaims a lock whose pid and start time match no living process; finishes each turn its records show open (PO-8: guard against a baseline kept on disk, then audit, then message interrupted); ends each queued message as not delivered, reason 'post office stopped'. Nothing the CLIs started outlives the post office (PO-1)." The restart policy is a decision: restart on the next use, or ask the owner. Add fault cases: the post office killed mid-turn, with a queue, and with an approval open. Add an integration case with a fake mod host.

**Verified by:** M1-V3, M1-V8.
**Fixed in** `1580e87`: PO-1's last bullet, 203-204 (a post office settles the last one's open turns and queued messages before opening a channel); PO-8's baseline on disk, in 251-278; M3-AC12, 797-803; PO-7's 'What the owner sees', 247-250.
