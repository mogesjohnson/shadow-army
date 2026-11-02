# Round 5 prompts for F (written 2026-10-30, session 24, fork2)

Round 5 reviews spec v0.27 (`1d99e92`, snapshot `C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@1d99e92.md`, 1,867 lines, LF). It is the last round the flow allows (flow section 6, "Done"). Made from `drafts/r4/PROMPTS.md`'s F prompt, with the snapshot, the line ranges, the decisions and the do-not-raise list brought up to date.

**Lenses: the implementer and the enterprise operator.** F has had chaos, implementer and red team (r1), consistency and test author (r2), owner's advocate and implementer (r3), consistency and red team (r4): the implementer is the required lens (flow 6.2) F has had least recently, and the enterprise operator has never run on F and checks the goals, non-goals, Levels and threat model that F owns against PLAYBOOK section 10's checklist.

| Agent | Type, model, effort (flow section 4, rule 6) | Report |
|---|---|---|
| F, implementer | `spec-reviewer`, Opus, `high` | `raw/F-R5-implementer.md` |
| F, enterprise operator | `spec-reviewer`, Opus, `high` | `raw/F-R5-enterprise.md` |

Each `<charter>` is PLAYBOOK section 6's text for that lens, pasted below the prompt. New rows start at R-F-173.

## The prompt

```
Unit F (the frame), round 5. Your lens: <implementer, or enterprise operator>. <charter>

Read, in the review worktree (C:\Users\johns\projects\AIConnections-review), from the spec as frozen for this round, v0.27: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@1d99e92.md (cite that file's lines; docs/spec/v2.md may change while you work):
- the unit: lines 1-109 (the header, §0 Reading this spec, §1 Goals and non-goals, §2 Glossary, §3 Architecture), 919-1000 (§5.1 Levels), 1404-1474 (§7 Decisions, §8 Open questions, Appendix A, Appendix B) and 1788-1867 (Appendix D, the threat model);
- §5.2's rules VER-1 to VER-10 at 1001-1020, and the milestones and their ACs from 1025;
- what the unit cites: grep the same file for the IDs it names.

The settled decisions are in docs/spec/review/settled.md, and the owner's answers in docs/spec/review/decisions.md (D-1 to D-38, all answered; no decision is open). Appendix D's numbered residuals are risks the owner accepted (D-30 for 7, 8 and 12): raise one only with a new path to harm or new evidence. Findings already refuted or declined for this unit, not to raise again without new evidence (each ledger row in docs/spec/review/ledger.md gives the reason): R-F-4, R-F-46, R-F-69, R-F-108, R-F-138, R-F-141, R-F-142, R-F-85's G7 half, R-F-152's VIS-2 half. Every other F row up to R-F-172 is fixed or settled by the owner; a finding that one of those fixes is wrong or incomplete is in scope, citing the row.

Other sources you may read: docs/adr/; docs/spec/review/evidence/ (its README lists what is there); the readiness checklist, docs/spec/review/PLAYBOOK.md lines 207-228 (section 10); the v2 design canvas's pages, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\ (V2-*.dc.html; grep them, and where the canvas and the spec differ, the spec wins, VIS-1); Codex's M1 draft at C:\Users\johns\projects\AIConnections-m1, read only (grep it); vendors' official documentation.

Return only findings in the schema (docs/spec/review/PLAYBOOK.md lines 305-315), most severe first, then "Coverage: <the requirement IDs and sections you checked>". If you find nothing at P0 to P2, say so, and list what you checked. Read only the lines you need, and grep big files. No preamble and no summary.
```

## The charters (PLAYBOOK section 6)

Implementer (PLAYBOOK lines 125-131):

```
Implementer. Build the unit from the text alone, with no one to ask. List every guess you'd have to make:
- two reasonable readings;
- a missing value (format, limit, default, timeout, path, message text);
- an undefined term, or an order of operations not given;
- something Node.js, Windows, macOS or Linux can't do as written;
- a contradiction with another section.

For each, say what you'd build under each reading, and why it matters.
```

Enterprise operator (PLAYBOOK line 144):

```
Enterprise operator. You will roll this out to 200 developers in a regulated company and support it. Use the readiness checklist (section 10). Find what the text doesn't say that you'd need, and say whether a requirement or an explicit non-goal should close each gap.
```
