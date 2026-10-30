# Packet ANS-V2: the last drafter's findings, and the second check of the two P1s

Raised against v0.10 (`v2@e7c33b4.md`), which their line numbers cite. Each finding's full text is in its raw report under "Findings against v0.10"; its ledger row (`ledger.md`) has a one-line summary. R-M1-89 and R-M1-92 are P1, so this is their second verification (ANS-V1 has the first); judge them on your own.

| Finding | Severity | Raw report | Note |
|---|---|---|---|
| R-M1-89 | P1 | `raw/D-4-draft.md` | `claude -p` connects the repository's `.mcp.json` servers and runs its hooks with no trust dialog |
| R-M1-92 | P1 | `raw/D-8-16-17-draft.md` | a `claude --worktree` worktree under `.claude/worktrees/` sits inside the outer army's guard, under D-17's B |
| R-M1-104 | P2 | `raw/D-9-10-19-draft.md` | CH-2's "beside the session's record" in M1 |
| R-M1-105 | P2 | `raw/D-9-10-19-draft.md` | how `grok agent serve`'s secret reaches grok |
| R-M1-106 | P2 | `raw/D-9-10-19-draft.md` | whether a repository's settings can turn auto memory back on for a soldier |
| R-M1-107 | P2 | `raw/D-9-10-19-draft.md` | a hook can answer the trust card's dialog |

The drafts these sit beside, not yet applied: `drafts/answers/d3.txt`, `d4.txt`, `d5.txt`, `d8-16-17.txt`, `d9-10-19.txt`. Where a finding is about a draft's own text (R-M1-106, R-M1-107), judge it against the draft. Where a draft already answers a finding, say so.
