# M1 round 1, fix check M1-FC1: the post office's life (R-M1-3, R-M1-8, R-F-11, R-M1-10, R-F-30, R-M1-9, R-F-10) in v0.8. All seven FIXED (R-F-10's part 4 only partly); 8 findings on what the fixes broke or left open (FC1-a to FC1-h), and one outside the check. Rerun 2026-10-16 after session 2's run was cut off by the usage limit; 306,163 tokens, 72 tool calls, 22 min.

Spec: C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md (v0.8). Unless a path is given, line numbers below are from this file.

## Verdicts

**R-M1-3: FIXED.**
- Evidence:
  - 193: defines the folder, has the lock written whole, takes the start time as the OS reports it (read the same way when written and when checked), and has the mod learn the port only from standard output.
  - 194: a lock is stale when it is empty, can't be read, or no process has that pid and start time. A stale lock is replaced, the log says so, and one start wins.
  - 195: a live lock is never deleted or replaced. The start is refused with a message, and the next use tries again.
  - M1-AC1 678 tests these cases. Appendix A note 923 records that 2.0 GUARD-5 is not carried.
- Reason: each scenario now has one action (stale replaced, live refused with a message, subfolder resolves to the same lock, empty is stale, OS start time), so neither a stranded army nor two post offices in one working tree can happen. Left over: FC1-f and FC1-h.

**R-M1-8: FIXED.**
- Evidence:
  - PO-7 226: three triggers start one shutdown.
  - 237: containment applies when the post office itself is ended outright.
  - 238-246: the shutdown runs for every soldier at once:
    - nothing starts, restarts or resumes, and it never waits for background work;
    - a running turn is stopped, and its tree ended 30 s after the stop;
    - the CLI is asked to exit, and its tree ended 10 s later;
    - a channel still starting has its tree ended at once;
    - the lock is released and the post office exits;
    - in M1, closing the session cuts a running turn short.
  - M1-AC1 679 and 686 test this, and §5.1 F 607-609.
- Reason: the bound is 10 s in M1 and 30 s + 10 s from M2. That holds whatever claude's documented wait for background tasks does (https://code.claude.com/docs/en/headless#background-tasks-at-exit), and a restart that falls due mid-shutdown starts nothing.
- Depends on D-11: 226 leaves out a changed session id as a fourth trigger, and M1-AC8 707's live `/clear` run depends on D-11 too.

**R-F-11: FIXED** for the orderly shutdown.
- Evidence:
  - PO-7 241: queued messages end as not delivered.
  - 242: open requests are closed as a stop closes them, and nothing is approved.
  - 243: an open card is kept in the records as unanswered, with its paths and hashes, and its message ends interrupted with `the session ended before the owner answered`.
  - Also CH-6 320, SEC-3 511, MSG-4 373, PO-5 222, M2-AC7 748, M2-AC8 755, M3-AC11 796 and §5.1 F 609.
  - The finding's NEEDS-PROBE no longer matters. In M1, CH-2 291 (D-15) runs claude so that no request waits. From M2, a request is closed and the tree ends 10 s after its exit is asked (244).
- Reason: the shutdown now has an order and a time limit, ends every open decision and message on the record, and the CH-6/SEC-3 exception approves nothing. Left over: FC1-b and FC1-g.

**R-M1-10: FIXED.**
- Evidence:
  - HOST-2 103: the post office starts "again at the first use after it has shut down"; 106 covers a reload.
  - PO-7 249: output that ends with no shutdown event gives `the post office stopped unexpectedly` with its exit code or signal. The mod stops renewing, the transcript gets one line, and a toast follows from M5.
  - PO-7 250: the next use starts a new post office.
  - PO-3 207: a new secret each start. PO-5 223: a failed log write no longer stops anything.
  - M1-AC1 677 and 687 test it.
- Reason: an army that ends while the session lives now says why in the transcript, and starts again with a new secret at the next use. Left over: FC1-c and FC1-h.

**R-F-30: FIXED** (D-12 option a).
- Evidence: HOST-2 106; M1-AC1 688; §5.1 F 611; M1-AC8 707 (a live reload).
- Reason: a reloaded or respawned mod instance takes over nothing. The old post office ends with the module (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts:3492-3494, "the module unloading kills the child") or by its lease. The new instance starts its own at the next use. A second session or a quick restart meets PO-1 195. Left over: FC1-b and FC1-d (a reload ends the post office with no shutdown at all).

**R-M1-9: FIXED.** How the tree is ended, and how far that reaches, waits on D-3 (Q8).
- Evidence: PO-1 202 ("however it ends, a kill or a crash included ... within 10 seconds, through the containment that Q8 chooses, as far as it reaches"); 203 (the stated residual for work handed outside the tree); PO-7 237; M1-AC1 687; §5.1 F 610.
- Reason: a requirement and a test now end a soldier's tree when the post office dies.
- Depends on D-3: under option C, a tree outlives a post office ended together with its mod until the next start (C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-3-option-C.md:124). PO-1 202's 10 s, and M1-AC8's "Claude Code killed from outside", then hold only through "as far as it reaches". D-3's judge must weigh this.

**R-F-10: FIXED**, but its part (4) is only partly fixed (FC1-c).
- Evidence:
  - (1) the CLIs: PO-1 202.
  - (2) open turns: PO-1 204 with PO-8 276 (the baseline on disk).
  - (3) queued messages: PO-1 204.
  - (4) what the owner sees: PO-7 249.
  - (5) the restart: HOST-2 103 and PO-1 204, which M3-AC12 800 and 802 now test.
  - The lock: PO-1 194. Also §5.1 F 610 and M1-AC1 687.
- Reason: who notices, the restart, the lock, the CLIs, open turns and the queue each have an outcome now. But the mod-side part that the ledger's R-F-10 row records as applied is missing (FC1-c), and the new 204 bullet has the flaws in FC1-a, b, d and e.

## What the fixes broke or left half done

**FC1-a** (from R-F-10's fix)
```
- severity: P2
  type: contradiction
  location: PO-1 "After a post office that didn't close its channels" (docs/spec/v2.md:204); PO-8 (:267, :276); ARM-6 (:463)
  claim: The next post office closes a dead turn's guard against its baseline whenever it next starts, so every change made since the old post office ended, the owner's own included, goes on that turn's attribution card.
  scenario: From M3, Tusk (agy) is mid-turn when the owner quits Claude Code; the module unload ends the post office (PO-7 :237) and containment ends Tusk's tree. The next morning the owner pulls main, edits three files, and approves a command with "don't ask again", which Claude Code saves to .claude/settings.local.json, a path the guard hashes (:464). The first /send starts a post office that closes Tusk's guard against the old baseline: the card lists the pull, the edits and the settings file beside Tusk's change, and y "trusts exactly the hashes shown" (:470), Tusk's change included.
  evidence: :204 "its guard is closed against the baseline kept on disk for it"; :267 the guard closes "on the files as they are then"; :276 "A change made after the turn is over belongs to no turn, so the owner's own edits between turns stay exempt"; :463 the guard covers a turn until "the moment its process tree has been ended"; M2-AC8 :752 "an edit the owner makes after the turn has ended is not on the card"; https://code.claude.com/docs/en/worktrees ("don't ask again" saved to .claude/settings.local.json).
  fix: PO-1 204 adds: "That check can't tell the turn's changes from later ones. Its card says that it compares the checkout now with the turn's start, gives the time the last post office's log ends, and says that changes made since then, the owner's own included, show on it too." Optional decision for a shorter window: the mod runs this check at the first session.start in the folder rather than at the next use (big: it starts the post office without a use).
```

**FC1-b** (from R-F-10's and R-F-11's fixes)
```
- severity: P2
  type: ambiguity
  location: PO-1 (docs/spec/v2.md:204); PO-7 (:242-243); PO-5 (:222)
  claim: When the post office ends outright with an attribution card open, PO-1's next-start cleanup names only turns still open and queued messages, so the card's message has no defined end and the card no record.
  scenario: From M3, Iron's turn is over and its card waits for the owner (ARM-6 :470, "The turn's summary waits for the answer"). A save under --plugin-dir reloads the mod, which ends the post office with the module and runs no shutdown (HOST-2 :106). Reading A: Iron's message is neither a turn still open nor queued (PO-7 itself treats running turns at :242 and open cards at :243 apart), so it stays delivered for good and the card lives only in the log. Reading B: :204's opening sentence and MSG-4 :373 end it as interrupted, but nothing keeps the card in the records as :243 does, and counting it as a turn still open closes its guard a second time (against PO-8 :274).
  evidence: :204; :243 keeps the card only on the orderly path; :222 logs decisions "so a post office ended outright loses none", but nothing reads that log at the next start; the ledger's R-F-11 row (C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md:43) records M1-V7's "at the next start, PO-6 ends a message still recorded as delivered as interrupted" as applied, and v0.8 has only :204's narrower text.
  fix: PO-1 204 adds: "Each message still recorded as delivered ends as interrupted. Each attribution or handoff card left open is kept in the records as unanswered, with its paths and hashes from the log (PO-5), as PO-7 says; a turn whose guard had already closed is not checked again (PO-8)." M3-AC12 adds the case.
```

**FC1-c** (from R-F-10's fix; part (4) left undone)
```
- severity: P2
  type: gap
  location: HOST-14 (docs/spec/v2.md:182); PO-7 (:249); VIS-2 (:538)
  claim: Nothing says what the pane, strip and decisions list show once the post office has stopped, so they keep rows and states that no longer exist.
  scenario: From M5, the post office crashes while Iron has an approval request open and Igris is working. The transcript line appears (:249), but Igris's spinner keeps turning, and Iron's request stays listed: :182 drops a row only when its decision is made or a stop cancels a request. Pressing y on it reaches no post office, with no defined result. After an orderly shutdown, a card PO-7 :243 leaves unanswered stays listed the same way. No soldier state fits a stopped army: "not started" means "not started in this Claude session" (:538).
  evidence: :249 covers only the transcript line, the toast and the brief rows; :182; CH-6 :327 removes only a closed request's card; :538; the ledger's R-F-10 row (ledger.md:42) records "The mod drops a dead post office's approval requests and stops showing its soldiers as working (HOST-14, →M5)" as part of the v0.8 fix, and v0.8 has no such text.
  fix: HOST-14 adds: "When the post office stops, however it stops, every row it raised leaves the list: a request as closed (CH-6), a card as left unanswered (PO-7). An answer given after that is dropped." VIS-2's "not started" becomes "not running: not started in this Claude session, or the army has stopped", which each soldier shows until the next use. An M5 AC adds the case.
```

**FC1-d** (left open by PO-1 204)
```
- severity: P2
  type: gap
  location: PO-1 (docs/spec/v2.md:204); WSP-11 (:501, :504); CH-2 (:293)
  claim: A post office that didn't close its channels leaves its soldiers' snapshots behind, and nothing reports what was written in them or removes them.
  scenario: Iron (claude, auto) writes notes.md in its snapshot mid-turn, then a save under --plugin-dir ends the post office with the module (HOST-2 :106). WSP-11 removes a snapshot only "when it closes" and reports a write in it only "before its next turn", and that session does neither. The next post office gives Iron a new snapshot (:502) and finishes the old turn (:204), but the old copy of HEAD stays under .shadow/v2/. Where the snapshot is a git worktree (Codex's draft, C:\Users\johns\projects\AIConnections-m1\src\workspace\worktree.ts:56), its worktree metadata stays too, and the write is never reported as a read-violation. Every reload and crash adds one per soldier, and so does a normal exit that ends the post office before its close finishes (PO-7 :237). CH-2's instructions file (:293, "removed when the process ends") also stays.
  evidence: :501; :504; :204 names only turns and queued messages; M1-AC11 :720 tests removal only on a close.
  fix: PO-1 204 adds: "Each snapshot the last one left (WSP-11; ARM-6, →M2) has the files written in it reported as a read-violation, in the log and one line in Claude's transcript, and is then removed, as is any instructions file it left (CH-2)." M1-AC1's kill case adds: the next start reports a file the fake wrote in its snapshot and removes the snapshot.
```

**FC1-e** (from R-F-10's fix, M1-V8's added clause)
```
- severity: P2
  type: contradiction
  location: PO-1 (docs/spec/v2.md:204); WSP-11 (:505); PO-8 (:276)
  claim: PO-1's "or before M2 into one line in Claude's transcript" can never run, because the bullet works from the last post office's records (PO-6, →M3) and the turn's baseline on disk (PO-8, →M2), so in M1 and M2 a turn cut short by the post office's end never has its guard closed.
  scenario: In M1, Iron at auto writes a tracked checkout file, then the mod reloads (or the owner quits) before Iron's session is closed. WSP-11 :505's guard ("until its process tree has been ended") dies with the post office that held its baseline in memory (Codex's draft, C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts:202), and the next post office has no record of the turn and no baseline. Reading A: nothing happens until M3. Reading B: the pre-M2 clause makes M1 keep the baseline on disk and find the open turn in the last log (PO-5), which no M1 text or AC asks for (M1-AC1 :687 checks only the trees, the line and the restart).
  evidence: :204; :276 puts the baseline on disk only from M2; M1's Implements list (:668-675) has neither PO-6 nor PO-8; settled.md:41 (the guard fails any auto or full task during which the checkout changed).
  fix: technical, choose one. (a) Drop the clause and state the gap: "Before M3 nothing finishes them: a turn the post office's end cut short in M1 or M2 is not checked, and each milestone's PR says so." (b) WSP-11 adds "From M1 the guard's baseline is on disk before the message goes in"; PO-1 204 has the M1 post office find a turn left open in the last one's log (PO-5) and report any change in one transcript line; M1-AC1's kill case adds a fake that changes a checkout file before the kill. (b) keeps the settled guard rule.
```

**FC1-f** (from R-M1-3's fix)
```
- severity: P2
  type: decision-needed
  location: PO-1 "One per folder" (docs/spec/v2.md:193); WSP-10 (:498-499); ARM-6 (:464); WSP-11 (:503, :505)
  claim: Defining the folder as the git working tree's top level settles R-M1-3's "second session in the same repository" only for subfolders: a session in a linked worktree of the same repository gets its own lock and post office on the same .git, the two armies trip each other's git watch and guard, and a session outside any git working tree has no folder at all.
  scenario: The owner runs `claude --worktree feature-auth` beside the main session, as Claude Code documents; the worktree sits under .claude/worktrees/feature-auth/, and its git commands write to the main .git. The army runs in both. Each army's snapshots (git worktrees in Codex's draft) and, from M6, its worktrees change "each worktree's metadata", which the other compares with its state at start (:498). So the other's harness git is held (in M1 until its post office restarts, :499), and its running turns fail (:505) or raise cards. The second session's whole folder also lies inside the first army's guarded .claude/ (:464). Separately, Claude Code "works in any directory": outside a git working tree PO-1 names no place for the lock, and no soldier can get its snapshot of HEAD (:503).
  evidence: https://code.claude.com/docs/en/worktrees ("By default, the worktree is created under .claude/worktrees/<name>/ at your repository root"; "git commands in a worktree write to the main repository's shared .git directory"); https://code.claude.com/docs/en/common-workflows ("Claude Code works in any directory"); R-M1-3's scenario 3. Also: the ledger's R-M1-3 row (ledger.md:113) says "§2 adds Folder", but v0.8's glossary (:55-79) has no such entry; only PO-1 :193 defines it.
  fix: decision. (a) One army per repository: the folder is the main working tree (the parent of `git rev-parse --git-common-dir`), so a linked-worktree session meets that lock and is refused with :195's message. (b) One per working tree, with each army leaving the other's Shadow Army snapshots and worktrees out of WSP-10's comparison and its guard, and branch names kept apart (WSP-1, →M6). Either way, technical: "Outside a git working tree the army doesn't start, and the mod says why." Big: (a) changes what the owner can run, and (b) changes what the guard trusts.
```

**FC1-g** (from R-F-11's fix)
```
- severity: P3
  type: defect
  location: M2-AC8 (docs/spec/v2.md:755); PO-7 (:243); Appendix B rule 8 (:934)
  claim: M2-AC8 tests in M2 that an open card "is recorded as unanswered", a part PO-7 marks as PO-6's (→M3), and no M3 AC tests it.
  scenario: M2 keeps no records (its Implements, :726, has no PO-6), so the case passes only by reading "recorded" as "logged". M3-AC11 :796 then checks queued and running messages but not the card.
  evidence: :755; :243 "(PO-6, →M3)"; :934 "the part it governs is verified in that milestone".
  fix: M2-AC8 says "logged as unanswered, with its paths and hashes (PO-5)"; M3-AC11 adds "and an attribution card left open is kept in the records as unanswered, with its paths and hashes (PO-6)".
```

**FC1-h** (wording in R-M1-3's, R-M1-10's and R-F-30's fixes)
```
- severity: P3
  type: ambiguity
  location: PO-1 (docs/spec/v2.md:195); PO-7 (:250); HOST-2 (:106)
  claim: Three sentences about the next start promise something nothing can tell, or leave out a crash's lock.
  scenario: (1) :195 has a start show `the army is still closing`, but a start from another mod instance (a second session, a reload, a quick restart) has only the lock, which holds no state (:193), and no secret to ask with (PO-3); only the mod whose own post office is closing knows (:250). (2) :250 waits until "the old one has exited and released its lock", but one that stopped unexpectedly never releases it; read literally, the mod says "still closing" for good, against M1-AC1 :687 and PO-1 :194. (3) :106 says the old post office ends "by its lease within 30 seconds", but the shutdown the lease starts takes up to 10 s more in M1 and 40 s more from M2 (:242, :244), and a post office that shuts down releases its lock rather than leaving it "stale".
  evidence: :193; :195; :250; :106; :687.
  fix: :195 "…or, when the mod's own last post office is still shutting down, `the army is still closing` (PO-7)"; :250 "once the old one has exited, its lock released or left stale (PO-1)"; :106 "that post office ends, with the module, or through the shutdown its lease starts within 30 seconds (PO-7) … at the next use once the old one has exited (PO-1)".
```

Outside this check: ARM-6 :464 hashes "each worktree's metadata" (and WSP-11 :505 adopts that list) with no exemption for Shadow Army's own snapshots and worktrees, which the settled rule exempts (C:\Users\johns\projects\AIConnections-review\docs\spec\review\settled.md:41). Where snapshots are git worktrees, one soldier's crash restart (a new snapshot, :502) during another soldier's turn then fails that turn in M1. This belongs to M1-FC2 (R-M1-23) or the ARM-6 unit.
