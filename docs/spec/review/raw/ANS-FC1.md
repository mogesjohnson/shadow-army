Fix check ANS-FC1 (batches/ANS-FC1.md) of v0.11 (v2@af97372.md) against v0.10, 2026-10-20; cut off by the usage limit once and resumed

## Fix check ANS-FC1 of spec v0.11 (`v2@af97372.md` against `v2@e7c33b4.md`)

Eight of the nine answers do what the owner chose. D-19 does too as written, but its fix fails in one documented case, so R-M1-82 is NOT FIXED. Ten of the eleven findings are fixed. The changes broke or left half done 2 P2 and 8 P3 items, listed below.

I had no shell in this run, so I did not run `trace-v2.mjs`. The "0 problems" result is the packet's claim, not something I checked. Line numbers below are from `C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@af97372.md`.

### Answers

- **D-3 B: DONE.**
  - Evidence: PO-9 to PO-21 (297-454); PO-1 203, 209-210; PO-2 216; PO-7 256; PO-8 272; §2 65-67; §5.1 807, 815, 839; VER-2 860; VER-6 868; Implements 896; S7 904-909; M1-AC15 to M1-AC22 (970-1005); Q8 1184.
  - Reason: the helper ships prebuilt for each system and processor, is built twice and compared, is checksummed, attested where the repository allows, and is tested on PO-21's matrix. The Developer ID costs what the card said, and the public repository stays optional (PO-20 438), as the card offered.
  - Two leftovers: PO-3's Windows text (finding 4) and the clash between PO-21 and VER-6 (finding 6).
- **D-4 A: DONE.**
  - Evidence: §0 34; Appendix D 1542-1611.
  - Reason: it is an informative appendix with assets, actors and their trust, 17 boundaries each with a control, evidence codes and a prevented/detected outcome, and residual risks marked for the owner to accept.
  - Some lines drift from the parallel D-3 and D-9 text (finding 5).
- **D-5 B: DONE.**
  - Evidence: MSG-1 546; MSG-3 554-560; MSG-5 573; MSG-6 577-578; PO-6 243; PO-5 241 (no log limit, disk risk stated); HOST-10 173-174; HOST-11 177-178; §2 69, 74; M3-AC14 1089-1093; H62 1408.
  - Reason: queue, send-rate and size caps are in now, and log rotation is left to H62 with the disk risk stated, as chosen.
- **D-8 B: DONE.**
  - Evidence: §5.1 L 847-854; VER-8 870; VER-9 871.
  - Reason: there are two limits, $2 of reported cost and 1,000,000 tokens per CLI, each run counts against exactly one, and a check past either waits for the owner's go.
  - It also makes a check with no earlier figures wait for a go. That is a cautious reading of "would go past", not an addition.
- **D-9 A: DONE in the spec; half done outside it.**
  - Evidence: PO-3 219, 223-227; PO-4 231-232; SEC-2 725; SEC-5 728; §5.1 X 813; M1-AC2 923; M3-AC8 1076; Q9 1185; B2 1400.
  - Reason: the post office protects its own memory where the system allows (Yama, the Windows DACL), logs the protection it has, and states the rest as a residual. Claude's credential falls back to an owner-only file that is removed after `initialize`.
  - Option A as recorded (decisions.md 263) also narrows ADR-0012's consequences. That was not done (finding 3).
- **D-10 A: DONE.**
  - Evidence: ARM-7 667-678; §2 85; §5.1 X 814; Implements 899; M1-AC13 962-968; Appendix A 1207.
  - Reason: the four policy files are hashed, a new, changed or gone file stops every session in the folder until the card is accepted, and only the card raises autonomy above supervised.
  - Where it meets D-17 there is a cost the owner may not expect (finding 7).
- **D-16 A: DONE.**
  - Evidence: CH-2 470-474; M1-AC8 941.
  - Reason: supervised claude stays in `plan`. The text states what claude's classifier then runs without the owner, and that the owner's own `useAutoModeDuringPlan: false` makes each such command ask. No adapter writes the setting.
  - The list of files that can turn it off is incomplete (finding 9).
- **D-17 B: DONE, with a gap where it meets the guard.**
  - Evidence: PO-1 200; §2 63; WSP-1 682; WSP-10 707; WSP-11 711, 714-720; ARM-6 657; M1-AC11 959-960; M6-AC9 1160.
  - Reason: there is an army per working tree, each with its own mark, and each leaves the other's snapshots, worktrees and branches out of its checks.
  - The working trees themselves are not left out (finding 2).
- **D-19 A: DONE as chosen.**
  - Evidence: CH-2 467; M1-AC14 969.
  - Reason: every claude process gets `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, as the owner's card said.
  - The vendor's docs say a repository's settings `env` block overrides that value in a `-p` session (finding 1).

### Findings v0.11 fixes

- **R-M1-59 (P1): FIXED.**
  - Evidence: PO-1 209; PO-10 317; PO-15 363-366; PO-16 375-390; Appendix D residual 3 (1600); M1-AC16 977-982.
  - Reason: a guardian that dies with the post office is now covered by the on-disk record and by two sweeps, one by the mod at once and one by the next post office. On Linux, processes that no listing found are a stated residual.
- **R-M1-61: FIXED as far as the spec can go.**
  - Evidence: VER-6 868; PO-19 427-429; S7 906.
  - Reason: the script and its C# are files of their own and count toward coverage. How the C# is measured waits on S7 (R-M1-100).
- **R-F-68 (P1): FIXED.**
  - Evidence: PO-14 347-361; M1-AC18 987-990.
  - Reason: with no containment, no soldier starts. There is no override, a message for each cause, and an AC for each cause.
- **R-M1-82: NOT FIXED.**
  - Evidence: CH-2 467; M1-AC14 969; finding 1.
  - Reason: a committed `.claude/settings.json` that sets the variable to 0 turns auto memory back on for every soldier, and M1-AC14's own live case is exactly that.
- **R-F-90: FIXED.**
  - Evidence: HOST-10 173; MSG-3 555-556; HOST-11 177; M3-AC14 1090.
  - Reason: a refused brief now returns its refusal and reason with no id, and the brief's row says so.
- **R-F-91: FIXED.**
  - Evidence: MSG-3 554; M3-AC14 1091.
  - Reason: a queue holds at most nine, so keys 1 to 9 reach each message.
  - Caveat: summaries going back to a soldier are never refused and don't count. If they queue as turns (R-F-89's open reading), a queue can hold more than nine items.
- **R-M1-94: FIXED.**
  - Evidence: M1-AC8 941.
  - Reason: M1-AC8 now checks live that a supervised turn with the classifier off gets claude's own denial and nothing waits.
- **R-M1-95: FIXED.**
  - Evidence: WSP-11 711.
  - Reason: the mark is the first 12 hex digits of the SHA-256 of `git rev-parse --show-toplevel`, lower-cased on Windows. The ledger's probe on the casing rev-parse prints stays open.
- **R-M1-97: FIXED.**
  - Evidence: PO-1 203; PO-9 304; PO-15 373.
  - Reason: a containment failure is not a crash and is never restarted by itself.
- **R-M1-102: FIXED.**
  - Evidence: M3-AC8 1076.
  - Reason: the AC now checks that no process holds a soldier credential on its command line, and that claude's fallback file is gone after `initialize` and after a kill.
- **R-M1-103: FIXED.**
  - Evidence: ARM-7 668; M1-AC13 967.
  - Reason: a folder's own policy file replaces the shipped copy file by file, as v1's `src/core/rules.ts` does; the shipped copies need no trust.

One finding verified elsewhere is affected: finding 1 settles R-M1-106 from the docs. Its drafted fallback, `--settings '{"autoMemoryEnabled": false}'`, would not work either.

### Found broken or half done

```
- severity: P2
  type: vendor-fact
  location: CH-2 (docs/spec/v2.md:467), M1-AC14 (docs/spec/v2.md:969), Appendix D row 15 and residual 2 (docs/spec/v2.md:1590, 1599)
  claim: Setting CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 in the claude process's environment is overridden by a settings file's `env` block, which a repository's own `.claude/settings.json` applies in a `-p` session with no trust dialog. So CH-2 doesn't keep auto memory off, and M1-AC14's live case fails by the vendor's own documentation.
  scenario: A repository commits `.claude/settings.json` with `{"env": {"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0"}}`. The soldier's snapshot contains it. claude -p applies project `env` values at startup and replaces the inherited 1. Since 0 forces memory on even over `autoMemoryEnabled: false`, the soldier loads the Monarch's MEMORY.md and can write memories the owner's next session loads. This is exactly the case M1-AC14 expects to pass. The drafted fallback (`--settings '{"autoMemoryEnabled": false}'`, R-M1-106) loses too, because the variable outranks that key in either direction.
  evidence: https://code.claude.com/docs/en/settings-reference (env: "A value here overwrites the same variable exported in your shell, and when more than one settings file sets a variable, the highest-precedence one applies"; "From project and local settings: after you trust the workspace, or at startup in -p mode, which never shows the trust dialog"; the "Variables Claude Code ignores in env" list doesn't name it; autoMemoryEnabled: "CLAUDE_CODE_DISABLE_AUTO_MEMORY takes precedence over this key for one session, in either direction"); https://code.claude.com/docs/en/env-vars (row: "Set to 0 to force auto memory on even when ... autoMemoryEnabled: false would otherwise disable it"; precedence: "the settings file value applies in most sessions ... replacing the value inherited from the shell"); https://code.claude.com/docs/en/settings (precedence: command line `--settings` above project local, shared project and user)
  fix: CH-2: "The adapter starts each claude process with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in its environment and in the `env` of the `--settings` it passes (inline, or as a file written beside the session's log where the command line can't carry it, as for `--append-system-prompt-file`). `--settings` outranks the user's, the project's and the local settings files, so no repository can turn memory back on. Only managed settings outrank it: an organization's `env` that sets the variable to 0 is a stated residual risk (Appendix D, residual 2)." M1-AC14 keeps its case and adds the same value set in the user's settings `env`. Appendix D row 15 and residual 2 name the managed-settings exception.
- severity: P2
  type: gap
  location: WSP-10 (docs/spec/v2.md:707-708), WSP-11 (docs/spec/v2.md:720), PO-1 (docs/spec/v2.md:200), M1-AC11 (docs/spec/v2.md:959-960), M6-AC9 (docs/spec/v2.md:1160)
  claim: D-17 makes each linked working tree a folder with its own army. But WSP-10's "another army's" covers only Shadow Army's own snapshots and worktrees, not the linked working trees themselves. So creating or removing a working tree, the normal way to get a second army, is a worktree-metadata change to every other army on the repository.
  scenario: Army A runs in the main working tree with a soldier mid-turn. The owner runs `claude --worktree` (which runs `git worktree add` under `.claude/worktrees/`), or exits a clean unnamed worktree session (Claude Code removes it automatically), or the Monarch runs a subagent with `isolation: worktree`. The new or vanished `.git/worktrees/<name>` metadata is in neither of WSP-10's two classes. In M1, A's running turn fails (WSP-11 720) and A's harness git stays held until A's post office restarts (WSP-10 708). From M2 the owner gets an attribution card each time. M1-AC11 only tests a linked worktree that already exists, and M6-AC9's "once that worktree has been removed" doesn't say harness git stays unheld.
  evidence: WSP-10 707 ("Any other snapshot or worktree is another army's in two cases: its gitdir lies in a subfolder there that carries another army's mark, or its HEAD names a branch under another army's mark"); D-17 card (decisions.md 365-367: "you already run sessions side by side in worktrees of one repository"); https://code.claude.com/docs/en/worktrees ("created under .claude/worktrees/<name>/"; "for an unnamed session, Claude removes the worktree and its branch automatically"; subagent worktrees "Claude Code removes automatically")
  fix: "decision: (a) WSP-10 also leaves out the metadata of each linked working tree of the repository that `git worktree list` shows outside `~/.shadow-army/snapshots/`, as it does another army's snapshots. Its add or removal is logged with one transcript line, and the shared config, `hooks/` and `info/` are still compared. This widens what the guard trusts, which D-17's record calls big. (b) Keep it a change, say so in PO-1 and WSP-10, and add the case to M1-AC11 and M6-AC9." Distinct from R-M1-92, which is about the nested worktree's files, not its metadata.
- severity: P3
  type: contradiction
  location: ADR-0012 Consequences (docs/adr/0012-local-only-post-office.md:22); PO-3 (docs/spec/v2.md:227); PO-4 (docs/spec/v2.md:232)
  claim: ADR-0012 still says "A soldier cannot act as the Monarch", while D-9's accepted residual (PO-3 227) says a soldier that runs code as the owner can read the secret and act as the Monarch. Option A as recorded included "ADR-0012's consequences narrowed".
  scenario: An enterprise reviewer reads ADR-0012, listed in §7, and believes the Monarch's commands are out of a soldier's reach on Windows.
  evidence: decisions.md 263 (option A: "SEC-5 and ADR-0012's consequences narrowed; the residual in D-4"); ADR-0012 line 22; PO-3 227
  fix: ADR-0012's consequence reads: "A soldier's credential lets it do nothing but `send` as itself. A soldier that runs code as the owner can still read the Monarch's secret where the system doesn't shield memory (spec PO-3, Appendix D residual 1; decision D-9)."
- severity: P3
  type: gap
  location: PO-3 Windows (docs/spec/v2.md:225); PO-19 (docs/spec/v2.md:426-432)
  claim: PO-3 sets the post office's DACL "by the same shipped means as its Job Object (PO-1)". Drafted against v0.10, this now cites PO-1, while the Job Object is PO-9 and PO-19. PO-19 defines the script only as a per-session guardian that does "what PO-9 and PO-10 say", with no DACL job and no run before the secret is read.
  scenario: A builder reads PO-19's list of what the script does, finds no DACL operation and no run at the post office's start, and has nowhere specified to put PO-3's protection, so its order against reading the secret and the checksum check have no requirement.
  evidence: PO-3 225; PO-9 300; PO-19 428-430; PO-13 344-345
  fix: PO-3: "Through the script of PO-19, run once from the installed package before it reads the secret, ..."; PO-19 adds: "Run with its DACL operation before the post office reads the secret, the script replaces the post office's DACL as PO-3 says, then exits."
- severity: P3
  type: contradiction
  location: Appendix D residuals 1 and 3, actors table (docs/spec/v2.md:1598, 1600, 1562)
  claim: Appendix D was drafted in parallel and differs from the requirements it cites. It also cites a decision where it should cite a requirement.
  scenario: There are three mismatches.
    - Residual 1 says that on Windows a soldier reads the secret from "the mod's or the post office's memory". PO-3 225-227 protects the post office's copy wherever the DACL is set. Residual 1 also drops PO-3's "or without Yama", the `SeDebugPrivilege` case and claude's credential file (PO-4 232).
    - Residual 3 says a killed helper's tree escapes "until the next start sweeps it". PO-15 364-365 says nothing escapes on macOS or Windows while the post office lives, and PO-16 390 says an unlisted Linux process is never swept.
    - The owner's actor row cites "D-10" in place of ARM-7.
  evidence: Appendix D 1544 ("where it differs from a requirement, the requirement governs"); PO-3 225-227; PO-15 364-366; PO-16 390
  fix: Residual 1: "a soldier that runs code as the owner can read the secret from the mod's copy on Windows always and on Linux at ptrace_scope 0 or without Yama, and from the post office's copy where PO-3 names no protection, or through SeDebugPrivilege when Claude Code runs elevated; claude's credential file can be read while it exists (PO-4)." Residual 3: "A Linux guardian ended from outside lets the processes no listing found escape for good; a guardian killed together with the post office leaves its tree running until the mod or the next post office sweeps it (PO-15, PO-16)." The actor row cites ARM-7.
- severity: P3
  type: contradiction
  location: PO-21 (docs/spec/v2.md:447), VER-6 (docs/spec/v2.md:868)
  claim: PO-21 says "every later job uses those bytes", while VER-6 measures the helper's C coverage "on a build of the same source instrumented for coverage".
  scenario: A CI author following PO-21 can't run VER-6's coverage job, or must break PO-21 to run it.
  evidence: PO-21 447; VER-6 868; PO-20 434
  fix: PO-21: "every later job uses those bytes, except VER-6's coverage job, which builds an instrumented copy that never ships."
- severity: P3
  type: decision-needed
  location: ARM-7 (docs/spec/v2.md:669, 677), §2 Folder (docs/spec/v2.md:63), PO-1 (docs/spec/v2.md:200)
  claim: The trust record is keyed by folder path, and D-17 makes each linked working tree a folder. So every new `claude --worktree` worktree of a repository that commits its policy files (this repository commits shadow.config.json and orchestratorDelegate.md) shows the trust card again for bytes already accepted.
  scenario: The owner accepts the card in the main checkout, then opens `claude --worktree` with a generated name. The folder is "new to Shadow Army", so no soldier starts until the same hashes are accepted again. This repeats for every worktree, and records pile up in `~/.shadow-army/trust/`.
  evidence: ARM-7 669 ("A file is untrusted when the folder is new to Shadow Army"), 677; D-10 card ("a trust card the first time the army runs in a folder"); D-17 card
  fix: "decision: (a) key the record by the repository (`git rev-parse --git-common-dir`) and each file's hash, so accepted bytes are trusted in every working tree of that repository; (b) keep it per folder and say so in ARM-7 and Appendix D residual 4."
- severity: P3
  type: ambiguity
  location: PO-6 (docs/spec/v2.md:243), WSP-8 (docs/spec/v2.md:693-695)
  claim: PO-6 doesn't say whether the report is cut at 2 MiB before or after `redact()`. Cutting first can leave the start of a secret that is shorter than WSP-8's minimum match lengths, so it is not redacted.
  scenario: A reply carries `sk-ant-` plus 40 characters across the 2 MiB boundary. Cut first, the report ends with `sk-ant-` plus 5 characters, below the 12 that WSP-8 requires, so the fragment is written unredacted.
  evidence: PO-6 243 ("keeps its first 2 MiB, cut between two characters"); WSP-8 694-695
  fix: PO-6: "The cut is taken from the reply after `redact()` has run on the whole of it."
- severity: P3
  type: vendor-fact
  location: CH-2 (docs/spec/v2.md:474)
  claim: "Only the owner turns the classifier off ... in their user settings (~/.claude/settings.json) or in managed settings" leaves out `.claude/settings.local.json` and `--settings`, which also honor `false`. The local file is read from the main checkout's root in a worktree, so the owner's local file there also affects soldiers.
  scenario: The owner's `.claude/settings.local.json` in the main checkout sets it to false. A supervised soldier's commands then ask, which CH-2's text doesn't predict.
  evidence: https://code.claude.com/docs/en/settings-reference (useAutoModeDuringPlan, "Scope: User, local, or managed"); https://code.claude.com/docs/en/settings (exceptions table: false "from any managed source, --settings, ~/.claude/settings.json, or .claude/settings.local.json"; "In a worktree, it uses the file at the main checkout's root")
  fix: "... in their user settings, their local project settings (`.claude/settings.local.json`, which claude reads from the main checkout's root in a worktree) or managed settings. A repository's committed `.claude/settings.json` can't turn it off ..."
- severity: P3
  type: editorial
  location: MSG-1 (docs/spec/v2.md:546)
  claim: The text says "counted as Unicode code points, which is v1's limit", but v1 counts UTF-16 code units (`prompt.length`), so the counting rule is new and only the figure is v1's.
  scenario: Text of emoji or other astral characters near the cap is accepted by v2 at a length v1 would have refused.
  evidence: src/core/brief.ts:8, 52 (`MAX_PROMPT_CHARS = 24_000`; `prompt.length > MAX_PROMPT_CHARS`)
  fix: "... counted as Unicode code points. 24,000 is v1's figure for a whole brief, which v1 counted in UTF-16 units."
```

### Sources

- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/worktrees

