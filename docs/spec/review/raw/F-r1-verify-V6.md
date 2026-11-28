# F round 1, verifier F-V6 (second, independent verification of the P1s): R-F-1, 3, 28, 12, 32, 33. Snapshot be9deb0.

- id: R-F-1
  verdict: CONFIRMED (touches H48)
  severity: P1
  evidence: Spec lines 401 (WSP-4 cites only v1 #22 and GUARD-1 to GUARD-4), 729 and 739 (Appendix A; ARM-6 cites WS-3, GUARD-3 and GUARD-4, not GUARD-2), 408 (WSP-7 covers soldier processes, not programs that git runs), 780 and 918 (Appendix C, H48: "New, and a security gap"). No GIT-n, fsmonitor or hooksPath appears in any normative text. Legacy 2.0 (C:\Users\johns\projects\AIConnections-v06\docs\legacy\spec\shadow-army-2.0.md): :1051 GIT-1, :1061 GIT-4, :1064 GUARD-2's sentinel set (`.git/config`, `hooks/**`, `info/**`). That set reaches WSP-4 only through §0 line 31, only at M6, and never ARM-6. v1 (C:\Users\johns\projects\AIConnections-v06\src\workspace\): git.ts:8-17 passes no `-c` safety flags; guard.ts:30 runs `git status` in the owner's checkout; apply.ts:48; worktree.ts:40,56 run `git worktree add`; audit.ts:82 uses `--no-verify` only. Codex's M1 draft makes snapshots with `git worktree add` (C:\Users\johns\projects\AIConnections-m1\src\workspace\worktree.ts:56) and runs that guard on every turn (src\v2\postOffice.ts:130, 202-213). Git docs: https://git-scm.com/docs/githooks says `git worktree add` runs post-checkout unless `--no-checkout`; `--no-verify` skips only pre-commit and commit-msg; reference-transaction runs on any ref update. https://git-scm.com/docs/git-config#Documentation/git-config.txt-corefsmonitor says `core.fsmonitor` may name a hook command that index-refreshing commands such as `git status` run to learn which files changed, and hooks are turned off per command with `-c core.hooksPath`. Not settled: ADR-0013 carries "the checkout guard", and STATE.md:24 lists this as an observation still to verify.
  reason: Nothing in v2 turns off hooks or fsmonitor for harness git. An auto or full soldier can run `git config core.fsmonitor <cmd>` in its own worktree; that writes the shared config. The guard's next `git status` then runs `<cmd>` as the owner, outside the soldier's process tree, its vendor sandbox and WSP-7. Because git skips files the hook reports as unchanged, the hook can also hide later checkout edits from the guard. A planted post-checkout hook runs on every `git worktree add` (WSP-1, and M1's snapshots). The malicious-repo actor is weaker: `.git/config` doesn't travel by clone, and Claude Code's own git status would meet it first. The soldier path holds on its own. GUARD-2 already fingerprints the shared config, hooks/ and info/ for WSP-4, so that half of the proposed fix is needed only for ARM-6 and M1.
  fix: Add to §4.8: "**WSP-10** (M1; X, F) **Harness git runs nothing the repository names** (from 2.0 GIT-1 to GIT-4). Every git command Shadow Army runs turns off hooks, the file system monitor, the pager, signing, external diffs and text conversion. This includes the guard's, the claim audit's, and the command that makes a snapshot or a worktree. Before each command, the repository's shared config, `hooks/` and `info/` are compared with the baseline (2.0 GUARD-2). A change there stops harness git and is reported like any other change the guard finds (ARM-6, WSP-4)." Then: add WSP-10 to M1's Implements; add the row "WSP-10 | 2.0 GIT-1 to GIT-4, GUARD-2" to Appendix A; add GUARD-2 to ARM-6's sources; add M1-AC9: "With `core.fsmonitor` set, and `post-checkout` and `post-commit` hooks planted in the shared git folder, starting a soldier, closing its guard and auditing its turn run none of them, and the change is reported (WSP-10)"; mark H48 as Same in Appendix C.

- id: R-F-3
  verdict: DECISION
  severity: P1
  evidence: Spec lines 255 (CH-7), 376 (ARM-1), 383 (ARM-5), 384-394 (ARM-6, agy only), 398-401 (WSP-1; WSP-2 audits only "every writing turn"; WSP-4), 686 (M6-AC2 says "only with the build role" but no requirement says how), 40 (G2), 334 (SES-1). The spec never says "supervised" or "full", and has no read-only rule for claude, codex or grok. settled.md:40-41; C:\Users\johns\projects\AIConnections\CLAUDE.md design rules ("Keep both whenever autonomy is involved"). 2.0 WS-3 (legacy :821) covered every read wake; v2 carries it for agy only (Appendix A, line 739). No ADR or STATE.md decision drops the rule. Overlaps R-M1-23 (decision 7's M1 snapshot is not in the text) and R-M1-24 (no per-CLI flags for each level).
  reason: The defect is real. The autonomy levels are never defined. The settled rule that an auto or full read-only task's writes are thrown away has no v2 form outside agy. So from M6, a builder's review, research or test brief writes into its worktree with no audit, and those writes can ride along in a later `/apply`. But the finding's own fix, a snapshot for each read-only task, can't work with G2 and SES-1's single long-lived session per soldier when a soldier takes both builds and reviews (Kaisel, Bellion). How to carry the rule into v2 is therefore a choice. The glossary entry is a plain text fix and can go in now.
  options: A) Under auto or full, a soldier without the build role runs its whole session in a throwaway snapshot, as ARM-6 does for agy. A builder's non-build turn is audited with no claims, so any write it makes is reverted and reported as a read-violation, and the guard covers every turn. B) A builder's non-build brief goes to a second, snapshot session of that soldier; this changes SES-1 and what the meter shows. C) Each turn switches to the vendor's own read-only mode where the CLI has one, otherwise A. This rests on vendor modes, which S5 showed agy ignores, and may count as adding a vendor safeguard. D) The owner amends the settled rule for v2, so that worktree isolation, the guard and the claim audit replace the snapshot.
  big or technical: Technical if A or C wins, since either carries an existing settled rule through a mechanism. B (changes SES-1) and D (amends an owner rule) are big, so the bake-off's winner decides whether it goes to the owner.

- id: R-F-28
  verdict: CONFIRMED
  severity: P1
  evidence: Spec lines 72, 82, 93 (HOST-1, installed path), 94 (HOST-2: "a session", one post office "per folder"), 136 (HOST-10 registers `send` without checking which session it is in), 439 (SET-2: "where the CLI can", M4). Official docs for Claude Code 2.1.294, in C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\. reference.md:
  - :68 `CLAUDE_CODE_PLUGIN_DIRS` is read from the process environment or from the env block of ~/.claude/settings.json;
  - :69 "A headless `claude -p` always loads fresh";
  - :76 a json or stream-json `-p` run writes a plugin module's load to its debug log;
  - :154-155 "a `$.tool.register` awaited there is listed by turn one";
  - :201-202 (how a mod's tool is listed).

  claude-code.d.ts:11602-11616 shows SessionStartInput has `surface` null and `isInteractive` false "for a -p run or the SDK", and :4387-4388 shows session.end firing on "a `-p` run done". https://code.claude.com/docs/en/cli-reference has no flag that drops plugins alone: `--bare` and `--safe-mode` also drop CLAUDE.md, hooks, skills, MCP servers and auto memory, and `--setting-sources` drops whole settings scopes. ADR-0010's consequences say personal plugins are not the harness, so the finding overstates G2. R-M1-38 is already recorded as a duplicate of this finding.
  reason: The docs show that a mod's session.start runs in `claude -p` stream-json sessions and that tools it registers there are listed. Nothing in HOST-1 to HOST-15 keeps the mod to the owner's session. So an installed mod, or one loaded through the settings env block, gives every claude soldier the Monarch's `send` and lets it start a post office in its own worktree, which breaks ARM-4 and MSG-6. SET-2 can't be relied on, because claude has no plugin-only exclusion. The other-mods `tool.check` half is weak: an owner-installed mod that answers allow is the owner's own configuration, like a settings allow rule, not a Shadow Army code path. SEC-3 holds, and that case remains SET-2's residual risk (M4).
  fix: Add to §3, after its first bullet: "**The mod acts only in the owner's own Claude Code session.** In any other session, a soldier's included, it registers no tool or command, starts no post office, records nothing and draws nothing." Add M3-AC13: "With the mod installed, a claude soldier's session lists no Monarch `send` tool and starts no post office (HOST-2, HOST-10)." The means is the implementer's; session.start's input already marks a `-p` run (`isInteractive` false, `surface` null).

- id: R-F-12
  verdict: CONFIRMED
  severity: P1
  evidence: Spec lines:
  - 61, glossary: "Each message adds one turn";
  - 189, a turn is "not over at its end event while something it started is still running";
  - 193;
  - 195, "The work has ended when the CLI reports each task's end";
  - 203, "when the CLI took a turn by itself after background work ended, that turn's end event is the last";
  - 209-211, the next message goes in once the turn is over, a later end event "changes nothing", and a later change "belongs to no turn";
  - 591, M2-AC9: the follow-up's result is the summary.

  C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\s6-results.md:9-11: a task that completes by itself is followed by a turn claude takes on its own; `stop_task` drew no follow-up within 60 s. The stop case is already defined: MSG-9 (lines 316, 318) and M2-AC9 line 592 say that after s, "the guard closes and the audit runs, once". Overlaps R-M1-16; R-F-42 is already recorded as a duplicate of this finding.
  reason: Lines 189 and 195 make the turn over when the task ends, before claude's follow-up starts. Lines 193, 203 and M2-AC9 make that follow-up part of the same message. Under the first reading, the guard closes early and the queued message goes in just as claude starts its own turn. The follow-up's writes then belong to no turn, which gives a soldier an unguarded write path through any background command, and its result is taken for the next message. Under the second reading, nothing bounds the wait when no follow-up comes, as with a plain child that exits or a task the CLI ends at its own time limit. Only the finding's stop_task example of the endless wait is refuted.
  fix: As proposed, plus one sentence in PO-8: "A turn the CLI starts by itself after a message's work is over belongs to that message: it gets a guard and an audit of its own, the queue waits for its end event, and its result never ends a later message." The wait's N seconds is a default for the agents to set.

- id: R-F-32
  verdict: CONFIRMED
  severity: P2 (was P1): each conflict it names is either overridden by v2's own text or leaves two readings. SAFE-11's group kill is overridden by CH-2 (line 222), PO-8 (lines 196-199) and WSP-7 (line 408). WS-1's detached worktree is overridden by the branches at lines 85, 185, 327 and 352. SAFE-10's "may add restrictions" and SAFE-6's report redaction and pruning each leave two readings. The playbook's table puts two reasonable readings that matter at P2, and no requirement becomes unbuildable.
  evidence: Spec line 31. Legacy 2.0 (shadow-army-2.0.md):
  - :814, WS-1 "a detached worktree";
  - :1035, SAFE-6 covers "events, briefs, reports and fixtures" and says "Logs are pruned after 30 days";
  - :1048, SAFE-10 "may add restrictions";
  - :1049, SAFE-11 "The whole group is killed at the end of the turn", plus its survivor-check fallback.

  Spec lines 183 (PO-5 append-only), 255 (CH-7 is silent on adding), 409 (WSP-8 names logs, records and briefs only). settled.md:40, and CLAUDE.md: "Shadow Army never adds or removes a vendor safeguard on its own". ADR-0013:26 (C:\Users\johns\projects\AIConnections-v06\docs\adr\0013-v1-legacy-and-carry-overs.md) says a source keeps "history" traceable, while claude-first.md:118 says 2.0's rules "still apply". The roster-order point duplicates R-M1-48, and the pruning point overlaps R-M1-52.
  reason: §0 makes the archived 2.0 text binding detail wherever v2 is silent. CH-7 says nothing about adding restrictions, so SAFE-10's "may add restrictions" comes in against the settled rule. WSP-8's shorter list leaves open whether reports are redacted and logs pruned. §0 also doesn't say whether a partial restatement replaces the rest of its source, or what the detail reference is for a v1 source.
  fix: Replace line 31 with: "**Carried over.** Requirements carried over from v1 or 2.0 name their source. This spec governs. A source's detail applies only where this spec says nothing on the point, and never against this spec, an ADR or the design rules. These parts do not apply: 2.0 SAFE-10's 'may add restrictions' (Shadow Army never adds or removes a vendor safeguard), SAFE-11's group kill at the end of each turn (CH-2, PO-8), and WS-1's detached worktree (each soldier works on its own branch). For a v1 source, v1.0.1's code on `legacy/v1` is the reference." Settle SAFE-6's pruning and report redaction in WSP-8 together with R-M1-52. The finding's own fix (sources are history only) is cleaner. But it must quote GUARD-1 to GUARD-4, SAFE-8, SAFE-9, SAFE-12 and WS-7 to WS-9 in the same change, or WSP-4 loses its sentinel set and repository mutex (and with them part of R-F-1's cover).

- id: R-F-33
  verdict: CONFIRMED
  severity: P2 (was P1): this is a live check by the owner whose pass rule is ambiguous and whose inputs are unnamed. That is "two reasonable readings that matter; a missing format" in the playbook's table. Nothing in it is unbuildable, and it guards no safety property.
  evidence: Spec lines 458 (the contract fixture is "the two-prompt task"), 493-497, 514, 557, 568, 53, 371. C:\Users\johns\projects\AIConnections-v06\docs\claude-first.md:21 holds the only text of the task, and doesn't name the two files; :23-28 hold the data; :32 says "within about 5%". Recomputed, live against headless:

  | Run | claude | codex | grok | agy |
  |---|---|---|---|---|
  | Task | −6.1% | +5.2% | | |
  | Follow-up | | −34.5% | | |
  | Total | −3.8% | −14.8% | +2.1% | +3.6% |

  So the finding is right. Read per prompt and two-sided, claude and codex fail. Read per prompt and one-sided, codex's task fails. Read one-sided on the total, all four pass. R-M1-45 is already recorded as a duplicate of this finding. The budget clause overlaps R-F-20 (and R-M1-12, on claude's cost being a running estimate).
  reason: The spec names neither the task's text and files, the measure, the direction of the 5%, the baseline's command, nor the number of runs. The 2026-10-07 data passes or fails depending on the reading, so the owner could judge the same run either way.
  fix: As proposed. Leave the budget clause to R-F-20's fix.
