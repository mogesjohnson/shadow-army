D-5 drafter (option B), against v0.10 (v2@e7c33b4.md), 2026-10-20

D-5 (option B) drafted as OLD/NEW blocks against v2@e7c33b4.md

```
D-5: the glossary's Queue entry states the queue's cap.
<<< OLD
- **Queue:** the messages waiting for a soldier's next turn. A **held** queue waits for the owner instead of going by itself.
=== NEW
- **Queue:** the messages waiting for a soldier's next turn, at most nine (MSG-3). A **held** queue waits for the owner instead of going by itself.
>>> END

D-5: the glossary's Report entry states the report's cap.
<<< OLD
- **Report:** a soldier's full reply, kept on disk.
=== NEW
- **Report:** a soldier's full reply, kept on disk, up to 2 MiB (PO-6).
>>> END

D-5: HOST-10 says what a refused brief returns, and why Claude's sends have no rate cap.
<<< OLD
  - It returns at once, with the brief's id and its state: delivered, or queued and what it waits for.
=== NEW
  - It returns at once, with the brief's id and its state: delivered, or queued and what it waits for. A brief refused before it is sent (ARM-2; MSG-1's size; MSG-3's queue) returns the refusal and its reason instead, with no id.
  - Claude's briefs have no rate cap: each waits in a queue of at most nine (MSG-3), and the owner sees each one in Claude's transcript (HOST-11). A soldier's sends have a rate cap (MSG-6).
>>> END

D-5: HOST-11 adds a row for a refused brief, and marks a cut report on the card.
<<< OLD
  - one row per brief, with its delivery state;
  - a summary card of at most five lines, plus the report's path, or `report not saved · <reason>` when the report can't be written;
=== NEW
  - one row per brief, with its delivery state, and one per brief refused before it was sent, with the reason (MSG-3);
  - a summary card of at most five lines, plus the report's path, with `cut at 2 MiB` when the report was cut (PO-6), or `report not saved · <reason>` when the report can't be written;
>>> END

D-5: PO-5 states the disk risk of logs kept until the owner deletes them; rotation is H62, after v2.0.
<<< OLD
Records are not logs: what a record that can't be written does is in MSG-4 (→M3).
=== NEW
Records are not logs: what a record that can't be written does is in MSG-4 (→M3).
  - **Disk.** Logs are kept until the owner deletes them (WSP-8). v2.0 sets no limit on their size and doesn't rotate them; that is H62, after v2.0 (Appendix C). A log holds every message, thinking block, tool call and tool result whole, so it grows with every turn, and together with the records and reports (PO-6, →M3) it can fill the disk. That is a stated residual risk. A full disk stops new messages from going in instead of losing them: a message whose turn's opening line can't be written isn't sent (above), and a message whose record can't be written stays queued (MSG-4, →M3), each with its reason. The owner frees space by deleting old logs under `.shadow/v2/logs/`. Deleting the logs of a post office that didn't close its channels, before the next one has started, loses what PO-1 would finish from them.
>>> END

D-5: PO-6 caps each report, saying what happens at the cap.
<<< OLD
Full reports go under `.shadow/v2/reports/`.
=== NEW
Full reports go under `.shadow/v2/reports/`.
  - **At most 2 MiB a report:** 2,097,152 bytes of UTF-8. A longer reply's report keeps its first 2 MiB, cut between two characters, and ends with one line saying that it was cut, how many bytes followed, and that the soldier's session log holds the whole reply (PO-5), as in `report cut at 2 MiB · 1,180,334 bytes more · whole in the soldier's log`. The summary card says so beside the report's path (HOST-11). The summary is still taken from the whole reply (MSG-5).
>>> END

D-5: MSG-1 caps a message's size.
<<< OLD
Only the Monarch's briefs assign work (ARM-4).
=== NEW
Only the Monarch's briefs assign work (ARM-4).
  - **At most 24,000 characters.** A message's text, whether a brief, a soldier's `send` or the owner's own, has at most 24,000 characters, counted as Unicode code points, which is v1's limit for a whole brief. A longer one is refused before anything is queued (MSG-3), with its length and the cap, as in `the brief is 31,240 characters; the limit is 24,000`. A change to a queued message's text (MSG-10) past the cap is refused, and the old text stays queued.
>>> END

D-5: MSG-3 caps the queue and says how a refused send is handled, who sees it and what the owner can do.
<<< OLD
  - Nothing in a queue is dropped silently.
=== NEW
  - Nothing in a queue is dropped silently.
  - **At most nine waiting.** A soldier's queue holds at most nine messages, held or not, so the queue view's keys 1 to 9 reach each one (HOST-5, →M5). A send that would make a tenth is refused, and so is sending again a message not delivered (MSG-4). What is already queued stays as it was. A summary going back to a soldier (MSG-5) is never refused, and doesn't count. The owner makes room by cancelling a queued message (MSG-10), and each message the soldier takes makes room too.
  - **A refused send** is not a message: it has no id, no record and no turn, and nothing is queued or sent. MSG-1's size, this cap and MSG-6's rate refuse a send as ARM-2's hard rules do. The refusal goes back to the sender at once, with its reason and the cap, as in `Iron's queue is full (9 waiting) · cancel one to make room`:
    - Claude's `send` returns it (HOST-10), and the brief's row says so (HOST-11);
    - a soldier's `send` returns it as the tool's result, which the soldier's pane shows (PO-4);
    - the owner's own message (MSG-7) is refused where it was typed, and the pane's field keeps its text.

    The post office's log keeps each refusal with its sender, recipient, size and reason (PO-5). MSG-8 doesn't wait for a refused brief. These caps are fixed in v2.0; no setting changes them.
>>> END

D-5: MSG-5's report is whole only up to PO-6's cap.
<<< OLD
A longer line or reply is cut with …, and the whole reply is saved as the report.
=== NEW
A longer line or reply is cut with …, and the whole reply is saved as the report, up to PO-6's cap of 2 MiB.
>>> END

D-5: MSG-6 caps a soldier's send rate, and says who sees a runaway soldier and what the owner can do.
<<< OLD
- **MSG-6** (M3; I) **Soldier to soldier.** Soldiers message each other through `send` (PO-4). Both panes show the message in full; Claude's transcript gets one line. A soldier MUST NOT assign work to another; only the Monarch briefs.
=== NEW
- **MSG-6** (M3; I) **Soldier to soldier.** Soldiers message each other through `send` (PO-4). Both panes show the message in full; Claude's transcript gets one line. A soldier MUST NOT assign work to another; only the Monarch briefs.
  - **At most five sends in 10 minutes.** The sends the post office accepts from a soldier, queued or delivered, count against that soldier across its sessions, on the post office's monotonic clock (PO-7). A sixth within any 10 minutes is refused as MSG-3 says, with when the next can go, as in `Beru has sent 5 messages in 10 min · next at 14:32`. A refused call doesn't count, and a summary going back to the sender (MSG-5) is not a send.
  - Each accepted send is a paid turn for its recipient (G5), so the owner is told of a soldier at the cap. Its pane shows each refused call, and Claude's transcript gets one line for each run of refusals, as in `Shadow Army: Beru's sends refused · 5 in 10 min · s stops its turn`. The next such line comes only after one of its sends has been accepted again. The owner can stop its turn (MSG-9) or start it fresh (SES-5, →M4); otherwise the cap lifts by itself as the 10 minutes pass.
>>> END

D-5: a new M3 AC tests the four caps.
<<< OLD
- **M3-AC13** From the owner's recording of a real claude soldier session with the mod installed (VER-4), the session lists no Monarch `send` tool, and no post office starts (HOST-10, HOST-2).
=== NEW
- **M3-AC13** From the owner's recording of a real claude soldier session with the mod installed (VER-4), the session lists no Monarch `send` tool, and no post office starts (HOST-10, HOST-2).
- **NEW-D5-AC1** Limits on sends and reports, against a fake soldier on a fake monotonic clock (MSG-1, MSG-3, MSG-5, MSG-6, HOST-10, HOST-11, PO-6):
  - a brief, a soldier's message and the owner's message of 24,000 characters each go. Each of 24,001 characters is refused with its length and the cap, gets no id or record, and leaves the queue as it was: Claude's `send` returns the refusal with no id and the brief's row says why, the soldier's `send` returns it as its result, and the owner's message is refused with the same reason. The post office's log has each refusal. Changing a queued message's text to 24,001 characters is refused, and the old text stays;
  - while the fake is mid-turn, nine briefs queue. A tenth brief, a soldier's message, the owner's message and sending again a message not delivered are each refused with the queue's cap, and the nine go in order. After one is cancelled, the next send is queued. A summary going back to a soldier whose queue holds nine is not refused;
  - a soldier's five sends within 10 minutes are accepted, and a sixth is refused with when the next can go. Claude's transcript gets one line for that run of refusals, however many follow, and the refused calls don't count. 10 minutes after the first send, a send is accepted again;
  - a reply of 3 MiB leaves a report of 2 MiB that ends between two characters, followed by the line saying it was cut. The card says `cut at 2 MiB` beside the path, and the soldier's log holds the whole reply.
>>> END

D-5: Appendix C's H62 row names the disk risk PO-5 now states (the verdict and Could-add are unchanged).
<<< OLD
PO-5 sets no size limit on the post office's own logs.
=== NEW
PO-5 sets no size limit on the post office's own logs, keeps them until the owner deletes them, and states the disk risk.
>>> END

D-5: the after-v2.0 list names rotation beside the limit. Its IDs are unchanged, so check-appendix-c.mjs still matches.
<<< OLD
H62 (limits on the post office's logs)
=== NEW
H62 (a size limit and rotation for the post office's logs)
>>> END
```

**How each value was chosen**
- **Message, 24,000 characters.**
  - It is v1's limit for a whole brief (`src/core/brief.ts:8`, `MAX_PROMPT_CHARS`, refused with the length and the limit), which v1's briefs lived within.
  - It matches G3 ("Short messages") and MSG-1 (files travel through branches).
  - It is far below the 1,048,576-character block on a mod child's output (evidence/README.md:15; PO-7 line 240), so a message shown in full in both panes never comes near it.
  - v1's original reason, agy's command line, is gone: v2's agy reads stream-json on stdin (line 318). So the value rests on v1's precedent and G3, not on a vendor limit.
- **Queue, nine per soldier.**
  - HOST-5 (line 130) picks queued messages with keys 1 to 9 only. Nine keeps every queued message within the owner's reach (MSG-10, G4).
  - v1 plans have at most 6 tasks for the whole army (`src/monarch/plan.ts:5`).
  - 2.0's UPD-4 cap of 100 (legacy line 630) dropped the oldest items, which MSG-3 forbids, so it is not carried.
- **Rate, five sends per soldier in any 10 minutes.**
  - Soldiers ask, answer and report, and never assign work (ARM-4, MSG-6). A sustained rate above one send every two minutes is a loop.
  - Each accepted send is a paid turn for its recipient (G5). The cap bounds each soldier to 30 recipient turns an hour.
  - The precedent is 2.0's check-in cap of at most one per 5 minutes (legacy line 761).
- **Report, 2 MiB.**
  - Anthropic and OpenAI document at most 128K output tokens per response. Anthropic gives about 2.5M characters per 1M tokens, so that is about 320k characters, or at most 1.3 MB even at 4 bytes a character.
  - So only a reply joined from many responses, or a CLI fault, reaches the cap.
  - Codex's M1 draft already fails a claude frame over 16 MiB (`AIConnections-m1/src/v2/claude.ts:13`), so 2 MiB sits well inside what the channel reads.

**Could not place, or for the orchestrator**
- **No rate cap on Claude's or the owner's sends.** This is my choice: the queue cap bounds them, and the owner sees both. If the owner reads "send rate" as covering Claude too, that is a decision-needed. The way to do it would be a cap per sender in HOST-10.
- **The caps are fixed, with no setting.** I followed the lease's precedent (PO-7, "no setting changes them"). A setting would be a new feature.
- **D-4's threat-model appendix** should list two residual risks:
  - the disk risk this draft adds to PO-5;
  - a soldier's loop bounded only by MSG-6's rate.

  That is D-4's text, not mine.
- **No M1 AC was added for PO-5's disk statement.** It is a stated risk, and its behaviour is already tested by M1-AC4's log-write failure.

**Findings against v0.10**
```
- severity: P2
  type: ambiguity
  location: MSG-5 (docs/spec/v2.md:389)
  claim: "The summary goes back to whoever sent the message" does not say how a summary reaches a soldier sender: as a new turn in its session (queued, held, paid), or only shown in its pane.
  scenario: Beru sends to Iron; Iron answers. Reading A queues the summary as a turn in Beru, so each exchange costs two turns and a reply can re-trigger a send (a loop, G5). Reading B shows it in Beru's pane only, and Beru never learns the answer.
  evidence: MSG-5 line 389; MSG-6 line 391; PO-4 line 219 (`send(to, text)` only); D-5's draft has to state "a summary going back to a soldier is never refused, and doesn't count" without knowing whether it uses the queue.
  fix: decision: A, a summary to a soldier is a turn in its session, queued like a message, never refused by MSG-3's cap and not counted against it; B, it is shown in the sender's pane and returned as the result of its next `send` call, never as a turn.
- severity: P2
  type: gap
  location: HOST-10 (docs/spec/v2.md:168), ARM-2 (docs/spec/v2.md:462)
  claim: HOST-10's tool always returns an id and a state, but ARM-2 refuses briefs before they are sent; nothing says what the tool returns for a refused brief, whether it has an id, or whether it is recorded.
  scenario: Claude sends a review brief to grok. Reading A returns an id and the state "refused" (a seventh state, against MSG-4's six). Reading B returns an error with no id. The tests and the transcript row differ.
  evidence: line 168 "It returns at once, with the brief's id and its state: delivered, or queued"; line 462 "refused before it is sent"; M3-AC5 line 798.
  fix: D-5's HOST-10 and MSG-3 blocks above: a refused brief returns the refusal and its reason, with no id, and is not a message.
- severity: P2
  type: gap
  location: MSG-3 (docs/spec/v2.md:372), HOST-5 (docs/spec/v2.md:130)
  claim: MSG-3's queue is unbounded, but the queue view picks messages with keys 1 to 9 only, so a tenth queued message can't be cancelled or changed from the pane (MSG-10, G4).
  scenario: Claude queues 12 briefs for Iron mid-turn; the owner opens q and can't pick brief 10 to 12.
  evidence: line 130 "q opens the queue, where 1 to 9 pick a message"; line 405.
  fix: D-5's MSG-3 block above (at most nine waiting).
```

**Sources**
- docs/spec/review/decisions.md:175-189 (D-5)
- ledger.md:39 (R-F-7) and :64 (R-M1-52)
- .shadow/v2-tools/review/settled.md
- the snapshot v2@e7c33b4.md:
  - §2, lines 65 and 70
  - HOST-5, line 130; HOST-10 and HOST-11, lines 166-174
  - PO-5 and PO-6, lines 225-229; PO-7, line 240
  - MSG-1 to MSG-10, lines 367-407
  - ARM-2, line 462; WSP-8, line 493
  - M3, lines 784-818; Appendix B, lines 939-949; Appendix C, lines 970-988 and 1132
- docs/legacy/spec/shadow-army-2.0.md: UPD-2 (615), UPD-4 (630), the check-in rate (761), WAKE-10 (762)
- v1 code:
  - src/core/brief.ts:5-8 and :52-53
  - src/monarch/plan.ts:5
  - src/adapters/exec.ts:64
- Codex's M1 draft: AIConnections-m1/src/v2/claude.ts:13 and :132
- docs/spec/review/evidence/README.md:15
- docs/spec/review/tools/pairs.mjs and check-appendix-c.mjs
- vendor documents:
  - https://platform.claude.com/docs/en/about-claude/models/overview (Max output 128K tokens; about 2.5M characters per 1M tokens)
  - https://developers.openai.com/api/docs/models/gpt-5-codex and https://developers.openai.com/api/docs/models/gpt-5.1-codex (128,000 max output tokens)
  - grok's and agy's model output limits were not checked, and no spec text relies on them.
