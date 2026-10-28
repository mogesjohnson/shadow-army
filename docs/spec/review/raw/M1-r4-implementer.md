# M1-r4-implementer: M1, round 4, implementer (spec-reviewer, Opus, high; 2026-10-28, session 15, fork1)

Ran on v0.20 (`v2@4f481fc.md`); prompt in `drafts/r4/PROMPTS.md`. Saved from the transcript with `drafts/v021/handback.mjs`. Ledger rows R-M1-235 to R-M1-245.

- severity: P1
  type: gap
  location: PO-2, PO-3 (v2@4f481fc.md:228, 230-233); §3 (97, 103-104); M1-AC1 (1049)
  claim: The mod sends every command and renewal, each carrying the Monarch's secret, through `$.http.fetch`. That call goes through the host's network stack, and the host follows proxy variables. The spec never says how these requests skip the proxy or an organization's fetch policy, so the secret may go off the machine in clear text and the lease may fail at every start.
  scenario: An enterprise owner has `HTTPS_PROXY=http://proxy.corp:8080` set, as Claude Code's docs recommend, and no `NO_PROXY`. Or a repository's own `.claude/settings.json` sets it in its `env` block. The mod renews with `fetch("http://127.0.0.1:<port>/…")` and the secret in a header. If the host proxies that request, the whole request, secret included, goes to proxy.corp in clear text and can land in the proxy's logs, which breaks PO-3's MUST NOT. The proxy then connects to its own 127.0.0.1 and fails. Every renewal fails, and the army stops 30 s after each start, showing the misleading reason `no renewal from the mod for 30 s`. Where an organization's web-fetch policy refuses loopback URLs, the army never runs, and no message says why. M1-AC1 can't catch either case: the fake `$.http.fetch` records the URL, not the connection the host opens.
  evidence: |
    - mod-api-2.1.294 `claude-code.d.ts` 3443-3448: "Fetches `url` through the host (never the plugin's own network) … unless the organization's web-fetch policy refuses it".
    - https://code.claude.com/docs/en/network-config: "Claude Code respects standard proxy environment variables". It "uses the first one that's set in the order `https_proxy`, `HTTPS_PROXY`, `http_proxy`, `HTTP_PROXY`". Only "WebSocket connections" are named as never sent through the proxy for `localhost`, `::1` and `127.0.0.0/8`. In a terminal session these variables are read "from every settings scope".
    - `d.ts` 7092: `http.fetch` is also a hook event, so another plugin sees every command and its secret. PO-3 240 and residual 1 name only `process.spawn`.
    - NEEDS-PROBE: whether `$.http.fetch` to `http://127.0.0.1` goes through `HTTPS_PROXY` or `HTTP_PROXY`, and whether a web-fetch policy can refuse it.
  fix: |
    decision:
    (a) The mod's commands go over `$.http.fetch`'s `socketPath`: a socket the post office makes under `.shadow/v2/`, readable only by the owner. No proxy carries it. Windows support needs a probe.
    (b) Keep TCP. The mod refuses to start the army, with a transcript line naming the variable, when a proxy variable is set (in its env or in `$.settings.read()`) and `NO_PROXY` doesn't cover the loopback address.
    (c) Run the probe first, then choose.
    Under any option, PO-3 240 and residual 1 also name `http.fetch` hooks.

- severity: P2
  type: gap
  location: PO-7 (v2@4f481fc.md:261, 263, 266, 274, 276); HOST-2 (115); M1-AC8 (1083)
  claim: PO-7 promises that when Claude Code ends, the post office closes each session through its CLI's own exit. But the host kills a mod's spawned child when the module unloads, and PO-7 names no rule for a termination signal. So a normal exit can be an outright kill, and the spec gives no defined way to finish the shutdown.
  scenario: |
    - The owner types `/exit`. The mod sends the release, and the post office begins its shutdown: up to 30 s for the stop, then 10 s for each CLI to exit. Within `session.end`'s 1.5 s budget, Claude Code exits and the module unloads, which kills the post office.
    - Reading A (the text as written): Node.js dies on SIGTERM or SIGHUP by default. No CLI exits through its own exit, the guardians kill every tree at once, and every next start runs PO-1's path for a post office that didn't close its channels. M1-AC8's "normal exit … as PO-7 says" fails live.
    - Reading B: the implementer adds a SIGTERM/SIGHUP handler as a fourth trigger. PO-7 263 doesn't list it, and 276 has no reason for it. On Windows, if the host uses TerminateProcess, nothing can catch it.
    - The same happens when the owner closes the terminal window: SIGHUP goes to the foreground process group, which may include the post office.
  evidence: |
    - `d.ts` 3492-3494: "leaving it, `return()` on the stream, `next.signal` aborting or the module unloading kills the child".
    - decisions.md line 58 records "a spawned child is killed when the module unloads" and the 1.5 s `session.end` bound.
    - https://nodejs.org/api/process.html#signal-events: SIGTERM, SIGINT and SIGHUP terminate Node.js by default.
    - PO-7 274 treats an outright end as the exception ("for example by Claude Code when the mod unloads").
    - NEEDS-PROBE: how the host ends a spawned child at exit (which signal, TerminateProcess, or not at all), and whether the child shares Claude Code's process group.
  fix: |
    decision, after the probe:
    (a) PO-7 263 adds "a termination signal (SIGTERM, SIGHUP) or, on Windows, a console close event" as a fourth trigger with the reason `Claude Code ended`. PO-7 states that where the host ends the post office outright, the exit is PO-16's path. M1-AC8 expects whichever applies.
    (b) The post office detaches from Claude Code's process group, so the host's kill reaches only what the probe shows.

- severity: P2
  type: ambiguity
  location: PO-3 Windows (v2@4f481fc.md:238); PO-9 (319); PO-19 (456); PO-1 (210-212); PO-16 (401-402, 408); PO-11 (342)
  claim: PO-3 lists only the rights the new process and thread DACLs deny, never the rights they grant. It also makes a thread-shaped DACL the token's default for every object created later, of any type.
  scenario: |
    - Reading A (the minimal build): the DACL grants the owner only SYNCHRONIZE. A second Claude Code session in the folder checks the lock. Reading the live post office's creation time needs OpenProcess with PROCESS_QUERY_LIMITED_INFORMATION, which is denied. Either the start treats the lock as stale and replaces a live one, breaking 212's "never deleted or replaced", or it refuses forever whenever a pid is reused by another protected process, such as another army's guardian. PO-16's sweep can't read a guardian's identity either.
    - Reading B: the owner's default rights less the listed ones. That works.
    - The token's default DACL is built from thread rights, but access bits mean different things on each object type. 0x0002 is THREAD_SUSPEND_RESUME on a thread, PROCESS_CREATE_THREAD on a process and FILE_WRITE_DATA on a file. So a file the post office creates where the folder's ACL has no inheritable entry grants no one write access. Guardians and CLIs started later may carry the same default DACL to every object a soldier creates.
    - R-M1-212's pending repair must name a Windows start-time source that works against this DACL. Node.js has none of its own, and PO-7's watch reads one every second.
  evidence: |
    - PO-3 238: "replaces its own process's DACL … with one that grants no one `PROCESS_VM_READ`, …" and "sets the default DACL of its token to it".
    - https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights: "When you call the OpenProcess function, the system checks the requested access rights against the DACL".
    - GetProcessTimes needs PROCESS_QUERY_(LIMITED_)INFORMATION (https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes).
    - NEEDS-PROBE: whether a child's primary token keeps the parent's TokenDefaultDacl.
  fix: |
    PO-3 names the grants:
    - process DACL: the owner's user and SYSTEM get `SYNCHRONIZE`, `PROCESS_QUERY_LIMITED_INFORMATION` and `PROCESS_TERMINATE`;
    - threads: `SYNCHRONIZE` and `THREAD_QUERY_LIMITED_INFORMATION`.
    The guardian sets its own token's default DACL back to the user's usual one before it creates the CLI. PO-5's folder ACL entries are inheritable (OI|CI). SEC-2 adds a case where a second post office reads a live one's start time.

- severity: P2
  type: gap
  location: PO-9 Windows (v2@4f481fc.md:319-321); PO-10 (336); PO-19 (455-456); PO-17 (418); compare PO-18 (437)
  claim: On Windows the spec never says what "the guardian's connection to the post office" is, how the CLI's program, arguments and environment reach the script, or how the CLI's stdin, stdout and stderr pass alongside the control channel. Linux has "its pipe", and macOS has a loopback connection with a one-time nonce.
  scenario: |
    - Reading A: control commands share the script's stdin with the CLI's input. Then "byte for byte" (PO-9 321) needs a framing scheme the spec doesn't give.
    - Reading B: a named pipe or a loopback port that the post office opens. Another process of the owner, such as a running soldier, can connect first and play the guardian ("started", "exited") unless a nonce like macOS's is required, and the spec requires none for Windows.
    - Passing the CLI's command on the script's own command line adds PowerShell's argument parsing as a third parser, which CH-1's escaping "for both `cmd.exe` and the program's own parser" doesn't cover.
    - Codex's M1 draft had to invent a named pipe and a token.
  evidence: |
    - PO-19 455: "When its connection to the post office closes without a close command, it ends the job". No connection is defined.
    - PO-18 437 defines macOS's channel and nonce.
    - `AIConnections-m1/src/v2/processTree.ts` 455-471: Codex's draft invented a named pipe plus a token.
    - NEEDS-PROBE: whether Windows PowerShell 5.1 can use an extra pipe that Node.js passes as fd 3 (libuv passes these through the C runtime's `lpReserved2`).
  fix: |
    PO-19 adds: "The post office starts the script with one JSON line on its standard input: the operation, the CLI's program, its command line as CH-1 escapes it, its working directory and a one-time nonce. The script connects back over the loopback address with that nonce, as PO-18's guardian does, and that connection is the one PO-10 watches. The CLI's standard streams are the script's own, passed by handle." M1-AC20 gets a Windows nonce case.

- severity: P2
  type: gap
  location: PO-5 (v2@4f481fc.md:253-254)
  claim: On Windows, nothing Node.js provides can do PO-5's checks: the folder's owner, "another reparse point", or creating and narrowing an ACL with inheritance off. And no named, path-safe program does them either.
  scenario: |
    - Reading A: the implementer adds a third operation to the PowerShell script. PO-19 lists only the guardian and DACL operations, and nothing gives the new operation a checksum, a language-mode check or a time limit.
    - Reading B: the implementer runs `icacls` or `takeown` by name. libuv's Windows search tries the child's working folder before `PATH`, so a committed `icacls.exe` in the folder runs. Appendix D row 9 calls that "prevented".
    - libuv's lstat flags only symbolic links and junctions, so another reparse point passes as a plain folder.
    - When Claude Code runs elevated, new folders are owned by BUILTIN\Administrators, the elevated token's default owner. "Owned by the owner's user" then fails at every later non-elevated start, and no soldier starts.
  evidence: |
    - PO-5 253: "creates the two folders with inheritance off and an ACL that grants only …".
    - PO-5 254: "must be owned by the owner's user", "not … another reparse point".
    - PO-19 455-456 lists the script's two operations.
    - libuv `src/win/process.c` `search_path` comment: a bare filename is searched in the current directory first.
  fix: |
    PO-19 adds an operation the post office runs before it writes anything, checksummed as in PO-13. It reads each folder's owner and reparse attribute, and creates or narrows its ACL with inheritable entries for the owner's user, SYSTEM and Administrators. PO-5 says whether a folder owned by Administrators counts as the owner's when the owner's user is a member. M1-AC2 adds an elevated case.

- severity: P2
  type: gap
  location: PO-16 (v2@4f481fc.md:407); M1-AC16 (1131)
  claim: The mod is to end the dead post office's trees "through the same code as the sweep". But a hooks module has no Node.js, and on macOS the trees can be ended only through the helper, which PO-17 lets only the post office run.
  scenario: |
    - Reading A: the mod starts a Node.js process running the post office's code in a sweep-only mode. That process is in neither HOST-2 120 nor PO-1. Does it take the lock? Can it race the next post office's own sweep? Does it check the helper's checksum (PO-13 366)?
    - Reading B: the mod rebuilds the sweep with `$.process.run` (for example `/bin/kill`). That isn't "the same code", and on macOS it must run the helper's stop and kill by audit token without PO-13's checksum.
    - M1-AC16 passes with a fake mod either way, because the fake has Node.js.
  evidence: |
    - `d.ts` 19-20: "A hooks module runs in an environment of its own: no DOM, no Node."
    - PO-17 417: "As a tool the post office runs: … stop and kill, by their audit tokens".
    - PO-13 366: "The post office checks each file against it before each run."
  fix: |
    PO-16 407 becomes: "the mod runs the package's sweep as a one-shot Node.js process (found as HOST-2 says) that takes no lock, opens no port, reads no secret, checks each file's checksum as PO-13 says, and ends only trees whose post office isn't running; PO-17's tool operations may be run by it". M1-AC16 runs the case with the real sweep process.

- severity: P2
  type: gap
  location: ARM-7 (v2@4f481fc.md:736-741); WSP-11 (792); HOST-2 (116); M1-AC13 (1109-1117); R-M1-207's repair
  claim: R-M1-207's chosen repair, "`sa live` starts its own post office with no lease, notices to its terminal", must also cover the trust card. In M1 only `sa live` opens a session, it has no `$.ui.ask`, and ARM-7 741 forbids any flag that accepts a file.
  scenario: |
    This repository has its own `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` and `agent.md` at its top level, and the trust record is new. `sa live` opens Iron. Its post office raises the card, but no dialog can show it.
    - Reading A: no session ever opens there, so M1-AC8's live `sa live` run can't happen in this repository.
    - Reading B: `sa live` asks in its terminal. The prompt, the exact answer and what a dismissed prompt means are undefined, and M1-AC13 doesn't test it.
    Meanwhile the mod's own post office opens no session in M1 (WSP-11: "`/army` opens none"). So M1-AC13's "no session opens until the answer" only observes the M3 path.
  evidence: |
    - ledger R-M1-207: "(b)+(c) chosen … Fix pending (v0.21): HOST-2, PO-7, M1-AC8". It names no ARM-7.
    - ARM-7 738: "Claude Code's own question dialog (the mod API's `$.ui.ask`)".
    - ARM-7 741: "No setting, flag, environment variable or file … accepts a policy file".
  fix: |
    R-M1-207's repair adds to ARM-7: "`sa live` shows the same rows in its terminal and asks the same question, with `Not now` first; only the typed answer `Trust these files` accepts, and end of input, or anything else, accepts nothing". M1-AC13 gets an `sa live` case.

- severity: P2
  type: ambiguity
  location: PO-5 (v2@4f481fc.md:251, 254); CH-2 (496, 504)
  claim: The log names have no defined format, and the soldier log's name depends on a session id that claude reports only after it starts. Yet the instructions and settings files must already sit "beside the session's log" before the process starts.
  scenario: |
    - On Windows with npm's `claude.cmd`, CH-2 504 writes the instructions file beside the session's log before claude's `system/init` gives a session id. Reading A: the adapter passes claude's `--session-id <uuid>`, so the id is known in advance. Reading B: Shadow Army uses an id of its own and keeps claude's id apart, which changes what CH-9 resumes from M2.
    - "Named by its start time" has no format. An ISO time with `:` can't be a Windows file name. At one-second precision, M1-AC1's two racing starts get the same log name, PO-5's `O_EXCL` fails for one of them, and that may be the winner. The winner then runs with no log: "the log says so" fails, and PO-1 has nothing to recover from.
  evidence: |
    - PO-5 251: "one file per soldier session, named by the soldier and the session id, and one per start of the post office, named by its start time".
    - PO-5 254: "creates each file it writes there new … `O_EXCL`".
    - https://code.claude.com/docs/en/cli-reference: "`--session-id` | Use a specific session ID for the conversation (must be a valid UUID)".
  fix: |
    PO-5: "A session's id is a UUID the post office makes before the CLI starts, passed to claude as `--session-id`. A post office's log is named `po-<UTC start time as YYYYMMDDTHHMMSS.mmmZ>-<pid>.jsonl`, and a soldier's `<soldier>-<session id>.jsonl`."

- severity: P3
  type: gap
  location: PO-7 (v2@4f481fc.md:266, 276)
  claim: The release names only the army's id, but the shutdown's reason (`the owner logged out` or `Claude Code ended`) comes from `session.end`'s reason, which the post office never receives.
  scenario: At `/logout`, the post office can't tell it from `prompt_input_exit`, so it logs `Claude Code ended` or guesses.
  evidence: PO-7 266 says the release "names the army's id". PO-7 276 lists both reasons.
  fix: "sends a release that names the army's id and `session.end`'s reason".

- severity: P3
  type: untestable
  location: PO-2 (v2@4f481fc.md:228); M1-AC1 (1049)
  claim: "Any other address is refused at start" and M1-AC1's "refuses `0.0.0.0`" imply an input that names the address, but no setting, flag or variable names it, and PO-21 forbids a shipped switch.
  scenario: Reading A: the implementer adds an undocumented `--host` option, a setting no section lists. Reading B: a unit test calls the bind function with `0.0.0.0`.
  evidence: PO-2 228; PO-21 474: "no shipped file holds a switch that turns a fault on".
  fix: "The bind address is fixed (127.0.0.1, or ::1 where IPv4 loopback is missing); a unit test gives the bind function `0.0.0.0` and it refuses."

- severity: P3
  type: editorial
  location: PO-3 (v2@4f481fc.md:240); Appendix D residual 1 (1815)
  claim: Other plugins' hooks reach further than the residual says. An `http.fetch` hook sees and can change every command, secret included. A `clock.every` hook that refuses one period ends the mod's renewal timer, so the army stops 30 s later.
  scenario: A plugin that throttles timers refuses one period of the mod's 10 s renewal. The army shuts down with `no renewal from the mod for 30 s`.
  evidence: `d.ts` 7092 (`'http.fetch'` hook); `d.ts` 3430-3431: "a refused period ends the interval".
  fix: Name `http.fetch` and `clock.every` hooks beside `process.spawn` in PO-3 240 and residual 1.

Coverage: HOST-1, HOST-2; PO-1, PO-2, PO-3, PO-5, PO-7, PO-9 to PO-21; CH-1, CH-2, CH-7; SI-1 to SI-3; ARM-1, ARM-3, ARM-7; WSP-8, WSP-10, WSP-11; SEC-1, SEC-2, SEC-4, SEC-6; VER-1 to VER-3, VER-5 to VER-9; M1-AC1 to M1-AC22; the frame (§0 to §3), §5.1, Appendix D. Checked against ledger rows R-M1-1 to R-M1-234 and the mod-api-2.1.294 typings.

Sources:
- https://code.claude.com/docs/en/network-config
- https://code.claude.com/docs/en/cli-reference
- https://nodejs.org/api/process.html#signal-events
- https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights
- https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes
- https://learn.microsoft.com/en-gb/windows/win32/api/securitybaseapi/nf-securitybaseapi-duplicatetokenex

Files read: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@4f481fc.md; C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts; C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md; C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md; C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts (grep only).