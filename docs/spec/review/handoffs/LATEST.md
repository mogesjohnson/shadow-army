# Handoff: session 24, the main session (session "main"), to the next session (2026-10-30)

Written by the main session at its save point, at about 122k by the cockpit's context line. **v0.27 is applied** (V26-FC1's six P3 repairs) and **round 5 for F has run**: two reviewers, **not clean** (2 P1 and 8 P2 to verify). Round 5 for M1 has not run. The previous handoff is `git show b484a8d:docs/spec/review/handoffs/LATEST.md`.

## How this session worked

Three forks, one after another. fork1 drafted v0.27 in `drafts/v027/`, and main applied it and froze `v2@1d99e92.md`. fork2 wrote round 5's F packet (`drafts/r5/PROMPTS-F.md`), but reached 121k before starting the agents (RUNBOOK section 3), so it stopped. fork3 ran F's two reviewers from that packet. Main read only the forks' one-line reports and the checkers' output. **Lesson:** writing a round's packet cost fork2 about 50k (72k to 121k), so a fork that writes a packet can't also run its agents. Give the packet and the run to separate forks, as this session did by accident.

## The range

- Start `b484a8d`. End: the commit that last changed this file. `git diff b484a8d..HEAD --stat` shows it all.
- Paths: `docs/spec/v2.md`; `ledger.md`; `drafts/v027/` (`repairs1.txt`, `pairs1.json`, `rows1.txt`, `ledger1.json`); `drafts/r5/PROMPTS-F.md`; `raw/F-R5-implementer.md`, `raw/F-R5-enterprise.md`.
- Commits: `dc17bd4` (fork1's drafts), `1d99e92` (v0.27 applied), `4406264` (F's round 5 packet), `4b0c2c9` (F's round 5 reports).

## What is finished

- **v0.27** (fork1's drafts, applied by main at `1d99e92`): 8 spec pairs (WSP-10 792 and 795, M1-AC10 1105 and 1109, residual 15, the **Version** row), rows R-M1-295 to 300, and 7 ledger verdicts (V26-FC1's on R-M1-289 to 294, and item 1e on R-M1-280). fork1's choices are in `repairs1.txt`'s header. N5 split 1105 into two bullets, so v0.27's lines after 1105 are one later than v0.26's. Both checkers give 0 problems: `trace-v2.mjs` on an LF copy against `v2@a411314.md` (119 requirements, 81 ACs), and `check-appendix-c.mjs`. `git diff --check` is clean.
- **Snapshot frozen:** `.shadow/v2-tools/review/snapshots/v2@1d99e92.md` (1,867 lines, LF, in the main checkout's `.shadow`).
- **Round 5 for F** on `v2@1d99e92.md`. Lenses: implementer and enterprise operator. F has never had the enterprise operator; the implementer last ran in round 3, and the red team in round 4. Both ran as `spec-reviewer`, Opus, high. New rows start at R-F-173.
  - `raw/F-R5-implementer.md`: P0 0, P1 1, P2 4, P3 2. The P1 is at Appendix D rows 8 and 9 (1831-1832), WSP-10 795-796 and CH-1 499. The P2s are at VER-7 1015 with Appendix B rule 7 at 1471, VER-7 1015, VER-2 1004 with VER-6 1008-1010 and M1-AC7 1099, and §5.1's budget at 990.
  - `raw/F-R5-enterprise.md`: P0 0, P1 1, P2 4, P3 3. The P1 is at PO-5, WSP-10, PO-1 and §1's non-goals. The P2s are at PO-5 Disk with residual 15 (257-259, 1865), HOST-2's proxy check (119, 114), §1 with PO-12 to PO-14, PO-19 and HOST-1, and §1 with §5.1 (919-999).

## Next

1. **Verify F's round 5 P0 to P2** (2 P1, 8 P2) with `spec-verifier` agents, by flow section 4 (rules 4 and 6: a P1's second verifier only if the first confirms it). Two or three agents at a time. Packets go in `batches/`, and reports in `raw/`. Then draft and apply the repairs (P3s as proposed), and count the round. If F fails round 5, flow line 122 calls for a design note to the owner.
2. **Round 5 for M1**: write `drafts/r5/PROMPTS-M1.md` from `drafts/r4/PROMPTS.md`'s M1 prompt on `v2@1d99e92.md`. M1 had red team and enterprise operator in round 3, and chaos engineer and implementer in round 4, so pick the next two by flow line 109. Then run the pair. **Use one fork to write the packet and another to run the agents.**
3. Items 1 and 2 touch different files, so two forks can do them at once, but not with more than three agents running in total.

## Left open

- The owner's other questions are unchanged: P-17's Windows cases, the haiku model mismatch, alpha Q4 deferred until A6, the `Co-Authored-By: Ziggy` line on PR #81, and the cockpit mod's "+" choice. Main's N2 call from session 22 is SOUND by V26-FC1; the owner may still overrule it.
- Progress figures: the spec review is about 75 to 80% done by work. Neither milestone has a clean round yet, and round 5 is the last the flow allows, so F's and M1's results decide whether the owner gets design notes.
- The cheaper process (Sonnet drafting forks, owner calls settled before forks start) is still not adopted.
