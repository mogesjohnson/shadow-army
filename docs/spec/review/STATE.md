# Spec 2.0 review: state

Read this first, then [`spec2.0_review_flow.md`](spec2.0_review_flow.md). Update it after every pass.

**Session 10, Fork 1 (2026-10-26 and 27).** **v0.19** (`65d0b43`, snapshot `v2@65d0b43.md`) applies the owner's D-30 A, D-31 A (with R-F-140 b), D-32 A and D-33 A; both checkers 0 problems. No agent was started. **v0.18** (`f48b957`, snapshot `v2@f48b957.md`; `drafts/v018/repairs.txt`, 26 blocks) applies every V17-FC1 repair (R-M1-193 to R-M1-205, finishing R-M1-182, 183, 186 and 187). Trace 0 problems (119 requirements, 81 ACs); Appendix C 0 problems. The session stopped at the save point because it couldn't read `/context`; next steps are in [`handoffs/LATEST.md`](handoffs/LATEST.md): round 4's verifiers, the owed implementer (M1) and red team (F), then V18-FC1. **The owner answered D-30 to D-33, all A** (2026-10-26, in chat); recorded in `decisions.md`, to apply first in v0.19.

**Session 9, Fork 1 (2026-10-26).** No agent was started. The session stopped at the save point near 120k; [`handoffs/LATEST.md`](handoffs/LATEST.md) has the next steps.
- V17-FC1's verdicts are in the ledger (`03145f2`): R-M1-182 and R-M1-183 NOT FIXED; R-M1-186 and R-M1-187 wrong as applied; D-26 to D-29 and the rest FIXED. Its new findings are **R-M1-193 to R-M1-205** (four P2), all repair pending (v0.18).
- Round 4's findings have rows (`3672297`): M1 chaos **R-M1-206 to R-M1-219** (3 P1, 10 P2, 1 P3), F consistency **R-F-157 to R-F-165** (2 P2, 7 P3). The P1 and P2 rows wait for verifiers.
- Next: draft v0.18 in the main session, then round 4's verifiers, then the owed implementer (M1) and red team (F). D-30 to D-33 are still with the owner.

**Session 8, Fork 3 (2026-10-23).**
- The owner answered **D-26 A**, **D-27 B** ("and list for future version"), **D-28 A**, **D-29 A** in the doc "Spec 2.0 Review: Decisions D-26 to D-29" (rev 41). Recorded in `decisions.md`.
- V16-FC1's verdicts marked in the ledger; its new findings are **R-M1-182 to R-M1-192** (N1 P1, N2 and N3 P2, N4 to N11 P3).
- **v0.17** (`785cc17`, snapshot `v2@785cc17.md`; `drafts/v017/repairs.txt`, 33 blocks): the four answers and every V16-FC1 repair, R-M1-176's guard half and R-M1-171 included. Trace 0 problems (119 requirements, 81 ACs); Appendix C 0 problems. Technical choices by the orchestrator: `NoDefaultCurrentDirectoryInExePath=1` for the CLI's `cmd.exe` (R-M1-182), host floor 2.1.294 (R-M1-187), `taskkill /t /f` on Windows (R-M1-186).
- Reported and saved, not yet in the ledger: **V17-FC1** (`raw/V17-FC1.md`: R-M1-182 and R-M1-183 NOT FIXED, D-26 to D-29 FIXED, 13 new, 4 of them P2), round 4's **M1 chaos engineer** (`raw/M1-r4-chaos.md`: 3 P1, 10 P2) and **F consistency auditor** (`raw/F-r4-consistency.md`: 2 P2, 7 P3). Owed: M1 implementer and F red team. Ended at the save point (the strict 120k/150k limit, `RUNBOOK.md` section 3); next steps in `handoffs/LATEST.md`.

**Session 8, Fork 2 (2026-10-23).**
- M1's round-3 confirmed findings repaired (`drafts/v016/repairs4.txt`, `26d6db5`): R-M1-168 and R-M1-169 (P1), R-M1-172, R-M1-173's technical half, R-M1-174, R-M1-176 (P2), R-M1-171 and R-M1-177 (P3). Values set: Node.js 22, git 2.34 (Ubuntu 22.04 LTS's), host Claude Code 2.1.286; advisories of moderate and above fail CI.
- **F's round 3 verified** (F-R3-V1 to V3, `raw/F-r3-verify-V1.md` to `V3.md`): confirmed R-F-137, 139, 143, 147, 148 (the list), 149, 151 (P2) and R-F-152, 154, 155 (P3, were P2); refuted R-F-138, 141, 142; decisions R-F-148's re-show (**D-32**), R-F-150 (**D-33**), R-F-153 (**D-30**), R-F-156 (**D-31**, with R-F-140). All repaired (`repairs5.txt` to `repairs7.txt`). **F's round 3 is not clean.**
- **v0.16** (`bfa5d6f`, snapshot `v2@bfa5d6f.md`): trace 0 problems (119 requirements, 81 ACs); Appendix C 0 problems.
- Fix check **V16-FC1** (`raw/V16-FC1.md`): every repair FIXED but R-M1-176's guard half; R-M1-171 (P3) wrong; new N1 (P1, Windows `cmd.exe` searches the current folder), N2, N3 (P2), N4 to N11 (P3). Next: their ledger rows and v0.17 (`handoffs/LATEST.md`).
- Round 3 counted: **neither unit is clean** (M1 has confirmed P1s, F confirmed P2s), so both streaks stay at 0. Round 4 needs new lenses (flow section 6): chaos and consistency, with an implementer or red team.

**Session 8 (2026-10-23, Fork 1), ended at the 150k save point.** The handoff is [`handoffs/LATEST.md`](handoffs/LATEST.md); read it first.
- The owner pasted D-24 **B** and D-25 **A**; applied as **v0.15** (`8e45853`, snapshot `v2@8e45853.md`; trace 0 problems, 119 requirements, 81 ACs; Appendix C 0 problems).
- Fix check **V14-FC1**: every v0.14 repair FIXED; its follow-ups R-F-132 to R-F-136 and R-M1-164 to R-M1-166 repaired; R-M1-163 is card D-26.
- **Round 3**: all five reviewers done. M1's findings verified (M1-R3-V1 to V3): R-M1-161, R-M1-168, R-M1-169 confirmed P1, so M1's round 3 is not clean; R-M1-161 repaired. D-27, D-28 and D-29 opened; R-M1-175, 178, 179, 180 parked. F's 17 P2s (R-F-137 to R-F-143, R-F-147 to R-F-156) wait for verifiers F-R3-V1 to V3, packets built.
- Next: M1's other confirmed repairs, F's verifiers, v0.16 and fix check V16-FC1 (LATEST.md has the steps). Cards D-26 to D-29 wait for the owner, sent in chat.

Last updated: 2026-10-21, end of session 7. The spec is v0.14 (`02d5f84`): fix check V13-FC1's repairs, on v0.13 (`ecf1e80`: round 2's repairs and the owner's answers to D-7, D-11, D-22 and D-23). Two new cards, D-24 and D-25, wait for the owner. No agent is running. Next, in a fresh session: fix check V14-FC1 and round 3 (`drafts/r3/PROMPTS.md`).

**Session 7 (2026-10-21), ended.**
- Session 6's run of V13-FC1 was cut off by the usage limit and left no report, so this session reran it (Opus, high; prompt in `drafts/v013/PROMPTS.md`; 324k tokens, 63 tool calls, 14 minutes; `raw/V13-FC1.md`).
- **V13-FC1's verdict:** every v0.12 and v0.13 repair FIXED, the three P1s (R-F-3, R-M1-89, R-M1-92) and D-19's repair included, and the owner's four answers do what the owner chose, except R-M1-108 NOT FIXED: ARM-6 and WSP-11 still hashed every other working tree's metadata (R-M1-156). Of the packet's new findings: R-F-120 CONFIRMED P2 (technical, option b), R-F-114 CONFIRMED as P3, R-F-117 a DECISION, big. New: R-F-126 (P2, a pending revert lost when the post office ends), R-M1-156 (P2), and eight P3s (R-F-127 to R-F-131, R-M1-157 to R-M1-159). Two P3s applied in v0.13 were off (R-F-125, R-M1-147) and R-F-110's Snapshot entry cited the wrong base; all re-fixed.
- The orchestrator checked N1 and N2 against v0.13's text and the auto-mode vendor fact (R-M1-159) against the vendor's page, then wrote **v0.14** (`02d5f84`, snapshot `v2@02d5f84.md`; `drafts/v014/repairs.txt`, 25 blocks). Trace 0 problems (119 requirements, 81 ACs); Appendix C 0 problems. The ledger marks 83 v0.12 and v0.13 rows "Fix-checked: FIXED (V13-FC1)" and four P2 rows of v0.14 "To fix-check".
- **New cards** in a new doc the owner's current account owns, "Spec 2.0 Review: New Decisions" (https://claude.ai/artifact/KpmKMUugoKwc1W4F65C931): **D-24** (R-F-117, an owner's edit in a soldier's worktree before a turn the CLI starts by itself; recommended B, a y/n card) and **D-25** (R-M1-160, whether a reply to a brief sent before `/clear` wakes the Monarch; recommended A, wake, as Claude Code does). Records in `decisions.md`.
- Set up for the next session: the packet `batches/V14-FC1.md` and every prompt for V14-FC1 and round 3 in `drafts/r3/PROMPTS.md`.

**Session 6 (2026-10-20), ended.**
- **v0.13** (`ecf1e80`, snapshot `v2@ecf1e80.md`): 182 blocks in `drafts/v013/`. D-7's merge was drafted by a Sonnet drafter at effort high (`raw/D-7-merge-draft.md`, 54 blocks, 350k tokens) and reconciled by the orchestrator: ARM-8, WSP-12 and CH-11 are new, with M6-AC12 to M6-AC17. The orchestrator wrote the other 128 blocks: D-11 (A: `/clear`, `/resume` and `/branch` keep the army; `/logout` and any other `session.end` end it), D-22 (A: ARM-7 covers `.mcp.json`), D-23 (A: another working tree is not this army's checkout; residual 13), HOST-16 (new, M3), and every confirmed round-2 repair. Trace 0 problems (119 requirements, 81 ACs); Appendix C 0 problems.
- 70 ledger rows say "fixed (v0.13)"; the drafter's 13 findings are R-F-113 to R-F-125 (R-F-113, 115, 116, 118 parked for M6; R-F-119, 124 for M5; R-F-122 probe P-15; R-F-123 a duplicate of R-M1-71). Probes P-14 (claude's refusal frame) and P-15 (CH-11's mode switches) added.
- Fix check **V13-FC1** (Opus, high; packet `batches/V13-FC1.md`) checks v0.12 and v0.13 together and verifies R-F-114, R-F-117 and R-F-120.


**Session 5 (2026-10-20), ended.** (Below, "the spec" means the version of that day.)
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
- **The spec is v0.14** (`02d5f84`, 2026-10-21; snapshot `v2@02d5f84.md`), V13-FC1's repairs on v0.13 (`ecf1e80`, 2026-10-20; snapshot `v2@ecf1e80.md`). Before them, v0.10 (`e7c33b4`, 2026-10-17): M1-FC3's follow-ups (`drafts/M1-r1-fc/fc3.txt`), on v0.9 (`b6f4315`: the repairs for M1-FC1's and M1-FC2's findings, `fc1.txt`, with D-18 amended for R-M1-81, and `fc2.txt`), on v0.8 (`1580e87`: M1's round-1 fixes, with D-2 and D-12 to D-15). `node docs/spec/review/tools/trace-v2.mjs docs/spec/v2.md <previous snapshot>` gives 0 problems (101 requirements, 61 ACs), and `tools/check-appendix-c.mjs` gives 0 problems (on v0.13: 119 requirements, 81 ACs; Appendix C 118 rows). The trace script checks Appendix B's rules 1 to 6 and 8 (forward citations marked →Mx) and, given a previous version, that no ID is gone.
- **Snapshots** (in the main checkout's `.shadow/v2-tools/review/snapshots/`): `v2@be9deb0.md`, which round 1 reviewed; `v2@1580e87.md`, v0.8, which D-7's drafters read; `v2@b6f4315.md`, v0.9, which M1-FC3 checked and F's round-2 test author read; `v2@e7c33b4.md`, v0.10, which D-7's judge read; `v2@af97372.md`, v0.11, which round 2 reviewed; `v2@2493a82.md`, v0.12; `v2@ecf1e80.md`, v0.13, which V13-FC1 checked; `v2@02d5f84.md`, v0.14, which round 3 reviews. Rebuild one with `git show <sha>:docs/spec/v2.md` from Git Bash (PowerShell's pipe re-encodes it).
- **No agent is running.** Prompts that ran are in `decisions.md` ("Prompts to rerun"), `drafts/answers/PROMPTS.md` and `drafts/v013/PROMPTS.md`; the next five are in `drafts/r3/PROMPTS.md`.
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
| F | Round 1 closed (v0.7; F-FC1 and F-FC2 passed). Round 2 on v0.11 (test author, consistency auditor) verified: not clean; repaired in v0.13 with R-F-58 and D-7's merge, fix-checked by V13-FC1 (all FIXED), its follow-ups repaired in v0.14. Next: V14-FC1 and round 3 (implementer, owner's advocate), then a second clean round and two sign-offs. D-24 is open. |
| M1 | Round 1 closed (v0.8 to v0.10, fix-checked). The owner's answers applied in v0.11 (ANS-FC1), repaired in v0.12. Round 2 on v0.11 (test author, vendor-fact checker) verified: not clean; repaired in v0.13 with D-11, D-22 and D-23, fix-checked by V13-FC1 (all FIXED but R-M1-108's guard half), repaired in v0.14. Next: V14-FC1 and round 3 (red team, enterprise operator). D-25 is open. R-M1-71 is parked for M2. |
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
| D-7 how the read-only rule reaches every soldier | Judged 2026-10-17: **A**, technical, with parts of C. Its two big parts answered **A** on 2026-10-20. Applied in v0.13: ARM-5, ARM-8, WSP-12, CH-11, M6-AC12 to M6-AC17, residuals 11 and 12. To fix-check (V13-FC1). |
| D-8 the live checks' budget | Answered **B** on 2026-10-17: $2 of reported cost plus a token cap. Applied in v0.11. |
| D-9 how far the Monarch's secret resists a soldier | Answered **A** on 2026-10-17: harden where the system allows, accept the rest. Applied in v0.11. |
| D-10 trusting the folder's own files | Answered **A** on 2026-10-17: a trust card before any soldier starts. Applied in v0.11. |
| D-11 `/clear`, `/resume` and `/branch` | **Other**, with the note "do as claude has" (2026-10-20), read as **A**: none of the three ends the army. Applied in v0.13 (HOST-2, PO-7, SES-1, MSG-5, M1-AC1, M1-AC8); the owner may correct the reading. |
| D-12 to D-15 | Technical, chosen 2026-10-15; applied in v0.8. |
| D-16 what a supervised claude soldier runs without the owner | Answered **A** on 2026-10-17, over the recommended B: keep v1's plan mode, where claude's classifier approves commands outside the read-only set. Applied in v0.11. |
| D-17 one army per repository or per working tree | Answered **B** on 2026-10-17: one per working tree. Applied in v0.11. |
| D-18 how a cut-short turn is checked before M3 | Technical, (b), amended for R-M1-81; applied in v0.9. |
| D-19 soldiers and the owner's auto memory | Answered **A** on 2026-10-17: off for soldiers. Applied in v0.11, repaired in v0.12 (R-M1-106). |
| D-20 macOS in 2.0 | Answered **A** on 2026-10-16: macOS stays. |
| D-21 one clean round instead of two | Answered **A** on 2026-10-16: keep every recheck. |
| D-22 a repository's `.mcp.json` servers in claude soldiers | Answered **A** on 2026-10-20: ARM-7's trust card also covers the folder's `.mcp.json`. Applied in v0.13. |
| D-23 the repository's other working trees and the guard | Answered **A** on 2026-10-20, as widened: the guard skips them, nested files and metadata added or removed. Applied in v0.13 (WSP-10, ARM-6, WSP-11, residual 13); the guard's half completed in v0.14 (R-M1-156). |
| D-24 an owner's edit before a turn the CLI starts by itself (R-F-117) | Answered **B** on 2026-10-23 (pasted in chat): a y/n card before that turn's revert. Applied in v0.15 (WSP-12, HOST-2, M6-AC13, residual 11). To fix-check. |
| D-25 a reply to a brief from before `/clear` (R-M1-160) | Answered **A** on 2026-10-23 (pasted in chat): it wakes the Monarch, as Claude Code does. Applied in v0.15 (MSG-5, M3-AC2). To fix-check. |
| D-26 branches made with another working tree, and other armies' branches, from M6 (R-M1-163) | Card sent in chat 2026-10-23: A exempt them (recommended), B keep the card. |
| D-27 Windows Group Policy AllSigned or Restricted (R-M1-167) | Card sent in chat 2026-10-23: A sign with a certificate (a yearly cost), B a non-goal with a message (recommended for 2.0). |
| D-28 how the mod and the release package are installed together (R-M1-170) | Card sent in chat 2026-10-23: A the package as a directory marketplace (recommended), B the git install, C both. |
| D-29 where snapshots of the owner's code live (R-M1-173) | Card sent in chat 2026-10-23: A an owner's variable moves `snapshots/` (recommended), B a non-goal. |
| Values set in the fix pass | A summary line is at most 120 characters; the parity task reads `README.md` and `package.json`, with live at most 1.05 times headless and two repeats on a token failure; a background task's follow-up wait is 30 s; a crashed channel restarts after 1 s, 5 s and 30 s. Recorded in `decisions.md`; the owner may overrule any. |

## Next, in order

Follow the owner's token rules (`spec2.0_review_flow.md` sections 3 and 4): two or three agents at a time, never five; verify only P0 to P2; small repairs drafted in the main session; Sonnet for mechanical agents, at the effort rule 6 sets for each; tight packets; a fresh session after each big pass. Commit and push after every result that changes a doc. `NEXT-SESSION.md` has the setup and the prompt.

1. ~~v0.13~~ done (`ecf1e80`). ~~V13-FC1~~ done; its repairs are v0.14 (`02d5f84`).
2. **The owner's answers to D-24 and D-25**, if they have come (the new doc's table, or chat): apply them as v0.15, a few OLD/NEW blocks (D-24 B: a card in WSP-12, M6-AC13 and residual 11; D-25 A: MSG-5's last sentence), with both checkers. Otherwise go on, and apply them when they come.
3. **Fix check V14-FC1 and round 3 for F and M1**, five agents, at most three at a time, M1 first, all prompts in `drafts/r3/PROMPTS.md`: V14-FC1 (Opus, high), M1's red team and enterprise operator, then F's implementer and owner's advocate (each `spec-reviewer`, Opus, high). Then verify their P0 to P2 (Sonnet `medium` for simple ones, Opus `high` for P1, security and vendor, `xhigh` for a P0), repair as v0.15 or v0.16, and count: a round with no confirmed P0 to P2 is clean. Then their second clean rounds and sign-offs.
4. **C's rows that M1 touches.** These need the owner's `the-future` folder.
5. **The first batch to Codex**, through the owner, with "For Codex" below.

## For Codex, when M1's batch goes

- The lease counts only the post office's own running time, in once-a-second checks of at most 5 s each, and a renewal never expires it (`lease.ts` 23-49, `server.ts` 73). The mod keeps renewing after a failed renewal (`register.ts` 81-92 and 121) (D-2).
- A failed log write never closes the post office (`postOffice.ts` 71, 79-83 and 226-227) (R-M1-11).
- Code a child process runs lives in a file of its own: the Linux and macOS guardians and the Windows supervisor's C# leave their strings (`processTree.ts` 110, 336, 419-421 and 504-506) (R-M1-50, R-M1-61).
- A restart that opens a fresh session gets a new snapshot (`postOffice.ts` 131 and 142 reuse it) (WSP-11, R-M1-77).

## Waiting on the owner

- **D-26 to D-29**, in the doc "Spec 2.0 Review: Decisions D-26 to D-29" (https://claude.ai/artifact/5KpM8yYoanEJbhSKVQwEio, doc id `23051f0a-159c-41cd-a6a8-e4348c50f1ac`): read its answer table for the owner's answers. Recommended: D-26 A, D-27 B for 2.0, D-28 A, D-29 A.
- ~~D-30 to D-33~~ answered all A on 2026-10-26 (to apply in v0.19). Sent in chat 2026-10-23 (records in `decisions.md`): D-30 accepting residuals 7, 8 and 12 (recommended A, accept), D-31 soldiers in a new Claude Code process, with R-F-140 (recommended A, fresh, with R-F-140's b), D-32 the trust card's dialog after "Not now" (recommended A, only the owner's own uses), D-33 the shipped copy's autonomy (recommended A, all `supervised`).
- **D-24 and D-25**, in the new doc "Spec 2.0 Review: New Decisions" (https://claude.ai/artifact/KpmKMUugoKwc1W4F65C931, made 2026-10-21 under the owner's current account; doc id `986fc398-4395-4c2b-853e-c1895870b9ac`, body node `69857ecc-1142`, the answer table `m05fpwrw4rr.150`, answers are dropdowns of the enum `71ccf7f8-8a0f`; rev 4 when sent). The owner may also paste answers in chat.
- Every card in the old doc "Spec 2.0 Review: Your Decisions" (https://claude.ai/code/artifact/783b080a-cade-4038-9c8a-6a6738ccb844) is answered, D-22 and D-23 included (2026-10-20). It doesn't open from the owner's current account.
- Whether "do as claude has" for D-11 means A (the reading recorded) or C; D-25 asks the one detail of A that V13-FC1 flagged.
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
- On 2026-10-20 and 21: D-7's merge drafter (Sonnet, high) 350k (94, 16.5 min); fix check V13-FC1 324k (63, 14 min).

## Only on the owner's Windows machine

- `.shadow/v2-tools/STATE.md`: v2's overall state (Codex, M1, S6, the canvases). It is local and never committed.
- `C:\Users\johns\projects\the-future\`: the owner's 118 idea files. Their code is leaked Claude Code source, so they never leave that machine or enter a brief.
- WSL Ubuntu, where the D-3 prototype ran.
- The live CLIs and the owner's logins, needed for any probe.
