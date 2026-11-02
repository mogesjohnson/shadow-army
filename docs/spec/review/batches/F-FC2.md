# Unit F, round 1, fix check F-FC2: the repairs of what F-FC1 found

Each finding as fix check F-FC1 raised it (`raw/F-r1-fixcheck-FC1.md`, numbered as there), its ledger ID, and where spec v0.7 now repairs it (`7ba5f75`). Line numbers are v0.7's, `docs/spec/v2.md` in the review worktree. Finding 6 (R-F-58) waits for decision D-7 and is not included. The same commit also applied decision D-6 (VER-7, 582; M1-AC7, 627; Appendix B rules 7 and 9, 835-837): check that too.

## R-F-53 (F-FC1 finding 1)

- severity: P1
  type: defect
  location: WSP-10 (docs/spec/v2.md:444, :447); M1-AC10 (:625)
  claim: WSP-10 compares only the repository's shared config, `hooks/` and `info/`, which is narrower than the 2.0 GIT-3 it cites, and it pins filter drivers instead of turning them off. So a filter driver a soldier defines in its user's global git config runs as the owner in harness git, and nothing stops it.
  scenario: A `full` claude soldier, which runs as the owner, runs `git config --global filter.x.clean '<cmd>'` and adds `* filter=x` to `.gitattributes` in its own worktree. When the turn is over, the claim audit's `git diff` and `git add -A` in that worktree run `<cmd>` as the owner. The pin at :444 doesn't name `filter.x`, which didn't exist at start, and the global config is outside :447's comparison, so harness git is never stopped. From M2 (agy) and M6 (every soldier), the guard's sentinel set does hash the global config (:416, through legacy :1068). But PO-8 :231 runs the audit as the guard closes, before the owner can answer the card. On git 2.54 and later, the same unwatched file can also define a hook (finding 3).
  evidence: v0.7 :444, :447, :231. Legacy :1054: GIT-3 compared "the effective config ... every scope except the command line, with includes followed ... global config, `.git/config` and any `config.worktree`". 2.0 F45 (legacy :252): "A `filter.*.clean` planted in config runs on `git add`". C:\Users\johns\projects\AIConnections\src\workspace\audit.ts:18, :71 (`diff`, `add -A`). §0 :31: where the spec speaks, it governs.
  fix: Rewrite :447 as "Before and after each command, the config git reads for that repository (every scope but the command line, includes followed, and any `config.worktree`), the shared `hooks/` and `info/`, and each worktree's metadata are compared with their state when the post office started (2.0 GIT-3)." Add to M1-AC10: "a filter driver added to the user's global git config after the post office started, and named by a `.gitattributes` in the soldier's worktree, never runs: harness git stops first."

**Repaired:** WSP-10, 443-452 (the comparison: 449); M1-AC10, 630-634 (the global filter driver: 633).

## R-F-54 (F-FC1 finding 2)

- severity: P1
  type: gap
  location: WSP-10 (docs/spec/v2.md:447); M1-AC10 (:625)
  claim: Once WSP-10 finds a change it stops harness git for the repository with no way back, and the turns that need git have no defined outcome. Because the baseline is fixed at the post office's start, ordinary git use by the owner between turns stops every soldier for the rest of the session.
  scenario: Between turns the Monarch runs `git push -u origin feature`, or `gh pr checkout 12`, or the owner runs `git lfs install`.
    - That writes `branch.*` into the shared config, or scripts into `hooks/`.
    - The next harness git command compares against the start state and stops harness git. No turn is open, so no card appears, and the only report is in "the soldier's log".
    - From then on, no snapshot can be made (M1). From M2, an agy turn's guard can't run `git status`, so PO-8 can't finish the turn and no next message goes in (:231, :237). From M6, every soldier is stuck.
    - A y on a card trusts the hashes for the guard (:422), but WSP-10 still compares with the start state, so nothing resumes until the Claude session restarts.
    2.0 excluded exactly these entries ("Changes to `branch.*` and `remote.*`, such as `git push -u` makes, don't count"). It also defined the outcome: the task ends with status `guard`, nothing is committed or applied, and a card asks the owner. v0.7's "A change there stops harness git" leaves at best two readings of whether that exclusion carries over under §0 :31.
  evidence: v0.7 :447, :625, :231, :237, :240 (the owner's edits between turns stay exempt), :422; legacy :1054, :1060, :840.
  fix: Rewrite :447 as follows. "... compared with the state Shadow Army last trusted: their state when the post office started, or as the owner last accepted it. As in 2.0 GIT-3, changes to `branch.*` and `remote.*` don't count. Any other change holds harness git for that repository until the owner answers: on the attribution card from M2 (y trusts the state shown and harness git goes on; n keeps it held), and in M1 by a line in the post office's log. A turn that needs harness git while it is held ends interrupted, with the change named (MSG-4), and the soldier's queue is held."

**Repaired:** WSP-10, 449-452: the baseline is the state last trusted, `branch.*` and `remote.*` don't count, a change holds harness git until the owner answers (in M1, until the post office restarts), and what a held soldier and turn do; M1-AC10, 634; M2-AC5's last bullet, 651.

## R-F-55 (F-FC1 finding 3)

- severity: P2
  type: vendor-fact
  location: WSP-10 (docs/spec/v2.md:443); M1-AC10 (:625)
  claim: WSP-10 turns hooks off only with "an empty `core.hooksPath`". That is not git's documented off switch, and it doesn't reach the hooks that git 2.54 and later define in config.
  scenario: (a) An implementer passes `-c core.hooksPath=`. Git documents only `/dev/null` as the off value, a relative path is resolved from the working tree's root (which the soldier controls), and an empty value is undocumented. 2.0 used an empty runtime folder. (b) On git 2.54 and later, `hook.x.event=post-checkout` with `hook.x.command=<cmd>` in any config scope runs on the snapshot's `git worktree add` whatever `core.hooksPath` says. The script in the hooks folder only "is run last". M1-AC10 plants hooks as files only, so it passes while (b) runs.
  evidence: v0.7 :443; legacy GIT-1 :1051 (`-c core.hooksPath=<empty runtime dir>`); https://git-scm.com/docs/git-config (core.hooksPath); https://git-scm.com/docs/git-hook (`hook.<friendly-name>.command`/`.event`; `hook.<event>.enabled`: "When set to false, no hooks fire for that event"); https://www.collabora.com/news-and-blog/news-and-events/git-hooks-upgraded-whats-new-git-254-and-coming-255.html ("added in 2.54"). NEEDS-PROBE: what git does with an empty value.
  fix: Rewrite :443 as "turns off hooks: `core.hooksPath` names an empty folder Shadow Army keeps (2.0 GIT-1), and on git 2.54 and later `hook.<event>.enabled=false` is passed for each hook event the command can fire; …". M1-AC10 also plants a `post-checkout` hook defined in config.

**Repaired:** WSP-10's first bullet, 444; M1-AC10, 631. The orchestrator checked git's docs: git-config says `core.hooksPath=/dev/null` turns off all hooks and a relative path is taken from where hooks run; git-hook documents `hook.<event>.enabled` (false: no hooks fire for that event) and runs config hooks before the hooks folder's.

## R-F-56 (F-FC1 finding 4)

- severity: P2
  type: contradiction
  location: M1-AC10 (docs/spec/v2.md:625), §5.1 X (:537), M2-AC5 (:642); WSP-10 (:444)
  claim: The new ACs require that a clean filter in the repository's config at start never runs, but WSP-10 passes the owner's `filter.*` settings as they were at start, and that makes git run it.
  scenario: For harness git to run at all in the AC's first case, the planted config must already be there when the post office starts. :444 then passes `-c filter.x.clean=<cmd>` as 2.0 GIT-2 did, and the guard's or the snapshot's `git status` runs it on any path whose attributes name it. Either a correct build fails the test, or a build passes it by dropping filters, which breaks the owner's real filters (Git LFS) in snapshots and audits.
  evidence: v0.7 :444, :537, :625, :642; legacy GIT-2 :1052; legacy :170 (the pin keeps the owner's filters from being changed, not from running); legacy M2-AC5 :1273 tests only a changed config.
  fix: In M1-AC10, §5.1 X and M2-AC5: "... an external diff, with every hook present: no harness git command runs any of them. A clean filter added after the post office started never runs, because the change stops harness git first; one set at start is the owner's and runs (WSP-10, 2.0 GIT-2)."

**Repaired:** WSP-10's third bullet, 446; M1-AC10, 631-632; §5.1 X, 542; M2-AC5, 651.

## R-F-57 (F-FC1 finding 5)

- severity: P3
  type: editorial
  location: ARM-6 (docs/spec/v2.md:416)
  claim: The sentence the fix inserted breaks the next sentence's reference, and "2.0's sentinel set" brings in members v2 never defines.
  scenario: "That is its `result` once nothing the turn started is still running" now follows the sentinel-set sentence, so "That" no longer points to the end of the turn. The set imports 2.0's "MEM-2 fallback directories (→M7)", "the policy files" and "vendor home configs". If vendor home configs include a file the Monarch's own Claude Code writes during a turn, such as `~/.claude.json`, every agy turn raises a card.
  evidence: v0.7 :416 (the snapshot's [387]); legacy :1063-1069.
  fix: Move the sentence after "... has been ended.", and list the members v2 keeps, in v2's own terms.

**Repaired:** ARM-6, 416-417: the sentinel paths are now their own bullet, after the turn's end.

## R-F-59 (F-FC1 finding 7)

- severity: P2
  type: decision-needed
  location: HOST-2 (docs/spec/v2.md:104); §3 (:90); M1-AC9 (:624)
  claim: The marker HOST-2 uses for "any other" session (`isInteractive` false, no surface) also fits the owner's own session in the desktop app's Code tab. There, the Monarch would get no `send`, and nothing would be drawn or explained.
  scenario: The owner works in the desktop app's Code tab, a session "a host runs headless". `isInteractive` is true only "under the REPL", and the client attaches only after `session.start`. A user-scope mod loads there and draws for `desktop`. Following M1-AC9, the mod stays silent. Reading A: v2's Monarch is the terminal REPL only, which the spec never says, though VIS-3 :485 draws for terminals. Reading B: this is the owner's own session, so the mod must tell it apart from a soldier's another way.
  evidence: claude-code.d.ts :10315, :11608-11616; evidence\mod-api-2.1.294\reference.md :101, :172-173. NEEDS-PROBE: the desktop session's exact `session.start` input.
  fix: decision: (a) state that the Monarch is the owner's terminal session and the mod stays off elsewhere; or (b) mark soldier sessions with something the post office controls, such as the soldier's worktree or snapshot path in `session.start`'s `cwd`, and keep `isInteractive` as a second check.

**Repaired:** Not repaired: it waits for M1-V2's verdicts on R-F-38 and R-M1-20. Check only that nothing else in v0.7 now depends on it.

## R-F-60 (F-FC1 finding 8)

- severity: P3
  type: untestable
  location: M3-AC13 (docs/spec/v2.md:703)
  claim: M3-AC13 can only be shown on a real claude, but HOST-2 and HOST-10 carry only integration (I) evidence, and §5.1's fake CLIs load no mod.
  scenario: Against a fake claude, "lists no Monarch `send` tool" holds whatever the mod does. Only probe P-3, outside the spec, checks a real `-p` soldier.
  evidence: v0.7 :103, :163, :525, :703; the ledger's R-F-28 row.
  fix: M3-AC13 reads "From the owner's recording of a real claude soldier with the mod installed (VER-4), its tool list has no Monarch `send`, and no post office starts", and HOST-2 gains the C code.

**Repaired:** HOST-2, 103 (now I, C); §5.1 C, 526; M3-AC13, 712.

## R-F-61 (F-FC1 finding 9)

- severity: P2
  type: contradiction
  location: M2-AC9 (docs/spec/v2.md:657, :660); PO-8 (:223)
  claim: M2-AC9 makes a generic "child" wait 30 s for a follow-up turn, but PO-8 now says a process that is not a CLI task starts no such turn, so there is no wait.
  scenario: A fake starts a plain child; bullet 4 at :661 allows a fake with no task concept ("else ending the child"). Under PO-8, the queue goes as soon as the child exits. Under :660, it waits 30 s, and a turn the fake starts 2 s later must still hold it. Either a build that follows PO-8 fails the AC, or every queue waits 30 s after any leftover process exits.
  evidence: v0.7 :223 ("a process that is not a CLI task, starts no such turn"), :657, :660, :661.
  fix: Rewrite :657 as "a fake CLI that starts a child and reports it as a background task, as claude does (`task_started`, `task_notification`), …", and add "a child the fake does not report as a task frees the queue as soon as it exits, with no wait (PO-8)."

**Repaired:** M2-AC9, 666 (the fake reports its child as a task) and 669 (a child it doesn't report frees the queue when it exits).

## R-F-62 (F-FC1 finding 10)

- severity: P2
  type: gap
  location: PO-8 (docs/spec/v2.md:238-239); MSG-4 (:326)
  claim: The new rule for a turn the CLI starts after a message's work is over says what its result does not do. It doesn't say what that turn does to the message it "belongs to", which has already ended, or what the owner's n on its card does.
  scenario: Iron's background test finishes, and claude's follow-up sends nothing for 30 s, so Iron's message ends as answered and the next message goes in. The follow-up then edits files. Its card's n "fails the turn" (:422), but MSG-4 can't move an answered message to interrupted. The Monarch's card never shows those changes, though `/apply` takes them. Late follow-ups aren't the only cause: claude gives the same origin kind to scheduled and routine wakes, and to messages from other sessions.
  evidence: v0.7 :238 ("recorded and changes nothing"), :239, :326, :355-359, :422. https://code.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage `origin`: "Routines whose trigger fired and server-verified messages from your other sessions arrive with this kind too"); claude-code.d.ts :12190 (session crons that "wake this session later"). Overlaps R-M1-16, including a message written to claude while such a turn runs.
  fix: Add to :239: "Its result is recorded under that message and shown in the soldier's log and pane, and Claude's transcript gets one line saying the soldier took a turn by itself after answering, with its changes (MSG-11, →M6). n on its card fails that turn as a read-violation, and the same line says so; the message keeps the state it ended in."

**Repaired:** PO-8's bullet on a turn the CLI starts after the work is over, 239.

## R-F-63 (F-FC1 finding 11)

- severity: P2
  type: ambiguity
  location: §5.1 L (docs/spec/v2.md:560); VER-9 (:579)
  claim: "The live follow-up reads no file" is undefined, and a run that fails it is never repeated, so a single model choice can fail M1's or M2's exit check for good.
  scenario: In the live follow-up, codex runs `wc -l README.md package.json`, as it chose to in its headless follow-up on 2026-10-07. Reading A: only a file-read tool counts, so the run passes. Reading B: any command that opens either file counts, so the run fails, and because only "a run that fails on tokens alone" is repeated, it stays failed. decisions.md says the repeats are there to absorb exactly this spread, "without letting one bad run decide". The text also doesn't say whether the repeated runs' follow-ups must read nothing.
  evidence: v0.7 :560, :579; C:\Users\johns\projects\AIConnections-review\docs\claude-first.md:33; decisions.md :169, :171 (the recorded pass rule has no read condition).
  fix: Rewrite :560 as "... the live follow-up reads neither file: no tool call in it opens either one, a shell command such as `wc -l` included. A run that fails on tokens or on a read is repeated twice, both ways, and then passes if the medians pass and <a read rule over the three runs, such as at most one>." Record the read rule in decisions.md.

**Repaired:** §5.1 L, 565; the read rule in `decisions.md`, "Values set in the fix pass".

## R-F-64 (F-FC1 finding 12)

- severity: P3
  type: editorial
  location: VER-9 (docs/spec/v2.md:579)
  claim: VER-9 restates the pass rule without the repeat-and-median rule.
  scenario: Read alone, VER-9 lets one run decide; §5.1 L :560 gives a token failure two more runs and lets the medians decide.
  evidence: v0.7 :560, :579.
  fix: "It passes as section 5.1's live checks say." Drop the restatement.

**Repaired:** VER-9, 584.
