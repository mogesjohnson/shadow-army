# F round 1, fix check F-FC2: the repairs of what F-FC1 found (R-F-53 to R-F-64, less R-F-58) and D-6. All eleven FIXED; two P3 residuals.

Spec 2.0 review, unit F, round 1, fix check F-FC2. Spec: C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md (v0.7). Line numbers are v0.7's. All eleven in-scope F-FC1 findings are FIXED; D-6 is correctly applied. R-F-59 remains open by design (awaits a decision) and nothing new depends on it. Two low-severity residuals are raised at the end. R-F-58 is out of scope (awaits D-7).

== THE TWO P1s ==

--- R-F-53 (P1, defect: WSP-10 compared only the repo's shared config, so a global filter driver ran as owner) ---
FIXED. Evidence: WSP-10 :449; M1-AC10 :633; §5.1 X :542; M2-AC5 :651.
WSP-10 :449 now compares "the config git reads for that repository (every scope but the command line, includes followed, and any config.worktree)" — which includes the global scope. So a `filter.x.clean` the soldier adds to its global config mid-turn is a change from the trusted baseline, and the "before each command" comparison holds harness git before the claim audit's `git diff`/`git add -A` (audit.ts site) ever runs the filter; the escalation path is closed at the point it mattered (PO-8 :231 runs the audit at turn-finish). M1-AC10 :633 tests exactly this ("a filter driver added to the user's global git config and named by a `.gitattributes` in the soldier's snapshot, holds harness git before anything it names runs").
Cross-checks the caller asked for: v0.7 :449 == 2.0 GIT-3 (legacy :1054: `git config --list --show-scope`, "every scope except the command line, with includes followed ... global config, .git/config and any config.worktree"). git-scm.com/docs/git-config confirms the scopes (system/global/local/worktree/command), that `--show-scope` reports scope, that `--includes` defaults on when searching all files, and that config.worktree exists under extensions.worktreeConfig. GIT-2's pin alone could not fix this (legacy :170: the pin stops a filter being changed, not from running); the widened GIT-3 comparison is the right mechanism. Note the fix routes the protection through WSP-10's comparison, not through ARM-6's guard hash (see residual F-FC2-A), which is correct because the comparison holds harness git *before* the command executes.

--- R-F-54 (P1, gap: a found change stopped harness git with no way back; ordinary owner git between turns stopped every soldier for the session) ---
FIXED. Evidence: WSP-10 :449-:451; M1-AC10 :634; M2-AC5 :651.
Three things are now defined: (1) the baseline is "the state Shadow Army last trusted: their state when the post office started, or as the owner last accepted it" (:449) — a y on the card advances it, so there is a way back (previously the baseline was pinned at start and nothing resumed until the session restarted); (2) "Changes to `branch.*` and `remote.*`, such as `git push -u` makes, don't count" (:449), so push/`gh pr checkout` between turns are exempt; (3) the outcome is defined — a change "holds harness git ... until the owner answers it on the guard's attribution card (ARM-6, →M2): y trusts the state shown ... n keeps it held. In M1, before that card exists, the post office's log names the change, and harness git stays held until the post office restarts" (:450), and "A turn that needs harness git to finish ends interrupted, with the change named (MSG-4, →M3), and the soldier's queue is held" (:451). M1-AC10 :634 tests `git push -u` holds nothing.
Cross-checks: the branch.*/remote.* exclusion == 2.0 GIT-3 (legacy :1054). The hold-and-card outcome == 2.0's "a GIT-3 finding ends the task with status `guard`, commits and applies nothing, and shows the ... card" (legacy :840, :1060). The baseline-advance on y matches 2.0's "attribute it" card intent (legacy :1060). git-scm.com/docs/git-config: `git push -u` writes branch.<name>.remote/merge (branch.*); excluding branch.*/remote.* is safe here because harness git in Shadow Army never fetches/pushes (WSP-10 :443 lists only snapshot/worktree/guard/audit/commit), so remote-config cannot trigger command execution. The marker hygiene is correct: WSP-10 is M1 and the card (ARM-6) is M2, so the text uses "(ARM-6, →M2)" and gives M1 the log-only path, which M1-AC10 :633 tests and M2-AC5 :651 tests the y/n card.
Residual (see F-FC2-B): `git lfs install` between turns writes `filter.lfs.*` (not branch.*/remote.*), so it still holds harness git; in M1 that is log-only and clears only on post-office restart. This matches 2.0 (which also held on a filter config change) and is the documented M1 limitation, so the P1 is fixed; I flag the M1 observability as a minor residual below.

== THE OTHER FINDINGS ==

--- R-F-55 (P2, vendor-fact: hooks turned off only by an empty core.hooksPath; misses git 2.54 config-defined hooks) ---
FIXED. Evidence: WSP-10 :444; M1-AC10 :631.
:444 now does both: "`core.hooksPath` names an empty folder Shadow Army keeps (2.0 GIT-1), and `hook.<event>.enabled` is false for each hook event the command can fire, so hooks defined in git's config stay off too." M1-AC10 :631 plants "a `post-checkout` hook defined in the config" and asserts the snapshot command runs none of them.
Vendor check: git-scm.com/docs/git-hook — the hookdir script "is run last," i.e. config-defined `hook.<name>.command`/`.event` hooks run independently of the hooks directory, so an empty hooksPath does not reach them; git-scm.com/docs/git-config — `hook.<event>.enabled` "false" means "no hooks fire for that event, regardless of any per-hook ... settings," which is the correct bounded off-switch per event the command fires (e.g. post-checkout for `git worktree add`). The spec uses a real empty folder Shadow Army keeps (an absolute path it controls), not the undocumented empty-string value the finding worried about, so git-config's `/dev/null`/relative-path caveats do not apply. Dropping the recommended "on git 2.54 and later" qualifier is harmless: `-c hook.post-checkout.enabled=false` is an unknown-but-well-formed key on older git, silently ignored, and there are no config hooks there anyway.

--- R-F-56 (P2, contradiction: ACs required a start-time clean filter to never run, but WSP-10 passes it so it runs) ---
FIXED. Evidence: WSP-10 :446; M1-AC10 :632; §5.1 X :542; M2-AC5 :651.
All four now agree: a filter set at start is the owner's and runs (:446 "a filter set then is the owner's, and runs"; :632 "a clean filter set in the config when the post office started is the owner's, and runs"), and only a filter added *after* start is stopped — "because the change holds harness git first" (:542). The contradiction is gone.

--- R-F-57 (P3, editorial: the inserted sentence broke the next sentence's referent, and "2.0's sentinel set" imported undefined members) ---
FIXED. Evidence: ARM-6 :416-:417.
"That is its `result` once nothing the turn started is still running ..." now sits at :416 directly after "until the turn is over (PO-8)," so "That" again refers to the end of the turn. The hashed paths are now their own explicit bullet at :417 in v2's own terms (shared git config, hooks/, info/, worktree metadata; .githooks/, .claude/, .mcp.json, .env*; AGENTS.md, CLAUDE.md, shadow.config.json, orchestratorDelegate.md, rules.md, agent.md). The word "sentinel" and the problematic 2.0 imports ("vendor home configs", "MEM-2 fallback directories", "the policy files") no longer appear anywhere in v0.7, so the ~/.claude.json false-positive-per-agy-turn is gone. (Consequence noted as F-FC2-A.)

--- R-F-59 (P2, decision-needed: HOST-2's marker also fits the owner's desktop Code-tab session) — NOT REPAIRED (by design) ---
Correctly deferred; it waits on M1-V2's verdicts on R-F-38/R-M1-20 (per the packet). I confirmed nothing new in v0.7 depends on it: the commit's HOST-2/M3-AC13 changes (R-F-60) all concern the *soldier's* `-p` session (isInteractive false), not the owner's own session, so they add no new dependency on the unresolved desktop-session classification. No action; carry to the decision.

--- R-F-60 (P3, untestable: M3-AC13 needs a real claude but HOST-2/HOST-10 carried only I evidence) ---
FIXED. Evidence: HOST-2 :103 (now "M1; I, C"); §5.1 C :526 ("for claude, a soldier session with the mod installed (HOST-2)"); M3-AC13 :712 ("From the owner's recording of a real claude soldier session with the mod installed (VER-4), the session lists no Monarch `send` tool, and no post office starts").
The claim is now carried by a contract recording of a real claude, not an unloadable fake. Trace is intact: HOST-2 is still named by M1-AC9's test (so Appendix B rule 9 passes at M1 regardless of evidence-code), and M3-AC13 (M3) citing HOST-2 (M1) and VER-4 (M2) is allowed by rule 8.

--- R-F-61 (P2, contradiction: M2-AC9 made a generic child wait 30 s, but PO-8 says a non-task process starts no turn) ---
FIXED. Evidence: M2-AC9 :666, :669; PO-8 :223.
:666 now has the fake "report its child as a background task, as claude does (`task_started`, then `task_notification`)," and :669 adds "A child the fake does not report as a task frees the queue as soon as it exits, with no wait." The 30 s wait now applies only to a reported task's by-itself follow-up, matching PO-8 :223 ("a process that is not a CLI task, starts no such turn").

--- R-F-62 (P2, gap: the by-itself-turn rule said what its result does not do, not what it does to the ended message or what n does) ---
FIXED. Evidence: PO-8 :239.
:239 now says the result "is recorded under that message and shown in the soldier's log, and Claude's transcript gets one line saying the soldier took a turn by itself after answering ... with its changes (MSG-11, →M6). n on its card fails that turn as a read-violation, and the line says so; the message keeps the state it ended in." That answers both open questions (the ended message keeps its state; n fails the turn and is surfaced) and the "card never shows the changes" sub-point (the transcript line carries them). The residual the finding named — claude giving the same origin kind to scheduled/routine wakes and to messages from other sessions — overlaps R-M1-16 (out of scope) and is unchanged. One trivial deviation from the recommended text: it dropped "and pane" (recommended "shown in the soldier's log and pane"); immaterial.

--- R-F-63 (P2, ambiguity: "reads no file" undefined; a run that fails it is never repeated) ---
FIXED. Evidence: §5.1 L :565; decisions.md "Values set in the fix pass" :214.
:565 defines the read ("no tool call in it opens either one, a shell command such as `wc -l` included"), resolving the wc -l ambiguity against the strict reading, and repeats a run that "fails either test" (tokens or read), judging by medians plus "at most one of the three live follow-ups read a file." decisions.md :214 records the read rule. Consistent with decisions.md's stated intent to absorb run-to-run spread "without letting one bad run decide" (:212).

--- R-F-64 (P3, editorial: VER-9 restated the pass rule without the repeat/median rule) ---
FIXED. Evidence: VER-9 :584 ("It passes as section 5.1's live checks say."). The restatement is dropped; one source of truth.

== D-6 (applied in the same commit) ==
Correctly applied, no break. Evidence: VER-7 :582 (tests name the requirement/AC IDs they verify; the script fails a current-or-earlier-milestone requirement with U/C/I/X/F/S evidence that no test names, or a test naming an unknown ID; "CI names the current milestone"; "R and L evidence is recorded on the PR (VER-8, →M2, and section 6)"); M1-AC7 :627 (the trace script's "test check (Appendix B rule 9) ... for M1's requirements"); Appendix B rule 7 :835 (script checks rules 1-6 and 8, plus rule 9 in CI) and rule 9 :837 (CI-only, needs the code). This matches D-6 option (a) in decisions.md :138-141 verbatim in substance. Marker hygiene holds: VER-7 (M1) -> VER-8 (M2) is tagged "→M2". Rule 9 is per-requirement (not per-evidence-code), so R-F-60's added C on HOST-2 does not create a rule-9 gap (HOST-2 is named by M1-AC9's test).

== NEW RESIDUALS (review schema; both low-severity, framed honestly) ==

- id: F-FC2-A
  verdict: n/a (fix-check residual)
  severity: P3
  type: editorial
  location: ARM-6 (docs/spec/v2.md:417); WSP-4 (:431); M6-AC1 (:766)
  claim: The R-F-57 rewrite narrows the hashed path list and still cites "(from 2.0 GUARD-2)", but 2.0 GUARD-2 (legacy :1063-1069) also hashed "global git config" and "vendor home configs"; v0.7 :417 lists only "the shared git config" and drops both. Dropping vendor home configs is intended (it was R-F-57's own point about ~/.claude.json). But because WSP-4 (:431) and M6-AC1 (:766) extend this guard scope to every soldier, no soldier's guard hashes the global git config directly anymore.
  scenario: An agy or claude soldier writes ~/.gitconfig during a turn. It is outside the worktree/snapshot (not discarded) and no longer in the guard's hashed set.
  evidence: v0.7 :417, :431, :766; legacy GUARD-2 :1068 ("global git config and vendor home configs").
  reason: Coverage is in fact preserved — WSP-10 :449's before/after comparison now covers "every scope," so a global-config write is caught as a held-harness-git event instead of a guard card — so this is not a functional gap, but the "(from 2.0 GUARD-2)" citation overstates the carry-over and could be trimmed or annotated.

- id: F-FC2-B
  verdict: n/a (fix-check residual)
  severity: P3
  type: gap
  location: WSP-10 (docs/spec/v2.md:450); HOST-8 (:140-142); HOST-14 (:174-177)
  claim: In M1 there is no attribution card (ARM-6 is M2), so an owner config change between turns that is not branch.*/remote.* — e.g. `git lfs install` writing filter.lfs.* — holds every soldier's harness git with only a per-soldier log line (:451 "its log says why"), clearing only on post-office restart, and with no decision/toast surface. 2.0 showed a git-metadata card for this even before M5 (legacy :1060); v0.7's M1 is log-only.
  scenario: Between turns the owner runs `git lfs install`; later every soldier fails to start a snapshot and the owner sees only logs.
  evidence: v0.7 :450, :451; legacy GIT-3 :1060.
  reason: This is the documented M1 limitation and is recoverable (a card in M2, a restart in M1), and it matches 2.0's hold-on-filter-change, so it is likely acceptable staging rather than a break — raised only because it is the one spot the R-F-54 fix leaves thin for M1, and the owner may want a surfaced warning there.

Minor seam (not raised as a finding): WSP-10 :451 ("a turn that needs harness git to finish ends interrupted") and PO-8 :231 ("runs its claim audit ... once each ... at finish") do not say what happens to the finish-time audit when harness git is held mid-finish; the old wording had the same (worse) issue, so the fix improves rather than introduces it.

Files read: C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md (v0.7); .../docs/spec/review/batches/F-FC2.md; .../docs/spec/review/raw/F-r1-fixcheck-FC1.md; .../docs/spec/review/settled.md; .../docs/spec/review/decisions.md; .../docs/legacy/spec/shadow-army-2.0.md (GIT-1..4, GUARD-2 region). Vendor docs: https://git-scm.com/docs/git-config and https://git-scm.com/docs/git-hook.
