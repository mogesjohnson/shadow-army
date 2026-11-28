# Packet F-R3-V3: F, round 3, owner's advocate's findings 6 to 10 (on v0.15, v2@8e45853.md)

## R-F-152

- severity: P2
  type: gap
  location: HOST-15 (:195), ADR-0015 "While you were away"
  claim: The away digest's rows leave out "held" and "messages not delivered", which wait on the owner, so the digest ADR-0015 says covers "what waits on the owner" can be silent about them.
  scenario: While the owner is away, Kaisel's read-only revert fails on a file another process holds open, so its queue is held (WSP-12, HOST-14), and a brief to Tusk ends not delivered. The army settles, and after 10 minutes the digest lists the soldiers that answered and the ones that went cold. It has no row for Kaisel held or for Tusk's undelivered brief, because neither is among HOST-15's words. The D-24 card is also outside VIS-2's "waiting on you" (:848), so a soldier waiting on it has no word in the list either.
  evidence: :195 "answered …, interrupted …, waiting on you, handoff ready, cold …, down, log in needed or error"; HOST-6 :147 strip words include "held"; HOST-14 :187; ADR-0015: "one digest says what changed: answers with their facts, what waits on the owner, what went cold, and the cost reported".
  fix: HOST-15's row list reads "…, every state that waits on the owner (HOST-14), held with its reason included, and each message not delivered"; VIS-2's "waiting on you" adds "or the card for an edit before a self-started turn (WSP-12)".

## R-F-153

- severity: P2
  type: decision-needed
  location: Appendix D residuals 7, 8, 12 (:1779, :1787, :1788, :1797)
  claim: Three residual risks are marked "for the owner to accept", but no decision record asks for that acceptance, and no milestone waits for it, even though M1 builds WSP-10, the control residual 7 leaves open.
  scenario: Codex closes M1-AC10 with residual 7 (a hook or filter added during the check window runs once) still "awaiting acceptance". The owner never sees a card for 7 or 12, and residual 8 still says "for the owner to accept" though D-22 answered only the `.mcp.json` part. The risks become accepted by default, which takes the decision away from the owner.
  evidence: :1779 "The ones marked (for the owner to accept) await that acceptance"; decisions.md D-1 to D-26: no record names residual 7 or 12, and D-22 (:457) mentions residual 8 but records no acceptance; settled.md: big questions go to the owner as decision cards.
  fix: decision: one card for residuals 7, 8 and 12 (accept, or ask for a control), answered before M1-AC10 (7), M1-AC13 (8) and M6-AC14 (12) are claimed. Until then, each of those ACs' PRs says the residual is not yet accepted.

## R-F-154

- severity: P2
  type: readiness
  location: header Design (:11), VIS-1 (:838), §5.1 S (:950)
  claim: The header tells the owner the canvas differs from the spec only in v0.7's three changes, but every owner-facing card added since v0.10 is missing from the canvas, so the owner can't see those cards before they are built, and S evidence has no frame to follow.
  scenario: The owner checks the canvas to see what M1 will show. It has no trust card (M1, ARM-7 :717-718), no read-only line on approval cards (CH-6 :514), no D-24 card (:798), no "held" after a failed mode or revert, and its decisions list (V2-Steering.dc.html:150) still says the guard asks only "about changes during an agy turn". A reviewer told to confirm "the match" (:950) finds no frame and no spec table for these.
  evidence: :11 "version 21, drawn for v0.5 … v0.7 gives "down" one glyph, makes "held" a state of the queue, and puts "stopping" …"; per-file grep of V2-Host, V2-Pane, V2-Screens, V2-Steering and V2-Messaging finds no "trust", "read-only" or "attribution"; V2-Steering.dc.html:20 "spec v0.3".
  fix: the header lists every surface the canvas lacks or draws differently (the trust card, the D-24 card, the read-only line, held after a mode or revert, the attribution card for every soldier). VIS-1 adds: "Before M5's S evidence, the canvas is redrawn for them; until then, a snapshot of one follows its requirement's text and names it."

## R-F-155

- severity: P2
  type: ambiguity
  location: G5 (:44), SES-7 (:674), CH-2 (:494), non-goal (:54)
  claim: `/sessions` adds a total cost row over soldiers where claude's figure is claude's own estimate, and codex's and agy's are missing, and nothing marks either, so the owner reads a partial estimate as their spend.
  scenario: In one day, Bellion (codex) uses 2M tokens and shows "—", Iron (claude on a subscription) shows claude's estimated $3.40, and grok reports $0.60. The total row says $4.00. The owner takes that as the day's cost, though $3.40 is an estimate that isn't billed on a subscription and codex's use isn't counted at all. G5 promises cost "in the owner's hands".
  evidence: :674 "cost where the CLI reports one ("—" otherwise). A total row follows"; :494 "The cost is claude's own estimate"; §5.1 :958 calls it "counted as reported".
  fix: SES-7: "claude's cost shows as `est.`; the total row gives the sum of reported costs, then `+ N soldiers not reported`, and never one figure that hides either".

## R-F-156

- severity: P2
  type: decision-needed
  location: G2 (:41), SES-1 (:637), PO-7 (:251), Appendix C H38 (:1442)
  claim: G2's "one long-lived session" ends with every Claude Code process, so each restart (a quit, a crash, an auto-update) loses all seven soldiers' history, and the owner has never been asked whether the next process should resume them.
  scenario: The owner quits Claude Code in the evening with seven soldiers mid-plan. Next morning `claude --resume` brings back the Monarch's conversation, but every soldier starts a fresh session with no history (SES-1 "per Claude Code process"), though CH-9 can resume by id. The Monarch's briefs assume context the soldiers no longer have.
  evidence: :637 "one open session per Claude Code process"; :251 "closes every soldier session"; :1442 H38 "the soldiers start fresh … or each resumes its last session by id (CH-9)"; decisions.md D-11 (:309, :317) "what a resumed conversation gets stays with H38", with no D- record for it.
  fix: decision: A soldiers start fresh in a new process (as written; G2 says "for the life of the owner's Claude Code process"); B a resumed Claude conversation resumes each soldier's last session by id (CH-9), when its worktree or snapshot still exists.
