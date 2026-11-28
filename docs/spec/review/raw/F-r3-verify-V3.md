# F, round 3: verifier F-R3-V3 (spec-verifier, Opus, high), R-F-152 to R-F-156

- id: R-F-152
  verdict: CONFIRMED (in part)
  severity: P3 (was P2): when the owner comes back, "held" still shows in the strip at every width (HOST-6 :147), and both "held" and messages not delivered are in the needs-you list and its count (HOST-14 :187, HOST-7). Only the digest's summary is incomplete.
  evidence: v2@8e45853 HOST-15 :195 lists answered, interrupted, waiting on you, handoff ready, cold, down, log in needed and error, with no "queue held" (VIS-2 :850) and no "not delivered" (MSG-4 :598). ADR-0015:21 says the digest covers "what waits on the owner", and HOST-14 :187 counts held queues and undelivered messages among those. Unchanged in v2@1ba37b5 :195. The VIS-2 half of the finding is REFUTED: while the D-24 card is open, "the soldier's queue is held until the owner answers" (WSP-12 :798), so that soldier shows "queue held / held" (:850). It is never left without a word.
  reason: HOST-15's own word list leaves out two of the things HOST-14 says wait on the owner, so the digest falls short of what ADR-0015 promises. The claimed missing state word for the D-24 card is already covered by "held".
  fix: in HOST-15 :195, "… waiting on you, handoff ready, queue held with its reason (HOST-14), cold …, down, log in needed or error, and each message not delivered (MSG-4);". No change to VIS-2.

- id: R-F-153
  verdict: DECISION
  severity: P2
  evidence: v2@8e45853 :1779 "The ones marked (for the owner to accept) await that acceptance". Residual 7 is at :1787, residual 8 at :1788 and residual 12 at :1797. All three are unchanged in v2@1ba37b5 (:1780, :1789, :1798). The D-4 card (decisions.md :174) promised "you accept, in writing, the residual risks it lists". D-22's answer (:457) chose A over C ("accept it as residual 8"), and the sentence that residual 8 "keeps the hooks and the env block" is the orchestrator's reading, not something the owner accepted. No D- record names residual 7 or 12. NEXT-SESSION.md and STATE.md plan no card for them. No AC waits on the acceptance.
  reason: The spec itself says these three risks are not yet accepted, and only the owner can accept a remaining risk. Codex is building M1, and M1 builds WSP-10, the control that residual 7 leaves open.
  options: A, one card asking the owner to accept residuals 7, 8 and 12 as written; B, a card per residual offering accept or "add a control" (for example for 12, keep the start state's hash outside the soldier's reach); C, as the finding proposes: one card, answered before M1-AC10 (residual 7), M1-AC13 (8) and M6-AC14 (12) are claimed, and until then each of those ACs' PRs states that its residual is not yet accepted.
  big or technical: big (PLAYBOOK §14 :339, "Security posture: … accepting a remaining risk").

- id: R-F-154
  verdict: CONFIRMED
  severity: P3 (was P2): VIS-1 :838 already makes the spec win and the canvas get redrawn, and §5.1 S :950 already lets a snapshot follow the spec where the two differ. The gaps are a stale header list and a rule that names only a "table". Nothing is built wrong.
  evidence: v2@8e45853 header :11 (unchanged in v2@1ba37b5 :11) lists only v0.7's three differences. Grepping each file finds no "trust", "read-only", "attribution" or "keep as yours" in V2-Steering, V2-Pane, V2-Screens or V2-Host (C:/Users/johns/projects/AIConnections/.shadow/v2-tools/canvas/). V2-Steering.dc.html:150 still says "the guard's questions about changes during an agy turn". §5.1 S :950 says a snapshot names "the canvas frame it follows, or the spec's table where the two differ", but the trust card (ARM-7), the D-24 card (WSP-12 :798) and the read-only line (CH-6) have no table, only example text.
  reason: The header reads as the full list of differences but misses every surface added since v0.10, and a snapshot of a card with no frame and no table has nothing it is allowed to cite.
  fix: header :11, after the v0.7 list: "The canvas also has no frame for what came after it: the trust card (ARM-7), the attribution card for every soldier (ARM-6), the card for an edit before a turn a CLI starts by itself (WSP-12), the read-only line on an approval card (CH-6), and held after a mode or a revert (CH-11, WSP-12)." §5.1 S :950: "or the spec's table, or the requirement's own text, where the two differ (VIS-1)". The finding's "redraw before M5" sentence is not needed, since VIS-1 already says the canvas is redrawn.

- id: R-F-155
  verdict: CONFIRMED
  severity: P3 (was P2): each soldier's row already shows "—" just above the total (SES-7 :674, M4-AC5), so the gap is visible on screen. This is a labelling fix in one table and the digest's cost line.
  evidence: v2@8e45853 SES-7 :674 "cost where the CLI reports one ("—" otherwise). A total row follows" (unchanged in v2@1ba37b5 :675). CH-2 :494 "The cost is claude's own estimate". §5.1 :959: codex and agy report no cost at all. HOST-15 :196 gives "the cost the CLIs reported", with the same problem. Claude Code's documentation (https://code.claude.com/docs/en/costs) says the figure is computed locally at list price, "The figure is an estimate", and for Pro/Max subscribers "the session cost figure isn't relevant for billing purposes".
  reason: In any mixed army the total row and the digest's cost add an estimate to reported figures while silently leaving out codex and agy, and nothing on screen marks either. That works against G5's "in the owner's hands".
  fix: SES-7: "… cost where the CLI reports one ("—" otherwise), with claude's marked `est.` (CH-2). A total row follows; its cost is the sum of the costs shown, marked `est.` when one is, and followed by `+ N not reported` while any soldier shows "—"." HOST-15 :196 reads "the cost the CLIs reported in that time, marked as SES-7 marks it".

- id: R-F-156
  verdict: DECISION
  severity: P2
  evidence: v2@8e45853 SES-1 :637 "one open session per Claude Code process". PO-7 :251 closes every soldier session when the process ends. Appendix C H38 :1442 leaves the question open ("start fresh … or each resumes its last session by id (CH-9)"), unchanged in v2@1ba37b5 :1443. D-11 (decisions.md :309, :317) deferred it: "What else a resumed conversation gets stays with H38". PLAYBOOK §14 :351 already lists H38 as "Big … waiting already", but no D- record or card exists. settled.md :31 says Appendix C items are not requirements until a review moves them. The ledger has no other H38 finding (R-M1-34 is about crash restarts within one process).
  reason: The spec is consistent as written (soldiers start fresh), but whether a new process resumes them is an open product choice that affects what the owner keeps and pays. PLAYBOOK §14 already reserves it for the owner, and nothing has ever asked them.
  options: A, soldiers start fresh in each new Claude Code process (as written; state it in SES-1 and close H38); B, when the owner resumes a Claude conversation in a new process, each soldier resumes its last session by id (CH-9), where its worktree or snapshot still exists. B also needs WSP-1 (one worktree per soldier per process) to reuse the earlier worktree, because claude keys a resumable session to its working folder. C, B only on the owner's y on a card listing the soldiers that can be resumed.
  big or technical: big (PLAYBOOK §14 :339 and :351 name H38 as big: it changes what the owner keeps, loses and pays).
