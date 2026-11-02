# M1 round 1, verifier M1-V7 (second, independent verification of the P1s, part 1): R-M1-1, R-F-29, R-M1-2, R-M1-24, R-M1-3, R-M1-8, R-F-11, R-M1-10. Snapshot be9deb0; v0.7 noted. Cut off by the usage limit and resumed in the same session.

- id: R-M1-1
  verdict: DECISION
  severity: P1 (as given). Not P0: a soldier that can read another process's memory can already run code with the owner's own rights, so the secret adds only the Monarch's authority over the other soldiers.
  evidence: The snapshot is C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@be9deb0.md and v0.7 is C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md; bare line numbers below are the snapshot's.
    - PO-3 172 says "anywhere a soldier can read". PO-3 173 makes every command present the secret, so both the mod inside Claude Code's process and the post office must hold it in memory.
    - SEC-2 417 and M1-AC2 547 test only files, command lines, the environment, output and logs. SEC-3 418 rests on the same secret.
    - Appendix C B2 782 already parks this exact gap as an open "could add (v2.0)" item.
    - ADR-0012's Decision covers only disk, command line and environment, but its Consequences say "A soldier cannot act as the Monarch".
    - The ledger claims of R-F-2 and R-M1-32 state the same issue.
    - Windows: a process's default security descriptor takes its ACLs "from the primary or impersonation token of the creator", and ReadProcessMemory needs only PROCESS_VM_READ (https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights).
    - Linux: at Yama scope 0 a process can attach to any same-uid process "as long as it is dumpable"; at scope 1 only to its descendants (https://www.kernel.org/doc/html/latest/admin-guide/LSM/Yama.html). Soldiers are descendants of both holders, so scope 1 or higher shields both. At scope 0 the post office could make itself non-dumpable, but Claude Code's process, which holds the mod's copy, stays readable. On Windows that copy is always readable.
    - v0.7: not fixed (PO-3 197-202, SEC-2 456, B2 867 unchanged).
  reason: The gap is real: PO-3's last MUST NOT cannot hold on Windows, or on Linux at scope 0, while SEC-2 passes anyway. Whether to narrow it, harden, or isolate soldiers, and which residual the owner accepts, is the security-posture choice already parked as B2. Decide it once with R-F-29, and fold R-F-2 and R-M1-32 into it.
  options:
    - A, harden where the system allows and state the rest:
      - PO-3's MUST NOT names disk, command lines, environment variables, output and logs.
      - The post office protects its own memory where it can (Linux non-dumpable, or Yama scope 1 or higher; on Windows a process security descriptor that denies memory reads) and logs which protection it has, with an X test.
      - SEC-2 and M1-AC2 say what they prove.
      - ADR-0012's consequence, CH-6 and SEC-3 are narrowed to soldiers that stay inside their CLI's permission checks.
      - The residual (Claude Code's own process on Windows, and on Linux at scope 0) goes into D-4 for the owner to accept.
    - B, soldiers run as another OS user or in a sandbox, so PO-3 and SEC-5 hold as written. This is a new capability and a setup change, and each CLI's login moves to that user.
    - C, as A, and on Linux at scope 0 soldiers start only if the owner allows it.
  big or technical: big. It means accepting a residual that cannot be fixed and changing an ADR's consequence, and PLAYBOOK section 14 names B2-on-one-system as big. Under A, the hardening mechanism itself is technical and goes to a bake-off.

- id: R-F-29
  verdict: DECISION
  severity: P1 (as given)
  evidence:
    - Snapshot §3 84 and PO-4 177-181: claude's `send` tool goes in through `--mcp-config`. SEC-5 420.
    - C:\Users\johns\projects\AIConnections-review\docs\spec\review\evidence\m0-report.md:47 (spike S4): `--mcp-config` takes a JSON string with an `Authorization` header, so the credential sits in claude's command line.
    - https://code.claude.com/docs/en/permissions#read-only-commands: "`ps aux` and `ps -ef` run without a prompt" in every mode, while `ps auxe` prompts because it prints the environment. So any claude soldier can read every same-user command line with no approval. On Linux, /proc/<pid>/cmdline is also readable by other local users.
    - `--mcp-config` also accepts a file (https://code.claude.com/docs/en/headless) and a `headersHelper` (https://code.claude.com/docs/en/mcp). But a file fails PO-3's own test at 172 ("a file only the owner can read is not enough").
    - SEC-5's test uses a soldier's own credential, so a stolen one passes it.
    - The Monarch-secret half of this finding is R-M1-1's.
    - v0.7: not fixed (PO-4 203-209, SEC-5 459 unchanged).
  reason: The gap is real: a credential on a command line is one unprompted `ps -ef` away from every other soldier, and on Linux from every local user. How far credentials must resist same-user readers is the same security-posture decision as R-M1-1 (B2, with D-4).
  options:
    - (a) A threat model (D-4) in which the credentials stop a confused or prompt-injected soldier that stays inside its CLI's permission checks, not one that runs arbitrary code. PO-3, PO-4, SEC-5 and ADR-0012's consequences are narrowed to match.
    - (b) Soldiers are isolated at the OS level (another user or a sandbox), so PO-4 and SEC-5 hold as written.
    - (c) Each credential stays off command lines wherever the CLI allows. codex's `thread/start` and grok's `session/new` already carry it over stdio. For claude, a probe picks between an owner-only `--mcp-config` file removed once the session has connected and a `headersHelper`. The rest is recorded as residual risk.
  big or technical: big (a trust boundary and an accepted residual). Whatever wins, apply this technical rule: "No soldier credential appears on any process's command line", with an X test beside SEC-2's that reads the command line of every process the post office starts.

- id: R-M1-2
  verdict: DECISION
  severity: P1 (as given)
  evidence:
    - Snapshot ARM-1 376 puts `cli`, `model` and `autonomy` in `shadow.config.json`, but says nothing about where the file lives or whether it is trusted. Also ARM-3 381, VER-5 506, SET-1 437.
    - v1, C:\Users\johns\projects\AIConnections-review\src\core\config.ts:41-46: the working directory's `shadow.config.json` wins over the shipped one.
    - Codex's draft, C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts:54 (`loadRoster(root)`) and :130-131 (the session's folder is a snapshot of HEAD).
    - C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts:384-391: on Windows a bare `claude` is looked up in the current folder before PATH, with PATHEXT. So a `claude.cmd` or `claude.exe` committed at the repository root runs instead of claude.
    - cmd.exe searches ".;%PATH%" by default (https://learn.microsoft.com/en-us/windows/win32/api/processenv/nf-processenv-needcurrentdirectoryforexepathw). Go's blog: "Windows systems continue to search dot first, no matter what PATH says" (https://go.dev/blog/path-security).
    - Claude Code refuses `auto` and `bypassPermissions` as `defaultMode` from a project's `.claude/settings.json` (https://code.claude.com/docs/en/permission-modes#which-mode-a-session-starts-in). A folder's `autonomy: full` passed as `--permission-mode bypassPermissions` does what the vendor refuses.
    - The 2.0 draft had this boundary (D9, POL-1, POL-2: C:\Users\johns\projects\AIConnections-review\docs\legacy\spec\shadow-army-2.0.md lines 69 and 1078-1079). Appendix A doesn't carry it over, and no ADR or settled item drops it.
    - Reading A (`cli` as a free-form command) is weak: CH-1 216 gives each CLI one adapter, and v1 and the draft treat `cli` as an adapter id (draft postOffice.ts:127).
    - v0.7: not fixed (ARM-1 405; WSP-10 covers only harness git's config).
  reason: The gap is real: on Windows the program lookup as built runs a repository's own `claude.cmd` at the army's first use, and a folder's config can raise autonomy up to bypassPermissions. The lookup is a technical defect; how far the folder's config and policy files are trusted is the owner's trust-boundary choice.
  options:
    - A, carry over 2.0's POL-1 and POL-2: the folder's `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` and `agent.md` (the last two go into every brief, SI-1) are hashed. A new or changed one shows a trust card before any soldier starts, and that card is the only way a folder raises autonomy above supervised.
    - B, `cli`, `model` and `autonomy` come only from the owner's own config outside the folder; the folder's files may only restrict.
    - C, trust the folder, and say so in D-4's threat model.
  big or technical: big (a trust boundary; under A, a new card the owner answers). Apply this technical rule whatever wins: "`cli` names one of the four adapters; any other value is refused at start. An adapter starts its CLI by an absolute path found on PATH alone: never the session's folder, the repository or a relative PATH entry, and on Windows the current folder is never searched." X test: a repository that commits `claude.cmd`, `claude.exe` and `claude` at its root runs none of them.

- id: R-M1-24
  verdict: CONFIRMED
  severity: P1 (as given)
  evidence:
    - Snapshot CH-7 253-255 says "Autonomy chooses only each vendor's documented flags" but gives no table. CH-2 221-226 passes no mode flag. 2.0's SAFE-10 (legacy line 1048) has no table either.
    - v1, C:\Users\johns\projects\AIConnections-review\src\adapters\claude.ts:13-22, always passes `--permission-mode`: supervised `plan` (`acceptEdits` when writing), auto `auto`, full `bypassPermissions`. Codex's draft, C:\Users\johns\projects\AIConnections-m1\src\v2\claude.ts:30, passes plan, auto or bypassPermissions.
    - https://code.claude.com/docs/en/permission-modes#which-mode-a-session-starts-in: the starting mode is taken from the flag first, then from `permissions.defaultMode` in a settings file, then from the built-in default.
      - "The other values apply from any settings file", so a `.claude/settings.json` committed in the snapshot can set `acceptEdits`.
      - For `claude -p` the built-in default is `default` in sessions that fetch feature flags, and `auto` in sessions that don't on v2.1.285 or later.
    - https://code.claude.com/docs/en/headless: "A run where nothing sets a permission mode takes the built-in starting permission mode, which can be `auto`, so pass the one you want".
    - `system/init` reports `permissionMode` (https://code.claude.com/docs/en/agent-sdk/typescript, SDKSystemMessage), so a contract test can check the mode.
    - v0.7: not fixed. The glossary's Autonomy entry (line 60) names the levels "as in v1" but gives no flags and no rule that one is always passed.
  reason: The gap is real: choosing flags is the only thing autonomy does, the spec never says which flags, and a level that passes none takes a repository's `defaultMode` or claude's `auto` default, so CH-7's U evidence has nothing to test.
  fix:
    - CH-7, new bullet: "Each adapter passes its CLI's permission mode on every start and resume, and never leaves it to a settings file or the CLI's own default. For claude, as in v1 (`src/adapters/claude.ts`): supervised `--permission-mode plan`, or `acceptEdits` for a writing turn (ARM-5, →M6); auto `--permission-mode auto`; full `--permission-mode bypassPermissions`. codex, grok and agy get their rows with their channels (CH-3 to CH-5, →M2)."
    - M1-AC5 adds: "Each autonomy level's arguments carry exactly its mode (U), and the recorded claude session's `system/init` reports it (C)."
    - Separate point (not this finding's claim): claude's plan mode lets its classifier approve shell commands whenever auto mode is available, and `useAutoModeDuringPlan` is on by default (https://code.claude.com/docs/en/permission-modes#analyze-before-you-edit-with-plan-mode). So supervised mapped to `plan` does not send every command to the owner. Mapping supervised to `default` instead would change what runs without the owner, which is a big question if anyone wants to raise it.

- id: R-M1-3
  verdict: CONFIRMED
  severity: P1 (as given)
  evidence:
    - Snapshot PO-1 164 gives what the lock holds and why the start time is kept, but no action. HOST-2 94 never defines "folder". M1-AC1 546 checks only the lock's contents. Settled decision 2 fixes only the contents too.
    - Codex's draft shows the ambiguity in practice: C:\Users\johns\projects\AIConnections-m1\src\v2\server.ts:25-36 writes only `{pid}`, refuses any existing lock, and tells the owner to remove a stale one by hand.
    - C:\Users\johns\projects\AIConnections-m1\src\workspace\git.ts:55-63 takes the folder as `git rev-parse --show-toplevel`.
    - D-2 option A (C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-2-option-A.md line 42) already expects the next use to wait while the mod's old post office closes, and to say so.
    - R-M1-26's ledger claim is the same as this one's core. R-F-16 overlaps it (the folder, a second session).
    - v0.7: not fixed (PO-1 191 unchanged).
  reason: The gap is real: the text says why the start time is kept but not what a start does with a stale, live, empty or unreadable lock, and the first implementation refuses every lock, so one crash leaves the army unable to start until the owner deletes a file.
  fix:
    - PO-1's "One per folder" becomes: "**One per folder.** The folder is the top level of the git working tree the session starts in. A lock there holds the post office's pid, its process start time and its port. The start time is the one the OS reports for that process, read the same way when the lock is written and when it is checked. A start that finds a lock reads it. The lock is stale when no process has that pid with that start time, or when the file is empty or can't be read. A stale lock is replaced, and the new post office's log says so; of two starts racing for it, only one wins. A live lock is never replaced or deleted. The start is refused, and the mod says why, as in `the army is already running in this folder (pid 4120, started 14:02)`. If the live lock is the mod's own post office still closing (PO-7), the mod says the army starts once it has exited. The mod learns the port only from the post office's standard output, never from the lock."
    - M1-AC1 adds three cases:
      - a stale lock, both with a dead pid and with a live pid that has another start time, is replaced and logged;
      - an empty lock is replaced and logged;
      - a live lock is refused with that message and left as it was.

- id: R-M1-8
  verdict: CONFIRMED
  severity: P1 (as given)
  evidence:
    - Snapshot PO-7 185-186 sets no stop first and no time limit. PO-1 168 sets no time between asking a CLI to exit and ending its tree. Restarts at PO-1 165 were set in the fix pass to 1 s, 5 s and 30 s, so one can fall due mid-shutdown. M1-AC1 546 tests only idle soldiers.
    - https://code.claude.com/docs/en/headless#background-tasks-at-exit: "After Claude finishes its turn and stdin has closed, a `claude -p` run can stay open to wait for background work"; Claude then "takes one more turn with the outcome".
    - https://code.claude.com/docs/en/tools-reference#time-limit-for-background-commands: 30 minutes by default under stream-json, up to a maximum of 2 hours.
    - On SIGTERM, claude leaves the turn "unfinished and records no result for it" (same headless page).
    - The mod's `session.end` has a 1.5 s bound (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts:10980). A `$.process.spawn` child is killed when the module unloads (same file, :3493), so a normal quit falls to containment.
    - After `/clear` (HOST-2 stops the army), a lapsed lease, or the watch firing after a Claude Code crash, the post office is still alive and, as written, can wait out a background command while it holds the lock.
    - Both D-2 drafts bound the shutdown the same way: D-2-option-A.md lines 29-38 and D-2-option-B.md lines 35-40. Codex's C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts:162-168 closes input, waits 2 s, then sends SIGTERM.
    - Overlaps R-F-11.
    - v0.7: not fixed (PO-7 212-214 adds only the event-stream bullet).
  reason: The gap is real: nothing bounds the time between asking a CLI to exit and ending its tree, so a claude soldier with a background command can keep working unwatched, and take one more paid turn, for up to two hours while its lock blocks the next start.
  fix:
    - PO-7, new bullet (both D-2 drafts agree on it): "**The shutdown,** whatever started it, for every soldier at once.
      - From then on no channel starts, restarts or resumes (PO-1, CH-9), and the post office never waits for background work.
      - Each running turn is stopped as a stop stops it, background work included (MSG-9, CH-10, →M2). A turn not ended 30 seconds after the stop has its CLI's process tree ended (PO-1).
      - Then each session closes through its CLI's own exit. A CLI that hasn't exited 10 seconds later has its whole process tree ended.
      - Each turn ended this way is finished as PO-8 says. Then the post office releases its lock and exits.
      - Until M2 brings CH-10, a running turn is not stopped first: closing its session cuts it short.
      - A post office that is ended outright, as when the mod unloads, leaves this to its containment (PO-1)."
    - M1-AC1 adds: "A fake that is mid-turn, keeps a child running and ignores the end of its input has both ended 10 seconds after the shutdown starts, and the post office then releases its lock and exits. A crash restart that falls due after the shutdown started starts nothing."

- id: R-F-11
  verdict: CONFIRMED
  severity: P1 (as given)
  evidence:
    - Snapshot PO-7 185-186.
    - CH-6 244: a request "stays pending ... until the owner answers it or stops its turn", and a shutdown is neither. CH-6 245 already counts a stop's cancellation as the owner's answer. SEC-3 418 forbids any answer without the owner.
    - ARM-6 393: "The turn's summary waits for the answer".
    - HOST-14 148: the only list of open decisions lives in the mod. PO-5 183 and PO-6 184 never say that a decision is recorded.
    - PO-8 202-206 does end a cut-short turn's message as interrupted, but says nothing about a card nobody can answer.
    - M3-AC12 631 assumes a restart that marks a dead post office's delivered messages as interrupted, but no requirement says so.
    - The finding's NEEDS-PROBE is settled for claude: "the SDK ends Claude Code's input before sending any signal, and Claude Code cancels the prompt as soon as the input ends", while SIGTERM "leaves the prompt unanswered" (https://code.claude.com/docs/en/headless#stop-a-run-with-sigterm). R-M1-8's time limit makes the answer moot for codex and grok.
    - D-2-option-A.md lines 33-36, 82 and 104 draft these exact changes.
    - Overlaps R-M1-8 (the time limit).
    - v0.7: not fixed (CH-6 273, SEC-3 457, ARM-6 423 unchanged).
  reason: The gap is real: the shutdown closes sessions whose open requests CH-6 says must stay pending, and the attribution card for an unexplained checkout change, which only the mod can show, is lost unrecorded while ARM-6 makes the turn's summary wait for an answer that can never come.
  fix:
    - Add to R-M1-8's shutdown bullet: "each queued message ends as not delivered, and the running turn's message as interrupted, each with the reason (MSG-4); each open approval request is closed as a stop closes it, and nothing is approved (CH-6); an attribution card raised then is not answered and doesn't hold up the shutdown, and its paths and hashes are recorded, marked unanswered (ARM-6)."
    - CH-6 244 adds: "or the post office shuts down (PO-7), which closes it as a stop does".
    - SEC-3 becomes: "No code path answers a vendor's approval request without the owner (CH-6, HOST-12), except the cancellation that closes it when the post office shuts down (PO-7). A stop's cancellation is the owner's answer. Neither approves anything (CH-6)."
    - PO-5 adds: "Each decision (HOST-14) is logged when it opens and when it closes, so a post office ended outright loses none."
    - PO-6 adds: "At the next start, a message still recorded as delivered ends as interrupted, with the reason `the post office stopped` (M3-AC12)."
    - §5.1 F adds: "the lease lapses, and the session ends, while an approval request, an attribution card and a queued message are open."
    - Whether the next session lists the previous one's unanswered decisions stays with H38 and D-11, which is big.

- id: R-M1-10
  verdict: DUPLICATE
  severity: P1 (as given)
  evidence:
    - Ledger claims (C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md):
      - R-F-10: "the post office dying is undefined: who notices or restarts it ... the lock, and what the owner sees", located at HOST-2, PO-1, M3-AC12 and §5.1.
      - R-F-30: a mod reload "meets a lock it can't command". The orchestrator chose D-12 (a) for it on 2026-10-15 (C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md).
    - The underlying gap is real:
      - HOST-2 94 starts the post office only "the first time the army is used in a session".
      - PO-7 186 exits on a lapsed lease while the mod may still live; D-2's prototype lapses the lease on every sleep under the as-built clock.
      - PO-3 171 makes a new secret each start.
      - M3-AC12 631 relies on a restart that no requirement defines.
      - HOST-8 130's "disconnection" toast gives no reason and no restart.
    - Ready text exists: D-2-option-A.md line 71 (HOST-2: "and again at the first use after it has shut down") and lines 41-42 (the transcript line, and the restart once the old lock is released).
    - v0.7: not fixed (HOST-2 103-104 adds only the interactive-session clause).
  reason: Every part of this finding is already claimed elsewhere: the restart after the post office ends while the mod lives, what the owner sees, and M3-AC12's undefined restart are R-F-10's, and a reloaded mod meeting a live lock is R-F-30's (D-12).
  fix: merge into R-F-10's fix; D-2 option A's HOST-2 line and its "What the owner sees" bullets are ready text, and D-12 (a) covers the reload.
