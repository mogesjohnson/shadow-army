# Handoff to the next session

Written 2026-10-14 at the end of session 7ac7daad; rewritten at the end of sessions 3, 4 and 5, and on 2026-10-21 at the end of session 7. Paste the prompt in section 1. Sections 2 to 6 give the detail the prompt points to. `STATE.md` is newer than this file wherever they differ.

## 1. The prompt

On the owner's Windows machine, start Claude Code in `C:\Users\johns\projects\AIConnections`, the main checkout, so that the two agent types load. On a cloud machine, do section 3's setup first.

```
Continue the Shadow Army spec 2.0 review (issue #63). The review lives on PR #77 ("#63 Ultimate Spec Review"), branch claude/63-ultimate-spec-review, in docs/spec/review/. On the owner's Windows machine it is checked out in the worktree ../AIConnections-review: edit and commit there, never in the main checkout. Elsewhere: git fetch origin && git checkout claude/63-ultimate-spec-review.

Read, in this order: CLAUDE.md, CONTRIBUTING.md, docs/spec/review/NEXT-SESSION.md (all of it), docs/spec/review/STATE.md, docs/spec/review/spec2.0_review_flow.md (the rules; it wins over PLAYBOOK.md), then the ledger and decisions.md as you need them.

The spec is v0.14 (02d5f84). Fix check V13-FC1 passed v0.12 and v0.13 but for R-M1-108, and v0.14 repairs everything it found. Two cards wait for me in the doc "Spec 2.0 Review: New Decisions": D-24 (recommended B) and D-25 (recommended A). First check that doc's table for my answers; if they are in, apply them as v0.15 (small OLD/NEW blocks you draft yourself, both checkers). Then run fix check V14-FC1 (of v0.14, and v0.15 if you made it) and round 3 for F and M1, with the prompts in docs/spec/review/drafts/r3/PROMPTS.md: the fix check and M1's red team and enterprise operator first, then F's implementer and owner's advocate. Verify only their P0 to P2, repair, and count the round. Follow spec2.0_review_flow.md section 4's token rules: two or three agents at a time, never five; Sonnet for mechanical agents; the effort rule 6 sets for every agent, passed on each Sonnet call, and xhigh for a P0's verifier; tight packets; a fresh session after each big pass. Commit and push after every result that changes a doc, and after every pass update STATE.md and comment on PR #77. Keep C:\Users\johns\projects\AIConnections\codex-claude-status.md current: tick the Review column and lists at each step (Codex keeps the Build column), and mark a milestone converged only after its two clean rounds and two sign-offs, since that is Codex's signal to build it.

Answer me straight to the point. I answer only big questions, as short decision cards with a tested recommendation. Put new cards in the doc "Spec 2.0 Review: New Decisions" (https://claude.ai/artifact/KpmKMUugoKwc1W4F65C931); I'll answer in it or paste my answers back in chat.
```

## 2. Where things stand

`STATE.md` has the detail. In short, on 2026-10-21:

- **PR #77** (draft) is stacked on #76. The spec is **v0.14** (`02d5f84`), and both checkers give 0 problems (119 requirements, 81 ACs; Appendix C 118 rows). `main` is v0.5.
- **v0.13** (`ecf1e80`) wrote round 2's repairs of F and M1 and the owner's answers to D-7, D-11, D-22 and D-23. **Fix check V13-FC1** (`raw/V13-FC1.md`) checked v0.12 and v0.13 together: every repair FIXED, the three P1s included, except R-M1-108 (the guard's half). It confirmed R-F-120 (P2) and R-F-114 (P3), called R-F-117 a big decision, and raised R-F-126, R-M1-156 (both P2) and eight P3s. **v0.14** repairs all of them (`drafts/v014/repairs.txt`).
- **Round 2 is not clean** for either unit, so both units' streak of clean rounds is 0. Round 3 runs on v0.14 (or v0.15).
- **Open cards:** D-24 (R-F-117: an owner's edit in a soldier's worktree, made after a read-only turn's revert, is reverted when the CLI then starts a turn by itself; A accept, **B a y/n card (recommended)**, C refresh while idle) and D-25 (R-M1-160: after `/clear`, a reply to an older brief **A wakes the Monarch, as Claude Code does (recommended)**, or B waits for the owner's next message, v0.14's text). Both in the new doc, and recorded in `decisions.md`.
- **The new decisions doc** "Spec 2.0 Review: New Decisions" (https://claude.ai/artifact/KpmKMUugoKwc1W4F65C931) belongs to the owner's current account. The old doc (rev 48) doesn't open from it.
- **Probes** P-1 to P-15 wait for the owner's go. Spike S7 runs in M1 on CI's runners; its Mac questions are M6 (R-M1-151).
- **M1 (#75)** is Codex's draft, paused at `04ab953` until the spec's M1 text converges. Read it, never write to it. On the owner's machine it is in `../AIConnections-m1`.

## 3. Setup

**On the owner's Windows machine:**
- **Effort:** if the owner's answers to D-24 and D-25 are in, this session writes v0.15, so start it with `claude --effort xhigh` or run `/effort xhigh`; otherwise `high` is enough (flow section 4, rule 6). Don't use `CLAUDE_CODE_EFFORT_LEVEL`, which overrides every agent's effort.
- The worktree `../AIConnections-review` already has the branch, and `.claude/agents/` in the main checkout already holds `spec-reviewer` and `spec-verifier` (both `effort: high`, as in `docs/spec/review/agents/`).
- Check that the worktree is clean and up to date: `git -C ../AIConnections-review status`, then `git -C ../AIConnections-review pull`.
- The snapshots are in `.shadow/v2-tools/review/snapshots/`, v0.14's included (`v2@02d5f84.md`). Make a new one with `git show <sha>:docs/spec/v2.md > .shadow/v2-tools/review/snapshots/v2@<sha>.md`, from Git Bash.
- Claude Code's mod typings are in `.shadow/v2-tools/review/evidence/mod-api-2.1.294/`; the v2 canvas's pages are in `.shadow/v2-tools/canvas/`.

**On a cloud machine:**
1. `git fetch origin && git checkout claude/63-ultimate-spec-review && npm install`
2. `mkdir -p .claude/agents && cp docs/spec/review/agents/*.md .claude/agents/ && echo ".claude/agents/" >> .git/info/exclude`, then restart Claude Code in that folder.
3. `git worktree add ../shadow-army-m1 origin/codex/63-m1-post-office`, Codex's M1 draft, read only.
4. `mkdir -p ../review-scratch && git show 02d5f84:docs/spec/v2.md > ../review-scratch/v2@02d5f84.md`, and point the prompts' snapshot paths there.

The cloud machine has no `the-future` idea files, no `.shadow/`, no WSL and none of the owner's CLI logins. So Appendix C's checker, probes, the canvas pages and the second brain stay on the owner's machine.

**The second brain** (the owner's global CLAUDE.md asks for it): on the owner's machine, retrieve the brief at the start with `bash /c/Users/johns/Obsidian-codex-setup/brain.sh brief --cwd "$PWD" --query '<the task>' --json`. The project is registered as `shadow-army`. Capture a handoff at the end.

## 4. What to do first

1. **Read the new doc for answers** (section 6, "The decisions doc"). If D-24 or D-25 is answered, record it in `decisions.md` and the ledger (R-F-117, R-M1-160), and write v0.15 against `v2@02d5f84.md`:
   - D-24 B: WSP-12's start state for a self-started turn (v0.14 line 796) gains a card listing each audited path that changed between the saved state and the turn's first event, y keeping them as the owner's (the saved state refreshed) and n reverting them, as the attribution card's y and n (ARM-6); M6-AC13's self-started case tests both answers; residual 11's fourth bullet goes, or names the race V13-FC1 described. D-24 A: residual 11's bullet loses "this part for the owner to accept". D-24 C: the post office refreshes the saved state from changes seen while the soldier is idle; residual 11 states the race.
   - D-25 A: MSG-5's last sentence (v0.14 line 609) becomes "It wakes Claude as any summary does (MSG-8)"; PO-7's "What it outlives" (252) needs no change. D-25 B: nothing changes.
   - Dry-run on a copy, run both checkers, apply, bump the header to 0.15, commit, snapshot, and point `drafts/r3/PROMPTS.md` and `batches/V14-FC1.md` at the new snapshot and its line ranges.
2. **Start V14-FC1, M1's red team and M1's enterprise operator** together (three agents), from `drafts/r3/PROMPTS.md`, each with its charter pasted from PLAYBOOK section 6. When one comes back, save its report (section 6, "Saving a report"), commit, and start the next of F's two reviewers.
3. **Collect each reviewer's findings** (ledger rows R-M1-161 on, R-F-132 on), dedupe, and verify only P0 to P2 in packets of up to eight (`tools/packet.mjs`). Repair what is confirmed, drafting the blocks yourself. A round with no confirmed P0, P1 or P2 is clean.

## 5. Agent prompts

- **Round 3 and V14-FC1:** `drafts/r3/PROMPTS.md`, ready to paste. Each reviewer sees only its own lens and none of the round's open findings.
- **Verifier** (one packet per `spec-verifier` agent):

  ```
  Spec 2.0 review, unit <U>, round <n>. Verify the findings in docs/spec/review/batches/<packet>.md.
  Try to refute each finding: check the cited text and the whole spec for anything that already covers it; settled.md and docs/adr/ (is it a settled owner decision?); whether the scenario can really happen; and, for vendor facts, the official documentation.
  Sources: the spec as reviewed, <snapshot path> (findings cite its lines), and the current spec, <snapshot path> (say where a finding is already fixed or moved); docs/spec/review/settled.md; docs/adr/; the archived 2.0 draft, docs/legacy/spec/shadow-army-2.0.md (grep it); v1's code in src/; docs/spec/review/evidence/ (its README lists what is there); Codex's draft (read only, grep it); every other finding in one line each in docs/spec/review/ledger.md, only to name a DUPLICATE.
  Open decisions: those still open in docs/spec/review/decisions.md.
  Return one block per finding: id, verdict (CONFIRMED, DECISION, DUPLICATE, REFUTED or NEEDS-PROBE), severity (as given, or changed with a reason), evidence (lines, URLs), reason (one sentence). For CONFIRMED add "fix:" with the smallest change to the spec text, in its style, or "as proposed". For DECISION add "options:" and "big or technical:" by PLAYBOOK section 14 (when unsure, big). Read only the lines you need. No preamble and no summary.
  ```

- **Fix checks:** the V14-FC1 prompt in `drafts/r3/PROMPTS.md`, with the packet, the versions and the snapshots changed.
- **Sign-off** (after two clean rounds): PLAYBOOK section 12's sign-off prompt, line 270.

## 6. Tools and habits that worked

- **Tools** (`docs/spec/review/tools/`):
  - `packet.mjs` builds a verification packet from raw reports;
  - `set-verdicts.mjs <ledger> <verdicts.json>` fills in a finding's verdict and resolution cells;
  - `extract.mjs` saves an agent's report from its transcript without reading it into context;
  - `pairs.mjs` turns OLD/NEW text blocks into the pairs that `rep.mjs` applies, and `rep.mjs` refuses any old text that doesn't occur exactly once (it works on `decisions.md` too);
  - `trace-v2.mjs <spec> <previous snapshot>` and `check-appendix-c.mjs <spec> <spec> C:/Users/johns/projects/the-future` are the checkers. The trace script reads "(from …)" in a requirement as a carry-over that Appendix A must list, so write version notes another way, such as "with claude 2.1.293 or later".
- **Saving a report:** the tasks folder's `.output` files are the transcripts. Copy `~/.claude/projects/C--Users-johns-projects-AIConnections/<session>/subagents/agent-<id>.jsonl` to `<scratch>/tasks/<id>.output`, then run `TASKS_DIR=<scratch>/tasks node tools/extract.mjs <id> raw/<name>.md "<header>"`.
- **An agent cut off by a usage limit:** in the same session, send it a message (SendMessage) once the limit resets, and it continues. A new session can't resume it, so rerun it from its prompt (session 7 reran V13-FC1 that way). Keep every prompt you send in a `PROMPTS.md` or here.
- **A spec that moves:** give an agent that runs while you edit a frozen snapshot. Never edit the spec while a fix checker reads it: draft the repairs, and apply them once it reports.
- **The shell:** Git Bash collapses `\\` in a command, even inside a quoted heredoc, and a heredoc of long table rows can fail to parse. Write scripts and rows with the Write tool, then insert them with a small node script.
- **The decisions doc** "Spec 2.0 Review: New Decisions": the Claude Docs connector (`batch`, `update`, `guide`; `read` and `query` load through ToolSearch). Doc id `986fc398-4395-4c2b-853e-c1895870b9ac`, body node `69857ecc-1142` (prose). To see what changed, `read` the body node with `{"kind":"view","sinceRev":4}` (rev 4 when session 7 ended). The "At a glance" table is `m05fpwrw4rr.150`, and its answers are dropdowns of the enum `71ccf7f8-8a0f` (A, B, C, Other). Comments: `query` utterances under the body node. A new card is a `## D-n.` heading, a short paragraph, "Recommended:", a list of options, "**Tested:**" and "**For you:**", plus a table row whose answer cell takes a dropdown chip of that enum.
- **Pace:** an agent takes 5 to 17 minutes and 130k to 350k tokens. On 2026-10-20 five agents at once hit the five-hour limit twice; the owner then set the token rules (`spec2.0_review_flow.md` section 4, rules 4 to 9).
- **Ledger rows by script:** insert rows with a small node script that splices after the last `| R-F-` or `| R-M1-` row, and set verdicts with `tools/set-verdicts.mjs`. `tools/fence.mjs` copies a report's fenced OLD/NEW blocks into a draft, and `tools/number.mjs` turns placeholder IDs into real ones from a JSON map.
- **Keep the orchestrator's own context small.** Read the ledger and raw files in parts, and start a new session once a large pass is done.
