# Handoff to the next session

Written 2026-10-14 at the end of session 7ac7daad; rewritten 2026-10-16 at the end of session 3, and 2026-10-17 at the end of session 4. Paste the prompt in section 1. Sections 2 to 6 give the detail the prompt points to. `STATE.md` is newer than this file wherever they differ.

## 1. The prompt

On the owner's Windows machine, start Claude Code in `C:\Users\johns\projects\AIConnections`, the main checkout, so that the two agent types load. On a cloud machine, do section 3's setup first.

```
Continue the Shadow Army spec 2.0 review (issue #63). The review lives on PR #77 ("#63 Ultimate Spec Review"), branch claude/63-ultimate-spec-review, in docs/spec/review/. On the owner's Windows machine it is checked out in the worktree ../AIConnections-review: edit and commit there, never in the main checkout. Elsewhere: git fetch origin && git checkout claude/63-ultimate-spec-review.

Read, in this order: CLAUDE.md, CONTRIBUTING.md, docs/spec/review/NEXT-SESSION.md (all of it), docs/spec/review/STATE.md, docs/spec/review/spec2.0_review_flow.md (the rules; it wins over PLAYBOOK.md), then the ledger and decisions.md as you need them.

The spec is v0.10. I answered ten cards on 2026-10-17, and D-7's card is new. First read my decisions doc (https://claude.ai/code/artifact/783b080a-cade-4038-9c8a-6a6738ccb844): its "Your answer" column and comments, with the docs tools, at the start and again before each report. Then apply my answers as v0.11, with D-7's merge once I've answered it, run the checkers, and fix-check what changed. Then run round 2 for M1 and F on v0.11, and verify F's round-2 findings. If the session starts in a fresh five-hour window, run more than two agents at a time, until I say the weekly limit is close. Commit and push after every result that changes a doc, and after every pass update STATE.md and comment on PR #77. Keep C:\Users\johns\projects\AIConnections\codex-claude-status.md current: tick the Review column and lists at each step (Codex keeps the Build column), and mark a milestone converged only after its two clean rounds and two sign-offs, since that is Codex's signal to build it.

Answer me straight to the point. I answer only big questions, as short decision cards with a tested recommendation.
```

## 2. Where things stand

`STATE.md` has the detail. In short, on 2026-10-17:

- **PR #77** (draft) is stacked on #76. The spec is v0.10 (`e7c33b4`), and both checkers give 0 problems (101 requirements, 61 ACs). `main` is v0.5.
- **M1:** round 1 closed (fixed in v0.8, fix-checked three times, follow-ups repaired in v0.9 and v0.10). Open: R-M1-59 (P1, with D-3) and R-M1-82 (D-19), both now answerable; R-M1-71 is parked for M2.
- **F:** round 1 closed (v0.7). Round 2's test author raised R-F-68 to R-F-85 (1 P1, 15 P2, 2 P3) on v0.9; none is verified.
- **Decisions:**
  - The owner's answers of 2026-10-17, none applied yet: D-3 **B**, D-4 **A**, D-5 **B**, D-8 **B**, D-9 **A**, D-10 **A**, D-16 **A** (over the recommended B), D-17 **B**, D-19 **A**. D-11 is marked **Other** with no note, and a comment on its row asks what the owner wants.
  - D-7: judged A, technical, with parts of C. Its two big parts are on a card sent 2026-10-17: every message without a kind is read-only, the owner's own included, and NEW-2's residual.
  - Settled earlier: D-1 (A), D-2, D-6, D-12 to D-15, D-18, D-20 (A), D-21 (A).
- **Probes** P-1 to P-13 wait for the owner's go. P-12 shows how D-19's answer is applied.
- **M1 (#75)** is Codex's draft, paused at `04ab953` until the spec's M1 text converges. Read it, never write to it. On the owner's machine it is in `../AIConnections-m1`.

## 3. Setup

**On the owner's Windows machine:**
- The worktree `../AIConnections-review` already has the branch, and `.claude/agents/` in the main checkout already holds `spec-reviewer` and `spec-verifier`.
- Check that the worktree is clean and up to date: `git -C ../AIConnections-review status`, then `git -C ../AIConnections-review pull`.
- The snapshots are in `.shadow/v2-tools/review/snapshots/`: `v2@be9deb0.md` (round 1), `v2@1580e87.md` (v0.8), `v2@b6f4315.md` (v0.9) and `v2@e7c33b4.md` (v0.10). Make v0.11's the same way once it lands: `git show <sha>:docs/spec/v2.md > .shadow/v2-tools/review/snapshots/v2@<sha>.md`, from Git Bash.
- Claude Code's mod typings are in `.shadow/v2-tools/review/evidence/mod-api-2.1.294/`.

**On a cloud machine:**
1. `git fetch origin && git checkout claude/63-ultimate-spec-review && npm install`
2. `mkdir -p .claude/agents && cp docs/spec/review/agents/*.md .claude/agents/ && echo ".claude/agents/" >> .git/info/exclude`, then restart Claude Code in that folder.
3. `git worktree add ../shadow-army-m1 origin/codex/63-m1-post-office`, Codex's M1 draft, read only.
4. `mkdir -p ../review-scratch && for s in b6f4315 e7c33b4; do git show $s:docs/spec/v2.md > ../review-scratch/v2@$s.md; done`.

The cloud machine has no `the-future` idea files, no `.shadow/`, no WSL and none of the owner's CLI logins. So Appendix C's checker, probes and the second brain stay on the owner's machine.

**The second brain** (the owner's global CLAUDE.md asks for it): on the owner's machine, retrieve the brief at the start with `bash /c/Users/johns/Obsidian-codex-setup/brain.sh brief --cwd "$PWD" --query '<the task>' --json`. The project is registered as `shadow-army`. Capture a handoff at the end.

## 4. What to do first

1. **Read the decisions doc** with the docs tools: D-7's answer, D-11's note (the comment on its row in the "At a glance" table), and anything new. Record each answer in `decisions.md` (index and record).
2. **Apply the answers as v0.11**, one OLD/NEW file per decision in `drafts/answers/` (the format is in `tools/pairs.mjs`). Read each decision's record in `decisions.md` and its ledger rows, and only the v0.10 lines they name.
   - **D-3 (B):** `raw/D-3-option-B.md`, merged onto v0.10's PO-1 to PO-3 (193-216) and Q8, with R-M1-59 (the guardian dying with the post office), R-M1-61 and R-F-68 (a soldier whose containment can't be set up doesn't start).
   - **D-16 (A), D-17 (B), D-19 (A), D-9 (A), D-10 (A), D-8 (B):** short; their cards and records give the text. D-19 goes with R-M1-82.
   - **D-4 (A, an informative appendix) and D-5 (B, the caps now, logs after 2.0)** need their text drafted first: a drafter each (section 5), or by hand. D-4 can start from the 2.0 draft's threat model (`docs/legacy/spec/shadow-army-2.0.md` 147-170).
   - **D-7**, once answered: the merge plan is in `decisions.md`, D-7, with R-F-58 and R-F-86 to R-F-88.
   - **D-11**, once the owner says what "Other" means.
   - Dry-run every file on a scratch copy, in order, and run `tools/trace-v2.mjs <copy> <v2@e7c33b4.md>`. Then apply, bump the header to 0.11 with a one-line summary, run both checkers, commit, and mark the ledger rows.
3. **A fix check** of what v0.11 changed (packet `batches/ANS-FC1.md`, the way `M1-FC3.md` is written), beside the D-4 and D-5 drafters if they still run.
4. **Round 2 on v0.11's snapshot:** M1's test author and vendor-fact checker, F's consistency auditor, and verifiers for R-F-68 to R-F-85, whose line numbers are v0.9's.

## 5. Agent prompts

- **Round 2 reviewers** (`spec-reviewer`): in `decisions.md`, "Prompts to rerun". They name v0.10's snapshot and line ranges: change both to v0.11's. Each reviewer sees only its own lens and none of the round's open findings. Already refuted, not to raise again without new evidence: R-M1-54, R-M1-19's mid-turn half and R-M1-62's declined variant for M1; R-F-4 and R-F-46 for F.
- **Fix check** (`spec-verifier`): the M1-FC3 prompt in `decisions.md`, with the packet, the version and the snapshot changed.
- **Drafter for D-4 or D-5** (`spec-reviewer`): the D-7 option A drafter's prompt in `decisions.md`, with its task sentence replaced by the owner's answer (D-4: "an informative appendix: assets, actors, trust boundaries, and what is prevented versus only detected, including the residuals the owner accepted in D-7, D-9 and D-19"; D-5: "caps on queues, sends and sizes, each with its value, what happens at the cap, and its AC; logs after 2.0"), and the v0.11 snapshot.
- **Verifier** (one packet per `spec-verifier` agent):

  ```
  Spec 2.0 review, unit <U>, round <n>. Verify the findings in docs/spec/review/batches/<packet>.md.
  Try to refute each finding: check the cited text and the whole spec for anything that already covers it; settled.md and docs/adr/ (is it a settled owner decision?); whether the scenario can really happen; and, for vendor facts, the official documentation.
  Sources: the spec as reviewed, <snapshot path> (findings cite its lines), and the current spec, <snapshot path> (say where a finding is already fixed or moved); docs/spec/review/settled.md; docs/adr/; the archived 2.0 draft, docs/legacy/spec/shadow-army-2.0.md (grep it); v1's code in src/; docs/spec/review/evidence/ (its README lists what is there); Codex's draft (read only, grep it); every other finding in one line each in docs/spec/review/ledger.md, only to name a DUPLICATE.
  Open decisions: those still open in docs/spec/review/decisions.md.
  Return one block per finding: id, verdict (CONFIRMED, DECISION, DUPLICATE, REFUTED or NEEDS-PROBE), severity (as given, or changed with a reason), evidence (lines, URLs), reason (one sentence). For CONFIRMED add "fix:" with the smallest change to the spec text, in its style, or "as proposed". For DECISION add "options:" and "big or technical:" by PLAYBOOK section 14 (when unsure, big). Read only the lines you need. No preamble and no summary.
  ```

## 6. Tools and habits that worked

- **Tools** (`docs/spec/review/tools/`):
  - `packet.mjs` builds a verification packet from raw reports;
  - `set-verdicts.mjs <ledger> <verdicts.json>` fills in a finding's verdict and resolution cells;
  - `extract.mjs` saves an agent's report from its transcript without reading it into context;
  - `pairs.mjs` turns OLD/NEW text blocks into the pairs that `rep.mjs` applies, and `rep.mjs` refuses any old text that doesn't occur exactly once (it works on `decisions.md` too);
  - `trace-v2.mjs` and `check-appendix-c.mjs` are the checkers.
- **Saving a report:** the tasks folder's `.output` files stay empty. Copy `~/.claude/projects/C--Users-johns-projects-AIConnections/<session>/subagents/agent-<id>.jsonl` to `<scratch>/tasks/<id>.output`, then run `TASKS_DIR=<scratch>/tasks node tools/extract.mjs <id> raw/<name>.md "<header>"`.
- **An agent cut off by a usage limit:** in the same session, send it a message (SendMessage) once the limit resets, and it continues; that worked for M1-FC2 and D-7's drafter on 2026-10-16, and for D-7's judge and F's test author on 2026-10-17. A new session can't resume it, so rerun it from its prompt. Keep every prompt you send in `decisions.md` or here.
- **A spec that moves:** give an agent that runs while you edit a frozen snapshot. Never edit the spec while a fix checker reads it: draft the repairs, and apply them once it reports.
- **The shell:** Git Bash collapses `\\` in a command, even inside a quoted heredoc, and a heredoc of long table rows can fail to parse. Write scripts and rows with the Write tool, then insert them with a small node script.
- **The decisions doc:** `read` with the doc's id, then `read` the body node `7cf8171f-cab5` (prose) with `{"kind":"view","sinceRev":<last rev>}` to see only what changed; the "At a glance" table is `m3ws82nnxhc.587`, and its answers are dropdowns of the enum `22af9813-6ac5`. Comments: `query` utterances under the tab `5a151593-8371`. The doc was at rev 39 at the end of session 4.
- **Pace:** an agent takes 15 to 30 minutes and 200k to 400k tokens. On 2026-10-17 two agents running together hit the five-hour limit in the afternoon.
- **Keep the orchestrator's own context small.** Read the ledger and raw files in parts, and start a new session once a large pass is done.
