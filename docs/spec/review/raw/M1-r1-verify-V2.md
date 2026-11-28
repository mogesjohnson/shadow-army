# M1 round 1, verifier M1-V2 (lifecycle): R-M1-3, R-F-16, R-M1-8, R-F-11, R-M1-10, R-F-30, R-M1-20, R-F-38. Snapshot be9deb0; v0.7 noted. Cut off by the usage limit and resumed in the same session.

- id: R-M1-3
  verdict: CONFIRMED
  severity: P1
  evidence:
    - The snapshot says what the lock holds and why, but not what a start does when it finds one. Line 164: "The start time tells the process that wrote the lock apart from a later one that reuses its pid". HOST-2 (:94) and M1-AC1 (:546) add nothing. Settled decision 2 fixes only what the lock holds.
    - The readings have already split. Codex's draft writes only `{pid}` and refuses any existing lock: "remove its stale lock after checking the recorded PID" (C:\Users\johns\projects\AIConnections-m1\src\v2\server.ts:25-36).
    - A normal exit can leave the lock behind. Claude Code kills a `$.process.spawn` child when "the module unloading kills the child", and session.end has "one short wall-clock bound (1.5 s by default)" (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts:3493 and :10980). Under Codex's reading the next session then needs the lock deleted by hand.
    - Earlier versions reclaimed stale locks. v1 takes over a crashed process's lock (C:\Users\johns\projects\AIConnections-review\src\workspace\locks.ts:51). In the 2.0 draft, GUARD-5's lock went stale after 30 s, and a second `sa` exited with a message (C:\Users\johns\projects\AIConnections-review\docs\legacy\spec\shadow-army-2.0.md:1076).
    - "Folder" is never defined (§2, :55-72). Codex's draft reads it as the repository root (C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts:62).
    - v0.7: unchanged (PO-1 :191, M1-AC1 :617 in C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md).
  reason: A start that finds a lock has no defined action, so one reading strands the army after every crash (and maybe every exit) while another can run two post offices on one checkout; the lock's own stated purpose gives the single sensible rule, so this is technical, not a decision.
  fix:
    - §2 adds: "**Folder:** the top level of the git working tree that the owner's Claude Code session runs in (PO-1)."
    - PO-1's bullet becomes: "**One per folder.** A lock in the folder holds the post office's pid, its process start time and its port, and is written whole. The start time is the one the OS reports for that pid, read the same way when the lock is written and when it is checked."
      - New sub-bullet: "A start that finds a lock reads it. The lock is stale when no process has that pid with that start time, or when it is empty or can't be read. A stale lock is replaced, and the new post office's log says so. Two starts that find the same stale lock end with one post office."
      - New sub-bullet: "A lock whose owner is alive is never deleted or replaced. The start is refused with `the army is already running in this folder (pid N, started T)`, or `the army is still closing` while that post office shuts down (PO-7). The mod shows the refusal, and the next use of the army tries again."
    - M1-AC1 adds: a lock with a dead pid, one with a living pid and another start time, and an empty one are each replaced and logged. A live lock refuses the start with its message and is left as it was. Two starts racing on one stale lock end with one post office.

- id: R-F-16
  verdict: DUPLICATE
  severity: P2 (as given)
  evidence:
    - It is the same gap as R-M1-3: the second session is R-M1-3's scenario 3, the restart inside 30 s its scenario 2, and the undefined "folder" its claim. The ledger's R-F-39 already points here.
    - R-F-16's one extra point: 2.0 GUARD-5 is neither carried nor listed as dropped. The archived draft says "A second `sa` in the same folder exits with a message naming the open chat. While the lock is held, v1 write commands refuse" (legacy :1076; reason D11 :71). Appendix A (:729) carries only GUARD-1 to GUARD-4, and v0.7 doesn't mention GUARD-5.
    - Nothing breaks without it. ADR-0013 carries only what Appendix A lists. A v1 `sa apply` during a soldier's turn is an owner change that no v2 record explains, so ARM-6 (:393) already sends it to the attribution card for y.
    - Optional P3, with R-M1-3's fix: Appendix A adds "2.0 GUARD-5 is not carried: PO-1's lock replaces its chat lock, and v1's write commands don't check it."
  reason: Duplicate of R-M1-3; its only extra, GUARD-5's v1 refusal, is the optional P3 note above.

- id: R-M1-8
  verdict: CONFIRMED
  severity: P1
  evidence:
    - The snapshot's PO-7 (:185-186) sets no order and no bound. M1-AC1 (:546) tests only idle soldiers. PO-1 (:165) would still restart a channel that crashes during the shutdown.
    - Vendor facts, checked:
      - https://code.claude.com/docs/en/headless#background-tasks-at-exit: "After Claude finishes its turn and stdin has closed, a claude -p run can stay open ... the run waits until the command exits or reaches its time limit. Claude then takes one more turn with the outcome."
      - https://code.claude.com/docs/en/tools-reference#time-limit-for-background-commands: in a -p run a background command gets 30 minutes, "up to a maximum of 2 hours", and BASH_MAX_TIMEOUT_MS can raise that.
      - The headless page's SIGTERM section: "leaves the turn that was in progress unfinished and records no result for it".
      - https://code.claude.com/docs/en/hooks: SessionEnd hooks "share a 1.5-second budget". A settings hook with a longer timeout can raise it to 60 s, but only by slowing every exit.
    - The scenario is real when the lease ends the post office: the post office is alive, the mod is not.
    - At a plain exit Claude Code kills the child when the module unloads (claude-code.d.ts:3493), so there containment ends the trees, not PO-7.
    - Codex's draft bounds the close: input closed, 2 s, SIGTERM, 0.5 s, then kill (C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts:162-168). The spec doesn't require it.
    - Both D-2 drafts already hold a shutdown that doesn't depend on the timing:
      - option A (C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-2-option-A.md, lines 17 and 28-38): ends the tree 10 s after the CLI is asked to exit, and "Nothing is restarted or resumed";
      - option B (C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-2-option-B.md, lines 35-40): the same, in five steps.
    - v0.7: unchanged (PO-7 :212-213).
  reason: Read plainly (close input, wait for the exit), PO-7's shutdown has no bound, and documented claude behavior then keeps a soldier working, with one more model turn, for up to its background limit after the Monarch is gone, which defeats the lease's purpose; that is more than the playbook's P2 example ("closes the session without saying how"), so P1 stands.
  fix:
    - Do as R-F-18's fix did: put in now, whichever timing D-2 picks, D-2 option A's PO-7 bullets "What starts it" (line 17), "Containment" (line 28) and "The shutdown" (lines 29-38).
    - Leave out "or once Claude's session id has changed" from "What starts it" until R-M1-20 is decided.
    - M1-AC1 takes option A's sentence "A fake that ignores its exit has its process tree ended 10 seconds later". It adds: "a fake that is mid-turn at the shutdown, ignores the end of its input and keeps a child running: within 10 seconds both are gone, nothing restarts it, and the post office releases its lock and exits."

- id: R-F-11
  verdict: CONFIRMED
  severity: P1
  evidence:
    - Its half on order and time limit is R-M1-8's. The other half is real: nothing says what a shutdown does with decisions still open.
      - PO-6 (:184) records only briefs, summaries and messages. A card left open at the end is recorded nowhere, so the guard's finding (ARM-6 :393, WSP-4 :401) is lost.
      - A turn that ended by itself and raised a card never ends its message: ARM-6 says "The turn's summary waits for the answer" (:393), and MSG-4 (:297) has no shutdown reason.
      - CH-6 (:244-245) lets a request end only by the owner's answer or a stop, and SEC-3 (:418) allows only "A stop's cancellation". A grok request answered `cancelled` at shutdown is therefore an answer the text doesn't allow; only killing the process fits. That makes this a gap rather than a contradiction.
    - Part of it is refuted. The reviewer's NEEDS-PROBE is answered by https://code.claude.com/docs/en/headless (SIGTERM section): a program that "closes the session through the Agent SDK ... ends Claude Code's input before sending any signal, and Claude Code cancels the prompt as soon as the input ends". So Kaisel's pending request doesn't hold the close open.
    - A turn cut short already ends as interrupted (PO-8 :202, :206).
    - D-2 option A already covers most of the fix, whichever timing wins: its shutdown bullets (lines 33-36) and its CH-6, MSG-4 and SEC-3 changes (items 4-6).
    - v0.7: unchanged (CH-6 :273, ARM-6 :423, SEC-3 :457).
  reason: Beyond the time limit it shares with R-M1-8, a session end or a lapsed lease silently drops the guard's attribution card, a safety control the design rules require, and leaves that card's message never ending, so P1 holds.
  fix:
    - Apply, whichever timing D-2 picks, D-2 option A's shutdown bullets on queued messages, running turns, open requests and cards (lines 33-36), with its CH-6, MSG-4 and SEC-3 changes (items 4-6).
    - In its cards bullet, add: an attribution or handoff card still open is kept in the records (PO-6) as unanswered, with its paths and hashes, not only in the log.
    - A message whose summary waited for that card ends as interrupted, with the reason `the session ended before the owner answered`.
    - M2-AC5 or M2-AC8 adds: the lease ends while an attribution card is open; the card is recorded as unanswered and its message ends as interrupted.
    - Whether the next start shows those decisions is the owner's choice and stays optional: D-2 option B's "the next start shows it once" (line 64), or H38.

- id: R-M1-10
  verdict: CONFIRMED
  severity: P1
  evidence:
    - HOST-2 (:94) starts the post office only "the first time the army is used in a session". The lease (:186) can end it while the mod still lives; D-2's prototype found a lapse certain from a 30 s Claude Code stall (C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md, D-2 record).
    - No text restarts it or tells the owner. M3-AC12 (:631) relies on a post office "restart" that no requirement defines.
    - The reviewer's NEEDS-PROBE is answered by the docs: a mod does reload inside a live session.
      - https://code.claude.com/docs/en/plugins/mods/reference: session.start runs "again after a reload of that mod".
      - So does a lost hooks worker: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\reference.md:158.
    - Overlaps: what a crash does to CLIs, turns, guards, messages and the lock is R-F-10 (batch M1-V3); the reload half is R-F-30's decision.
    - D-2 option A already holds the fix, apart from a crash reason: its HOST-2 change (item 3, "and again at the first use after it has shut down (PO-7)") and "What the owner sees" (lines 39-42).
    - v0.7: unchanged (HOST-2 :103, PO-7 :212-213).
  reason: When the post office ends by lease, watch, crash or failed write while the mod lives, the literal HOST-2 leaves the army down for the rest of the session with nothing shown, so simulation 1 (the stream dies) has no defined outcome.
  fix:
    - Apply D-2 option A's HOST-2 change and its "What the owner sees" bullets, whichever timing D-2 picks.
    - Add a reason, `the post office stopped unexpectedly`, for output that ends with no shutdown event.
    - The soldiers start new sessions. Whether they resume their last ones by id is H38's question (big), not part of this fix.
    - M1-AC1 adds: the post office is killed, and in a second case ended by its lease, while the fake mod lives. Each time Claude's transcript gets one line with the reason, and the next use starts a new post office with a new secret.

- id: R-F-30
  verdict: DECISION
  severity: P1
  evidence:
    - Every vendor fact checks out:
      - https://code.claude.com/docs/en/plugins/mods/reference: session.start runs "again after a reload of that mod"; `--plugin-dir` "reloads its hooks module when you save"; `/reload-plugins` reloads them on request.
      - https://code.claude.com/docs/en/plugins/mods/api: "Timers stop when the module reloads".
      - claude-code.d.ts:4299 adds "an enable, a worker respawn, or a reload".
      - reference.md:69: a save made during Claude's own turn reloads "when the turn ends".
      - `$.store` is a JSON file shared by every session on the machine (d.ts:3316-3320), so PO-3 (:172) rules it out for the secret.
    - The reviewer missed one fact. `$.state` is "plain data that survives a hot reload" and is held by the host in memory (d.ts:3349-3350), so the secret itself could survive a reload. The event stream can't: PO-3 (:174) and ADR-0012 put it only on the child's standard output, and "the module unloading kills the child" (d.ts:3493).
    - HOST-1 (:93) allows `--plugin-dir`, so an owner developing Shadow Army in this repository meets the reload case. A lost hooks worker (reference.md:158) can hit any owner.
    - The second-session and quick-restart cases belong to R-M1-3.
    - NEEDS-PROBE, not blocking for option (a): whether a spawned child outlives a hot reload.
    - v0.7: unchanged.
  reason: A reload or worker respawn cuts every running turn and leaves a post office that the new mod instance can neither command nor hear; the fixes differ in which settled decisions they touch.
  options:
    - (a) A mod instance owns only the post office it started, and HOST-2 says so. At a reload that post office ends: killed with the module, or, if it survives, ended by its lease within 30 s. Its turns are cut short (PO-8). No live post office is taken over, since the new instance has no secret. The new instance starts its own at the next use once the old lock is stale (R-M1-3), with one transcript line.
    - (b) A reload-safe handover: the secret kept in `$.state`, never on disk, and the event stream moved off standard output so a new instance can reattach. This changes ADR-0012 and PO-3 (:174), and needs the probe.
    - (c) One post office per Claude session instead of per folder, which reverses settled decision 2.
  big or technical: technical if the agents pick (a), the only option that changes no settled decision or ADR; (b) is big (it changes ADR-0012) and (c) is big (it reverses settled decision 2).

- id: R-M1-20
  verdict: DECISION
  severity: P2
  evidence:
    - HOST-2 (:94), PO-7 (:185), SES-1 (:334) and WSP-1 (:398) all depend on "the session", which §2 (:55-72) never defines; v0.7's §2 still doesn't.
    - The reviewer's NEEDS-PROBE is answered:
      - https://code.claude.com/docs/en/plugins/mods/reference: session.end fires when "The session ends, or `/clear`, `/resume`, or `/branch` runs ... `/branch` reports `resume`", and session.start doesn't fire after them.
      - claude-code.d.ts:10989-10990: after /clear "the process goes on under a new session id, and no `session.start` fires for it".
      - https://code.claude.com/docs/en/hooks lists the reasons `clear`, `resume`, `logout`, `prompt_input_exit` and `other`.
    - The quote attributed to "the M0 report" is not in evidence/m0-report.md; the same fact is in d.ts:10980.
    - Both D-2 drafts already choose reading B. Option A starts the shutdown "at `session.end`, or once Claude's session id has changed" (line 17). Option B says "If the id has changed, it stops renewing and sends the release" (line 45). Closing D-2 would therefore settle this question silently.
    - Related: H38 (:789), which PLAYBOOK section 14 lists as big.
  reason: Whether /clear, /resume and /branch keep or end the army decides what the owner keeps, loses and pays, so it is a product choice the text must make, not a wording fix.
  options:
    - (a) The army lives as long as the Claude Code process and its mod. /clear, /resume and /branch keep the soldiers and their sessions, and a summary card for a brief sent earlier arrives in the new conversation, marked as from the earlier one.
    - (b) Each Claude session has its own army. Any session.end ends it as PO-7 says, and the next use starts a new one. This is what both D-2 drafts assume.
    - (c) /clear keeps the army, while /resume and /branch end it, because another conversation takes over. What a resumed conversation gets stays with H38.
  big or technical: big; it changes what the owner sees and pays and touches H38, so D-2's text must not decide it.

- id: R-F-38
  verdict: DUPLICATE
  severity: P2 (as given)
  evidence:
    - It is the same decision as R-M1-20: what "the Claude session" means, and whether /clear, /resume, /branch and logout end the army. Its quotes check out (https://code.claude.com/docs/en/plugins/mods/reference, the session.start and session.end rows). Where cards go after /clear or /resume follows from that one choice.
    - Its other point, the Desktop app, is real and has only one answer (P3):
      - `$.process` is "CLI only" (claude-code.d.ts:3465);
      - a Desktop session is one "a host runs headless" (reference.md:172);
      - isInteractive is "false for a -p run or the SDK" (d.ts:11613-11616).
      So v0.7's new HOST-2 bullet (:104) already leaves the mod inert there, but no text says the Desktop app is unsupported.
    - Trivial fix, to apply with R-M1-20: HOST-1 adds "The mod runs in the Claude Code CLI. Elsewhere, such as the Desktop app, it can't start a process, so it offers no army."
  reason: Duplicate of R-M1-20; the Desktop-app sentence above is a separate trivial P3 to apply with it.
