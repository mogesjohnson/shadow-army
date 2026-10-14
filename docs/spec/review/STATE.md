# Spec 2.0 review: state

Read this first, then [`spec2.0_review_flow.md`](spec2.0_review_flow.md). Update it after every pass.

Last updated: 2026-10-14, session 7ac7daad. The owner had the stopped agents resumed one or two at a time, and then nothing new started. Unit F's round-1 verification is done; M1's has not run; no fix is applied yet.

## Where things are

- **Branch** `claude/63-ultimate-spec-review`, PR #77, "#63 Ultimate Spec Review" (draft), stacked on #76 (`claude/63-spec-ideas`, spec v0.6 at `be9deb0`). The spec text is unchanged so far: `tools/trace-v2.mjs docs/spec/v2.md` gives 0 problems (97 requirements, 53 ACs).
- **`main`** is spec v0.5 (`ab04992`). #76 (v0.6: Appendix C and M1's decisions) is a draft, with CI green at `be9deb0` and no Codex review yet.
- **M1 (#75)** is Codex's draft, paused at `04ab953` until the spec's M1 text converges. Read it for reality checks only: `git worktree add ../shadow-army-m1 origin/codex/63-m1-post-office`.

| Unit | State |
|---|---|
| F | Round 1 reviewed (51 findings) and 32 verified (F-V1 to F-V6): 24 confirmed (5 P1, 13 P2, 6 P3), 4 decisions, 2 refuted, 2 duplicates. R-F-52 found and parked for M3. The 7 findings that overlap M1 (R-F-10, 11, 13, 16, 29, 30, 38) are verified with M1's packets. Fixes not applied yet. |
| M1 | Round 1 reviewed: 56 findings, 40 to verify. Packets `batches/M1-V1.md` to `M1-V6.md` are ready. |
| C (M1's rows) | Not started. |
| M2–M6, C, X1–X5 | Not started. |

| Decision | State |
|---|---|
| D-1 the spec's name and revision | Big. The card was sent to the owner on 2026-10-14; no answer yet. Recommended: "Shadow Army 2.0: Specification", drafts 0.7 and on, revision 1.0 when accepted, release 2.0.0, file path unchanged. |
| D-2 the lease | Prototype and both drafts done. Next: the judge only (option reviews dropped). The prototype says the owner's 10 s / 30 s holds; the defect is how Codex's `lease.ts` measures sleep. |
| D-3 Q8, the process helper | All three options drafted (`raw/D-3-option-A.md`, `-B.md`, `-C.md`) and the Linux prototype done. Next: a judge, then the card (big). Facts for the card: B needs an Apple Developer ID (99 USD a year) and a public repository or GitHub Enterprise Cloud for attestations; C leaves a stated escape on macOS unless the owner refuses the fallback; on Windows, M1's draft creates its Job Object through PowerShell's Add-Type, which AppLocker's ConstrainedLanguage mode blocks, whichever option wins. |
| D-4 a threat model | Big: card to batch. |
| D-5 limits on queues, sends, sizes and logs | Big: card to batch. |
| D-6 how G7's "traced in CI" is met | Technical: decide in the fix pass. |
| D-7 how the read-only rule reaches every soldier | Technical if option A or C wins, big if B or D: bake-off in the fix pass. |

## Next, in order

Two agents at a time; commit and push after each result that changes a doc.

1. **Set up** the machine, as `NEXT-SESSION.md` says.
2. **Verify M1:** `batches/M1-V1.md` to `M1-V6.md`, with the verifier prompt in `NEXT-SESSION.md`. Record each verdict in the ledger.
   - Then a second verifier for each P1 that the first one CONFIRMED or called a DECISION (flow, section 4). Build that packet from the confirmed P1s; `M1-V7.md` and `M1-V8.md` hold every P1, so trim them.
3. **F is verified.** Its fixes are listed, one per finding, in the ledger's Resolution column ("fix pending: …").
4. **Fix** every CONFIRMED finding in `docs/spec/v2.md`. A fix checker checks each P0 and P1 fix. Run the trace, commit, push, and comment on the PR.
5. **D-2:** the judge, over `raw/D-2-option-A.md`, `raw/D-2-option-B.md`, `raw/D-2-prototype.md` and `decisions.md`. Apply the winner. If it is A, no owner question is needed; tell Codex to match `lease.ts`.
6. **D-3:** redraft options B and C (prompts in `decisions.md`), a judge, then the card to the owner.
7. **DECISION verdicts:** a bake-off for each technical one, and a card for each big one. Likely big:
   - B2: how far PO-3 goes, and accepting what can't be fixed;
   - whether `/clear` and `/resume` end the army (with H38);
   - how far a repository's own config is trusted;
   - how soldiers start without the owner's mods.
8. **Round 2** for F and M1, with two reviewers each (flow, section 4): a test author and a consistency auditor; M1 also needs vendor facts.
9. **C's rows that M1 touches.** `tools/check-appendix-c.mjs` and the idea files need the owner's `the-future` folder, which exists only on the owner's machine. On another machine, review those rows against the appendix's own text, and leave the checker for the owner's machine.
10. **The first batch to Codex**, through the owner. Merge with its approval.

## Waiting on the owner

- Card D-1 (the name).
- Probes P-1 (grok's pending permission at a stop) and P-2 (agy's interrupt), which finish spike S6 (`probes.md`).
- Later: cards D-3 (Q8), D-4 (a threat model) and D-5 (limits), and any big one from M1's verification.
- Probes P-3 (no installed mod loads in a claude soldier) and P-4 (does each CLI compact by itself after a context overflow; the costliest).

## Measured cost of an agent

The resumed agents of 2026-10-14, which give the pace for planning: F-V1 243k tokens (68 tool calls, 16 min); F-V2 231k (58, 17 min); F-V3 171k (48, 12.5 min); F-V4 254k (36, 14 min); F-V5 161k (72, 10 min); F-V6 236k; D-3's B and C drafters 286k and 332k. A verifier averages about 220k tokens.

## Only on the owner's Windows machine

- `.shadow/v2-tools/STATE.md`: v2's overall state (Codex, M1, S6, the canvases). It is local and never committed.
- `C:\Users\johns\projects\the-future\`: the owner's 118 idea files. Their code is leaked Claude Code source, so they never leave that machine or enter a brief.
- WSL Ubuntu, where the D-3 prototype ran.
- The live CLIs and the owner's logins, needed for any probe.
