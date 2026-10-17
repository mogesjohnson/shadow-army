# Spec 2.0 review: state

Read this first, then [`spec2.0_review_flow.md`](spec2.0_review_flow.md). Update it after every pass.

Last updated: 2026-10-17, end of session 4. The spec is v0.10 (`e7c33b4`). M1's round 1 is closed: fixed (v0.8), fix-checked, follow-ups repaired (v0.9), the P1 repairs fix-checked (M1-FC3), and M1-FC3's follow-ups repaired (v0.10). F's round 2 has started: its test author raised R-F-68 to R-F-85, not yet verified. D-7 is judged: A, technical, with parts of C; its two big parts are on a card. The owner answered ten cards on 2026-10-17, and none is applied yet. No agent is running: the owner asked to stop after this pass.

## Where things are

- **Branch** `claude/63-ultimate-spec-review`, PR #77, "#63 Ultimate Spec Review" (draft), stacked on #76 (`claude/63-spec-ideas`, spec v0.6 at `be9deb0`).
- **The spec is v0.10** (`e7c33b4`, 2026-10-17): M1-FC3's follow-ups (`drafts/M1-r1-fc/fc3.txt`), on v0.9 (`b6f4315`: the repairs for M1-FC1's and M1-FC2's findings, `fc1.txt`, with D-18 amended for R-M1-81, and `fc2.txt`), on v0.8 (`1580e87`: M1's round-1 fixes, with D-2 and D-12 to D-15). `node docs/spec/review/tools/trace-v2.mjs docs/spec/v2.md <previous snapshot>` gives 0 problems (101 requirements, 61 ACs), and `tools/check-appendix-c.mjs` gives 0 problems. The trace script checks Appendix B's rules 1 to 6 and 8 (forward citations marked →Mx) and, given a previous version, that no ID is gone.
- **Snapshots** (in the main checkout's `.shadow/v2-tools/review/snapshots/`): `v2@be9deb0.md`, which round 1 reviewed; `v2@1580e87.md`, v0.8, which D-7's drafters read; `v2@b6f4315.md`, v0.9, which M1-FC3 checked and F's round-2 test author read; `v2@e7c33b4.md`, v0.10, which D-7's judge read and the queued reviewers' prompts name. Rebuild one with `git show <sha>:docs/spec/v2.md` from Git Bash (PowerShell's pipe re-encodes it).
- **No agent is running.** Queued, with prompts in `decisions.md`, "Prompts to rerun": M1's round-2 test author and vendor-fact checker, and F's round-2 consistency auditor. All three name v0.10. If the owner's answers land first (see "Next"), point them at the new snapshot and its line ranges.
- **Status board with Codex** (from 2026-10-16): `C:\Users\johns\projects\AIConnections\codex-claude-status.md`, local and excluded from git. Claude ticks the Review column at each step and Codex the Build column. The order: the review leads, Codex builds a milestone only once its spec is marked converged, and then Codex builds milestone N while the review does N+1.
- **Pace** (the owner, 2026-10-17, in a comment in the decisions doc): in a session that starts in a fresh five-hour window, run more than two agents at a time; drop back to two once the owner says the weekly limit is close. Claude can't see the limits. On 2026-10-17 the owner also asked to stop after the last pass, so session 4 ended there.
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
| F | Round 1 closed (v0.7; F-FC1 and F-FC2 passed). R-F-58 waits for D-7's merge. Round 2 started 2026-10-17: the test author raised R-F-68 to R-F-85 on v0.9, none verified yet; the consistency auditor is queued. Then a second clean round and two sign-offs. |
| M1 | Round 1 closed: 56 findings, 40 verified (every P1 twice), 3 more from verifiers; fixed in v0.8; M1-FC1 and M1-FC2 passed all twelve P1 fixes and found R-M1-62 to R-M1-82, repaired in v0.9 except R-M1-71 (parked for M2) and R-M1-82 (D-19); M1-FC3 passed both P1 repairs and found R-M1-83 to R-M1-88, repaired in v0.10. Open: R-M1-59 (P1) and R-M1-82, now answerable with D-3 and D-19. Round 2 (test author, vendor-fact checker) is queued. |
| C (M1's rows) | Not started. |
| M2–M6, C, X1–X5 | Not started. |

| Decision | State |
|---|---|
| D-1 the spec's name and revision | Answered **A** on 2026-10-16. Applied last, with the final rename. |
| D-2 the lease | Decided 2026-10-15 (A, technical); applied in v0.8. |
| D-3 Q8, the process helper | Answered **B** on 2026-10-17: prebuilt and checksummed in CI. To apply from `raw/D-3-option-B.md`, with R-M1-59 and R-F-68. |
| D-4 a threat model | Answered **A** on 2026-10-17: an informative appendix. To draft (the 2.0 draft's model, legacy lines 147-170, is a start), then apply. |
| D-5 limits | Answered **B** on 2026-10-17: caps on queues, sends and sizes now; logs after 2.0. To draft the values, then apply. |
| D-6 G7's "traced in CI" | Decided (a); applied in v0.7. |
| D-7 how the read-only rule reaches every soldier | Judged 2026-10-17: **A**, technical, with parts of C (`raw/D-7-judge.md`). Card sent 2026-10-17 for its two big parts: a message without a kind is read-only, the owner's own included; NEW-2's residual. After the answer: the merge onto v0.10 as `decisions.md` D-7 says (with R-F-58 and R-F-86 to R-F-88), then a fix check. |
| D-8 the live checks' budget | Answered **B** on 2026-10-17: $2 of reported cost plus a token cap. To apply. |
| D-9 how far the Monarch's secret resists a soldier | Answered **A** on 2026-10-17: harden where the system allows, accept the rest. To apply. |
| D-10 trusting the folder's own files | Answered **A** on 2026-10-17: a trust card before any soldier starts. To apply. |
| D-11 `/clear`, `/resume` and `/branch` | The owner picked **Other** on 2026-10-17 with no note; a comment on its row in the doc asks what they want. |
| D-12 to D-15 | Technical, chosen 2026-10-15; applied in v0.8. |
| D-16 what a supervised claude soldier runs without the owner | Answered **A** on 2026-10-17, over the recommended B: keep v1's plan mode, where claude's classifier approves commands outside the read-only set. To apply. |
| D-17 one army per repository or per working tree | Answered **B** on 2026-10-17: one per working tree. To apply. |
| D-18 how a cut-short turn is checked before M3 | Technical, (b), amended for R-M1-81; applied in v0.9. |
| D-19 soldiers and the owner's auto memory | Answered **A** on 2026-10-17: off for soldiers. To apply, with R-M1-82; probe P-12 shows how. |
| D-20 macOS in 2.0 | Answered **A** on 2026-10-16: macOS stays. |
| D-21 one clean round instead of two | Answered **A** on 2026-10-16: keep every recheck. |
| Values set in the fix pass | A summary line is at most 120 characters; the parity task reads `README.md` and `package.json`, with live at most 1.05 times headless and two repeats on a token failure; a background task's follow-up wait is 30 s; a crashed channel restarts after 1 s, 5 s and 30 s. Recorded in `decisions.md`; the owner may overrule any. |

## Next, in order

Run more than two agents at a time only in a session that starts in a fresh five-hour window, and drop back to two once the owner says the weekly limit is close. Commit and push after every result that changes a doc. `NEXT-SESSION.md` has the setup and the prompts.

1. **The decisions doc:** D-7's answer, D-11's note (the comment on its row), and anything new. Record each in `decisions.md`.
2. **Apply the owner's answers**, as v0.11:
   - with no agent, from text already drafted or short: D-3 (B, `raw/D-3-option-B.md`; with R-M1-59, R-M1-61 and R-F-68), D-8, D-9, D-10, D-16, D-17 and D-19 (with R-M1-82);
   - D-7's merge once it is answered (the plan is in `decisions.md`, D-7), with R-F-58 and R-F-86 to R-F-88;
   - D-4's appendix and D-5's caps need their text drafted first (a drafter each, or by hand);
   - D-11 once the owner says what they want.
   Then both checkers, and a fix check of what changed.
3. **Round 2, on v0.11's snapshot:** M1's test author and vendor-fact checker, and F's consistency auditor (prompts in `decisions.md`; update the snapshot and line ranges). Verify F's test-author findings (R-F-68 to R-F-85) against v0.11, since some will be fixed or moved by the answers. Then verify, fix and fix-check, as in round 1.
4. **C's rows that M1 touches.** These need the owner's `the-future` folder.
5. **The first batch to Codex**, through the owner, with "For Codex" below.

## For Codex, when M1's batch goes

- The lease counts only the post office's own running time, in once-a-second checks of at most 5 s each, and a renewal never expires it (`lease.ts` 23-49, `server.ts` 73). The mod keeps renewing after a failed renewal (`register.ts` 81-92 and 121) (D-2).
- A failed log write never closes the post office (`postOffice.ts` 71, 79-83 and 226-227) (R-M1-11).
- Code a child process runs lives in a file of its own: the Linux and macOS guardians and the Windows supervisor's C# leave their strings (`processTree.ts` 110, 336, 419-421 and 504-506) (R-M1-50, R-M1-61).
- A restart that opens a fresh session gets a new snapshot (`postOffice.ts` 131 and 142 reuse it) (WSP-11, R-M1-77).

## Waiting on the owner

- In the doc "Spec 2.0 Review: Your Decisions", https://claude.ai/code/artifact/783b080a-cade-4038-9c8a-6a6738ccb844: D-7's card (new, 2026-10-17) and a note on D-11's "Other". Every other card is answered. The owner answers in its "Your answer" column and in comments; read it with the docs tools at the start of each session.
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
