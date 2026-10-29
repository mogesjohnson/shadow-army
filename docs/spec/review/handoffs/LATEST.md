# Handoff: session 17, fork1 (Fork 1), to the next fork (2026-10-29)

Written by `fork1` at its save point, with context at about 118k once both of its agents had reported. The spec is unchanged (v0.20, `4f481fc`). Read this after the runbook's section 1. The previous handoff (Fork 0's) is `git show 03a7e8b:docs/spec/review/handoffs/LATEST.md`.

## The range

- Start `f3f3c22`. End: the commit that last changed this file. `git diff f3f3c22..HEAD --stat` shows it all.
- New: `raw/M1-R4-V5.md`, `raw/M1-R4-V6.md` (reports); `drafts/r4/verdicts-fork1.json`, `drafts/r4/verdicts-fork1-b.json`; `ledger.md` (8 rows set). `03a7e8b` (Fork 0, after its handoff) records the owner's answers at the end of the old LATEST.md and in `probes.md`.

## What is finished

- **M1-R4-V5** (Opus, high): R-M1-237, 238 and 239 **CONFIRMED P2**, with paste-ready OLD/NEW text in the report.
  - 237: PO-3 238 names what the process and thread DACLs grant (the owner's user and SYSTEM get the process's `PROCESS_QUERY_LIMITED_INFORMATION`, `SYNCHRONIZE` and `PROCESS_TERMINATE`, and the thread's query and `SYNCHRONIZE`). It also leaves the token's default DACL alone: that reverses R-M1-141's technical choice, which was the orchestrator's and not the owner's, so it needs no card. 240, PO-19 456 and M1-AC2 1062 change with it.
  - 238: the Windows guardian reads one JSON line on stdin (with a 32-byte nonce) and connects back over loopback the way PO-18's does (PO-19 455, PO-2 228, M1-AC20 1156).
  - 239: a new PO-19 folders operation makes and checks PO-5's Windows folders, with the owner set to the owner's user. A folder owned by Administrators fails. With the script refused, nothing is written (PO-5 253 and 254, M1-AC2 1062).
- **M1-R4-V6** (Sonnet, medium): R-M1-240, 241 and 242 **CONFIRMED P2**.
  - 240: PO-16 407 runs the sweep as a one-shot Node.js process, and PO-17 417 lets that process run.
  - 241: under `sa live`, the trust card goes to the terminal (ARM-7 738 and 740, M1-AC13). Fold it into R-M1-207's repair.
  - 242: PO-5 251 gives each log a UUID the post office makes, `--session-id` for claude, and the post office's log a UTC-time-and-pid name. Use the verifier's NEW, not the packet's.
- The owner's answers are in the ledger: R-F-166 is D-36 (a) and R-M1-235 is D-37 (c).
- **Round 4's verifying is done.** Every P0 to P2 finding of round 4 has a verdict, except D-37 (R-M1-235, waiting for P-16) and R-M1-236 (NEEDS-PROBE, P-17). Fork3 runs both probes on the owner's go. Neither F nor M1 is clean in round 4.

## Next, in order

1. Measure context.
2. **v0.21**, in a fresh session (flow rule 9), drafted in the main session as OLD/NEW blocks (flow rule 5). It is big, about 45 ledger rows, so draft it in batches (`drafts/v021/repairs1.txt`, `repairs2.txt`, ...), apply each with `node tools/pairs.mjs` then `node tools/rep.mjs docs/spec/v2.md <pairs.json>`, and commit and push after each. Hand the rest on at the save point if it doesn't fit. Its rows: `grep -nE 'fix pending|to apply unverified|repair pending' ledger.md`. Sources:
   - `raw/M1-R4-V1.md` and `V1b.md` (R-M1-206 to 211; V1b's text for 206), `V2.md` (212 to 218), `V3.md` (221, 222), `V4.md` (235's HOST-2 119 and M1-AC1 1049 text, now), `V5.md` (237 to 239) and `V6.md` (240 to 242);
   - `raw/F-R4-V1.md` (157, 158, 166 under D-36 (a), 167), `raw/F-R4-V2.md` (168, 169), `raw/V18-FC1.md` (R-M1-224 to 234);
   - the unverified P3s: R-M1-219, 223, 243 to 245 and R-F-159 to 165, from their raw reports;
   - D-34's **Not tested:** notes (P-5, P-6, VER-10's Mac run; places in `raw/V18-FC1.md`).
   - Then run both checkers (`tools/trace-v2.mjs docs/spec/v2.md`, and `tools/check-appendix-c.mjs` if Appendix C changed), freeze the snapshot, and run fix check V21-FC1.
3. Once fork3 reports P-16 and P-17: settle D-37 (expected (b)) and R-M1-236 from `raw/M1-R4-V4.md`'s drafts for each outcome. If v0.21 is already out, they go into v0.22.

## Where the fixes touch each other

- R-M1-212 (the start time per OS): V5's note says Windows reads the creation time from `GetProcessTimes` on a `PROCESS_QUERY_LIMITED_INFORMATION` handle, in 100 ns FILETIME units, compared exactly. Node.js has no API for it, so PO-7's once-a-second watch needs a native path. Check whether that path adds a dependency or a new binary to the release package (WSP-10, PO-13). If it does, it may need a card.
- R-M1-207 and R-M1-241: one repair (HOST-2, PO-7, M1-AC8, plus ARM-7's terminal trust card and M1-AC13's `sa live` case).
- R-F-168's last sentence: re-check it against R-M1-206's fix.
- R-M1-237 and R-M1-239 both edit PO-19 456 and M1-AC2 1062. Merge them into one block each.

## The owner's open questions

- D-37: waiting for P-16 (fork3). R-M1-236: waiting for P-17 (fork3).
- Unchanged: the haiku model mismatch, alpha Q4 deferred until A6, and D-35 only if R-M1-221's reading is rejected.

## What the files don't say

- PR #85: Codex still has to review head `428295b`. PR #81 is fork2's (Codex's five P2s on the CI budget watchdog).
- Save a subagent's report from `~/.claude/projects/C--Users-johns-projects-AIConnections/<session id>/subagents/agent-<agent id>.jsonl` with `tools/save-report.mjs`.
- Fork0 (the session "Second brain ⑂") relays the owner's answers to the forks by message.
