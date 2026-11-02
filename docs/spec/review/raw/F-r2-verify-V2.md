Verifier F-R2-V2 (F's round-2 consistency auditor, R-F-97 to R-F-112), against v0.11, 2026-10-20

- id: R-F-97
  verdict: CONFIRMED
  severity: P3 (was P2): Appendix D is informative and says "where it differs from a requirement, the requirement governs" (1544). ARM-7 already states all three gaps as residuals (678). R-M1-107 judged the hook route to be code the owner already runs as themselves. So nothing gets built differently; only the threat model the owner signs is incomplete. That is the same kind of mismatch as R-F-94, which is P3.
  evidence: v2@af97372.md 1585 (row 10: "prevented, except residual 4"); 678 (ARM-7: a PreToolUse hook can answer the card, any process of the owner's can write the record, v1's commands read the files with no card); 1596 ("Each is accepted by the owner's decision, or stated by the requirement named beside it"); 1594 (the "In short" paragraph counts row 10 as prevented); residuals 1-9 at 1598-1606 list none of the three; ledger R-M1-107 ("ARM-7 already states both residuals", meaning in ARM-7, not in Appendix D); decisions.md D-4 card line 174 ("you accept, in writing, the residual risks it lists").
  reason: Three residuals that ARM-7 states itself are missing from the list the owner accepts, so row 10 and the "In short" paragraph claim more than ARM-7 does.
  fix: as proposed. Row 10's Outcome reads "prevented, except residuals 4 and 10". Add residual 10 "**The trust card's own gaps** (ARM-7)" with the proposed text.

- id: R-F-98
  verdict: DUPLICATE
  severity: P3 (was P2): it is the residual-3 part of R-F-94 (P3), in an informative appendix that the requirements govern.
  evidence: raw/ANS-FC1.md 123 and 126 (R-F-94's residual 3: "A Linux guardian ended from outside lets the processes no listing found escape for good; a guardian killed together with the post office leaves its tree running until the mod or the next post office sweeps it (PO-15, PO-16)"); ledger 133 (repair pending for v0.12); v2@af97372.md 1600, 390, 210.
  reason: This is the same mismatch between residual 3 and PO-15/PO-16 (an unlisted Linux process is never swept; macOS and Windows lose nothing), and R-F-94's pending repair already replaces that sentence.

- id: R-F-99
  verdict: CONFIRMED
  severity: P2
  evidence: v2@af97372.md 237 and 241 (logs under `.shadow/v2/logs/`, "each message, thinking block, tool call and tool result whole"); 242 (reports under `.shadow/v2/reports/`); 376 (`.shadow/v2/trees/`); 1602 (residual 5: unmatched secrets are logged as written). No `.gitignore` or `info/exclude` rule appears anywhere in the spec (the only grep hits are 657 and 1609, both about other things). v1 writes `.shadow/.gitignore` holding `*` (AIConnections-review/src/workspace/session.ts:56-61, src/vault/vault.ts:160, tested in workspace.test.ts:158). Codex's draft keeps it only by calling v1's helper (AIConnections-m1/src/v2/postOffice.ts:63). Nothing in settled.md or docs/adr/ covers it.
  reason: v2 silently drops v1's rule that the army's files can't be committed, so `git add -A` in the checkout puts whole session logs, with any unmatched secrets, into the repository's history.
  fix: carry v1's rule, which is technical because it is v1's existing behavior and changes nothing the owner sees. PO-5 adds: "Before it writes anything under `.shadow/v2/`, the post office makes sure `.shadow/v2/.gitignore` holds `*`, so git ignores the army's files, as v1 does for `.shadow/` (from v1, `src/workspace/session.ts`)." M1-AC2 adds: "after a session, `git status --porcelain` in the checkout lists nothing under `.shadow/`." I put the file inside `.shadow/v2/`, not `.shadow/`, so that writing it is never a checkout change under WSP-11 (720). The proposal's option (b), accepting the risk instead, would be big.

- id: R-F-100
  verdict: CONFIRMED
  severity: P2
  evidence: v2@af97372.md 1570 (actors row: other local users "reach only a loopback port"). Only PO-4's `--mcp-config` file (231) is required to be readable by the owner only. PO-5 (237), PO-6 (242), PO-16 (376) and WSP-11 (711) give no file mode for logs, reports, records, tree entries or snapshots. Codex's draft already writes logs and the instructions file at 0600 (AIConnections-m1/src/v2/logs.ts:76, src/v2/claude.ts:97), so the spec doesn't require what its builder already does. Nothing in settled.md or the ADRs covers it.
  reason: On a shared POSIX host with umask 022, another user can read `.shadow/v2/logs/*.jsonl` (whole tool results, unmatched secrets included) and the HEAD copies under `~/.shadow-army/snapshots/`, so the actors row's claim is false.
  fix: the technical option (a). It closes the defect without changing what the owner sees or approves; option (b), accepting the risk, would be big. PO-5 adds: "On Linux and macOS, the post office creates `.shadow/v2/` and `~/.shadow-army/`, and every folder under them, readable only by the owner's user (0700), and every file it writes there 0600, whatever the umask. On Windows it creates the two folders with inheritance off and an ACL that grants only the owner's user, SYSTEM and Administrators." Add an X case to M1-AC2 that checks the modes, or the ACL on Windows. The actors row then cites PO-5.

- id: R-F-101
  verdict: CONFIRMED
  severity: P3 (was P2): both readings stay well inside the $2 limit on the first check, and a check that has started is never cut short (854). The only difference is whether one go is asked for.
  evidence: v2@af97372.md 854 ("For the parity task's first run, ADR-0009's figures stand in ... a check with no earlier figures" waits for the go); 848 (claude's live turns and the headless `total_cost_usd` of claude and grok count against $2); 847 ("Shadow Army never estimates a cost"). ADR-0009 lines 10-15 give tokens only. raw/ANS-FC1.md 25 calls "a check with no earlier figures waits" the cautious reading of D-8 B.
  reason: A token figure can't stand in for a dollar spend, so for claude's runs, and grok's headless one, the text supports both "runs without a go" and "waits for a go".
  fix: as proposed, which keeps ANS-FC1's cautious reading. 854: "For the parity task's first run, ADR-0009's token figures stand in for the runs that count against a token limit. A run that counts against $2 and has no earlier cost figure makes its check one with no earlier figures."

- id: R-F-102
  verdict: CONFIRMED
  severity: P3 (was P2): the counting rule is already generic. Each run counts against exactly one limit, chosen by whether its CLI reports a cost (847-849), and the measure counts each input, cached or not, once (844). Only the field mapping is missing.
  evidence: v2@af97372.md 844, 847-851 (field bullets only for codex and agy); CH-4 493 ("Usage comes from the prompt result's `_meta.usage`", with no cost and no fields named). https://docs.x.ai/build/cli/headless-scripting says only that "`session/prompt` returns completion metadata"; it documents no usage, cost or `_meta.usage` fields. evidence/ has no grok usage recording (s6-results.md covers only grok's cancel). v1's grok headless parser reads `total_cost_usd` (src/adapters/runParsers.ts:78, 100). The grok runs in ADR-0009 total about 141k, under the per-CLI 1,000,000, so the sizing point doesn't hold.
  reason: Without a grok bullet, two builders could read grok's `_meta.usage` input and cached fields differently. The fix can defer the field names to fixtures, as codex's bullet does, so no probe has to come first.
  fix: after 851: "- grok: a live turn's input, cached input and output come from its prompt result's `_meta.usage` (CH-4), each counted once; a live turn whose `_meta.usage` gives a cost counts against $2 instead. The contract fixtures (VER-4) show which field holds which."

- id: R-F-103
  verdict: CONFIRMED
  severity: P2
  evidence: v2@af97372.md 872 (VER-10: "on Linux and on macOS, each in its own terminal, as well as on Windows: a brief answered, a turn stopped, and a change applied and undone, with the pane, the strip and the decisions list drawn"); 1159 (M6-AC8: "the owner's runs on Linux and macOS pass"); 941 (M1-AC8's Windows run covers only the parity check and the army's life, both before M5 and M6); 1182 (Q6). The D-8/16/17 drafts (drafts/answers/d8-16-17.txt:121, 123) carried M6-AC8 unchanged. Nothing pending fixes it: R-M1-99 moves only the Mac run to M6.
  reason: M6-AC8 can pass while VER-10's Windows run (apply, undo and the M5 screens) never happens. The PLAYBOOK's table lists that kind of gap as a P1 example, but I keep P2 because the owner works on Windows and M1-AC8 already runs there live.
  fix: as proposed. M6-AC8: "Live: the owner's runs on Linux, macOS and Windows pass, and are written up on the PR with each system's version and terminal (VER-10, VER-8)." Q6 reads "Linux, macOS and Windows terminals".

- id: R-F-104
  verdict: CONFIRMED
  severity: P3
  evidence: v2@af97372.md 1589 (row 14: "`redact()` runs on every log, record, report, brief and event"); 693 (WSP-8: "An approval request is the one exception ... whole ... for the card to show word for word"); M2-AC2 1014; SEC-4 727 (logs and records only).
  reason: Row 14 claims every event is redacted, but WSP-8 sends an approval request's card content whole, by design.
  fix: as proposed.

- id: R-F-105
  verdict: DUPLICATE
  severity: P3
  evidence: raw/ANS-FC1.md 122 and 126 (R-F-94's residual 1: "or without Yama", `SeDebugPrivilege`, claude's credential file); ledger 133 (repair pending for v0.12); v2@af97372.md 1598, 227, 232.
  reason: This is the residual-1 part of R-F-94, word for word, and its repair is already pending.

- id: R-F-106
  verdict: CONFIRMED
  severity: P3
  evidence: v2@af97372.md 1591 (row 16: report size "refused with its reason ... PO-6", "the meter (G5)"); 243 (PO-6 keeps a long report's first 2 MiB and refuses nothing); 604 (SES-2 is the meter); 1544 ("Each control is named by the requirement that makes it"); 44 (G5 is a goal).
  reason: A report over 2 MiB is cut, not refused, and the appendix's own rule says to cite the requirement (SES-2), not the goal.
  fix: as proposed.

- id: R-F-107
  verdict: CONFIRMED
  severity: P3
  evidence: v2@af97372.md 67 (glossary: "one for each supported system and processor"); 1184 (Q8: "one binary for each supported system and processor"); 332 (PO-12: `native/darwin/sa-contain`, "one universal binary, with `arm64` and `x86_64` code"). The words come from option B's framing (decisions.md 140), not from the owner, so restating them changes no decision.
  reason: Taken literally, the glossary and Q8 count one binary per processor on macOS, where PO-12 ships one universal binary.
  fix: as proposed, in the glossary and in Q8.

- id: R-F-108
  verdict: REFUTED
  severity: P3
  evidence: v2@af97372.md 41 (G2); 467 (CH-2: "This changes one vendor default; it removes no tool and disables no safeguard (CH-7)"); docs/adr/0010-vendor-harnesses-stay-whole.md line 11 (what "whole" means: never replace the system prompt, never remove a built-in tool, never disable a safeguard); decisions.md D-19, where the owner chose A knowing it changes a vendor default (384, 392-395); D-6 (199), which treats rewording one of the owner's goals as big.
  reason: G2's "harness exactly as installed" means the installed harness (ADR-0010's prompt, tools and safeguards), which CH-2 keeps whole. A documented environment setting is a launch option like `--permission-mode` or `--append-system-prompt`, which G2 already lives with. Rewording the owner's goal for a non-conflict would be a big change bought with a nit.

- id: R-F-109
  verdict: CONFIRMED
  severity: P3
  evidence: v2@af97372.md 816 (§5.1 X: "with every hook present, as files and in the config"); 944 (M1-AC10: three hook files and one config hook); 701 (WSP-10: `hook.<event>.enabled` false "for each hook event the command can fire").
  reason: §5.1's "every hook" is wider than the AC, and the AC's single config hook is narrower than WSP-10's "each hook event the command can fire", so the test author can't tell which set to plant.
  fix: §5.1 X: "... and an external diff, with each hook its commands can fire present, as files in `hooks/` and defined in the config (M1-AC10): ...". M1-AC10's first bullet plants the same set as config hooks, not `post-checkout` alone.

- id: R-F-110
  verdict: CONFIRMED
  severity: P3
  evidence: "harness git" appears 20 times and is defined only by WSP-10's opening sentence (700); glossary 81 (Snapshot: "a copy of a base", while WSP-11 711 copies HEAD and ARM-6 654 uses "its base"); 85 (Trust card: "the owner's acceptance"), while ARM-7's card, at 671-675, is the question the owner answers.
  reason: These are three glossary nits: a term the spec uses everywhere but never defines in its glossary, an undefined "base", and an entry that names the card as the answer rather than the question.
  fix: as proposed. Snapshot: "a throwaway copy of HEAD (WSP-11), or of a soldier's base (ARM-6), whose writes are discarded and reported".

- id: R-F-111
  verdict: CONFIRMED
  severity: P3
  evidence: v2@af97372.md 834 (§5.1 F: "until r"); 132 (r is a pane key, HOST-5, which arrives in M5); 110 (in M1, `sa live` does the reconnect); 207 (PO-1: "until the owner reconnects it"); 930 (M1-AC4: "until it is reconnected"). "until r" survives from R-M1-15's v0.8 wording (ledger 179).
  reason: §5.1 F names a key that M1 doesn't have, while the requirement and the AC say "reconnected".
  fix: as proposed.

- id: R-F-112
  verdict: CONFIRMED
  severity: P3
  evidence: v2@af97372.md 799 (the only capitalized MUST outside a requirement; every other one is inside an ID'd requirement); 16 (MUST is an RFC 2119 word); 1218 (Appendix B rule 1). Every requirement with C evidence is already traced through rule 9 (1226), so nothing actually escapes the trace.
  reason: An RFC 2119 MUST in a description of a test level, with no requirement ID, breaks the spec's own convention, though it hides no untraced behavior.
  fix: 799: "The tests replay each recording through the channel adapter, and pass only when the adapter's events match the expected events." (no MUST; the proposed "(CH-1)" cite is dropped, because the rule covers every adapter's C evidence, not CH-1 alone).

Main files: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@af97372.md, C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\F-r2-consistency.md, C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\ANS-FC1.md, C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md, C:\Users\johns\projects\AIConnections-review\docs\adr\0009-live-sessions-through-each-cli.md, C:\Users\johns\projects\AIConnections-review\docs\adr\0010-vendor-harnesses-stay-whole.md

Sources:
- [xAI docs: headless scripting](https://docs.x.ai/build/cli/headless-scripting)
