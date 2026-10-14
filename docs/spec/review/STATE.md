# Spec 2.0 review: state

Read this first, then [`spec2.0_review_flow.md`](spec2.0_review_flow.md). Update it after every pass.

Last updated: 2026-10-14, session 7ac7daad. All agents stopped at the owner's request; round 1's reviews are done, and their verification has not run.

## Where things are

- **Branch** `claude/63-ultimate-spec-review`, PR #77, "#63 Ultimate Spec Review" (draft), stacked on #76 (`claude/63-spec-ideas`, spec v0.6 at `be9deb0`). The spec text is unchanged so far: `tools/trace-v2.mjs docs/spec/v2.md` gives 0 problems (97 requirements, 53 ACs).
- **`main`** is spec v0.5 (`ab04992`). #76 (v0.6: Appendix C and M1's decisions) is a draft, with CI green at `be9deb0` and no Codex review yet.
- **M1 (#75)** is Codex's draft, paused at `04ab953` until the spec's M1 text converges. Read it for reality checks only: `git worktree add ../shadow-army-m1 origin/codex/63-m1-post-office`.

| Unit | State |
|---|---|
| F | Round 1 reviewed: 51 findings, 39 to verify. Its six verifiers were cut off: rerun `batches/F-V1.md` to `F-V5.md`. |
| M1 | Round 1 reviewed: 56 findings, 40 to verify. Packets `batches/M1-V1.md` to `M1-V6.md` are ready. |
| C (M1's rows) | Not started. |
| M2–M6, C, X1–X5 | Not started. |

| Decision | State |
|---|---|
| D-1 the spec's name and revision | Big. The card was sent to the owner on 2026-10-14; no answer yet. Recommended: "Shadow Army 2.0: Specification", drafts 0.7 and on, revision 1.0 when accepted, release 2.0.0, file path unchanged. |
| D-2 the lease | Prototype and both drafts done. Next: the judge only (option reviews dropped). The prototype says the owner's 10 s / 30 s holds; the defect is how Codex's `lease.ts` measures sleep. |
| D-3 Q8, the process helper | Draft A and the Linux prototype done. Next: redraft B and C, then a judge, then the card (big). |

## Next, in order

Two agents at a time; commit and push after each result that changes a doc.

1. **Set up** the machine, as `NEXT-SESSION.md` says.
2. **Verify M1:** `batches/M1-V1.md` to `M1-V6.md`, with the verifier prompt in `NEXT-SESSION.md`. Record each verdict in the ledger.
   - Then a second verifier for each P1 that the first one CONFIRMED or called a DECISION (flow, section 4). Build that packet from the confirmed P1s; `M1-V7.md` and `M1-V8.md` hold every P1, so trim them.
3. **Verify F:** `batches/F-V1.md` to `F-V5.md`, then the second verifiers for its confirmed P1s (`F-V6.md` holds every P1; trim it).
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
- Later: card D-3 (Q8), and the big DECISION cards from round 1.

## Only on the owner's Windows machine

- `.shadow/v2-tools/STATE.md`: v2's overall state (Codex, M1, S6, the canvases). It is local and never committed.
- `C:\Users\johns\projects\the-future\`: the owner's 118 idea files. Their code is leaked Claude Code source, so they never leave that machine or enter a brief.
- WSL Ubuntu, where the D-3 prototype ran.
- The live CLIs and the owner's logins, needed for any probe.
