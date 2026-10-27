# Handoff: session 9, Fork 1 (2026-10-26)

Written by **Fork 1 of session 9** (no fork name and no handoff message reached it, so it was Fork 1). It started no agent. It stopped at the save point because it couldn't read `/context` itself and judged it was near 120k. Read this after the runbook's section 1.

## The range

- Start `cb2c2d7` (session 8 Fork 3's handoff). End: the commit that last changed this file (`git log -1 -- docs/spec/review/handoffs/LATEST.md`).
- `git diff cb2c2d7..<end> --stat`: `ledger.md`, `drafts/v018/rows.txt` and `marks.mjs`, `drafts/r4/rows.txt` and `addrows.mjs`, `STATE.md`, this file.
- The spec is unchanged: still **v0.17** (`785cc17`).

## Finished

- **V17-FC1's verdicts are in the ledger** (`03145f2`, `drafts/v018/marks.mjs`):
  - R-M1-182 NOT FIXED (relative `PATH` entries) and R-M1-183 NOT FIXED (the hold from M2 to M4);
  - R-M1-186 and R-M1-187 wrong as applied;
  - FIXED: D-26 to D-29 (R-M1-163, 167, 170, 173), R-M1-184, R-M1-176's retry half, and R-M1-171, 185, 188 to 192.
- **V17-FC1's new findings** are R-M1-193 to R-M1-205 (`drafts/v018/rows.txt`): N1 to N4 are P2 (R-M1-193 to 196), N5 to N13 are P3 (R-M1-197 to 205), all "repair pending (v0.18)". Each row gives the fix that V17-FC1 proposed.
- **Round 4's findings have IDs and rows** (`3672297`, `drafts/r4/rows.txt`):
  - M1 chaos: R-M1-206 to R-M1-219 (P1: 206, 207, 208; P2: 209 to 218; P3: 219);
  - F consistency: R-F-157 to R-F-165 (P2: 157, 158; P3: 159 to 165).
  - P1 and P2 rows say "to verify (round 4)"; P3 rows say "to apply unverified".

## Next, in order

1. **v0.18, drafted in the main session:** V17-FC1's repairs R-M1-193 to R-M1-205. Its report's N blocks (`raw/V17-FC1.md`) give the exact fix text. As in v0.17, write OLD/NEW blocks to `drafts/v018/repairs.txt`, then run `tools/pairs.mjs` and `tools/rep.mjs`, both checkers, and the snapshot. Small P3s from round 4 (R-M1-219, R-F-159 to R-F-165) can go into the same version.
2. **Verify round 4's P1 and P2** (R-M1-206 to 218, R-F-157, R-F-158) at rule 6's efforts: Opus high for the three P1s and anything security-related, Sonnet medium for simple ones. Run two or three verifiers at a time and build tight packets first. Then repair the confirmed findings, in v0.18 or v0.19.
3. **Owed for round 4:** M1's implementer and F's red team (`drafts/r4/PROMPTS.md`). Run them in a fresh session, two or three agents at a time.
4. Then a fix check of v0.18, and count round 4. Both streaks are 0, and round 5 is the cap (PLAYBOOK section 7).

## The owner's open questions

- **D-30 to D-33** are still unanswered. They were sent in chat on 2026-10-23, with records in `decisions.md`, and A is recommended for each. R-M1-204's residual half (other armies' refs move uncarded) is the same kind of acceptance as D-30.
- The go on M1's probes (`probes.md`).
- **PR #82** (Grok's "road to first alpha" plan, 2026-10-25) waits for the owner's and Claude's review. It isn't part of this runbook. One fact in it is stale: it says CI is off until 2026-11-01, but the repository is public, and CI on #77 was green on all three systems at `cb2c2d7`.

## What the files don't say

- Untracked JSON drafts from earlier forks are still in `drafts/r3/` and `drafts/v015/`. They can be rebuilt, so leave them untracked.
- The main checkout's local `main` is behind `origin/main` (`ae3d2e9`). Its stray `story.txt` (staged) and `moges*.md` files belong to the owner; don't commit them.
