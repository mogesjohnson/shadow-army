# Spec 2.0 review: state

Read this first, then [`spec2.0_review_flow.md`](spec2.0_review_flow.md). Update it after every pass.

Last updated: 2026-10-16, end of session 3. Unit F's round 1 is closed (v0.7; fix checks F-FC1 and F-FC2 passed). M1's round 1 is verified, fixed (v0.8) and fix-checked: M1-FC1 and M1-FC2 passed all twelve P1 fixes and found 21 follow-ups (R-M1-62 to R-M1-82), whose repairs come next. No agent is running. The next session starts from `NEXT-SESSION.md`.

## Where things are

- **Branch** `claude/63-ultimate-spec-review`, PR #77, "#63 Ultimate Spec Review" (draft), stacked on #76 (`claude/63-spec-ideas`, spec v0.6 at `be9deb0`).
- **The spec is v0.8** (`1580e87`): M1's round-1 fixes, with D-2 and D-12 to D-15. `node docs/spec/review/tools/trace-v2.mjs docs/spec/v2.md <previous snapshot>` gives 0 problems (101 requirements, 61 ACs), and `tools/check-appendix-c.mjs` gives 0 problems. The trace script checks Appendix B's rules 1 to 6 and 8 (forward citations marked →Mx) and, given a previous version, that no ID is gone.
- **Snapshots** (in the main checkout's `.shadow/v2-tools/review/snapshots/`): `v2@be9deb0.md`, which round 1 reviewed, and `v2@1580e87.md`, v0.8, which D-7's drafters read. Rebuild one with `git show <sha>:docs/spec/v2.md`.
- **Agents running:** none. Every report is saved in `raw/`.
- **Done in session 3** (2026-10-16):
  - Session 2's cut-off fix check M1-FC1 and D-3 judge were rerun, since a new session can't resume them.
  - The D-3 judge recommends B, big (`raw/D-3-judge.md`). Its findings are R-M1-59 to R-M1-61, and its probes P-5 to P-10.
  - M1-FC1 passed all seven P1 fixes and found R-M1-62 to R-M1-70 (`raw/M1-r1-fixcheck-FC1.md`). M1-FC2 passed all five, confirmed R-M1-70 as P1 and found R-M1-71 to R-M1-82 (`raw/M1-r1-fixcheck-FC2.md`).
  - D-7's option A is drafted (`raw/D-7-option-A.md`).
  - New decisions: D-17 (big), D-18 (technical, (b), amended for R-M1-81), D-19 (big). Probes P-11 to P-13.
  - Cards D-1, D-3, D-4, D-5, D-8, D-9, D-10, D-11, D-16 and D-17 went to the owner. D-19's card is drafted and waits for the next message.
  - M1-FC1's repairs are drafted in `drafts/M1-r1-fc/fc1.txt` (19 blocks; a dry run gives 0 problems), with the converter `tools/pairs.mjs`.
  - M1-FC2 and D-7's drafter were cut off by the usage limit once (it reset at 14:20) and resumed in the same session.
- **Saving a report:** a background agent's transcript is `~/.claude/projects/C--Users-johns-projects-AIConnections/<session>/subagents/agent-<id>.jsonl` (the tasks folder's `.output` files stay empty). Copy it to `<scratch>/tasks/<id>.output`, then run `tools/extract.mjs <id> raw/<name>.md "<header>"` with `TASKS_DIR=<scratch>/tasks`.
- **Shell habits on the owner's machine:** Git Bash collapses `\\` in a command, even inside a quoted heredoc, and a heredoc of long table rows can fail to parse. Write scripts and ledger rows with the Write tool, then append them with `cat <file> >> ledger.md`. Edit the spec through OLD/NEW blocks (`tools/pairs.mjs`, then `tools/rep.mjs`, which refuses any old text that doesn't occur exactly once).
- **`main`** is spec v0.5 (`ab04992`). #76 (v0.6) is a draft, with CI green at `be9deb0` and no Codex review yet.
- **M1 (#75)** is Codex's draft, paused at `04ab953` until the spec's M1 text converges. Read it for reality checks only; on the owner's machine it is `../AIConnections-m1`.

| Unit | State |
|---|---|
| F | Round 1 closed. 51 findings; 32 verified: 25 confirmed (5 P1, 14 P2, 6 P3), 4 decisions, 2 refuted, 2 duplicates; R-F-52 parked for M3. All 25 fixed in v0.7; F-FC1 and F-FC2 passed the fixes and their repairs. R-F-58 waits for D-7. Next: round 2 (two reviewers), then a second clean round and two sign-offs. |
| M1 | Round 1: 56 findings, 40 verified (every P1 twice), and 3 more that verifiers raised; all confirmed findings fixed in v0.8. M1-FC1 and M1-FC2 passed all twelve P1 fixes and found R-M1-62 to R-M1-82. Open P1s: R-M1-70 and R-M1-73 (repairs to write, then a fix check) and R-M1-59 (with D-3's answer). R-M1-71 is parked for M2. Next: the repairs (v0.9), their fix check, then round 2. |
| C (M1's rows) | Not started. |
| M2–M6, C, X1–X5 | Not started. |

| Decision | State |
|---|---|
| D-1 the spec's name and revision | Answered **A** by the owner on 2026-10-16, in the decisions doc. Applied last, with the final rename. |
| D-2 the lease | Decided 2026-10-15 (A: the owner's 10 s / 30 s, technical); applied in v0.8. |
| D-3 Q8, the process helper | Big. Judged 2026-10-16: B, the helper prebuilt and checksummed. Card sent 2026-10-16. |
| D-4 a threat model; D-5 limits; D-8 the live checks' budget | Big. Cards sent 2026-10-16. |
| D-6 how G7's "traced in CI" is met | Decided (a); applied in v0.7. |
| D-7 how the read-only rule reaches every soldier | Bake-off: option A drafted 2026-10-16. Next: option C's drafter (prompt in `decisions.md`, "Prompts to rerun"), then a judge. A makes every message without a kind read-only, the owner's own typed messages included, so the judge must say whether that part needs a card. |
| D-9, D-10, D-11, D-16, D-17 | Big. Cards sent 2026-10-16. |
| D-12 to D-15 | Technical, chosen 2026-10-15; applied in v0.8. |
| D-18 how a cut-short turn is checked before M3 | Technical, (b), amended for R-M1-81; goes in with M1-FC1's repairs. |
| D-19 soldiers and the owner's auto memory | Big. Card in the decisions doc; probe P-12 first. |
| D-20 leaving macOS out of 2.0 for now | Big; the owner's question of 2026-10-16. Card in the decisions doc, recommending C: macOS stays in CI, and no soldier starts on macOS until after 2.0. Measured: it saves the review only about 3 to 5%. If the owner picks B or C, D-3 is judged again without macOS (one agent). |
| D-21 one clean round per unit instead of two | Big; the owner's question of 2026-10-16. Card in the decisions doc, recommending B: one clean round, then the two sign-offs. No unit has had a clean round yet; it would save roughly 15 to 20% of what is left. Until the owner answers, the rule stays two clean rounds. |
| Values set in the fix pass | A summary line is at most 120 characters; the parity task reads `README.md` and `package.json`, with live at most 1.05 times headless and two repeats on a token failure; a background task's follow-up wait is 30 s; a crashed channel restarts after 1 s, 5 s and 30 s. Recorded in `decisions.md`; the owner may overrule any. |

## Next, in order

Ask the owner how much credit is left before starting any agent; run at most two at a time; commit and push after every result that changes a doc. `NEXT-SESSION.md` has the setup and the prompts.

1. **The owner's answers** to any card, read from the decisions doc (above, "Waiting on the owner") and applied as they come, each recorded in `decisions.md` and on its ledger rows.
2. **M1's repairs, no agent.**
   - Write `drafts/M1-r1-fc/fc2.txt` for R-M1-70 and R-M1-72 to R-M1-80, as each ledger row's Resolution says.
   - Amend `fc1.txt`'s D-18 blocks for R-M1-81.
   - Dry-run both on a copy of the spec, then apply them, bump the header to 0.9, and run `trace-v2.mjs` against `v2@1580e87.md`.
   - Commit, and mark each row "fixed (v0.9)".
3. **Two agents:** a fix check of the P1 repairs (R-M1-70, R-M1-73; a packet `batches/M1-FC3.md` in the style of M1-FC1 and M1-FC2), beside D-7's option C drafter.
4. **D-7's judge** over A and C. Apply the winner if it is technical; otherwise write its card.
5. **Round 2 for M1 and F**, on a frozen snapshot of v0.9, two reviewers each: M1 with the test author and the vendor-fact checker; F with the test author and the consistency auditor (PLAYBOOK section 6). Give each reviewer the findings already refuted or declined for its unit. Then verify, fix and fix-check, as in round 1.
6. **C's rows that M1 touches.** These need the owner's `the-future` folder.
7. **The first batch to Codex**, through the owner, with "For Codex" below.

## For Codex, when M1's batch goes

- The lease counts only the post office's own running time, in once-a-second checks of at most 5 s each, and a renewal never expires it (`lease.ts` 23-49, `server.ts` 73). The mod keeps renewing after a failed renewal (`register.ts` 81-92 and 121) (D-2).
- A failed log write never closes the post office (`postOffice.ts` 71, 79-83 and 226-227) (R-M1-11).
- Code a child process runs lives in a file of its own: the Linux and macOS guardians and the Windows supervisor's C# leave their strings (`processTree.ts` 110, 336, 419-421 and 504-506) (R-M1-50, R-M1-61).
- A restart that opens a fresh session gets a new snapshot (`postOffice.ts` 131 and 142 reuse it) (WSP-11, R-M1-77).

## Waiting on the owner

- The open cards (D-3, D-4, D-5, D-8, D-9, D-10, D-11, D-16, D-17, D-19, D-20, D-21) are in the doc "Spec 2.0 Review: Your Decisions", https://claude.ai/code/artifact/783b080a-cade-4038-9c8a-6a6738ccb844, made 2026-10-16. D-1 is answered there (A). The owner answers in its "Your answer" column and in comments; read it with the docs tools at the start of each session.
- Probes (`probes.md`), each needing the owner's go:
  - P-1 and P-2 finish spike S6;
  - P-3: does an installed mod load in a claude soldier;
  - P-4: does each CLI compact after a context overflow (the costliest);
  - P-5, P-6 and P-8 need a Mac (D-3), and P-7 needs Smart App Control on Windows;
  - P-9 matters only if the owner picks C for D-3, and P-10 is an offline prototype;
  - P-11 to P-13 are short CLI sessions.
- How much credit is left, before any agent starts.

## Measured cost of an agent

- Verifiers on 2026-10-14: F-V1 243k tokens (68 tool calls, 16 min), F-V2 231k (58, 17 min), F-V3 171k (48, 12.5 min), F-V4 254k (36, 14 min), F-V5 161k (72, 10 min), F-V6 236k. A verifier averages about 220k tokens.
- Drafters: D-3's B and C drafters 286k and 332k.
- On 2026-10-16: the D-3 judge 217k (48, 16 min); M1-FC1 306k (72, 22 min); M1-FC2 410k and D-7's option A drafter 265k, both counted at the end of a resumed run.

## Only on the owner's Windows machine

- `.shadow/v2-tools/STATE.md`: v2's overall state (Codex, M1, S6, the canvases). It is local and never committed.
- `C:\Users\johns\projects\the-future\`: the owner's 118 idea files. Their code is leaked Claude Code source, so they never leave that machine or enter a brief.
- WSL Ubuntu, where the D-3 prototype ran.
- The live CLIs and the owner's logins, needed for any probe.
