# Unit F, round 2: test author (spec-reviewer, lens: test author). Reviewed v2@b6f4315.md (spec v0.9), 2026-10-17; cut off by the usage limit once and resumed in the same session.

- severity: P1
  type: gap
  location: Q8 (docs/spec/v2.md:907); PO-1 Containment (docs/spec/v2.md:203)
  claim: No requirement says what happens when a soldier's process containment can't be set up, so this failure has no defined outcome and no test.
  scenario: On a Mac without Xcode's command-line tools (Q8: the helper "needs a C compiler there"), the first session can't build the helper. Reading A, Q8's description of the draft: the soldier doesn't start. Reading B, PO-1's "through the containment that Q8 chooses, as far as it reaches": the soldier starts uncontained, and a child that forks twice outlives the close. No M1 AC covers either reading, so both pass. Whatever Q8 decides, the same gap stays open, for example a prebuilt helper that the system refuses to run.
  evidence: PO-1 :203 says the post office "ends the CLI's whole process tree … through the containment that Q8 chooses, as far as it reaches". Q8 :907 says "then it refuses to start a soldier rather than run one uncontained", but that sentence describes the draft, is not a requirement, and covers only an update that breaks the macOS helper. WSP-11 :513 handles the parallel failure: "A soldier whose snapshot can't be made does not start: its log and one line in Claude's transcript say why." M1-AC1, M1-AC4 and M1-AC11 have no containment-failure case.
  fix: Add to PO-1 Containment: "A soldier whose process containment can't be set up, for any reason (no compiler, a helper the system refuses to run, an update that breaks it), does not start: its log and one line in Claude's transcript say why, and it never runs uncontained." Add to M1-AC4: "a containment helper that can't be built or run keeps the fake soldier from starting, and its log and Claude's transcript say why."

- severity: P2
  type: gap
  location: §5.1 F (docs/spec/v2.md:611); PO-1 (docs/spec/v2.md:203); M1-AC4 (docs/spec/v2.md:713)
  claim: PO-1 promises to end a descendant "that starts a new session or forks twice", and §5.1 F lists that fault, but no AC observes it, so M1 can be accepted with a kill of the process group alone.
  scenario: The adapter kills the CLI's process group when a channel closes. Every child in M1-AC1, M1-AC4 (its last bullet) and M2-AC9 stays in that group, so every AC passes. In real use, a Bash tool call that runs `setsid sh -c 'job &'` leaves a grandchild outside the group. It keeps writing the checkout after the channel and its guard have closed, and no guard or audit sees it.
  evidence: The phrase "forks twice" appears only at :203 and :611. M1-AC4 :713 checks only that "closing the channel ends a process the fake CLI started and left running".
  fix: Extend M1-AC4's last bullet: "…and, on Linux and macOS, one whose child started a new session and forked twice, and on Windows one started detached; each is gone once the channel has closed (VER-2)."

- severity: P2
  type: gap
  location: §5.1 C (docs/spec/v2.md:584-592); CH-2 (docs/spec/v2.md:300); M1-AC4 (docs/spec/v2.md:705)
  claim: CH-2 reads claude's refusal "from the field claude's recordings show (section 5.1, C)", and M1-AC4 copies its refusal frame from those recordings, but §5.1 C lists no refusal session. Its synthetic path covers only CH-1's error kinds, and a refusal is not one of them.
  scenario: The owner records every session §5.1 C lists, and none holds a refusal. A refusal also can't be produced on purpose: Anthropic returns one only when its classifiers stop a policy violation. M1-AC4's "a refusal as a refusal" then has no frame to copy and CH-2 has no field, so the builder invents both. The test passes against the invented frame, while a real refusal shows as an ordinary answer instead of being "marked as a refusal" (CH-1).
  evidence: §5.1 C :587 lets "A kind that can't be produced on purpose" be "built from the vendor's documented shape … and marked synthetic", but "kind" there means "each error kind of CH-1". CH-1 :290 says "A refusal is not an error". M1-AC4 :701 uses "frames … copied from section 5.1 C's claude recordings". https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/handle-streaming-refusals says streaming responses "return stop_reason: "refusal" when streaming classifiers intervene to handle potential policy violations", with `stop_details`. Where Claude Code's stream-json carries this (`message.stop_reason`, the `result`, or a model fallback, CH-2 :301): NEEDS-PROBE.
  fix: Add to §5.1 C: "a refusal, which can't be produced on purpose, is built from the vendor's documented shape (for claude, an assistant message whose stop_reason is refusal, with stop_details) and marked synthetic in its fixture". CH-2 then names the field once a probe shows where Claude Code's stream-json carries it, and whether its automatic fallback answers instead.

- severity: P2
  type: ambiguity
  location: Appendix B rule 8 (docs/spec/v2.md:947)
  claim: The parenthetical "(for a requirement with two milestones, its last)" can attach to the citing requirement or to the cited one, and the frozen spec passes rule 8 under only one of those readings.
  scenario: SI-2 (:358) and VER-9 (:654) are the only requirements with two milestones (M1, M2). Reading A, a cited requirement counts as of its last milestone: M1-AC3's "(CH-1, CH-2, SI-2)" and M1-AC8's "(VER-9)" then cite M2 without →M2, so the script fails M1's CI, although M1-AC7 says the script passes. Reading B, the parenthetical sets only the citer's own milestone: both citations pass, yet M1-AC3 relies through SI-2's "(CH-2 to CH-5)" on CH-3 to CH-5 (M2) with no marker, against rule 8's first sentence. The M1 draft's checker implements no rule 8 (scripts/check-spec-trace.mjs:23, "Appendix B rules 1–4 and 6"), so neither reading has ever been run.
  fix: "A requirement with two milestones may be cited without a marker by an AC of either milestone, and that AC verifies the part its own milestone implements. The requirement's own citations are checked against its last milestone."

- severity: P2
  type: ambiguity
  location: VER-7 (docs/spec/v2.md:652); Appendix B rule 9 (docs/spec/v2.md:948)
  claim: Rule 9 doesn't define what it means for a test to "name" a requirement: whether an AC ID names the requirements that AC cites, and which text counts as an ID.
  scenario: First case: a test titled "M1-AC4: a brief goes in, a summary comes back". If that names PO-1, CH-1, CH-2 and PO-5, rule 9 passes with no test of PO-5's 100 ms retry or lost-line count. If it names only the AC, a suite organized by AC (which VER-7 allows) fails rule 9 for every requirement. Second case: a test titled "counts UTF-8 bytes" (SI-3) or "SHA-256 baseline". With an ID pattern like the draft's `[A-Z][A-Z0-9]*-\d+`, "UTF-8" and "SHA-256" are IDs this spec doesn't have, and CI fails.
  evidence: VER-7 :652 lets each test name "the requirement or AC IDs it verifies, in its title or a comment beside it". Rule 9 :948 requires each requirement to be "named by at least one test, and every ID a test names is in this spec". SI-3 :359 counts "UTF-8 bytes". The draft's pattern is at C:\Users\johns\projects\AIConnections-m1\scripts\check-spec-trace.mjs:11.
  fix: "A test names what it verifies in its title, or in a comment on the line above it of the form `// verifies: PO-5, M1-AC4`. Only IDs with this spec's prefixes (HOST, PO, CH, SI, MSG, SES, ARM, WSP, SEC, VIS, SET, OBS, VER, LEG) or the form Mn-ACn count. An AC ID names only the AC, and rule 9 counts a requirement as named only by its own ID."

- severity: P2
  type: gap
  location: Appendix B rule 9 (docs/spec/v2.md:948); §0 Milestone and evidence (docs/spec/v2.md:18)
  claim: Any test that names a requirement meets rule 9, whatever its kind, so a requirement's X, C, F or S evidence can be missing while the trace passes.
  scenario: SEC-1 (M1; X) says "A test proves that no listening socket is reachable on a non-loopback address". A unit test of an address check, titled "SEC-1", meets rule 9. No test starts the post office and probes its sockets, so a channel port bound to 0.0.0.0 goes unseen with CI green. PO-2 :210 covers "every port a channel opens", which includes grok's `agent serve` (CH-4 :314).
  evidence: §0 :18 says each requirement names "the kinds of evidence that verify it". Rule 9 :948 asks only that a requirement "with U, C, I, X, F or S evidence is named by at least one test". §5.1 defines the kinds but gives no way to tell a test's kind. SEC-1 is at :519.
  fix: "A test's kind is the folder it lives in (test/unit, test/contract, test/integration, test/security, test/fault, test/snapshot). For each of U, C, I, X, F and S that a requirement lists, rule 9 requires at least one test of that kind that names it."

- severity: P2
  type: gap
  location: VER-7 (docs/spec/v2.md:652); §6 (docs/spec/v2.md:663)
  claim: "CI names the current milestone" says neither where CI gets the milestone nor when it changes. A milestone of several PRs then either can't pass CI or escapes VER-3.
  scenario: M3 lands as PR A (PO-4, SEC-5, HOST-10) and then PR B (MSG-1 to MSG-10). If CI names M3 from PR A, rule 9 fails PR A for MSG-1 to MSG-10, PO-6, HOST-11, ARM-2 and OBS-2, which have no tests yet. If CI names M3 only from PR B, PR A's PO-4 code lands with no test check, although VER-3 (:644) says "A requirement's tests land in the same PR as its code". The M1 draft's CI runs the checker with no milestone at all (C:\Users\johns\projects\AIConnections-m1\.github\workflows\ci.yml:27).
  evidence: §6 :663 says "Each milestone is one or more PRs". VER-7 :652 says "CI names the current milestone".
  fix: "decision: (a) a milestone is one PR, and CI reads its milestone from a committed file that the PR updates; (b) each PR lists, in a committed file, the requirements it implements, and rule 9 checks those plus every requirement of earlier milestones; (c) rule 9 checks the current milestone only on the PR that closes it, and VER-3 stays review only."

- severity: P2
  type: gap
  location: Appendix B rule 7 (docs/spec/v2.md:946); rule 5 (docs/spec/v2.md:944)
  claim: Rule 5 is checked "against the previous version's IDs", but nothing says where the script finds them, and CI's checkout doesn't contain an earlier revision.
  scenario: A PR deletes OBS-2's entry, its Implements entry and M3-AC7's citation of it, instead of withdrawing it. Rules 1 to 4 still pass, so only rule 5's comparison can catch the deletion. CI checks out with actions/checkout@v4 at its default depth of 1, so the base revision's spec is absent. The script then either errors on every PR or skips the comparison, and a later PR can reuse OBS-2.
  evidence: Rule 7 :946 says "and against the previous version's IDs, so a deleted entry is caught too". The checkout step is at ci.yml:21 in both the review and M1 worktrees. https://github.com/actions/checkout documents fetch-depth with "Default: 1".
  fix: "The script compares the IDs with those of the spec on the PR's base branch, which CI fetches (fetch-depth: 0), and fails when one is gone." An alternative: "…with a committed list of every ID ever used, docs/spec/ids.txt, which only grows."

- severity: P2
  type: untestable
  location: §5.1 F (docs/spec/v2.md:617, 624, 627); VER-5 (docs/spec/v2.md:646)
  claim: §5.1 puts only the lease (:618) and the cold cache (:626) on a fake clock. The other time bounds that §5.1 and the ACs test have none, and VER-5 leaves no sanctioned way to give a spawned post office a fake clock.
  scenario: M1-AC4 :709 ("answers initialize 5 s inside its startup bound … silent for 10 minutes mid-turn … one that never answers is restarted") runs in real time. That is 10 minutes plus claude's 60 s bound (PO-1 :199: MCP_TIMEOUT 30 s + 30 s), on three systems, against vitest's 5 s default timeout. The same applies to M1-AC2's "one a minute" (:699), the 30 s stop fallback in M2-AC7 (:759) and M3-AC9 (:806), and M2-AC9's 2 s and 30 s waits (:771). The alternative is a clock setting in the product, which VER-5's "No option or setting in the product names a fake" forbids on its plain reading. M1-AC1 :687 already requires "a fake monotonic clock" for a post office that :691 runs as "a real post office stopped with SIGSTOP".
  evidence: The lines cited above.
  fix: "Every test of a time bound in sections 4 and 6 runs on a fake monotonic clock, and on a fake wall clock where the bound reads one; M1-AC1's SIGSTOP case is the one real-time test." Plus "decision: how a spawned post office gets the fake clock: (a) through a Node preload that the test runner adds via NODE_OPTIONS, just as it puts test/fakes on PATH; (b) VER-5 allows one test-only clock setting; (c) time bounds are tested in-process only."

- severity: P2
  type: ambiguity
  location: §5.1 X (docs/spec/v2.md:606); HOST-12 (docs/spec/v2.md:175)
  claim: "The mod has no approval path" and HOST-12's "MUST NOT approve … It may only observe, or deny" don't say whose approvals they mean. Read as covering soldiers' requests, they forbid what HOST-5, HOST-14, CH-6 and M5-AC8 require of the mod.
  scenario: Reading A: the X test asserts that no mod code sends an allow. The pane's 1–9 keys fail that test, because they send the owner's "allow" through the mod (allow_always on the second press), and M5-AC3's review ("never approves anything", :854) fails as well. Reading B: the test covers only the mod's Claude Code tool hooks (ARM-6 :473), which must never return allow. That is a different test, and the soldier relay's owner-only rule is left to SEC-3 (M2).
  evidence: HOST-5 :135 ("1 to 9 answer a vendor's approval request … the second sends it"); HOST-14 :181 ("the answer is given there"); CH-6 :325 ("the owner's answer goes back unchanged"); M5-AC8 :863.
  fix: Change §5.1 X to: "The mod never approves by itself: none of its Claude Code hooks returns allow (HOST-12), and it answers a soldier's request only for the owner's own key, unchanged (CH-6, SEC-3)." Change HOST-12 to: "The mod MUST NOT approve a Claude Code tool call or permission; for those it may only observe, or deny."

- severity: P2
  type: untestable
  location: §5.1 S (docs/spec/v2.md:630); M5-AC1 (docs/spec/v2.md:852)
  claim: Screen renders are compared with "committed snapshots that follow the canvas", but no step checks a committed snapshot against the canvas, and the canvas is known to differ from the spec.
  scenario: Reading A: the committed snapshots are the mod's own first output. The S test then can't fail until a render changes, and VIS-1 to VIS-4, which have S evidence only, are compared with nothing. Reading B: the snapshots are taken from canvas frames. M5-AC1's "match the canvas" then fails a spec-correct render wherever v0.7 changed the states, until the canvas is redrawn.
  evidence: The header :11 says "Where it differs from this spec, the spec wins (VIS-1): v0.7 gives 'down' one glyph, makes 'held' a state of the queue…". VIS-1 :528 is (M5; S).
  fix: "Each committed snapshot names the canvas frame it follows, or the spec table where the spec differs, and the PR reviewer confirms the match whenever a snapshot is added or changed (R, added to VIS-1 to VIS-4)."

- severity: P2
  type: defect
  location: §5.1 L (docs/spec/v2.md:631-635); SI-3 (docs/spec/v2.md:359)
  claim: The 1.05 bar compares a live run that carries the standing instructions with a headless run that doesn't, so a change to the instructions alone, still within SI-3's cap, can fail VER-9.
  scenario: The owner's 2026-10-07 measurement attributes the whole live–headless gap to the appended instructions, which were then about 1,000 tokens. For agy, the live run was 46.3k against 44.7k headless, +3.6%. If the instructions grow to 1,499 tokens, still under SI-3's 1,500, the same gap scales to about +5.4%, and agy's M2 parity fails with the channel unchanged. The check then measures rules.md's length rather than the channel.
  evidence: :631 requires "the same model, effort and autonomy", not the same instructions. :633's headless commands carry no instructions. :635 sets "at most 1.05 times". SI-3 :359 says "under 1,500 tokens … measured about 1,000". C:\Users\johns\projects\AIConnections-review\docs\claude-first.md:21-32 has "with Shadow Army's instructions appended", the results table, and "The difference is Shadow Army's appended instructions."
  fix: "decision: (a) the headless run gets the same instructions (claude's --append-system-prompt, codex's developer instructions, agy's first prompt), so the bar measures the channel alone; (b) the bar allows for them: live ≤ 1.05 × headless + the instructions' tokens × the live run's requests; (c) keep the bar, and cap SI-3 at the measured 1,000."

- severity: P2
  type: gap
  location: §0 Carried over (docs/spec/v2.md:31)
  claim: The rule "a source's detail applies only where this spec says nothing on the point" makes unlisted 2.0 details binding, but no AC names them, and some use words that v2 gives another meaning, so no test can be written from v2 alone.
  scenario: WSP-4 (:485) carries 2.0 GUARD-1 to GUARD-4, and v2 says nothing about a limit on dirty files. So 2.0 GUARD-1's "Over guard.maxDirty (20,000) dirty files, wakes are refused" applies. One builder adds a guard.maxDirty key (not among SET-1's keys) and refuses a turn at 20,001 dirty files; another hashes them all; both pass M6-AC1. "Wake" is 2.0's word for a soldier's run (WS-7, "A write wake"), but in v2 a wake is MSG-8's waking of the Monarch. Two more 2.0 details carry over the same way with no v2 AC: SAFE-9's "fails the wake as `link-escape`" (through WSP-3) and SOLD-6's "Unknown events and fields are logged and ignored" (through CH-1, an M1 requirement).
  evidence: In C:\Users\johns\projects\AIConnections-review\docs\legacy\spec\shadow-army-2.0.md: :1062 (GUARD-1), :1045 (SAFE-9), :692 (SOLD-6), :834 (WS-7). A grep of v2 finds no "maxDirty", "dirty", "link-escape" or "unknown event".
  fix: "decision: (a) each carried requirement lists, in v2's words and with an AC, the source details that still apply, and §0 drops the clause; (b) keep the clause, and add one AC per carried requirement naming the source details it verifies."

- severity: P2
  type: gap
  location: §3 Architecture (docs/spec/v2.md:92)
  claim: The rule "The post office decides every state … the mod shows only from the post office's event" has no requirement ID, so the trace can't see it, and only M3-AC10's cancel case tests it.
  scenario: The owner presses y on an attribution card just as the lease ends. The mod at once shows the card as answered and the change as trusted, but the post office has shut down and drops the answer (HOST-14 :183). M5-AC5 (:856) checks only that the rows leave and the answer is dropped, not what the mod showed. Every AC passes, and the owner believes the change was trusted.
  evidence: A grep finds "post office's event" only at :92 and in M3-AC10 :807.
  fix: Make the rule a requirement, with an ID in 4.1 or 4.2 and I evidence. Add to M5-AC5: "for each mod action (a stop, an approval answer, y or n, g, a cancel, a change, a fresh start, a reconnect), a request the post office refuses leaves the mod showing what the post office's last event showed, plus the refusal's reason."

- severity: P2
  type: gap
  location: §5.1 F (docs/spec/v2.md:623, 627); CH-1 (docs/spec/v2.md:291); PO-5 (docs/spec/v2.md:228); M1-AC4 (docs/spec/v2.md:710, 712)
  claim: Two promises that §5.1 F lists have no AC: CH-1's joining of a line split across reads, and PO-5's count of lines lost after a failed log write.
  scenario: An adapter that decodes and splits each read chunk on its own passes M1-AC3 (a replay that feeds whole lines) and M1-AC4 (fakes that write whole lines). In real use, a 100 KB tool_result line arrives in more than one read, with a multi-byte character split at the boundary. It shows as two malformed lines, and its event is lost. Separately, M1-AC4's log bullet passes a log that resumes with no count of the lines lost.
  evidence: CH-1 :291 says "A line split across reads is joined first". PO-5 :228 says "the first line written after a gap says how many lines were lost". M1-AC4 :710 and :712 check neither.
  fix: Add to M1-AC4: "a line the fake writes in three pieces, one split inside a multi-byte character, is read as one event, and a last line cut off by the fake's exit is one malformed line". Extend its log bullet: "…and the first line written after the gap gives the number of lines lost."

- severity: P2
  type: ambiguity
  location: §2 Summary (docs/spec/v2.md:68); MSG-5 (docs/spec/v2.md:388); M3-AC2 (docs/spec/v2.md:794)
  claim: The 120-character line limit doesn't say what a character is, and no AC observes the line cut.
  scenario: Take a summary line of 119 ASCII characters followed by "😀". It is 121 UTF-16 units and 121 terminal cells, but 120 code points or graphemes, so one build cuts it and another keeps it. A cut at UTF-16 unit 120 leaves a lone surrogate. M3-AC2 checks only "at most five lines" and "A longer reply is cut", so a build that never cuts a long line passes.
  evidence: MSG-5 :388 says "at most five lines of at most 120 characters each, counted the same at any width. A longer line or reply is cut with …".
  fix: Add to MSG-5: "…counted in grapheme clusters, the … included, and a cut never splits one". Add to M3-AC2: "a line of 121 characters is cut to 119 and …, and one ending in an emoji is cut whole."

- severity: P3
  type: contradiction
  location: WSP-8 (docs/spec/v2.md:493); VER-4 (docs/spec/v2.md:645); M1-AC3 (docs/spec/v2.md:700)
  claim: "Fixtures are redacted as VER-4 (→M2) says" leaves the real claude recordings committed in M1 under no redaction rule, although settled decision 5 says M1-AC3 replays "a real, redacted recording".
  scenario: M1's PR commits §5.1 C's claude recordings, including the login-needed and approval sessions, without running redact() over them. Nothing in M1 (no requirement, no AC, no CI step) fails the PR.
  evidence: docs/spec/review/settled.md:26.
  fix: Change WSP-8 to "Fixtures are redacted before they are committed (VER-4 adds their provenance, →M2)", and change M1-AC3 to "…replays a recorded, redacted claude session".

- severity: P3
  type: untestable
  location: §5.1 R (docs/spec/v2.md:638); G7 (docs/spec/v2.md:46)
  claim: R is defined as "confirms the requirement in the code, citing file and line", which doesn't fit the R-coded process rules, and G7 says all verification is traced in CI although R and L evidence is not.
  scenario: VER-3 (:644, "tests land in the same PR"), VER-8 (:653, "written up on its milestone's PR") and VER-1 (:642) have no file and line in the code for a reviewer to cite. M1-AC7 cites VER-3 but observes nothing of it.
  evidence: VER-7 :652 says "R and L evidence is recorded on the PR".
  fix: Change R to: "The PR reviewer confirms the requirement, citing the file and line, or, for a rule about the PR or CI, the PR's file list, the workflow or the write-up." Change G7 to: "…U to S evidence is traced in CI, and R and L evidence on the PR."

Coverage: line numbers are from the snapshot v2@b6f4315.md. I checked the header, §0, §1 (G1–G7 and the non-goals), §2, §3, all eight levels of §5.1, and VER-1 to VER-10. Among the cited ACs I checked M1-AC1 to M1-AC12, M2-AC1 to M2-AC11, M3-AC2, AC9, AC10 and AC13, M4-AC1, M5-AC1, AC3, AC5 and AC8, and M6-AC1. I also checked §7 against the ADRs (no finding), Q1 to Q9, and Appendix A against every "(from …)" for rule 6 (consistent, no finding). I checked Appendix B rules 1 to 9, and the cited requirements PO-1, PO-2, PO-5, PO-7, CH-1, CH-2, CH-6, SI-2, SI-3, MSG-5, HOST-5, HOST-12, HOST-14, WSP-3, WSP-4, WSP-8, WSP-11, SEC-1, VIS-1 and VIS-2. R-F-4 and R-F-46 are not raised again.
