# Unit F, round 1, verification batch F-V2 (terms and states)

## R-F-12

- severity: P1
  type: ambiguity
  location: §2 Live session (docs/spec/v2.md:61); PO-8 (:193, :195, :203, :210-211); M2-AC9 (:591)
  claim: "Turn" means both a CLI's turn and a message's span. Nothing says when a message's turn is over if the CLI takes a turn by itself once its background work ends.
  scenario: Iron's turn starts a background `npm test`. claude's `result` comes, then `task_notification` (completed). Reading A: the work has ended (:195), so the turn is over. The guard closes, the audit runs, and Iron's next queued brief goes to stdin just as claude starts its own follow-up turn (spike S6), so the two interleave. The follow-up's writes "belong to no turn" (:211), so no guard or audit covers them, and its `result` "changes nothing" (:210). Reading B: the turn waits for a follow-up, with no limit. After `stop_task`, S6 saw no follow-up within 60 s, so the queue would wait forever. The glossary's "Each message adds one turn" fits neither reading.
  evidence: :193 says a turn "the CLI takes by itself when the work ends belongs to the same message". :203 says "that turn's end event is the last". S6 (s6-results.md): a task that completes by itself is followed by a turn; `stop_task` gave none in 60 s.
  fix: In §2, define "turn" (the CLI's, up to its end event) and "a message's work" (its turns plus the background work they leave). In PO-8: "When a background task the CLI reports ends by itself, the message's work stays open until the CLI's next end event, or for N s with no new turn; a queued message goes in only then. A task stopped by s, or a plain process that exits, opens no wait." Add a fault case where a queued message is ready just as the CLI starts its own turn.

## R-F-17

- severity: P2
  type: gap
  location: §2 Glossary (docs/spec/v2.md:55-72); HOST-6 (:126); HOST-14 (:148); MSG-3 (:290); PO-1 (:165); M3-AC11 (:627); VIS-2 (:426)
  claim: The spec doesn't define the states that failures put a soldier in (VIS-2 hands them to the canvas), and the requirements that use them disagree.
  scenario: (a) HOST-6 says "error" needs the owner, but HOST-14's list has no "error" entry, and nothing defines how a soldier enters or leaves it. The owner sees the word with no card and no key that clears it. (b) MSG-3 queues for "disconnected", while PO-1 defines only "down". For a brief queued to a soldier that goes down, there are two readings: it waits until r or the session ends, or it ends "not delivered". M3-AC11's "can no longer deliver" is never defined. (c) MSG-3 doesn't queue for "log in", so messages go straight into a CLI that needs a login. Codex's draft invented "idle" and "closed".
  evidence: The cited lines; Codex's draft postOffice.ts:90.
  fix: Add a state table to §2. For each state (not started, starting, idle, working, background work, stopping, preparing handoff, handoff ready, held, reconnecting, down, log in, error), give what enters and leaves it, whether messages queue, and whether it joins HOST-14. Say when a queued message ends not delivered. The canvas then draws this table.

## R-F-40

- severity: P2
  type: ambiguity
  location: §2 Context size (docs/spec/v2.md:69); CH-2 (:226)
  claim: "Cached ones included" doesn't say whether claude's cache-write tokens count, though S3 counts input plus cache reads plus cache writes.
  scenario: A request after the cache expires reports input 3, cache creation 142,000 and cache read 0. Counting input plus reads only, the meter reads 3, the handoff can't fire, and SES-6's message says "re-reads the full 3 context".
  evidence: m0-report.md:37; https://platform.claude.com/docs/en/build-with-claude/prompt-caching#tracking-cache-performance
  fix: "Context size: every input token of the request, whether uncached, written to the cache or read from it."

## R-F-41

- severity: P2
  type: gap
  location: §2 Summary (docs/spec/v2.md:65); MSG-5 (:306)
  claim: "At most five lines" sets no line length, so the size limit on what enters Claude's conversation is either missing or depends on the window's width.
  scenario: Beru replies in one 20,000-character line. Counted by newlines, the whole reply goes into Claude's conversation (:308). Counted by wrapped lines, the cut depends on the transcript's width.
  evidence: G3:41 "short summaries".
  fix: "at most five lines of at most N characters, cut the same way at any width" (N is a decision).

## R-F-46

- severity: P2
  type: gap
  location: §5.1 U (docs/spec/v2.md:454); HOST-7 (:128)
  claim: Unit tests cover "state precedence", but no requirement defines it, and HOST-7's "most urgent fact first" has no order.
  scenario: Iron has a held queue, a handoff ready and a cold cache at once. The strip word, the status entry and HOST-14's grouping can each pick a different one.
  evidence: "precedence" appears only at :454.
  fix: Decision: the order, stated in VIS-2 or HOST-7.

## R-F-47

- severity: P2
  type: ambiguity
  location: §2 Brief (docs/spec/v2.md:64); HOST-9 (:135)
  claim: "A message that assigns work" names no sender, so the owner's `/send --kind` has no defined sender, reply path or wake.
  scenario: For `/send Iron --kind build fix x`: as the owner's brief, it breaks ARM-4 (only the Monarch assigns work). As the Monarch's, MSG-5 adds its card to Claude's conversation and MSG-8 may wake Claude at the owner's cost.
  evidence: MSG-7:310 ("as you"); ARM-4:382.
  fix: Decision: the owner's brief (sender "you", summary in the pane, no wake) or a brief on the Monarch's behalf.

## R-F-49

- severity: P3
  type: editorial
  location: §3 (docs/spec/v2.md:78, :84)
  claim: The diagram says channels are "one per CLI", against §2:60 and CH-2:222 (one per soldier). :84 adds `send` "to each soldier", against PO-4:182 (none for agy).
  scenario: One shared claude channel means one crash takes down Kaisel, Tank and Iron together.
  evidence: as cited.
  fix: "one per soldier"; "to each soldier whose CLI allows it (PO-4)".

## R-F-9

- severity: P3
  type: editorial
  location: §2 Glossary (docs/spec/v2.md:55-72)
  claim: The glossary omits load-bearing terms used across units, which the frame exists to define.
  scenario: Other units use "owner," "guard"/"checkout guard," "worktree," "snapshot," "claim"/"claim audit," and "attribution card" as if defined; the frame defines none of them, so each unit reinvents the term.
  evidence: §2 lines 55-72 define 16 terms; none of the above. They appear in §3, G6, WSP-2/WSP-4, ARM-6, HOST-14 and throughout.
  fix: Add glossary entries for owner, worktree, snapshot, checkout guard, claim/claim audit and attribution card (autonomy is covered by the P1 finding above).
