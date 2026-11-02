# Round 3 for F and M1, and fix check V14-FC1 (written 2026-10-21, session 7)

All on spec v0.14, frozen at `C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@02d5f84.md`. If the owner's answers to D-24 and D-25 land first and are applied as v0.15, change the snapshot, the line ranges and the version in every prompt, and make the fix check cover v0.14 and v0.15 together.

Five agents, at most three at a time (`spec2.0_review_flow.md` section 3), M1 first because it unblocks Codex:

| Order | Agent | Type, model, effort | Report |
|---|---|---|---|
| 1 | Fix check V14-FC1 | `spec-verifier`, Opus, `high` | `raw/V14-FC1.md` |
| 1 | M1, red team | `spec-reviewer`, Opus, `high` | `raw/M1-r3-redteam.md` |
| 1 | M1, enterprise operator | `spec-reviewer`, Opus, `high` | `raw/M1-r3-enterprise.md` |
| 2 | F, implementer | `spec-reviewer`, Opus, `high` | `raw/F-r3-implementer.md` |
| 2 | F, owner's advocate | `spec-reviewer`, Opus, `high` | `raw/F-r3-advocate.md` |

`<charter>` below is the lens's charter from `PLAYBOOK.md` section 6, pasted in full: red team lines 105-112, implementer 125-132, enterprise operator 144, owner's advocate 152-157.

## Fix check V14-FC1

```
Spec 2.0 review, units F and M1: fix check V14-FC1 (PLAYBOOK section 12) of spec v0.14. The packet is C:\Users\johns\projects\AIConnections-review\docs\spec\review\batches\V14-FC1.md: the repairs v0.14 made for fix check V13-FC1's findings, with the ledger rows each one closes and where it landed.

For each P2 repair: is it fixed? Did the change contradict or break anything within the unit, or in anything that cites the changed text? Answer FIXED or NOT FIXED, with the evidence (v0.14 lines) and one sentence of reasoning. Look hardest at R-M1-108 with R-M1-156 (does the guard now leave out exactly what WSP-10 leaves out, and does residual 13 still hold?) and at R-F-126 (does a pending revert now survive every way a post office ends, and does anything still let /apply through?). Say which P3, if any, is wrong. List anything a repair broke, or left half done, as new findings in the review schema (docs/spec/review/PLAYBOOK.md lines 305-315).

Sources (in C:\Users\johns\projects\AIConnections-review unless a path is given): the fixed spec, v0.14, frozen at C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@02d5f84.md (cite its lines; docs/spec/v2.md may change while you work); v0.13 at ...\snapshots\v2@ecf1e80.md; the repairs as drafted, docs/spec/review/drafts/v014/repairs.txt; the report that raised them, docs/spec/review/raw/V13-FC1.md; the ledger's rows (docs/spec/review/ledger.md, grep by ID); docs/spec/review/decisions.md (D-7, D-11, D-22, D-23; D-24 and D-25 are open cards, not yours to decide); docs/spec/review/settled.md; docs/adr/; the archived 2.0 draft, docs/legacy/spec/shadow-army-2.0.md (grep it); v1's code in src/; vendors' official documentation. Both checkers give 0 problems on v0.14 (119 requirements, 81 ACs; Appendix C 118 rows), so don't recheck citations mechanically. Out of scope: round 3's lenses; the probes P-1 to P-15; the parked rows. Read only the lines you need, and grep big files. No preamble and no summary.
```

## M1, red team and enterprise operator

```
Unit M1 (the post office and the claude channel), round 3. Your lens: <red team, or enterprise operator>. <charter>

Read, in the review worktree (C:\Users\johns\projects\AIConnections-review), from the spec as frozen for this round, v0.14: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@02d5f84.md (cite that file's lines; docs/spec/v2.md may change while you work):
- the unit, M1's requirements and ACs: HOST-2 112-115; PO-1 to PO-21 203-464 (M1's are those marked M1; PO-18 and PO-20 are M1 and M6); CH-1 and CH-2 467-494; CH-7 524-527; SI-1 to SI-3 562-569; ARM-1 679-681; ARM-3 684; ARM-7 712-724; WSP-8 753-756; WSP-10 and WSP-11 760-781; SEC-1, SEC-2, SEC-4 and SEC-6 823-829; VER-1 to VER-3 964-966; VER-5 to VER-9 968-976; M1's Implements and M1-AC1 to M1-AC22, 997-1124;
- the frame: lines 1-106 (the header, §0 to §3), §5.1 Levels 881-961, and Appendix D, the threat model, 1717-1793;
- what the unit cites: grep the same file for each ID (later milestones' IDs are marked →Mx).

The settled decisions are in docs/spec/review/settled.md, and the owner's answers in docs/spec/review/decisions.md (D-3 to D-23). Appendix D's numbered residuals are risks the owner accepted: raise one only with a new path to harm or new evidence. Findings already refuted or declined for this unit, not to raise again without new evidence (each ledger row in docs/spec/review/ledger.md gives the reason): R-M1-54, R-M1-19's mid-turn half, R-M1-62's variant, R-M1-101, R-M1-107, R-M1-114, R-M1-128, R-M1-131, R-M1-132, R-M1-138, R-M1-149. Open decisions, not yours to decide (name where a finding depends on one): D-24 and D-25 in decisions.md.

Other sources you may read: docs/adr/; docs/spec/review/evidence/ (its README lists what is there); Claude Code's mod typings, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\ (vendor files: read only, and never quote them whole); Codex's M1 draft at C:\Users\johns\projects\AIConnections-m1, read only (grep it); v1's code in src/; vendors' official documentation.

Return only findings in the schema (docs/spec/review/PLAYBOOK.md lines 305-315), most severe first, then "Coverage: <the requirement IDs you checked>". If you find nothing at P0 to P2, say so, and list what you checked. Read only the lines you need, and grep big files. No preamble and no summary.
```

## F, implementer and owner's advocate

```
Unit F (the frame), round 3. Your lens: <implementer, or owner's advocate>. <charter>

Read, in the review worktree (C:\Users\johns\projects\AIConnections-review), from the spec as frozen for this round, v0.14: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@02d5f84.md (cite that file's lines; docs/spec/v2.md may change while you work):
- the unit: lines 1-106 (the header, §0 Reading this spec, §1 Goals and non-goals, §2 Glossary, §3 Architecture), 881-961 (§5.1 Levels), 1335-1402 (§7 Decisions, §8 Open questions, Appendix A, Appendix B) and 1717-1793 (Appendix D, the threat model);
- §5.2's rules VER-1 to VER-10 at 962-978, and the milestones and their ACs from 983;
- what the unit cites: grep the same file for the IDs it names.

The settled decisions are in docs/spec/review/settled.md, and the owner's answers in docs/spec/review/decisions.md (D-1 to D-23). Findings already refuted or declined for this unit, not to raise again without new evidence (each ledger row in docs/spec/review/ledger.md gives the reason): R-F-4, R-F-46, R-F-69, R-F-108. Open decisions, not yours to decide: D-24 and D-25 in decisions.md.

Other sources you may read: docs/adr/ (ADR-0014 and ADR-0015 for the owner's advocate); docs/spec/review/evidence/ (its README lists what is there); the v2 design canvas's pages, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\ (V2-*.dc.html; grep them, and where the canvas and the spec differ, the spec wins, VIS-1); Codex's M1 draft at C:\Users\johns\projects\AIConnections-m1, read only (grep it); vendors' official documentation.

Return only findings in the schema (docs/spec/review/PLAYBOOK.md lines 305-315), most severe first, then "Coverage: <the requirement IDs and sections you checked>". If you find nothing at P0 to P2, say so, and list what you checked. Read only the lines you need, and grep big files. No preamble and no summary.
```

## Fix check V16-FC1 (written 2026-10-23, session 8, Fork 2)

The prompt sent: as V14-FC1's above, with the packet `batches/V16-FC1.md`, "spec v0.16", the snapshot `v2@bfa5d6f.md` (v0.15 `v2@8e45853.md`, v0.14 `v2@02d5f84.md`), the repairs `drafts/v015/repairs.txt` and `drafts/v016/repairs.txt` to `repairs7.txt`, the reports `raw/V14-FC1.md`, `raw/M1-r3-verify-V1.md` to `V3.md` and `raw/F-r3-verify-V1.md` to `V3.md`, open cards D-26 to D-33, and "look hardest" at the P1s R-M1-161, R-M1-168 and R-M1-169, R-M1-172's versions against WSP-10 and CH-2, and R-M1-176's limits against PO-8 and WSP-11. Report: `raw/V16-FC1.md`.

## Fix check V17-FC1 (written 2026-10-23, session 8, Fork 3)

The prompt sent: as V14-FC1's above, with the packet `batches/V17-FC1.md`, "spec v0.17", the snapshot `v2@785cc17.md` (v0.16 `v2@bfa5d6f.md`), the repairs `drafts/v017/repairs.txt`, the report `raw/V16-FC1.md`, the owner's answers D-26 to D-29 (open cards D-30 to D-33), and "look hardest" at the P1 R-M1-182 and at whether D-26 to D-29's repairs do what the owner chose and nothing more. Report: `raw/V17-FC1.md`.
