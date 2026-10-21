# Spec 2.0 review: state

Read this first, then [`spec2.0_review_flow.md`](spec2.0_review_flow.md). Update it after every pass.

Last updated: 2026-10-20, end of session 5. The spec is v0.12 (`2493a82`). Round 2 of F and M1 is reviewed and verified, and neither is clean; its confirmed repairs, and the owner's answers to D-7, D-11, D-22 and D-23, are the ledger rows marked "repair pending (v0.13)". No agent is running.

**Session 5 (2026-10-20), ended.**
- Five drafters ran together (`drafts/answers/PROMPTS.md`, reports `raw/D-3-merge-draft.md`, `D-4-draft.md`, `D-5-draft.md`, `D-8-16-17-draft.md`, `D-9-10-19-draft.md`; 130k to 240k tokens each). Their 65 blocks applied with no overlap; `drafts/answers/ids.json` numbered the new IDs (PO-9 to PO-21, ARM-7, M1-AC13 to M1-AC22, M3-AC14, M6-AC9), and `d4-ids.txt` pointed Appendix D at them.
- **Spec v0.11** (`af97372`, snapshot `v2@af97372.md`): D-3, D-4, D-5, D-8, D-9, D-10, D-16, D-17 and D-19 applied. Trace 0 problems (115 requirements, 73 ACs); Appendix C 0 problems.
- The drafters raised R-F-89 to R-F-93 and R-M1-89 to R-M1-107; seven are fixed in v0.11. Two P1s: R-M1-89 (`claude -p` connects a repository's `.mcp.json` servers and runs its hooks with no trust dialog) and R-M1-92 (a `claude --worktree` worktree nested in `.claude/worktrees/` sits inside the outer army's guard under D-17's B).
- Verified: ANS-V1 and ANS-V2 (`raw/ANS-V1.md`, `ANS-V2.md`): both P1s are big, new decisions, **D-22** (R-M1-89, a repository's `.mcp.json` servers in claude soldiers) and **D-23** (R-M1-92, with R-M1-108 folded in: the repository's other working trees and the guard), cards sent 2026-10-20 (decisions doc rev 40 to 48), both recommended A. Technical choices by the orchestrator: R-M1-96 (c), the Windows C# as a CI-built DLL; R-M1-99 (b), signing, notarization and the live Mac run to M6; R-M1-112 (a), ARM-7's record keyed by repository.
- Fix check ANS-FC1 (`raw/ANS-FC1.md`; cut off by the usage limit once and resumed): eight answers DONE, D-19's fix NOT FIXED (a repository's settings `env` overrides the variable; repaired with R-M1-106 through `--settings`), ten of eleven findings FIXED; follow-ups R-F-94 to R-F-96 and R-M1-108 to R-M1-113. ADR-0012 narrowed for D-9 (R-M1-109, `6808ab3`).
- **Round 2 on v0.11:** F's consistency auditor (R-F-97 to R-F-112) and both F verifiers are done (`raw/F-r2-verify-V1.md`, `V2.md`): of R-F-69 to R-F-85 and R-F-97 to R-F-112, 24 confirmed, 2 refuted (R-F-69, R-F-108), 3 duplicates, and technical choices R-F-73 (c), R-F-74 (b), R-F-79 (a), R-F-80 (a, unit by unit). So F's round 2 is not clean. M1's test author (R-M1-114 to R-M1-139) and vendor-fact checker (R-M1-140 to R-M1-150) are done; their verifiers M1-R2-V1 to V3 are running.
- **Spec v0.12** (`2493a82`, snapshot `v2@2493a82.md`): the repairs from ANS-V1, ANS-V2 and ANS-FC1 (`drafts/v012/repairs1.txt`, 52 blocks by a drafter, `raw/v012-repairs-draft.md`; `repairs1b.txt`, 2 by the orchestrator for the drafter's R-M1-151 and R-M1-155). Trace 0 problems (115 requirements, 75 ACs); Appendix C 0 problems. The drafter's other follow-ups: R-M1-152 (NEEDS-PROBE in S7), R-M1-153 (technical, per working tree, done), R-M1-154 (duplicate of R-F-99).
- The usage limit cut off M1-R2-V1 to V3 once; all three were resumed in this session.
- The owner logged in with another account during the session, and the decisions doc then refused reads ("not shared"); D-7, D-11, D-22 and D-23's answers can't be read until the doc is shared with that account or the owner logs back in. The owner then pasted the doc's answer table in chat: **D-7 A**, **D-22 A**, **D-23 A**, and **D-11 "Other"** with the note "do as claude has", read as option A, since Claude Code keeps its own background work running through `/clear`, `/resume` and `/branch` (evidence in `decisions.md`, D-11; the owner may correct the reading). The table's other answers match what `decisions.md` already had (D-1, D-3 to D-5, D-8 to D-10, D-16, D-17, D-19 to D-21). Recorded in `decisions.md` and as "repair pending (v0.13)" on R-F-3, R-M1-20, R-M1-89, R-M1-92 and R-M1-108.
- M1-R2-V1 (`raw/M1-r2-verify-V1.md`) and M1-R2-V3 (`raw/M1-r2-verify-V3.md`) are recorded: R-M1-114 to R-M1-126 and R-M1-140 to R-M1-150 have verdicts. Technical choices by the orchestrator, within the owner's answers (the owner may overrule): R-M1-140 (b), the Windows guardian gets PO-3's DACL and the parent-spoofing escape is stated beside WMI's (D-3 B); R-M1-141 (a), the post office's threads and token default DACL hardened too (D-9 A). R-F-109 and R-M1-119 raised to P2 together.
- **The owner asked to stop the agents** (2026-10-20). M1-R2-V2 (R-M1-127 to R-M1-139), already running, finished and is recorded (`raw/M1-r2-verify-V2.md`: 7 confirmed, 4 refuted, 2 duplicates of R-F-76). Round 2 is fully verified for F and M1, and neither is clean. No agent is running, and none starts until the owner says so.
- The owner's token rules (2026-10-20, `spec2.0_review_flow.md` section 4, rules 4 to 9) replace the old pace. Next, in a fresh session: v0.13, then one fix check of v0.12 and v0.13 together, then round 3 (see "Next, in order").

## Where things are

- **Branch** `claude/63-ultimate-spec-review`, PR #77, "#63 Ultimate Spec Review" (draft), stacked on #76 (`claude/63-spec-ideas`, spec v0.6 at `be9deb0`).
- **The spec is v0.10** (`e7c33b4`, 2026-10-17): M1-FC3's follow-ups (`drafts/M1-r1-fc/fc3.txt`), on v0.9 (`b6f4315`: the repairs for M1-FC1's and M1-FC2's findings, `fc1.txt`, with D-18 amended for R-M1-81, and `fc2.txt`), on v0.8 (`1580e87`: M1's round-1 fixes, with D-2 and D-12 to D-15). `node docs/spec/review/tools/trace-v2.mjs docs/spec/v2.md <previous snapshot>` gives 0 problems (101 requirements, 61 ACs), and `tools/check-appendix-c.mjs` gives 0 problems. The trace script checks Appendix B's rules 1 to 6 and 8 (forward citations marked →Mx) and, given a previous version, that no ID is gone.
- **Snapshots** (in the main checkout's `.shadow/v2-tools/review/snapshots/`): `v2@be9deb0.md`, which round 1 reviewed; `v2@1580e87.md`, v0.8, which D-7's drafters read; `v2@b6f4315.md`, v0.9, which M1-FC3 checked and F's round-2 test author read; `v2@e7c33b4.md`, v0.10, which D-7's judge read and the queued reviewers' prompts name. Rebuild one with `git show <sha>:docs/spec/v2.md` from Git Bash (PowerShell's pipe re-encodes it).
- **No agent is running.** Queued, with prompts in `decisions.md`, "Prompts to rerun": M1's round-2 test author and vendor-fact checker, and F's round-2 consistency auditor. All three name v0.10. If the owner's answers land first (see "Next"), point them at the new snapshot and its line ranges.
- **Status board with Codex** (from 2026-10-16): `C:\Users\johns\projects\AIConnections\codex-claude-status.md`, local and excluded from git. Claude ticks the Review column at each step and Codex the Build column. The order: the review leads, Codex builds a milestone only once its spec is marked converged, and then Codex builds milestone N while the review does N+1.
- **Pace** (the owner, 2026-10-20, replacing 2026-10-17's "more than two in a fresh window"): two or three agents at a time, never five; only P0 to P2 findings are verified; small repairs are drafted in the main session; Sonnet runs mechanical agents at a set effort (drafters and prototype builders `high`, simple verifiers `medium`, never `xhigh` or `max`); a fresh main session after each big pass (`spec2.0_review_flow.md` section 4, rules 4 to 9). Earlier: drop back to two once the owner says the weekly limit is close. Claude can't see the limits. On 2026-10-17 the owner also asked to stop after the last pass, so session 4 ended there.
- **Done in session 4** (2026-10-17):
  - M1's repairs, with no agent: `fc1.txt` amended for R-M1-81 (D-18's two blocks, plus the snapshot line, M1-AC4 and §5.1 F), `fc2.txt` written for R-M1-70 and R-M1-72 to R-M1-80, both dry-run and applied as v0.9 (`b6f4315`), 44 replacements, both checkers at 0 problems. Where a repair went beyond the checker's text, the ledger row says how: R-M1-70 (a moved HEAD in a soldier's snapshot is a write there; ARM-6's trusted records), R-M1-75 (a reset read from the `/clear`, `/reset` or `/new` message), R-M1-76 (`~/.shadow-army/snapshots/`), R-M1-78 (the next message waits for the guard).
  - Fix check M1-FC3: both P1 repairs FIXED (R-M1-70, R-M1-73); its six follow-ups, R-M1-83 to R-M1-88, repaired in v0.10 (`fc3.txt`, `e7c33b4`).
  - D-7's option C drafted (`raw/D-7-option-C.md`), then judged with A (`raw/D-7-judge.md`): A wins, technical. The merge plan, the parts of C to take, and the card are in `decisions.md`, D-7. The judge raised R-F-86 to R-F-88 against A, to fix in the merge.
  - F's round 2: the test author (`raw/F-r2-test-author.md`, on v0.9) raised R-F-68 to R-F-85 (1 P1, 15 P2, 2 P3).
  - The decisions doc: the owner's answers recorded (below); D-7's card added, with an unpicked answer; a comment on D-11's row asks what "Other" means.
  - The usage limit cut off D-7's judge and F's test author once (it reset at 15:10); both were resumed in the same session and reported.
- **Done in session 3** (2026-10-16): the D-3 judge (B, big; R-M1-59 to R-M1-61; probes P-5 to P-10); M1-FC1 and M1-FC2 (all twelve P1 fixes passed; R-M1-62 to R-M1-82); D-7's option A drafted; D-17 to D-19 opened; the cards went to the owner.
- **Saving a report:** a background agent's transcript is `~/.claude/projects/C--Users-johns-projects-AIConnections/<session>/subagents/agent-<id>.jsonl` (the tasks folder's `.output` files stay empty). Copy it to `<scratch>/tasks/<id>.output`, then run `tools/extract.mjs <id> raw/<name>.md "<header>"` with `TASKS_DIR=<scratch>/tasks`.
- **Shell habits on the owner's machine:** Git Bash collapses `\\` in a command, even inside a quoted heredoc, and a heredoc of long table rows can fail to parse. Write scripts and ledger rows with the Write tool, then append or insert them with a small node script. Edit the spec through OLD/NEW blocks (`tools/pairs.mjs`, then `tools/rep.mjs`, which refuses any old text that doesn't occur exactly once).
- **`main`** is spec v0.5 (`ab04992`). #76 (v0.6) is a draft, with CI green at `be9deb0` and no Codex review yet.
- **M1 (#75)** is Codex's draft, paused at `04ab953` until the spec's M1 text converges. Read it for reality checks only; on the owner's machine it is `../AIConnections-m1`.

| Unit | State |
|---|---|
| F | Round 1 closed (v0.7; F-FC1 and F-FC2 passed). Round 2 on v0.11 (test author, consistency auditor) verified: not clean; repairs pending for v0.13, with R-F-58 and D-7's merge. Then round 3, a second clean round and two sign-offs. |
| M1 | Round 1 closed (v0.8 to v0.10, fix-checked). The owner's answers applied in v0.11 (ANS-FC1), repaired in v0.12. Round 2 on v0.11 (test author, vendor-fact checker) verified: not clean; repairs pending for v0.13, with D-11, D-22 and D-23. R-M1-71 is parked for M2. |
| C (M1's rows) | Not started. |
| M2–M6, C, X1–X5 | Not started. |

| Decision | State |
|---|---|
| D-1 the spec's name and revision | Answered **A** on 2026-10-16. Applied last, with the final rename. |
| D-2 the lease | Decided 2026-10-15 (A, technical); applied in v0.8. |
| D-3 Q8, the process helper | Answered **B** on 2026-10-17: prebuilt and checksummed in CI. Applied in v0.11. |
| D-4 a threat model | Answered **A** on 2026-10-17: an informative appendix. Applied in v0.11 (Appendix D). |
| D-5 limits | Answered **B** on 2026-10-17: caps on queues, sends and sizes now; logs after 2.0. Applied in v0.11. |
| D-6 G7's "traced in CI" | Decided (a); applied in v0.7. |
| D-7 how the read-only rule reaches every soldier | Judged 2026-10-17: **A**, technical, with parts of C (`raw/D-7-judge.md`). Its two big parts answered **A** on 2026-10-20: only a message of the kind build makes a soldier write, the owner's own included; NEW-2's residual accepted. Next: the merge in v0.13 as `decisions.md` D-7 says (with R-F-58 and R-F-86 to R-F-88), then the fix check. |
| D-8 the live checks' budget | Answered **B** on 2026-10-17: $2 of reported cost plus a token cap. Applied in v0.11. |
| D-9 how far the Monarch's secret resists a soldier | Answered **A** on 2026-10-17: harden where the system allows, accept the rest. Applied in v0.11. |
| D-10 trusting the folder's own files | Answered **A** on 2026-10-17: a trust card before any soldier starts. Applied in v0.11. |
| D-11 `/clear`, `/resume` and `/branch` | **Other**, with the note "do as claude has" (2026-10-20), read as **A**: none of the three ends the army, as Claude Code keeps its own background work. To apply in v0.13 (PO-7, SES-1, M1-AC8); the owner may correct the reading. |
| D-12 to D-15 | Technical, chosen 2026-10-15; applied in v0.8. |
| D-16 what a supervised claude soldier runs without the owner | Answered **A** on 2026-10-17, over the recommended B: keep v1's plan mode, where claude's classifier approves commands outside the read-only set. Applied in v0.11. |
| D-17 one army per repository or per working tree | Answered **B** on 2026-10-17: one per working tree. Applied in v0.11. |
| D-18 how a cut-short turn is checked before M3 | Technical, (b), amended for R-M1-81; applied in v0.9. |
| D-19 soldiers and the owner's auto memory | Answered **A** on 2026-10-17: off for soldiers. Applied in v0.11, repaired in v0.12 (R-M1-106). |
| D-20 macOS in 2.0 | Answered **A** on 2026-10-16: macOS stays. |
| D-21 one clean round instead of two | Answered **A** on 2026-10-16: keep every recheck. |
| D-22 a repository's `.mcp.json` servers in claude soldiers | Answered **A** on 2026-10-20: ARM-7's trust card also covers the folder's `.mcp.json`. To apply in v0.13. |
| D-23 the repository's other working trees and the guard | Answered **A** on 2026-10-20, as widened: the guard skips them, nested files and metadata added or removed. To apply in v0.13. |
| Values set in the fix pass | A summary line is at most 120 characters; the parity task reads `README.md` and `package.json`, with live at most 1.05 times headless and two repeats on a token failure; a background task's follow-up wait is 30 s; a crashed channel restarts after 1 s, 5 s and 30 s. Recorded in `decisions.md`; the owner may overrule any. |

## Next, in order

Follow the owner's token rules (`spec2.0_review_flow.md` sections 3 and 4): two or three agents at a time, never five; verify only P0 to P2; small repairs drafted in the main session; Sonnet for mechanical agents, at the effort rule 6 sets for each; tight packets; a fresh session after each big pass. Commit and push after every result that changes a doc. `NEXT-SESSION.md` has the setup and the prompt.

1. **v0.13** from every ledger row marked "repair pending (v0.13)", the owner's answers included: D-7's merge (with R-F-58 and R-F-86 to R-F-88), D-11 as A, D-22 A and D-23 A. Both checkers.
2. **One fix check** (Opus) of v0.12 and v0.13 together.
3. **Round 3 for F and M1** on v0.13's snapshot; then their second clean rounds and sign-offs.
4. **C's rows that M1 touches.** These need the owner's `the-future` folder.
5. **The first batch to Codex**, through the owner, with "For Codex" below.

## For Codex, when M1's batch goes

- The lease counts only the post office's own running time, in once-a-second checks of at most 5 s each, and a renewal never expires it (`lease.ts` 23-49, `server.ts` 73). The mod keeps renewing after a failed renewal (`register.ts` 81-92 and 121) (D-2).
- A failed log write never closes the post office (`postOffice.ts` 71, 79-83 and 226-227) (R-M1-11).
- Code a child process runs lives in a file of its own: the Linux and macOS guardians and the Windows supervisor's C# leave their strings (`processTree.ts` 110, 336, 419-421 and 504-506) (R-M1-50, R-M1-61).
- A restart that opens a fresh session gets a new snapshot (`postOffice.ts` 131 and 142 reuse it) (WSP-11, R-M1-77).

## Waiting on the owner

- Every card in the doc "Spec 2.0 Review: Your Decisions" (https://claude.ai/code/artifact/783b080a-cade-4038-9c8a-6a6738ccb844) is answered, D-22 and D-23 included (2026-10-20). The doc doesn't open from the account the owner now uses, so new cards go to the owner in chat, or in the doc once they log back in.
- Whether "do as claude has" for D-11 means A (the reading recorded) or C.
- Probes (`probes.md`), each needing the owner's go:
  - P-1 and P-2 finish spike S6;
  - P-3: does an installed mod load in a claude soldier;
  - P-4: does each CLI compact after a context overflow (the costliest);
  - P-5, P-6 and P-8 need a Mac (D-3), and P-7 needs Smart App Control on Windows;
  - P-9 mattered only for D-3's C, which the owner didn't pick; P-10 is an offline prototype;
  - P-11 to P-13 are short CLI sessions; P-12 shows how D-19's answer is applied.
- A warning when the weekly limit is close.

## Measured cost of an agent

- Verifiers on 2026-10-14: F-V1 243k tokens (68 tool calls, 16 min), F-V2 231k (58, 17 min), F-V3 171k (48, 12.5 min), F-V4 254k (36, 14 min), F-V5 161k (72, 10 min), F-V6 236k. A verifier averages about 220k tokens.
- Drafters: D-3's B and C drafters 286k and 332k.
- On 2026-10-16: the D-3 judge 217k (48, 16 min); M1-FC1 306k (72, 22 min); M1-FC2 410k and D-7's option A drafter 265k, both counted at the end of a resumed run.
- On 2026-10-17: M1-FC3 202k (60, 18 min); D-7's option C drafter 391k (76, 32 min); F's round-2 test author 238k and D-7's judge 232k, both counted at the end of a resumed run. Two agents running together hit the five-hour limit once, in the afternoon.

## Only on the owner's Windows machine

- `.shadow/v2-tools/STATE.md`: v2's overall state (Codex, M1, S6, the canvases). It is local and never committed.
- `C:\Users\johns\projects\the-future\`: the owner's 118 idea files. Their code is leaked Claude Code source, so they never leave that machine or enter a brief.
- WSL Ubuntu, where the D-3 prototype ran.
- The live CLIs and the owner's logins, needed for any probe.
