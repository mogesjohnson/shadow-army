F, round 3, owner's advocate (spec-reviewer, Opus, high), on v0.15 (v2@8e45853.md), session 8, 2026-10-23

- severity: P2
  type: contradiction
  location: §2 Attribution card (snapshot v2@8e45853.md:87), ARM-6 (:709), WSP-12's D-24 card (:798), HOST-5 (:141), Appendix D row 6 (:1764)
  claim: The same y/n keys mean opposite things for the owner's files: on the D-24 card n reverts the files, but on the attribution card n only fails the turn and leaves the soldier's unexplained changes in the checkout, and neither card says so.
  scenario: In M6, the owner answers a D-24 card where the text reads `y keep as yours, n revert`. Later, during Igris's turn, a checkout file `src/auth.ts` changes and an attribution card lists it. The owner presses n, reading it as "not mine, undo it". The turn fails as a read-violation, but `src/auth.ts` keeps the soldier's edit, because "the guard reverts nothing". The owner then commits it without knowing.
  evidence: :87 "y says they are the owner's, n fails the turn"; :709 "n fails the turn as a read-violation"; :798 "`y keep as yours, n revert` … y and n are the attribution card's keys (ARM-6)"; :1764 "detected, not prevented … the guard reverts nothing". ADR-0014 "State that reads one way".
  fix: ARM-6 and §2: "n fails the turn as a read-violation and leaves the files as they are (Appendix D, row 6); the card says so beside its keys, as in `n not mine · the files stay as they are`". decision: A wording only (as above); B n also restores each listed path from the turn's baseline (a new feature).

- severity: P2
  type: contradiction
  location: ARM-7 trust card (:715-720), HOST-14 (:187), HOST-2 use (:113), VIS-2 (:843-858), M1-AC13 (:1080)
  claim: The trust card waits on the owner but is outside the one list of decisions, has no state, strip word or toast, and is shown again as a dialog at every "use", and from M3 every one of Claude's `send` calls is a use.
  scenario: The owner opens a repo whose `shadow.config.json` changed and answers `Not now` so they can read it first. The Monarch then sends seven briefs. Each `send` is a use, so Claude Code's question dialog pops up seven times in a row. The owner dismisses them and leaves. On return, `/decisions` and the "needs you" tab are empty, the strip shows the seven soldiers as `·` not running, and the away digest says nothing. The army waits on the owner with no sign of it in the list ADR-0014 promises.
  evidence: :187 lists approval requests, attribution and D-24 cards, handoffs, held queues, logins, channels down and messages not delivered, and no trust card. :720 "`Not now` … accepts nothing and starts nothing, and the next use shows the card again". :113 "From M3, Claude's `send` tool is a use too". ADR-0014: "Everything that waits on the owner is in one list"; its Context: "Approvals, handoffs, logins and failures each ask for attention in their own place". ADR-0015: the quiet default.
  fix: HOST-14 adds "the folder's trust card (ARM-7)" to the list, and VIS-2 gives a soldier that waits on it the `waiting` word. decision: what shows the dialog again after `Not now`: A only the owner's own `/army`, `/send`, r or the list's row, while Claude's `send` returns `waits · trust card` with no dialog; B every use (as written).

- severity: P2
  type: gap
  location: §5.1 C (:905), CH-8 (:530), M2-AC3 (:1139)
  claim: A newer CLI "connects with a warning card" until its fixture is recorded again, but a fixture is recorded again only when the adapter changes. So with vendors' release pace, the warning shows on almost every connect, forever, and nothing says where it shows, how often, or how it goes away.
  scenario: The fixtures were recorded with claude 2.1.293, and claude updates itself to 2.1.294, which changes nothing the adapter reads. Every morning, each of the owner's claude soldiers connects "with a warning card", and so do codex and grok after their own updates. No adapter changes, so no fixture is re-recorded, and the warning never clears. It is in neither HOST-14's list nor HOST-8's toasts, has no key, and is not on the canvas.
  evidence: :905 "is recorded again when its adapter is changed for a newer version of its CLI. Until then, a newer CLI connects with CH-8's warning"; :530 "A newer version connects, with a warning card". CH-2 names five claude versions (2.1.259, .277, .281, .293) at :477-481. ADR-0015: the quiet default.
  fix: decision: A one line in the soldier's log and one transcript line per CLI per new version, shown again only for a later version, and listed in `/army`; B as written, with HOST-14 or HOST-8 naming where the card shows and how it is dismissed.

- severity: P2
  type: gap
  location: ARM-7 (:713, :723), M1-AC13 (:1086), Appendix D actors (:1748, :1750)
  claim: A folder with no policy files runs the shipped `shadow.config.json` with no card, and the spec never says what autonomy that copy gives, so the owner can't see that a new repo starts soldiers at `full`.
  scenario: The shipped copy, the repository's root `shadow.config.json` (which v1's `src/core/config.ts:41-45` loads as "the one shipped with the package"), sets `codex-sol`, `grok` and `agy` to `full` and both claude soldiers to `auto`. The owner clones a third-party repo with no Shadow Army files, and the Monarch sends a research brief to grok. grok starts at `full`, with "the owner's OS rights" (Appendix D :1748), in a repository whose content "may prompt-inject a soldier". No card and no row ever shows a level, while the same file inside the folder would get a card listing "each soldier it sets above supervised" (:717).
  evidence: :713 "A shipped copy needs no trust"; :723 "the shipped copy applies with its own autonomy levels"; :1086 "uses the shipped copies and shows no card"; `C:\Users\johns\projects\AIConnections-review\shadow.config.json` lines 4-8. Also NEEDS-PROBE: CLAUDE.md records that a Claude Code session's classifier refuses to launch `full` soldiers; whether it also blocks the Monarch's `send` to a `full` soldier is unverified.
  fix: ARM-7 names the shipped copy's levels. decision: A the shipped copy sets every soldier to `supervised`; B keep its levels, and the first start of a soldier above `supervised` from the shipped copy in a folder shows one notice row naming it, its `cli`, `model` and autonomy.

- severity: P2
  type: ambiguity
  location: §2 Glossary (:56-88), §3 (:98-103); the 54 "Claude's transcript gets one line" clauses (e.g. WSP-10 :767, WSP-11 :775, PO-5 :247, MSG-7 :613); Appendix C H52 (:1633)
  claim: The spec never defines whether "a line in Claude's transcript" enters Claude's conversation (paid, read and acted on by the Monarch) or is a notice row only the owner sees, and the two readings give different cost, noise and trust.
  scenario: The owner's Claude Code makes subagent worktrees (`isolation: worktree`) all day, and seven soldiers each report read-violations. Reading A: each `a working tree was added at .claude/worktrees/…` line and each snapshot line with soldier-chosen file paths (:775) enters the Monarch's context. The owner pays for it on every later turn, the Monarch may act on it, and the paths are not framed as quoted words (MSG-1 frames only soldiers' words). Reading B: they are display-only, and then MSG-7's "saying that soldier's context changed" never reaches Claude, though its purpose is to tell Claude.
  evidence: HOST-15 :198 "transcript notice rows, which are not added to Claude's conversation"; H52 :1633 "Only cards and one-line rows enter Claude's conversation (MSG-5, HOST-11)"; HOST-11 :182 names only soldier-to-soldier and owner messages as one-line rows; the 54 occurrences (grep count).
  fix: §2 adds: "**Transcript line:** a notice row in the owner's transcript, not added to Claude's conversation and waking nobody, unless its requirement says it goes to Claude." MSG-7, MSG-5 and HOST-11's rows say "Claude's conversation"; each other clause keeps "Claude's transcript".

- severity: P2
  type: gap
  location: HOST-15 (:195), ADR-0015 "While you were away"
  claim: The away digest's rows leave out "held" and "messages not delivered", which wait on the owner, so the digest ADR-0015 says covers "what waits on the owner" can be silent about them.
  scenario: While the owner is away, Kaisel's read-only revert fails on a file another process holds open, so its queue is held (WSP-12, HOST-14), and a brief to Tusk ends not delivered. The army settles, and after 10 minutes the digest lists the soldiers that answered and the ones that went cold. It has no row for Kaisel held or for Tusk's undelivered brief, because neither is among HOST-15's words. The D-24 card is also outside VIS-2's "waiting on you" (:848), so a soldier waiting on it has no word in the list either.
  evidence: :195 "answered …, interrupted …, waiting on you, handoff ready, cold …, down, log in needed or error"; HOST-6 :147 strip words include "held"; HOST-14 :187; ADR-0015: "one digest says what changed: answers with their facts, what waits on the owner, what went cold, and the cost reported".
  fix: HOST-15's row list reads "…, every state that waits on the owner (HOST-14), held with its reason included, and each message not delivered"; VIS-2's "waiting on you" adds "or the card for an edit before a self-started turn (WSP-12)".

- severity: P2
  type: decision-needed
  location: Appendix D residuals 7, 8, 12 (:1779, :1787, :1788, :1797)
  claim: Three residual risks are marked "for the owner to accept", but no decision record asks for that acceptance, and no milestone waits for it, even though M1 builds WSP-10, the control residual 7 leaves open.
  scenario: Codex closes M1-AC10 with residual 7 (a hook or filter added during the check window runs once) still "awaiting acceptance". The owner never sees a card for 7 or 12, and residual 8 still says "for the owner to accept" though D-22 answered only the `.mcp.json` part. The risks become accepted by default, which takes the decision away from the owner.
  evidence: :1779 "The ones marked (for the owner to accept) await that acceptance"; decisions.md D-1 to D-26: no record names residual 7 or 12, and D-22 (:457) mentions residual 8 but records no acceptance; settled.md: big questions go to the owner as decision cards.
  fix: decision: one card for residuals 7, 8 and 12 (accept, or ask for a control), answered before M1-AC10 (7), M1-AC13 (8) and M6-AC14 (12) are claimed. Until then, each of those ACs' PRs says the residual is not yet accepted.

- severity: P2
  type: readiness
  location: header Design (:11), VIS-1 (:838), §5.1 S (:950)
  claim: The header tells the owner the canvas differs from the spec only in v0.7's three changes, but every owner-facing card added since v0.10 is missing from the canvas, so the owner can't see those cards before they are built, and S evidence has no frame to follow.
  scenario: The owner checks the canvas to see what M1 will show. It has no trust card (M1, ARM-7 :717-718), no read-only line on approval cards (CH-6 :514), no D-24 card (:798), no "held" after a failed mode or revert, and its decisions list (V2-Steering.dc.html:150) still says the guard asks only "about changes during an agy turn". A reviewer told to confirm "the match" (:950) finds no frame and no spec table for these.
  evidence: :11 "version 21, drawn for v0.5 … v0.7 gives "down" one glyph, makes "held" a state of the queue, and puts "stopping" …"; per-file grep of V2-Host, V2-Pane, V2-Screens, V2-Steering and V2-Messaging finds no "trust", "read-only" or "attribution"; V2-Steering.dc.html:20 "spec v0.3".
  fix: the header lists every surface the canvas lacks or draws differently (the trust card, the D-24 card, the read-only line, held after a mode or revert, the attribution card for every soldier). VIS-1 adds: "Before M5's S evidence, the canvas is redrawn for them; until then, a snapshot of one follows its requirement's text and names it."

- severity: P2
  type: ambiguity
  location: G5 (:44), SES-7 (:674), CH-2 (:494), non-goal (:54)
  claim: `/sessions` adds a total cost row over soldiers where claude's figure is claude's own estimate, and codex's and agy's are missing, and nothing marks either, so the owner reads a partial estimate as their spend.
  scenario: In one day, Bellion (codex) uses 2M tokens and shows "—", Iron (claude on a subscription) shows claude's estimated $3.40, and grok reports $0.60. The total row says $4.00. The owner takes that as the day's cost, though $3.40 is an estimate that isn't billed on a subscription and codex's use isn't counted at all. G5 promises cost "in the owner's hands".
  evidence: :674 "cost where the CLI reports one ("—" otherwise). A total row follows"; :494 "The cost is claude's own estimate"; §5.1 :958 calls it "counted as reported".
  fix: SES-7: "claude's cost shows as `est.`; the total row gives the sum of reported costs, then `+ N soldiers not reported`, and never one figure that hides either".

- severity: P2
  type: decision-needed
  location: G2 (:41), SES-1 (:637), PO-7 (:251), Appendix C H38 (:1442)
  claim: G2's "one long-lived session" ends with every Claude Code process, so each restart (a quit, a crash, an auto-update) loses all seven soldiers' history, and the owner has never been asked whether the next process should resume them.
  scenario: The owner quits Claude Code in the evening with seven soldiers mid-plan. Next morning `claude --resume` brings back the Monarch's conversation, but every soldier starts a fresh session with no history (SES-1 "per Claude Code process"), though CH-9 can resume by id. The Monarch's briefs assume context the soldiers no longer have.
  evidence: :637 "one open session per Claude Code process"; :251 "closes every soldier session"; :1442 H38 "the soldiers start fresh … or each resumes its last session by id (CH-9)"; decisions.md D-11 (:309, :317) "what a resumed conversation gets stays with H38", with no D- record for it.
  fix: decision: A soldiers start fresh in a new process (as written; G2 says "for the life of the owner's Claude Code process"); B a resumed Claude conversation resumes each soldier's last session by id (CH-9), when its worktree or snapshot still exists.

No P0 or P1 found.

Coverage: header (:1-12); §0; §1 G1-G7 and non-goals; §2 glossary (all entries); §3; §5.1 U, C, I, X, F, S and L with the budget; §5.2 VER-1 to VER-10; §5.3 LEG-1; §6 M0, M1-AC1 to M1-AC22, M2-AC1 to M2-AC11, M3-AC1 to M3-AC14, M4-AC1 to M4-AC7, M5-AC1 to M5-AC10, M6-AC1 to M6-AC17; §7; §8 Q1-Q9; Appendix A; Appendix B rules 1-9; Appendix D (assets, actors, rows 1-17, residuals 1-13, the closing paragraph). Cited and read: HOST-1 to HOST-16, PO-1 to PO-7, CH-1, CH-2, CH-5 to CH-10, MSG-7, MSG-9, SES-1, SES-7, ARM-1 to ARM-8, WSP-1 to WSP-12, VIS-1 to VIS-6, SET-1, SET-2, OBS-1 to OBS-3. Against: ADR-0014, ADR-0015, settled.md, decisions.md D-7, D-11, D-22, D-24, D-25 and D-26 (not decided here), the ledger's R-F rows (R-F-4, R-F-46, R-F-69 and R-F-108 not raised again; R-F-119 and R-F-140 left to their rows), and the canvas pages V2-Host, V2-Pane, V2-Screens, V2-Steering and V2-Messaging (grepped file by file, since a folder-wide grep skips `.shadow/`). Files: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@8e45853.md, C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md, C:\Users\johns\projects\AIConnections-review\shadow.config.json, C:\Users\johns\projects\AIConnections-review\src\core\config.ts, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\V2-Steering.dc.html.
