Unit M1, round 2, test author, on v0.11 (v2@af97372.md), 2026-10-20

- severity: P2
  type: untestable
  location: SEC-1, PO-2, M1-AC1 (v2@af97372.md:724, 216, 911)
  claim: SEC-1 promises that no listening socket at all is reachable off loopback, and PO-2 names the port the macOS guardian connects back to (PO-18), but M1-AC1 only checks the post office's main bind and a refused `0.0.0.0`, so no M1 test can fail a guardian listener that binds every interface.
  scenario: The implementation opens the guardian callback listener with `server.listen(port)` and no host. Node then listens on `::`, or on `0.0.0.0` without IPv6. Every M1 AC still passes, because M1-AC1 checks the main port and M1-AC15/16/20 check only the helper, yet a nonce-guarded port is reachable from the network.
  evidence: SEC-1 "A test proves that no listening socket is reachable on a non-loopback address (PO-2)"; PO-2 "That includes the port a macOS guardian connects back to (PO-18)"; M1-AC1 "It binds only the loopback address and refuses `0.0.0.0` with an error". Node's default: https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback ("If host is omitted, the server will accept connections on the unspecified IPv6 address (::)…").
  fix: Add to M1-AC1: "While a soldier is open on each system, the test lists every socket the post office listens on (the guardian's callback port on macOS included) and finds each bound to 127.0.0.1 or ::1 only."

- severity: P2
  type: untestable
  location: WSP-8, M1-AC2 (v2@af97372.md:693, 923)
  claim: WSP-8 runs `redact()` on every event the post office sends the mod, but M1-AC2 checks only logs, and WSP-8's unit test exercises `redact()` itself, so no M1 test fails when the event stream isn't redacted.
  scenario: `redact()` is called only in the log writer. A fake claude streams `ghp_abcdefghijklmnop1234` as text. The event that reaches the mod, and the transcript row the mod draws from it, carry the token whole. M1-AC2 (logs), M1-AC12 (placeholders) and WSP-8's unit cases all pass.
  evidence: WSP-8 "and on every event the post office sends the mod, where each streamed fragment is redacted on its own … So the mod never redacts"; M1-AC2 "Each kind `redact()` matches, written to a log, appears nowhere in it"; WSP-8's evidence is U only.
  fix: Add to M1-AC2: "Each kind, in a fake claude's text, tool call and error, reaches the mod's event stream as `[redacted]`, one fragment at a time (WSP-8)", and add I to WSP-8's evidence codes.

- severity: P2
  type: untestable
  location: SEC-6, M1-AC12 (v2@af97372.md:729, 961)
  claim: SEC-6 covers every Cc and Cf character, but M1-AC12 tests one ESC, one bidirectional control and one zero-width character, so a filter that misses C1 controls or characters outside the Basic Multilingual Plane passes.
  scenario: The mod escapes only U+001B, U+200B to U+200F and U+202A to U+202E (or uses a JS regex without the `u` flag). A soldier's text holding U+009B (CSI, a Cc that some terminals act on) or Unicode tag characters U+E0041… (Cf, invisible, readable by a model) reaches the transcript raw, and reaches Claude raw. M1-AC12 passes.
  evidence: SEC-6 "each character of Unicode's control (Cc) and format (Cf) categories, except newline and tab … A test draws a line holding each kind"; M1-AC12 "holding ESC, a bidirectional control and a zero-width character".
  fix: M1-AC12: "Text holding every Cc and Cf code point but newline and tab, generated from the Unicode database (C1 controls such as U+009B, U+00AD, U+FEFF and the tag characters U+E0000 to U+E007F included), shows only placeholders…"

- severity: P2
  type: gap
  location: ARM-7 The trust card, M1-AC13 (v2@af97372.md:673-675, 963)
  claim: `$.ui.ask` can resolve to free text typed under the dialog's "Other", and ARM-7 gives no outcome for an answer that is neither `Trust these files` nor `Not now`, so the gate that raises a soldier to `full` has an input no test covers.
  scenario: The owner types `wait` under Other. An implementation written as `if (answer !== "Not now") accept()` records the hashes and opens the soldier at `full`. Every M1-AC13 case passes (Not now, dismissed, rejected, Trust).
  evidence: ARM-7 lists only "`Trust these files` accepts…" and "`Not now`, a dismissed dialog, or a dialog that can't open accepts nothing". The mod typings (mod-api-2.1.294/claude-code.d.ts, `ui.ask`) say it "resolves to the label they chose, or the text typed under 'Other' … (so compare it with the labels exactly)".
  fix: ARM-7: "Only an answer that is exactly `Trust these files` accepts. Any other answer, text typed under Other included, accepts nothing, as `Not now`." M1-AC13: add "an answer typed under Other starts nothing".

- severity: P2
  type: untestable
  location: CH-1, M1-AC10 (v2@af97372.md:464, 949)
  claim: CH-1 forbids finding the CLI through a relative `PATH` entry, but M1-AC10 plants binaries only in the repository root and the snapshot with an absolute-only `PATH` (VER-5), so a resolver that honours relative entries passes.
  scenario: The owner's `PATH` has `.` or `node_modules/.bin`. The adapter resolves `claude` with an ordinary PATH walk from the snapshot's working directory and runs the snapshot's committed `node_modules/.bin/claude`. M1-AC10 passes, because its `PATH` holds no relative entry.
  evidence: CH-1 "never through a relative `PATH` entry"; VER-5 "puts `test/fakes/` first on `PATH`, as an absolute path"; M1-AC10's last bullet "the CLI and git come from `PATH`". WSP-10 applies the same rule to git (705).
  fix: M1-AC10's last bullet: "…and with `.` and `node_modules/.bin` on `PATH` ahead of `test/fakes/`, the CLI and git still come from the first absolute entry."

- severity: P2
  type: contradiction
  location: WSP-10, M1-AC10, §5.1 X (v2@af97372.md:701, 944, 816)
  claim: WSP-10 turns off "each hook event the command can fire", and §5.1 X plants "every hook … as files and in the config", but M1-AC10 plants only `post-checkout`, `post-commit` and `reference-transaction`, so an implementation that turns off just those three passes.
  scenario: A config hook `[hook "x"] event = post-index-change` (or `pre-auto-gc`, which a commit's auto gc fires) runs when the snapshot is made, because the implementation sets `hook.<event>.enabled=false` for the three tested events only. M1-AC10 passes; §5.1 X's test, as written, would fail.
  evidence: WSP-10 "`hook.<event>.enabled` is false for each hook event the command can fire"; §5.1 X "with every hook present, as files and in the config"; M1-AC10 bullet 1's three events. https://git-scm.com/docs/git-hook: `hook.<event>.enabled` "When set to `false`, no hooks fire for that event".
  fix: M1-AC10 bullet 1: "every event githooks(5) lists is planted, as a file in `hooks/` and as a config hook with a friendly name, and the git commands the post office runs fire none of them."

- severity: P2
  type: gap
  location: PO-16 The record (v2@af97372.md:376-380)
  claim: "The CLI doesn't start until its entry is written" gives no outcome for an entry that can't be written, or for a Linux listing line that fails to append mid-session, so no fault test has an expected result.
  scenario: `.shadow/v2/trees/` is unwritable (disk full). Reading A: the start never shows a sign of life, counts as a crash (PO-1 205), and restarts three times. Reading B: containment isn't ready (PO-9 304), so the soldier is down with no restart (PO-15). A later failed append leaves a writer unrecorded, so after a dead post office the sweep (385) never ends it, with nothing logged. Compare WSP-11 720, which defines this case for the baseline.
  evidence: PO-16 "The CLI doesn't start until its entry is written"; "added as the post office lists it"; no M1 AC and no §5.1 F line covers it.
  fix: PO-16: "If the entry can't be written, the CLI doesn't start, the containment has failed (PO-15), and the soldier's log and one transcript line say why. A listing line that can't be added is reported as PO-5 says for logs." Add a case to M1-AC18.

- severity: P2
  type: untestable
  location: PO-13, M1-AC18 (v2@af97372.md:345, 988-989)
  claim: PO-13 refuses a helper that changes under a running post office, but M1-AC18 only fails the check at start or reconnect, and nothing defines the outcome when a later run is refused (a new session, or a macOS helper run as a tool).
  scenario: The check passes and soldier A runs. `npm update` replaces `sa-contain`, then soldier B starts. PO-14's check doesn't rerun, since only a failure triggers it (348), and PO-13 refuses the run. Is B a crash (restarted), a failed containment (down), or shown PO-14's "doesn't match" message? On macOS, a listing or sweep tool run is refused mid-turn with no defined effect. No AC exercises any of this.
  evidence: PO-13 "The post office checks each file against it before each run … for example after Shadow Army was updated under a running post office"; PO-14 348 "again before a soldier is reconnected or started after a failed check".
  fix: PO-13: "A run refused for its checksum is a failed containment (PO-15) and gives PO-14's message." Add to M1-AC18: "the helper replaced after a passed check, then a second soldier started".

- severity: P2
  type: contradiction
  location: M1-AC1 bullet 9 (v2@af97372.md:920); PO-7 (263), PO-10 (309-310, 318)
  claim: M1-AC1 wants a fake that ignores the end of its input, and its child, "ended within 10 seconds", but PO-7 and PO-10 only begin the kill 10 seconds after the exit request, with SIGTERM at 9.5 s on POSIX and none on Windows.
  scenario: On Windows the fake ignores the closed input and the kill starts at 10.0 s, so the tree ends after 10 s and the AC fails for a correct implementation. On POSIX it holds only if the fake honours SIGTERM. Bullet 2 ("ended 10 seconds later") and bullet 10's lease case have the same 10-versus-20-second gap.
  evidence: PO-7 "Once the CLI has exited, or 10 seconds after it was asked to, the post office ends its whole process tree"; PO-10 "The tree is empty within 10 seconds after the kill began".
  fix: M1-AC1 bullets 2, 9 and 10: "…its tree kill begins 10 seconds after the exit request (SIGTERM first at 9.5 s on Linux and macOS), and the tree is empty within 10 seconds after that."

- severity: P2
  type: untestable
  location: M1-AC1 bullet 1, PO-1 (v2@af97372.md:912, 201)
  claim: "Two starts racing on one stale lock end with one post office" names no controlled order, so a test of two real starts rarely hits the window, and a lock that isn't replaced atomically passes.
  scenario: An implementation does read lock → stale → unlink → write, with no exclusive create. Two starts in a CI test seldom interleave between the read and the write, so the test passes, yet two post offices can serve one folder.
  evidence: PO-1 "of two starts that find the same stale lock, only one wins"; M1-AC1 gives a fake clock and a fake `$` but no seam for ordering file operations.
  fix: M1-AC1: "…with the second start's lock read and replacement forced between the first start's read and its replacement (a controlled file-system seam), and in the reverse order: each order ends with one post office, and the loser gets the live-lock message."

- severity: P2
  type: contradiction
  location: VER-6, PO-17, M1-AC20 (v2@af97372.md:868, 400, 408, 995)
  claim: VER-6 measures the helper's C "on a build … instrumented for coverage, run by the same tests", but an instrumented helper writes coverage files and makes system calls that PO-17 forbids and that the Linux trace "in every containment test" fails on.
  scenario: Reading A: the instrumented helper runs the containment tests under the syscall trace. Its `open(O_CREAT)` and `write` of `.gcda` files break PO-17's "create or write a file" rule, and the test fails. Reading B: the trace is off for the coverage run, so the tests aren't "the same". Also, a SIGKILLed guardian (M1-AC16) and the check's probe, always "killed with no grace" (PO-14 352), never flush coverage, so their lines always read uncovered.
  evidence: VER-6 "measured on a build of the same source instrumented for coverage, run by the same tests"; PO-17 "MUST NOT … create or write a file"; "the tests trace the helper's own system calls in every containment test, and fail on any call outside an allowlist".
  fix: VER-6: "The instrumented build runs the containment tests in a pass of its own. The syscall trace and the import check apply to the shipped build only. Coverage files go only under a folder the test names. Lines reached only on a path that ends by SIGKILL are measured by a test that ends that path normally, or are listed on the PR." Or decision: (a) a separate pass; (b) the helper's coverage counted from unit tests of its C alone.

- severity: P2
  type: gap
  location: CH-2 Error kinds, §5.1 C, M1-AC4 (v2@af97372.md:477, 790-792, 925, 929)
  claim: CH-2 reads the refusal "from the field claude's recordings show", and M1-AC4's fake copies its frames from §5.1 C's recordings, but §5.1 C requires no refusal recording, because a refusal isn't one of CH-1's error kinds.
  scenario: No recording holds a refusal, so the fake's refusal frame is invented. The adapter and the fake agree on an invented field, M1-AC4's "a refusal as a refusal" passes, and a real claude refusal reads as answered or as another error.
  evidence: §5.1 C "one session for each error kind of CH-1 that the CLI can be made to produce"; CH-1 "A refusal is not an error"; CH-2 "A refusal is read from the field claude's recordings show". Whether claude's `result` carries the API's `stop_reason: "refusal"` (https://docs.claude.com/en/docs/test-and-evaluate/strengthen-guardrails/handle-streaming-refusals) is NEEDS-PROBE.
  fix: §5.1 C: "for claude, a turn the model refuses; where none can be produced on purpose, a turn built from the API's documented `refusal` stop reason, marked synthetic in its fixture."

- severity: P2
  type: untestable
  location: CH-2 A turn's own figures, M1-AC3 (v2@af97372.md:480-484, 924)
  claim: CH-2's baseline rules for a zero `total_cost_usd`, for `/clear`, `/reset` or `/new`, and for a falling total are checked by no M1 AC and by no §5.1 C recording. CH-2's codes are C and L only, so the trace script passes on M1-AC3 alone.
  scenario: An adapter that always subtracts the previous result passes M1-AC3, a three-turn session with no reset. After `sa live` sends `/clear`, the next turn's cost comes out negative or double-counted, and a zero-cost result becomes a baseline.
  evidence: CH-2 "A result whose `total_cost_usd` is zero is never a baseline…"; "claude starts its totals over after a message that is `/clear`…"; M1-AC3 tests only that "the three turns' figures add up".
  fix: Add U to CH-2's evidence, and to M1-AC3: "unit cases, from recorded frames, for a zero-cost result followed by a costed one, a `/clear` turn, and a total below the baseline give each turn's figures as CH-2 says."

- severity: P2
  type: untestable
  location: WSP-11 guard scope, M1-AC11 (v2@af97372.md:720, 954)
  claim: WSP-11 keeps the guard open past the end event both for a reported background task and for a process that joined the tree, but M1-AC11 tests only the process branch.
  scenario: A fake claude emits `task_started` for a background subagent (it runs inside claude's own process, so no new process joins the tree), then `result`, then edits a checkout file, then `task_notification`. An implementation that tracks processes only closes the guard at `result`, and the write goes unguarded. M1-AC11 passes.
  evidence: WSP-11 "stays open past the end event while a task the turn started is running (claude's `task_started` with no `task_notification` for it yet), or while a process that joined…"; M1-AC11 bullet 4 covers "a child it starts in the background" only.
  fix: Add to M1-AC11: "a fake that reports `task_started`, sends its `result`, then writes a checkout file before its `task_notification`, fails that turn, and its next message waits for the notification."

- severity: P2
  type: untestable
  location: HOST-2, §5.1 C, M1-AC9 (v2@af97372.md:109-111, 796, 942)
  claim: HOST-2 cites C evidence, and §5.1 C requires "a soldier session with the mod installed", but no M1 AC replays or checks that recording. M1-AC9 uses a fake `$`, so only the fake's own assumption tests the rule that a soldier's mod registers nothing.
  scenario: The mod registers `/army` at module load instead of after `session.start` reports `isInteractive`. M1-AC9's fake passes or fails depending on how it orders the calls, and nothing checks a real claude soldier's `system/init` tools and slash commands for the mod's entries. The trace script passes on M1-AC1's tests naming HOST-2.
  evidence: §5.1 C "for claude, a soldier session with the mod installed (HOST-2)"; HOST-2 "(M1; I, C, L)"; the typings (`SessionStartInput.isInteractive`, "false for a `-p` run") support the fake's input, not the mod's behaviour.
  fix: Add to M1-AC9: "a contract test replays the recorded soldier session with the mod installed, and its `system/init` lists none of the mod's tools or commands."

- severity: P2
  type: gap
  location: PO-14 The check (v2@af97372.md:348)
  claim: The check must run "within 10 seconds", but nothing says what happens when it doesn't finish in time, and PO-14's messages include no timeout case.
  scenario: On a cold Windows arm64 runner, PowerShell 5.1's start plus `Add-Type` takes 12 s. Reading A: the post office waits, and soldiers sit in starting. Reading B: the check fails, but with which message? A test author has no expected result and no fake clock to write it against.
  evidence: PO-14 "checks containment on the machine as it is then, within 10 seconds"; the four example messages name no timeout.
  fix: PO-14: "A check that hasn't passed 10 seconds after it began has failed, and its message names the step that was still running." Add to M1-AC18: "a test build whose check step hangs fails it at 10 seconds, on the post office's monotonic clock."

- severity: P2
  type: untestable
  location: PO-9 At start (v2@af97372.md:304)
  claim: "A session whose containment isn't ready within 10 seconds … doesn't start its CLI. Anything already started is ended" has no AC, and no fake clock or controlled delay is named for it. M1-AC15 tests only the macOS coalition that isn't new.
  scenario: An implementation awaits guardian readiness with no timeout. A guardian stuck on start (for example, launchd slow to start the job) leaves the soldier starting forever, and every M1 AC passes.
  evidence: PO-9's at-start sentence; M1-AC15 bullet 5 is macOS-only and covers the coalition case only.
  fix: Add to M1-AC15: "on each system, a test build whose guardian doesn't report ready starts no CLI, its guardian is ended, and the soldier is down with PO-15's error 10 seconds after the start began."

- severity: P2
  type: ambiguity
  location: ARM-7, M1-AC13 bullet 2 (v2@af97372.md:670-671, 964)
  claim: "A crash restart while a file is untrusted waits for the card" doesn't say whether the restart raises the card itself (a dialog with no use behind it) or waits for the next use, nor what the soldier shows and how PO-1's restart count treats the wait.
  scenario: The owner edits `agent.md`, then soldier Iron crashes. Reading A: the 1-second restart opens `$.ui.ask` mid-conversation at once. Reading B: Iron sits waiting with no dialog until the next `/army`. ARM-7's "the use that needed it, say why" has no use to report to. The test can't assert either.
  evidence: ARM-7 "a restart (PO-1) … included … The soldier's log, and the use that needed it, say why"; "the next use shows the card again".
  fix: decision: (a) a restart that finds an untrusted file raises the card at once, and is not counted as a crash; (b) it waits, not counted, the soldier shows not running with the reason in its log, and the card shows at the next use.

- severity: P2
  type: ambiguity
  location: PO-1 What a crash is, M1-AC4 (v2@af97372.md:205, 933)
  claim: The startup bound uses `MCP_TIMEOUT` "unless the owner set it", but doesn't say where the post office reads it, and Claude Code also takes it from the `env` block of settings files, which the post office never sees.
  scenario: The owner sets `"env": {"MCP_TIMEOUT": "120000"}` in `~/.claude/settings.json`. claude waits up to 120 s for MCP servers, while the post office computes 30 + 30 s from its own environment and restarts a healthy soldier as crashed. M1-AC4's "5 s inside its startup bound" can't be written without knowing the bound's source.
  evidence: PO-1 "the wait is `MCP_TIMEOUT`, 30 seconds unless the owner set it"; settings `env` applies to every session (https://code.claude.com/docs/en/settings). Whether claude's `initialize` answer waits on MCP connection is NEEDS-PROBE.
  fix: PO-1: "…`MCP_TIMEOUT` as the post office's environment gives it, else 30 seconds; a value set only in a settings file is not seen, and the adapter passes the post office's value in claude's environment." Or decision on reading the settings files.

- severity: P2
  type: ambiguity
  location: PO-3, M1-AC2 (v2@af97372.md:220, 923)
  claim: "The first refusal is reported in full; after that, at most one report a minute, with the count" names neither where a report goes (log, event, transcript) nor whether a burst's count is reported if no refusal follows, and M1-AC2 names no fake clock.
  scenario: 1,000 refusals arrive in one second, then none. Reading A: a timer reports "999 more" a minute later. Reading B: the count waits for the next refusal and is never reported. A test asserting either, in the log or the transcript, fails the other implementation.
  evidence: PO-3's sentence; M1-AC2 "1,000 refused requests give one full report, then one a minute with the count".
  fix: PO-3: "…reported in the post office's log and as one transcript line; the refusals that follow within the minute are reported with their count once the minute ends, on the monotonic clock." M1-AC2: "on a fake monotonic clock".

- severity: P3
  type: untestable
  location: M1-AC1 intro, bullets 4 and 6 (v2@af97372.md:911, 915, 917)
  claim: "Tests of the lock, the lease and the watch use … a fake monotonic clock" covers bullets that only make sense on a real clock in a real child process: SIGSTOP for 40 s, and an unread stdout pipe whose synchronous writes on Windows would stall the event loop.
  scenario: With a fake clock, a blocked event loop never shows, and the lease "ends on time" for a post office whose writes block. The SIGSTOP case likewise measures nothing.
  evidence: M1-AC1 911 versus 915 ("a real post office stopped with SIGSTOP") and 917 ("while nothing reads its standard output").
  fix: "Tests of the lease's arithmetic use a fake monotonic clock; the SIGSTOP and unread-output cases run a real post office on its real clock."

- severity: P3
  type: untestable
  location: M1-AC4 bullet 8, M1-AC15 bullet 3 (v2@af97372.md:933, 973)
  claim: The silent-for-10-minutes case and the 55-second `initialize` answer name no fake clock, and "SIGTERM 9.5 seconds after" and "killed at 10 seconds" give no tolerance on real-time native runs.
  scenario: Either a CI job waits 10 real minutes on each system, or a slow macOS runner sends SIGTERM at 9.7 s and fails a correct build.
  evidence: The AC lines as quoted.
  fix: M1-AC4 bullet 8: "on a fake clock". M1-AC15 bullet 3: "SIGTERM no earlier than 9.5 s and before the kill; the kill no earlier than 10 s and within 1 s after it".

- severity: P3
  type: untestable
  location: various (v2@af97372.md:200, 240, 339, 360, 382, 413, 650, 711, 720)
  claim: Some M1 clauses have no AC that observes them, though each is checkable with a fake.
  scenario: An implementation that omits any of these passes M1:
    - PO-1's "port only from standard output" (a lock with a wrong port);
    - PO-5's count of lost lines and its 100 ms retry;
    - PO-12's "untested macOS version" log line;
    - PO-14's log on a pass;
    - PO-16's entry removed after the tree ends;
    - PO-18's nonce file removed once the guardian connects;
    - ARM-3's soldier with no default name taking its key;
    - WSP-11's unreadable path file left alone and logged;
    - WSP-11's guard baseline that can't be written, which §5.1 F lists and M1-AC4 bullet 11 omits.
  evidence: The cited lines; M1-AC1, AC4, AC6, AC11, AC16, AC17 and AC20 as written.
  fix: Add one bullet per clause to the AC that already cites its requirement.

- severity: P3
  type: editorial
  location: VER-5, CH-2, PO-13 evidence codes (v2@af97372.md:863, 465, 340)
  claim: Some evidence codes don't fit what verifies these requirements.
  scenario: VER-5's "No option or setting in the product names a fake" is an absence no unit test can fail, so it needs R. CH-2 is (C, L), yet M1-AC4 and M1-AC14 verify it by integration tests and its arithmetic needs U. PO-13 lacks L, though M1-AC22 is a live check that cites it.
  evidence: The codes as listed against the ACs.
  fix: VER-5 (M1; U, R); CH-2 (M1; U, I, C, L); PO-13 (M1; I, R, L).

- severity: P3
  type: readiness
  location: M1-AC22 (v2@af97372.md:1005)
  claim: The Linux half of M1-AC22 (install with no C compiler, network off, no process left) needs no owner and no model: PO-21's Alpine container install test can run it.
  scenario: The owner spends a live session on a check CI already makes.
  evidence: PO-21 453 "CI installs the package tarball with npm, with `--ignore-scripts`, and with the network off"; M1-AC22 "on a Mac and on a Linux machine, neither of which has a C compiler".
  fix: Keep M1-AC22 for the Mac. Add to PO-21's install test: "in a Linux container with no C compiler".

- severity: P3
  type: untestable
  location: SEC-6, M1-AC12 (v2@af97372.md:729, 961)
  claim: "reaches Claude escaped the same way" has no M1 path to observe: M1's rows are notice rows not added to Claude's conversation, and summaries and `send` come in M3.
  scenario: The test author can't find text that reaches Claude in M1, so that half of the AC is passed vacuously.
  evidence: ARM-7 672 "notice rows … not added to Claude's conversation"; M1 has no summary path (MSG-5, →M3).
  fix: M1-AC12: "…and, from M3, reaches Claude escaped the same way (→M3)", or name the M1 path being tested.

Coverage: HOST-2; PO-1, PO-2, PO-3, PO-5, PO-7, PO-9, PO-10, PO-11, PO-12, PO-13, PO-14, PO-15, PO-16, PO-17, PO-18, PO-19, PO-20, PO-21; CH-1, CH-2, CH-7; SI-1, SI-2, SI-3; ARM-1, ARM-3, ARM-7; WSP-8, WSP-10, WSP-11; SEC-1, SEC-2, SEC-4, SEC-6; VER-1, VER-2, VER-3, VER-5, VER-6, VER-7, VER-9; M1 Implements against Appendix B rules 4 and 9; M1-AC1 to M1-AC22; §5.1 C, I, X, F and L as M1 uses them. Not raised again: R-M1-89 to R-M1-107, R-M1-54, R-M1-19's mid-turn half, R-M1-62's variant; launchd restart timing waits on S7 (R-M1-98). Files read: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@af97372.md, C:\Users\johns\projects\AIConnections-review\docs\spec\review\settled.md, C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts.
