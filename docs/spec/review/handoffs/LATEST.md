# Handoff: session 15, fork1, to the next fork (2026-10-28)

Written by `fork1` (Fork 1 of this chain), at its save point once its context passed 120k. The spec is unchanged (v0.20, `4f481fc`). Read this after the runbook's section 1. ListAgents shows names in lower case with no space. At this handoff `fork2` was not listed, so this went to `fork3`; it hands on to `fork4`.

## The range

- Start `d35e64c`. End: the commit that last changed this file.
- New: `batches/M1-R4-V3.md` (packet); `raw/M1-R4-V3.md`, `raw/F-r4-redteam.md`, `raw/M1-r4-implementer.md` (reports); `ledger.md` (R-M1-221 and 222 verdicts; new rows R-F-166 to R-F-170 and R-M1-235 to R-M1-245); `drafts/r4/PROMPTS.md` (the v0.20 prompt changes), `drafts/r4/rows-v020*.txt`.

## What is finished

- **M1-R4-V3** (Opus, high): R-M1-221 **CONFIRMED P1**, not a decision. CH-7 546 already takes every CLI's mode from the autonomy level, so CH-4 gets a new bullet passing `--permission-mode plan` / `auto` / `--always-approve` (xAI documents the flag as overriding the user config), never `/always-approve` or `_meta.yoloMode`; plus §5.1 C 919, M2-AC11 and a new M2-AC case. It applies parked R-M1-71 for grok, and a contract fixture under `always-approve` config gates it. A D-35 card is drafted in the report only in case this reading is rejected. R-M1-222 **CONFIRMED P2**: replace CH-2 511 with a rule keyed on the adapter's own stop (cost and output "not reported"), §5.1 L 983 "or a stop", M2-AC6 and M1-AC3 cases. The report holds paste-ready text.
- **F's round 4 red team** (`raw/F-r4-redteam.md`): R-F-166 **P1** (fixtures are protected only by `redact()`; VER-4 needs a clean checkout and the owner reading each fixture; maybe a card: review alone, or plus a CI secret scan), R-F-167 P2 (SEC-6 doesn't cover repository text: paths, diffs, ref names), R-F-168 P2 (Appendix D row 8 says "prevented", but start-time `filter.*` drivers run; this is V1b's side point, now this row), R-F-169 P2 (row 13 says "prevented" with no residual 3 exception), R-F-170 P3. All to verify except the P3.
- **M1's round 4 implementer** (`raw/M1-r4-implementer.md`): R-M1-235 **P1** (`$.http.fetch` follows the host's proxy variables, so the secret can reach a proxy and renewals fail; needs a probe, maybe a card); R-M1-236 to R-M1-242 P2 (the host kills the post office at unload; Windows DACL grants; the Windows guardian channel; Windows PO-5 checks; the mod can't run the sweep; `sa live` and the trust card, to fold into R-M1-207's repair; log names and `--session-id`); R-M1-243 to 245 P3. 235 and 236 need probes.
- Round 4 is done for every lens. **Neither F nor M1 is clean.**

## Next, in order

1. ~~Do what this save point missed (usage limit): comment on PR #83 with a link to this file, update `.shadow/v2-tools/STATE.md`, the review `STATE.md` and the status board, and capture a second-brain handoff (subject `spec-2-0-review`, superseding the previous one).~~ Done 2026-10-29 from a fork in its own worktree (`.claude/worktrees/fork1-save`), pushed straight to this branch: `../AIConnections-review` needs `git pull --ff-only` before its next commit. The review `STATE.md`'s "Where things are", unit rows, decisions D-26 to D-35, "Next" and "Waiting on the owner" are now current too.
2. Measure context: the session transcript's last `usage` (input plus cache read plus cache creation) is an exact reading.
3. Verify, two or three agents at a time, all Opus `high` (P1, security and vendor findings): R-F-166 with R-F-167; R-F-168 with R-F-169; R-M1-235 with R-M1-236 (write probes P-16 and P-17 in `probes.md` for the owner to run); R-M1-237 to R-M1-242 (Windows and vendor; Sonnet `medium` is fine for 240 to 242).
4. v0.21 as the previous handoff said (`git show d35e64c:docs/spec/review/handoffs/LATEST.md`), plus R-M1-221 and 222 from `raw/M1-R4-V3.md` and whatever step 3 confirms. Run both checkers, then fix check V21-FC1.

## The owner's open questions

As in the previous handoff: alpha Q3 and Q4, PR #85's proposal 5, the haiku model mismatch. D-35 isn't needed unless R-M1-221's CONFIRMED reading is rejected. R-F-166, R-F-168 and R-M1-235 may become cards.

## What the files don't say

- The harness flags subagent reports that contain `bypassPermissions` or `settings.json` as "instruction-shaped". Here those were vendor facts in the findings, not instructions.
- Claude Code stopped `fork1`'s hour timer because the machine was low on memory.
