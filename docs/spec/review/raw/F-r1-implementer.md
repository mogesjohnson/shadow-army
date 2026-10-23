# F round 1, implementer (snapshot be9deb0)

- severity: P1
  type: gap
  location: §2 Mod, §3 (docs/spec/v2.md:72, :82); HOST-1 (:93); G2 (:40)
  claim: Nothing keeps the mod out of claude soldiers. Claude Code runs mods in `claude -p` sessions too, so an installed Shadow Army mod gives every claude soldier the Monarch's `send` tool, and the owner's other installed mods can approve a soldier's tool calls.
  scenario: The owner installs the mod (HOST-1's second path). Iron runs `claude -p` (CH-2) in its worktree. The mod's session.start registers `send` there too. Iron's model calls it with soldier Beru, so HOST-2 starts a post office in Iron's worktree; that is a different folder, so the lock doesn't stop it. Iron now briefs soldiers as a Monarch, which breaks ARM-4, MSG-6 and G1 and spends tokens. Separately, any installed mod whose `tool.check` returns allow approves a soldier's call without the owner, which breaks SEC-3. G2 ("exactly as installed") says to keep such mods; SET-2 drops them only "where the CLI can".
  evidence: The mods types file says `$.session.surfaces()` is "Empty in a plain -p run", "a -p or SDK host receives $.ui.log lines as ui_log", and session.end fires on "a -p run done" (https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts). The mods reference covers tools registered in session.start, `tool.check` returning allow, the sec-default guard loading only with managed settings or Team/Enterprise, and `CLAUDE_CODE_PLUGIN_DIRS` read from the environment, which soldiers inherit (https://code.claude.com/docs/en/plugins/mods/reference). 2.0 F47 (docs/legacy/spec/shadow-army-2.0.md:254): mods run "also under claude -p". NEEDS-PROBE: whether an installed mod's tools reach a stream-json `claude -p` soldier.
  fix: Add to §3: "The mod acts only in the owner's own Claude Code session. In any other session, a soldier's included, it registers no tool or command and starts nothing." Then a decision: how claude soldiers start without installed mods (a documented flag that drops no safeguard, or a recorded residual risk).

- severity: P1
  type: decision-needed
  location: §3 (docs/spec/v2.md:83-84); PO-3 (:172); PO-4 (:179, :181); SEC-5 (:420)
  claim: Soldiers run as the same user, so the credentials can't be hidden from them, and PO-3's "anywhere a soldier can read" and SEC-5's "cannot send under another soldier's name" can't hold as built.
  scenario: The claude soldier's credential goes in `--mcp-config` as a JSON string with an Authorization header (S4), so it sits on Kaisel's command line. Iron runs `ps -ef` or `Get-CimInstance Win32_Process`, reads it, and sends "review passed" as Kaisel. SEC-5's test (own credential, another sender named) still passes. On Windows, the Monarch secret sits in the memory of the post office and of Claude Code, which another process of the same user can open for PROCESS_VM_READ under the default DACL.
  evidence: ADR-0012:14 says "soldiers run as the same user and can read whatever the owner can", yet its consequences say "A soldier cannot act as the Monarch". m0-report.md:47. https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights ("The ACLs in the default security descriptor for a process come from the primary or impersonation token of the creator"). https://man7.org/linux/man-pages/man5/proc_pid_cmdline.5.html
  fix: Decision, one of: (a) state a threat model in §3 (credentials stop a confused soldier, not one that reads other processes) and narrow PO-3 and SEC-5 to it; (b) isolate soldiers at the OS level (another user or a sandbox); (c) keep credentials off command lines and files where each CLI allows, and record the rest as residual risk.

- severity: P1
  type: gap
  location: §3 (docs/spec/v2.md:82-83); HOST-2 (:94); PO-1 (:164); PO-7 (:186)
  claim: The secret and the event pipe live only in the mod instance that started the post office. Nothing says what happens when any other instance finds that post office's lock: after a reload or worker respawn, from a second session in the folder, or after a restart within the lease.
  scenario: `claude --plugin-dir ./mod` is running in this repository and Iron is mid-turn. Claude edits a file under `mod/`, and the hooks module reloads: session.start runs again with no secret and no stdout handle, and the lease timer stops. 30 s later PO-7 closes every soldier session, cutting off Iron's turn. The new instance finds a live lock it can't command: HOST-2 says to start a post office, PO-1 allows one per folder. `/reload-plugins`, a second `claude` in the folder, or `/exit` followed by `claude` within 30 s hit the same gap.
  evidence: The mods reference says session.start runs "again after a reload of that mod", `--plugin-dir` "reloads its hooks module when you save", and lists `/reload-plugins` (https://code.claude.com/docs/en/plugins/mods/reference). The mods API says "Timers stop when the module reloads" (https://code.claude.com/docs/en/plugins/mods/api). The types file adds "an enable, a worker respawn, or a reload". `$.store` survives reloads but is on disk, which PO-3 forbids for the secret. NEEDS-PROBE: whether a spawned process outlives a reload.
  fix: Decision, one of: (a) refuse with a defined message, plus a defined takeover that first finishes open turns (PO-8); (b) a reload-safe handover; (c) one post office per Claude session instead of per folder. Add the chosen case to §5.1 F.

- severity: P1
  type: decision-needed
  location: §3 (docs/spec/v2.md:84); §2 Summary (:65); MSG-5 (:307); G5 (:43)
  claim: A soldier's `send` has no defined return path, and both readings fail. Delivered as a new turn, the reply lets two soldiers ping-pong with no limit. As a blocking call, two soldiers that message each other deadlock.
  scenario: (A) Iron asks Beru something. Beru's summary "goes back to whoever sent the message" as a new turn in Iron's session, Iron asks again, and so on. Each turn costs a full request (about 31.5k tokens for claude, claude-first.md:17). Nothing needs the owner and the army never settles (HOST-15), so no decision, toast or digest appears. (B) Iron's `send` waits on Beru, while Beru's `send` to Iron queues behind Iron's open turn (MSG-3). There is no timeout.
  evidence: PO-4:178 gives `send(to, text)` no return. HOST-10:138 says only Claude's `send` "returns at once". ARM-4:382 lets soldiers "ask".
  fix: Decision, one of: (a) a soldier's `send` returns at once, and the reply waits for the sender's next brief or the owner's go; (b) a hop limit per brief, after which replies are held for the owner (MSG-3); (c) soldier replies go to the Monarch only.

- severity: P1
  type: contradiction
  location: §0 Carried over (docs/spec/v2.md:31)
  claim: "The archived 2.0 text is the reference for their detail, unless this spec restates it" imports 2.0 sentences that contradict v2 and a settled rule. It also doesn't say whether a partial restatement replaces the rest of the source.
  scenario: WSP-7 (:408) cites SAFE-11, which kills "the whole group ... at the end of the turn"; that ends claude's long-lived process (CH-2, G2) and the session services PO-8 keeps. CH-7 (:255) cites SAFE-10, which says Shadow Army "may add restrictions", while settled says it "never adds or removes a vendor safeguard". WSP-8 (:409) cites SAFE-6: does it also redact reports, and prune logs after 30 days against PO-5's append-only log? WSP-1 (:398) cites WS-1's "a detached worktree", but §3:85 and MSG-11:327 need a branch. No detail reference is named for v1 sources, so the roster order that VIS-6's tags depend on is a guess (v1 takes it from orchestratorDelegate.md).
  evidence: 2.0 text at :814, :1035, :1048, :1049. settled.md:40. ADR-0013 says sources keep "history" traceable, while claude-first.md:118 says 2.0's rules "still apply".
  fix: "A carried-over requirement means what this spec states; its source is history. Where a source's detail still applies, the requirement quotes it."

- severity: P1
  type: untestable
  location: §5.1 L (docs/spec/v2.md:493-497); VER-9 (:514); M1-AC8 (:557); M2-AC4 (:568)
  claim: The parity check can't be repeated or judged. The spec defines neither "the two-prompt task" nor "tokens", nor whether "within 5%" works in both directions, nor the headless baseline's command and flags. The data v2 rests on already fails some readings.
  scenario: In claude-first.md:25-28, live runs differ from headless by -6.1% (claude task), +5.2% (codex task) and -34.5% (codex follow-up). Per prompt and two-sided, claude and codex fail; one-sided on the total, all four pass. The $2 budget can't be counted for CLIs that report no cost, and nothing says what happens when it runs out.
  evidence: The task text exists only in claude-first.md:21. Non-goal :53. SES-7:371.
  fix: Define in §5.1: the two prompts word for word; the measure (input including cache reads and writes, plus output, over both prompts); the pass rule (live ≤ 1.05 × headless); each CLI's headless command and flags; the number of runs; how cost is counted where none is reported; and what happens when the budget is spent.

- severity: P1
  type: gap
  location: §5.1 F (docs/spec/v2.md:487, :490)
  claim: The fault tests "a slow first token" and "a failed log write" have no requirement that defines the outcome, so the tests can assert nothing.
  scenario: The disk fills during Iron's turn. Does the post office keep running unlogged, stop the turn, or exit? A record write can fail the same way, and MSG-4 (:303) records "delivered" before writing to the CLI; sending without that record lets a crash repeat a turn. A first token that never arrives has no time limit, state or message.
  evidence: The words appear only at :487 and :490. PO-5:183 says only that writes are redacted.
  fix: Decision: what a failed log or record write does (for example, stop sending to that soldier, keep its messages queued, and raise a decision), and whether a slow first token gets a limit or only a visible state. Cite the requirement from §5.1 F.

- severity: P2
  type: defect
  location: Appendix B rule 4 (docs/spec/v2.md:748)
  claim: v2 dropped two 2.0 rules: that an AC may cite only its own or an earlier milestone's requirements, and that forward references are marked. M3's ACs now depend on M5, and the check still passes.
  scenario: M3-AC9 (:625) needs s and `/stop` (HOST-5, HOST-9: M5). M3-AC10 (:626) needs the queue view and `/queue` (M5). M3-AC5 (:616) cites HOST-9 (M5). M3-AC4 (:615) needs the pane's field or `/send` (MSG-7:310). Codex's checker reports 0 problems.
  evidence: 2.0 Appendix B rules 5 and 7 (shadow-army-2.0.md:1684, :1686). AIConnections-m1/scripts/check-spec-trace.mjs:73-86.
  fix: Rule 4 becomes: "...cites a requirement implemented in that milestone and none from a later one; a requirement relying on a later one marks it (→Mx)". VER-7 checks both.

- severity: P2
  type: decision-needed
  location: G7 (docs/spec/v2.md:45); Appendix B (:743-751); §5.1 R (:498)
  claim: G7 promises verification traced in CI, but Appendix B traces only the spec's own cross-references. CI passes with no tests, and R and L evidence leave nothing CI can read.
  scenario: SEC-2 ships with no test, and VER-7 still passes, because nothing links an AC to a test.
  evidence: VER-7:512; rules 1-4 and 6 read only the spec.
  fix: Decision, one of: (a) tests name the requirement or AC IDs they verify, VER-7 fails when a requirement with U, C, I, X, F or S evidence has none, and R and L are recorded on the PR (VER-8); (b) reword G7 to "traced in the spec, checked in CI".

- severity: P2
  type: defect
  location: VIS-3 (docs/spec/v2.md:427); Appendix A (:722-741); Appendix B rule 6 (:750)
  claim: VIS-3 names a source but is missing from Appendix A. The source it names, "v1 UX-9", is actually 2.0's UX-9, whose detail §0 imports and which contradicts HOST-6 and VIS-6.
  scenario: 2.0 UX-9 says the strip shows "`<Shadow> <model>` ... The model may be truncated, but never dropped". HOST-6 (:125-127) shows no model and turns names into tags. Codex's checker finds carry-overs by a regex plus a hard-coded list (check-spec-trace.mjs:7, :112), so rule 6 misses VIS-3.
  evidence: shadow-army-2.0.md:335; UX-9 exists only in 2.0.
  fix: "Names are never dropped (from 2.0 UX-9; the strip shows no model)". Add VIS-3 to Appendix A, and define in §0 the marker that makes a requirement carried over ("(from …)").

- severity: P2
  type: ambiguity
  location: §2, no "Claude session" entry (docs/spec/v2.md:55-72); HOST-2 (:94); SES-1 (:334); WSP-1 (:398)
  claim: The army's lifetime hangs on "the Claude session", which is undefined, and Claude Code ends a session at `/clear`, `/resume`, `/branch` and logout, not only at exit.
  scenario: The owner types `/clear` and session.end fires. If that ends the Claude session, HOST-2 closes every warm soldier session and WSP-1 makes new worktrees. If it doesn't, the summary card for a brief sent before `/resume` lands in a conversation that never sent it. In the Desktop app, `$.process` is "CLI only", so HOST-2 can't start anything.
  evidence: Mods reference: session.end fires when "The session ends, or /clear, /resume, or /branch runs"; session.start runs "Not after /clear, /resume, or /branch". Types file: `$.process` is "CLI only".
  fix: Decision: define "Claude session" (the CLI process's run, or Claude Code's session.end), say where cards go after `/clear` and `/resume`, and whether the Desktop app is supported.

- severity: P2
  type: ambiguity
  location: HOST-2 (docs/spec/v2.md:94); PO-1 (:164); §2 (no "folder" or "checkout")
  claim: "Folder" and "checkout" are undefined. Reading them as the working directory, the worktree's top level, or the repository gives different numbers of post offices.
  scenario: Sessions in `repo/` and `repo/src/` get two post offices if folder means the working directory. Codex reads it as the top level (`--show-toplevel`), so two linked worktrees of one repository get two armies that share `refs/heads/shadow/*`.
  evidence: AIConnections-m1/src/v2/postOffice.ts:62, server.ts:27; v1 src/workspace/git.ts:58.
  fix: Add to §2: "Folder: the top level of the git worktree Claude Code runs in; checkout: its files". Say whether two worktrees of one repository may each run an army.

- severity: P2
  type: ambiguity
  location: §2 Context size (docs/spec/v2.md:69); CH-2 (:226)
  claim: "Cached ones included" doesn't say whether claude's cache-write tokens count, though S3 counts input plus cache reads plus cache writes.
  scenario: A request after the cache expires reports input 3, cache creation 142,000 and cache read 0. Counting input plus reads only, the meter reads 3, the handoff can't fire, and SES-6's message says "re-reads the full 3 context".
  evidence: m0-report.md:37; https://platform.claude.com/docs/en/build-with-claude/prompt-caching#tracking-cache-performance
  fix: "Context size: every input token of the request, whether uncached, written to the cache or read from it."

- severity: P2
  type: gap
  location: §2 Summary (docs/spec/v2.md:65); MSG-5 (:306)
  claim: "At most five lines" sets no line length, so the size limit on what enters Claude's conversation is either missing or depends on the window's width.
  scenario: Beru replies in one 20,000-character line. Counted by newlines, the whole reply goes into Claude's conversation (:308). Counted by wrapped lines, the cut depends on the transcript's width.
  evidence: G3:41 "short summaries".
  fix: "at most five lines of at most N characters, cut the same way at any width" (N is a decision).

- severity: P2
  type: ambiguity
  location: §2 Live session (docs/spec/v2.md:61); PO-8 (:193, :203, :210)
  claim: "Turn" is undefined, and "each message adds one turn" contradicts PO-8, where the CLI's own follow-up turn belongs to the same message. "The guard and the audit run once per turn" therefore has two readings.
  scenario: Iron's background task ends and claude takes a turn by itself (S6). Read as one CLI cycle, the guard and audit run twice, and a queued message can race claude's own turn. Read as the message's span, they run once.
  evidence: s6-results.md:11.
  fix: Add to §2: "Turn: everything a soldier does for one message, from delivery until PO-8 says it is over, including turns the CLI takes by itself". Reword :61 to match.

- severity: P2
  type: gap
  location: Header Design (docs/spec/v2.md:11); VIS-1 (:424); VIS-2 (:426); HOST-9 (:133)
  claim: The canvas is normative but lives outside the repository, behind a login and with its source in `.shadow/`. The spec doesn't say which wins when the two disagree.
  scenario: MSG-4 (:294) requires "a glyph and a word" for queued, delivered, answered, interrupted, not delivered and cancelled, and HOST-6 needs glyphs for waiting, held, log in, down and error. The spec gives none of these glyphs. S1 already found the canvas and the spec disagreeing (inline vs docked at 110).
  evidence: m0-report.md:16; §5.1 S:492 "follow the canvas".
  fix: "The named canvas version is exported into the repository; where it and this spec disagree, this spec wins". List every state's glyph and word in VIS-2.

- severity: P2
  type: gap
  location: §5.1 C (docs/spec/v2.md:457-463)
  claim: The owner's list of recordings misses what the requirements with C evidence need, and "recorded again when a CLI updates" has no trigger.
  scenario: M2-AC6 needs a recording of each CLI stopped mid-turn, CH-9 (C only) needs a resume, PO-4 needs each CLI's `send` call, and M1-AC3 needs a subagent's message. None is on the list. claude updates often, while CH-8 lets a newer version run with a warning, so it's unclear whether every update means re-recording.
  evidence: CH-8:258; VER-4:505.
  fix: List the recordings each C requirement needs. Re-record when an adapter's pinned version changes.

- severity: P2
  type: ambiguity
  location: §5.1 S (docs/spec/v2.md:492); M5-AC6 (:672); M5-AC7 (:673); VIS-3 (:427)
  claim: "At 144, 110 and 80 columns" doesn't say whether these are terminal or surface widths, while ACs need 44 and 60, and a pane is drawn at the width Claude Code gives it.
  scenario: The pane's tree gets `bodyColumns` (for example 56), never 144. Read as surface widths, M5-AC6's 44 and M5-AC7's 60 are never covered.
  evidence: Mods reference: "draw to e.props.bodyColumns".
  fix: "Terminal widths 144, 110 and 80; the pane also at body widths 56 and 44; the strip at 60."

- severity: P2
  type: gap
  location: §5.1 U (docs/spec/v2.md:454); HOST-7 (:128)
  claim: Unit tests cover "state precedence", but no requirement defines it, and HOST-7's "most urgent fact first" has no order.
  scenario: Iron has a held queue, a handoff ready and a cold cache at once. The strip word, the status entry and HOST-14's grouping can each pick a different one.
  evidence: "precedence" appears only at :454.
  fix: Decision: the order, stated in VIS-2 or HOST-7.

- severity: P2
  type: ambiguity
  location: §2 Brief (docs/spec/v2.md:64); HOST-9 (:135)
  claim: "A message that assigns work" names no sender, so the owner's `/send --kind` has no defined sender, reply path or wake.
  scenario: For `/send Iron --kind build fix x`: as the owner's brief, it breaks ARM-4 (only the Monarch assigns work). As the Monarch's, MSG-5 adds its card to Claude's conversation and MSG-8 may wake Claude at the owner's cost.
  evidence: MSG-7:310 ("as you"); ARM-4:382.
  fix: Decision: the owner's brief (sender "you", summary in the pane, no wake) or a brief on the Monarch's behalf.

- severity: P2
  type: gap
  location: §0 IDs (docs/spec/v2.md:17); Appendix B rules 2-5, 7 (:746-751)
  claim: "Marked withdrawn" has no format and no exemption from rules 2-4, and nothing checks rule 5, though §0:32 says a script checks the rules.
  scenario: Withdrawing `PO-9` makes Codex's checker report "missing or invalid milestone" (check-spec-trace.mjs:43). Giving it a milestone instead would require it to be implemented and cited.
  evidence: Rule 7 (:751) covers rules 1-4 and 6.
  fix: "`- **ID** (withdrawn in vX.Y: reason)` is exempt from rules 2-4; VER-7 keeps every ID ever used and fails on reuse."

- severity: P3
  type: editorial
  location: §3 (docs/spec/v2.md:78, :84)
  claim: The diagram says channels are "one per CLI", against §2:60 and CH-2:222 (one per soldier). :84 adds `send` "to each soldier", against PO-4:182 (none for agy).
  scenario: One shared claude channel means one crash takes down Kaisel, Tank and Iron together.
  evidence: as cited.
  fix: "one per soldier"; "to each soldier whose CLI allows it (PO-4)".

- severity: P3
  type: editorial
  location: §8 Q2, Q6 (docs/spec/v2.md:714, :718)
  claim: S2 answered Q2, which still reads as open. Q6's POSIX and macOS live checks belong to no requirement or AC.
  scenario: v2.0.0 ships without the Q6 checks.
  evidence: m0-report.md:26-31.
  fix: Close Q2 with S2's answer, and give Q6 an AC.

- severity: P3
  type: editorial
  location: VER-2 (docs/spec/v2.md:503); M1-AC7 (:556); §0 (:29)
  claim: "Every test level except L" includes R, a review, which CI can't run.
  scenario: M1-AC7 asks CI to run reviews.
  evidence: §0 table (:29).
  fix: "every level except L and R".

Coverage: the header, §0, G1-G7 and the non-goals, every §2 term, §3, §5.1 U/C/I/X/F/S/L/R, §7, Q1-Q8, Appendix A, and Appendix B rules 1-7. I checked rules 1-4 and 6 by hand over all 97 requirements and 53 ACs; only VIS-3 fails (rule 6). Frame-caused checks on HOST-1, HOST-2, HOST-6, HOST-7, HOST-9, HOST-10, PO-1, PO-3, PO-4, PO-5, PO-7, PO-8, CH-2, CH-7, CH-8, CH-9, CH-10, SI-1, MSG-3 to MSG-10, SES-1, SES-2, SES-6, SET-2, ARM-4, VIS-1 to VIS-3, VIS-6, WSP-1, WSP-7, WSP-8, SEC-3, SEC-5, VER-2, VER-4, VER-7, VER-9, M1-AC3, M1-AC7, M1-AC8, M2-AC4, M2-AC6, M3-AC4, M3-AC5, M3-AC9, M3-AC10, M5-AC6, M5-AC7.
