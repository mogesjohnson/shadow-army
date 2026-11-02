Verifier M1-R2-V2 (R-M1-127 to R-M1-139), against v0.11, 2026-10-20; cut off by the usage limit once and resumed

- id: R-M1-127
  verdict: CONFIRMED
  severity: P2
  evidence: WSP-11 720 has two ways to keep the guard open: "a task the turn started is running (claude's `task_started` with no `task_notification` for it yet), or ... a process that joined the process tree". M1-AC11 954 tests only the second ("a child it starts in the background"). M1-AC4 932 tests where a follow-up `result` goes, not the guard. §5.1 F 822 is the child-process case only. R-M1-78 (ledger 242) added the task branch to WSP-11 but put only the child into M1-AC11. Nothing pending covers it.
  reason: A background subagent runs inside claude's own process, so no new process joins the tree. An implementation that tracks only processes closes the guard at `result`, and every M1 AC still passes; the guard is the part that is enforced.
  fix: add to M1-AC11: "a fake that reports `task_started` for a task, sends its turn's `result`, then writes a checkout file from its own process before its `task_notification`, fails that turn, and its next message waits until the notification;"

- id: R-M1-128
  verdict: REFUTED
  severity: P2 as given; moot
  evidence: M1-AC9 942 requires that the mod, given a non-interactive session, "registers no tool or command". The mod gets `$` only inside a hook, because the module's entry is `register(on, options)` (claude-code.d.ts 9234), and registration happens through `$` (3061, and 4303 shows it inside `session.start`). So every registration goes through the fake `$`, at load or later, and the test sees it. The fake's input is the vendor's own typed contract: `SessionStartInput.isInteractive` is "false for a `-p` run", and `surface` is "null for a `-p` run" (11608-11616). §5.1 C 796's recording of HOST-2 is replayed by M3-AC13 1088 (fixed for R-F-60, ledger 92). Appendix B rule 9 needs only a test that names HOST-2.
  reason: The scenario fails M1-AC9 as written. The input the fake supplies is documented. The real recording is already replayed, in M3-AC13.

- id: R-M1-129
  verdict: CONFIRMED
  severity: P2
  evidence: PO-14 348 says "checks containment ... within 10 seconds", and no outcome is given for a check that runs longer. Its four messages (354-357) and M1-AC18 988 have no timeout case. PO-9 304's 10 s readiness and PO-10 318's 10 s limit cover only step 4's containment. Steps 1 to 3 (running the helper, starting PowerShell, `Add-Type`, the macOS lookups) and the check as a whole have no bound. The 10 s came from the D-3 merge text (drafts/answers/d3.txt 118), not from an owner value.
  reason: An implementation that waits leaves soldiers starting forever. One that fails has no message to give. A test author has no expected result. Saying what a timeout means is a technical choice under PLAYBOOK §14.
  fix: PO-14, after "within 10 seconds": "A check that hasn't passed 10 seconds after it began, on the monotonic clock, has failed: anything it started is killed, and its message names the step still running." M1-AC18 bullet 1 adds "and a test build whose check hangs at a step, which fails at 10 seconds, naming that step". Related to R-M1-130: one test build can serve both.

- id: R-M1-130
  verdict: CONFIRMED
  severity: P2
  evidence: PO-9 304 says "A session whose containment isn't ready within 10 seconds ... doesn't start its CLI. Anything already started is ended, and the containment has failed (PO-15)." M1-AC15 975 tests only macOS's coalition that isn't new. M1-AC18 988 tests failed steps of the check, not a soldier's guardian that never gets ready. §5.1 F 839 does not cover it. Neither R-M1-136's list nor any pending repair includes it.
  reason: A guardian that hangs at start (launchd slow to start the job, or a script stuck before ready) leaves the soldier starting forever when the wait has no timeout, and every M1 AC passes.
  fix: as proposed, in M1-AC15: "on each system, a test build whose guardian never reports ready starts no CLI. 10 seconds after the start began, its guardian is ended, and the soldier is down with PO-15's error and isn't restarted by itself;"

- id: R-M1-131
  verdict: REFUTED
  severity: P3 (was P2): the text already gives one reading
  evidence: ARM-7 670 says that while a file is untrusted no session opens, "a restart (PO-1) ... included", and "The soldier's log, and the use that needed it, say why". A restart has no use, so only its log says why. ARM-7 671 says "The post office raises one card for the folder, however many soldiers wait on it, and the mod shows it". A waiting restart is a soldier waiting, so the card is raised at once, which is the finding's reading A. ARM-7 675 says "the next use shows the card again" only after `Not now`. PO-1 204 says "Only the CLI's process ending, or the post office losing its connection to the CLI, is a crash", so a restart that starts nothing is not counted as one.
  reason: Read together, the cited lines answer all three questions: the card is raised as the restart begins to wait, the log gives the reason, and PO-1 doesn't count the wait. Reading B contradicts ARM-7 671.

- id: R-M1-132
  verdict: REFUTED
  severity: P2 as given; moot
  evidence: https://code.claude.com/docs/en/env-vars, "Set variables in settings files": "Claude Code copies these values into its environment as written". The mod typings, claude-code.d.ts 3553-3554: "The environment of this process, the one every Bash child, MCP server and `$.process.run` command started after inherits"; 7949 and 8040: a child's `env` is "set over the host process's own environment". So an `MCP_TIMEOUT` in the owner's user or project settings `env` reaches the post office's environment, which the post office reads, and the post office's bound matches claude's. The same env-vars page, entry `MCP_CONNECTION_NONBLOCKING`, says MCP startup is non-blocking by default and that `-p` waits only without `--input-format stream-json`. CH-2 466 passes that flag, so in M1 the long wait arises only with `alwaysLoad` servers or `MCP_CONNECTION_NONBLOCKING=0`.
  reason: The settings `env` value is not invisible: Claude Code puts it into its own environment, and the mod's children inherit that environment. The scenario's healthy soldier restarted as crashed doesn't arise. Optional P3 editorial: "`MCP_TIMEOUT` as the post office's environment gives it (Claude Code's settings `env` included)".

- id: R-M1-133
  verdict: CONFIRMED
  severity: P3 (was P2): the fake-clock half is R-F-76's pending repair, which names M1-AC2 (ledger 118). What remains is the wording of a log-rate rule.
  evidence: PO-3 220 says "The first refusal is reported in full; after that, at most one report a minute, with the count since the last one." It names no destination, and SEC-2 725 and §5.1 X 810 say only "reported". M1-AC2 923's "then one a minute with the count" assumes the count is reported when the minute ends, which PO-3 doesn't say. R-M1-53 (ledger 217), the source of the rule, was about the log flooding, so the log is the intended place.
  reason: An implementation that holds the count until the next refusal never reports a burst's tail, and a test can't tell where to look.
  fix: PO-3 220: "A wrong or missing secret is refused, and reported in the post office's log (PO-5): the first refusal in full, then at most one report a minute, with the count since the last one. Refusals not yet reported are reported when their minute ends, on the monotonic clock." Leave the fake clock to R-F-76's repair. A transcript line for the owner would change what the owner sees, which makes it big, so it is not proposed here.

- id: R-M1-134
  verdict: DUPLICATE
  severity: P3
  evidence: R-F-76 (ledger 118), repair pending: "§5.1 F opens with every time bound on a fake monotonic clock ... only M1-AC1's SIGSTOP and unread-output cases run in real time". The ledger already notes "overlaps R-M1-134, R-M1-135".
  reason: R-F-76's pending repair is exactly this finding's fix.

- id: R-M1-135
  verdict: DUPLICATE
  severity: P3
  evidence: R-F-76 (ledger 118) names "M1-AC4's ten silent minutes", and its repair puts every time bound on a fake monotonic clock. That covers the 55 s `initialize` answer and M1-AC15 973's 9.5 s and 10 s. Those times are the post office's own (PO-10 309-310), so on the fake clock they are exact, and no tolerance is needed. R-M1-122's pending repair (ledger 286) also rewrites the 9.5 s and 10 s steps.
  reason: Both halves are settled by R-F-76's pending repair.

- id: R-M1-136
  verdict: CONFIRMED
  severity: P3; the PO-1 port item is security (the mod would send the secret to whatever port a lock names), so put it in M1-AC1 or M1-AC2
  evidence: seven of the nine are tested by no AC:
    - PO-1 200, the port taken only from standard output: not in M1-AC1 912;
    - PO-5 240, the 100 ms retry: not in M1-AC4 936;
    - PO-12 339, the "untested" log line: not in M1-AC17;
    - PO-14 360, the log on a pass: not in M1-AC18;
    - PO-16 382, the entry removed: not in M1-AC16;
    - PO-18 413, the nonce file removed: M1-AC20 998 checks only that the secret is absent;
    - ARM-3 650, the key fallback: not in M1-AC6 939;
    - WSP-11 718, the unreadable path file: not in M1-AC11.
  Two are already covered: §5.1 F 836 lists "the log resumes with the count of lost lines" (half of item 2) and "A turn whose opening line or guard baseline can't be written is not started" (item 9).
  reason: Each of the seven is a stated behaviour that an implementation can leave out and still pass M1. Each can be checked with a fake.
  fix: as proposed, less the lost-lines count and item 9: one bullet per remaining clause in the AC that already cites its requirement (M1-AC1, M1-AC4, M1-AC6, M1-AC11, M1-AC16, M1-AC17, M1-AC18 and M1-AC20).

- id: R-M1-137
  verdict: CONFIRMED
  severity: P3
  evidence: VER-5 863 is (M1; U), but "No option or setting in the product names a fake" is an absence that a reviewer confirms (R, §5.1 855). CH-2 465 is (M1; C, L), yet integration tests against a fake claude verify it (M1-AC4 925, M1-AC5 938, M1-AC14 969), and its figure arithmetic is §5.1's "meter maths" (U, 786). PO-13 340 is (M1; I, R), yet live check M1-AC22 1005 cites it. Under R-M1-99's repair it still does (drafts/v012/repairs1.txt 318).
  reason: The codes don't name the levels that the spec's own ACs use.
  fix: as proposed: VER-5 (M1; U, R); CH-2 (M1; U, I, C, L); PO-13 (M1; I, R, L).

- id: R-M1-138
  verdict: REFUTED
  severity: P3 as given
  evidence: M1-AC22 1005 has the owner start a real claude soldier from the installed tarball. PO-21 453's install test "starts a fake soldier". CI runs only fakes (VER-5 863) and never a real CLI. R-M1-99's resolution (ledger 263; repairs1.txt 303 and 318) kept M1-AC22's Linux run in M1 on purpose and moved the Mac half to M6-AC11. So the finding's fix would leave M1 with no check of a real claude soldier running from the shipped package. The no-compiler property is already enforced by M1-AC17 986 (no install script, no `binding.gyp`, installed with `--ignore-scripts` and the network off).
  reason: CI can't make this check: it makes a weaker one with a fake soldier. Optional P3 editorial: say in PO-21 that the Alpine containers have no C compiler.

- id: R-M1-139
  verdict: CONFIRMED
  severity: P3
  evidence: M1-AC12 961 asks for text that "reaches Claude escaped the same way". The rows that enter Claude's conversation are HOST-11's and MSG-5's, both M3 (176-180, 1451). ARM-7 672's notice rows "are not added to Claude's conversation". M1 has no summary or `send`. M3-AC7 1070 already verifies the Claude half: "A summary and a soldier's error reach Claude as the soldier's quoted words ... with any control or format character in them escaped (... SEC-6)".
  reason: That half of M1-AC12 has no M1 path, so a test passes it without checking anything, and M3-AC7 already owns it.
  fix: M1-AC12: "...shows each as a placeholder in the mod's transcript lines; its other characters are kept (SEC-6). What reaches Claude is M3-AC7's (MSG-1, →M3)." This merges with R-M1-116's pending repair to the same AC.
