# F round 1, verifier F-V4 (failure and timing): R-F-18, 19, 20, 21, 24. Snapshot be9deb0.

- id: R-F-18
  verdict: CONFIRMED, for the slow reader only (it touches D-2)
  severity: P2 (as given), for the slow reader alone
  evidence:
    - §3 :82-83 gives no rule for a mod that falls behind on the event stream.
    - Claude Code's typings, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts:8016-8017: "Nothing of the stream is dropped: once 1048576 characters wait unread, the child blocks on its next write until the loop pulls."
    - https://nodejs.org/api/process.html#a-note-on-process-io: "Pipes (and sockets): synchronous on Windows, asynchronous on POSIX", and "Synchronous writes block the event loop".
    - Codex's draft writes each event with a plain `process.stdout.write` and never handles backpressure (C:\Users\johns\projects\AIConnections-m1\src\v2\main.ts:57).
    - In D-2's prototype, a 25 s stall of the post office ends the lease as built in 498 of 1000 runs (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\raw\D-2-prototype.md:25).
    - D-2 option A already drafts this rule and its test (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\raw\D-2-option-A.md:25 and :57). Option B has nothing like it.
    - Refuted parts:
      - No line is ever lost (d.ts:8016), so sequence numbers and a snapshot add nothing.
      - "A few seconds" is far too short: a 1,048,576-character buffer has to fill first.
      - Only a bug in the post office could produce a malformed line.
    - The restarted mod is a DUPLICATE of R-F-30. d.ts:3492-3494 adds that "the module unloading kills the child", which answers R-F-30's NEEDS-PROBE when the mod spawns the post office directly. Codex's relay detaches it instead (C:\Users\johns\projects\AIConnections-m1\src\v2\modRelay.ts:7).
  reason: A mod that falls 1 MiB behind freezes the post office on Windows (no CLI reads, no `send`, no renewals) or grows its memory without limit on POSIX, and the lease as built then ends live sessions; the rest of the finding is refuted or is R-F-30.
  fix: Keep D-2 option A's bullet in PO-7 whichever timing D-2 picks, widened to the whole event loop: "**The event stream never holds the post office.** Claude Code blocks a child of the mod on its next write once 1,048,576 characters of its output wait unread, and Node writes to a pipe synchronously on Windows. So the post office writes its events without blocking its event loop, and goes on reading its soldiers, serving `send` and taking renewals while they wait. Past 16 MiB of events not yet written, it stops reading its soldiers' output until the mod has read them." Add option A's M1-AC1 case: nothing reads standard output, on each of the three systems. Add no sequence numbers or snapshot.

- id: R-F-19
  verdict: CONFIRMED
  severity: P2 (as given). The sleep split applies on Linux only, because Node's monotonic clock counts sleep on Windows (QueryPerformanceCounter) and on macOS (mach_continuous_time). The split from a clock set back or forward applies on every system.
  evidence:
    - SES-6 :356 counts "the time since the soldier's last model request". :367-368 show a countdown, then `cold since 13:53` in wall time.
    - HOST-15 :154 and CH-10 :264 are timers too, and no clock is named anywhere in the spec (grep).
    - §5.1 F :489, M4-AC4 :646 and M5-AC9 :679 say only "on a fake clock".
    - https://man7.org/linux/man-pages/man2/clock_gettime.2.html: CLOCK_MONOTONIC "does not count time that the system is suspended".
    - https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps: QPC counts "the time when the machine was in a sleep state such as standby, hibernate, or connected standby".
    - The mod's `$.clock.now()` gives epoch milliseconds (claude-code.d.ts:3400-3405), and the typings name no clock for its waits.
    - The digest's idle timer runs in the mod (C:\Users\johns\projects\AIConnections-v06\docs\adr\0015-the-quiet-default.md:31).
    - D-2 covers only the lease (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\decisions.md:29-36).
    - Codex's lease uses `performance.now()` (D-2-prototype.md:35).
  reason: A builder who times durations on a monotonic clock, as Codex did, shows a Linux soldier as warm after a sleep that outlasted its cache, so the owner sends into a full re-read; a wall clock set back does the same anywhere, and the fake-clock tests can't tell the two readings apart.
  fix:
    - SES-6's timer and HOST-15 get: "Idle time is real time, sleep included: the larger of the wall clock's and the monotonic clock's time since the last model request (for HOST-15, since the owner's last input). A sleep counts, and a clock set back never keeps a soldier warm."
    - CH-10's 30 seconds and MSG-8's few seconds count on the monotonic clock.
    - §5.1 F :489 reads "a cache going cold, on a fake clock, also across a sleep longer than its lifetime and with the wall clock set back and forward an hour", and M4-AC4 and M5-AC9 add those cases.

- id: R-F-20
  verdict: DUPLICATE of R-M1-12 (claude's figures) and R-F-33 (the $2 budget)
  severity: P2 (as given; R-M1-12 is P1)
  evidence:
    - R-M1-12 (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\raw\M1-r1-chaos.md:43-49) cites the same documentation page. Its fix covers every part of this one: running totals plus restored spend, a zeroed result after a crash or a stop, each message id counted once, and figures "shown as claude's own estimate".
    - R-F-33 (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\raw\F-r1-implementer.md:47 and :49) says "The $2 budget can't be counted for CLIs that report no cost", and its fix covers that.
    - I checked the vendor facts at https://code.claude.com/docs/en/agent-sdk/cost-tracking:
      - the figures are "client-side estimates, not authoritative billing data";
      - in streaming input, total_cost_usd and modelUsage "carry the running total for the whole call so far, plus any spend restored when the call resumed a session";
      - a crash result "may carry zeroed `usage`, `total_cost_usd`, and `modelUsage`";
      - when Claude uses tools in parallel, the messages "share the same `id`".
    - The one part left over, "no test level covers simulation 7", doesn't hold.
      - Simulation 7 is "Cost log uses estimated tokens instead of provider usage" (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\codex-review-method.md:15).
      - The spec never estimates (§1 :53) and takes usage from each CLI's own events, keeping the raw fields (SES-2 :336, OBS-3 :446).
      - M1-AC3 :548, M4-AC1 :643 and M4-AC5 :656 test this.
  reason: Every part of the finding is already raised by R-M1-12 or R-F-33, so it should be fixed there.

- id: R-F-21
  verdict: DUPLICATE of R-F-17 (part c) and R-M1-15; it touches H6, and M15/H44 for the context-overflow case
  severity: P2 (as given)
  evidence:
    - R-F-17 (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\raw\F-r1-chaos.md:63): "MSG-3 doesn't queue for 'log in', so messages go straight into a CLI that needs a login". Its fix is a state table that says whether messages queue in each state.
    - R-M1-15 (M1-r1-chaos.md:67-73): a login error followed by an exit is restarted three times and ends "down", never "log in".
    - The rate limit is H6 (:783), an open v2.0 item.
    - The text does give an outcome, which is that the queue goes on: PO-8 :209 "Only then is ... the next message sent", MSG-3 :290-292 list the only reasons a message waits, and H6 :783 says so.
    - The scenario overstates the cost. The owner retypes nothing: r puts the text back in the field and Enter sends it (MSG-4 :304, HOST-5 :114). The rule against resending with one key is the owner's own decision (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\settled.md:20).
    - Whether each CLI compacts by itself after a context overflow is NEEDS-PROBE.
  reason: The login case is R-F-17's and R-M1-15's and the rate limit is H6's; the context-overflow case needs a live probe; the checks on queue and state after each error kind belong in R-F-17's state table and H6's bake-off.

- id: R-F-24
  verdict: CONFIRMED, for case (a) only: a cancel or change racing delivery
  severity: P2 (as given)
  evidence:
    - MSG-10 :323 ("before it is delivered"), its line to Claude at :324, and M3-AC10 :626 give no outcome for a cancel or change that reaches the post office after delivery, and no rule for Claude's line then.
    - MSG-4 :303 makes the post office's "delivered" record decide. Nothing says the mod shows a cancel only once the post office has recorded it; §3 :82 says only that the mod "draws those events".
    - The spec does settle the same race for approval answers (CH-6 :251, M5-AC8 :678), but not for the queue.
    - Case (b) is mostly covered. A second CLI on one session breaks CH-2 :222 ("One long-lived ... process per soldier") and SES-1 :334. Only what r answers during an automatic restart is left unsaid, and R-M1-14 also asks what r does to the restart count.
    - Case (c) is covered. r sends "the same message" (MSG-4 :301, M3-AC12 :629), and only one "that was not delivered" (HOST-5 :114).
  reason: The race is most likely just when the owner most wants to cancel, as the soldier's turn ends, and a mod that marks "cancelled" at once can show it, and tell Claude, while the soldier works on the brief.
  fix:
    - Add to §3, as proposed: "Only the post office changes a message's or a soldier's state, one change at a time. Each mod action is a request whose result the mod shows only from the post office's event. A request that lost a race is refused with its reason, such as `already delivered`."
    - Add to MSG-10: "A cancel or change that reaches the post office after the message was delivered is refused with `already delivered`, and Claude gets no line."
    - M3-AC10 adds that race. Case (c) needs no new test.
