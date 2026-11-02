# Unit F, round 1, verification batch F-V4 (failure and timing)

## R-F-18

- severity: P2
  type: gap
  location: §3 Architecture (docs/spec/v2.md:82-83, :87)
  claim: The link between the mod and the post office is specified only for the normal case. It gives no rule for a slow or stopped reader, a lost or malformed event, or a mod that restarts.
  scenario: On Windows, writes to a pipe are synchronous. If Claude Code stops reading for a few seconds while soldiers stream, the post office's event loop blocks: it stops reading the CLIs, serving `send`, and taking lease renewals. On POSIX the events pile up in memory without limit. Events carry no sequence number and there's no snapshot command, so after a dropped line the strip shows stale states (Codex's client closes the whole post office on one bad line). A restarted mod has neither the secret nor the pipe, and 30 s later the lease ends every session (NEEDS-PROBE: can Claude Code reload a mod mid-session?).
  evidence: https://nodejs.org/api/process.html#a-note-on-process-io says "Pipes (and sockets): synchronous on Windows, asynchronous on POSIX", and warns that pipes not being read can block the event loop. Codex's draft: client.ts:51-61.
  fix: In §3: "Events are one JSON line each, with a sequence number. The mod can ask for a snapshot of every soldier's state, and does so at start and after a gap. The post office never blocks on its output, and keeps at most N MB unsent: it merges streamed text first, and never drops state changes or decisions. A restarted mod starts a new army, and the transcript gets one line." Add integration cases with a fake mod host that stops reading.

## R-F-19

- severity: P2
  type: ambiguity
  location: §5.1 F "a cache going cold, on a fake clock" (docs/spec/v2.md:489); SES-6 (:356, :367-368); HOST-15 (:154); CH-10 (:264)
  claim: No timer names its clock, and the fault level has no sleep or clock jump. So the cold estimate and the away digest go wrong across a laptop sleep. The lease is excluded, since D-2 covers it.
  scenario: Iron's cache writes report 1 h. Its last request was at 12:00, and the laptop sleeps from 12:05 to 13:15. Reading A, a monotonic clock that skips suspend: the meter shows `cold in 50m`, the owner sends, and 142k tokens are re-read at full price. Reading B, the wall clock: correct across the sleep, but a clock set back shows the soldier warm too long. HOST-15's 10 minutes fork the same way.
  evidence: SES-6 counts "the time since the soldier's last model request" and shows "cold since 13:53" in wall time. man7 clock_gettime(2): CLOCK_MONOTONIC "does not count time that the system is suspended"; CLOCK_REALTIME "is affected by discontinuous jumps".
  fix: Name each timer's clock. The cache lifetime and the away digest count real elapsed time, suspend included (wall time, guarded by a monotonic clock so that a jump back never extends it). The stop fallback and wake batching use a monotonic clock. Add fault cases for a sleep past the lifetime, and for the wall clock jumping back and forward.

## R-F-20

- severity: P2
  type: gap
  location: §1 Non-goals (docs/spec/v2.md:53); §5.1 L (:497); §5.1 U and F (:452-491)
  claim: No test level covers simulation 7 (cost from estimates instead of reports). The frame also calls claude's estimate a "report", and the live checks' "$2 of reported cost" can't bound CLIs that report no cost.
  scenario: claude's `total_cost_usd` is a client-side estimate. In streaming input it is a running total that also includes the spend a resumed session restored, and a crash's or interrupt's `result` may carry zeros. A post office that adds up each `result`, or takes a zero as a new baseline, shows doubled or negative spend in `/sessions` and HOST-15. Summing per-step usage double-counts parallel tool calls that share one message id. Nothing at any test level catches this. For codex, grok and agy, SES-7 expects no cost at all, so the $2 budget is either estimated or never checked.
  evidence: https://code.claude.com/docs/en/agent-sdk/cost-tracking says these are "client-side estimates, not authoritative billing data", reports a "running total … plus any spend restored when the call resumed a session", notes that a crash result "may carry zeroed usage, total_cost_usd", and says parallel tool calls "share the same ID". S6: an interrupted claude turn's usage was all zeros. SES-7:371 shows cost only "where the CLI reports one".
  fix: Change the non-goal so that a CLI's figure is shown as its own estimate wherever its docs say it is one. L: "The budget counts claude's reported cost and, for the other CLIs, tokens against the owner's provider dashboard; Shadow Army never estimates it." Add unit cases: running totals turned into per-turn figures; a zero or missing report recorded as "not reported", never as a baseline; restored spend after a resume; a repeated message id counted once. The wording of OBS-3 itself belongs to the M4 unit.

## R-F-21

- severity: P2
  type: gap
  location: CH-1 (docs/spec/v2.md:219); MSG-3 (:290); §5.1 F (:478, :488)
  claim: The fault level checks only that the error kinds are told apart. Nothing says what the soldier and its queue do afterwards, so every queued message goes into the same failure and ends interrupted.
  scenario: Igris's login expires with four briefs queued. The strip says "log in", but MSG-3 doesn't queue for that state, so each brief goes in, fails at once, and ends interrupted. MSG-4 then forbids resending them with one key, although none of them touched a file, so the owner retypes all four. A context overflow can do the same (NEEDS-PROBE: does each CLI compact by itself?). If the CLI exits on an expired login instead, PO-1 restarts it three times, it ends "down", and "log in" never shows. H6 covers only the rate limit.
  evidence: MSG-3:290's reasons to queue; H6 (:783) "Today the next queued message goes at once and meets the same limit".
  fix: This is a decision, to take together with H6. Either the queue holds for the owner after "login needed", or after a context overflow the CLI didn't recover from, as in `held · log in`; or the spec states that the queue burns through and tests it. Either way, the fault cases check the soldier's state and its queue after each error kind.

## R-F-24

- severity: P2
  type: ambiguity
  location: §3 Architecture (docs/spec/v2.md:82); MSG-10 (:323); HOST-5 r (:114); PO-1 (:165)
  claim: The spec never makes the post office the one authority that orders actions, so two actions at the same moment have no defined outcome.
  scenario: (a) The owner presses x on a queued brief just as it is marked delivered. Either the mod shows "cancelled" while the soldier works on the brief, or the cancel is refused with no message defined. c has the same race, so the owner's edited text can show while the old text was sent. (b) r pressed during PO-1's automatic restart either starts a second CLI resuming the same session id (two writers on one transcript) or is refused. (c) r pressed twice on a message that wasn't delivered.
  evidence: MSG-10 says "before it is delivered" but defines no outcome when the owner loses that race. M3-AC10 tests no race.
  fix: In §3: "Only the post office changes a message's or a soldier's state, one change at a time. Each mod action is a request whose result the mod shows only from the post office's event. A request that lost a race is refused with its reason, such as `already delivered`." Add integration cases for each race.
