Verifier F-R2-V1 (F's round-2 test author, R-F-69 to R-F-85), against v0.9 and v0.11, 2026-10-20

- id: R-F-69
  verdict: REFUTED
  severity: P2 (as given; it was real against v0.9)
  evidence: v0.9 M1-AC4 :713 tested only a child left running. v0.11 fixed it with D-3: M1-AC15 :971 ("The child starts a new session, clears its environment, forks a writer … and exits … Closing the channel returns only once the file has stopped growing"), run on every system and processor of PO-21 (:970), Windows included. The Windows half is M1-AC15 :976 (a child that asks to break away fails to start). PO-14's check, step 4 (:352), starts the same kind of probe. §5.1 I :807 and PO-9 :297 cover it too.
  reason: v0.11's M1-AC15 already tests a child that starts a new session and forks twice, on every system, so killing the process group alone no longer passes M1.

- id: R-F-70
  verdict: CONFIRMED
  severity: P2
  evidence: v0.11 still has the gap. CH-2 :477 says "A refusal is read from the field claude's recordings show (section 5.1, C)". §5.1 C :792 limits the synthetic path to "each error kind of CH-1". CH-1 :462 says "A refusal is not an error". M1-AC4 :925 and :929 want "a refusal as a refusal" from frames "copied from section 5.1 C's claude recordings". §5.1 F :819 lists a refusal among the fault cases. https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/handle-streaming-refusals documents `stop_reason: "refusal"` with `stop_details` (type, category, explanation; category may be null) and gives no way to trigger one on purpose. https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback documents none either. https://code.claude.com/docs/en/agent-sdk/typescript says SDKAssistantMessage.message is a BetaMessage that carries `stop_reason`. Codex's draft invented its frames, as the finding predicts: C:\Users\johns\projects\AIConnections-m1\src\v2\claude.ts:214 and :227 (`message.stop_reason`, `model_refusal_no_fallback`). R-M1-125 is the same finding, raised later on v0.11.
  reason: No recording or synthetic rule supplies a refusal frame, and the vendor documents no way to produce one on purpose, so the fake's refusal frame has to be invented.
  fix: In §5.1 C :792, after the rate-limit sentence, add: "So is a refusal, which CH-1 doesn't count as an error: for claude, an assistant message whose `message.stop_reason` is `refusal`, with `stop_details`." Two things stay NEEDS-PROBE: whether Claude Code's stream-json passes that field through or its automatic fallback (CH-2 :478) answers instead, and whether the `result` carries it. Once a probe shows where the field is, CH-2 :477 names it.

- id: R-F-71
  verdict: CONFIRMED
  severity: P3 (was P2): only the checker's author is misled, the spec passes under the natural reading (the citer's own milestone), and nothing the owner sees changes
  evidence: v0.11 Appendix B rule 8 :1225 is unchanged. SI-2 :535 (M1, M2) cites "(CH-2 to CH-5)" with no marker, and VER-9 :871 (M1, M2) is cited by M1-AC3 :924 and M1-AC8 :941. Under reading A (a cited requirement counts as its last milestone) both ACs fail rule 8. R-F-93's pending repair makes VER-8 a third two-milestone requirement. Neither checker implements rule 8: C:\Users\johns\projects\AIConnections-m1\scripts\check-spec-trace.mjs:23 does rules 1–4 and 6, and C:\Users\johns\projects\AIConnections\.shadow\v2-tools\trace-v2.mjs:1 does the same.
  reason: The parenthetical can attach to the citing or the cited requirement, and v0.11 passes its own rule under only one of those readings.
  fix: as proposed, replacing "(for a requirement with two milestones, its last)" in rule 8 :1225.

- id: R-F-72
  verdict: CONFIRMED
  severity: P3 (was P2): on the plain reading a requirement is named only by its own ID, so the AC case resolves itself. What is left is how the script tells an ID from text such as "UTF-8" or "SHA-256", a format choice
  evidence: v0.11 VER-7 :869 ("names the requirement or AC IDs it verifies, in its title or a comment beside it"); rule 9 :1226 ("every ID a test names is in this spec"). The spec itself uses "UTF-8" (SI-3 :536, PO-6 :243) and "SHA-256" (PO-13 :345, WSP-11 :711), and Codex's ID pattern `[A-Z][A-Z0-9]*-\d+` (check-spec-trace.mjs:11) would match both.
  reason: Rule 9 doesn't say which strings in a test count as IDs, so a test that mentions UTF-8 or SHA-256 fails CI under a plain pattern.
  fix: Add to VER-7 :869, after "a comment beside it": "An ID is one with this spec's prefixes (HOST, PO, CH, SI, MSG, SES, ARM, WSP, SEC, VIS, SET, OBS, VER, LEG) or of the form Mn-ACn. An AC ID names only that AC: rule 9 counts a requirement as named only by its own ID."

- id: R-F-73
  verdict: DECISION
  severity: P3 (was P2): each PR still maps its ACs to evidence (§6 :880), and M1-AC1 :911 checks the 0.0.0.0 refusal itself, so a test of the wrong kind has to get past the reviewer too
  evidence: v0.11 rule 9 :1226 and VER-7 :869 don't look at a test's kind. §0 :18 has each requirement name its evidence kinds. SEC-1 :724 (X). D-6 (decisions.md :193-203, technical, chosen by the orchestrator) settled that tests name IDs, not their kinds. v1's tests and Codex's draft sit beside the code (C:\Users\johns\projects\AIConnections-m1\src\v2\claude.test.ts), so the proposed folder rule would conflict with the layout in use.
  reason: The gap is real, but closing it means choosing how a test declares its kind, a choice with more than one sound answer.
  options: (a) a test's kind is its folder (as proposed); (b) the kind goes beside the ID in the title or the verifies comment, as in `// verifies: SEC-1 (X)`, and rule 9 asks for one test of each listed kind; (c) leave kinds to the PR's AC-to-evidence mapping, and say so in VER-7.
  big or technical: technical (how something is tested; PLAYBOOK §14).

- id: R-F-74
  verdict: DECISION
  severity: P2
  evidence: v0.11 VER-7 :869 ("CI names the current milestone"); §6 :880 ("Each milestone is one or more PRs"); VER-3 :861. Codex's CI runs the checker with no milestone (C:\Users\johns\projects\AIConnections-m1\.github\workflows\ci.yml:27).
  reason: Nothing says where CI gets the milestone or when it changes, so a milestone built over several PRs either fails rule 9 on its early PRs or escapes VER-3 until the last one.
  options: as proposed: (a) one PR per milestone, with the milestone in a committed file; (b) each PR lists in a committed file the requirements it implements, and rule 9 checks those plus every earlier milestone; (c) rule 9 checks the current milestone only on the PR that closes it, and VER-3 stays review only.
  big or technical: technical (how something is tested; the document's structure).

- id: R-F-75
  verdict: CONFIRMED
  severity: P3 (was P2): a deleted entry still shows in the PR's diff, so only the automatic check is missing
  evidence: v0.11 rule 7 :1224 ("against the previous version's IDs"); §0 :17. Both CI workflows check out with no fetch-depth (C:\Users\johns\projects\AIConnections-review\.github\workflows\ci.yml:21; AIConnections-m1 ci.yml:21), and https://github.com/actions/checkout documents fetch-depth as "Default: 1".
  reason: The rule doesn't say where the previous IDs come from, and CI's default checkout holds no earlier revision.
  fix: In rule 7 :1224, change "and against the previous version's IDs" to "and against the IDs of the spec on the PR's base branch, which CI fetches".

- id: R-F-76
  verdict: CONFIRMED
  severity: P3 (was P2): nothing forbids a fake clock. A clock handed to an in-process post office in code is not "an option or setting in the product" (VER-5 :863), and M1-AC1 :911 and M3-AC14 :1089 already use fake clocks. The gap is only that the other ACs don't require one.
  evidence: v0.11 fixed part of it: M1-AC4 :927 now runs the restarts on a fake clock. Still without a clock: M1-AC4 :933 (10 silent minutes), M1-AC2 :923 ("one a minute"), M2-AC7 :1030 and M3-AC9 :1077 (30 s), and M2-AC9 :1042 (2 s and 30 s). §5.1 F :827 and :835 name a fake clock only for the lease and the cold cache. R-M1-134 and R-M1-135 overlap for M1's cases.
  reason: Several time bounds name no fake clock, so a literal test runs for 10 minutes on three systems.
  fix: Add at the head of §5.1 F :817: "Every time bound these tests and section 6's ACs check runs on a fake monotonic clock, and on a fake wall clock where the bound reads one. The post office takes its clocks in code, so a test that runs it in-process gives it fakes; that is no product setting (VER-5). Only M1-AC1's SIGSTOP and unread-output cases run a real post office in real time."

- id: R-F-77
  verdict: CONFIRMED
  severity: P3 (was P2): a test written on the wrong reading fails a legitimate key in plain sight and hides nothing, and SEC-3 :726 already reads HOST-12 as "without the owner"
  evidence: v0.11 §5.1 X :812 ("The mod has no approval path"); HOST-12 :181; HOST-5 :140 (1 to 9 answer a vendor's request, two presses for a broad allow; ADR-0015); HOST-14 :187; CH-6 :502; M5-AC3 :1130 ("never approves anything"); M5-AC8 :1139.
  reason: Read literally, "no approval path" and "MUST NOT approve" forbid the pane's own keys that pass on the owner's answer.
  fix: as proposed, at §5.1 X :812 and HOST-12 :181, and M5-AC3 :1130 reads "never approves anything by itself".

- id: R-F-78
  verdict: CONFIRMED
  severity: P3 (was P2): this is M5, and approving a new snapshot is a normal review step, but the spec names no one who checks a snapshot against the canvas or the spec
  evidence: v0.11 §5.1 S :840 ("committed snapshots that follow the canvas"); header :11 and VIS-1 :733 (where the two differ, the spec wins and the canvas is redrawn); M5-AC1 :1128 ("match the canvas"); VIS-1 to VIS-4 have S evidence only (:733-760).
  reason: Without a step that ties a committed snapshot to its canvas frame or the spec's table, a snapshot is compared only with itself, or fails a render that is right by the spec.
  fix: Append to §5.1 S :840: "Each committed snapshot names the canvas frame it follows, or the spec's table where the two differ (VIS-1), and the PR reviewer confirms the match whenever a snapshot is added or changed." M5-AC1 :1128: "match the canvas, or the spec where it differs (VIS-1)".

- id: R-F-79
  verdict: DECISION
  severity: P2
  evidence: v0.11 §5.1 L :841 ("same model, effort and autonomy", not the same instructions); :843 (the headless commands carry no instructions); :845 (1.05); SI-3 :536 (under 1,500 tokens, about 1,000 measured). docs/claude-first.md:21 and :32 ("The difference is Shadow Army's appended instructions"). The values table at decisions.md :469 set 1.05 on the 2026-10-07 data, with agy at +3.6% and grok at +2.1%. The instructions are partly the owner's own rules.md and agent.md, which can grow within SI-3's cap.
  reason: The bar compares a run that carries the standing instructions with one that doesn't, so instructions that grow within SI-3's cap can fail VER-9 with the channel unchanged.
  options: as proposed: (a) the headless run gets the same instructions through each CLI's own slot (for agy, the first prompt); (b) the bar allows for them, live ≤ 1.05 × headless + the instructions' tokens × the live run's requests; (c) keep the bar, and cap SI-3 at the measured 1,000.
  big or technical: technical (how something is measured, or a limit; none of them changes the budget or what the owner approves).

- id: R-F-80
  verdict: DECISION
  severity: P2
  evidence: v0.11 §0 :31 is unchanged. 2.0's archived draft: GUARD-1 :1062 (`guard.maxDirty`, 20,000, "wakes are refused"); SAFE-9 :1045 (`link-escape`); SOLD-6 :692 ("Unknown events and fields are logged and ignored"). These reach v2 through WSP-4 :685, WSP-3 :684 and CH-1 :463 ("from 2.0 SOLD-6", M1). A grep of v0.11 finds no "unknown event", "maxDirty", "dirty files" or "link-escape". SET-1 :769 has no `guard.*` key. The clause came from R-F-32's fix (v0.7), chosen by the orchestrator, not the owner.
  reason: The clause makes 2.0 details binding that no AC names and that use 2.0's words, CH-1's unknown events among them in M1. Whether to spell them out or keep the clause and add ACs is a choice about the document's structure.
  options: as proposed: (a) each carried requirement states, in v2's words and with an AC, the source details that still apply, and §0 drops the clause; (b) keep the clause, and add one AC per carried requirement naming the source details it verifies. Under either option, the M1 part (SOLD-6's unknown events and fields, which CH-1 :463 doesn't state) should land now, and WSP-3 and WSP-4 can wait for unit M6.
  big or technical: technical (the document's structure, and v2.0's own behavior).

- id: R-F-81
  verdict: CONFIRMED
  severity: P3 (was P2): §3 :97 states the rule plainly, so a builder has it. What is missing is a traced ID and AC cases beyond the cancel race.
  evidence: v0.11 §3 :97. Appendix B rule 1 :1218 counts as a requirement only an entry in sections 4, 5.2 and 5.3. Besides §3, only M3-AC10 :1078 says it. HOST-14 :189 and M5-AC5 :1132 check that the rows leave and a late answer is dropped, not what the mod showed. R-F-112 is the same kind of problem, a MUST in §5.1 C, but not the same finding.
  reason: An unnumbered rule in §3 is invisible to the trace, and only one AC tests it.
  fix: Add **HOST-16** (M3; I) after HOST-15 :195: "The mod shows the result of each of its requests (a stop, an approval answer, y or n, g, a cancel, a change, a fresh start, a reconnect) only from the post office's event; a refused request leaves the mod showing what the last event showed, with the refusal's reason (§3)." Add it to M3's Implements :1057, have M3-AC10 :1078 cite it, and add to M5-AC5 :1132: "y pressed on an attribution card as the post office shuts down shows the card left unanswered, never answered (HOST-16)."

- id: R-F-82
  verdict: CONFIRMED
  severity: P2
  evidence: v0.11 CH-1 :463 ("A line split across reads is joined first"); PO-5 :240 ("the first line written after a gap says how many lines were lost"). §5.1 F lists both at :832 and :836, but §5.1's lists are examples (R-F-4's verdict), and M1-AC4 :934 and :936 check neither. M1-AC2's three-fragment key (:923) is about streamed fragments, not split reads.
  reason: An adapter that splits each read on its own, or a log that resumes without the lost-line count, passes every M1 AC.
  fix: as proposed, in M1-AC4 :934 (the split-line case) and :936 (the count of lost lines).

- id: R-F-83
  verdict: CONFIRMED
  severity: P3 (was P2): the worst outcome is a summary line one character off, or a lone surrogate in a card
  evidence: v0.11 MSG-5 :573 ("at most 120 characters each, counted the same at any width"); §2 :72; SI-1 :533. MSG-1 :546 already counts code points for its 24,000. M3-AC2 :1065 cuts only a longer reply, never a long line.
  reason: The unit of a summary line's 120 characters is undefined, and no AC cuts a line.
  fix: In MSG-5 :573, after "counted the same at any width", add ", as Unicode code points, as MSG-1 counts them, the … included; a cut never splits a code point". Add to M3-AC2 :1065: "a line of 121 characters is cut to 119 and …, and one whose 120th character is outside the Basic Multilingual Plane is cut whole." (Graphemes are the alternative unit, a format choice; code points match MSG-1.)

- id: R-F-84
  verdict: CONFIRMED
  severity: P3
  evidence: v0.11 WSP-8 :693 ("Fixtures are redacted as VER-4 (→M2) says"); VER-4 :862 (M2: "They are redacted before they are committed"). M1-AC3 :924 and M1-AC4 :925 commit real claude recordings in M1. settled.md:26 (decision 5: "M1-AC3 replays a real, redacted recording").
  reason: Under rule 8's marker the redaction rule takes effect in M2, so M1's committed recordings are under none, against settled decision 5.
  fix: as proposed: WSP-8 :693 reads "Fixtures are redacted before they are committed (VER-4 adds their provenance, →M2)", and M1-AC3 :924 reads "replays a recorded, redacted claude session".

- id: R-F-85
  verdict: CONFIRMED
  severity: P3
  evidence: v0.11 §5.1 R :855 ("confirms the requirement in the code, citing file and line"). R-coded process rules with no code line to cite: VER-3 :861, VER-8 :870, VER-1 :859 (a workflow line at most). The G7 half (:46) is REFUTED: D-6 (decisions.md :199) kept G7 on purpose, since rewording one of the owner's goals would be a big decision, and VER-7 :869 already says R and L evidence is recorded on the PR.
  reason: R's definition doesn't fit the R-coded rules about PRs, CI and live checks. G7 stays as D-6 decided.
  fix: Only the R half. §5.1 R :855 reads "The PR reviewer confirms the requirement, citing the file and line in the code, or, for a rule about the PR, CI or a live check, the PR's file list, the workflow's line or the write-up." G7 is unchanged.

Files: C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\F-r2-test-author.md; C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@af97372.md; C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md; C:\Users\johns\projects\AIConnections-review\docs\spec\review\settled.md; C:\Users\johns\projects\AIConnections-m1\src\v2\claude.ts; C:\Users\johns\projects\AIConnections-m1\scripts\check-spec-trace.mjs.
