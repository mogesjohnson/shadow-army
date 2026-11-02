# F, round 3: verifier F-R3-V2 (spec-verifier, Opus, high), R-F-147 to R-F-151

- id: R-F-147
  verdict: CONFIRMED
  severity: P2
  evidence: v2@8e45853 :709 (ARM-6: "n fails the turn as a read-violation", with no word on what happens to the files); :798 (WSP-12 D-24 card: "`y keep as yours, n revert` … y and n are the attribution card's keys (ARM-6)"); :87 glossary; :141 HOST-5; :1764 Appendix D row 6 ("the guard reverts nothing"); :768 WSP-10 has a third meaning for n ("n keeps it held"). Neither the spec nor decisions.md D-24 gives the attribution card's own key labels. Unchanged in v2@1ba37b5 (:87, :710, :799, :1765). settled.md :41 makes the guard detect and fail only, so a revert option would be a new capability. Not a duplicate: R-F-152 is about the digest and VIS-2.
  reason: The D-24 card teaches "n revert" and states that it shares the attribution card's keys, but on the attribution card n leaves the unexplained checkout change in place, and no card text says so; the scenario follows directly from the cited lines.
  fix: ARM-6, after "n fails the turn as a read-violation": "and leaves the files as they are: the guard reverts nothing (Appendix D, row 6). The card says so beside its keys, as in `y mine · n not mine, fail the turn · the files stay as they are`." §2 Attribution card: "…, n fails the turn and leaves the files as they are (ARM-6)." Option B (n restores the paths) is a new capability, and is not needed to fix the defect.

- id: R-F-148
  verdict: CONFIRMED (the list part); the rule for showing the dialog again is a DECISION
  severity: P2
  evidence: v2@8e45853 :187 HOST-14's list (no trust card); :848 VIS-2 "waiting on you" names only approval requests and attribution cards; :715-720 ARM-7 (soldiers wait on the card; "`Not now` … and the next use shows the card again"); :113 HOST-2 ("From M3, Claude's `send` tool is a use too"); :715 (a brief sent meanwhile waits in the queue). docs/adr/0014-the-owner-steers.md:24 ("Everything that waits on the owner is in one list"). Unchanged in v2@1ba37b5 (:113, :187, :717-721, :849). D-10 (decisions.md) settled the card itself, not how often it shows again.
  reason: The trust card holds every soldier's start until the owner answers, yet it is missing from the one list that accepted ADR-0014 requires, and as written, each `send` Claude makes after `Not now` reopens the modal dialog.
  fix: HOST-14's list, after "the cards for an edit before a turn a CLI started by itself (WSP-12, →M6)", adds "the folder's trust card (ARM-7), whose row shows its dialog again when chosen"; VIS-2's "waiting on you" meaning adds "or the folder's trust card (ARM-7)".
  options: (re-show) A only the owner's own uses (`/army`, `/send`, r, or the list's row) show the dialog again, and Claude's `send` returns `queued · waits · trust card` with no dialog; B every use shows it again, Claude's sends included (as written).
  big or technical: big (it changes when the owner is asked, PLAYBOOK §14; when unsure, big).

- id: R-F-149
  verdict: CONFIRMED
  severity: P2
  evidence: v2@8e45853 :905 (§5.1 C: a fixture "is recorded again when its adapter is changed for a newer version of its CLI. Until then, a newer CLI connects with CH-8's warning"); :530 CH-8 ("connects, with a warning card"); :1139 M2-AC3; :152 HOST-8 and :187 HOST-14 do not name it; CH-2 :477-481 cites 2.1.259, .277, .281 and .293, which shows the release pace. Unchanged in v2@1ba37b5 (:531, :906). https://code.claude.com/docs/en/setup: "Native installations automatically update in the background", and the default channel is "latest". docs/adr/0015-the-quiet-default.md. Not a duplicate of any ledger row.
  reason: With auto-updating CLIs, nearly every connect is "newer" than the fixtures, and the spec never says where the "warning card" shows, how often, or how it goes away; since it waits on nothing, choosing its form is a matter of format and wording, which is technical.
  fix: CH-8: "A version newer than its fixtures connects. The soldier's log and one line in Claude's transcript say so once per CLI and version, as in `claude 2.1.294 is newer than its adapter's fixtures (2.1.293)`, and `/army` lists it. It waits on nothing, so it raises no card, toast or decision." §5.1 C: "…connects with CH-8's notice." M2-AC3: "An unknown CLI version connects with one notice; a second connect of that version shows none."

- id: R-F-150
  verdict: DECISION
  severity: P2
  evidence: v2@8e45853 :713 ("A shipped copy needs no trust"); :721 ("raise a soldier's autonomy above supervised only through an accepted card", which governs the folder's files only); :723 ("the shipped copy applies with its own autonomy levels", with the levels never named); :1086 M1-AC13 ("uses the shipped copies and shows no card"); :1748 Appendix D (at `full`, the owner's OS rights); :1749 (repository content may prompt-inject). C:/Users/johns/projects/AIConnections-review/shadow.config.json:4-8 (codex-sol, grok and agy at `full`; both claude soldiers at `auto`); src/core/config.ts:41 (v1 falls back to "the one shipped with the package"). Unchanged in v2@1ba37b5 (:714, :724, :1087). No ledger row or D-record covers the shipped levels (R-M1-103 fixed only which copy applies). The classifier side-question in the finding is not needed to decide this.
  reason: As written, a new repository with no policy files starts soldiers at the shipped copy's levels, which v1's copy sets to `full`, and no card or row shows them; which levels a fresh repository may start at, and whether the owner must see them, is security posture.
  options: A the shipped copy sets every soldier to `supervised`, and ARM-7 says so; B keep its levels, name them in ARM-7, and the first start of a soldier above `supervised` from the shipped copy in a folder shows one notice row with its name, `cli`, `model` and autonomy; C as B, with `/army` also listing each soldier's autonomy and its source (shipped or the folder's). Whichever is chosen, ARM-7 names the shipped levels (technical).
  big or technical: big (security posture: what runs without the owner's approval, PLAYBOOK §14).

- id: R-F-151
  verdict: CONFIRMED
  severity: P2
  evidence: v2@8e45853 :198 HOST-15 and :717 ARM-7 ("notice rows … not added to Claude's conversation"); :1633 H52 ("Only cards and one-line rows enter Claude's conversation (MSG-5, HOST-11)"); :182 HOST-11; :613 MSG-7 ("Claude's transcript gets one line saying that soldier's context changed"); :160 `/send`'s description "Claude is told"; :767 and :775 (WSP-10 and WSP-11 lines carrying paths); 73 "transcript" occurrences in v2@1ba37b5, with no definition added. Mod API: C:/Users/johns/projects/AIConnections/.shadow/v2-tools/review/evidence/mod-api-2.1.294/reference.md:141, where `$.session.append` gives two distinct row kinds: a user-role meta row that the model reads, and a system notice that the model never reads.
  reason: The host offers two different rows with different cost and trust, and the spec splits them explicitly in only two places while H52 implies all one-line rows reach Claude, so the many "Claude's transcript gets one line" clauses can't be implemented one way.
  fix: as proposed (§2: "**Transcript line:** a notice row in the owner's transcript, not added to Claude's conversation and waking nobody, unless its requirement says it goes to Claude."; MSG-7, MSG-5 and HOST-11's one-line rows say "Claude's conversation"). Also, H52's Spec column: "Only cards, and the rows MSG-7 and HOST-11 send to Claude, enter Claude's conversation (MSG-5, HOST-11); transcript lines and HOST-15's digest don't."
