# Spec 2.0 review: state

Read this first, then [`spec2.0_review_flow.md`](spec2.0_review_flow.md). Update it after every pass.

Last updated: 2026-10-16, session 3. Unit F's round 1 is closed: its 25 confirmed fixes are in v0.7, and two fix checks passed (F-FC1, F-FC2). M1's round 1 is verified and fixed (v0.8); its fix checks M1-FC1 and M1-FC2 are under way. The next session starts from `NEXT-SESSION.md`.

## Where things are

- **Branch** `claude/63-ultimate-spec-review`, PR #77, "#63 Ultimate Spec Review" (draft), stacked on #76 (`claude/63-spec-ideas`, spec v0.6 at `be9deb0`). The spec is v0.7. `node docs/spec/review/tools/trace-v2.mjs docs/spec/v2.md <v2@be9deb0.md>` gives 0 problems (99 requirements, 59 ACs); it now checks Appendix B's rules 1 to 6 and the new rule 8 (forward citations marked →Mx), and with a previous version, that no ID is gone. `tools/check-appendix-c.mjs` gives 0 problems.
- **Agents running** (2026-10-16, session 3): fix check M1-FC2 (the claude channel, logs and where soldiers run: R-M1-24, R-M1-11, R-M1-7, R-M1-12, R-M1-23), report to `raw/M1-r1-fixcheck-FC2.md`; and D-7's drafter for option A, on the frozen v0.8 snapshot `.shadow/v2-tools/review/snapshots/v2@1580e87.md`, report to `raw/D-7-option-A.md`. Next: D-7's drafter for option C; M1-FC1's and M1-FC2's repairs, applied together once FC2 reports (drafted meanwhile, so no agent reads a spec that moves); then round 2 for F and M1. If a report is missing in a later session, rerun that agent from its packet or prompt.
- **Done in session 3:** session 2's cut-off M1-FC1 and D-3 judge rerun (a new session can't resume them). The D-3 judge recommends B, big (`raw/D-3-judge.md`; its findings R-M1-59 to R-M1-61, probes P-5 to P-10). M1-FC1: all seven P1 fixes FIXED, with follow-ups R-M1-62 to R-M1-69 and R-M1-70, outside its scope (`raw/M1-r1-fixcheck-FC1.md`); new decisions D-17 (big) and D-18 (technical, (b)). Cards D-1, D-3, D-4, D-5, D-8, D-9, D-10, D-11 and D-16 sent to the owner on 2026-10-16.
- **The spec is v0.8** (`1580e87`): M1's round-1 fixes are applied, with D-2 and D-12 to D-15; both checkers give 0 problems (101 requirements, 61 ACs). The drafts it came from are in `drafts/M1-r1/`.
- **Done this session:** unit F's fixes; fix checks F-FC1 (the five P1 fixes FIXED; 12 follow-up findings, R-F-53 to R-F-64) and F-FC2 (all eleven repairs and D-6 FIXED; two P3 notes, R-F-65 and R-F-66, closed). M1-V1, M1-V2 and M1-V3, the last two cut off by the usage limit and resumed. New decisions: D-8 to D-11 (big), D-12 and D-13 (technical, chosen); D-6 decided and applied.
- **Next:** the fix checks' findings, if any, repaired and checked again; the D-3 card; then the cards for the owner (D-1, D-3, D-4, D-5, D-8, D-9, D-10, D-11, D-16); then round 2 for F and M1, two reviewers each, on a snapshot of v0.8.
- **Saving a report:** this session's background transcripts are in `~/.claude/projects/C--Users-johns-projects-AIConnections/<session>/subagents/agent-<id>.jsonl` (the tasks folder's `.output` files are empty). Copy one to `<scratch>/tasks/<id>.output`, then run `tools/extract.mjs` with `TASKS_DIR=<scratch>/tasks`.
- **M1's verifiers** still verify against the `be9deb0` snapshot. v0.7 already changed M1 text, so M1's fix pass merges with it: HOST-2 (the mod only in the owner's session), PO-1 (a restart opens a fresh session in M1), PO-7 (the event stream), CH-2 (context size fields), SI-1, ARM-1, ARM-3, the new WSP-10 (harness git), M1-AC1, M1-AC7, and the new M1-AC9 and M1-AC10.
- **`main`** is spec v0.5 (`ab04992`). #76 (v0.6: Appendix C and M1's decisions) is a draft, with CI green at `be9deb0` and no Codex review yet.
- **M1 (#75)** is Codex's draft, paused at `04ab953` until the spec's M1 text converges. Read it for reality checks only: `git worktree add ../shadow-army-m1 origin/codex/63-m1-post-office`.

| Unit | State |
|---|---|
| F | Round 1 closed. 51 findings; 32 verified: 25 confirmed (5 P1, 14 P2, 6 P3), 4 decisions, 2 refuted, 2 duplicates; R-F-52 parked for M3. All 25 fixed in v0.7. Fix check F-FC1 passed the five P1 fixes and found 12 follow-ups (R-F-53 to R-F-64); F-FC2 passed their repairs and found two P3 notes (R-F-65, R-F-66), closed. R-F-58 waits for D-7. Round 1 was not clean, so F needs round 2 (two reviewers) and then a second clean round. |
| M1 | Round 1: 56 findings, 40 verified, every P1 twice, and 3 more that verifiers raised. All confirmed findings are fixed in v0.8. Fix check M1-FC1 passed its seven P1 fixes and found R-M1-62 to R-M1-70 (repairs drafted, to apply with M1-FC2's); M1-FC2 checks the other five. Big decisions waiting: D-3 (Q8), D-9 (B2 and the credentials), D-10 (the folder's config), D-11 (/clear, /resume, /branch), D-16 (what supervised allows), D-17 (one army per repository or per working tree). |
| C (M1's rows) | Not started. |
| M2–M6, C, X1–X5 | Not started. |

| Decision | State |
|---|---|
| D-1 the spec's name and revision | Big. The card was sent to the owner on 2026-10-14; no answer yet. Recommended: "Shadow Army 2.0: Specification", drafts 0.7 and on, revision 1.0 when accepted, release 2.0.0, file path unchanged. |
| D-2 the lease | Prototype and both drafts done. Next: the judge only (option reviews dropped). The prototype says the owner's 10 s / 30 s holds; the defect is how Codex's `lease.ts` measures sleep. |
| D-3 Q8, the process helper | Judged 2026-10-16 (`raw/D-3-judge.md`): B, the helper prebuilt and checksummed, recommended; big. The card is drafted and in the batch. The judge's findings are R-M1-59 to R-M1-61, and its probes P-5 to P-10. Facts for the card: B needs an Apple Developer ID (99 USD a year) and a public repository or GitHub Enterprise Cloud for attestations; C leaves a stated escape on macOS unless the owner refuses the fallback; on Windows, M1's draft creates its Job Object through PowerShell's Add-Type, which AppLocker's ConstrainedLanguage mode blocks, whichever option wins. |
| D-4 a threat model | Big: card to batch. |
| D-5 limits on queues, sends, sizes and logs | Big: card to batch. |
| D-6 how G7's "traced in CI" is met | Technical: decide in the fix pass. |
| D-7 how the read-only rule reaches every soldier | Technical if option A or C wins, big if B or D: bake-off in the fix pass. |
| D-8 the live checks' $2 budget | Big (money). Found in this pass: R-F-33's verifiers left the clause to R-F-20 and R-F-20's to R-F-33. Card to batch; leaning B ($2 of reported cost plus a token cap for CLIs that report none). |
| Values set in the fix pass | A summary line is at most 120 characters; the parity task reads `README.md` and `package.json`, with live at most 1.05 times headless and two repeats on a token failure; a background task's follow-up wait is 30 s. Recorded in `decisions.md`; the owner may overrule any. |

## Next, in order

Credit: the owner had over 90% of the weekly limit left on 2026-10-15 (7% on 2026-10-14). Still ask the owner before starting agents in a new session; run at most two at a time; commit and push after every result that changes a doc. `NEXT-SESSION.md` has the setup, the prompts and the detail.

1. **Set up** the machine (`NEXT-SESSION.md`, section 3).
2. ~~Apply unit F's confirmed fixes.~~ Done 2026-10-15 (v0.7).
3. **Cards D-4, D-5 and D-8** (no agent): drafted in `decisions.md`, to send with D-3's once its judge has run.
4. **The first two agents** (ask the owner first): one fix checker for F's five P1 fixes (PLAYBOOK section 12; one packet, against v0.7 and the ledger's rows), beside M1-V1 (security).
5. **Verify M1** (agents): `batches/M1-V2.md` to `M1-V6.md`, two at a time. Then a second verifier for each P1 the first one confirmed; `M1-V7.md` and `M1-V8.md` hold every P1, so trim them first. Record the verdicts with `tools/set-verdicts.mjs`.
6. **Fix M1's confirmed findings**, merged with v0.7's changes (above), and run a fix check for every P1 fix.
7. **Judges:** D-2 (apply the winner; tell Codex to match `lease.ts`), then D-3, then its card.
8. **D-6 and D-7** in the fix pass. Then **the cards** D-3, D-4, D-5 and D-8, and any big decision from M1's verification. Likely big:
   - B2: how far PO-3 goes;
   - whether `/clear` and `/resume` end the army (with H38);
   - how far a repository's own config is trusted;
   - who runs VER-10's macOS check (R-F-50).
9. **Round 2** for F and M1, with two reviewers each.
10. **C's rows that M1 touches.** These need the owner's `the-future` folder.
11. **The first batch to Codex**, through the owner.

## Waiting on the owner

- The cards sent on 2026-10-16: D-1 (the name, re-sent), D-3, D-4, D-5, D-8, D-9, D-10, D-11 and D-16. D-17 goes with the next message.
- Card D-1 (the name).
- Probes P-1 (grok's pending permission at a stop) and P-2 (agy's interrupt), which finish spike S6 (`probes.md`).
- Later: cards D-3 (Q8), D-4 (a threat model), D-5 (limits) and D-8 (the live checks' budget), and any big one from M1's verification.
- How much credit is left, before any agent starts.
- Probes P-3 (no installed mod loads in a claude soldier) and P-4 (does each CLI compact by itself after a context overflow; the costliest).

## Measured cost of an agent

The resumed agents of 2026-10-14, which give the pace for planning: F-V1 243k tokens (68 tool calls, 16 min); F-V2 231k (58, 17 min); F-V3 171k (48, 12.5 min); F-V4 254k (36, 14 min); F-V5 161k (72, 10 min); F-V6 236k; D-3's B and C drafters 286k and 332k. A verifier averages about 220k tokens.

## Only on the owner's Windows machine

- `.shadow/v2-tools/STATE.md`: v2's overall state (Codex, M1, S6, the canvases). It is local and never committed.
- `C:\Users\johns\projects\the-future\`: the owner's 118 idea files. Their code is leaked Claude Code source, so they never leave that machine or enter a brief.
- WSL Ubuntu, where the D-3 prototype ran.
- The live CLIs and the owner's logins, needed for any probe.
