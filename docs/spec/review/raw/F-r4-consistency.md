# F round 4: consistency auditor (spec-reviewer, Opus, high; v2@785cc17.md)

- severity: P2
  type: contradiction
  location: §2 Transcript line (v2@785cc17.md:90); MSG-9 (:633), MSG-10 (:636-637), MSG-6 (:620); HOST-11 (:186-187); M3-AC3 (:1208), M3-AC4 (:1209), M3-AC10 (:1220)
  claim: The v0.16 glossary repair (R-F-151) says a transcript line never reaches Claude's conversation unless its requirement says so, but MSG-9, MSG-10 and three M3 ACs still word their lines as reaching Claude.
  scenario: The owner cancels a brief Claude queued for Iron (MSG-10), or stops Iron's turn on that brief (MSG-9). Reading A follows the glossary and HOST-11:187 ("the other rows are for the owner only"): the line is a notice row, so Claude never learns the brief was cancelled or stopped. MSG-8 then wakes Claude when the brief "ended", with nothing in its conversation to say why, and Claude can tell the owner it is still waiting for Iron or send the brief again. Reading B follows MSG-9's "so Claude knows the turn was stopped" and M3-AC10's "Claude gets one line for its own briefs": the line goes into Claude's conversation. A test of M3-AC3 ("Claude gets one line" for a soldier-to-soldier message) that checks Claude's conversation fails against HOST-11, which keeps that row for the owner only. M3-AC4 checks only "Claude's transcript", while MSG-7 requires Claude's conversation.
  evidence: :90 "a notice row in the owner's transcript, which is not added to Claude's conversation and wakes nobody, unless its requirement says it goes to Claude's conversation"; :187 "Of these, the summary card and MSG-7's line also go into Claude's conversation (MSG-5, MSG-7); the other rows are for the owner only"; :633 "Claude's transcript gets one line, so Claude knows the turn was stopped"; :637 "When the message was Claude's brief, Claude's transcript gets one line saying it was cancelled or changed"; :1208 "Claude gets one line"; :1220 "Claude gets one line for its own briefs ... and Claude gets no line"; :1209 "adds one line to Claude's transcript (MSG-7)"; ledger R-F-151 (repair named only the glossary, MSG-7 and H52).
  fix: For each line, say where it goes. For example, MSG-9: "Claude's conversation gets one line, so Claude knows the turn was stopped"; MSG-10: "When the message was Claude's brief, Claude's conversation gets one line saying it was cancelled or changed"; add both to HOST-11:187's list. In M3-AC3, write "Claude's transcript (not its conversation) gets one line". In M3-AC4, write "adds one line to Claude's conversation". In M3-AC10, write "Claude's conversation gets one line". If the owner wants these lines for the owner only, drop "so Claude knows" instead.

- severity: P2
  type: ambiguity
  location: VER-6 (v2@785cc17.md:992)
  claim: VER-6 says code in another language "keeps the same bars through that language's own coverage tool", then says the helper's C, the script and the DLL's C# "join the same count", so a per-language 85% bar and one pooled count are both valid readings.
  scenario: The C helper reaches 40% line coverage, and the TypeScript post office and channels reach 95% over many more lines. Reading A applies the bar per language: CI fails, because the C is below 85%. Reading B pools the lines into one post-office count of about 90%: CI passes with most of the helper's paths untested. That helper is the code that holds containment (PO-9) and is checked by PO-17. Each CI implementer gates differently.
  evidence: :992 "Code in another language ... keeps the same bars through that language's own coverage tool ... The containment helper's C counts as the post office's: its lines are measured ... and join the same count ... The Windows script counts the same way, and so does the DLL's C#"; :989 "the post office and the channels keep at least 85% line coverage, counted over the three systems' runs together"; settled.md "Coverage" ("85% line coverage combined over the three systems ... No code excluded, no bar lowered").
  fix: Choose one and state it. Either "Each language's code keeps 85% line coverage on its own, measured by its own tool, and its lines also join the post office's count", or "Its lines join the post office's one count; no language has a bar of its own."

- severity: P3
  type: editorial
  location: Appendix D rows 9, 11, 16 (v2@785cc17.md:1785, 1787, 1792); intro (:1743)
  claim: Appendix D's intro says each control comes with its requirement's evidence codes and the ACs that check it, but three rows break that.
  scenario: Row 9 calls running `powershell.exe`, `taskkill` and `launchctl` from absolute paths "prevented", but its Evidence column lists only CH-1, WSP-10, HOST-2 and M1-AC10. M1-AC10 plants only claude, git, node and cmd.exe files, so no listed check covers the other three programs (PO-18, PO-19 and WSP-10's R and I evidence do). Row 9 also states a universal rule, "Every program Shadow Army starts runs from an absolute path", that no requirement makes. A program added later and started by name breaks no requirement, while Appendix D still says "prevented". Row 11 lists ARM-6 with no AC. Row 16 names the meter (SES-2) in its control but leaves it out of Evidence.
  evidence: :1743 "Each control is named by the requirement that makes it, with that requirement's evidence codes and the ACs that check it"; :1785 control names "PO-18, PO-19", evidence "CH-1 (U, C), WSP-10 (X), HOST-2 (I); M1-AC10"; :1079 (M1-AC10's planted files); :1787; :1792.
  fix: Row 9: add "PO-18 (R, I, L), PO-19 (I, F, R)" to Evidence, and either narrow the control to the programs listed or add the universal rule to a requirement (for example CH-1 or WSP-10). Row 11: add "M2-AC5, M6-AC1". Row 16: add "SES-2 (U, S); M4-AC1".

- severity: P3
  type: ambiguity
  location: §2 Writing turn, Read-violation (v2@785cc17.md:86-87); WSP-11 (:781, :791)
  claim: The glossary makes every turn on a build message a writing turn and defines a read-violation as a write by a read-only turn, but from M3 to M5 a build brief runs in a snapshot and WSP-11 reports its writes as read-violations.
  scenario: In M3, Claude sends Kaisel `kind: build`. By the glossary this is a writing turn. Kaisel edits src/a.ts in its snapshot (WSP-11), and the edit is discarded and reported as a "read-violation", the term the glossary keeps for read-only turns. The owner sees legitimate build work labelled as a violation.
  evidence: :86 "a turn whose message has the kind build is a writing turn"; :87 "Read-violation: a write that a read-only turn made in its snapshot or worktree"; :791 "reported then as a read-violation"; ARM-5 is M6 (:696); settled.md M1 decision 7.
  fix: Add to §2: "Until M6 (WSP-1, ARM-5), every turn runs in a snapshot, and a build turn's writes are discarded and reported as a snapshot's writes are (WSP-11)."

- severity: P3
  type: editorial
  location: Appendix D row 5 cites M5-AC3 (v2@785cc17.md:1781, :1272); HOST-1 (:113)
  claim: M5-AC3 still checks that "the mod is loaded from this repository", but since D-28 HOST-1 ships the mod in the release package, and loading it from a checkout is for contributors only.
  scenario: The M5 reviewer confirms the contributor path (a repository checkout) and passes HOST-1. Nothing at M5 checks the package or marketplace install path that HOST-1 makes primary.
  evidence: :1272 "Review confirms the mod is loaded from this repository"; :113 "ships the mod as a plugin inside its release package ... A checkout of this repository loads the mod the same way ..., for contributors only"; decisions.md D-28.
  fix: In M5-AC3, write "Review confirms the mod is loaded from the release package's `plugin` folder, by `--plugin-dir` or as a marketplace, and depends on no other plugin (HOST-1)".

- severity: P3
  type: editorial
  location: Q7 (v2@785cc17.md:1380); S6 (:1152)
  claim: Q7 says spike S6 looks at each CLI's "redirect without stopping", but S6 is defined as stopping a turn only.
  scenario: S6 runs to its definition (interrupt), and Q7's question is never studied.
  evidence: :1380 "Should v2 offer 'redirect without stopping' where a CLI allows it? Spike S6 looks at each CLI."; :1152 "S6 Interrupt ... how each CLI stops a running turn and keeps its session ... its findings into CH-10"; evidence/README.md names `s6-results.md` as "interrupt" results only, and no evidence file mentions steer.
  fix: Either add "and whether it can add to a running turn (Q7)" to S6, or write in Q7: "No spike looks at it yet."

- severity: P3
  type: editorial
  location: G2, G7 (v2@785cc17.md:41, :46); §2 Brief (:72)
  claim: Two goals and one glossary entry say more than the requirements do.
  scenario: G2 puts every soldier "in its own worktree", but agy, and any soldier that can't write at auto or full, always run in a snapshot (ARM-6, ARM-8), and before M6 every soldier does (WSP-11). G7 says the verification is "traced in CI", but VER-7 traces only U, C, I, X, F and S evidence; R and L evidence is recorded on the PR. §2 defines a brief as "a message that assigns work", yet ARM-5:697 and MSG-1:588 use "brief" for the Monarch's messages only, and the owner's `/send --kind build` also assigns work.
  evidence: :41, :46, :72; :709, :736, :781, :993 ("R and L evidence is recorded on the PR"), :697.
  fix: G2: "in its own worktree, or in a throwaway snapshot (ARM-6, ARM-8)". G7: "traced in CI, or for R and L recorded on the PR (VER-7, VER-8)". §2: "Brief: a message from the Monarch that assigns work (HOST-10)".

- severity: P3
  type: gap
  location: §0 Carried over (v2@785cc17.md:31); Appendix A WSP-5, WSP-6 (:1392-1393)
  claim: §0 defines what a source's "detail" is only for 2.0 text and v1.0.1's code, but requirements also cite issue numbers (#53, #32) and v1's design rules and canvas.
  scenario: Where WSP-5 says nothing on a point, a builder can't tell whether #53's discussion applies, or whether the CLAUDE.md design rule "the checkout guard fails any task ..." applies against D-23 and D-26.
  evidence: :31 "For a v1 source it is v1.0.1's code on `legacy/v1`"; :756 "(from 2.0 WS-8 and WS-9, v1 #28, and #53)"; :761 "(from 2.0 WS-5 and #32)"; :689, :850.
  fix: Add to §0: "For an issue, the detail is its accepted text on GitHub; for v1's design rules and canvas, their text at `v1.0.1`."

- severity: P3
  type: editorial
  location: ADR-0012 Consequences (docs/adr/0012-local-only-post-office.md:24)
  claim: ADR-0012 still names the security tests as "SEC-1 to SEC-5", but SEC-6 now has X evidence (v2@785cc17.md:846).
  scenario: A reader takes SEC-6's escaping tests to be outside the standing security suite.
  evidence: ADR-0012:24; spec :846 "SEC-6 (M1; U, X)".
  fix: Write "SEC-1 to SEC-6".

Coverage: header (:1-12), §0, §1 (G1-G7 and the non-goals, including D-27's), §2 (every entry, checked against MSG-1, MSG-3, MSG-5, PO-6, VIS-6, SES-2, SES-6, WSP-1, WSP-6, WSP-10, WSP-11, WSP-12, ARM-5, ARM-6, ARM-7, ARM-8, PO-8, PO-9, PO-12, PO-13, HOST-11), §3, §5.1 (every level, including the L budget figures against ADR-0009's table), VER-1 to VER-10, LEG-1, M0, M1's Implements line, S7, M1-AC1 to M1-AC13 (the rest by their headers), every milestone's Implements line against each requirement's own milestone (Appendix B rules 3 and 4), the →M markers in the citations of HOST-2, PO-1, PO-3, PO-5, PO-7, CH-1, CH-2, CH-7, SI-1 to SI-3, ARM-1, ARM-7, WSP-10, WSP-11, SEC-1/2/4/6 (rule 8), §7 against docs/adr/0008-0015, §8 Q1-Q9, Appendix A against every "(from …)" in the spec (rule 6), Appendix B rules 1-9, Appendix D (assets, actors, rows 1-17 against their requirements' evidence codes and ACs, residuals 1-13 against PO-3, PO-4, CH-2, PO-1, PO-16, PO-19, ARM-7, SEC-4, WSP-8, WSP-10, WSP-4, WSP-12, PO-5), settled.md, and D-27/D-28/D-29 as applied. Not raised again: R-F-4, R-F-46, R-F-69, R-F-108, R-F-138, R-F-141, R-F-142; "base" (R-F-113, parked); the 9-message queue against summaries sent back (R-F-91/R-F-31, parked); CH-11's undocumented mode requests (R-F-122). D-30 to D-33 are left to the owner.
