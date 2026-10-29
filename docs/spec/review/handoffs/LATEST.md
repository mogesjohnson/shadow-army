# Handoff: session 17, Fork 0, to fork1 (2026-10-29)

Written by the starter session ("Second brain", Fork 0 of this chain; the owner's forks are `fork1` to `fork5`), at its save point once its context passed 120k. The spec is unchanged (v0.20, `4f481fc`). Read this after the runbook's section 1. fork1 hands on to fork2 only if fork2 is free: on the owner's word, fork2 took PR #81's fixes (Codex's five P2s on the CI budget watchdog); if it is still busy, hand on to fork3.

## The range

- Start `8cb612b`. End: the commit that last changed this file. `git diff 8cb612b..HEAD --stat` shows it all.
- New: `batches/F-R4-V1.md`, `F-R4-V2.md`, `M1-R4-V4.md`, `M1-R4-V5.md`, `M1-R4-V6.md` (packets); `raw/F-R4-V1.md`, `raw/F-R4-V2.md`, `raw/M1-R4-V4.md` (reports); `ledger.md` (verdicts); `tools/save-report.mjs` (saves a report from `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`; the task's `.output` file is empty); `drafts/r4/verdicts-fork0.json`.

## What is finished

- **F-R4-V1** (Opus, high): R-F-166 **DECISION P1**, card **D-36** below. R-F-167 **CONFIRMED P2**: SEC-6 857 widens to every text the mod draws (repository paths, diffs, ref names), with an M1-AC11 and an M2-AC5 case and Appendix D row 4. Paste-ready text in the report.
- **F-R4-V2** (Opus, high): R-F-168 and R-F-169 **CONFIRMED, each P3 (was P2)**, on R-F-97's precedent (an informative appendix overclaiming). 168 adds residual 14 (filters in the config at start run as the owner's); re-check its last sentence against R-M1-206's fix. 169: row 13 says "prevented, except residual 3".
- **M1-R4-V4** (Opus, high): R-M1-235 **DECISION P1**, card **D-37** below; its HOST-2 119 and M1-AC1 1049 text (Claude Code refuses every mod's `$.http.fetch` where an org policy bars WebFetch, documented) holds under every option, so v0.21 can take it now. Its `http.fetch`-hooks sub-claim is a DUPLICATE of R-M1-245. R-M1-236 **NEEDS-PROBE P2**: probe P-17; PO-7 261 and 263 drafts for each outcome are in the report. P-16 and P-17 are now in `probes.md`, waiting for the owner's go.

## Next, in order

1. Measure context (the transcript's last `usage`: input plus cache read plus cache creation).
2. Start the two packets that are ready: `batches/M1-R4-V5.md` (R-M1-237 to 239, `spec-verifier`, Opus, `high`) and `batches/M1-R4-V6.md` (R-M1-240 to 242, `spec-verifier`, `model: sonnet`, effort `medium`). Prompt: "Verify the findings in the packet `<absolute path>`. Read the packet first and follow it. Repository-relative paths in it are under `C:/Users/johns/projects/AIConnections-review/`. The spec text to judge is the frozen snapshot the packet names. Return findings only, one block per finding in your output format, with paste-ready OLD/NEW text for each CONFIRMED one: no preamble, no summary." Save each with `node tools/save-report.mjs`, then `node tools/set-verdicts.mjs ledger.md <verdicts.json>`.
3. ~~Probes P-16 and P-17~~ added to `probes.md`; ask the owner to run them (no model call).
4. v0.21 as before (`git show d35e64c:docs/spec/review/handoffs/LATEST.md` and `git show 9f01284:docs/spec/review/handoffs/LATEST.md`): every confirmed round 4 and V18-FC1 fix, R-M1-221 and 222 from `raw/M1-R4-V3.md`, this session's confirmed fixes, the unverified P3s, D-34's **Not tested:** notes, and D-36 once the owner answers. Run both checkers, then fix check V21-FC1.

## The owner's open questions

- **D-36 (new): how committed contract fixtures stay free of secrets** (R-F-166). (a) A clean checkout of the commit under test, no secret in any file or the CLI's environment beyond its login, `redact()`, then the owner reads each fixture whole before commit; VER-4 moves into M1. (b) The same plus a secret scan of `test/fixtures/`, run locally before commit and in CI. Recommended: **(a)**. A scanner is pattern-based like `redact()`, and CI scans only after the branch is public. Either way, add a URL password (`://user:pass@`) to WSP-8's patterns. Asked in chat on 2026-10-29; not yet answered.
- **D-37 (new): how the mod reaches the post office past a proxy or an org fetch policy** (R-M1-235). (a) `$.http.fetch` over `socketPath` (not in the public docs; Windows needs a probe); (b) loopback TCP, and before the first start the mod checks the proxy variables and the merged settings' `env`, refusing to start with one transcript line naming the `NO_PROXY` entry to add; (c) run P-16 first. Recommended: **(c), then (b)** if the probe's proxy listener gets the request. Not yet asked; ask it with P-16.
- Unchanged: the haiku model mismatch; alpha Q4 deferred until A6; D-35 only if R-M1-221's reading is rejected.

## What the files don't say

- Codex re-reviewed PR #85 at `0d46282` (C1 fixed, no new findings), but its head is `428295b`, so Codex still has to review that head. PR #81 is fork2's.
- The harness blocks the Write tool in the main checkout for a forked session; write in `../AIConnections-review` (a linked worktree) instead.

## The owner's answers (2026-10-29, after this handoff)

- **D-36: (a).** A clean checkout, `redact()`, then the owner reads each fixture whole; VER-4 into M1; add URL passwords to WSP-8. Apply in v0.21.
- **D-37: (c).** Run P-16 first, then choose (expected (b)). HOST-2 and M1-AC1 text from `raw/M1-R4-V4.md` goes into v0.21 now.
- **Probes P-16 and P-17: go.** Given to fork3 to run; their results settle D-37 and R-M1-236.
