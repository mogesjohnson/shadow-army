# Drafts: M1's round-1 fix pass

Not applied yet. These hold the new text for the M1 findings that their verifiers confirmed, written on 2026-10-16 while M1-V8 and M1-V9 ran. The ledger's Resolution column is the source; these drafts carry it out.

- `m1-g2-*.txt` and `m1-g2-extra.json`: the post office's life (PO-1, PO-7, HOST-2, M1-AC1, and the small changes elsewhere): R-M1-3, R-M1-8, R-F-11, R-M1-10, R-M1-9, R-F-10, R-M1-5, R-M1-14, R-M1-15, R-M1-19, R-M1-51, D-2 (option A with B's parts), D-12, D-13, R-F-38.
- `m1-g1-*.txt`, `m1-g3-*.txt`, `m1-g4-*.txt` and `m1-g134-extra.json`: the claude channel, security, records and logs, and where soldiers run (CH-1, CH-2, CH-7, M1-AC4, PO-3, PO-5, WSP-8, SEC-4, VER-5, SI-3, ARM-3, and new SEC-6, WSP-11, M1-AC11, M1-AC12, Q9).

To apply, from the review worktree:

```
node docs/spec/review/tools/blocks.mjs docs/spec/v2.md g2.json PO-1=<dir>/m1-g2-po1.txt PO-7=<dir>/m1-g2-po7.txt HOST-2=<dir>/m1-g2-host2.txt M1-AC1=<dir>/m1-g2-ac1.txt --pairs <dir>/m1-g2-extra.json
node docs/spec/review/tools/rep.mjs docs/spec/v2.md g2.json
node docs/spec/review/tools/blocks.mjs docs/spec/v2.md g134.json CH-1=<dir>/m1-g1-ch1.txt CH-2=<dir>/m1-g1-ch2.txt CH-7=<dir>/m1-g1-ch7.txt M1-AC4=<dir>/m1-g1-ac4.txt PO-3=<dir>/m1-g3-po3.txt PO-5=<dir>/m1-g3-po5.txt WSP-8=<dir>/m1-g3-wsp8.txt SEC-4=<dir>/m1-g3-sec4.txt VER-5=<dir>/m1-g3-ver5.txt SI-3=<dir>/m1-g4-si3.txt ARM-3=<dir>/m1-g4-arm3.txt --pairs <dir>/m1-g134-extra.json
node docs/spec/review/tools/rep.mjs docs/spec/v2.md g134.json
```

A dry run against v0.7 at `0f8e822` gave 0 problems from `trace-v2.mjs` (101 requirements, 61 ACs) and from `check-appendix-c.mjs`. Then `node docs/spec/review/tools/rep.mjs docs/spec/v2.md <dir>/m1-appc.json` makes Appendix C's H25 and H2 Same (a dry run gives 0 problems). Still to add before applying: M1-V8's and M1-V9's verdicts (R-F-30, R-M1-9, R-F-10, R-M1-11, R-M1-7, R-M1-12, R-M1-23; R-M1-57, R-M1-58, R-F-67).
