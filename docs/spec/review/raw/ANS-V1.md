Verifier ANS-V1 (batches/ANS-V1.md), against v0.10 and the unapplied drafts, 2026-10-20

- id: R-M1-89
  verdict: DECISION
  severity: P1 (as given)
  evidence: CH-2 294 (v2@e7c33b4.md); PO-4 223 ("adding to it and never replacing it"); ARM-6 470 hashes `.mcp.json` but only flags a change made during a turn. https://code.claude.com/docs/en/permissions, "What runs before you trust a folder" (fetched): for "`claude -p` or the SDK, folder never trusted", `.mcp.json` servers are "Connected without asking, approved or not", while an interactive session "asks you before connecting them". The same page lists the vendor's own mitigations: `--setting-sources user`, `--bare`, `disabledMcpjsonServers`. https://code.claude.com/docs/en/cli-reference: `--strict-mcp-config` means "Only use MCP servers from `--mcp-config`". The 2.0 draft passed `--strict-mcp-config` (legacy 589, 675). D-10's answer A covers only the four Shadow Army files (decisions.md 281). Nothing in v0.10 covers this, and no other ledger row raises it.
  reason: This is real. A committed `.mcp.json` server that the owner declined in their own trusted session runs as the owner, with no prompt, in every claude soldier's snapshot. The hooks the repository's settings name are not new exposure, since the owner's own trusted session runs them too. Closing the gap is a trust-boundary choice.
  options: (a) D-10's trust card also covers the folder's `.mcp.json`, so no claude soldier opens until the owner accepts it. (b) Claude soldiers pass `--strict-mcp-config`, so only the `send` server from `--mcp-config` loads. This fits SET-2, which leaves the owner's personal connectors out; it changes PO-4's "never replacing it" but no vendor safeguard (ADR-0010's consequences line). `--setting-sources user` would also drop the project's deny rules, so it is the weaker choice. (c) Accept it as residual 8 of Appendix D, as d4.txt drafts it.
  big or technical: big (a trust boundary; accepting a risk). This is new and not part of an answer already given. It can ride on the card that asks the owner to accept D-4's residuals, since d4.txt already marks residual 8 "for the owner to accept".

- id: R-M1-92
  verdict: DECISION
  severity: P1 (as given)
  evidence: ARM-6 470 hashes `.claude/` "even where git ignores them". WSP-11 515 ("any other change it finds fails the turn"). M1-AC11 729 (an ignored `.claude/settings.local.json` change fails the turn). https://code.claude.com/docs/en/worktrees (fetched): `--worktree` worktrees go by default "under `.claude/worktrees/<name>/` at your repository root". Subagent `isolation: worktree` and background-session worktrees go there too. The D-17 card: "you already run sessions side by side in worktrees of one repository". d8-16-17.txt exempts only another army's `.shadow/v2/` files, and moves its own M1-AC11 case outside the folder to avoid this.
  reason: This is real. Every edit made in a nested `claude --worktree` checkout, the owner's or that session's own, fails the outer army's turns in M1 and goes on its attribution card from M2. It also makes the guard hash whole nested checkouts. Excluding them would blind the guard to a region a soldier can write in, against the settled guard rule (settled.md 41).
  options: (a) Another working tree of the same repository nested in the folder (from `git worktree list`) is not this army's checkout, and ARM-6 and WSP-11 skip it. Appendix D then states that a soldier's write there is unseen. (b) Keep hashing it, and say in Appendix D and in D-17's text that edits in a nested linked worktree fail or card the outer army's turns. (c) Refuse an army whose folder is inside another working tree of the same repository. This would reverse part of D-17's B.
  big or technical: big (it changes what the guard trusts, as D-17's own card says). This is new: a follow-up to the D-17 answer, not covered by it.

- id: R-M1-90
  verdict: CONFIRMED
  severity: P2 (as given)
  evidence: §5.1 X 607 ("never runs, because the change holds harness git first"). WSP-10 507 checks only before and after each command. M1-AC11 732 makes a second soldier's snapshot during the first one's turn. WSP-7 492 is M6, and PO-8 261 limits it to "harness git for that soldier". The 2.0 draft stated this exact case as "detected, not prevented" (legacy 170). d4.txt's residual 7 states the window, so applying d4.txt as drafted would contradict §5.1 X.
  reason: Between WSP-10's check and git's own reading of the config, another soldier can add a filter that then runs. If the soldier removes it before the after-check, even that check misses it.
  fix: §5.1 X 607: "A filter added after the post office started, in any config scope, holds harness git at the next check, so no harness git command that starts after that check runs it. One added between a command's check and git's own reading of the config can run once; the check after the command finds it if it is still there, and holds harness git (Appendix D). One set at start is the owner's, and runs (WSP-10)." In d4.txt's residual 7, change "The check after the command finds the change" to "...finds the change if it is still there". WSP-7 492: "No code of that soldier runs while the harness runs git for it", to match PO-8 261.

- id: R-M1-91
  verdict: CONFIRMED
  severity: P2 (as given)
  evidence: PO-3 213. decisions.md D-9 261 and 271 name only Windows and Linux. The unapplied draft drafts/answers/d9-10-19.txt 17 already gives macOS a log value (`memory protection: not checked`). But its residual (line 18) and d4.txt's residual 1 still name only Windows and Linux at `ptrace_scope` 0. The owner's D-9 answer A is "harden where the system allows, and accept the rest".
  reason: The macOS log value is already drafted. The residual, though, says nothing about whether a same-user soldier can read the secret on macOS, a supported system (D-20 A). Under D-9 A, stating macOS as part of "the rest" is a text fix that needs no new decision.
  fix: In the D-9 draft's "What this doesn't stop" and in Appendix D's residual 1, add: "On macOS the post office checks nothing, and whether a soldier can read either copy of the secret is not assessed: it depends on how Node.js and Claude Code are signed and on the Mac's developer settings. It is accepted with the rest (D-9)." Optional, to tighten it later: a probe of `task_for_pid` on a same-user Node process from an unprivileged process, with Developer Mode off and on.

- id: R-M1-93
  verdict: NEEDS-PROBE
  severity: P2 (as given)
  evidence: CH-2 297 passes the mode only "on every start and resume". CH-7 337 says "the mode comes from the autonomy level" and checks it only at `system/init`. CH-6 325 relays "the CLI's own options" unchanged. https://code.claude.com/docs/en/permission-modes (fetched): "Approving a plan exits plan mode and switches the session to the permission mode each approve option describes". That page and the SDK pages (https://code.claude.com/docs/en/agent-sdk/permissions, https://code.claude.com/docs/en/agent-sdk/user-input) don't say what a `can_use_tool` allow for ExitPlanMode does in a stream-json `-p` session. D-7's judged merge (raw/D-7-option-C.md 35-37) would set each turn's mode before its message at supervised. That would restore `plan` for later turns, but D-7 waits on the owner's card.
  reason: Whether one y on a relayed ExitPlanMode leaves a supervised soldier out of `plan` is undocumented. Its writes stay in its snapshot or worktree and are reported, so the harm is contained, but it silently breaks CH-7's mapping.
  probe: With the owner's go, in a throwaway folder, run `claude -p --input-format stream-json --output-format stream-json --verbose --permission-mode plan --permission-prompts host --permission-prompt-tool stdio` and ask for a plan. Answer its ExitPlanMode `can_use_tool` with allow, unchanged `updatedInput` and no `updatedPermissions`, then a second time echoing its suggestions. Record any `permissionMode` status event, and whether the next message's Edit runs, asks, or is blocked. One short claude session.

- id: R-M1-96
  verdict: DECISION
  severity: P2 (as given)
  evidence: drafts/answers/d3.txt 199 (`Add-Type -Path` "compiles it into an in-memory assembly") contradicts the draft's Q8 answer ("so nothing is compiled or downloaded on the owner's machine", raw/D-3-merge-draft.md 335). https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/add-type?view=powershell-5.1 (fetched): `-Path` takes "source code files or assembly DLL files", and "If you submit an assembly file, Add-Type takes the types from the assembly". probes.md P-10 already names "the C# must be built ahead of time" as the fallback. decisions.md 112 records that the judge took C's Windows text "whichever option wins", so the D-3 card never put Windows to the owner.
  reason: A run-time C# compile on Windows contradicts the owner's "prebuilt". A free option exists inside B: a CI-built, checksummed DLL that the same script loads with `Add-Type -Path`. It removes the compile and R-M1-61's coverage gap. It doesn't remove ConstrainedLanguage, which blocks loading the DLL too, so the admin-allowlist residual stays.
  options: (a) Keep the script and its run-time compile, and fix Q8's sentence. (b) Ship a prebuilt, Authenticode-signed Windows helper. This costs a code-signing certificate. (c) Ship the C# prebuilt as a DLL built, tested and checksummed in CI, beside the script, loaded with `Add-Type -Path` (recommended).
  big or technical: technical for (a) or (c), as part of the owner's answer B (no new card). (b) adds a cost and would go to the owner.

- id: R-M1-98
  verdict: NEEDS-PROBE
  severity: P3 (was P2): the draft's sweeps already bound the outcome whatever launchd does. In the post-office-plus-guardian kill case, NEW-D3-AC2's third bullet requires the mod's sweep to end the writer within 10 s. Only the wording of NEW-D3-8's restarted-guardian sentence and the delay depend on the probe.
  evidence: drafts/answers/d3.txt 134, 156 and 158 (job removed, then the recorded coalition ended; "Spike S7 measures how soon"). S7's macOS item (raw/D-3-merge-draft.md 281). probes.md P-8. The only source for `launchctl submit` and `remove` behaviour is the man page, read through an unofficial copy (https://leancrew.com/all-this/man/man1/launchctl.html); Apple publishes no web page for it.
  reason: launchd's restart and coalition behaviour is undocumented, but the draft already treats it as unknown and keeps the sweep as the backstop. This finding asks for nothing beyond S7.
  probe: P-8 within spike S7. On a Mac, kill a guardian started with `launchctl submit`, and record whether launchd restarts it, after what delay, and in which coalition. No model call.

- id: R-M1-99
  verdict: DECISION
  severity: P2 (as given)
  evidence: d3.txt puts NEW-D3-AC7 (a notarized dry run, line 322) and NEW-D3-AC8 (a live run on a Mac, line 328) in M1. v0.10's M1-AC8 717 asks only for "Windows and ... one POSIX system". probes.md 11, 12 and 14 wait for "the owner's go and a Mac". In D-20's card (decisions.md 414), choosing A keeps "the live run on a Mac before 2.0.0", not before M1. D-3's card already put the 99 USD to the owner, and the owner answered B.
  reason: As drafted, M1 can't close without an Apple Developer ID and a Mac. That timing is a milestone-order choice, like D-13 and D-15. The cost and the Mac are already accepted for 2.0.0.
  options: (a) Keep both ACs in M1, and the owner confirms the Mac and the enrolment before M1's containment ACs are claimed. (b) Keep the macOS containment tests on CI's macOS runners in M1. Move NEW-D3-AC7's signing and notarization, and NEW-D3-AC8's Mac half, to M6 beside VER-10 and the first release (recommended).
  big or technical: technical (milestone order), within D-3 B and D-20 A already answered. No new card; tell the owner that enrolment is needed before the first release.

- id: R-M1-100
  verdict: DUPLICATE
  severity: P3 (as given)
  evidence: ledger R-M1-61 (open, NEEDS-PROBE P-10: "The spec names how the C# is measured once P-10 answers"). d3.txt 262.
  reason: Same as R-M1-61. It closes by itself if R-M1-96 takes (c), since a CI-built DLL is measured by an ordinary .NET coverage tool.

- id: R-M1-101
  verdict: REFUTED
  severity: P3 (as given)
  evidence: PLAYBOOK.md section 2, item 3 asks for an ADR only when a question is deferred past 2.0 ("answered in the text, or deferred past 2.0 with a reason (an ADR where it is a design choice)"), and section 10.9 asks for ADR amendments only after 1.0. The draft records Q8 as "(answered by D-3)" with its requirements (raw/D-3-merge-draft.md 335), and decisions.md D-3 keeps the full record. The other big owner answers (D-4, D-5, D-8, D-9, D-10, D-16, D-17, D-19) have no ADR either.
  reason: No rule requires an ADR for an answered big decision, and Q8's answered line plus decisions.md already record D-3. If ADRs are wanted for big owner answers, that is one document-structure call for all of them, not a D-3 gap.

- id: R-F-89
  verdict: DUPLICATE
  severity: P2 (as given)
  evidence: ledger R-F-31 (P1, parked for M3: "a soldier's send has no defined return path: replies as new turns can ping-pong without limit"). MSG-5 389, MSG-3 371, ARM-4 464.
  reason: Same as R-F-31: how a reply reaches a soldier that sent a message. It is parked for M3, and D-5's text holds under either reading.

- id: R-F-92
  verdict: NEEDS-PROBE
  severity: P3 (was P2): v0.10's §5.1 L 634 already defines the measure (input whether uncached, cache-written or cache-read, plus output). The unapplied d8-16-17.txt 15 counts cached input and reasoning "once", with "the contract fixtures (VER-4) show which field holds which", which is right under either semantics. What remains is an untested mapping.
  evidence: CH-3 312. https://learn.chatgpt.com/docs/app-server (fetched, the official page that developers.openai.com/codex/app-server redirects to): it lists `thread/tokenUsage/updated` only as "usage updates for the active thread", and points to `codex app-server generate-json-schema`, which gives field names but not their meaning. The codex app-server README on GitHub doesn't mention it. Only unofficial sources say cached input sits inside `input_tokens`. v1's codex parser reads `input_tokens` alone (src/adapters/runParsers.ts 65). M2-AC1 743 doesn't check usage at all.
  reason: Whether cached input sits inside codex's input count, and reasoning inside its output, is undocumented. Only a recorded session settles it.
  probe: In M2's VER-4 recording, record two turns in one codex app-server thread (the second one cache-hitting), and compare each turn's `last.totalTokens` with `inputTokens + outputTokens` and with `inputTokens + cachedInputTokens + outputTokens`. Add to M2-AC1, as proposed: "the codex fixture's turn tokens equal section 5.1's measure, with no field counted twice".

- id: R-F-93
  verdict: CONFIRMED
  severity: P3 (as given)
  evidence: VER-8 653 "(M2; R)". M1's Implements (685) lacks VER-8, while VER-9 654 is "(M1, M2; L)" and M1-AC8 717 is a live check "written up on the PR". VER-7 652 cites "VER-8, →M2". Under D-8's draft, a release's spend counts every milestone's checks, M1's included.
  reason: M1's live checks are written up with no defined fields, so the release's budget can't count M1's spend.
  fix: As proposed: "VER-8 (M1, M2; R)", and add VER-8 to M1's Implements. Also VER-7 652: "(VER-8 and section 6)", dropping "→M2". M1-AC8 717 ends "(HOST-2, PO-7, VER-8)".
