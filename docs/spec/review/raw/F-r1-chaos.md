# F round 1, chaos engineer (snapshot be9deb0)

- severity: P1
  type: gap
  location: §3 Architecture (docs/spec/v2.md:82-87); HOST-2 (:94); PO-1 (:164, :168); M3-AC12 (:631); §5.1 F (:476-491)
  claim: The spec never says what happens when the post office itself dies. It doesn't say who notices or who restarts it. It doesn't say what becomes of the soldiers' CLIs, their open turns and guards, the queued and delivered messages, or the folder lock, or what the owner sees.
  scenario: Three soldiers are mid-turn and two briefs are queued when the post office is killed (OOM or a crash). Reading A, as in Codex's draft: every later `send` throws "post office is closed", and the lock stays until the owner deletes it by hand. Reading B: the mod restarts it with a new secret. Either way, five things are undefined: (1) whether the CLIs die or run on with no guard (a Linux subreaper's orphans go to init); (2) whether the cut-short turns are ever finished as PO-8 says, when the guard's baseline was only in memory; (3) whether "queued" records become "not delivered"; (4) what the pane shows: its spinners keep turning on stale "working" states, and no toast fires; (5) M3-AC12 tests behavior "after a restart", but no requirement defines a restart.
  evidence: HOST-2 starts the post office only "the first time the army is used in a session". PO-1:168 covers only "When a channel closes or restarts". The fault level has "a CLI killed mid-turn" but no post office kill. Codex's draft: client.ts:76 throws "post office is closed"; server.ts:33 says "remove its stale lock after checking the recorded PID".
  fix: Add to §3 and PO-1: "If the post office exits unexpectedly, the mod shows the army as down (strip, status entry, one transcript line). On start, a post office: reclaims a lock whose pid and start time match no living process; finishes each turn its records show open (PO-8: guard against a baseline kept on disk, then audit, then message interrupted); ends each queued message as not delivered, reason 'post office stopped'. Nothing the CLIs started outlives the post office (PO-1)." The restart policy is a decision: restart on the next use, or ask the owner. Add fault cases: the post office killed mid-turn, with a queue, and with an approval open. Add an integration case with a fake mod host.

- severity: P1
  type: contradiction
  location: PO-7 (docs/spec/v2.md:185-186); HOST-14 (:148); ARM-6 (:393); CH-6 (:244); SEC-3 (:418)
  claim: The end of a Claude session (or a lapsed lease) has no order and no time limit, and it loses every open decision. Attribution cards, handoff cards and approval requests vanish with the mod, and their messages never end.
  scenario: Tusk (agy) is mid-turn, Kaisel (claude) has a `can_use_tool` request open, and the owner quits Claude Code. PO-7 closes each session "through that CLI's own exit". Kaisel may wait for the answer (NEEDS-PROBE: does claude exit on stdin EOF with a request pending?), and CH-6 and SEC-3 forbid answering or cancelling it without the owner. So the close has no time limit, and the post office may never exit or free the lock. Tusk's turn is cut short and its guard raises a card for an unexplained checkout change. No mod is left to show the card, and nothing records it. Tusk's message stays "delivered" forever, because ARM-6 says "The turn's summary waits for the answer".
  evidence: PO-7 says "closes every soldier session through that CLI's own exit", with no stop first and no limit. CH-6 says "An unanswered request stays pending … until the owner answers it or stops its turn". SEC-3 says "No code path answers … without the owner". PO-6 records only briefs, summaries and messages. H38 covers soldier sessions on resume, not open decisions.
  fix: In PO-7: "At the session's end, the post office stops each running turn through its CLI's interrupt (CH-10). After at most N s it ends each CLI's process tree; ending a process answers nothing (SEC-3). Each turn is finished as PO-8 says, and every decision still open is recorded with its paths and hashes. A message whose card was never answered ends interrupted, reason 'session ended before the owner answered'." What the next session does with those decisions is a decision: show them in its decisions list (beside H38), or end them with a recorded reason shown at the next start. Add fault cases: the lease lapses, and the session ends, with each kind of decision open.

- severity: P1
  type: ambiguity
  location: §2 Live session (docs/spec/v2.md:61); PO-8 (:193, :195, :203, :210-211); M2-AC9 (:591)
  claim: "Turn" means both a CLI's turn and a message's span. Nothing says when a message's turn is over if the CLI takes a turn by itself once its background work ends.
  scenario: Iron's turn starts a background `npm test`. claude's `result` comes, then `task_notification` (completed). Reading A: the work has ended (:195), so the turn is over. The guard closes, the audit runs, and Iron's next queued brief goes to stdin just as claude starts its own follow-up turn (spike S6), so the two interleave. The follow-up's writes "belong to no turn" (:211), so no guard or audit covers them, and its `result` "changes nothing" (:210). Reading B: the turn waits for a follow-up, with no limit. After `stop_task`, S6 saw no follow-up within 60 s, so the queue would wait forever. The glossary's "Each message adds one turn" fits neither reading.
  evidence: :193 says a turn "the CLI takes by itself when the work ends belongs to the same message". :203 says "that turn's end event is the last". S6 (s6-results.md): a task that completes by itself is followed by a turn; `stop_task` gave none in 60 s.
  fix: In §2, define "turn" (the CLI's, up to its end event) and "a message's work" (its turns plus the background work they leave). In PO-8: "When a background task the CLI reports ends by itself, the message's work stays open until the CLI's next end event, or for N s with no new turn; a queued message goes in only then. A task stopped by s, or a plain process that exits, opens no wait." Add a fault case where a queued message is ready just as the CLI starts its own turn.

- severity: P1
  type: untestable
  location: §5.1 F "a failed log write" (docs/spec/v2.md:490); PO-5 (:183); PO-6 (:184); MSG-4 (:303)
  claim: No requirement says what a failed or partial write does (full disk, a crash mid-append). So this fault case can't fail, and MSG-4's promise never to send a message twice rests on a record write whose failure and durability are undefined.
  scenario: The disk fills. Reading A, as in Codex's draft: one failed log line closes the whole post office, so every soldier's turn is cut short. Reading B: keep running and deliver anyway. The "delivered" record never landed, so after a crash the message reads as queued and is sent again, which is the repeat MSG-4 forbids. A partial last JSONL line after a crash forks the same way: skipping it loses "delivered" and the message is sent twice; refusing it blocks every start. Also undefined: a snapshot or worktree that can't be made, and a report that wasn't written while the summary card shows its path.
  evidence: MSG-4:303 "records a message as delivered before it writes it to the CLI … never repeat one". Codex's draft: postOffice.ts:79-82 closes the post office on any log failure; logs.ts appends with no fsync.
  fix: Choosing between stopping the whole post office (as drafted) and keeping it running with delivery refused is a decision. Either way, state: "A message goes to its CLI only after its 'delivered' record is flushed to disk. With records unwritable, nothing is delivered, and the row says 'cannot write records · disk full'. On start, a partial last line is reported, and a message whose last whole record is 'delivered' ends interrupted. A snapshot or worktree that can't be made refuses the soldier's start; it never falls back to the folder." Add fault cases that check the chosen outcome.

- severity: P1
  type: gap
  location: WSP-5 (docs/spec/v2.md:402-405); M6-AC5 (:689-694); §5.1 F (:476-491)
  claim: "All or nothing" covers a write that fails, but not the applying process dying mid-apply. Nothing says where the copied bytes live, or that the next start finishes the rollback.
  scenario: The owner runs `/apply Kaisel` and closes Claude Code a second later, or the post office crashes. The process ends with 4 of 9 files written and the git index half-updated. If the copies were in memory, they are gone. The next session neither detects nor reports the half-applied folder, and the card's applied fact still says "not yet".
  evidence: WSP-5 says "on any failure it restores them exactly", which only covers a failure the running process sees. M6-AC5 only makes "a write fail". PO-7 doesn't say a shutdown waits for a running apply.
  fix: In WSP-5: "The copies, and a journal entry naming every file and the index, are on disk before the first write. A shutdown waits for a running apply or undo to finish or roll back. On start, an apply or undo whose journal has no completion record is rolled back, and the transcript gets one line naming the files." Add a fault case that kills the process after each write of an apply and of an undo.

- severity: P1
  type: gap
  location: §3 Architecture (docs/spec/v2.md:84); HOST-10 (:136-139); PO-4 (:178); §5.1 F (:476-491)
  claim: Neither `send` link has an outcome for a retry after a partial success. A brief the post office accepted, whose reply never reached the caller, comes back as a new brief.
  scenario: Claude calls `send(Kaisel, build, …)` and the post office queues it. Then the owner presses Esc on the Monarch's turn, or the reply is lost in a stall or crash. Claude has no id; told "go on", it sends the same build again, and Kaisel runs it twice. The same happens when a soldier's MCP client times out a slow `send` and its model retries. MSG-4 covers only the post office's own write to a CLI.
  evidence: PO-4's `send(to, text)` has no request id. 2.0 MCP-4 (archived draft :646) made `wake` "idempotent per `requestId`"; v2 neither carries it nor lists it as dropped. NEEDS-PROBE: whether a mod's tool handler learns of the Monarch's Esc.
  fix: How to close this is a decision. Option (a): every `send` carries a caller-made request id that the mod's and the adapter's own retries reuse, so a repeated id returns the first state and sends nothing; plus one notice in Claude's conversation when its cancelled `send` had already been accepted. Option (b): an identical brief to a soldier whose first copy is still queued or running needs the owner's confirmation. Add fault cases for a lost reply and a retried soldier `send`.

- severity: P2
  type: gap
  location: HOST-2 (docs/spec/v2.md:94); PO-1 (:164); Appendix A (:722-741)
  claim: "At most one post office per folder" doesn't say what happens to the second process that wants the folder. That covers a second Claude Code session, a restart within the old post office's 30 s, and v1's `sa` write commands. "Folder" is also undefined.
  scenario: A second terminal in the same folder runs `/army`. The secret and the event stream belong to the first mod, so the second can neither start a post office nor attach; what it shows is unspecified (Codex's draft throws "post office lock already exists…"). After a crash, `claude --continue` within 30 s meets the old lock, and nothing says the next use tries again. The first session's guard flags the second session's edits, and any v1 `sa apply` (still on main until M6), as foreign changes. Sessions started in two subfolders of one repository may each count as a separate "folder".
  evidence: 2.0 GUARD-5 (archived draft :1076): "A second `sa` in the same folder exits with a message naming the open chat. While the lock is held, v1 write commands refuse". 2.0 D11 (:71) gives the reason: "Concurrent runs raise false guard cards". Appendix A carries only GUARD-1 to GUARD-4.
  fix: In PO-1: "A start that finds a live lock refuses. The mod names the holder (pid, start time), says the army is in use by another Claude session, and tries again on the next use. A lock whose pid and start time match no living process is reclaimed." Either carry GUARD-5's rule that v1 write commands refuse, or list GUARD-5 as dropped, with its reason. Define "folder" in §2.

- severity: P2
  type: gap
  location: §2 Glossary (docs/spec/v2.md:55-72); HOST-6 (:126); HOST-14 (:148); MSG-3 (:290); PO-1 (:165); M3-AC11 (:627); VIS-2 (:426)
  claim: The spec doesn't define the states that failures put a soldier in (VIS-2 hands them to the canvas), and the requirements that use them disagree.
  scenario: (a) HOST-6 says "error" needs the owner, but HOST-14's list has no "error" entry, and nothing defines how a soldier enters or leaves it. The owner sees the word with no card and no key that clears it. (b) MSG-3 queues for "disconnected", while PO-1 defines only "down". For a brief queued to a soldier that goes down, there are two readings: it waits until r or the session ends, or it ends "not delivered". M3-AC11's "can no longer deliver" is never defined. (c) MSG-3 doesn't queue for "log in", so messages go straight into a CLI that needs a login. Codex's draft invented "idle" and "closed".
  evidence: The cited lines; Codex's draft postOffice.ts:90.
  fix: Add a state table to §2. For each state (not started, starting, idle, working, background work, stopping, preparing handoff, handoff ready, held, reconnecting, down, log in, error), give what enters and leaves it, whether messages queue, and whether it joins HOST-14. Say when a queued message ends not delivered. The canvas then draws this table.

- severity: P2
  type: gap
  location: §3 Architecture (docs/spec/v2.md:82-83, :87)
  claim: The link between the mod and the post office is specified only for the normal case. It gives no rule for a slow or stopped reader, a lost or malformed event, or a mod that restarts.
  scenario: On Windows, writes to a pipe are synchronous. If Claude Code stops reading for a few seconds while soldiers stream, the post office's event loop blocks: it stops reading the CLIs, serving `send`, and taking lease renewals. On POSIX the events pile up in memory without limit. Events carry no sequence number and there's no snapshot command, so after a dropped line the strip shows stale states (Codex's client closes the whole post office on one bad line). A restarted mod has neither the secret nor the pipe, and 30 s later the lease ends every session (NEEDS-PROBE: can Claude Code reload a mod mid-session?).
  evidence: https://nodejs.org/api/process.html#a-note-on-process-io says "Pipes (and sockets): synchronous on Windows, asynchronous on POSIX", and warns that pipes not being read can block the event loop. Codex's draft: client.ts:51-61.
  fix: In §3: "Events are one JSON line each, with a sequence number. The mod can ask for a snapshot of every soldier's state, and does so at start and after a gap. The post office never blocks on its output, and keeps at most N MB unsent: it merges streamed text first, and never drops state changes or decisions. A restarted mod starts a new army, and the transcript gets one line." Add integration cases with a fake mod host that stops reading.

- severity: P2
  type: ambiguity
  location: §5.1 F "a cache going cold, on a fake clock" (docs/spec/v2.md:489); SES-6 (:356, :367-368); HOST-15 (:154); CH-10 (:264)
  claim: No timer names its clock, and the fault level has no sleep or clock jump. So the cold estimate and the away digest go wrong across a laptop sleep. The lease is excluded, since D-2 covers it.
  scenario: Iron's cache writes report 1 h. Its last request was at 12:00, and the laptop sleeps from 12:05 to 13:15. Reading A, a monotonic clock that skips suspend: the meter shows `cold in 50m`, the owner sends, and 142k tokens are re-read at full price. Reading B, the wall clock: correct across the sleep, but a clock set back shows the soldier warm too long. HOST-15's 10 minutes fork the same way.
  evidence: SES-6 counts "the time since the soldier's last model request" and shows "cold since 13:53" in wall time. man7 clock_gettime(2): CLOCK_MONOTONIC "does not count time that the system is suspended"; CLOCK_REALTIME "is affected by discontinuous jumps".
  fix: Name each timer's clock. The cache lifetime and the away digest count real elapsed time, suspend included (wall time, guarded by a monotonic clock so that a jump back never extends it). The stop fallback and wake batching use a monotonic clock. Add fault cases for a sleep past the lifetime, and for the wall clock jumping back and forward.

- severity: P2
  type: gap
  location: §1 Non-goals (docs/spec/v2.md:53); §5.1 L (:497); §5.1 U and F (:452-491)
  claim: No test level covers simulation 7 (cost from estimates instead of reports). The frame also calls claude's estimate a "report", and the live checks' "$2 of reported cost" can't bound CLIs that report no cost.
  scenario: claude's `total_cost_usd` is a client-side estimate. In streaming input it is a running total that also includes the spend a resumed session restored, and a crash's or interrupt's `result` may carry zeros. A post office that adds up each `result`, or takes a zero as a new baseline, shows doubled or negative spend in `/sessions` and HOST-15. Summing per-step usage double-counts parallel tool calls that share one message id. Nothing at any test level catches this. For codex, grok and agy, SES-7 expects no cost at all, so the $2 budget is either estimated or never checked.
  evidence: https://code.claude.com/docs/en/agent-sdk/cost-tracking says these are "client-side estimates, not authoritative billing data", reports a "running total … plus any spend restored when the call resumed a session", notes that a crash result "may carry zeroed usage, total_cost_usd", and says parallel tool calls "share the same ID". S6: an interrupted claude turn's usage was all zeros. SES-7:371 shows cost only "where the CLI reports one".
  fix: Change the non-goal so that a CLI's figure is shown as its own estimate wherever its docs say it is one. L: "The budget counts claude's reported cost and, for the other CLIs, tokens against the owner's provider dashboard; Shadow Army never estimates it." Add unit cases: running totals turned into per-turn figures; a zero or missing report recorded as "not reported", never as a baseline; restored spend after a resume; a repeated message id counted once. The wording of OBS-3 itself belongs to the M4 unit.

- severity: P2
  type: gap
  location: CH-1 (docs/spec/v2.md:219); MSG-3 (:290); §5.1 F (:478, :488)
  claim: The fault level checks only that the error kinds are told apart. Nothing says what the soldier and its queue do afterwards, so every queued message goes into the same failure and ends interrupted.
  scenario: Igris's login expires with four briefs queued. The strip says "log in", but MSG-3 doesn't queue for that state, so each brief goes in, fails at once, and ends interrupted. MSG-4 then forbids resending them with one key, although none of them touched a file, so the owner retypes all four. A context overflow can do the same (NEEDS-PROBE: does each CLI compact by itself?). If the CLI exits on an expired login instead, PO-1 restarts it three times, it ends "down", and "log in" never shows. H6 covers only the rate limit.
  evidence: MSG-3:290's reasons to queue; H6 (:783) "Today the next queued message goes at once and meets the same limit".
  fix: This is a decision, to take together with H6. Either the queue holds for the owner after "login needed", or after a context overflow the CLI didn't recover from, as in `held · log in`; or the spec states that the queue burns through and tests it. Either way, the fault cases check the soldier's state and its queue after each error kind.

- severity: P2
  type: defect
  location: Appendix B (docs/spec/v2.md:743-751); CH-9 (:260); PO-1 (:165); M2-AC6 (:574); M3-AC9 (:625)
  claim: The trace rules don't catch an AC that needs a later milestone's requirement. Resume (CH-9) arrives in M4, but M1 already restarts crashed channels, and ACs in M2 and M3 need resumed sessions.
  scenario: In M1 to M3, a crashed claude soldier is restarted. Reading A: it gets a fresh session, its history is silently lost, and the next brief meets an empty context. Reading B: CH-9 is built early, outside the milestone's Implements. Under reading A, M2-AC6 ("resumed by id") and M3-AC9 ("answers the next message with its history") can't pass, yet the trace script passes.
  evidence: Rules 3 and 4 only check that each requirement is implemented and cited within its own milestone. The archived 2.0 draft fixed this class of problem with "(→Mx)" marks (R3·E8, :1572).
  fix: Add rule 8: "An AC relies only on requirements of its own or an earlier milestone, unless it marks a later one (→Mx) and says what holds until then." Then either move CH-9 to M2, or have PO-1 say that a restart opens a fresh session until M4 and the pane says so.

- severity: P2
  type: untestable
  location: §5.1 F "a slow first token" (docs/spec/v2.md:487); PO-1 (:166)
  claim: No requirement gives this fault case an outcome, and nothing covers a CLI that goes silent mid-turn.
  scenario: A fake CLI waits 120 s before its first event, or goes quiet for 20 minutes mid-turn. A post office that restarts it after 60 s of silence passes, and so does one that waits forever. The owner sees "working" with no sign of how long the CLI has been silent.
  evidence: No requirement mentions slow or silent CLIs. PO-1:166 defines a crash as only a process exit or a lost connection.
  fix: Add to PO-1: "No timer of the post office ends, restarts or re-sends a turn. A slow or silent CLI stays working until its end event, a crash, or the owner's stop." Add a fault case: a fake that stays silent longer than every timer in the spec stays working and is sent nothing. Whether the row shows the time since the CLI's last event is a decision.

- severity: P2
  type: ambiguity
  location: §3 Architecture (docs/spec/v2.md:82); MSG-10 (:323); HOST-5 r (:114); PO-1 (:165)
  claim: The spec never makes the post office the one authority that orders actions, so two actions at the same moment have no defined outcome.
  scenario: (a) The owner presses x on a queued brief just as it is marked delivered. Either the mod shows "cancelled" while the soldier works on the brief, or the cancel is refused with no message defined. c has the same race, so the owner's edited text can show while the old text was sent. (b) r pressed during PO-1's automatic restart either starts a second CLI resuming the same session id (two writers on one transcript) or is refused. (c) r pressed twice on a message that wasn't delivered.
  evidence: MSG-10 says "before it is delivered" but defines no outcome when the owner loses that race. M3-AC10 tests no race.
  fix: In §3: "Only the post office changes a message's or a soldier's state, one change at a time. Each mod action is a request whose result the mod shows only from the post office's event. A request that lost a race is refused with its reason, such as `already delivered`." Add integration cases for each race.

- severity: P2
  type: untestable
  location: §5.1 C (docs/spec/v2.md:457-463); CH-1 (:219-220)
  claim: The contract fixtures record only "an error" per CLI, so CH-1's error kinds are checked only against fakes written from the spec.
  scenario: The real claude reports a rate limit in a shape the fake doesn't use (NEEDS-PROBE). In production it is filed as "another error", with no reset time and no H6 hold, while M1-AC4 still passes against the fake.
  evidence: The contract level records "the two-prompt task; an approval request …; an error; a session that goes cold". CH-1 says the kinds are "read from the CLI's own fields".
  fix: Contract level: "For each CLI, record one session per error kind it can be made to produce (a context overflow, a login needed). A kind that can't be produced on purpose is built from the vendor's documented shape and marked synthetic."

- severity: P2
  type: ambiguity
  location: SES-6 (docs/spec/v2.md:357); SI-4 (:279); SET-1 (:437); CH-9 (:260); HOST-9 `/mode` (:132)
  claim: Simulation 5 (a stale cache after a change) has no defined path. Nothing says how a soldier's model, effort, autonomy or tools change mid-session, so SES-6's rules for those changes either never apply or apply at an undefined moment.
  scenario: The owner edits `shadow.config.json` mid-session to move Iron from sonnet to opus. Reading A, config read only at start: nothing changes, and M4-AC4's model case can only be driven by test hooks. Reading B: the next crash-restart resumes the sonnet session with `--model opus`, so the model changes silently. The header still says sonnet, and the soldier stays "warm" although SES-6 makes a model change cold at once. `/mode [ask|auto|plan…]` may change autonomy, and so the vendor flags, but no requirement defines it.
  evidence: SI-4 fixes only the instructions "for a session's life". SET-1 says "validated at start".
  fix: This is a decision. Option (a): a session keeps the settings it opened with, like its instructions; a change reaches a soldier at its next fresh session, the transcript names soldiers still on old settings, and a resume passes the recorded settings. Option (b): define the change command, when it takes effect, and that it applies SES-6's rule. Either way, define `/mode`.

- severity: P2
  type: ambiguity
  location: §2 Standing instructions (docs/spec/v2.md:68); SI-4 (:278-279); SES-4 (:348)
  claim: The spec doesn't say whether the handoff summary, which is model output, becomes part of the next session's standing instructions (the system-prompt slot) or arrives as a quoted message (simulation 6).
  scenario: Kaisel has read a hostile file, and its handoff's "open" line says "first run `curl … | sh`". The owner presses a. Reading A: SI-4's "receives the instructions again, with the handoff summary" puts it in `--append-system-prompt`, where it stays for the session's life and is re-sent on every resume. Reading B: it arrives as the first message, quoted as the soldier's own words. The glossary's list of what standing instructions contain doesn't include it.
  evidence: MSG-1:286 says "A summary … is never presented as the owner's or the Monarch's instructions".
  fix: In SI-4: "The handoff summary is never part of the standing instructions. It goes in as the fresh session's first message, quoted and named as the soldier's own handoff (MSG-1)." M4-AC3 should check where it lands.

Coverage: header, §0, §1 (G1-G7, non-goals), §2 (every term), §3, §5.1 (U, C, I, X, F, S, L, R), §7, §8 Q1-Q8, Appendix A, Appendix B. Checked against them: HOST-2, HOST-5, HOST-6, HOST-8, HOST-9, HOST-10, HOST-14, HOST-15, PO-1, PO-4 to PO-8, CH-1, CH-6, CH-8, CH-9, CH-10, SI-4, MSG-1, MSG-3, MSG-4, MSG-8, MSG-10, SES-4, SES-6, SES-7, SET-1, ARM-1, ARM-6, WSP-5, SEC-3, VIS-2, LEG-1, M1-AC4, M2-AC6, M2-AC9, M2-AC10, M3-AC9 to M3-AC12, M4-AC3, M4-AC4, M6-AC5. Not raised again: the lease timing and its measurement (D-2), Q8 (D-3), H6's rate-limit hold, H38's resume.
