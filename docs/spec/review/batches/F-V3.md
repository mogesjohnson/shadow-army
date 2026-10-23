# Unit F, round 1, verification batch F-V3 (verification rules)

## R-F-32

- severity: P1
  type: contradiction
  location: §0 Carried over (docs/spec/v2.md:31)
  claim: "The archived 2.0 text is the reference for their detail, unless this spec restates it" imports 2.0 sentences that contradict v2 and a settled rule. It also doesn't say whether a partial restatement replaces the rest of the source.
  scenario: WSP-7 (:408) cites SAFE-11, which kills "the whole group ... at the end of the turn"; that ends claude's long-lived process (CH-2, G2) and the session services PO-8 keeps. CH-7 (:255) cites SAFE-10, which says Shadow Army "may add restrictions", while settled says it "never adds or removes a vendor safeguard". WSP-8 (:409) cites SAFE-6: does it also redact reports, and prune logs after 30 days against PO-5's append-only log? WSP-1 (:398) cites WS-1's "a detached worktree", but §3:85 and MSG-11:327 need a branch. No detail reference is named for v1 sources, so the roster order that VIS-6's tags depend on is a guess (v1 takes it from orchestratorDelegate.md).
  evidence: 2.0 text at :814, :1035, :1048, :1049. settled.md:40. ADR-0013 says sources keep "history" traceable, while claude-first.md:118 says 2.0's rules "still apply".
  fix: "A carried-over requirement means what this spec states; its source is history. Where a source's detail still applies, the requirement quotes it."

## R-F-33

- severity: P1
  type: untestable
  location: §5.1 L (docs/spec/v2.md:493-497); VER-9 (:514); M1-AC8 (:557); M2-AC4 (:568)
  claim: The parity check can't be repeated or judged. The spec defines neither "the two-prompt task" nor "tokens", nor whether "within 5%" works in both directions, nor the headless baseline's command and flags. The data v2 rests on already fails some readings.
  scenario: In claude-first.md:25-28, live runs differ from headless by -6.1% (claude task), +5.2% (codex task) and -34.5% (codex follow-up). Per prompt and two-sided, claude and codex fail; one-sided on the total, all four pass. The $2 budget can't be counted for CLIs that report no cost, and nothing says what happens when it runs out.
  evidence: The task text exists only in claude-first.md:21. Non-goal :53. SES-7:371.
  fix: Define in §5.1: the two prompts word for word; the measure (input including cache reads and writes, plus output, over both prompts); the pass rule (live ≤ 1.05 × headless); each CLI's headless command and flags; the number of runs; how cost is counted where none is reported; and what happens when the budget is spent.

## R-F-22

- severity: P2
  type: defect
  location: Appendix B (docs/spec/v2.md:743-751); CH-9 (:260); PO-1 (:165); M2-AC6 (:574); M3-AC9 (:625)
  claim: The trace rules don't catch an AC that needs a later milestone's requirement. Resume (CH-9) arrives in M4, but M1 already restarts crashed channels, and ACs in M2 and M3 need resumed sessions.
  scenario: In M1 to M3, a crashed claude soldier is restarted. Reading A: it gets a fresh session, its history is silently lost, and the next brief meets an empty context. Reading B: CH-9 is built early, outside the milestone's Implements. Under reading A, M2-AC6 ("resumed by id") and M3-AC9 ("answers the next message with its history") can't pass, yet the trace script passes.
  evidence: Rules 3 and 4 only check that each requirement is implemented and cited within its own milestone. The archived 2.0 draft fixed this class of problem with "(→Mx)" marks (R3·E8, :1572).
  fix: Add rule 8: "An AC relies only on requirements of its own or an earlier milestone, unless it marks a later one (→Mx) and says what holds until then." Then either move CH-9 to M2, or have PO-1 say that a restart opens a fresh session until M4 and the pane says so.

## R-F-36

- severity: P2
  type: decision-needed
  location: G7 (docs/spec/v2.md:45); Appendix B (:743-751); §5.1 R (:498)
  claim: G7 promises verification traced in CI, but Appendix B traces only the spec's own cross-references. CI passes with no tests, and R and L evidence leave nothing CI can read.
  scenario: SEC-2 ships with no test, and VER-7 still passes, because nothing links an AC to a test.
  evidence: VER-7:512; rules 1-4 and 6 read only the spec.
  fix: Decision, one of: (a) tests name the requirement or AC IDs they verify, VER-7 fails when a requirement with U, C, I, X, F or S evidence has none, and R and L are recorded on the PR (VER-8); (b) reword G7 to "traced in the spec, checked in CI".

## R-F-37

- severity: P2
  type: defect
  location: VIS-3 (docs/spec/v2.md:427); Appendix A (:722-741); Appendix B rule 6 (:750)
  claim: VIS-3 names a source but is missing from Appendix A. The source it names, "v1 UX-9", is actually 2.0's UX-9, whose detail §0 imports and which contradicts HOST-6 and VIS-6.
  scenario: 2.0 UX-9 says the strip shows "`<Shadow> <model>` ... The model may be truncated, but never dropped". HOST-6 (:125-127) shows no model and turns names into tags. Codex's checker finds carry-overs by a regex plus a hard-coded list (check-spec-trace.mjs:7, :112), so rule 6 misses VIS-3.
  evidence: shadow-army-2.0.md:335; UX-9 exists only in 2.0.
  fix: "Names are never dropped (from 2.0 UX-9; the strip shows no model)". Add VIS-3 to Appendix A, and define in §0 the marker that makes a requirement carried over ("(from …)").

## R-F-48

- severity: P2
  type: gap
  location: §0 IDs (docs/spec/v2.md:17); Appendix B rules 2-5, 7 (:746-751)
  claim: "Marked withdrawn" has no format and no exemption from rules 2-4, and nothing checks rule 5, though §0:32 says a script checks the rules.
  scenario: Withdrawing `PO-9` makes Codex's checker report "missing or invalid milestone" (check-spec-trace.mjs:43). Giving it a milestone instead would require it to be implemented and cited.
  evidence: Rule 7 (:751) covers rules 1-4 and 6.
  fix: "`- **ID** (withdrawn in vX.Y: reason)` is exempt from rules 2-4; VER-7 keeps every ID ever used and fails on reuse."

## R-F-50

- severity: P3
  type: editorial
  location: §8 Q2, Q6 (docs/spec/v2.md:714, :718)
  claim: S2 answered Q2, which still reads as open. Q6's POSIX and macOS live checks belong to no requirement or AC.
  scenario: v2.0.0 ships without the Q6 checks.
  evidence: m0-report.md:26-31.
  fix: Close Q2 with S2's answer, and give Q6 an AC.

## R-F-51

- severity: P3
  type: editorial
  location: VER-2 (docs/spec/v2.md:503); M1-AC7 (:556); §0 (:29)
  claim: "Every test level except L" includes R, a review, which CI can't run.
  scenario: M1-AC7 asks CI to run reviews.
  evidence: §0 table (:29).
  fix: "every level except L and R".
