# F round 1, verifier F-V2 (terms and states): R-F-12, 17, 40, 41, 46, 47, 49, 9. Snapshot be9deb0.

- id: R-F-12
  verdict: CONFIRMED
  severity: P1
  evidence: §2 :61 ("Each message adds one turn"). PO-8 :195 ("The work has ended when the CLI reports each task's end and each such process has exited") and :199 ("Once the turn's own work has ended, the turn is over, the next message can go in") conflict with :193 and :203, which give the CLI's own later turn to the same message and make its end event the last. M2-AC9 :590-591 passes under either reading if the fake sends its follow-up at once. C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\s6-results.md:10-11: a task that completes by itself is followed by a turn, and `stop_task` gave none in 60 s. https://code.claude.com/docs/en/agent-sdk/typescript#sdkresultmessage: an injected follow-up's `result` carries `origin: {kind: "task-notification"}` ("Check kind to distinguish results that answer your prompt from injected follow-ups"). When several completions are answered together, empty results with `num_turns: 0` come before the one that carries the turn. #sdktasknotificationmessage gives `status` as completed, failed or stopped. The stop path is already defined (MSG-9 :316-318, M2-AC9 :592). Same root as R-M1-16.
  reason: Read literally, :195 and :199 end the turn and release the queue at `task_notification`, before the follow-up turn that :193 and :203 give to the same message, so the follow-up's `result` and writes land on the next message or on no guard, and nothing limits the wait for a follow-up that never comes.
  fix: §2: "**Live session:** one open conversation in a soldier's CLI. Each message adds one turn, and any turn the CLI then takes by itself when that turn's background work ends (PO-8)." PO-8 :195, first sentence: "The work has ended when the CLI reports each task's end, each such process has exited, and each turn the CLI takes by itself with a task's outcome has ended; at the latest at the CLI's own time limit for background work. claude takes such a turn when a task completes or fails by itself, and marks its messages and `result` with the origin kind `task-notification`. It may answer several outcomes in one turn; then the others' `result`s come first, empty, with `num_turns` 0. A task stopped by s (MSG-9), or a process that is not a CLI task, starts no such turn. A task whose follow-up has sent no event N seconds after the task ended has none." §5.1 F: "a queued message ready just as the CLI starts a turn by itself after background work". Apply together with R-M1-16's fix (CH-2 :225 attributes each `result` by its origin). N is a technical default.

- id: R-F-17
  verdict: CONFIRMED
  severity: P2
  evidence: HOST-6 :126 lists "error" among the words of states that need the owner. But HOST-14 :148 has no error entry and HOST-8 :130 no error toast. HOST-14 :149's groups place no soldier that is in error, starting, reconnecting or preparing a handoff. Nothing says when error ends. The canvas (VIS-2 :426) has the vocabulary but the same gap:
    - C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\V2-Foundations.dc.html:41, :56, :311 ("its last turn failed");
    - C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\V2-Pane.dc.html:481-486: an error view with r, d and o, so a card and keys do exist;
    - C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\V2-Steering.dc.html:150: the decisions list, without error.
  Part (b) is already covered. MSG-3 :291 and the disconnected card (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\V2-PostOffice.dc.html:252, "It goes by itself once Bellion is back") keep a down soldier's messages queued until r. MSG-4 :298 uses "not delivered" for a post office that stopped first. The canvas names the state "disconnected", with "down" as its strip word (V2-Foundations.dc.html:284, :297). Part (c) is R-F-21. Touches H6, since a rate limit is an error state.
  reason: The states exist on the canvas, but "error" counts as needing the owner in the strip while it has no list row, no count, no toast and no exit, and four states fall in no HOST-14 group, so the strip, HOST-7's count and the needs-you tab disagree.
  fix:
    - HOST-6 :126: "Only a state that needs the owner (HOST-14), or error, shows a word in the strip, …". Add: "'error' shows from when a turn ends interrupted by what its CLI reported (PO-8), apart from a login needed, until the soldier's next turn starts or it starts fresh. It waits on nothing, so HOST-7's count, HOST-8's toasts and HOST-14's list leave it out."
    - HOST-14 :149: "in groups: working (stopping, background work and preparing handoff included), then error, then cold and idle, then starting, reconnecting and not started."
    - This keeps what the spec and the canvas already show, so it is technical. Making error a decision instead (a list row and a toast) would be the owner's call.

- id: R-F-40
  verdict: CONFIRMED
  severity: P2
  evidence: §2 :69. CH-2 :226 and SES-2 :339 name only "the usage" of the last assistant message. SES-2 :342 gives agy "input tokens plus cache reads", a pattern that leaves out claude's cache writes. C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\m0-report.md:37 (S3: input + cache read + cache creation). https://platform.claude.com/docs/en/build-with-claude/prompt-caching#tracking-cache-performance: `input_tokens` counts only the tokens after the last cache breakpoint, and "total_input_tokens = cache_read_input_tokens + cache_creation_input_tokens + input_tokens". Codex's draft counts cache writes in the context size (C:\Users\johns\projects\AIConnections-m1\src\v2\claude.ts:211) but leaves them out of a turn's normalized input (:250). SES-7 :371's "input (cached included)" therefore has the same gap.
  reason: "Cached ones" reads naturally as cache reads, and under that reading a request that rewrites an expired cache (input 3, writes 142,000, reads 0) measures 3, which breaks the meter, the handoff line and SES-6's message.
  fix:
    - §2 :69: "**Context size:** every input token of the session's most recent main model request, whether uncached, written to the cache or read from it: …" (the rest as is).
    - CH-2 :226: "… whose `parent_tool_use_id` is null: its `input_tokens`, `cache_creation_input_tokens` and `cache_read_input_tokens` together."
    - SES-7 :371: "input (cache writes and reads included)".

- id: R-F-41
  verdict: CONFIRMED
  severity: P2
  evidence: §2 :65; MSG-5 :306, :308; SI-1 :274; G3 :41. C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\V2-Messaging.dc.html:77 says "The card never grows past five", and :91 says "What Claude reads: Exactly the card's text … Every later message of Claude's re-sends it, which is why the summary stays at five lines". The archived 2.0 UPD-2 capped a report item at 1,500 characters and its summary at 600 (C:\Users\johns\projects\AIConnections-v06\docs\legacy\spec\shadow-army-2.0.md:615-619); v2 does not carry that cap. Related to R-F-7 (message sizes), but not the same defect.
  reason: Models write paragraphs as single lines, so cutting by newlines puts no limit on what enters Claude's conversation and is re-sent with every later message, while cutting by wrapped rows would make Claude's text depend on the terminal's width.
  fix: as proposed.
    - §2: "**Summary:** a reply of at most five lines of at most N characters each (MSG-5)."
    - MSG-5 :306: "A summary has at most five lines of at most N characters each, counted the same at any width. A longer line or reply is cut with …, and the whole reply is saved as the report."
    - SI-1 :274 gives soldiers the same limit.
    - N is a technical limit.

- id: R-F-46
  verdict: REFUTED
  severity: P2 as given
  evidence: VIS-2 :426 takes soldier states from the canvas's v2 Foundations page. Its rules say: "One state at a time per soldier. The order of precedence: log in needed, error, disconnected, waiting on you, handoff ready, queue held, preparing handoff, working, near handoff, cold, idle, starting, not started". Near handoff and cold show as a second glyph (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\V2-Foundations.dc.html:41-42). The canvas's status-line frames show HOST-7's order (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\V2-Host.dc.html:284-290). In the scenario:
    - the strip shows "handoff";
    - HOST-7 gives "2 need you: /decisions" when a stop's hold and the handoff are both open; with only a handoff card open, the hold is the card's (MSG-3 :292);
    - HOST-14 lists each decision.
  reason: The precedence that the U level tests is defined on the page VIS-2 cites. That it lives only on the canvas, outside the repository, is R-F-43's point. The one gap left, "stopping" missing from the canvas's order, is P3 and fits R-F-17's fix.

- id: R-F-47
  verdict: CONFIRMED
  severity: P3 (was P2): MSG-7 :310 already makes every `/send` the owner's ("as 'you'"). Its sender, reply path (MSG-5 :307, one transcript line per HOST-11 :143) and wake are defined; there is no wake, since MSG-8 :311 wakes Claude only for a `send`-tool brief that asked for a reply. The owner added the kind only for ARM-2's check (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\settled.md:30).
  evidence: HOST-9 :135 ("A message without one is the owner's own") implies that a message with a kind is not the owner's. ARM-4 :382 and MSG-1 :286 say only the Monarch assigns work. M3-AC5 :616.
  reason: Two sentences suggest that a `/send` with a kind becomes the Monarch's brief, against MSG-7 and the owner's reason for the kind, so this is wording to fix, not a choice to make.
  fix:
    - HOST-9 :135: "With or without a kind, a `/send` message is the owner's own (MSG-7); a kind only adds ARM-2's check."
    - ARM-4 :382: "Only the Monarch plans and assigns work; the owner may also send work directly (MSG-7). Soldiers answer, ask and report."

- id: R-F-49
  verdict: CONFIRMED
  severity: P3
  evidence: §3 :78 says "one per CLI", against §2 :60 and CH-2 :222 (one process per soldier). §2 :58 uses "CLI" for the vendor's program. §3 :84 says the tool is "added to each soldier", against PO-4 :182 (agy soldiers get no `send`).
  reason: The diagram reads as one channel per vendor, and §3 promises agy a tool that PO-4 withholds; PO-1, CH-2 and PO-4 fix the actual behavior, so this is editorial.
  fix: as proposed, re-aligning the diagram's columns for the longer label.

- id: R-F-9
  verdict: CONFIRMED
  severity: P3
  evidence: §2 :55-72 defines none of the six terms. They are defined only where used, or by reference:
    - snapshot: ARM-6 :385-386;
    - checkout guard and attribution card: ARM-6 :387-393, WSP-4 :401;
    - claims and the claim audit: only by reference, in WSP-2 :399 (v1 #16 and 2.0 WS-7); 2.0's glossary had "Claims" (C:\Users\johns\projects\AIConnections-v06\docs\legacy\spec\shadow-army-2.0.md:179);
    - worktree: WSP-1 :398;
    - owner: header :7, G1 :39.
  reason: Each term can be understood from its requirement, but the frame's glossary is where other units look, and "claim" has no definition in v2's own text.
  fix: add to §2:
    - "**Owner:** the person whose Claude Code session is the Monarch."
    - "**Worktree:** a soldier's own git worktree and branch, one per soldier per Claude session (WSP-1)."
    - "**Snapshot:** a throwaway copy of a base, whose writes are discarded and reported (ARM-6)."
    - "**Checkout guard:** the check that every change to the checkout during a soldier's turn is explained by Shadow Army's records, or else goes to the owner (ARM-6, WSP-4)."
    - "**Claims, claim audit:** the paths a writing turn may change, and the check, once the turn is over, of what it changed against them (WSP-2)."
    - "**Attribution card:** the guard's decision on changes no record explains: y says they are the owner's, n fails the turn (ARM-6)."
  note: writing the claim entry exposes a gap outside this finding: no v2 requirement says where a turn's claims come from. HOST-10 :136's `send` takes soldier, kind, brief, wantReply and wake, with no claims. 2.0 put `claims` on `wake` (shadow-army-2.0.md:636). The canvas writes claims into a brief's text ("Claim src/settings/*.", C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\V2-Messaging.dc.html:504). Yet ARM-5 :383, WSP-2 :399 and M6-AC2 :686 rely on them. This deserves its own finding for M3 or M6.
