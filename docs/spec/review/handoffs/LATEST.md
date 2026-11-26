# Handoff: orchestrator 50 (`fabbc7ed`) to orchestrator 51 (2026-11-26 ~05:00 UTC)

Self-contained: do not read older handoffs. Range `c845179` (orch-49's handoff) to this commit. The 5-hour figure was 88% at 04:52 UTC (resets about 07:30 UTC): **start no worker until it is under 80%.** No workers are running; every worker tab is closed.

## Owner's instructions in force

- **Speed-up five (the owner, 2026-11-26, "yes do all five"):**
  1. **Flat PRs:** one PR per milestone part, stacked at most one level (base = `claude/63-m1b` or another trunk). Commits stay within V6 (200 lines, 4 files); the PR may exceed 400/6 with `Overrides: V6, "yes do all five", 2026-11-26` in its body. The orchestrator folds small open PRs together.
  2. **Self-review before push:** each worker runs `spec-reviewer` (Sonnet) and the seven failure simulations on its diff first (step 4 of `.shadow/v2-tools/tasks/codex-fix-common.md`).
  3. **One lane until M1 is merged.** The Ink (v2.1) lane is paused: #145 to #151 wait for Codex; merge them when approved, no new Ink work.
  4. **Sonnet for most fixes.** Opus only for concurrency, process termination, security stores.
  5. **Merge on approval** (below).
- **Loop (the owner):** "codex to review then if fixes we make fixes then test then merge". Merge every PR as soon as Codex approves its exact head and its `Validation:` passes, unasked. Bottom-up: read each PR's head->base first; the PR whose base is the trunk merges first, then retarget its children (V14), then merge them. `gh pr ready <n>`, `gh pr merge <n> --merge --match-head-commit <40-char sha>`. Run merges as a script in its own tab: `wt.exe -w 0 new-tab --title merge-x "C:\Program Files\Git\bin\bash.exe" <script>` (TRACE typing into a fresh tab failed on focus). Branch deletion still needs the owner.
- A Codex file for every pushed fix or new PR in `C:/Users/johns/codex-reviews/shadow-army/`; **next free: 66**. Last Codex tick `2026-11-26T04:41:14Z`.
- Timers: hi 50 min, watch 5 min. Claude Code killed orch-50's timers for low memory at ~04:00. Start yours fresh.
- No second worker below 1.5 GB free; at most three workers.

## Done this session (verified on the remote)

- #138 C9, C10, C12 body (`146ac86`, `d11a2cf`, w152). C6 waits on the owner.
- #136 C9 (merged #120's audit `4c805c5`, `989e9bc`) and C2 (real `Get-Acl` owner/ACL check, new `src/v2/winAcl.ts`, `7b7c372`), head `0605f7f` (w155). Caveat: 11 synthetic-native `postOffice` tests time out in that worktree, also at the old head (environment, unconfirmed).
- Ink: merge-up #147->#148->#149->#150 (w154); #150 review 43 C1 to C3 `8e9e015`; new draft **#151** slice 5b keys `e5effb5` (w156; Linux pass on all 6 `src/v21/ui` test files). Not done: ASCII mode detection in `shadow.tsx` (hardcoded `false`), tiny-terminal check.
- **Merged** (Codex-approved heads): #91, #89 into `claude/63-m1a-transport`; #97 into `claude/63-m1a-slice`; #103 into `claude/63-m1a-fix-channel`; #108 into `claude/63-m1b-lease` (orch-50 swapped the order: #108 is #107's child). Open PRs 60 -> 55.

## Queue (main lane only; Sonnet unless noted)

1. **#107** (head `bec22dc`, now contains #108): merge `origin/claude/63-m1b` into `claude/63-m1b-lease`, resolve conflicts, test, push, Codex file; then merge on approval.
2. **Flatten plan (orchestrator, before more workers):** `gh pr list --state open --json number,headRefName,baseRefName`, map the stacks, pick folds: a PR whose base is another open PR folds into one PR into the trunk (merge the child branch into the parent; closing the child PR is an owner step, so ask). Write the plan in `.shadow/v2-tools/tasks/orch-51-flatten.md`.
3. #136 C1 (P0, per-command Git hold and exact audited apply; Opus) -> #144 C1 (P0), C6 -> #132 C1 (P0), C5, C10 to C12. Brief template: `tasks/w155-fix136-c9c2.md`.
4. Answer Codex's reviews of every pushed fix as they land; merge on approval.

## Waiting on the owner

1. #138 C6 (P0): change the profile ACL that grants Modify to `CodexSandboxUsers`, or change the check?
2. Spec Q11 (viewer credential and port), before M7.
3. Remove the unused worktree `AIConnections-worktrees/ui-v21-monarch`?
4. Closing child PRs when folding stacks (queue step 2).

## Lessons

- Repository Actions is disabled: `Validation:` says CI `blocked`, macOS `not_run`.
- Read head->base for every PR before a merge script.
- A worker under about 110k takes the next round of the same lane by `## Round <n>` in its brief plus a SendMessage.
