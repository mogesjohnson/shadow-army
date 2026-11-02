# M1 round 1, verifier M1-V8 (second, independent verification of the P1s, part 2): R-F-30, R-M1-9, R-F-10, R-M1-11, R-M1-7, R-M1-12, R-M1-23. Snapshot be9deb0; v0.7 noted.

- id: R-F-30
  verdict: DECISION
  severity: P1
  evidence:
    - The snapshot, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@be9deb0.md:
      - :87: the mod starts the post office and reads its output.
      - HOST-1 :93: `--plugin-dir` is a supported way to load the mod.
      - HOST-2 :94, PO-1 :164, PO-3 :171-174 and PO-7 :186.
      - No text covers a second mod instance that meets a live lock.
    - https://code.claude.com/docs/en/plugins/mods/reference: `session.start` fires "again after a reload of that mod"; `--plugin-dir` "reloads its hooks module when you save"; `/reload-plugins` reloads plugins.
    - https://code.claude.com/docs/en/plugins/mods/api: "Timers stop when the module reloads."
    - C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts:
      - :4299: session.start fires again on "an enable, a worker respawn, or a reload".
      - :3492-3494: a `$.process.spawn` child is killed when the module unloads.
      - :3317-3321: `$.store` is a file on disk.
      - :3349-3354: `$.state` survives a hot reload, but "Any plugin reads any value".
    - C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\reference.md:68-69: a save the Monarch makes reloads the mod at the end of its turn.
    - Codex's draft:
      - C:\Users\johns\projects\AIConnections-m1\plugins\shadow-army\README.md:27-29: the post office is detached, so it outlives the reload and ends by its lease.
      - C:\Users\johns\projects\AIConnections-m1\src\v2\server.ts:30-34: any existing lock is refused, and the owner must remove a stale one by hand.
  v0.7: not fixed. In C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md:103-104, HOST-2 only keeps the mod out of sessions that aren't interactive.
  reason: The gap is real whether the old post office dies with the module (the typings) or outlives it (the draft): the reloaded instance, a second interactive session and a quick restart each meet a lock that nothing defines, and the remedies differ on whether they keep the settled decisions.
  options:
    - (a) A mod instance owns only the post office it started.
      - At a reload or a worker respawn, that post office ends: at once with the module, or by its lease within 30 s. Its turns are cut short, and Claude's transcript gets one line.
      - The next use starts a new post office once the old one has exited. A lock whose pid and start time match no living process is reclaimed (R-M1-3).
      - A lock held by another living session's post office is refused, with a line that names it.
      - §5.1 F adds a reload mid-turn.
    - (b) A handover that survives a reload: a detached post office, the secret kept in `$.state` (which every other mod in the session can read), and events moved off standard output. This changes ADR-0012.
    - (c) One post office per Claude session. This reverses settled decision 2, and it still doesn't survive a reload.
    - Recommended: (a).
      - It keeps every settled decision.
      - With §3's design the typings make an unload kill the post office anyway, so (b) also needs a detached process.
      - Say in the unit's report that under `--plugin-dir` every save of a mod file then ends the army.
      - The reload probe doesn't block this: the text must define both outcomes.
  big or technical: technical if (a). (b) and (c) are big.

- id: R-M1-9
  verdict: CONFIRMED
  severity: P1
  evidence:
    - The snapshot:
      - PO-1 :168 covers only "When a channel closes or restarts".
      - PO-7 :186 names "its process containment (PO-1)", which PO-1 never defines.
      - Q8 :720 is about how the helper ships, not about a dead post office.
      - M1-AC4 :549-553 and §5.1 F :476-491 never kill the post office. M3-AC12 :631 checks only the message's state.
    - https://code.claude.com/docs/en/headless#background-tasks-at-exit: after its turn, with stdin closed, a `-p` run "can stay open to wait for background work", and "Claude then takes one more turn with the outcome".
    - https://code.claude.com/docs/en/tools-reference#time-limit-for-background-commands: with stream-json input, a background command gets 30 minutes, and up to 2 hours.
    - Codex's draft does contain the post office's death: C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts:42, :51 and :560 (a subreaper guardian, a coalition, KILL_ON_JOB_CLOSE).
    - All three D-3 drafts add it: C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-3-option-A.md:320, D-3-option-B.md:60, D-3-option-C.md:116-117.
    - D-2 option A, already chosen, states the rule but gives no time bound and no test: C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-2-option-A.md:28.
  v0.7: not fixed (v2.md PO-1 :195, M1-AC4 :620-624, §5.1 F :543-559).
  reason: No requirement or test makes a soldier's process tree end when the post office itself dies, and the vendor docs show that an orphaned claude finishes its turn, waits up to 30 minutes for its background commands and then takes one more turn, with nothing watching it.
  fix:
    - PO-1, after :168: "If the post office ends without closing a channel, because it was killed or crashed, its containment ends that CLI's whole process tree within 10 seconds, as far as the system's containment reaches (Q8)." Keep only one of this and D-2 option A's matching PO-7 bullet.
    - §5.1 F adds "the post office killed mid-turn".
    - M1-AC4 adds: "the post office is killed while the fake is mid-turn with a child it left running: both are gone within 10 seconds."
    - This is item (1) of R-F-10. Fix it once.

- id: R-F-10
  verdict: CONFIRMED
  severity: P1
  evidence:
    - The snapshot:
      - HOST-2 :94 starts the post office only "the first time".
      - PO-1 :163-168 restarts channels, never the post office itself.
      - §5.1 F :476-491 has no post office kill.
      - M3-AC12 :631 tests behavior "after a restart", which no requirement defines.
      - Only partial cover: MSG-4 :298 ends a message as "not delivered … because the post office stopped first". That covers a stop, not the records a crash leaves behind.
    - Codex's draft:
      - C:\Users\johns\projects\AIConnections-m1\src\v2\client.ts:76: later sends throw "post office is closed".
      - server.ts:30-34: the lock stays until the owner removes it by hand.
    - D-2 option A, already chosen (C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md D-2; D-2-option-A.md:28 and :41-42), covers three things for a shutdown: containment, the transcript line, and starting again at the next use. It doesn't cover a crash's stale lock, its open turns, or its queued and delivered records.
  v0.7: not fixed.
  reason: When the post office dies, nothing defines its lock, its open turns' guards, its queued and delivered messages, or what the owner sees; only the shutdown part sits in D-2's text, which isn't applied yet.
  fix:
    - Apply D-2 option A's PO-7 text. Its Containment bullet is R-M1-9's rule.
    - Then add to PO-1: "If the post office ends without its shutdown (PO-7), Claude's transcript gets one line with its exit code or signal, and the next use starts a new post office (HOST-2). A post office that finds a lock whose pid and start time match no living process takes it over (R-M1-3). Before it opens a channel, it settles the old post office's records: each queued message ends as not delivered, with the reason 'the post office stopped'; each delivered message that has no end ends as interrupted (MSG-4); and the checkout of each turn that was open is compared with the baseline the guard kept on disk under `.shadow/v2/`. Any change goes on that turn's attribution card (ARM-6), or, before M2, into one transcript line."
    - §5.1 F adds "the post office killed mid-turn, with a message queued and an approval request open". M3-AC12's restart then rests on this text.
    - The restart policy is not an open decision: D-2 A and HOST-2 already start the post office at the next use.

- id: R-M1-11
  verdict: CONFIRMED
  severity: P1
  evidence:
    - The snapshot: PO-5 :183 gives only the place and the redaction. §5.1 F :490 lists "a failed log write" with no expected result. No other text defines an outcome; I searched for "log write", "disk" and "fail".
    - PO-5's evidence is U only, so no milestone owns the F case.
    - The archived 2.0 draft (C:\Users\johns\projects\AIConnections-review\docs\legacy\spec\shadow-army-2.0.md) has no fault list.
    - Codex's draft:
      - C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts:79-83 closes the whole post office on any log error ("A broken audit must stop further work").
      - C:\Users\johns\projects\AIConnections-m1\src\v2\logs.test.ts:85-94 expects a later write to succeed.
    - The CLI keeps its own transcript, so the post office's log is not the turn's only record.
    - R-M1-29 is the same defect.
  v0.7: not fixed (v2.md PO-5 :210, §5.1 F :558).
  reason: The fault test has no outcome to check against, and the draft chose the reading under which one failed append ends every soldier's turn.
  fix: as proposed, with M1's way of showing it.
    - "PO-5 (M1; U, F): A failed log write is retried once, 100 ms later. If it fails again, the post office goes on. It reports the failure once as an event, and Claude's transcript gets one line, as in `logs not written: ENOSPC: no space left on device`. Each later write tries again, and the first one that succeeds records the gap. A log never stops a soldier or a turn. A line left half-written is ended before the next write, and readers skip any line that doesn't parse. Records (PO-6) are not logs."
    - M1-AC4 adds: "log writes fail mid-turn: the turn completes, the failure is reported once, and the log resumes when writes succeed."
    - Stopping the army on a log it can't write would instead be a big decision.

- id: R-M1-7
  verdict: CONFIRMED
  severity: P1 (was P2): SEC-4 is an M1 security requirement, and M1-AC2 (:547, which checks only the Monarch's credential) passes while SEC-4 fails. VER-6 (:509) demands 100% branch coverage of a `redact()` whose behavior no text defines. R-M1-28 (P1) is the same defect.
  evidence:
    - The snapshot: SEC-4 :419 and WSP-8 :409. §5.1 U :456 and X :474 name redaction but no match set.
    - 2.0 SAFE-6 (legacy :1035) defines no match set either.
    - Codex's draft picks its own set (C:\Users\johns\projects\AIConnections-m1\src\v2\logs.ts:5-30). By my reading of its patterns, `AWS_SECRET_ACCESS_KEY=…` in a tool result matches none of them.
  v0.7: not fixed (v2.md SEC-4 :458, WSP-8 :439).
  reason: "No secret" can't hold for whatever a soldier prints, and without a defined match set no test can show what `redact()` must remove.
  fix:
    - "SEC-4 (M1; X): No log or record holds a secret that Shadow Army holds by value, in any encoding it uses for it: the Monarch's secret (PO-3) and each soldier credential (PO-4). `redact()` also removes each pattern WSP-8 lists. Any other secret a soldier's CLI writes into its session, such as a value it read from a file or its environment, is logged as the CLI wrote it, as the CLI's own transcript keeps it."
    - WSP-8 adds: "It replaces with `[REDACTED]`: each secret held by value; PEM private-key blocks; `Authorization` and `Bearer` values; the vendors' documented key prefixes; and the value after a key whose name marks a secret (`*_API_KEY`, `*_ACCESS_KEY`, `*TOKEN*`, `*SECRET*`, `*PASSWORD*`), in `key=value`, `key: value` and JSON. The unit test has one case for each, with its source."
    - The remaining risk goes on D-4's list of risks the owner accepts.

- id: R-M1-12
  verdict: CONFIRMED
  severity: P1
  evidence:
    - The snapshot: CH-2 :226.
    - https://code.claude.com/docs/en/agent-sdk/cost-tracking, "Track costs in streaming input mode": `usage` "covers only that turn, and within it only the main agent loop, not any subagents it ran"; `total_cost_usd` and `modelUsage` "carry the running total for the whole call so far, plus any spend restored when the call resumed a session".
    - The same page, "Recover totals after a session crash": a crash "emits a final `error_during_execution` result and exits", which "may carry zeroed `usage`, `total_cost_usd`, and `modelUsage`". Per-step `output_tokens` is a placeholder, and the figures are client-side estimates.
    - C:\Users\johns\projects\AIConnections-review\docs\spec\review\evidence\s6-results.md:7: the interrupt's result "usage is all zeros". :21-22: the per-turn rule was planned and never written.
    - C:\Users\johns\projects\AIConnections-review\docs\spec\review\evidence\issue-63-comments.md:163.
    - Codex's draft already computes the cost as a difference and treats a zero result as a gap: C:\Users\johns\projects\AIConnections-m1\src\v2\claude.ts:273-286.
    - R-M1-30 is the same defect.
  v0.7: CH-2 :255 is unchanged. §5.1 L :564 now never counts a running total for the parity measure, which fixes the VER-9 part.
  reason: The vendor docs show that `result` carries running totals for cost and per-model usage, and zeros after a crash or a stop, so read naturally, "the turn totals come from `result`" gives wrong figures for each turn.
  fix: as proposed, less its VER-9 sentence, plus three additions.
    - Add to CH-2: "A zero or falling total is never a baseline. The next result's cost also reads 'not reported', because its difference would include the earlier turn's spend, and that result's totals become the baseline."
    - Add to CH-2: "The first result of a process that resumed a session (CH-9) carries the session's earlier spend, so its cost reads 'not reported'."
    - OBS-3 adds: "A turn's figures are its own. SES-7 and HOST-15 add each turn's per-model figures, which count subagents, never running totals (CH-2, CH-5)."

- id: R-M1-23
  verdict: CONFIRMED
  severity: P1
  evidence:
    - C:\Users\johns\projects\AIConnections-review\docs\spec\review\settled.md:28: decision 7, a throwaway snapshot of HEAD until WSP-1. :41: with auto or full, a snapshot plus the checkout guard.
    - The snapshot:
      - CH-1 :217 opens "a session in a worktree".
      - WSP-1 :398 and WSP-4 :401 are M6.
      - ARM-6 :384-387 is M2 and covers only agy.
      - M1's Implements list (:536-544) carries none of these.
      - H28 (:900) makes keeping a violating snapshot an after-v2.0 idea.
    - C:\Users\johns\projects\AIConnections-review\shadow.config.json:5-6 sets claude-opus and claude-sonnet to `auto`.
    - Codex's draft, C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts:
      - :130: a snapshot of HEAD, made as a worktree under `.shadow/v2/worktrees/`.
      - :202-222: the checkout and the snapshot are both guarded; any change fails the turn and marks the soldier down, and "partial work is retained".
  v0.7: not fixed.
    - WSP-10 :451 and M1-AC10 :631 and :633 now assume "a soldier's snapshot", and D-15 relies on one.
    - No requirement says where a session opens, and CH-1 :246 still says "in a worktree".
  reason: The M1 text contradicts settled decision 7, and it leaves to the builder where an `auto` soldier runs and whether a guard watches it.
  fix: as proposed, with two changes.
    - The snapshot's fate comes from the settled word "throwaway", so it needs no decision.
    - M1's guard works without ARM-6's attribution card, which arrives in M2.
    - Text: CH-1's interface line reads "open a session in the soldier's own folder (a snapshot until M6)". CH-1 adds: "Until WSP-1 (M6), each session runs in a throwaway snapshot of HEAD under `.shadow/v2/`, as ARM-6 runs agy's. A file the soldier writes there is discarded and reported as a read-violation (from 2.0 WS-3). The snapshot is removed when its session closes; it is never kept as a worktree (PO-7). The checkout guard covers each turn. Until ARM-6's card arrives in M2, any change to the checkout during a turn fails the turn, and the soldier's log and one line in Claude's transcript name each path."
    - Add M1-AC11: "In one turn a fake claude writes one file in its snapshot and another in the folder. The snapshot's file never reaches the folder and is reported as a read-violation. The turn fails, naming the folder's path, and the snapshot is gone once the channel closes."
