# Unit F, round 1, verification batch F-V6 (second, independent verification of the P1 findings)

## R-F-1

- severity: P1
  type: defect
  location: Appendix A (docs/spec/v2.md:729) and G6 (docs/spec/v2.md:44), realizing lead H48 (docs/spec/v2.md:780)
  claim: The frame's carry-over map drops the git-metadata safeguards (2.0 GIT-1..GIT-4), so harness git — including the guard's own `git status` — runs with a hostile repo's configured fsmonitor/hooks/pager/gpg/filter programs active, which is command execution as the owner (P0-class in production).
  scenario: Actor = malicious repo the owner opens, or a prompt-injected soldier that can run commands as the owner. It writes the shared `.git/config` (all worktrees share the common git dir) with `core.fsmonitor = <cmd>` and/or plants `.git/hooks/post-commit`. The next harness git call — the checkout guard's `git status` (WSP-4), the claim audit (WSP-2), or `/apply`'s `git commit`/`git apply` (WSP-5) — executes `<cmd>` as the owner, outside any agy snapshot and before the guard can detect anything. The guard is self-defeating: its own detection step runs the attacker's code. No v2 requirement turns these off.
  evidence: Appendix A line 729 maps WSP-4 only to "v1 #22; 2.0 GUARD-1 to GUARD-4"; WSP-4 (line 401) cites the same and nothing more. Grep of the whole spec finds no `GIT-1..4`, no `fsmonitor`, no `hooksPath`. The legacy 2.0 spec required `-c core.hooksPath=<empty> -c core.fsmonitor=false -c core.pager=cat -c commit.gpgSign=false -c log.showSignature=false` on every harness git (2.0 GIT-1, legacy line 1051) plus `--no-verify` (GIT-4). H48 (line 780) confirms "its git status runs any fsmonitor command that config names" and "v1.0.x has the same gap." G6 (line 44) promises "v1's workspace safety carries over … the guard."
  fix: decision (H48, tracked for bake-off): restore 2.0 GIT-1..GIT-4 as a carried-over requirement — add rows to Appendix A, bring them into WSP-4's scope, and require every harness git invocation (the guard's and the audit's included) to run with hooks/fsmonitor/pager/signing/external-diff/filters disabled and to fingerprint `.git/config`, `hooks/` and `info/`. Until then G6 overstates the carry-over.

## R-F-3

- severity: P1
  type: gap
  location: §2 Glossary (docs/spec/v2.md:55-72), ARM-6 (docs/spec/v2.md:384), §1 G6 (docs/spec/v2.md:44)
  claim: The frame uses `autonomy` as a load-bearing security term but never defines it or its levels (supervised/auto/full), and omits the settled control "an auto/full read-only task runs in a throwaway snapshot," so the boundary "what a soldier may do without the owner" is undefined in the spec.
  scenario: Build a soldier from the spec alone. `autonomy` appears in config (ARM-1, line 376) and "Autonomy chooses only each vendor's documented flags" (CH-7, line 255), but no section defines supervised/auto/full or what each permits. Only agy is placed in a snapshot (ARM-6); a `full`-mode claude/codex/grok soldier doing a read-only task gets no snapshot and no notice in the spec, so it runs with the owner's OS rights and its writes are not discarded — contradicting the settled design rule. An implementer cannot tell what runs without the owner.
  evidence: Grep finds no "supervised", no "full mode"; `/mode [ask|auto|plan|…]` (HOST-9, line 132) is Claude Code's own mode, not soldier autonomy. settled.md lines 40-41 state the embodied rules: "Autonomy (supervised, auto, full) only chooses each vendor's own flags" and "With auto or full, a read-only task runs in a throwaway snapshot, and the checkout guard fails any task during which something outside Shadow Army's branches and worktrees changed." Neither the definition nor the general snapshot rule is in the spec (only ARM-6/agy). G6 claims v1 safety carries over.
  fix: Add an `Autonomy` glossary entry (supervised/auto/full and their effect on vendor flags) and a requirement generalizing ARM-6's throwaway-snapshot-plus-guard to any read-only task under auto/full, per settled.md lines 40-41; give it an X/F test. (Monarch-read-only is separate and remains open as Q1.)

## R-F-28

- severity: P1
  type: gap
  location: §2 Mod, §3 (docs/spec/v2.md:72, :82); HOST-1 (:93); G2 (:40)
  claim: Nothing keeps the mod out of claude soldiers. Claude Code runs mods in `claude -p` sessions too, so an installed Shadow Army mod gives every claude soldier the Monarch's `send` tool, and the owner's other installed mods can approve a soldier's tool calls.
  scenario: The owner installs the mod (HOST-1's second path). Iron runs `claude -p` (CH-2) in its worktree. The mod's session.start registers `send` there too. Iron's model calls it with soldier Beru, so HOST-2 starts a post office in Iron's worktree; that is a different folder, so the lock doesn't stop it. Iron now briefs soldiers as a Monarch, which breaks ARM-4, MSG-6 and G1 and spends tokens. Separately, any installed mod whose `tool.check` returns allow approves a soldier's call without the owner, which breaks SEC-3. G2 ("exactly as installed") says to keep such mods; SET-2 drops them only "where the CLI can".
  evidence: The mods types file says `$.session.surfaces()` is "Empty in a plain -p run", "a -p or SDK host receives $.ui.log lines as ui_log", and session.end fires on "a -p run done" (https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts). The mods reference covers tools registered in session.start, `tool.check` returning allow, the sec-default guard loading only with managed settings or Team/Enterprise, and `CLAUDE_CODE_PLUGIN_DIRS` read from the environment, which soldiers inherit (https://code.claude.com/docs/en/plugins/mods/reference). 2.0 F47 (docs/legacy/spec/shadow-army-2.0.md:254): mods run "also under claude -p". NEEDS-PROBE: whether an installed mod's tools reach a stream-json `claude -p` soldier.
  fix: Add to §3: "The mod acts only in the owner's own Claude Code session. In any other session, a soldier's included, it registers no tool or command and starts nothing." Then a decision: how claude soldiers start without installed mods (a documented flag that drops no safeguard, or a recorded residual risk).

## R-F-12

- severity: P1
  type: ambiguity
  location: §2 Live session (docs/spec/v2.md:61); PO-8 (:193, :195, :203, :210-211); M2-AC9 (:591)
  claim: "Turn" means both a CLI's turn and a message's span. Nothing says when a message's turn is over if the CLI takes a turn by itself once its background work ends.
  scenario: Iron's turn starts a background `npm test`. claude's `result` comes, then `task_notification` (completed). Reading A: the work has ended (:195), so the turn is over. The guard closes, the audit runs, and Iron's next queued brief goes to stdin just as claude starts its own follow-up turn (spike S6), so the two interleave. The follow-up's writes "belong to no turn" (:211), so no guard or audit covers them, and its `result` "changes nothing" (:210). Reading B: the turn waits for a follow-up, with no limit. After `stop_task`, S6 saw no follow-up within 60 s, so the queue would wait forever. The glossary's "Each message adds one turn" fits neither reading.
  evidence: :193 says a turn "the CLI takes by itself when the work ends belongs to the same message". :203 says "that turn's end event is the last". S6 (s6-results.md): a task that completes by itself is followed by a turn; `stop_task` gave none in 60 s.
  fix: In §2, define "turn" (the CLI's, up to its end event) and "a message's work" (its turns plus the background work they leave). In PO-8: "When a background task the CLI reports ends by itself, the message's work stays open until the CLI's next end event, or for N s with no new turn; a queued message goes in only then. A task stopped by s, or a plain process that exits, opens no wait." Add a fault case where a queued message is ready just as the CLI starts its own turn.

## R-F-32

- severity: P1
  type: contradiction
  location: §0 Carried over (docs/spec/v2.md:31)
  claim: "The archived 2.0 text is the reference for their detail, unless this spec restates it" imports 2.0 sentences that contradict v2 and a settled rule. It also doesn't say whether a partial restatement replaces the rest of the source.
  scenario: WSP-7 (:408) cites SAFE-11, which kills "the whole group ... at the end of the turn"; that ends claude's long-lived process (CH-2, G2) and the session services PO-8 keeps. CH-7 (:255) cites SAFE-10, which says Shadow Army "may add restrictions", while settled says it "never adds or removes a vendor safeguard". WSP-8 (:409) cites SAFE-6: does it also redact reports, and prune logs after 30 days against PO-5's append-only log? WSP-1 (:398) cites WS-1's "a detached worktree", but §3:85 and MSG-11:327 need a branch. No detail reference is named for v1 sources, so the roster order that VIS-6's tags depend on is a guess (v1 takes it from orchestratorDelegate.md).
  evidence: 2.0 text at :814, :1035, :1048, :1049. settled.md:40. ADR-0013 says sources keep "history" traceable, while claude-first.md:118 says 2.0's rules "still apply".
  fix: "A carried-over requirement means what this spec states; its source is history. Where a source's detail still applies, the requirement quotes it."

## R-F-33

- severity: P1
  type: untestable
  location: §5.1 L (docs/spec/v2.md:493-497); VER-9 (:514); M1-AC8 (:557); M2-AC4 (:568)
  claim: The parity check can't be repeated or judged. The spec defines neither "the two-prompt task" nor "tokens", nor whether "within 5%" works in both directions, nor the headless baseline's command and flags. The data v2 rests on already fails some readings.
  scenario: In claude-first.md:25-28, live runs differ from headless by -6.1% (claude task), +5.2% (codex task) and -34.5% (codex follow-up). Per prompt and two-sided, claude and codex fail; one-sided on the total, all four pass. The $2 budget can't be counted for CLIs that report no cost, and nothing says what happens when it runs out.
  evidence: The task text exists only in claude-first.md:21. Non-goal :53. SES-7:371.
  fix: Define in §5.1: the two prompts word for word; the measure (input including cache reads and writes, plus output, over both prompts); the pass rule (live ≤ 1.05 × headless); each CLI's headless command and flags; the number of runs; how cost is counted where none is reported; and what happens when the budget is spent.
