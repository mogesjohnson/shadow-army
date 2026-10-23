# Packet ANS-V1: findings raised while drafting v0.11's answers

The drafters of the owner's 2026-10-17 answers raised these against v0.10 (`v2@e7c33b4.md`), which their line numbers cite. Each finding's full text, with its scenario, evidence and proposed fix, is in its raw report under "Findings against v0.10"; its ledger row (`ledger.md`) has a one-line summary.

| Finding | Severity | Raw report | Note |
|---|---|---|---|
| R-M1-89 | P1 | `raw/D-4-draft.md` | `claude -p` connects the repository's `.mcp.json` servers and runs its hooks with no trust dialog |
| R-M1-92 | P1 | `raw/D-8-16-17-draft.md` | a `claude --worktree` worktree under `.claude/worktrees/` sits inside the outer army's guard, under D-17's B |
| R-M1-90 | P2 | `raw/D-4-draft.md` | §5.1 X's filter claim against WSP-10's before-and-after check |
| R-M1-91 | P2 | `raw/D-4-draft.md` | macOS unassessed in D-9's residual |
| R-M1-93 | P2 | `raw/D-8-16-17-draft.md` | ExitPlanMode approved through the relay may leave `plan` for later turns |
| R-M1-96 | P2 | `raw/D-3-merge-draft.md` | Windows keeps a run-time Add-Type compile under the owner's "prebuilt" B |
| R-M1-98 | P2 | `raw/D-3-merge-draft.md` | macOS launchd behaviour the draft rests on |
| R-M1-99 | P2 | `raw/D-3-merge-draft.md` | M1 can't close without a Mac and an Apple Developer ID |
| R-M1-100 | P3 | `raw/D-3-merge-draft.md` | VER-6's bar for the Windows C# |
| R-M1-101 | P3 | `raw/D-3-merge-draft.md` | D-3 has no ADR |
| R-F-89 | P2 | `raw/D-5-draft.md` | how a summary reaches a soldier that sent a message (MSG-5) |
| R-F-92 | P2 | `raw/D-8-16-17-draft.md` | codex's token fields are undocumented |
| R-F-93 | P3 | `raw/D-8-16-17-draft.md` | VER-8 is M2 while M1 has live checks |

The drafts these findings sit beside, not yet applied: `drafts/answers/d3.txt`, `d4.txt`, `d5.txt`, `d8-16-17.txt`. Where a finding is about a draft's own text (R-M1-96, R-M1-98 to R-M1-100), judge it against the draft. Where a draft already answers a finding, say so.
