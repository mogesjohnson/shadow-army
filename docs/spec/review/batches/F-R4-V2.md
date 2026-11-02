# Packet F-R4-V2: F's round 4 red team findings R-F-168 and R-F-169 (raised on v0.20)

Spec snapshot (frozen v0.20, read this, not docs/spec/v2.md): `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/review/snapshots/v2@4f481fc.md`. Line numbers below are in it. Source report: `docs/spec/review/raw/F-r4-redteam.md` (findings 3 and 4). Ledger rows: `docs/spec/review/ledger.md` 207-208. Rows waiting for v0.21 and not to raise again: R-F-157 to R-F-165 (ledger).

Run as `spec-verifier`, Opus, `high`. Both say Appendix D (1757-1834) claims a risk is "prevented" where the spec elsewhere leaves a residual. Read only the cited ranges, and grep the snapshot for anything that already covers each claim (the residual risks, WSP, SEC, VER 992-1010). For each CONFIRMED finding give paste-ready OLD/NEW text against the snapshot.

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

