# Unit F, round 1, fix check F-FC1: the five P1 fixes

Each finding as it was raised (copied from `batches/F-V6.md`), then what the verifiers asked for and where spec v0.7 changed. Line numbers: v0.7 is `docs/spec/v2.md` in the review worktree; the round's snapshot, `v2@be9deb0.md`, is in brackets.

## R-F-1

- severity: P1
  type: defect
  location: Appendix A (docs/spec/v2.md:729) and G6 (docs/spec/v2.md:44), realizing lead H48 (docs/spec/v2.md:780)
  claim: The frame's carry-over map drops the git-metadata safeguards (2.0 GIT-1..GIT-4), so harness git — including the guard's own `git status` — runs with a hostile repo's configured fsmonitor/hooks/pager/gpg/filter programs active, which is command execution as the owner (P0-class in production).
  scenario: Actor = malicious repo the owner opens, or a prompt-injected soldier that can run commands as the owner. It writes the shared `.git/config` (all worktrees share the common git dir) with `core.fsmonitor = <cmd>` and/or plants `.git/hooks/post-commit`. The next harness git call — the checkout guard's `git status` (WSP-4), the claim audit (WSP-2), or `/apply`'s `git commit`/`git apply` (WSP-5) — executes `<cmd>` as the owner, outside any agy snapshot and before the guard can detect anything. The guard is self-defeating: its own detection step runs the attacker's code. No v2 requirement turns these off.
  evidence: Appendix A line 729 maps WSP-4 only to "v1 #22; 2.0 GUARD-1 to GUARD-4"; WSP-4 (line 401) cites the same and nothing more. Grep of the whole spec finds no `GIT-1..4`, no `fsmonitor`, no `hooksPath`. The legacy 2.0 spec required `-c core.hooksPath=<empty> -c core.fsmonitor=false -c core.pager=cat -c commit.gpgSign=false -c log.showSignature=false` on every harness git (2.0 GIT-1, legacy line 1051) plus `--no-verify` (GIT-4). H48 (line 780) confirms "its git status runs any fsmonitor command that config names" and "v1.0.x has the same gap." G6 (line 44) promises "v1's workspace safety carries over … the guard."
  fix: decision (H48, tracked for bake-off): restore 2.0 GIT-1..GIT-4 as a carried-over requirement — add rows to Appendix A, bring them into WSP-4's scope, and require every harness git invocation (the guard's and the audit's included) to run with hooks/fsmonitor/pager/signing/external-diff/filters disabled and to fingerprint `.git/config`, `hooks/` and `info/`. Until then G6 overstates the carry-over.

**Asked for:** `raw/F-r1-verify-V1.md` (R-F-1) and `raw/F-r1-verify-V6.md` (R-F-1); the ledger row R-F-1.
**Fixed in** `3ec5f7d`. Where v0.7 changed (v0.7 lines, with the snapshot's in brackets):
- new WSP-10, 442-448 [none];
- ARM-6's guard bullet now hashes 2.0 GUARD-2's sentinel set, 416 [387];
- Appendix A: rows WSP-10 and ARM-6 (GUARD-2 added), 795-817 [722-741];
- M1's Implements (WSP-10) and the new M1-AC10, 600-625 [534-557];
- §5.1 X: a new last case, 532-537 [471-475];
- M2-AC5's new last bullet, 637-642 [569-573]; M6-AC1, 757 [685];
- Appendix C: H48's row in the "For v2.0" table is gone [780], its group row says "Same", 993 [918], and the verdict counts moved (Same 18, New 11).

## R-F-3

- severity: P1
  type: gap
  location: §2 Glossary (docs/spec/v2.md:55-72), ARM-6 (docs/spec/v2.md:384), §1 G6 (docs/spec/v2.md:44)
  claim: The frame uses `autonomy` as a load-bearing security term but never defines it or its levels (supervised/auto/full), and omits the settled control "an auto/full read-only task runs in a throwaway snapshot," so the boundary "what a soldier may do without the owner" is undefined in the spec.
  scenario: Build a soldier from the spec alone. `autonomy` appears in config (ARM-1, line 376) and "Autonomy chooses only each vendor's documented flags" (CH-7, line 255), but no section defines supervised/auto/full or what each permits. Only agy is placed in a snapshot (ARM-6); a `full`-mode claude/codex/grok soldier doing a read-only task gets no snapshot and no notice in the spec, so it runs with the owner's OS rights and its writes are not discarded — contradicting the settled design rule. An implementer cannot tell what runs without the owner.
  evidence: Grep finds no "supervised", no "full mode"; `/mode [ask|auto|plan|…]` (HOST-9, line 132) is Claude Code's own mode, not soldier autonomy. settled.md lines 40-41 state the embodied rules: "Autonomy (supervised, auto, full) only chooses each vendor's own flags" and "With auto or full, a read-only task runs in a throwaway snapshot, and the checkout guard fails any task during which something outside Shadow Army's branches and worktrees changed." Neither the definition nor the general snapshot rule is in the spec (only ARM-6/agy). G6 claims v1 safety carries over.
  fix: Add an `Autonomy` glossary entry (supervised/auto/full and their effect on vendor flags) and a requirement generalizing ARM-6's throwaway-snapshot-plus-guard to any read-only task under auto/full, per settled.md lines 40-41; give it an X/F test. (Monarch-read-only is separate and remains open as Q1.)

**Asked for:** `raw/F-r1-verify-V1.md` (R-F-3) and `raw/F-r1-verify-V6.md` (R-F-3, a DECISION); the ledger row R-F-3.
**Fixed in** `b92637f`, the glossary half only: §2's new Autonomy entry, 60 [none]. The read-only rule's mechanism is decision D-7 (`decisions.md`) and is out of scope here: say only whether the glossary half is right, and whether anything else in v0.7 now contradicts the settled rule.

## R-F-28

- severity: P1
  type: gap
  location: §2 Mod, §3 (docs/spec/v2.md:72, :82); HOST-1 (:93); G2 (:40)
  claim: Nothing keeps the mod out of claude soldiers. Claude Code runs mods in `claude -p` sessions too, so an installed Shadow Army mod gives every claude soldier the Monarch's `send` tool, and the owner's other installed mods can approve a soldier's tool calls.
  scenario: The owner installs the mod (HOST-1's second path). Iron runs `claude -p` (CH-2) in its worktree. The mod's session.start registers `send` there too. Iron's model calls it with soldier Beru, so HOST-2 starts a post office in Iron's worktree; that is a different folder, so the lock doesn't stop it. Iron now briefs soldiers as a Monarch, which breaks ARM-4, MSG-6 and G1 and spends tokens. Separately, any installed mod whose `tool.check` returns allow approves a soldier's call without the owner, which breaks SEC-3. G2 ("exactly as installed") says to keep such mods; SET-2 drops them only "where the CLI can".
  evidence: The mods types file says `$.session.surfaces()` is "Empty in a plain -p run", "a -p or SDK host receives $.ui.log lines as ui_log", and session.end fires on "a -p run done" (https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts). The mods reference covers tools registered in session.start, `tool.check` returning allow, the sec-default guard loading only with managed settings or Team/Enterprise, and `CLAUDE_CODE_PLUGIN_DIRS` read from the environment, which soldiers inherit (https://code.claude.com/docs/en/plugins/mods/reference). 2.0 F47 (docs/legacy/spec/shadow-army-2.0.md:254): mods run "also under claude -p". NEEDS-PROBE: whether an installed mod's tools reach a stream-json `claude -p` soldier.
  fix: Add to §3: "The mod acts only in the owner's own Claude Code session. In any other session, a soldier's included, it registers no tool or command and starts nothing." Then a decision: how claude soldiers start without installed mods (a documented flag that drops no safeguard, or a recorded residual risk).

**Asked for:** `raw/F-r1-verify-V1.md` (R-F-28) and `raw/F-r1-verify-V6.md` (R-F-28); the ledger row R-F-28.
**Fixed in** `1d9b069`: §3's new bullet, 90 [after 82]; HOST-2's new sub-bullet, 104 [94]; the new M1-AC9, 624; the new M3-AC13, 703. SET-2 is unchanged on purpose: another installed mod's `tool.check` stays SET-2's residual risk (M4, pass X1), and probe P-3 is still to run.

## R-F-12

- severity: P1
  type: ambiguity
  location: §2 Live session (docs/spec/v2.md:61); PO-8 (:193, :195, :203, :210-211); M2-AC9 (:591)
  claim: "Turn" means both a CLI's turn and a message's span. Nothing says when a message's turn is over if the CLI takes a turn by itself once its background work ends.
  scenario: Iron's turn starts a background `npm test`. claude's `result` comes, then `task_notification` (completed). Reading A: the work has ended (:195), so the turn is over. The guard closes, the audit runs, and Iron's next queued brief goes to stdin just as claude starts its own follow-up turn (spike S6), so the two interleave. The follow-up's writes "belong to no turn" (:211), so no guard or audit covers them, and its `result` "changes nothing" (:210). Reading B: the turn waits for a follow-up, with no limit. After `stop_task`, S6 saw no follow-up within 60 s, so the queue would wait forever. The glossary's "Each message adds one turn" fits neither reading.
  evidence: :193 says a turn "the CLI takes by itself when the work ends belongs to the same message". :203 says "that turn's end event is the last". S6 (s6-results.md): a task that completes by itself is followed by a turn; `stop_task` gave none in 60 s.
  fix: In §2, define "turn" (the CLI's, up to its end event) and "a message's work" (its turns plus the background work they leave). In PO-8: "When a background task the CLI reports ends by itself, the message's work stays open until the CLI's next end event, or for N s with no new turn; a queued message goes in only then. A task stopped by s, or a plain process that exits, opens no wait." Add a fault case where a queued message is ready just as the CLI starts its own turn.

**Asked for:** `raw/F-r1-verify-V2.md` (R-F-12) and `raw/F-r1-verify-V6.md` (R-F-12); the ledger row R-F-12.
**Fixed in** `3ec5f7d`: §2's Live session, 63 [61]; PO-8's "The work has ended" paragraph, 223 [195], and its new bullet on a turn the CLI starts after the work is over, 239 [none]; §5.1 F's new case, in 538-554 [476-491]; M2-AC9's third bullet, 657-664 [588-595]. The wait is 30 s on the monotonic clock (`decisions.md`, "Values set in the fix pass"). R-M1-16's half (CH-2 attributes each `result` by its origin) waits for M1's verification and is not in v0.7.

## R-F-33

- severity: P1
  type: untestable
  location: §5.1 L (docs/spec/v2.md:493-497); VER-9 (:514); M1-AC8 (:557); M2-AC4 (:568)
  claim: The parity check can't be repeated or judged. The spec defines neither "the two-prompt task" nor "tokens", nor whether "within 5%" works in both directions, nor the headless baseline's command and flags. The data v2 rests on already fails some readings.
  scenario: In claude-first.md:25-28, live runs differ from headless by -6.1% (claude task), +5.2% (codex task) and -34.5% (codex follow-up). Per prompt and two-sided, claude and codex fail; one-sided on the total, all four pass. The $2 budget can't be counted for CLIs that report no cost, and nothing says what happens when it runs out.
  evidence: The task text exists only in claude-first.md:21. Non-goal :53. SES-7:371.
  fix: Define in §5.1: the two prompts word for word; the measure (input including cache reads and writes, plus output, over both prompts); the pass rule (live ≤ 1.05 × headless); each CLI's headless command and flags; the number of runs; how cost is counted where none is reported; and what happens when the budget is spent.

**Asked for:** `raw/F-r1-verify-V3.md` (R-F-33) and `raw/F-r1-verify-V6.md` (R-F-33); the ledger row R-F-33.
**Fixed in** `8ee800c`: §5.1 L, 556-562 [493-497]; VER-9, 579 [514]. The files, the runs and the pass rule are in `decisions.md`, "Values set in the fix pass". The budget clause is decision D-8 and is out of scope here.
