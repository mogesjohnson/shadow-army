# Handoff: session 14, Fork 1 (2026-10-28)

Written by **Fork 1** of session 14 (session name `aiconnections-fe`). The spec is unchanged (v0.20, `4f481fc`). This session fixed Codex's C1 on PR #85, ran the Windows short probes (two Sonnet agents) and round 4's first verifier (M1-R4-V1), and stopped at the save point: the owner's `/context` was over 150k. Read this after the runbook's section 1.

## The range

- Start `90cf24d`. End: the commit that last changed this file (`git log -1 -- docs/spec/review/handoffs/LATEST.md`).
- `git diff 90cf24d..<end> --stat -- docs/spec`: `review/drafts/probes/PROMPTS.md` (the probe prompts), `review/batches/M1-R4-V1.md`, `M1-R4-V2.md`, `F-R4-V1.md`, `V18-FC1.md` (packets), `review/raw/M1-R4-V1.md`, `raw/probes-claude.md`, `raw/probes-others.md` (reports), `review/ledger.md` (R-M1-206 to 211's verdicts), `review/probes.md` (P-10 closed), `STATE.md` and this file.
- PR #85 (branch `claude/84-version-control-rules`, worktree `../AIConnections-vc`): `0d46282` fixes Codex's C1 (V5 and V15's `Enforced by:` now say the hook and the workflow check only the `#N` prefix, and closing keywords in the PR body only). Replied in the C1 thread; body updated (3 commits). Waits for Codex's re-review at `0d46282`.

## What is finished

- **Codex's reviews:** PR #83's range `b6df3a2..90cf24d` approved with no findings (review 5685156675). PR #85 had C1 [P2], fixed as above.
- **P-10 closed as not needed:** v0.12 ships the C# as a prebuilt DLL (R-M1-61, R-M1-96 (c)).
- **M1-R4-V1** (`raw/M1-R4-V1.md`, ledger rows set): R-M1-206 CONFIRMED **P1**; R-M1-207 DECISION, technical, P2, and **(b)+(c) chosen** by the orchestrator (`sa live` starts its own post office with no lease, notices to its terminal; M1-AC8's running-turn case moves to M3); R-M1-208 CONFIRMED P2 (was P1); R-M1-209 CONFIRMED P2; R-M1-210 and R-M1-211 CONFIRMED P3 (were P2). Each has its fix text in the report. **M1's round 4 is not clean.**
- **The Windows short probes ran** (`raw/probes-claude.md`, `raw/probes-others.md`; versions claude 2.1.312, codex-cli 0.160.0, grok 1.0.70, agy 1.4.7). Results, not yet in `probes.md`, the ledger or the spec:
  - **P-1 (grok) yes:** `session/cancel` with a permission pending ends the turn `cancelled`; grok resolves its own pending request and doesn't wait for the client's `cancelled` answer (a late answer is harmless); nothing written; the session goes on. **New fact:** the owner's `~/.grok/config.toml` has `permission_mode = "always-approve"`, under which `grok agent stdio` never sends `session/request_permission` and writes at once. The probe turned it off per session with the prompt `/always-approve off`. The spec's grok adapter must deal with it (CH-4, CH-6, ARM-5): a new finding, P1 candidate.
  - **P-2 (agy):** no interrupt over stream-json (unknown events ignored with a warning; `control_request` is fatal, exit 2). Ending the tree (`taskkill /t /f`) and resuming with `--conversation <id>` keeps turn 1 and the killed turn's user message. Confirms CH-10's "no interrupt" line.
  - **P-3 (claude):** `--settings` with `enabledPlugins` false drops the installed plugin (cockpit) fully. But the owner's user `settings.json` `env` sets `CLAUDE_CODE_PLUGIN_DIRS`, which re-adds plugins even with a clean process environment; `enabledPlugins` false overrides it. User hooks, user skills (the synced `anthropic-skills:*`), user MCP servers and three `@builtin` plugins still load.
  - **P-11 (claude):** a stop zeroes nothing. `total_cost_usd` and `modelUsage` keep accumulating, and the interrupted turn's own cost is in **neither** running total (result 2 equals result 1). CH-2's "after a stop where spike S6's recording shows it, reports nothing" needs restating: the stopped turn's cost is lost, not zero.
  - **P-12 (claude):** a linked worktree loads and, in a writing mode, writes the main repository's auto memory. CH-2's pair (process env plus `--settings` env at 1) keeps it off, even against a committed `autoMemoryEnabled: true` with the variable at 0 and an inherited 0. Confirms D-19 and M1-AC14's live case (the owner's user-settings part not tested).
  - **P-13:** none of the four CLIs writes a file in the folder on a read-only turn; all keep state in their home folders, naming the repo path (codex `~/.codex/sessions`, grok `~/.grok/sessions/<encoded cwd>/` with `signals.json`, agy `~/.gemini/antigravity-cli/`). claude's "don't ask again" saves its rule in the **worktree's own** `.claude/settings.local.json` (hidden only by the owner's global gitignore), so D-7's revert would remove it or report it.
  - **P-15:** claude's `set_permission_mode` works (`control_response` with the mode, `system/status`), and an allowed ExitPlanMode leaves `plan` for **`default`**, not `acceptEdits`. **A mode change resets claude's prompt cache** (SES-6's "cold" holds). codex's per-turn `sandboxPolicy` works, stays as the thread's default for a later turn with none, and keeps the cache. **grok 1.0.70 lists no modes, and `session/set_mode` accepts any string, even a bogus one, and does nothing**, so CH-11's grok line is wrong as written: the read-only rule for grok rests on answering permissions and the snapshot.
  - Oddity: `--model haiku` gave `system/init` `claude-haiku-5-5`, yet every assistant message ran on `claude-sonnet-5-5`. Not investigated; relevant to CH-2's "the model in use".

## Half-done

- Probe results go to `probes.md` (status column of P-1, P-2, P-3, P-11, P-12, P-13, P-15), then ledger rows (the grok always-approve finding, P-11's restatement, P-13's claude rule file, P-15's grok line and ExitPlanMode's `default`), then v0.21.
- R-M1-206's second verifier is owed (flow rule 3: the first CONFIRMED a P1). R-M1-207 and R-M1-208 were P1 when raised and the verifier lowered them; a second verifier on them is optional.

## Next, in order

1. Measure `/context` first (ask the owner).
2. Agents, two or three at a time: R-M1-206's second verifier (Opus); **M1-R4-V2** (packet ready, R-M1-212 to 218, Sonnet medium); **F-R4-V1** (packet ready, R-F-157 and R-F-158, Sonnet medium); **V18-FC1** (packet ready, Opus high); M1's implementer and F's red team (`drafts/r4/PROMPTS.md`, now on v0.20's snapshot `v2@4f481fc.md`). For a verifier prompt, tell `spec-verifier` the packet path, that findings cite v0.17 and are judged against v0.20 (`v2@4f481fc.md`, grep IDs, REFUTED if v0.20 already fixes it), the context files (settled.md, decisions.md D-1 to D-34, docs/adr, Appendix D's residuals), the refuted and parked lists from `drafts/r4/PROMPTS.md`, and ask for fix text with each CONFIRMED.
3. The probe results into `probes.md` and the ledger.
4. v0.21: M1-R4-V1's fixes, the other verifiers' fixes, the probe results, and D-34's **Not tested:** notes (P-5, P-6, VER-10's Mac live run).

## The owner's open questions

- Alpha Q3 and Q4 (https://claude.ai/artifact/FsB2fmhYKMpsTUTgeqR14P).
- PR #85's proposal 5 (merge settings) still needs the owner's `gh api` command.
- New: should grok soldiers turn `always-approve` off per session, overriding the owner's `~/.grok/config.toml`? It keeps a vendor safeguard on (CH-7), but it changes behavior the owner configured; likely a card.

## What the files don't say

- Subagents can't write report files (the Write tool refuses: "Subagents should return findings as text"). Save each report from its hand-back; this session extracted them from the task transcripts with a small script.
- The probe agents stalled once each at about 10 minutes and were resumed with SendMessage; their raw NDJSON logs and drivers are in this session's scratchpad (`.../dfd3edf8-.../scratchpad/probes/`), not in the repo.
- The untracked JSON drafts in `drafts/r3/` and `drafts/v015/` to `drafts/v020/` stay untracked.
