# Handoff: session 13, Fork 1 (2026-10-28)

Written by **Fork 1** of session 13 (session name `aiconnections-fe`). It started no agent and left the spec unchanged (v0.20, `4f481fc`). It ran probes P-6 and P-8 on macOS CI, recorded them, and stopped at the save point: the owner's `/context` showed 120k to 150k when the probe agents were due. Read this after the runbook's section 1.

## The range

- Start `b6df3a2` (session 12's handoff). End: the commit that last changed this file (`git log -1 -- docs/spec/review/handoffs/LATEST.md`).
- `git diff b6df3a2..<end> --stat -- docs/spec`: `review/probes.md` (P-6 and P-8 rows, `d5f984b`), `review/STATE.md`, and this file.
- Probe branch `claude/63-mac-probes` (worktree `../AIConnections-macprobes`, from main `72eba4d`, no PR): `87182a3` and its follow-up add `.github/workflows/mac-probes.yml` (runs on pushes to that branch only) and `.github/probes/p6.sh`, `p8.sh`. Runs 40711500801 and 40712313007, both green.

## What is finished

- **P-8 done** (macOS 26.6.2 arm64 runner, LaunchAgent in `gui/501`, `KeepAlive`): restart after `kill -9` in 0.05 s, or 10.05 s when the job ran under the 10 s `ThrottleInterval`. Same resource and jetsam coalitions (899 and 900) across restarts. launchd ended the killed guardian's child. A restarted guardian's `launchctl bootout` of its own job removed the job, ended it and its child, and nothing restarted. That is the backstop R-M1-59 needs. Not yet in the ledger or the spec.
- **P-6 ran but is not settled.** npm adds no quarantine attribute, whether it installs a local tarball or a registry package (esbuild 0.24.0, ad-hoc signed). `spctl --assess` rejects every ad-hoc signature, yet everything ran, a quarantined copy included. The runner has **SIP disabled** and ran an unsigned arm64 binary, which a stock Mac kills. So the run results need a stock Mac.
- The main checkout's `story.txt` (an `sa run` test addition), `mogesreview.md` and `mogesanswers.md` were deleted on the owner's word. The v0.4 questions and answers survive in `docs/legacy/spec/shadow-army-2.0.md` ("Owner's answers", O1 to O5). Main was fast-forwarded to `72eba4d`.

## Half-done

- **Short probes on Windows, not started.** The plan, shown to the owner: 3 Sonnet agents at `high` (flow rule 6, prototype builders). (1) claude: P-3, P-11, P-12, and claude's parts of P-13 and P-15. (2) the other CLIs: P-1 (`.shadow/v2-tools/probes/s6-grok.mjs perm`), P-2 (agy), and the codex, grok and agy parts of P-13 and P-15. (3) P-10 (C# coverage of `Add-Type`; `dotnet` is installed). Installed: claude 2.1.312, codex-cli 0.160.0, grok 1.0.70, agy 1.4.7. Throwaway folders, approve nothing. Results go to `probes.md`, then the ledger, then the next version.
- **P-14 was skipped on purpose.** It needs prompts built to trip a refusal classifier. Leave it to the owner, or drop it.
- P-6 and P-8 results go into the ledger and the spec (D-3, R-M1-59) in the next version.
- `~/projects/GITHUB_VERSION_CONTROL_PROMPT` with V1 to V18: still not checked against PR #85.

## Next, in order

1. Windows short probes (above), measured with `/context` first.
2. Round 4's verifiers (R-M1-206 to 218, R-F-157, R-F-158), M1's implementer and F's red team (`drafts/r4/PROMPTS.md`), and fix check **V18-FC1 over v0.18 to v0.20**, which includes R-M1-220.
3. The next version with the probe results.

## The owner's open questions

- Alpha Q3 and Q4 (https://claude.ai/artifact/FsB2fmhYKMpsTUTgeqR14P).
- PR #85: the owner accepted it ("this looks sound, go ahead and implement", 2026-10-28T02:23Z). It waits for Codex's review. Proposal 5 (merge settings) needs the owner's `gh api` command.
- P-6 on a stock Mac: who runs it.

## What the files don't say

- The `/context` figure has to come from the owner. This session asked through a question card before starting agents.
- The untracked JSON drafts in `drafts/r3/` and `drafts/v015/` to `drafts/v020/` stay untracked.
- `../AIConnections-v06` is still stale, and `../AIConnections-macprobes` can be removed once the P-6 question is closed.
