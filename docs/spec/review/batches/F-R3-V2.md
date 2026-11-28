# Packet F-R3-V2: F, round 3, owner's advocate's findings 1 to 5 (on v0.15, v2@8e45853.md)

## R-F-147

- severity: P2
  type: contradiction
  location: §2 Attribution card (snapshot v2@8e45853.md:87), ARM-6 (:709), WSP-12's D-24 card (:798), HOST-5 (:141), Appendix D row 6 (:1764)
  claim: The same y/n keys mean opposite things for the owner's files: on the D-24 card n reverts the files, but on the attribution card n only fails the turn and leaves the soldier's unexplained changes in the checkout, and neither card says so.
  scenario: In M6, the owner answers a D-24 card where the text reads `y keep as yours, n revert`. Later, during Igris's turn, a checkout file `src/auth.ts` changes and an attribution card lists it. The owner presses n, reading it as "not mine, undo it". The turn fails as a read-violation, but `src/auth.ts` keeps the soldier's edit, because "the guard reverts nothing". The owner then commits it without knowing.
  evidence: :87 "y says they are the owner's, n fails the turn"; :709 "n fails the turn as a read-violation"; :798 "`y keep as yours, n revert` … y and n are the attribution card's keys (ARM-6)"; :1764 "detected, not prevented … the guard reverts nothing". ADR-0014 "State that reads one way".
  fix: ARM-6 and §2: "n fails the turn as a read-violation and leaves the files as they are (Appendix D, row 6); the card says so beside its keys, as in `n not mine · the files stay as they are`". decision: A wording only (as above); B n also restores each listed path from the turn's baseline (a new feature).

## R-F-148

- severity: P2
  type: contradiction
  location: ARM-7 trust card (:715-720), HOST-14 (:187), HOST-2 use (:113), VIS-2 (:843-858), M1-AC13 (:1080)
  claim: The trust card waits on the owner but is outside the one list of decisions, has no state, strip word or toast, and is shown again as a dialog at every "use", and from M3 every one of Claude's `send` calls is a use.
  scenario: The owner opens a repo whose `shadow.config.json` changed and answers `Not now` so they can read it first. The Monarch then sends seven briefs. Each `send` is a use, so Claude Code's question dialog pops up seven times in a row. The owner dismisses them and leaves. On return, `/decisions` and the "needs you" tab are empty, the strip shows the seven soldiers as `·` not running, and the away digest says nothing. The army waits on the owner with no sign of it in the list ADR-0014 promises.
  evidence: :187 lists approval requests, attribution and D-24 cards, handoffs, held queues, logins, channels down and messages not delivered, and no trust card. :720 "`Not now` … accepts nothing and starts nothing, and the next use shows the card again". :113 "From M3, Claude's `send` tool is a use too". ADR-0014: "Everything that waits on the owner is in one list"; its Context: "Approvals, handoffs, logins and failures each ask for attention in their own place". ADR-0015: the quiet default.
  fix: HOST-14 adds "the folder's trust card (ARM-7)" to the list, and VIS-2 gives a soldier that waits on it the `waiting` word. decision: what shows the dialog again after `Not now`: A only the owner's own `/army`, `/send`, r or the list's row, while Claude's `send` returns `waits · trust card` with no dialog; B every use (as written).

## R-F-149

- severity: P2
  type: gap
  location: §5.1 C (:905), CH-8 (:530), M2-AC3 (:1139)
  claim: A newer CLI "connects with a warning card" until its fixture is recorded again, but a fixture is recorded again only when the adapter changes. So with vendors' release pace, the warning shows on almost every connect, forever, and nothing says where it shows, how often, or how it goes away.
  scenario: The fixtures were recorded with claude 2.1.293, and claude updates itself to 2.1.294, which changes nothing the adapter reads. Every morning, each of the owner's claude soldiers connects "with a warning card", and so do codex and grok after their own updates. No adapter changes, so no fixture is re-recorded, and the warning never clears. It is in neither HOST-14's list nor HOST-8's toasts, has no key, and is not on the canvas.
  evidence: :905 "is recorded again when its adapter is changed for a newer version of its CLI. Until then, a newer CLI connects with CH-8's warning"; :530 "A newer version connects, with a warning card". CH-2 names five claude versions (2.1.259, .277, .281, .293) at :477-481. ADR-0015: the quiet default.
  fix: decision: A one line in the soldier's log and one transcript line per CLI per new version, shown again only for a later version, and listed in `/army`; B as written, with HOST-14 or HOST-8 naming where the card shows and how it is dismissed.

## R-F-150

- severity: P2
  type: gap
  location: ARM-7 (:713, :723), M1-AC13 (:1086), Appendix D actors (:1748, :1750)
  claim: A folder with no policy files runs the shipped `shadow.config.json` with no card, and the spec never says what autonomy that copy gives, so the owner can't see that a new repo starts soldiers at `full`.
  scenario: The shipped copy, the repository's root `shadow.config.json` (which v1's `src/core/config.ts:41-45` loads as "the one shipped with the package"), sets `codex-sol`, `grok` and `agy` to `full` and both claude soldiers to `auto`. The owner clones a third-party repo with no Shadow Army files, and the Monarch sends a research brief to grok. grok starts at `full`, with "the owner's OS rights" (Appendix D :1748), in a repository whose content "may prompt-inject a soldier". No card and no row ever shows a level, while the same file inside the folder would get a card listing "each soldier it sets above supervised" (:717).
  evidence: :713 "A shipped copy needs no trust"; :723 "the shipped copy applies with its own autonomy levels"; :1086 "uses the shipped copies and shows no card"; `C:\Users\johns\projects\AIConnections-review\shadow.config.json` lines 4-8. Also NEEDS-PROBE: CLAUDE.md records that a Claude Code session's classifier refuses to launch `full` soldiers; whether it also blocks the Monarch's `send` to a `full` soldier is unverified.
  fix: ARM-7 names the shipped copy's levels. decision: A the shipped copy sets every soldier to `supervised`; B keep its levels, and the first start of a soldier above `supervised` from the shipped copy in a folder shows one notice row naming it, its `cli`, `model` and autonomy.

## R-F-151

- severity: P2
  type: ambiguity
  location: §2 Glossary (:56-88), §3 (:98-103); the 54 "Claude's transcript gets one line" clauses (e.g. WSP-10 :767, WSP-11 :775, PO-5 :247, MSG-7 :613); Appendix C H52 (:1633)
  claim: The spec never defines whether "a line in Claude's transcript" enters Claude's conversation (paid, read and acted on by the Monarch) or is a notice row only the owner sees, and the two readings give different cost, noise and trust.
  scenario: The owner's Claude Code makes subagent worktrees (`isolation: worktree`) all day, and seven soldiers each report read-violations. Reading A: each `a working tree was added at .claude/worktrees/…` line and each snapshot line with soldier-chosen file paths (:775) enters the Monarch's context. The owner pays for it on every later turn, the Monarch may act on it, and the paths are not framed as quoted words (MSG-1 frames only soldiers' words). Reading B: they are display-only, and then MSG-7's "saying that soldier's context changed" never reaches Claude, though its purpose is to tell Claude.
  evidence: HOST-15 :198 "transcript notice rows, which are not added to Claude's conversation"; H52 :1633 "Only cards and one-line rows enter Claude's conversation (MSG-5, HOST-11)"; HOST-11 :182 names only soldier-to-soldier and owner messages as one-line rows; the 54 occurrences (grep count).
  fix: §2 adds: "**Transcript line:** a notice row in the owner's transcript, not added to Claude's conversation and waking nobody, unless its requirement says it goes to Claude." MSG-7, MSG-5 and HOST-11's rows say "Claude's conversation"; each other clause keeps "Claude's transcript".
