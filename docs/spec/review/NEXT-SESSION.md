# Handoff to the next session

Written 2026-10-14 at the end of session 7ac7daad; rewritten 2026-10-16 at the end of session 3, 2026-10-17 at the end of session 4, and 2026-10-20 at the end of session 5. Paste the prompt in section 1. Sections 2 to 6 give the detail the prompt points to. `STATE.md` is newer than this file wherever they differ.

## 1. The prompt

On the owner's Windows machine, start Claude Code in `C:\Users\johns\projects\AIConnections`, the main checkout, so that the two agent types load. On a cloud machine, do section 3's setup first.

```
Continue the Shadow Army spec 2.0 review (issue #63). The review lives on PR #77 ("#63 Ultimate Spec Review"), branch claude/63-ultimate-spec-review, in docs/spec/review/. On the owner's Windows machine it is checked out in the worktree ../AIConnections-review: edit and commit there, never in the main checkout. Elsewhere: git fetch origin && git checkout claude/63-ultimate-spec-review.

Read, in this order: CLAUDE.md, CONTRIBUTING.md, docs/spec/review/NEXT-SESSION.md (all of it), docs/spec/review/STATE.md, docs/spec/review/spec2.0_review_flow.md (the rules; it wins over PLAYBOOK.md), then the ledger and decisions.md as you need them.

The spec is v0.12. Round 2 of F and M1 is reviewed and verified (on v0.11) and not clean. My answers to every card are recorded in decisions.md (D-7 A, D-11 read as A, D-22 A, D-23 A on 2026-10-20). Write every ledger row marked "repair pending (v0.13)" as spec v0.13, those answers included: draft the small repairs yourself as OLD/NEW blocks, and use a Sonnet drafter only for a big merge. Run both checkers, then one fix check of v0.12 and v0.13 together on Opus. Then round 3 for F and M1. Follow spec2.0_review_flow.md section 4's token rules: two or three agents at a time, never five; verify only P0 to P2; Sonnet for mechanical agents; tight packets; a fresh session after each big pass. Commit and push after every result that changes a doc, and after every pass update STATE.md and comment on PR #77. Keep C:\Users\johns\projects\AIConnections\codex-claude-status.md current: tick the Review column and lists at each step (Codex keeps the Build column), and mark a milestone converged only after its two clean rounds and two sign-offs, since that is Codex's signal to build it.

Answer me straight to the point. I answer only big questions, as short decision cards with a tested recommendation. Put new cards in an artifact; the old decisions doc no longer opens from my account, so make a new one, and I'll answer in it or paste my answers back in chat.
```

## 2. Where things stand

`STATE.md` has the detail. In short, on 2026-10-20:

- **PR #77** (draft) is stacked on #76. The spec is **v0.12** (`2493a82`), and both checkers give 0 problems (115 requirements, 75 ACs). `main` is v0.5.
- **v0.11** (`af97372`) applied the owner's answers to D-3, D-4, D-5, D-8, D-9, D-10, D-16, D-17 and D-19, fix-checked by ANS-FC1. **v0.12** repaired what ANS-V1, ANS-V2 and ANS-FC1 found. v0.12 is not fix-checked yet: the next fix check covers v0.12 and v0.13 together.
- **Round 2, on v0.11**, is reviewed and verified for both units, and neither is clean:
  - F: the test author (R-F-68 to R-F-85) and the consistency auditor (R-F-97 to R-F-112); verifiers F-R2-V1 and V2.
  - M1: the test author (R-M1-114 to R-M1-139) and the vendor-fact checker (R-M1-140 to R-M1-150); verifiers M1-R2-V1 to V3.
  - Every confirmed one has a ledger row whose resolution starts "repair pending (v0.13)", with its fix text there or in the verifier's raw report. Technical choices already made: R-F-73 (c), R-F-74 (b), R-F-79 (a), R-F-80 (a), R-M1-140 (b), R-M1-141 (a).
- **Every decision is answered** (2026-10-20, pasted in chat): **D-7 A** (only a message of the kind build makes a soldier write), **D-22 A** (ARM-7's trust card also covers `.mcp.json`), **D-23 A** (the guard skips the repository's other working trees), and **D-11** "Other" with the note "do as claude has", read as **A** (none of `/clear`, `/resume` and `/branch` ends the army, as Claude Code keeps its own background work; evidence and the open technical points in `decisions.md`, D-11; the owner may correct the reading). All are ledger rows marked "repair pending (v0.13)".
- **The decisions doc** doesn't open from the account the owner now uses ("not shared"; the Artifact tool sees it as another organization's). Send any new card in chat, unless the owner has logged back in.
- **Probes** P-1 to P-13 wait for the owner's go. Spike S7 runs in M1 on CI's runners; its Mac questions are M6 (R-M1-151).
- **M1 (#75)** is Codex's draft, paused at `04ab953` until the spec's M1 text converges. Read it, never write to it. On the owner's machine it is in `../AIConnections-m1`.

## 3. Setup

**On the owner's Windows machine:**
- The worktree `../AIConnections-review` already has the branch, and `.claude/agents/` in the main checkout already holds `spec-reviewer` and `spec-verifier`.
- Check that the worktree is clean and up to date: `git -C ../AIConnections-review status`, then `git -C ../AIConnections-review pull`.
- The snapshots are in `.shadow/v2-tools/review/snapshots/`: `v2@be9deb0.md` (round 1), `v2@1580e87.md` (v0.8), `v2@b6f4315.md` (v0.9), `v2@e7c33b4.md` (v0.10), `v2@af97372.md` (v0.11, which round 2 reviewed) and `v2@2493a82.md` (v0.12). Make v0.13's the same way once it lands: `git show <sha>:docs/spec/v2.md > .shadow/v2-tools/review/snapshots/v2@<sha>.md`, from Git Bash.
- Claude Code's mod typings are in `.shadow/v2-tools/review/evidence/mod-api-2.1.294/`.

**On a cloud machine:**
1. `git fetch origin && git checkout claude/63-ultimate-spec-review && npm install`
2. `mkdir -p .claude/agents && cp docs/spec/review/agents/*.md .claude/agents/ && echo ".claude/agents/" >> .git/info/exclude`, then restart Claude Code in that folder.
3. `git worktree add ../shadow-army-m1 origin/codex/63-m1-post-office`, Codex's M1 draft, read only.
4. `mkdir -p ../review-scratch && for s in b6f4315 e7c33b4; do git show $s:docs/spec/v2.md > ../review-scratch/v2@$s.md; done`.

The cloud machine has no `the-future` idea files, no `.shadow/`, no WSL and none of the owner's CLI logins. So Appendix C's checker, probes and the second brain stay on the owner's machine.

**The second brain** (the owner's global CLAUDE.md asks for it): on the owner's machine, retrieve the brief at the start with `bash /c/Users/johns/Obsidian-codex-setup/brain.sh brief --cwd "$PWD" --query '<the task>' --json`. The project is registered as `shadow-army`. Capture a handoff at the end.

## 4. What to do first

1. **The owner's answers are in** `decisions.md` (D-7, D-11, D-22, D-23). If the doc opens again (rev 48 at the end of session 5), check it only for a new comment.
2. **Write v0.13** from the ledger rows marked "repair pending (v0.13)": grep `ledger.md` for them (about 45 rows, F's and M1's). Each row's resolution, or its verifier's raw report (`raw/F-r2-verify-V1.md`, `V2.md`, `raw/M1-r2-verify-V1.md` to `V3.md`), gives the fix. Work against `v2@2493a82.md` (v0.12), whose lines differ from the v0.11 lines the findings cite.
   - Draft them yourself as OLD/NEW blocks in `drafts/v013/`, a file per area (CH-2 and PO-1; PO-3, PO-19 and Windows hardening; ARM-7; M1's ACs; §5.1 and VER; Appendix D), the way `drafts/v012/repairs1b.txt` is written. A Sonnet drafter only if one area grows into a big merge.
   - Where two rows touch one AC or requirement (R-M1-116 with R-M1-139; R-M1-126 with R-M1-137; R-M1-124 with R-M1-111's v0.12 text), write one block.
   - Add the owner's answers: D-7's merge (the plan in `decisions.md`, D-7, written against v0.10, with R-F-58 and R-F-86 to R-F-88; the one big merge, so a Sonnet drafter may take it); D-11 as A (PO-7's shutdown only when the process ends, SES-1, M1-AC8's `/clear` case, and the open points in its record); D-22 A (ARM-7, Appendix D's residual 8); D-23 A (ARM-6, WSP-10, WSP-11, M1-AC11, Appendix D).
   - Dry-run on a copy of v0.12, run `tools/trace-v2.mjs <copy> <v2@2493a82.md>` and `tools/check-appendix-c.mjs`, then apply, bump the header to 0.13, commit, snapshot, and mark the rows "fixed (v0.13)".
3. **One fix check** (Opus) of v0.12 and v0.13 together, against v0.11: a packet like `batches/ANS-FC1.md` listing each repair's rows and where it landed.
4. **Round 3 for F and M1** on v0.13's snapshot, two reviewers per unit, with lenses not yet used and always the implementer or the red team (PLAYBOOK section 6): for M1, the red team and the enterprise operator; for F, the implementer and the owner's advocate. Verify only their P0 to P2.

## 5. Agent prompts

- **Reviewers** (`spec-reviewer`, Opus): in `decisions.md`, "Prompts to rerun", and the round-2 versions in `drafts/answers/PROMPTS.md` ("After v0.11"), which give v0.11's line ranges and paste the lens charter from PLAYBOOK section 6. For round 3, change the snapshot and line ranges to v0.13's, and the lens. Each reviewer sees only its own lens and none of the round's open findings. Already refuted or declined, not to raise again without new evidence: for M1, R-M1-54, R-M1-19's mid-turn half, R-M1-62's variant, R-M1-101, R-M1-107, R-M1-114, R-M1-128, R-M1-131, R-M1-132, R-M1-138 and R-M1-149; for F, R-F-4, R-F-46, R-F-69 and R-F-108.
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
- **The decisions doc:** `read` with the doc's id, then `read` the body node `7cf8171f-cab5` (prose) with `{"kind":"view","sinceRev":<last rev>}` to see only what changed; the "At a glance" table is `m3ws82nnxhc.587`, and its answers are dropdowns of the enum `22af9813-6ac5`. Comments: `query` utterances under the node `7cf8171f-cab5`. A card is a `## D-n.` heading, "Recommended:", a list of options, "**Tested:**" and "**For you:**"; a new row's answer cell takes a dropdown chip of that enum. The doc was at rev 48 at the end of session 5.
- **Pace:** an agent takes 5 to 15 minutes and 130k to 290k tokens (session 5's verifiers, drafters and reviewers). On 2026-10-20 five agents at once hit the five-hour limit twice; the owner then set the token rules (`spec2.0_review_flow.md` section 4, rules 4 to 9).
- **Ledger rows by script:** session 5 inserted rows with small node scripts that splice after the last `| R-F-` or `| R-M1-` row, and set verdicts with `tools/set-verdicts.mjs`. `tools/fence.mjs` copies a report's fenced OLD/NEW blocks into a draft, and `tools/number.mjs` turns placeholder IDs (`NEW-D3-1`) into real ones from a JSON map.
- **Keep the orchestrator's own context small.** Read the ledger and raw files in parts, and start a new session once a large pass is done.
