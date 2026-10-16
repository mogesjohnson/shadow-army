# Drafts: repairs from M1's fix checks

Not applied yet. They repair what fix checks M1-FC1 and M1-FC2 found, against v0.8 (`1580e87`), and are applied together once M1-FC2 reports, so that no agent reads a spec that moves under it. The ledger's Resolution column is the source.

- `fc1.txt`: M1-FC1's findings R-M1-62 to R-M1-69 (R-M1-67's technical part only; the rest is D-17), D-18 (option b), and R-M1-60. Before applying, amend D-18's two blocks (PO-5 and WSP-11's guard) for R-M1-81, as D-18's "Amended" line says.
- `fc2.txt` (to write): M1-FC2's findings, as each ledger row's Resolution says: R-M1-70 (P1, confirmed by FC2-6), R-M1-72 to R-M1-80. R-M1-71 is parked for M2, and R-M1-82 is decision D-19. The P1 repairs (R-M1-70, R-M1-73) then go to a fix check.

Each file is a list of OLD/NEW blocks (format in `tools/pairs.mjs`). To apply, from `docs/spec/review/`:

```
node tools/pairs.mjs drafts/M1-r1-fc/fc1.txt <scratch>/fc1.json
node tools/rep.mjs ../v2.md <scratch>/fc1.json
node tools/trace-v2.mjs ../v2.md <snapshot of v0.8>
```

A dry run of `fc1.txt` on a copy of v0.8 applied all 19 blocks and gave 0 problems from `trace-v2.mjs` (101 requirements, 61 ACs), against the v0.8 snapshot.
