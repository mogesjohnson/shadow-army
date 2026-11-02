# M1 round 1, verifier M1-V3 (death and containment): R-M1-9, R-F-10, R-M1-5, R-M1-14, R-M1-15, R-M1-19, R-M1-27, R-M1-51. Snapshot be9deb0; v0.7 noted. Cut off by the usage limit and resumed in the same session.

- id: R-M1-9
  verdict: CONFIRMED
  severity: P1
  evidence:
    - The spec as reviewed (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@be9deb0.md):
      - :168 ends a process tree only "When a channel closes or restarts", which a dead post office can't do.
      - :186 relies on "its process containment (PO-1)", but nothing defines it for this case.
      - §5.1 F :477 kills a CLI, M1-AC4 :553 only closes a channel, and M3-AC12 :631 kills the post office but checks only the message.
    - The owner meant containment as the lease's backstop: settled M1 decision 1, "beside the launcher watch and process containment" (C:\Users\johns\projects\AIConnections-review\docs\spec\review\settled.md:22).
    - claude keeps working after its input ends:
      - "After Claude finishes its turn and stdin has closed, a claude -p run can stay open to wait for background work … Claude then takes one more turn with the outcome" (https://code.claude.com/docs/en/headless#background-tasks-at-exit).
      - A background command gets 30 minutes in a stream-json run, up to 2 hours (https://code.claude.com/docs/en/tools-reference#time-limit-for-background-commands).
    - By default nothing ends the tree when the post office dies:
      - On POSIX, a child is not signalled when its parent dies.
      - On Windows, libuv puts a non-detached child in a kill-on-close job "so windows will kill it when the parent process dies". Because of silent breakaway, "only the processes that we explicitly add are affected, and *their* subprocesses are not" (https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/process.c). So claude dies with the post office, but its Bash and MCP children run on.
      - Kills happen often, not only in rare crashes: "the module unloading kills the child" (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts:3493). D-12's chosen option (a) relies on that kill at every mod reload (C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md:200-201).
    - Codex's draft contains the process; the spec doesn't require it (C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts:42-52, "even when the post office is killed without running finally"; client.ts:36-38).
    - 2.0 had a backstop that wasn't carried over: "at startup `sa` kills leftover processes after matching their command lines" (SOLD-4, C:\Users\johns\projects\AIConnections-review\docs\legacy\spec\shadow-army-2.0.md:690).
    - Each D-3 draft already has this requirement and its test:
      - A (C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-3-option-A.md:81, :320): "whenever the post office itself is gone … the tree is killed straight away", and "The writer stops within 2 seconds".
      - B (raw\D-3-option-B.md:60): "If the post office dies".
      - C (raw\D-3-option-C.md:108-124, M1-AC15 :168). Under C, if the mod dies too, trees run "until a post office next starts in this folder" (:124).
    - Overlap with other fixes:
      - R-M1-8's pending fix puts D-2 option A's "Containment" bullet into PO-7 (ledger.md:115; raw\D-2-option-A.md:28). That bullet states the requirement but rests on PO-1.
      - R-M1-10's pending fix kills the post office in M1-AC1, but checks only the transcript and the restart (ledger.md:117).
    - The finding's NEEDS-PROBE (does claude exit on a broken pipe) doesn't change the verdict: the CLI's children outlive it either way.
  reason: Real: nothing in the spec ends a soldier's tree when the post office dies, and a plain spawn leaves the CLI's children running on every system. A full-autonomy soldier's work then goes on with nothing to guard, log or stop it.
  fix:
    - PO-1 adds: "If the post office's own process ends without closing a channel, however it ends, a kill or a crash included, that channel's whole process tree still ends, as the containment Q8 chooses says." D-3's winner supplies the mechanism and how soon.
    - §5.1 F adds "the post office killed mid-turn while the CLI has a child running".
    - The M1-AC1 case from R-M1-10's fix adds "and the fake and its child are gone".
    - D-3's judge and card must weigh this point: under C, a tree outlives a post office that was killed together with its mod until the next start; under A and B it ends at once.
  v0.7: not fixed (C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md PO-1 190-195, PO-7 212-214, §5.1 F 543-559).

- id: R-F-10
  verdict: CONFIRMED (in part). The rest is DUPLICATE: the CLIs of R-M1-9, the lock of R-M1-3, the restart and what the owner sees of R-M1-10.
  severity: P1
  evidence:
    - The duplicated parts:
      - Part (1) is R-M1-9, above.
      - The lock is R-M1-3, confirmed by M1-V2: a stale lock is replaced at start (C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md:110).
      - Parts (4) and (5) and the restart policy are R-M1-10, confirmed with D-2 option A's HOST-2 change (restart at the next use), its "What the owner sees" bullets (toast included) and the reason `the post office stopped unexpectedly` (ledger.md:117).
      - M1-V2 left "what a crash does to CLIs, turns, guards, messages and the lock" to this finding (raw\M1-r1-verify-V2.md:83).
    - Part (3), partly covered:
      - MSG-4 :298 already ends a message "not delivered … because the post office stopped first".
      - M3-AC12 :631 has a restarted post office mark a delivered message interrupted.
      - Nothing says who ends a dead post office's queued messages, or when. MSG-3 :291 ("goes by itself … including after a reconnect") would even send them into new sessions.
    - Part (2), new and real:
      - PO-8 finishes a cut-short turn "before anything else", by closing its guard and running its audit (:202-203). D-2 option A's shutdown does the same (raw\D-2-option-A.md:29-38). Both need a living post office.
      - Nothing keeps the guard's baseline on disk (PO-8; ARM-6 :384-393; WSP-4 :401). Codex's M1 draft holds it in local variables (C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts:202-213), as v1 does (C:\Users\johns\projects\AIConnections-review\src\workspace\guard.ts:23, :59).
      - So a turn cut short by the post office's death is never finished, and its checkout changes reach no attribution card.
    - D-3 option C's NEW-6 (raw\D-3-option-C.md:117) ends a dead post office's trees at the next start, but doesn't reconcile records.
  reason: Once the duplicates are removed, one gap is left. A dead post office's open turns, their guards and its queued messages have no outcome. Every rule that would finish them needs a living post office, and nothing keeps a turn's guard baseline, so its changes slip past the guard.
  fix:
    - PO-1 adds: "**After a post office that didn't close its channels.** Before it opens any channel, a post office finishes what that one's records left open. Each turn still open is finished as PO-8 says (→M2), its guard closed against the baseline kept on disk for it, and its message ends as interrupted. Each queued message ends as not delivered. Both carry the reason `the post office stopped unexpectedly`, and nothing is sent again by itself (MSG-4, →M3)."
    - PO-8 adds: "A turn's guard baseline is on disk before its message goes in." This relies on R-F-13's durable records.
    - The mod, once the post office's output ends with no shutdown event, drops that post office's approval requests from the decisions list and stops showing its soldiers as working (HOST-14, →M5).
    - §5.1 F adds: the post office killed mid-turn, with a message queued and an approval request open.
  v0.7: not fixed (PO-1 190-195, MSG-3 317-322, MSG-4 327, M3-AC12 710).

- id: R-M1-5
  verdict: CONFIRMED
  severity: P2
  evidence:
    - :168 says "so nothing the CLI started keeps running".
    - 2.0 said the opposite, and v2 carried none of it:
      - SAFE-11: "Vendor daemons outside the group (F34) are a stated residual risk" (C:\Users\johns\projects\AIConnections-review\docs\legacy\spec\shadow-army-2.0.md:1049).
      - F34 (:241): "grok runs a shared leader daemon. codex's Windows sandbox runs as a service outside codex.exe's process tree". SOLD-5 (:691) listed them.
      - WSP-7's "from 2.0 SAFE-11" doesn't bring the residual back, since :168 says the opposite and this spec governs (§0 :31).
    - Escaping needs no hostility:
      - "Each session is its own Claude Code process under the supervisor", not a child of what started it (https://code.claude.com/docs/en/agent-view). So a soldier's `claude --bg`, in a trusted folder, leaves its tree.
      - systemd-run's service runs "with the service manager as its parent process" (cited at C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-3-option-A.md:364). cron, at, launchd, Task Scheduler and WMI behave the same way.
    - The prototype (C:\Users\johns\projects\AIConnections-review\docs\spec\review\prototypes\D-3\results\summary-main2-20261014-063708.txt:15-49):
      - A setsid double-fork daemon survived a process-group kill and polling, 20 of 20 runs each.
      - A subreaper, a systemd scope or a PID namespace ended it.
      - M1-AC4 :553 and §5.1 F :479 test only a child that stays in the tree.
    - All three D-3 drafts already state the limit: A's NEW-1 (:73), B's "Limits" (raw\D-3-option-B.md:61) and C's NEW-4 (raw\D-3-option-C.md:68-81). Each has a double-fork test (A :243, B :192, C :142-152).
    - The finding's proposed detection fails: an escaped process's change after the turn "belongs to no turn" (:211), so neither the guard nor the audit sees it (C's NEW-4, :81).
  reason: Real: process-tree containment can't hold work that a CLI hands to a service outside its tree, whether a hostile command or a vendor feature such as `claude --bg` does it. So :168's guarantee is false as written, and v2 dropped the residual 2.0 stated.
  fix:
    - Not as proposed on detection. The text goes in with D-3's winner, and the residual goes into D-4's threat model.
    - Until then, PO-1's last bullet reads: "When a channel closes or restarts, the post office ends the CLI's whole process tree: the CLI and every process that descends from it, one that starts a new session or forks twice included. Work the CLI hands to a service outside its tree keeps running: a systemd, launchd or cron job, a scheduled task, a process started through WMI, or a vendor's own background service such as Claude Code's background sessions. That is a stated residual risk (D-4), and no guard or audit sees what such work changes after the turn."
    - §5.1 F's child line adds "and one that starts a new session and forks twice".
  v0.7: not fixed. PO-1 195 is unchanged. §0 31 drops SAFE-11's group kill at turn end, but not its residual.

- id: R-M1-14
  verdict: CONFIRMED
  severity: P2
  evidence:
    - :165 and M1-AC4 :551 set no delay, no window and no reset.
    - Codex's draft restarts at once and sets `restarts: 0` only when it makes a session (C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts:131, :161-173). So the count never resets in a long session; only an explicit reconnect makes a new one (:94-104).
    - Fast failures are documented: "If you pass an invalid flag, Claude Code reports the error to stderr before the run starts", with a non-zero exit (https://code.claude.com/docs/en/headless).
    - One sub-question is already answered: a restart whose CLI exits at once counts, because any process ending is a crash (:166).
    - No settled decision or ADR fixes the count. settled.md:19 keeps only "a lost connection is a crash … restarts it". The values are technical (PLAYBOOK §14).
  reason: Real: read as a lifetime cap with no delay, the three restarts are used up in under a second by a transient start failure. Isolated crashes hours apart still leave a soldier down.
  fix: As proposed. The orchestrator sets the values in "Values set in the fix pass". M1-AC4's crash bullet adds the delays, the window and the reset, on a fake clock.
  v0.7: not fixed (PO-1 192, M1-AC4 622).

- id: R-M1-15
  verdict: CONFIRMED
  severity: P2
  evidence:
    - :166 restarts after any exit.
    - Which state shows is already answered: VIS-2 :426 takes the canvas's state order (R-F-46 was refuted on that page), and "log in needed" comes before "disconnected" (v0.7 table 470-472). What is open is whether the channel restarts.
    - The restart does harm:
      - claude reports a login failure inside a run, so a restart can succeed.
      - The next message then fails the same way, ends interrupted (:297, :302) and exits again.
      - Three messages are used up before the soldier is down.
    - Vendor docs:
      - "When a failure happens inside the run, such as missing authentication, Claude Code prints the failure as the result on stdout", and a failed run exits non-zero (https://code.claude.com/docs/en/headless).
      - SDKAssistantMessageError includes 'authentication_failed', and other startup failures "end with stderr output, a non-zero exit, and no result message" (https://code.claude.com/docs/en/agent-sdk/typescript).
    - NEEDS-PROBE, not blocking: whether a stream-json session exits after one failed turn. The rule is needed for any CLI that exits; agy ends its session on some inputs (:252).
    - For the F fix check: R-F-21's queue half went to R-F-17 part (c) (C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\F-r1-verify-V4.md:57-65), and v0.7 MSG-3 319 still doesn't queue for "log in".
  reason: Real: PO-1 counts the exit as a crash, so an expired login is restarted three times and uses up a message each time. The expired-login fault test also has no expected outcome. The display half is already settled by VIS-2's order.
  fix:
    - As proposed.
    - §5.1 F's expired login, and M1-AC4's third bullet, get this outcome: a login needed never restarts the channel, whether the CLI keeps running or exits after it, and the soldier shows "log in" until r.
  v0.7: not fixed (PO-1 193, §5.1 F 556).

- id: R-M1-19
  verdict: CONFIRMED (the start half; the mid-turn half is REFUTED)
  severity: P2
  evidence:
    - Refuted, mid-turn:
      - :166 says "Only the CLI's process ending, or the post office losing its connection to the CLI, is a crash", so silence is never a crash.
      - From M3, s stops a hung turn (MSG-9 :312-320, CH-10 :261-266).
      - claude bounds most silences itself: a stdio MCP call with no response aborts after 30 min, a network one after 5 (CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT), and an API request after 10 min (API_TIMEOUT_MS) (https://code.claude.com/docs/en/env-vars).
    - Real, the start:
      - No bound limits "starting", and MSG-3 queues for it (:290).
      - The draft fails the channel when `initialize` gets no answer in 30 s (C:\Users\johns\projects\AIConnections-m1\src\v2\claude.ts:86, :122, :340).
      - With --mcp-config, claude "waits for still-pending servers to connect before running the first turn, up to the MCP_TIMEOUT startup timeout, 30 seconds by default" (https://code.claude.com/docs/en/cli-reference). It sends its init message "once the first-turn wait, if any, resolves" (https://code.claude.com/docs/en/agent-sdk/mcp#connection-timing).
      - So from M3 (PO-4) a healthy slow start races a 30 s watchdog.
    - §5.1 F :487 "a slow first token" has no outcome.
  reason: The start half is real: no bound applies, so one build waits on "starting" forever and another restarts a healthy start that is still inside MCP_TIMEOUT. Silence during a turn is already not a crash.
  fix:
    - PO-1 adds: "Silence is never a crash: a running CLI is not ended or restarted for sending nothing, and the owner can stop its turn (MSG-9, →M3). A start that gives no sign of life within its CLI's own startup wait plus 30 seconds has failed, and counts as a crash. For claude the sign is its answer to the `initialize` control request, and the wait is `MCP_TIMEOUT`, 30 seconds unless the owner set it."
    - §5.1 F gives "a slow first token" an outcome: a fake that answers 5 s inside the bound, and one that sends nothing mid-turn for 10 minutes, both run on and are never restarted; one that never answers is restarted as after a crash.
    - No new silence display is needed, since HOST-14 already shows the current tool call.
  v0.7: not fixed (PO-1 193, §5.1 F 555).

- id: R-M1-27
  verdict: DECISION
  severity: P2 (was P1): it isn't untestable. Settled M1 decision 3 gives M1 a live route (`sa live`), and an integration test can drive the start path through a fake `$` (C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-2-option-A.md:53). Only a named trigger is missing.
  evidence:
    - M1's Implements (:536-544) has neither HOST-9 (:132, M5) nor HOST-10 (:136, M3), so nothing in M1 uses the army (HOST-2 :94, M1-AC1 :546).
    - The draft invented `/army [open|inspect|stop] [soldier]` (C:\Users\johns\projects\AIConnections-m1\plugins\shadow-army\hooks\register.ts:207-233). HOST-9 has no such subcommands, and they overlap `/stop` and `/pane`.
    - settled.md:24 says "`sa live` may stay as a dev tool". The draft's `sa live <soldier> [task...]` opens, messages and stops a soldier through its own post office (C:\Users\johns\projects\AIConnections-m1\src\v2\cli.ts:18-60). No spec text names it.
  reason: Real: M1 has no command or tool, so "the first use of the army" means nothing there and builders invent a trigger, as the draft did against HOST-9. Choosing M1's trigger is a sequencing choice among sound options.
  options:
    - A, recommended: bring HOST-9's `/army` forward to M1, list form only, as the first use. Name `sa live` as M1's dev tool to open, message, stop and reconnect a claude soldier. Run M1-AC8 and R-M1-51's check through these two, with the lock keeping one post office per folder. It adds nothing HOST-9 lacks, and it gives the live checks a trigger.
    - B: the draft's dev-only `/army open|inspect|stop <soldier>`, replaced by HOST-9's commands in M5.
    - C: no M1 trigger. M1-AC1 uses a fake `$`, the first real use arrives with HOST-10 in M3, and everything live in M1 goes through `sa live`.
  big or technical: technical, as milestone order and test entry points within settled decision 3. B becomes big if its subcommands ship in 2.0.
  v0.7: not fixed (HOST-2 103-104, M1-AC1 617).

- id: R-M1-51
  verdict: CONFIRMED
  severity: P2
  evidence:
    - Nothing exercises HOST-2 (:94, "M1; I") on the real host:
      - Integration tests use fake CLIs (:464) and a fake `$`.
      - VER-1 :502 keeps models out of CI, and no AC loads the mod in Claude Code.
      - VER-10 (v0.7 585) runs the army live in M6, but not its lifecycle.
    - Host behavior that a fake can't show:
      - session.end's "one short wall-clock bound (1.5 s by default)" (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts:10980; https://code.claude.com/docs/en/hooks: "SessionEnd hooks share a 1.5-second budget").
      - "the module unloading kills the child" (d.ts:3493).
      - `/clear` with no session.start after it (d.ts:10989-10991).
      - Windows' kill-on-close job (libuv process.c), which the draft works around (C:\Users\johns\projects\AIConnections-m1\src\v2\client.ts:36-38).
    - The draft says the same: "Static plugin validation does not establish live HOST-2 acceptance … Acceptance must verify first-use startup, subsequent reuse, normal exit, clear/resume, mod reload/unload and abrupt host loss" (C:\Users\johns\projects\AIConnections-m1\plugins\shadow-army\README.md:31-35).
    - This is technical (how something is verified). It needs no model call, since an opened soldier is never messaged. R-F-50's VER-10 was handled the same way.
  reason: Real: HOST-2 and PO-7 depend on host behavior that a fake host can't reproduce, and no live check covers it, not even M6's VER-10.
  fix:
    - As proposed: HOST-2 becomes (M1; I, C, L).
    - M1-AC8 adds a check the owner runs on Windows and on one POSIX system: first use, reuse, `/clear` (as D-11 decides), a mod reload (as D-12 decides), a normal exit, and Claude Code killed from outside. Each time, the post office, its soldiers and the lock end as HOST-2 and PO-7 say, and the run is written up on the PR.
    - It needs R-M1-27's trigger.
  v0.7: partly. HOST-2 is (M1; I, C), and §5.1 C 526 records a claude soldier session with the mod installed. That checks only the rule that the mod acts in the owner's own interactive session alone.
