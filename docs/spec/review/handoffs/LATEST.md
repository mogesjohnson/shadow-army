# Handoff: session 11 (2026-10-27)

Written by **session 11** (no fork name). It started no agent and changed no spec text. It collected the owner's answers on a questions page, found why PR #77 closed, then stopped at the save point: it couldn't read `/context`, and the owner chose a fresh session over working past 120k. Read this after the runbook's section 1.

## The range

- Start `f1a98ad` (session 10 Fork 1's handoff). End: the commit that last changed this file (`git log -1 -- docs/spec/review/handoffs/LATEST.md`).
- `git diff f1a98ad..<end> --stat`: this file and `STATE.md` only. The spec is still **v0.19** (`65d0b43`).

## What happened outside this branch (2026-10-27)

- From 03:46 to 03:53 UTC, the owner's housekeeping session (in `C:\Users\johns\projects`, session `432ab393`, Opus subagents, on the owner's "review and merge") squash-merged #79, #82, #76 and #71. Main's CI at `72eba4d` passed on all three systems. Codex reviewed none of them.
- **#77 closed by itself** at 03:47:04Z: its base `claude/63-spec-ideas` (#76's branch) was deleted on merge. Nothing was lost. Main's `docs/spec/v2.md` is `be9deb0`, #76's head, which this branch contains, so `git merge origin/main` here conflicts only in `docs/spec/v2.md`; keep this branch's copy (`git checkout --ours docs/spec/v2.md`).
- The worktree `../AIConnections-v06` still has `claude/63-spec-ideas` checked out (gone on GitHub). Leave it; the owner cleans up with `!` commands.

## The owner's answers

From the questions page https://claude.ai/artifact/FsB2fmhYKMpsTUTgeqR14P (read with `ArtifactData`, action `list`, collection `answers`):

- **pr77 A:** merge main into this branch, keeping its spec, and open a new draft PR to main that links #77. Milestones go there.
- **budget A:** the review's PR may stay over 400 lines as a record (one exception). From now on each spec version goes in commits of at most 200 lines and 4 files: repair drafts, spec text, then ledger and state.
- **probes-short A:** run P-1, P-2, P-3 and P-10 to P-15 between agent passes (about 15 short sessions on the owner's logins, throwaway folders, approving nothing); results into `probes.md`, the ledger and the next version.
- **probe-p4 A:** later, before M3.
- **mac-ci A:** P-6 and P-8 now, on GitHub's macOS runners, from a workflow on its own branch that runs on push (nothing on main, no model call). P-6 records `spctl --status` first. P-5 stays a stated risk: the runner image gives `bash` and the runner Full Disk Access (`actions/runner-images`, `images/macos/scripts/build/configure-tccdb-macos.sh`).
- **tech A:** keep every technical choice of v0.16 to v0.19 (Node.js 22, git 2.34, host 2.1.294, moderate advisories fail CI, `NoDefaultCurrentDirectoryInExePath`, `taskkill /t /f`, N1 to N4, `<soldier>@<n>`, the defaults table in `decisions.md`).
- **probe-sac B** (said in chat; recorded on the page by Claude): leave Smart App Control off on the owner's PC; spike S7 settles it in M1. Facts: off here (`VerifiedAndReputablePolicyState` 0); this PC's build 26200.9711 can turn it on and off without reinstalling (the April 2026 update); GitHub's Windows runners are Windows Server, which has none.
- **alpha-q1 A:** carve #75 into slices; close it when the last lands. **alpha-q2 A:** a one-command session is fine as a step toward M1. Alpha Q3 and Q4: unanswered.
- **order:** no choice; the owner's note: "i want better commit and pr version control habits, we have had bad stuff. can you access the BEST-OF-AI-DEV template and keep what is good and practical? it is not done, grokbots made it and it has no reveiw!! i want you to access and make the rules going forward till i update."

## Next, in order

1. **v0.20: Smart App Control in the spec.** The owner, in chat: "update this in the spec, and set reminders all along the current spec till the end. so its always fresh. mark it right before places were the error is mostliky going to happen so the model will know that the error was that!!"
   - PO-19 (v0.19 line 450): a **Smart App Control** bullet beside ConstrainedLanguage mode. Windows 11's Smart App Control runs on App Control's engine and blocks code that is unsigned and unknown to Microsoft, DLLs and some scripts included, with no exception for one app. Until S7 it is unknown whether it runs the script in ConstrainedLanguage mode or blocks the DLL; either way the check fails (PO-14) and no soldier starts. The remedy on that machine is turning it off, since there is no hash rule for it and signing is a non-goal of v2.0. The owner's PC has it off (2026-10-27), so nothing there tests it.
   - One short "likely cause" note right before each place that failure shows, so a model debugging it knows the cause. Define the marker once in §0 (for example **Likely cause on Windows:** …) and keep each note non-normative (no new IDs), so the trace checker stays at 0. Places, by v0.19 line: 236 (the DACL run: the script's first run, before the secret), 316 (the guardian makes the Job Object), 357 (the package holds the script and DLL), 366 (the check's step 1), 374 (the refusal message: name Smart App Control as a cause too), 447 (`Add-Type -Path`), 467 (containment tests; the windows runner has no Smart App Control), 994 (VER-6 coverage of the C#), 1033 (S7: its Smart App Control result goes into PO-19), 1108 (M1-AC15), 1128 (M1-AC18), and the residual rows 1790 (12) and 1803 (3).
   - Both checkers; a ledger row for the owner's request; commits within budget A.
2. **The new draft PR** (pr77 A): in `../AIConnections-review`, `git merge origin/main` keeping this branch's spec, push, then `gh pr create --draft` with the template pasted in (title `#63 …`, `Validation:`, `Tracking: #63`, replaces #77, the six boxes, no closing keyword, budget A's exception named). Comment the link on #77 and #63.
3. **BEST-OF-AI-DEV rules** (the owner's note): review https://github.com/mogesjohnson/BEST-OF-AI-DEV `template/` (made by Grok bots, unreviewed), keep what is good and practical, and write the commit, PR and version-control rules this repo follows until the owner changes them. Weigh it against `CLAUDE.md`, `CONTRIBUTING.md`, the budgets in `Obsidian-codex-setup/docs/WORKFLOW.md`, and `~/projects/GITHUB_VERSION_CONTROL_PROMPT` (update that too). Its own issue and small PR on main; show the owner before replacing any `CLAUDE.md` rule.
4. The short probes (probes-short A) and P-6 and P-8 on CI (mac-ci A), between agent passes.
5. Then the earlier plan: round 4's verifiers (R-M1-206 to 218, R-F-157, R-F-158), M1's implementer and F's red team (`drafts/r4/PROMPTS.md`), and V18-FC1 over v0.18 to v0.20.

## What the files don't say

- Correction given to the owner: P-5 to P-8 are also in spike S7, which whoever builds M1 runs (Codex today); the review's own probes are the CLI ones.
- PR #81 has fix `adf0896` from the housekeeping agents, untested live, still a draft.
- The main checkout's `main` is 61 commits behind `origin/main`. Don't pull there: the owner's `story.txt` (staged) and `moges*.md` are in it.
- The status board wasn't touched; the dashboard is refreshed only when the owner asks.
- The untracked JSON drafts in `drafts/r3/` and `drafts/v015/` stay untracked.
