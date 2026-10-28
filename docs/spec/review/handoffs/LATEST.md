# Handoff: session 15, the starter, to fork1 (2026-10-28)

Written by session 15's starter (session name `Second brain standby ⑂`), Fork 0 of this chain. The owner made sessions `fork1` to `fork4` and asked for the work to pass along them: this session hands to `fork1`, `fork1` to `fork2`, and so on. ListAgents shows the names in lower case with no space, so look for `fork<N+1>`, not "Fork N+1". The spec is unchanged (v0.20, `4f481fc`). Read this after the runbook's section 1.

## The range

- Start `15d1020`. End: the commit that last changed this file (`git log -1 -- docs/spec/review/handoffs/LATEST.md`).
- `git diff 15d1020..<end> --stat -- docs/spec`: `review/raw/F-R4-V1.md`, `raw/M1-R4-V1b.md`, `raw/M1-R4-V2.md`, `raw/V18-FC1.md` (reports), `review/probes.md` (P-1, P-2, P-3, P-11, P-12, P-13 and P-15 done), `review/ledger.md` (verdicts, and the new rows R-M1-221 to R-M1-234), `STATE.md` and this file.
- Helper scripts, untracked, in `drafts/v021/`: `s15-records.mjs`, `s15-verdicts.mjs`, and `handback.mjs`, which prints a subagent's report from its transcript (`node drafts/v021/handback.mjs ~/.claude/projects/C--Users-johns-projects-AIConnections/<session id>/subagents/agent-<agent id>.jsonl`). On this machine the task `.output` files are empty, so save reports this way rather than retyping them.

## What is finished

- **F-R4-V1** (`raw/F-R4-V1.md`): R-F-157 CONFIRMED **P2**. HOST-11 says only the summary card and MSG-7's line reach Claude's conversation, but MSG-9, MSG-10 and M3-AC3, AC4, AC9 and AC10 say Claude gets a line. The fix takes MSG-9's reading ("so Claude knows"): HOST-11 lists MSG-9's and MSG-10's lines too, and each AC says conversation or transcript as meant (M3-AC3's soldier-to-soldier row stays transcript only). R-F-158 CONFIRMED P3 (was P2): VER-6 states the pooled count, with no per-language bar. **F's round 4 is not clean.**
- **R-M1-206's second verifier** (`raw/M1-R4-V1b.md`, Opus): CONFIRMED **P1**, agreeing with the first. Its fix is the more precise one: put the next-start finishing in a sibling bullet after PO-1 227, not under the 222 heading (whose reason, `the post office stopped unexpectedly`, would be wrong after a clean shutdown), add a shutdown line naming the turn not checked, and cite WSP-10 in Appendix D row 6. Use V1b's text, with its M1-AC10 case.
- **M1-R4-V2** (`raw/M1-R4-V2.md`, Sonnet): all seven CONFIRMED. R-M1-212 **P2** (name the start time's source per OS, compared exactly) and R-M1-214 **P2** (`--version` runs end after 10 s; the mod waits at most 60 s for ready, the verifier's number, which the owner can change; PO-19's script ends after 30 s). R-M1-213, 215, 216, 217 and 218 moved down to P3. **M1's round 4 is not clean.**
- **The Windows probes are in `probes.md`**, with three new ledger rows:
  - R-M1-221, **P1 candidate**: under the owner's grok `permission_mode = "always-approve"`, a grok soldier at `supervised` writes with no approval and the relay sees no request. To verify, then most likely the owner's card D-35: turn it off per session (`/always-approve off`, keeps the vendor's ask on) or follow the owner's config.
  - R-M1-222, P2: a claude stop zeroes nothing and loses the stopped turn's cost, so CH-2 511's "reports nothing" should say "not reported". To verify.
  - R-M1-223, P3, applied unverified: record the answers of P-3 (`enabledPlugins` false is what holds; user hooks, skills and MCP servers still load) and P-15 (ExitPlanMode leaves `plan` for `default`; grok lists no modes and takes any `session/set_mode` string).
  - No row for P-13's claude rule file or P-15's grok modes: v0.20 already says both (WSP-11 836, Appendix D 1830; CH-11 575, M6's fake case 1370).
- **V18-FC1** (`raw/V18-FC1.md`, Opus): no P0; three P2 and eight P3, ledger R-M1-224 to R-M1-234. **R-M1-194 is not fixed** (N1: the post office can't read the managed settings claude reads, since the admin console's come over the network; react to claude's own `disableSideloadFlags` refusal instead). N2: WSP-11's "every folder above it writable by no other user" fails on every Windows drive root, and `.claude/AGENTS.md` is missing from its list. N3: after D-31 nothing tells Claude a soldier is fresh in a new process. Every other repair group landed. It also lists where D-34's **Not tested:** notes go (P-6: 449, 1043, 1321; P-5: 1043, 1321; VER-10's Mac run: 1009, 1318). Fix-check P2s are recorded as "P2, from the fix check", as V17-FC1's were, and go into v0.21 with the rest.

## Next, in order

1. Measure `/context` first (ask the owner).
2. Agents, two or three at a time: R-M1-221's verifier (Opus, high: vendor and P1), with R-M1-222 in the same packet; M1's implementer and F's red team (`drafts/r4/PROMPTS.md`, with the snapshot changed to v0.20's `v2@4f481fc.md`, and D-1 to D-34). Those two are round 4's last lenses.
3. v0.21, drafted in the main session (flow rule 5): the fixes of M1-R4-V1 (R-M1-206 to 211, with V1b's text for 206), M1-R4-V2, F-R4-V1 and V18-FC1 (R-M1-224 to R-M1-234), the P3 rows marked "to apply unverified" (R-M1-219, R-M1-223, R-F-159 to R-F-165), R-M1-222 once verified, and D-34's **Not tested:** notes (P-5, P-6, VER-10's Mac live run). Run both checkers, then fix check V21-FC1.
4. A side point from V1b, to check before raising: once the restart lifts M1's hold, WSP-10 784 and 790 trust the config as it then stands, so a `filter.*` driver the soldier added counts as the owner's and runs in harness git, the deferred guard included. Grep the ledger for an earlier row on WSP-10's filters first.

## The owner's open questions

- Alpha Q3 and Q4 (https://claude.ai/artifact/FsB2fmhYKMpsTUTgeqR14P).
- PR #85's proposal 5 (merge settings) still needs the owner's `gh api` command.
- R-M1-221: grok's `always-approve` per session (card D-35 once verified).
- Not investigated: `--model haiku` gave `system/init` `claude-haiku-5-5`, yet every assistant message ran on `claude-sonnet-5-5` (P-15's run); relevant to CH-2's "the model in use".

## What the files don't say

- Subagents can't write files; save each report from its transcript with `handback.mjs` the moment it arrives.
- This session ran in the review worktree (`../AIConnections-review`) while the forks stood by; none of them had edited it.
