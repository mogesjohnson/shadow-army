# Handoff to the next session

Written 2026-10-14 at the end of session 7ac7daad. Paste the prompt in section 1. Sections 2 to 6 give the detail the prompt points to.

## 1. The prompt

On the owner's Windows machine, start Claude Code in `C:\Users\johns\projects\AIConnections`, the main checkout, so that the two agent types load. On a cloud machine, do section 3's setup first.

```
Continue the Shadow Army spec 2.0 review (issue #63). The review lives on PR #77 ("#63 Ultimate Spec Review"), branch claude/63-ultimate-spec-review, in docs/spec/review/. On the owner's Windows machine it is checked out in the worktree ../AIConnections-review: edit and commit there, never in the main checkout. Elsewhere: git fetch origin && git checkout claude/63-ultimate-spec-review.

Read, in this order: CLAUDE.md, CONTRIBUTING.md, docs/spec/review/NEXT-SESSION.md (all of it), docs/spec/review/STATE.md, docs/spec/review/spec2.0_review_flow.md (the rules; it wins over PLAYBOOK.md), then the ledger and decisions.md as you need them.

Credit is short. Before starting any agent, ask me how much is left, and run at most two agents at a time. Work that needs no agent comes first: applying unit F's 24 confirmed fixes to docs/spec/v2.md, from the ledger's "fix pending" lines and the verifiers' reports in docs/spec/review/raw/. Commit and push after every result that changes a doc, and after every pass update STATE.md and comment on PR #77.

Answer me straight to the point. I answer only big questions, as short decision cards with a tested recommendation.
```

## 2. Where things stand

- **PR #77** (draft) is stacked on #76 (`claude/63-spec-ideas`, spec v0.6 at `be9deb0`). Its head when this was written was `5ae5ac5`, plus this handoff commit. The spec text is still v0.6: no fix has been applied.
- **`main`** is spec v0.5 (`ab04992`). #76 has no Codex review yet.
- **M1 (#75)** is Codex's draft, paused at `04ab953` until the spec's M1 text converges. Read it, never write to it. On the owner's machine it is in `../AIConnections-m1`.

| Unit | State |
|---|---|
| F | Round 1 reviewed (51 findings) and 32 of them verified: 24 confirmed (5 P1, 13 P2, 6 P3), 4 decisions, 2 refuted, 2 duplicates. 7 findings that overlap M1 wait for M1's packets. R-F-52 is parked for M3. **No fix applied.** |
| M1 | Round 1 reviewed (56 findings, 40 to verify). **Not verified.** Packets `batches/M1-V1.md` to `M1-V6.md` are ready. `M1-V7.md` and `M1-V8.md` hold every P1 for a second verifier; trim them to the P1s the first verifiers confirm. |
| The rest | Not started. |

| Decision | State | Next |
|---|---|---|
| D-1 the spec's name | big; card sent 2026-10-14, no answer | wait for the owner |
| D-2 the lease | prototype and both drafts done | the judge only (prompt in `decisions.md`); the prototype says the owner's 10 s / 30 s holds, and the fault is how Codex's `lease.ts` measures sleep |
| D-3 Q8, the process helper | all three options drafted; Linux prototype done | a judge, then the card (big) |
| D-4 a threat model | big | card, batched |
| D-5 limits on queues, sends, sizes, logs | big | card, batched |
| D-6 how G7's "traced in CI" is met | technical | decide in the fix pass |
| D-7 how the read-only rule reaches every soldier | technical if A or C, big if B or D | bake-off in the fix pass |

Probes waiting for the owner's go (`probes.md`): P-1 and P-2 (finish spike S6), P-3 (no installed mod loads in a claude soldier), P-4 (does each CLI compact after a context overflow; the costliest).

## 3. Setup

**On the owner's Windows machine:**
- The worktree `../AIConnections-review` already has the branch, and `.claude/agents/` in the main checkout already holds `spec-reviewer` and `spec-verifier`.
- Check that the worktree is clean and up to date: `git -C ../AIConnections-review status`, then `git -C ../AIConnections-review pull`.
- The round-1 snapshot is `.shadow/v2-tools/review/snapshots/v2@be9deb0.md`. Rebuild it with `git show be9deb0:docs/spec/v2.md` if it is missing.
- Claude Code's mod typings are in `.shadow/v2-tools/review/evidence/mod-api-2.1.294/`.

**On a cloud machine:**
1. `git fetch origin && git checkout claude/63-ultimate-spec-review && npm install`
2. `mkdir -p .claude/agents && cp docs/spec/review/agents/*.md .claude/agents/ && echo ".claude/agents/" >> .git/info/exclude`, then restart Claude Code in that folder.
3. `git worktree add ../shadow-army-m1 origin/codex/63-m1-post-office`, Codex's M1 draft, read only.
4. `mkdir -p ../review-scratch && git show be9deb0:docs/spec/v2.md > ../review-scratch/v2@be9deb0.md`, round 1's snapshot.

The cloud machine has no `the-future` idea files, no `.shadow/`, no WSL and none of the owner's CLI logins. So Appendix C's checker, probes and the second brain stay on the owner's machine.

**The second brain** (the owner's global CLAUDE.md asks for it): on the owner's machine, retrieve the brief at the start with `bash /c/Users/johns/Obsidian-codex-setup/brain.sh brief --cwd "$PWD" --query '<the task>' --json`. The project is registered as `shadow-army`, and session 1's handoff is note `a8a9bedd`. Capture a handoff at the end.

## 4. What to do first

**Without agents (cheap; do this first while credit is short):**
1. **Apply unit F's 24 confirmed fixes** to `docs/spec/v2.md`. Each fix is in the ledger's Resolution column, with detail in the verifier reports `raw/F-r1-verify-V1.md` to `V6.md`.
   - Group them: the glossary (R-F-9, R-F-40, R-F-41, the autonomy entry from R-F-3); §0 and Appendices A and B (R-F-32, R-F-37, R-F-48, R-F-22 with rule 8 and moving CH-9 to M2); §3 (R-F-8, R-F-49, R-F-24, R-F-18 with D-2 option A's event-stream bullet, R-F-28's "the mod acts only in the owner's session"); §5.1 (R-F-25, R-F-44, R-F-45, R-F-33's parity definition, R-F-19's clocks); the rest (R-F-1's new WSP-10, R-F-12, R-F-17, R-F-43, R-F-47, R-F-50, R-F-51).
   - New requirements need an ID, a milestone, evidence codes, an Implements entry and an AC.
   - Then run `node docs/spec/review/tools/trace-v2.mjs docs/spec/v2.md`, which must give 0 problems.
   - Bump the header to version 0.7, and commit one group at a time.
   - Each P1 fix (R-F-1, R-F-3's glossary half, R-F-12, R-F-28, R-F-33) needs a fix checker later, an agent.
2. **Prepare the cards** D-4 and D-5 from `decisions.md`, to send with D-3's once its judge has run.

**With agents (two at a time, after asking the owner):**
1. M1-V1 (security) and M1-V2 (lifecycle), then M1-V3 to M1-V6. A verifier averages about 220k tokens.
2. The second verifiers for the P1s the first ones confirm.
3. The D-2 judge, then the D-3 judge.
4. Fix checks for the P1 fixes.
5. Round 2 for F and M1, with two reviewers each.

## 5. Agent prompts

- **Verifier**, one packet per `spec-verifier` agent; for unit F, replace "M1":

  ```
  Spec 2.0 review, unit M1, round 1. Verify the findings in docs/spec/review/batches/<packet>.md.
  Try to refute each finding: check the cited text and the whole spec for anything that already covers it; settled.md and docs/adr/ (is it a settled owner decision?); whether the scenario can really happen; and, for vendor facts, the official documentation.
  Sources: the spec as reviewed, <snapshot path> (findings cite its lines); docs/spec/review/settled.md; docs/adr/; the archived 2.0 draft, docs/legacy/spec/shadow-army-2.0.md (grep it); v1's code in src/; docs/spec/review/evidence/ (its README lists what is there); Codex's draft (read only, grep it); every other finding in one line each in docs/spec/review/ledger.md, only to name a DUPLICATE.
  Appendix C's "could add (v2.0)" items (H48, H25, B2, H6, H2, H5, M24, H23, M15 with H44, H38, M9, H22) are open decisions; judge a finding that touches one on its own, and name the item. Open decisions: D-1 to D-7 in docs/spec/review/decisions.md.
  Return one block per finding: id, verdict (CONFIRMED, DECISION, DUPLICATE, REFUTED or NEEDS-PROBE), severity (as given, or changed with a reason), evidence (lines, URLs), reason (one sentence). For CONFIRMED add "fix:" with the smallest change to the spec text, in its style, or "as proposed". For DECISION add "options:" and "big or technical:" by PLAYBOOK section 14 (when unsure, big). Read only the lines you need. No preamble and no summary.
  ```

- **D-2 and D-3 judges:** at the end of `decisions.md`.
- **Fix check:** PLAYBOOK section 12.

## 6. Tools and habits that worked

- `tools/packet.mjs` builds a verification packet from raw reports. `tools/set-verdicts.mjs <ledger> <verdicts.json>` fills in each finding's verdict and resolution cells.
- Each agent's report arrives as a message: save it word for word under `raw/`, then commit.
- On the owner's machine, `tools/extract.mjs` (with `TASKS_DIR` set) saves a background agent's report from its transcript without reading it into context.
- Thirteen agents at once used up a five-hour window in about ten minutes. One or two at a time gave a steady pace, about 15 minutes per verifier.
- **Keep the orchestrator's own context small.** By the end of session 1 it was 605k tokens, and every step re-sends it. Read the ledger and raw files in parts, and start a new session once a large pass is done.
- If an agent is cut off by a usage limit, resume it in the same session with SendMessage once the limit resets. A new session can't resume it; rerun it from its packet.
