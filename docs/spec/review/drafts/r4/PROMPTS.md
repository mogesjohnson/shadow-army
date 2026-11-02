# Round 4 prompts (written 2026-10-23, session 8, Fork 3)

Round 4 reviews spec v0.17 (`785cc17`, snapshot `v2@785cc17.md`). Lenses (flow section 6, PLAYBOOK section 6): M1 gets the chaos engineer and the implementer; F gets the consistency auditor and the red team. Each charter is PLAYBOOK section 6's text for that lens, pasted where `<charter>` stands. Reports: `raw/M1-r4-chaos.md`, `raw/M1-r4-implementer.md`, `raw/F-r4-consistency.md`, `raw/F-r4-redteam.md`.

## M1, chaos engineer and implementer

```
Unit M1 (the post office and the claude channel), round 4. Your lens: <chaos engineer, or implementer>. <charter>

Read, in the review worktree (C:\Users\johns\projects\AIConnections-review), from the spec as frozen for this round, v0.17: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@785cc17.md (cite that file's lines; docs/spec/v2.md may change while you work):
- the unit, M1's requirements and ACs: HOST-1 and HOST-2 113-119; PO-1 to PO-21 208-474 (M1's are those marked M1; PO-18 and PO-20 are M1 and M6); CH-1 and CH-2 477-504; CH-7 534-537; SI-1 to SI-3 572-579; ARM-1 689-691; ARM-3 694; ARM-7 722-734; WSP-8 763-766; WSP-10 and WSP-11 770-793; SEC-1, SEC-2, SEC-4 and SEC-6 841-847; VER-1 to VER-3 983-986; VER-5 to VER-9 987-995; M1's Implements and M1-AC1 to M1-AC22, 1016-1147;
- the frame: lines 1-108 (the header, §0 to §3), §5.1 Levels 899-980, and Appendix D, the threat model, 1741-1818;
- what the unit cites: grep the same file for each ID (later milestones' IDs are marked →Mx).

The settled decisions are in docs/spec/review/settled.md, and the owner's answers in docs/spec/review/decisions.md (D-1 to D-29). Appendix D's numbered residuals are risks the owner accepted or is asked to accept: raise one only with a new path to harm or new evidence. Findings already refuted or declined for this unit, not to raise again without new evidence (each ledger row in docs/spec/review/ledger.md gives the reason): R-M1-54, R-M1-19's mid-turn half, R-M1-62's variant, R-M1-101, R-M1-107, R-M1-114, R-M1-128, R-M1-131, R-M1-132, R-M1-138, R-M1-149, R-M1-162. Parked for later milestones or decisions: R-M1-71, R-M1-175, R-M1-178, R-M1-179, R-M1-180. Open decisions, not yours to decide (name where a finding depends on one): D-30 to D-33 in decisions.md.

Other sources you may read: docs/adr/; docs/spec/review/evidence/ (its README lists what is there); Claude Code's mod typings, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\ (vendor files: read only, and never quote them whole); Codex's M1 draft at C:\Users\johns\projects\AIConnections-m1, read only (grep it); v1's code in src/; vendors' official documentation.

Return only findings in the schema (docs/spec/review/PLAYBOOK.md lines 305-315), most severe first, then "Coverage: <the requirement IDs you checked>". If you find nothing at P0 to P2, say so, and list what you checked. Read only the lines you need, and grep big files. No preamble and no summary.
```

## F, consistency auditor and red team

```
Unit F (the frame), round 4. Your lens: <consistency auditor, or red team>. <charter>

Read, in the review worktree (C:\Users\johns\projects\AIConnections-review), from the spec as frozen for this round, v0.17: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@785cc17.md (cite that file's lines; docs/spec/v2.md may change while you work):
- the unit: lines 1-108 (the header, §0 Reading this spec, §1 Goals and non-goals, §2 Glossary, §3 Architecture), 899-980 (§5.1 Levels), 1359-1426 (§7 Decisions, §8 Open questions, Appendix A, Appendix B) and 1741-1818 (Appendix D, the threat model);
- §5.2's rules VER-1 to VER-10 at 981-997, and the milestones and their ACs from 1002;
- what the unit cites: grep the same file for the IDs it names.

The settled decisions are in docs/spec/review/settled.md, and the owner's answers in docs/spec/review/decisions.md (D-1 to D-29). Findings already refuted or declined for this unit, not to raise again without new evidence (each ledger row in docs/spec/review/ledger.md gives the reason): R-F-4, R-F-46, R-F-69, R-F-108, R-F-138, R-F-141, R-F-142. Open decisions, not yours to decide (name where a finding depends on one): D-30 to D-33 in decisions.md.

Other sources you may read: docs/adr/; docs/spec/review/evidence/ (its README lists what is there); the v2 design canvas's pages, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\canvas\ (V2-*.dc.html; grep them, and where the canvas and the spec differ, the spec wins, VIS-1); Codex's M1 draft at C:\Users\johns\projects\AIConnections-m1, read only (grep it); vendors' official documentation.

Return only findings in the schema (docs/spec/review/PLAYBOOK.md lines 305-315), most severe first, then "Coverage: <the requirement IDs and sections you checked>". If you find nothing at P0 to P2, say so, and list what you checked. Read only the lines you need, and grep big files. No preamble and no summary.
```

## Round 4's last lenses on v0.20 (2026-10-28, session 15, fork1)

M1's implementer (`raw/M1-r4-implementer.md`) and F's red team (`raw/F-r4-redteam.md`) ran on v0.20 (`v2@4f481fc.md`), with the prompts above changed as follows: the snapshot and every line range moved to v0.20 (M1: HOST 114-120, PO 209-484, CH-1/2 487-514, CH-7 544-547, SI 582-589, ARM-1 699-701, ARM-3 704, ARM-7 732-744, WSP-8 773-776, WSP-10/11 781-804, SEC 852-858, VER 994-1008, M1 1029-1164, frame 1-109, Levels 910-991, Appendix D 1757-1834; F: 1-109, 910-991, 1376-1443, 1757-1834, VER 992-1010, milestones from 1015); D-1 to D-34, all answered, with no open decisions; the charter given by PLAYBOOK line range rather than pasted; and the rows waiting for v0.21 (R-M1-206 to R-M1-234, R-F-157 to R-F-165) listed as not to raise again. Both on `spec-reviewer`, Opus, `high`. R-M1-221 and R-M1-222's verifier: `batches/M1-R4-V3.md`, `spec-verifier`, `high`.
