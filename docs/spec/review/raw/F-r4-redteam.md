# F-r4-redteam: F, round 4, red team (spec-reviewer, Opus, high; 2026-10-28, session 15, fork1)

Ran on v0.20 (`v2@4f481fc.md`); prompt in `drafts/r4/PROMPTS.md`. Saved from the transcript with `drafts/v021/handback.mjs`. Ledger rows R-F-166 to R-F-170.

- severity: P1
  type: gap
  location: VER-4 (snapshots/v2@4f481fc.md:997), WSP-8 (:773), §5.1 C (:917-929), SEC-4 (:855), Appendix D residual 5 (:1819)
  claim: committed contract fixtures are protected only by `redact()`, which the spec itself says misses secrets a CLI reads from files or its environment, so a recording can carry the owner's secret into the repository.
  scenario: the owner records §5.1 C's sessions (an approval request, an error session, a cold session) in a working checkout. A tool result in the recording holds a `.env` line such as `DATABASE_URL=postgres://u:p4ss@host/db`. That name doesn't end in key, token, secret, password or credential, so WSP-8's rule keeps it. VER-4 says only "redacted before they are committed", and nothing asks for a person to look at the fixture. The fixture is committed, and the credential is in git history, where only a history rewrite takes it out.
  evidence: VER-4 "They are redacted before they are committed"; WSP-8 :773 "Fixtures are redacted before they are committed"; SEC-4 :855 and residual 5 :1819: "Any other secret ... such as a value it read from a file or its environment, is logged as the CLI wrote it". §5.1 L :975 requires "a clean checkout of the commit under test" for live checks only. Nothing in §5.1 C asks the same of recordings.
  fix: VER-4: "Contract fixtures are recorded by the owner in a clean checkout of the commit under test, with no file or environment variable that holds a secret, and are redacted (WSP-8). The owner reads each fixture whole before it is committed, and the PR says so (R)." If more is wanted, such as a CI secret scan of `test/fixtures/`: decision: (a) the owner's review alone; (b) review plus a scan step.

- severity: P2
  type: gap
  location: SEC-6 (:857), Appendix D row 4 (:1796); the places that draw repository-derived text: ARM-6 attribution card (:729), WSP-10's working-tree line (:789), WSP-11 :798 and :803, PO-1 :223 and :227, WSP-9 `/diff` (:778)
  claim: SEC-6 escapes only "text from a soldier, a CLI or a config file", so paths, diffs, and branch and worktree names that come from the repository through harness git have no stated escaping on the cards the owner decides from.
  scenario: a repository the owner opens has a file whose name holds a bidirectional control (U+202E). A soldier's turn changes it, and the attribution card lists "each path and its diff". Reading A: the path comes from git, not from a soldier, CLI or config file, so it is drawn raw, and the name the owner reads differs from the real one when they answer y. Reading B: "wherever the mod draws it" covers every source. WSP-12 :841 adds "Paths are shown as SEC-6 says" for one line only, which supports reading A everywhere else. No AC tests a path, diff or ref name: M1-AC12 tests a fake claude's text, M1-AC13 tests a config file, and M5-AC6 tests an approval request.
  evidence: SEC-6 :857 "In text from a soldier, a CLI or a config file"; WSP-12 :841; charter position "files carrying escape sequences"; Appendix D row 4 covers only "A soldier's words"; the actors table :1783 "Repository content | Not trusted".
  fix: SEC-6: "In every text the mod draws or sends to Claude, whatever its source (a soldier's or a CLI's words, a config file, and paths, diffs, ref names and working-tree paths read from the repository), each character ...". Add an M1-AC11 case (a checkout path with ESC and U+202E fails the turn, and the transcript line shows placeholders) and an M2 attribution-card case. Widen row 4 to "A soldier's words, and repository text, to the Monarch, other soldiers and the terminal".

- severity: P2
  type: contradiction
  location: Appendix D row 8 (:1800), actors table (:1783); WSP-10 (:784); §5.1 X (:948)
  claim: row 8 rates "the repository to harness git" as prevented except residual 7, but WSP-10 runs every `filter.*` driver in the config at the post office's start as the owner's, while the actors table says repository git config may be hostile, so the outcome claims more than the control gives.
  scenario: the owner opens a repository whose own local config already names a filter driver when the first use starts the post office. WSP-10 treats it as "the owner's, and runs" when harness git makes a snapshot. Row 8 says the crossing is prevented, and no residual names it, so a reader of the threat model believes harness git runs nothing the repository names. (R-F-56 settled that a filter set at start runs; this finding is only about the appendix saying it is prevented.)
  evidence: row 8 "passes the owner's filters as they were at start ... prevented, except residual 7"; actors :1783 "files, git config, hooks ... may be hostile"; WSP-10 :784; §5.1 X :948 "One set at start is the owner's, and runs".
  fix: row 8 Outcome: "prevented for what changes after start, except residual 7; a filter in the config at start runs as the owner's (residual 14)". Add residual 14: "Filters in the repository's config when the post office starts are taken as the owner's and run in harness git (WSP-10); a repository opened with a hostile config runs them." If the owner wants this changed rather than stated: decision: (a) state it as a residual; (b) give start-time filters from the repository's own scope a card like ARM-7's.

- severity: P2
  type: contradiction
  location: Appendix D row 13 (:1805), "In short" (:1811), against row 12 (:1804) and residual 3 (:1817), PO-1 (:221)
  claim: row 13 says a soldier is "prevented" from acting once the owner's session has ended, with no exception, while row 12 and residual 3 say work the CLI handed to a service outside its tree keeps running.
  scenario: during a turn a soldier hands work to a scheduled task or a running tmux server (PO-1 :221). The owner ends Claude Code, and the lease shuts the army down. That work keeps running and changing files, with no guard. Row 13 and the summary at :1811 tell the owner this crossing is prevented.
  evidence: row 13 "The lease and the watch shut the army down (PO-7) ... prevented"; row 12 "prevented within the tree, except residual 3"; residual 3 "Work a CLI hands to a service outside its tree keeps running".
  fix: row 13 Outcome: "prevented within the process tree, except residual 3".

- severity: P3
  type: untestable
  location: Appendix D rows 12, 13, 15, 16 (:1804-1808); CH-2, PO-7, PO-9, PO-10, PO-16, MSG-3, PO-6 evidence codes
  claim: four trust boundaries are controlled only by requirements with no X evidence, so §5.1 X holds no security test for them, which the threat model's own boundary-to-test mapping implies it should. (This is not R-F-4: that finding was about §5.1's example lists. Here the controls carry no X code at all.)
  scenario: CH-2's auto-memory control (row 15) is evidenced C and L only. A regression that drops `CLAUDE_CODE_DISABLE_AUTO_MEMORY` from a restart path is caught only if a contract or live run happens to cover it. VER-7 counts tests by ID, not kind, so the gap never shows.
  evidence: row 15 "CH-2 (C, L)"; row 13 "PO-7 (U, I, F)"; row 12 "PO-1 (I, F) ... PO-16 (I, F)"; row 16 "MSG-3 (I, F) ... PO-6 (U, F)".
  fix: add X to the clause of CH-2 that M1-AC14 checks, and to PO-7's lease. Or state in Appendix D's intro that a boundary's tests may be I or F where the control is cleanup, not access.

Two areas were not finished. The ledger check for earlier rows on the trust-record and attribution-card interaction (residual 10, ARM-6's n) is incomplete. Leads H48 and B2 were read in the text (WSP-10 :789, PO-3 :235-240, residual 1) and look covered by stated residuals, but I didn't re-attack them in depth.

Coverage: header (:1-12), §0, §1 G1-G7 and non-goals, §2, §3, §5.1 C/I/X/F/S/L/R and the budget (:910-990), VER-1 to VER-10, M0 and S7, M1 Implements, M1-AC1 to M1-AC16 (to :1129), §7, Q1-Q9, Appendix A, Appendix B rules 1-9, Appendix D assets, actors, rows 1-17, residuals 1-13 and the closing paragraph; cited: PO-1 to PO-6, SEC-1 to SEC-6, ARM-1 to ARM-8, WSP-1 to WSP-12 (WSP-12 in part); ledger rows R-F-4, 46, 69, 108, 138, 141-165 and R-M1-206 to R-M1-234 checked for duplicates. Sources: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@4f481fc.md, C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md, C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md.