# Unit M1, round 1, fix check M1-FC2: the claude channel, logs and where soldiers run

Each P1 as raised (copied from `batches/M1-V7.md` or `M1-V8.md`), then its verifiers and where spec v0.8 (`1580e87`) fixes it. Line numbers are v0.8's, `docs/spec/v2.md` in the review worktree. The verifiers' reports are `raw/M1-r1-verify-V1.md` to `V9.md`, and each finding's ledger row gives its resolution.

## R-M1-24

- severity: P1
  type: gap
  location: CH-7 (docs/spec/v2.md:255); CH-2 (docs/spec/v2.md:221-224)
  claim: No table says which claude flags each autonomy level passes. If a level passes no flag, claude's starting mode comes from settings files or its built-in default, and either can be more permissive than "supervised".
  scenario: A soldier has no `autonomy`, so it is supervised. Reading A (pass no flag): `claude -p` starts in `default`. It starts in `auto` instead when the session doesn't fetch feature flags (for example with telemetry off, on v2.1.285+). It starts in `acceptEdits` when the snapshot's committed `.claude/settings.json` sets `defaultMode`. Either way, a "supervised" soldier acts without asking. Reading B (v1's mapping): plan for reads and acceptEdits for writes, but that needs a write flag, which M1 doesn't have. Reading C (the draft): always `plan`.
  evidence: https://code.claude.com/docs/en/permission-modes ("Which mode a session starts in"): for `claude -p`, "`default` in sessions that fetch feature flags. In sessions that don't, such as on a third-party provider or with telemetry off, `auto` with Claude Code v2.1.285 or later". A settings file's `defaultMode` values other than auto and bypassPermissions "apply from any settings file". 2.0 SAFE-10 (legacy spec :1048) has no table. v1: src/adapters/claude.ts:16-20. Draft: src/v2/claude.ts:30.
  fix: "Every adapter always passes its CLI's permission mode explicitly. For claude, supervised passes `--permission-mode plan` (decision: or `default`), auto passes `--permission-mode auto`, and full passes `--permission-mode bypassPermissions`." Give the same table for M2's CLIs.

**Verified by:** M1-V1, M1-V7.
**Fixed in** `1580e87`: CH-2's permission-mode bullet, 288-302; CH-7, 329-331; M1-AC3, 690 (the mode `system/init` reports); M1-AC5, 704. R-M1-57 (D-16, big, not decided) may change what supervised passes.

## R-M1-11

- severity: P1
  type: untestable
  location: PO-5 (docs/spec/v2.md:183); 5.1 F "a failed log write" (:490)
  claim: A failed log write has a fault test but no defined outcome, and the readings run from carrying on to ending every soldier's turn.
  scenario: The disk fills while Beru and Iron are mid-turn, or on Windows an antivirus scan holds `.shadow/v2/logs/<id>.jsonl` open and the append fails with EBUSY. Reading A, Codex's draft ("A broken audit must stop further work"): the post office closes every session, cutting both turns short, and refuses every later command. Reading B: it reports the failure and carries on, leaving a gap in the only record of the turn until PO-6 arrives in M3. Under either reading, a failed append can leave a torn line that later writes follow. The F test can't pass or fail against a text that sets no outcome.
  evidence: :183 gives only the place and the redaction. :490 lists "a failed log write" with no expected result. In Codex's draft, record() in C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts reacts to any log error with `void this.close()`.
  fix: "PO-5: A failed log write is retried once. If it fails again, the post office keeps working, its state shows one line ('logs not written: <reason>'), and each later write tries again. A log never stops a soldier. A partly written line is ended before the next write, and readers skip any line that doesn't parse." M1 adds a fault test: log writes fail mid-turn, the turn completes, the failure is reported once, and the log resumes when writes succeed. (Stopping the army on an unwritable log instead: decision.)

**Verified by:** M1-V4, M1-V8.
**Fixed in** `1580e87`: PO-5, 220-223 (now U, F; a failed write retried once 100 ms later, reported once, the log resumes with a count); M1-AC4, 691-703; §5.1 F.

## R-M1-7

- severity: P2
  type: untestable
  location: SEC-4 (docs/spec/v2.md:419); WSP-8 (docs/spec/v2.md:409)
  claim: SEC-4's absolute "Logs and records hold no secret, token or credential" is unverifiable and stronger than `redact()` can deliver, and the required match-set for redact is not defined in-spec.
  scenario: A soldier reads a repo `.env` and quotes `AWS_SECRET_ACCESS_KEY=...` in its session output; the post office writes the session log through redact(). redact (carried from 2.0 SAFE-6) is pattern-based; an arbitrary third-party secret that matches no known pattern is written verbatim, yet SEC-4 asserts the log holds no secret. An implementer cannot know which patterns are required, and the X test can only prove known patterns are removed, not the absolute.
  evidence: SEC-4:419 "Logs and records hold no secret, token or credential (WSP-8)." WSP-8:409 only says redact "runs on every write" and points to 2.0 SAFE-6, which (legacy/spec/shadow-army-2.0.md:1035) likewise only says "A single redact() runs on every write ... Logs are pruned after 30 days" — neither defines what redact matches.
  fix: Scope SEC-4 to the credentials Shadow Army controls (the Monarch secret, soldier credentials, Bearer/Authorization values) and define redact's required match-set there; state that third-party secrets in soldier output are out of redact's scope (or covered only by named patterns), so the test checks a concrete, provable property.

**Verified by:** M1-V4, M1-V8.
**Fixed in** `1580e87`: WSP-8, 486-487 (what `redact()` replaces); SEC-4, 512; M1-AC2, 689.

## R-M1-12

- severity: P1
  type: vendor-fact
  location: CH-2 (docs/spec/v2.md:226); M1-AC3 (:548); VER-9 (:514)
  claim: "The turn totals come from `result`" is wrong for claude in stream-json input mode. The result's cost and per-model totals are running totals for the whole process (plus the restored spend after a resume), its `usage` leaves out subagents, and a result after a crash or a stop reports zeros.
  scenario: Iron answers three briefs in one process, each costing $0.10, and the third result reports a `total_cost_usd` of $0.30. If that is read as the turn's cost, the third turn shows $0.30, and SES-7 and HOST-15 add up $0.60 when $0.30 was spent. After a resume (CH-9), the first turn also carries the old session's spend. If the figures are read from `usage`, a turn whose subagent read 200k tokens shows only the main loop. A crash mid-turn (claude emits `error_during_execution` with zeroed fields, then exits) or a stop (S6: "its usage is all zeros") records a costly turn as 0 tokens and $0. VER-9's "tokens" inherit whichever reading the builder picked.
  evidence: https://code.claude.com/docs/en/agent-sdk/cost-tracking, on streaming input mode: "`usage`: covers only that turn, and within it only the main agent loop, not any subagents it ran. `total_cost_usd` and `modelUsage` ... carry the running total for the whole call so far, plus any spend restored when the call resumed a session". The same page: "When the Claude Code process crashes, it emits a final `error_during_execution` result and exits ... may carry zeroed `usage`, `total_cost_usd`, and `modelUsage`". It also says these figures "are client-side estimates, not authoritative billing data". C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\s6-results.md records that the interrupt result's usage "is all zeros". It also records the point it planned for the spec: "a turn's figure is the difference from the last report in the same session; a missing or zero report is 'not reported', never a new baseline". Issue #63, comment 6159653512, lists "Usage as each turn's own figures, never running totals" for v0.6, and the text doesn't have it.
  fix: "CH-2: A turn's main-loop tokens are its `result.usage`. Its cost and per-model totals are the difference between its `total_cost_usd` and `modelUsage` and those of the previous result from the same process, shown as claude's own estimate. A result whose fields are all zero after a crash or a stop is 'not reported'. Its input and cache tokens are summed from the turn's main-loop assistant messages, counting each message id once. Its output and cost read 'not reported', and it is never the baseline for the next difference. VER-9 compares the sums of these per-turn figures." M1-AC3 adds a three-turn recording whose per-turn figures add up to the last result's total, and a crashed turn shown as not reported.

**Verified by:** M1-V5, M1-V8.
**Fixed in** `1580e87`: CH-2's 'A turn's own figures', in 288-302; OBS-3, 563-564; M1-AC3, 690; M1-AC4, 691-703; §5.1 L's measure, 621-627 (R-F-67).

## R-M1-23

- severity: P1
  type: contradiction
  location: M1 Implements (docs/spec/v2.md:536-544); CH-1 (docs/spec/v2.md:217)
  claim: The M1 text never says where a soldier runs or that a guard watches it. Settled decision 7 (a throwaway snapshot of HEAD) and the settled rule that auto or full needs the guard are both missing, and WSP-1 and WSP-4 wait for M6.
  scenario: The shipped shadow.config.json sets claude-sonnet to `auto`. CH-1 says to open "a session in a worktree", but no worktree exists before M6. Reading A: the session opens in the folder itself, and Iron edits the owner's uncommitted files with nothing to detect it. Reading B (the draft): a snapshot of HEAD, plus a guard on both the checkout and the snapshot. Any change fails the turn and marks the soldier down. The text also doesn't say whether a write in the snapshot is allowed, discarded or a read-violation, or whether the snapshot is deleted or kept (PO-7 keeps "worktrees").
  evidence: settled.md, M1 decision 7 and the design rule "With auto or full, a read-only task runs in a throwaway snapshot, and the checkout guard fails any task…". In section 4, "snapshot" appears only for agy (ARM-6, :384-387). Draft: src/v2/postOffice.ts:128-130 and :202-222.
  fix: In M1 and CH-1: "Until WSP-1 (M6), each session opens in a throwaway snapshot of HEAD under `.shadow/v2/`. The checkout guard covers each turn, as ARM-6 gives agy. A change to the snapshot or the checkout fails the turn as a read-violation." Add an M1 AC for it. decision: the snapshot is removed at close, or kept until the owner clears it.

**Verified by:** M1-V6, M1-V8.
**Fixed in** `1580e87`: new WSP-11, 501-506; CH-1's interface line, 282; the glossary's Snapshot, 76; Appendix A's WSP-11 row; M1's Implements; new M1-AC11, 715-721.
