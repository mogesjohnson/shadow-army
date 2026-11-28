Unit F, round 2, consistency auditor, on v0.11 (v2@af97372.md), 2026-10-20

- severity: P2
  type: contradiction
  location: Appendix D row 10 (.shadow/v2-tools/review/snapshots/v2@af97372.md:1585); ARM-7 "Stated residual risks" (:678); Appendix D residual list (:1596-1606)
  claim: Row 10 says the trust card prevents the crossing "except residual 4", but ARM-7 itself states three ways around the card, and none of them is among Appendix D's nine residuals.
  scenario: (a) A cloned repository commits a `shadow.config.json` that sets Kaisel to `full`, plus a `.claude/settings.json` PreToolUse hook that answers AskUserQuestion with "Trust these files". The owner accepts Claude Code's folder trust and runs `/army`. The hook accepts the card, and Kaisel opens at `bypassPermissions` without the owner. (b) A `full` soldier writes a matching record into `~/.shadow-army/trust/` and edits the checkout's `shadow.config.json`. The guard fails the turn but reverts nothing (row 6), so the next start opens every soldier at the raised autonomy with no card. The threat model calls both "prevented", and the owner never sees them as residuals to accept.
  evidence: ARM-7 :678: "a hook the owner installed, or one in the folder's own Claude Code settings, can accept the card. Any process of the owner's, a soldier that runs code included, can write the record ... v1's own commands ... still read the folder's files with no card." Appendix D :1544: "where it differs from a requirement, the requirement governs". Actors :1567 marks repository content "Not trusted". Residual 4 (:1601) covers only files after acceptance. :1596: each residual is "accepted by the owner's decision, or stated by the requirement named beside it".
  fix: Row 10's Outcome reads "prevented, except residuals 4 and 10". Add residual 10: "**The trust card's own gaps** (ARM-7). A PreToolUse hook, the owner's or one in the folder's own Claude Code settings, can answer the card's dialog. Any process of the owner's user, a soldier that runs code included, can write the record in `~/.shadow-army/trust/`. v1's commands, until LEG-1, read the folder's files with no card."

- severity: P2
  type: contradiction
  location: Appendix D residual 3 (:1600); PO-15 (:364-366); PO-16 (:385, :390); PO-1 (:210)
  claim: Residual 3 says a guardian killed from outside lets its tree escape only "until the next start sweeps it", but PO-15 and PO-16 say that on Linux a process no listing found is never ended, and that on macOS nothing escapes at all.
  scenario: On Linux a soldier's CLI double-forks a daemon between two listings, and the guardian is then killed. The post office ends only the process group and the listed identities (PO-15), and the next start's sweep ends only recorded processes (PO-16), so the daemon runs for good. From residual 3 the owner accepts a temporary escape; the requirement says it is permanent. In the other direction, residual 3 lists a macOS escape that PO-15 rules out ("Nothing escapes").
  evidence: PO-15 :366 "out of Shadow Army's reach ... Others may still run"; PO-16 :385 "Every recorded process whose identity still matches is ended"; :390 "On Linux, a process that no listing found keeps running"; PO-15 :364 (macOS) "Nothing escapes"; PO-1 :210.
  fix: Replace the sentence with: "On Linux, a guardian ended from outside leaves its tree out of Shadow Army's reach. The post office ends what its process group and listings still name, and any other process keeps running for good (PO-15). A tree whose guardian ended together with the post office runs until the mod or the next post office in the folder ends it, and on Linux a process no listing found is never ended (PO-16). On macOS and Windows nothing escapes a guardian ended alone (PO-15)."

- severity: P2
  type: gap
  location: Appendix D assets row "Secrets in the army's files" (:1554) and row 14 (:1589); PO-5 (:237-238); PO-6 (:242)
  claim: The logs, records and reports sit inside the owner's checkout under `.shadow/v2/`, and no requirement keeps them out of git; the threat model has no crossing from them to the repository's history.
  scenario: The owner tells the Monarch to "commit everything". Claude runs `git add -A` and pushes. The soldiers' session logs go to the remote: every tool result and thinking block whole (PO-5), including secrets that `redact()` doesn't match (residual 5, such as `DATABASE_URL=postgres://u:pw@h`). Row 14 still reads "prevented". v1 writes a `.gitignore` holding `*` into `.shadow/`, and Codex's M1 draft keeps that only because it reuses v1's `ensureShadowRoot` (C:\Users\johns\projects\AIConnections-m1\src\workspace\session.ts:56-61; src\v2\postOffice.ts:63). The spec doesn't require it, and the snapshot has no `.gitignore` or `info/exclude` rule anywhere.
  evidence: PO-5 :237 "under `.shadow/v2/logs/`"; :238 "A log holds each message, thinking block, tool call and tool result whole"; WSP-11 :720 says only that `.shadow/v2/` "is not the checkout"; no requirement names a git ignore for it.
  fix: "decision: (a) PO-5 adds: before its first write, the post office makes `.shadow/` ignored by git as v1 does (a `.gitignore` holding `*` in `.shadow/`), and M1-AC2 checks that `git status --porcelain --ignored=no` lists nothing under it; or (b) Appendix D adds a residual for the owner to accept: the army's files are in the checkout, and git ignores them only if the owner says so."

- severity: P2
  type: gap
  location: Appendix D actors, "Other local users, and the network" (:1570); PO-5 (:237); PO-6 (:242); WSP-11 (:711)
  claim: The appendix says other local users "reach only a loopback port", but no requirement sets owner-only access on the logs, records, reports or snapshots. The spec says "only the owner can read" only for PO-4's credential file and PO-18's nonce file (:231, :413).
  scenario: On a shared Linux or macOS host with umask 022, the owner's checkout `~/projects/app` is 755. Another local user reads `~/projects/app/.shadow/v2/logs/*.jsonl`, which holds every tool result whole, unmatched secrets included (residual 5), and reads the HEAD copies under `~/.shadow-army/snapshots/`. The actors row says this user is limited to the loopback port.
  evidence: :1570 "They reach only a loopback port, which refuses them without a credential (PO-2, PO-3, PO-4)"; PO-5, PO-6 and WSP-11 give no file mode; the owner-only wording appears only at :219 (an argument why it's not enough), :231 and :413.
  fix: "decision: (a) PO-5, PO-6, PO-16 and WSP-11 create `.shadow/v2/` and `~/.shadow-army/` readable only by the owner's user (0700 folders, 0600 files on Linux and macOS), with an X case in M1-AC2; or (b) the actors row says other local users can read whatever the folder's and the home folder's permissions let them, the army's logs included, as a residual."

- severity: P2
  type: ambiguity
  location: §5.1 L, the budget, "Going past" (:854) with "$2 of reported cost" (:848)
  claim: "For the parity task's first run, ADR-0009's figures stand in", but ADR-0009 gives only token counts. claude's runs, and grok's headless runs, count against the $2 limit, which tokens can't be added to, because Shadow Army never estimates a cost.
  scenario: Before M1's first claude parity check, the release's spend is $0. Reading A: ADR-0009's figures exist, so the check isn't one "with no earlier figures", and it runs without the owner's go, with nothing added to the $ spend. Reading B: there is no figure in dollars, so it is a check with no earlier figures, and it waits for the go. One implementation asks the owner and the other doesn't, and both follow the text.
  evidence: :854 "Before a check runs, the figures from its last run (VER-8) are added to the release's spend so far. For the parity task's first run, ADR-0009's figures stand in. Three kinds of check wait for the owner's go ... a check with no earlier figures"; ADR-0009 lines 10-15 (tokens only: claude 66.7k/62.6k/35.9k/36.1k); :847 "Shadow Army never estimates a cost".
  fix: ":854: For the parity task's first run, ADR-0009's token figures stand in against the token limits. A run that counts against $2 and has no earlier cost figure makes its check one with no earlier figures."

- severity: P2
  type: gap
  location: §5.1 L, the budget (:848-853); CH-4 (:493)
  claim: The budget doesn't say whether grok's live turns report a cost or how their tokens are read. The token rules have bullets only for codex and agy, and the 1,000,000 figure was sized without grok.
  scenario: In M2's grok parity check the headless run carries `total_cost_usd` and counts against $2. The live run's `_meta.usage` either has a cost, so it counts against $2, or it has none and counts against grok's token limit, with no rule on whether its input includes cached tokens. One builder adds `_meta.usage`'s input and cached fields and another adds only input, so grok's spend differs between them, and so does when the owner's go is needed.
  evidence: :848 lists claude's live turns and headless `total_cost_usd` "as claude's and grok's do"; :849-851 give token rules only for "every codex and agy run"; CH-4 :493 "Usage comes from the prompt result's `_meta.usage`", with no cost named; :853 sizes the limit from codex and agy only. NEEDS-PROBE: whether grok's ACP `_meta.usage` carries a cost, and which fields it has (no official xAI document or recorded probe found in docs/spec/review/evidence/).
  fix: "Add after :851: '- grok: a live turn's tokens and any cost come from its prompt result's `_meta.usage` (CH-4); a live turn with no cost there counts against grok's token limit. The contract fixtures (VER-4) show which field holds which.' Settle the field names with M2's grok recording."

- severity: P2
  type: untestable
  location: VER-10 (:872); M6-AC8 (:1159); Q6 (:1182)
  claim: VER-10 requires the live army run on Windows "as well as" on Linux and macOS, but M6-AC8, the only AC that cites VER-10, checks only Linux and macOS.
  scenario: Before v2.0.0 the owner runs the brief, the stop and the apply and undo on Linux and macOS only. M6-AC8 passes and M6 closes, but VER-10's Windows run, with the pane, the strip and the decisions list drawn and a change applied and undone, never happens. M1-AC8's Windows run covers only parity and the army's life, which come before apply, undo and the M5 screens.
  evidence: VER-10 :872 "the owner runs the army live on Linux and on macOS, each in its own terminal, as well as on Windows"; M6-AC8 :1159 "Live: the owner's runs on Linux and macOS pass"; Q6 :1182 still names only "POSIX and macOS".
  fix: "M6-AC8: 'Live: the owner's runs on Linux, macOS and Windows pass, and are written up on the PR with each system's version and terminal (VER-10, VER-8).'"

- severity: P3
  type: contradiction
  location: Appendix D row 14 (:1589); WSP-8 (:693); M2-AC2 (:1014)
  claim: Row 14 says `redact()` runs on every event and that the secrets appear in none of them, but WSP-8 makes approval requests an exception: they are sent whole in their event and shown whole on the card. M2-AC2, which row 14 cites as evidence, checks exactly that.
  scenario: A soldier's approval request holds `GH_TOKEN=ghp_…`. Its event carries the token whole, and the pane shows it whole, as M2-AC2 requires, while row 14 reads "prevented".
  evidence: WSP-8 :693 "An approval request is the one exception ... goes into its event twice: whole ... and redacted"; M2-AC2 :1014 "shown with both whole". SEC-4 (:727) covers logs and records only, not events.
  fix: "Row 14 Control: '... runs on every log, record, report and brief, and on every event except an approval request's whole copy, which the card shows word for word (WSP-8); the Monarch's secret and each soldier credential appear in no log or record (SEC-4).' Add to residual 5: an approval request's card shows what it holds, secrets included."

- severity: P3
  type: contradiction
  location: Appendix D residual 1 (:1598); PO-3 (:227); PO-4 (:232)
  claim: Residual 1 narrows what PO-3 and PO-4 state.
  scenario: It names Linux only "at `ptrace_scope` 0", leaving out a kernel without Yama. It leaves out reading any process through `SeDebugPrivilege` when Claude Code runs elevated, and taking a claude soldier's credential from its owner-only `--mcp-config` file while that file exists.
  evidence: PO-3 :227 "on Linux at `ptrace_scope` 0 or without Yama ... through `SeDebugPrivilege` when Claude Code runs elevated"; PO-4 :232 "or from claude's file while it exists".
  fix: "Residual 1: 'On Windows, and on Linux at `ptrace_scope` 0 or without Yama ...'; add 'or, under PO-4's fallback, from claude's credential file while it exists'; and add the elevated `SeDebugPrivilege` case."

- severity: P3
  type: editorial
  location: Appendix D row 16 (:1591)
  claim: Row 16 says each cap is "refused with its reason", including PO-6's, but PO-6 cuts a long report and refuses nothing. It also cites "the meter (G5)", a goal, instead of the requirement, SES-2 (M4).
  scenario: Read literally, a reply over 2 MiB is refused, against PO-6 :243, which keeps its first 2 MiB.
  evidence: PO-6 :243 "A longer reply's report keeps its first 2 MiB"; SES-2 :604.
  fix: "'Caps on queue depth, send rate and message size, each refused with its reason (MSG-1, MSG-3, MSG-6), a report cut at 2 MiB (PO-6), and the meter (SES-2, →M4)'."

- severity: P3
  type: contradiction
  location: §2 Containment helper (:67); Q8 (:1184); PO-12 (:332)
  claim: The glossary and Q8 say there is one binary "for each supported system and processor", but PO-12 ships one universal macOS binary for both processors.
  scenario: A packager reads the glossary and builds separate darwin-arm64 and darwin-x64 helpers, while PO-12's table names a single `native/darwin/sa-contain`.
  evidence: :67 "one for each supported system and processor"; :332 "one universal binary, with `arm64` and `x86_64` code".
  fix: "'one Linux binary for each processor and one universal macOS binary (PO-12, PO-13)', and the same in Q8."

- severity: P3
  type: contradiction
  location: G2 (:41); CH-2 (:467)
  claim: G2 promises "the vendor's harness exactly as installed", but CH-2 sets `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and says that "changes one vendor default" (D-19, settled; only the wording is at issue).
  scenario: A reviewer holds the auto-memory change against G2's "exactly".
  evidence: :41 "exactly as installed"; :467 "This changes one vendor default; it removes no tool and disables no safeguard".
  fix: "G2: '... with the vendor's harness whole (ADR-0010)'."

- severity: P3
  type: ambiguity
  location: §5.1 X (:816); M1-AC10 (:944)
  claim: §5.1 X says the test plants "every hook", but M1-AC10 plants three hook files and one hook defined in the config.
  scenario: The test author can't tell whether `pre-commit`, `pre-push`, `post-rewrite` and the rest must be planted.
  evidence: :816 "with every hook present, as files and in the config"; :944 "`post-checkout`, `post-commit` and `reference-transaction` hooks ... and as a `post-checkout` hook defined in the config".
  fix: "Make one match the other: either §5.1 X reads 'with hooks present', or M1-AC10 plants every hook that the harness's git commands can fire."

- severity: P3
  type: editorial
  location: §2 (:81, :85); §5.1 X (:816); Appendix D (:1583, :1604)
  claim: Several terms used here are undefined or defined differently.
  scenario: "Harness git" is used in §5.1 and Appendix D but has no glossary entry; only WSP-10's title defines it. The Snapshot entry's "base" is undefined (WSP-11 copies HEAD). The glossary calls the trust card "the owner's acceptance", though ARM-7's card is the question the owner answers.
  evidence: :81 "a throwaway copy of a base"; :85 "Trust card: the owner's acceptance"; ARM-7 :671-675.
  fix: "Add '**Harness git:** every git command Shadow Army runs itself (WSP-10).' Snapshot: 'a throwaway copy of HEAD, or of a soldier's base (WSP-11, ARM-6)'. Trust card: 'the card that asks the owner to accept, by their hashes, ...'."

- severity: P3
  type: editorial
  location: §5.1 F (:834); PO-1 (:207); M1-AC4 (:930)
  claim: §5.1 F says the soldier shows "log in" "until r", a pane key that arrives only in M5, while PO-1 and M1-AC4 say "until the owner reconnects it".
  scenario: In M1 there is no r, so a fault test written from §5.1 F has no event to wait for.
  evidence: :834 "until r"; :207 "until the owner reconnects it".
  fix: "§5.1 F: 'until the owner reconnects it'."

- severity: P3
  type: editorial
  location: §5.1 C (:799); Appendix B rule 1 (:1218)
  claim: "the adapter's events MUST match the expected events" is a MUST in §5.1 prose with no requirement ID, so the trace can't see it.
  scenario: The trace script never checks it, because rule 1 counts requirements only in sections 4, 5.2 and 5.3.
  evidence: :799; :1218.
  fix: "'... and the tests pass only when the adapter's events match the expected events (CH-1)'."

I found no P0 or P1 findings.

Coverage: header, §0, §1 (G1-G7, non-goals), §2 (every entry), §3; §5.1 U, C, I, X, F, S, L and the budget; §5.2 VER-1 to VER-10; §7; §8 Q1-Q9; Appendix A (against every "(from …)" in the spec, and 2.0 POL-1, POL-2, GUARD-5); Appendix B rules 1-9 (against every milestone's Implements and ACs, M1-AC1 to M6-AC9, rules 3, 4 and 8 checked by hand); Appendix D's assets, actors, rows 1-17, the "In short" paragraph, residuals 1-9 and the D-7 paragraph, with every requirement, evidence code and AC they cite checked against PO-1 to PO-7, PO-9 to PO-19, CH-1, CH-2, CH-4, CH-6, HOST-2, HOST-10, HOST-12, MSG-1, MSG-3, MSG-5, MSG-6, ARM-2, ARM-5, ARM-6, ARM-7, WSP-2, WSP-4, WSP-5, WSP-8 to WSP-11, SEC-1 to SEC-6, SES-2 and SES-7; ADR-0009 (the token figures), ADR-0010, ADR-0012; settled.md; the subagent memory fact (https://code.claude.com/docs/en/sub-agents: turning auto memory off disables subagent memory, so residual 2 holds). I did not raise R-F-4, R-F-46, R-F-68 to R-F-93 or R-M1-89 to R-M1-106 again; no finding depends on D-7, D-11, D-22 or D-23.

