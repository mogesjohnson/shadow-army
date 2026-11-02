# F round 1, verifier F-V3 (verification rules): R-F-32, 33, 22, 36, 37, 48, 50, 51. Snapshot be9deb0.

- id: R-F-32
  verdict: CONFIRMED
  severity: P2 (was P1). The conflicts the finding names are already settled by v2's own text. The "Supersedes" line (:9) and "unless this spec restates it" (:31) make v2 win. WSP-7 :408 and PO-8 :189-200 keep session services running and wait for background work rather than killing the group. §3 :85, SES-5 :352, MSG-11 :327 and WSP-9 :411 name the soldier's branch. What is left is two readings of detail v2 never restates.
  evidence: §0 :31. 2.0 text: WS-1 :814 ("a detached worktree", 2.0's M5), SAFE-6 :1035 (also redacts "events", and "Logs are pruned after 30 days"), SAFE-10 :1048, SAFE-11 :1049 (residual risk and survivor-check fallback). Points v2 leaves open: (1) WSP-8 :409 lists only logs, records and briefs; reports are covered as records (PO-6 :184) and fixtures by VER-4 :505, but the event stream is not covered and pruning is not mentioned, while Appendix C's H62 row (:937) reads v2 as having no log limits. (2) Roster order (HOST-6 :125, VIS-6 :431, ARM-1 :378) is never defined, and no detail source is named for v1. v1 takes the order from orchestratorDelegate.md (AIConnections-v06/src/core/roster.ts:46). The CH-7/SAFE-10 part is weak: v2 itself adds Shadow Army's own restrictions (ARM-2 :380, ARM-6 :384-394), and settled.md:41 keeps them. ADR-0013:26 ("history") and claude-first.md:118 ("Their workspace and safety rules still apply").
  reason: The §0 rule doesn't say whether a partial restatement replaces the rest of its source, or what fills in detail for v1 sources, so 30-day pruning, redaction of the event stream and roster order each have two readings that matter.
  fix: Replace :31 with: "Requirements carried over from v1 or 2.0 name their source, as `(from …)`. Where this spec speaks to a point, anywhere in it, its text replaces the source's on that point. The source fills in only what this spec leaves open: the archived 2.0 text for a 2.0 source, except what rests on 2.0's wakes, chats and per-wake processes (such as SAFE-11's killing the turn's process group, and WS-1's detached worktree); v1's code at `v1.0.1` for a v1 source." Then WSP-8 states whether SAFE-6's pruning carries over (with R-F-7's log limits), and ARM-1 says roster order is `orchestratorDelegate.md`'s order, as in v1. Not the finding's own fix: making every source "history" would strip WSP-2 to WSP-6 of the 2.0 detail they rely on, unless all of it is quoted, and claude-first.md:118 says that detail still applies.

- id: R-F-33
  verdict: CONFIRMED
  severity: P1
  evidence: §5.1 L :493-497, VER-9 :514, M1-AC8 :557, M2-AC4 :568. The task's text exists only in claude-first.md:21, which names neither of the two files nor the headless command. claude-first.md:25-28 gives per prompt: claude task -6.1%, codex task +5.2%, codex follow-up -34.5%. Totals: claude -3.8%, codex -14.8%, grok +2.1%, agy +3.6%. Two-sided per prompt, claude and codex fail; one-sided on the total, all four pass. Codex's M1 draft (AIConnections-m1/docs/v2-m1.md:72-74) had to invent the procedure, and still leaves the measure and the direction open. Budget part: non-goal :53, SES-7 :371, which is R-F-20.
  reason: The M1 and M2 exit check gives opposite verdicts on the project's own data depending on how it is read, and can't be repeated, so its AC can pass while parity fails, or the other way round.
  fix: As proposed for the first five items: the prompts and the two files word for word; the measure (input including cache reads and writes, plus output, over both prompts, taken per request and not from running totals, see R-M1-12); live ≤ 1.05 × headless; each CLI's headless command and flags, including how its follow-up continues the session; and the number of runs. The last two items (how cost is counted where none is reported, and what happens when the budget runs out) belong to R-F-20. They are money questions, which are big by section 14.

- id: R-F-22
  verdict: CONFIRMED
  severity: P2
  evidence: App B rules 3-4 :747-748 check only within one milestone. CH-9 :260 is M4, yet CH-10 :266 (M2) already resumes by id (CH-9), and "The pane says" (the pane is M5). M2-AC6 :574 needs resume for a CLI without an interrupt; agy's interrupt is still unfound (s6-results.md:18: "otherwise test killing it and resuming with `--conversation`"). M3-AC9 :625 needs history after the 30 s kill. Neither AC cites CH-9, so the script passes. 2.0 :1572 used (→Mx) marks. The M1 restart case is R-M1-13; R-F-35 is already marked a duplicate of this one.
  reason: M2-AC6 and M3-AC9 can't pass without M4's CH-9, and no Appendix B rule or the script detects a dependency on a later milestone.
  fix: As proposed, with two changes. (1) The script checks rule 8 on every ID an AC names, and on every ID named by the requirements that AC cites. (2) Take the move of CH-9 to M2, since CH-10 already resumes there; M4-AC6 moves with it. Before M2, PO-1's restart opens a fresh session and the soldier's log says so. The finding's other option says "the pane says so", but the pane arrives in M5, after M4.

- id: R-F-36
  verdict: DECISION
  severity: P2
  evidence: G7 :45. App B :745-751 and VER-7 :512 check only the spec. VER-3 :504 (R) and §6 :522 ("each PR maps its ACs to evidence") keep the AC-to-test link on the PR. "CI passes with no tests" is overstated: VER-6 :507-511 fails a build without tests. But a test proving SEC-2's property ("appears in no file, command line or environment variable") can be missing while coverage and VER-7 both pass. R :498 and VER-8 :513 live only on the PR.
  reason: G7 promises verification traced in CI, but CI traces only the spec's own structure, so whether VER-7 must link requirements to tests has two readings.
  options: (a) Tests name the requirement or AC IDs they verify. VER-7 fails when a requirement with U, C, I, X, F or S evidence has no test naming it. R and L stay on the PR (VER-8, §6). (b) Reword G7: "Every requirement is verified: CI checks the trace (VER-7), and each PR maps its ACs to evidence (section 6)."
  big or technical: technical (how something is tested, and the document's structure). Neither option changes what the owner sees, does or approves.

- id: R-F-37
  verdict: CONFIRMED
  severity: P2
  evidence: VIS-3 :427 cites "(v1 UX-9)". UX-9 exists only in the 2.0 spec (:335); v1's src and docs have no UX IDs, and the v2 canvas (V2-Pane.dc.html:42) repeats the "v1's UX-9" label. Appendix A :722-741 has no VIS-3 row, against rule 6 :750. Both checkers miss it: Codex's check-spec-trace.mjs :7 (list) and :112 (regex), and today's trace-v2.mjs :53 and :55. Neither matches "(v1 …)". 2.0's UX-9 puts the model in the strip, against HOST-6 :125-127 and VIS-6 :430-431. Those win under :31, but the source cited is still wrong.
  reason: A requirement that names a source is missing from Appendix A, under the wrong source, and VER-7 passes anyway because carry-overs are found by a hard-coded list and a regex rather than a defined marker.
  fix: VIS-3 reads "Names are never dropped where a soldier is shown; the strip shortens them to tags and folds them as HOST-6 says (from 2.0 UX-9, without its model in the strip)". Without that scoping, HOST-6's "+N more" contradicts "never dropped". Add `| VIS-3 | 2.0 UX-9 |` to Appendix A. In §0, make `(from …)` the marker of a carried-over requirement and give it to every requirement Appendix A lists (ARM-2 and ARM-5 lack one today), so the script reads the marker and needs no list.

- id: R-F-48
  verdict: CONFIRMED
  severity: P2
  evidence: §0 :17 says only "marked *withdrawn*", and §0 :32 says "a script checks them". Rules 2-4 :746-748 have no exemption for a withdrawn requirement, and rule 7 :751 leaves out rule 5. Codex's checker fails a withdrawn line with no "(M…; …)" (check-spec-trace.mjs :33, :43-44). Today's trace-v2.mjs :16 silently skips such a line, so it would never see an ID being reused.
  reason: The first withdrawal either breaks CI or has to be given a fake milestone and AC, and reuse of an ID goes unchecked, while §0 says the script checks the rules.
  fix: As proposed, and rule 7 then checks rules 1 to 6, so §0 :32 holds. Because withdrawn entries stay in place, rule 1's duplicate check catches a reused ID; the script needs earlier IDs only to catch an entry that was deleted.

- id: R-F-50
  verdict: CONFIRMED
  severity: P3
  evidence: Q2 :714 ("Spike S2 answers this"). M0 :526 (done 2026-10-07, findings applied). m0-report.md:26-31 gives S2's cost and its recommendation to keep MSG-8. MSG-8 :311 applies it (`send` asks for a reply by default, and close summaries share one wake), and M3-AC6 :617 uses S2's cost. Q6 :718: the only other POSIX or macOS text is VER-2 :503, which is CI and not a live check.
  reason: Q2 is answered and applied but still listed as open, and Q6's pre-release live check is gated by no AC.
  fix: Mark Q2 answered: "S2: a wake is one request at the Monarch's context size, mostly cache reads; MSG-8 wakes only when a brief asks for a reply, and `send` asks by default." Turn Q6 into an L-evidence AC of M6, recorded as VER-8 says. Who runs the macOS check is the owner's call.

- id: R-F-51
  verdict: CONFIRMED
  severity: P3
  evidence: VER-2 :503 and M1-AC7 :556 ("every level except live"). §5.1 lists R as a level (:498), and the §0 table lists it as an evidence code (:29).
  reason: Read literally, "every level except L" includes review, which CI can't run.
  fix: As proposed in VER-2, and "every level except live checks and review" in M1-AC7.

