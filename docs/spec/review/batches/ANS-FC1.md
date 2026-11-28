# Packet ANS-FC1: fix check of spec v0.11, the owner's answers

v0.11 (`af97372`, snapshot `v2@af97372.md`) applies the owner's answers of 2026-10-17 to v0.10 (`e7c33b4`, snapshot `v2@e7c33b4.md`). Each answer was drafted as OLD/NEW blocks in `drafts/answers/`, then the placeholder IDs were numbered by `drafts/answers/ids.json`, Appendix D's decision marks were replaced by `d4-ids.txt`, and the header by `header.txt`. The drafters' reports are in `raw/`. Both checkers gave 0 problems (115 requirements, 73 ACs; Appendix C 118 rows).

## What changed, by answer

| Answer | The owner's choice (decisions.md) | Where in v0.11 | Draft | Report |
|---|---|---|---|---|
| D-3 B | the containment helper ships prebuilt for each system and processor, built, tested and checksummed in CI | PO-9 to PO-21 (new), PO-1, PO-2, PO-7, PO-8, §2, §5.1, VER-2, VER-6, M1's Implements, spike S7, M1-AC15 to M1-AC22 (new), Q8 closed | `d3.txt` | `raw/D-3-merge-draft.md` |
| D-4 A | an informative threat-model appendix | Appendix D (new), §0 | `d4.txt`, `d4-ids.txt` | `raw/D-4-draft.md` |
| D-5 B | caps on queues, sends and sizes now; logs after 2.0 with the disk risk | MSG-1, MSG-3, MSG-5, MSG-6, PO-5, PO-6, HOST-10, HOST-11, §2, M3-AC14 (new), Appendix C's H62 | `d5.txt` | `raw/D-5-draft.md` |
| D-8 B | $2 of reported cost plus a token cap; past either, the owner's go | §5.1 L, VER-8, VER-9 | `d8-16-17.txt` | `raw/D-8-16-17-draft.md` |
| D-9 A | harden the secret's memory where the system allows; state the rest | PO-3, PO-4, SEC-2, SEC-5, §5.1 X, M1-AC2, M3-AC8, Q9, Appendix C's B2 | `d9-10-19.txt` | `raw/D-9-10-19-draft.md` |
| D-10 A | a trust card for the folder's own files before any soldier starts | ARM-7 (new), §2, §5.1 X, M1's Implements, M1-AC13 (new), Appendix A | `d9-10-19.txt` | `raw/D-9-10-19-draft.md` |
| D-16 A | supervised claude keeps plan mode; the owner's own `useAutoModeDuringPlan: false` makes each such command ask | CH-2, M1-AC8 | `d8-16-17.txt` | `raw/D-8-16-17-draft.md` |
| D-17 B | one army per working tree | PO-1, §2 Folder, WSP-1, WSP-10, WSP-11, ARM-6, M1-AC11, M6-AC9 (new) | `d8-16-17.txt` | `raw/D-8-16-17-draft.md` |
| D-19 A | auto memory off for each claude soldier | CH-2, M1-AC14 (new) | `d9-10-19.txt` | `raw/D-9-10-19-draft.md` |

## Findings v0.11 fixes

R-M1-59 (P1), R-M1-61, R-F-68, R-M1-82, and the drafters' own R-F-90, R-F-91, R-M1-94, R-M1-95, R-M1-97, R-M1-102, R-M1-103. Their ledger rows say where.

## Not in scope

D-7 and D-11 (still with the owner); the findings verifiers ANS-V1 and ANS-V2 are checking (R-M1-89 to R-M1-93, R-M1-96, R-M1-98 to R-M1-101, R-M1-104 to R-M1-107, R-F-89, R-F-92, R-F-93), except where v0.11's text makes one worse.
