# Handoff: session 12, Fork 1 (2026-10-27)

Written by **Fork 1** of session 12 (session name `aiconnections-19`). It started no agent. It wrote spec v0.20, opened the review's new draft PR #83, and wrote the version-control rules (issue #84, draft PR #85). Then it stopped at the save point near 120k, before the probes and round 4. Read this after the runbook's section 1.

## The range

- Start `8a4f2b6` (session 11's handoff). End: the commit that last changed this file (`git log -1 -- docs/spec/review/handoffs/LATEST.md`).
- `git diff 8a4f2b6..<end> --stat -- docs/spec`: `drafts/v020/repairs.txt` (+131), `v2.md` (+20 −6), `ledger.md` (+1), `STATE.md`, and this file. The merge commit `bc16888` also brings in main's other files (12 files from #71, #76, #79 and #82). The spec is unchanged by the merge.
- Commits: `4575980` (repair draft), `4f481fc` (**spec v0.20**, snapshot `.shadow/v2-tools/review/snapshots/v2@4f481fc.md`), `d9e4934` (ledger R-M1-220 and STATE), `bc16888` (merge of `origin/main` at `72eba4d`, keeping this branch's spec).

## What is finished

- **v0.20** (the owner's Smart App Control request). PO-19 gets a **Smart App Control** bullet beside ConstrainedLanguage mode: what it blocks, its `VerifiedAndReputablePolicyState` value (0 off, 1 on, 2 evaluation, which can turn itself on later), turning it off as the remedy, and S7 to settle whether it puts the script in ConstrainedLanguage mode or blocks the DLL. PO-14 gets a message for it and "turn Smart App Control off" as a way forward, and M1-AC18 a unit case: with the value faked as 1, the message names it. S7 adds the question and records the value on each Windows runner. The non-goal and residual 3 name it too. §0 defines **Likely cause on Windows:** notes (informative, no IDs), and a note sits just before each of 13 places: PO-3's DACL run, PO-9's Windows guardian, PO-13's package, PO-14's step 1, PO-19's `Add-Type -Path` (Win32 error 4551, `ERROR_SYSTEM_INTEGRITY_POLICY_VIOLATION`, `0x800711C7`), PO-21's Windows runners, VER-6's C# coverage, M1-AC15, M1-AC18, and residual row 12. Trace 0 problems (119 requirements, 81 ACs); Appendix C 0 problems.
- **Correction to session 11's handoff:** GitHub's Windows **arm64** runner runs Windows 11, not Windows Server, so the spec doesn't claim that no runner has Smart App Control. S7 records each runner's value instead.
- **PR #83** (draft, base `main`): replaces #77, carries this branch, and is linked on #77 and #63. Its `format` check passes. Full three-OS CI runs only when a PR is ready (#79). Milestone comments go on #83 from now on.
- **Version-control rules:** issue #84, branch `claude/84-version-control-rules` (worktree `../AIConnections-vc`), draft **PR #85** (`8c72cea`, 67 lines, 2 files). `docs/version-control.md` has rules V1 to V18 from the BEST-OF-AI-DEV `template/RULES.md` (kept where practical, with a "not kept" list) and this repo's incidents. Among them: V6 size limits with totals in the PR body, V13 merge commits and no squash, V14 retargeting stacked PRs before their base merges, V11 no merge without the reviewer at the current head. The PR body lists 5 proposed `CLAUDE.md` changes for the owner; `CLAUDE.md` is unchanged. GitHub enforces nothing on `main` (no ruleset, no protection, every merge method allowed).

## Half-done

- `~/projects/GITHUB_VERSION_CONTROL_PROMPT` isn't updated with V1 to V18 yet. Do it once the owner accepts #85, or says to apply the rules as they stand.

## Next, in order

1. The owner's word on #85's five `CLAUDE.md` proposals, and Codex's review of #85.
2. The short probes (probes-short A: P-1, P-2, P-3, P-10 to P-15; owner's logins, throwaway folders, approving nothing; results to `probes.md`, the ledger, the next version) and P-6 and P-8 on macOS CI (mac-ci A: a workflow on a branch of its own that runs on push; P-6 records `spctl --status` first).
3. Round 4's verifiers (R-M1-206 to 218, R-F-157, R-F-158), M1's implementer and F's red team (`drafts/r4/PROMPTS.md`), and fix check **V18-FC1 over v0.18 to v0.20**. It now includes R-M1-220, the Smart App Control text, which nobody has verified yet.

## The owner's open questions

- Alpha Q3 and Q4 remain unanswered (questions page https://claude.ai/artifact/FsB2fmhYKMpsTUTgeqR14P).
- #85's `CLAUDE.md` proposals.

## What the files don't say

- In the CRLF working copy that `git checkout --ours` leaves, the trace checker reports `M1 implements unknown SHA-256`. The committed file (`git show :docs/spec/v2.md`) has 0 problems, so run the checkers on an LF copy.
- The untracked JSON drafts in `drafts/r3/`, `drafts/v015/`, `drafts/v016/` and `drafts/v020/pairs.json` stay untracked.
- The main checkout is untouched (the owner's `story.txt` is staged there). `../AIConnections-v06` is still stale, and the owner removes it.
- The status board and the dashboard weren't touched.
