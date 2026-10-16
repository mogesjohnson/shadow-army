# Handoff to the next session

Written 2026-10-14 at the end of session 7ac7daad; rewritten 2026-10-16 at the end of session 3. Paste the prompt in section 1. Sections 2 to 6 give the detail the prompt points to. `STATE.md` is newer than this file wherever they differ.

## 1. The prompt

On the owner's Windows machine, start Claude Code in `C:\Users\johns\projects\AIConnections`, the main checkout, so that the two agent types load. On a cloud machine, do section 3's setup first.

```
Continue the Shadow Army spec 2.0 review (issue #63). The review lives on PR #77 ("#63 Ultimate Spec Review"), branch claude/63-ultimate-spec-review, in docs/spec/review/. On the owner's Windows machine it is checked out in the worktree ../AIConnections-review: edit and commit there, never in the main checkout. Elsewhere: git fetch origin && git checkout claude/63-ultimate-spec-review.

Read, in this order: CLAUDE.md, CONTRIBUTING.md, docs/spec/review/NEXT-SESSION.md (all of it), docs/spec/review/STATE.md, docs/spec/review/spec2.0_review_flow.md (the rules; it wins over PLAYBOOK.md), then the ledger and decisions.md as you need them.

The spec is v0.8. M1's round 1 is fixed and fix-checked, and its 21 follow-ups (R-M1-62 to R-M1-82) need repairs. First, with no agent: write drafts/M1-r1-fc/fc2.txt for M1-FC2's findings, amend fc1.txt for R-M1-81, dry-run both, apply them as v0.9, and run the checkers. Then ask me how much credit is left, and run at most two agents at a time: a fix check of the P1 repairs (R-M1-70, R-M1-73) beside D-7's option C drafter, then D-7's judge, then round 2 for M1 and F. My answers to the open cards are in the doc "Spec 2.0 Review: Your Decisions" (https://claude.ai/code/artifact/783b080a-cade-4038-9c8a-6a6738ccb844): read its "Your answer" column and comments with the docs tools at the start, and again before each report, and apply each answer as it comes. Commit and push after every result that changes a doc, and after every pass update STATE.md and comment on PR #77.

Answer me straight to the point. I answer only big questions, as short decision cards with a tested recommendation.
```

## 2. Where things stand

`STATE.md` has the detail. In short, on 2026-10-16:

- **PR #77** (draft) is stacked on #76. The spec is v0.8 (`1580e87`), and both checkers give 0 problems (101 requirements, 61 ACs). `main` is v0.5.
- **F:** round 1 closed (v0.7, fix-checked twice). **M1:** round 1 fixed (v0.8) and fix-checked. M1-FC1 and M1-FC2 passed all twelve P1 fixes and found R-M1-62 to R-M1-82. The open P1s are R-M1-70 and R-M1-73 (repairs to write) and R-M1-59 (with D-3's answer).
- **Decisions:** 21 in all.
  - Settled: D-1 (A), D-20 (A: macOS stays in 2.0) and D-21 (A: keep every recheck, two clean rounds included), the owner's answers of 2026-10-16; D-2, D-6, D-12 to D-15 and D-18.
  - With the owner, in the decisions doc: D-3, D-4, D-5, D-8, D-9, D-10, D-11, D-16, D-17 and D-19.
  - In a bake-off: D-7 (option A drafted; option C and a judge next).
- **Probes** P-1 to P-13 wait for the owner's go.
- **Progress:** about a tenth of the whole review. Two of 15 units are through round 1, and 34 agent reports are saved, of the 250 to 300 the playbook expects.
- **M1 (#75)** is Codex's draft, paused at `04ab953` until the spec's M1 text converges. Read it, never write to it. On the owner's machine it is in `../AIConnections-m1`.

## 3. Setup

**On the owner's Windows machine:**
- The worktree `../AIConnections-review` already has the branch, and `.claude/agents/` in the main checkout already holds `spec-reviewer` and `spec-verifier`.
- Check that the worktree is clean and up to date: `git -C ../AIConnections-review status`, then `git -C ../AIConnections-review pull`.
- The snapshots are in `.shadow/v2-tools/review/snapshots/`: `v2@be9deb0.md` (round 1) and `v2@1580e87.md` (v0.8). Rebuild one with `git show <sha>:docs/spec/v2.md` if it is missing.
- Claude Code's mod typings are in `.shadow/v2-tools/review/evidence/mod-api-2.1.294/`.

**On a cloud machine:**
1. `git fetch origin && git checkout claude/63-ultimate-spec-review && npm install`
2. `mkdir -p .claude/agents && cp docs/spec/review/agents/*.md .claude/agents/ && echo ".claude/agents/" >> .git/info/exclude`, then restart Claude Code in that folder.
3. `git worktree add ../shadow-army-m1 origin/codex/63-m1-post-office`, Codex's M1 draft, read only.
4. `mkdir -p ../review-scratch && git show be9deb0:docs/spec/v2.md > ../review-scratch/v2@be9deb0.md && git show 1580e87:docs/spec/v2.md > ../review-scratch/v2@1580e87.md`.

The cloud machine has no `the-future` idea files, no `.shadow/`, no WSL and none of the owner's CLI logins. So Appendix C's checker, probes and the second brain stay on the owner's machine.

**The second brain** (the owner's global CLAUDE.md asks for it): on the owner's machine, retrieve the brief at the start with `bash /c/Users/johns/Obsidian-codex-setup/brain.sh brief --cwd "$PWD" --query '<the task>' --json`. The project is registered as `shadow-army`. Capture a handoff at the end.

## 4. What to do first

**M1's repairs, with no agent** (from `docs/spec/review/`):
1. Write `drafts/M1-r1-fc/fc2.txt`: one OLD/NEW block per change (the format is in `tools/pairs.mjs`), for R-M1-70 and R-M1-72 to R-M1-80.
   - Each ledger row's Resolution says what to write, and `raw/M1-r1-fixcheck-FC2.md` has the checker's wording.
   - R-M1-71 is parked for M2, and R-M1-82 is decision D-19.
   - Read only the v0.8 lines each row names.
2. Amend `fc1.txt`'s two D-18 blocks (PO-5, and WSP-11's guard bullet) for R-M1-81, as `decisions.md` D-18's "Amended" line says.
3. Dry run:
   - copy `../v2.md` to the scratchpad;
   - turn each file into pairs: `node tools/pairs.mjs drafts/M1-r1-fc/fc1.txt <scratch>/fc1.json`, and the same for `fc2.txt`;
   - apply `fc1.json`, then `fc2.json`, to the copy with `node tools/rep.mjs`;
   - run `node tools/trace-v2.mjs <copy> <v2@1580e87.md>`.

   Several repairs touch WSP-11, WSP-8 and M1-AC11 in both files. So write `fc2.txt`'s OLD text against the copy as `fc1.txt` leaves it.
4. Apply both to `../v2.md`, bump the header to 0.9 with a one-line summary, rerun the trace check, and run `tools/check-appendix-c.mjs` if Appendix C changed.
5. Commit, then mark each row's Resolution "fixed (v0.9)".

**Then agents, two at a time, after asking the owner:**
1. Fix check M1-FC3 of the P1 repairs (R-M1-70, R-M1-73). Write the packet `batches/M1-FC3.md` the way `M1-FC1.md` and `M1-FC2.md` are written. Beside it, D-7's option C drafter (prompt in `decisions.md`, "Prompts to rerun").
2. D-7's judge over A and C. It must also say whether A's "a message without a kind is read-only", which covers the owner's own typed messages, needs a card.
3. Round 2 for M1 and F (section 5).

## 5. Agent prompts

- **Fix check** (`spec-verifier`), as M1-FC1 and M1-FC2 ran:

  ```
  Spec 2.0 review, unit M1, round 1: fix check M1-FC3 (PLAYBOOK section 12). The packet is C:\Users\johns\projects\AIConnections-review\docs\spec\review\batches\M1-FC3.md: <what it holds>, as raised, who verified each, and where spec v0.9 now fixes it.
  For each finding: is it fixed? Did the change contradict or break anything within the unit, or in anything that cites the changed text? Answer FIXED or NOT FIXED, with the evidence (v0.9 lines) and one sentence of reasoning. List anything the fix broke, or left half done, as findings in the review schema (docs/spec/review/PLAYBOOK.md lines 304-314).
  Sources (in C:\Users\johns\projects\AIConnections-review unless a path is given): the fixed spec, docs/spec/v2.md (v0.9); the spec as checked before, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@1580e87.md; <the reports that raised each finding> and the ledger's rows for them; docs/spec/review/decisions.md; docs/spec/review/settled.md; docs/adr/; Codex's M1 draft, C:\Users\johns\projects\AIConnections-m1 (read only, grep it); vendors' official documentation.
  Out of scope: open decisions <list>, except to name where the fix depends on one.
  Read only the lines you need. No preamble and no summary.
  ```

- **D-7 drafter for option C:** in `decisions.md`, "Prompts to rerun".
- **D-7 judge** (`spec-verifier`): PLAYBOOK section 12's judge template, with the two drafts (`raw/D-7-option-A.md` and C's), the D-7 record, settled.md, and the extra question in section 4.
- **Round 2 reviewers** (`spec-reviewer`): PLAYBOOK section 12's reviewer template, with the lens's charter from section 6 pasted in full.
  - Use a frozen snapshot of v0.9 (`git show <sha>:docs/spec/v2.md > .shadow/v2-tools/review/snapshots/v2@<sha>.md`), and give exact line ranges from it.
  - **M1:** the test author and the vendor-fact checker. Already refuted, not to raise again without new evidence: R-M1-54, and R-M1-19's mid-turn half.
  - **F:** the test author and the consistency auditor. Already refuted: R-F-4 and R-F-46.
  - Each reviewer sees only its own lens and none of the other round's open findings.
- **Verifier** (one packet per `spec-verifier` agent):

  ```
  Spec 2.0 review, unit <U>, round <n>. Verify the findings in docs/spec/review/batches/<packet>.md.
  Try to refute each finding: check the cited text and the whole spec for anything that already covers it; settled.md and docs/adr/ (is it a settled owner decision?); whether the scenario can really happen; and, for vendor facts, the official documentation.
  Sources: the spec as reviewed, <snapshot path> (findings cite its lines); docs/spec/review/settled.md; docs/adr/; the archived 2.0 draft, docs/legacy/spec/shadow-army-2.0.md (grep it); v1's code in src/; docs/spec/review/evidence/ (its README lists what is there); Codex's draft (read only, grep it); every other finding in one line each in docs/spec/review/ledger.md, only to name a DUPLICATE.
  Open decisions: D-1 to D-19 in docs/spec/review/decisions.md.
  Return one block per finding: id, verdict (CONFIRMED, DECISION, DUPLICATE, REFUTED or NEEDS-PROBE), severity (as given, or changed with a reason), evidence (lines, URLs), reason (one sentence). For CONFIRMED add "fix:" with the smallest change to the spec text, in its style, or "as proposed". For DECISION add "options:" and "big or technical:" by PLAYBOOK section 14 (when unsure, big). Read only the lines you need. No preamble and no summary.
  ```

## 6. Tools and habits that worked

- **Tools** (`docs/spec/review/tools/`):
  - `packet.mjs` builds a verification packet from raw reports;
  - `set-verdicts.mjs <ledger> <verdicts.json>` fills in a finding's verdict and resolution cells;
  - `extract.mjs` saves an agent's report from its transcript without reading it into context;
  - `pairs.mjs` turns OLD/NEW text blocks into the pairs that `rep.mjs` applies, and `rep.mjs` refuses any old text that doesn't occur exactly once;
  - `trace-v2.mjs` and `check-appendix-c.mjs` are the checkers.
- **Saving a report:** the tasks folder's `.output` files stay empty. Copy `~/.claude/projects/C--Users-johns-projects-AIConnections/<session>/subagents/agent-<id>.jsonl` to `<scratch>/tasks/<id>.output`, then run `TASKS_DIR=<scratch>/tasks node tools/extract.mjs <id> raw/<name>.md "<header>"`.
- **An agent cut off by a usage limit:** in the same session, send it a message (SendMessage) once the limit resets, and it continues; that worked for M1-FC2 and D-7's drafter on 2026-10-16. A new session can't resume it, so rerun it from its prompt, as session 3 did for M1-FC1 and the D-3 judge. Keep every prompt you send in `decisions.md` or here, so it can be rerun.
- **A spec that moves:** give an agent that runs while you edit a frozen snapshot, as D-7's drafter had. Never edit the spec while a fix checker reads it: draft the repairs, and apply them once it reports.
- **The shell:** Git Bash collapses `\\` in a command, even inside a quoted heredoc, and a heredoc of long table rows can fail to parse. Write scripts and rows with the Write tool, then append them with `cat <file> >> ledger.md`.
- **Pace:** two agents at a time take 15 to 25 minutes each. On 2026-10-16 one five-hour window covered about four agent runs, of 200k to 400k tokens each.
- **Keep the orchestrator's own context small.** Read the ledger and raw files in parts, and start a new session once a large pass is done.
