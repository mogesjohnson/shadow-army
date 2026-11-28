Verifier M1-R2-V1 (R-M1-114 to R-M1-126), against v0.11, 2026-10-20; cut off by the usage limit once and resumed

```
- id: R-M1-114
  verdict: REFUTED
  severity: P2 as given (moot)
  evidence: SEC-1 724 "A test proves that no listening socket is reachable on a non-loopback address (PO-2)"; PO-2 216 "every port a channel opens MUST bind to the loopback address … That includes the port a macOS guardian connects back to (PO-18)"; §5.1 X 809; VER-3 861 and VER-7 869 (SEC-1 is X evidence in M1, so its test must exist and name it).
  reason: SEC-1 is itself the test requirement, and it already covers every listening socket, the guardian's callback port included (PO-2 names it), so M1-AC1's main-bind case is one instance of that test, not its limit.
```

```
- id: R-M1-115
  verdict: CONFIRMED
  severity: P2
  evidence: WSP-8 693 (M1; U) "and on every event the post office sends the mod, where each streamed fragment is redacted on its own … So the mod never redacts"; WSP-8 696 (the unit test exercises `redact()` only); M1-AC2 923 (logs only); SEC-4 727 (logs and records); §5.1 X 811 "Logs are redacted". Nothing tests the event stream. Per-fragment redaction is a settled fix (R-M1-21, R-M1-52, ledger 185, 216), so a key split across fragments is *not* expected to be redacted in events.
  reason: An implementation that calls `redact()` only in the log writer passes every M1 test, but it sends secrets whole to the mod and the transcript.
  fix: WSP-8 becomes (M1; U, I). Add this to M1-AC2: "Each kind `redact()` matches, held within one fragment of a fake claude's text, tool call and error, reaches the mod's event stream as `[redacted]` (WSP-8)." Do not use the reviewer's "one fragment at a time" wording for a key split across fragments: WSP-8 deliberately redacts each fragment on its own.
```

```
- id: R-M1-116
  verdict: CONFIRMED
  severity: P2
  evidence: SEC-6 729 "each character of Unicode's control (Cc) and format (Cf) categories, except newline and tab … A test draws a line holding each kind"; M1-AC12 961 "holding ESC, a bidirectional control and a zero-width character"; M1-AC13 968 (ESC and bidi only). U+009B (Cc, C1 CSI) and the tag characters (Cf, invisible, and readable by a model) fall outside all three samples.
  reason: "Each kind" can be read as the three examples, so a filter that enumerates ranges, or a regex without the `u` flag, passes M1-AC12 while C1 controls and tag characters reach the transcript and Claude raw.
  fix: M1-AC12: "Text from a fake claude holding every Cc and Cf code point but newline and tab, taken from the Unicode Character Database's general categories (C1 controls such as U+009B, U+00AD, U+FEFF, and the tag characters U+E0001 and U+E0020 to U+E007F included), shows each as a placeholder …". This corrects the proposed text: U+E0000 and U+E0002 to U+E001F are unassigned (Cn), not Cf.
```

```
- id: R-M1-117
  verdict: CONFIRMED
  severity: P2
  evidence: ARM-7 673-675 (only `Trust these files`, `Not now`, a dismissed dialog and one that can't open have outcomes); ARM-7 676 "only through an accepted card"; M1-AC13 963. The vendor typings, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts 2406-2416: `ui.ask` "resolves to the label they chose, or the text typed under 'Other'" and returns "free text typed under 'Other' (so compare it with the labels exactly)"; 665-668 ("free text is the dialog's Other").
  reason: The dialog can return free text, and ARM-7 gives it no outcome, so code written as `answer !== "Not now"` raises a soldier to `full` on a typed "wait" and still passes every M1-AC13 case. R-M1-148 (packet M1-R2-V3) is the same finding.
  fix: as proposed. ARM-7: "Only an answer that is exactly `Trust these files` accepts. Any other answer, text typed under Other included, accepts nothing, as `Not now` does." M1-AC13 bullet 1 adds "an answer typed under Other starts nothing".
```

```
- id: R-M1-118
  verdict: CONFIRMED
  severity: P3 (was P2): CH-1 already states the rule outright, and the failure needs the owner's own PATH to hold a relative or empty entry; only the test case is missing
  evidence: CH-1 464 "never through a relative `PATH` entry. On Windows the current folder is never searched"; VER-5 863 (`test/fakes/` first on PATH, absolute); M1-AC10 949 (planted binaries only, under an absolute-only PATH); WSP-10 705 (the same rule for git).
  reason: No M1 test puts a relative or empty entry on PATH, so a plain PATH walk from the snapshot's working directory that runs a committed `node_modules/.bin/claude` passes M1-AC10.
  fix: M1-AC10's last bullet: "… never run, also with `.`, an empty entry and `node_modules/.bin` on `PATH` ahead of `test/fakes/`: the CLI and git come from the first absolute entry (CH-1, WSP-10)." This adds the empty entry to the proposal, because on POSIX an empty entry also means the current folder.
```

```
- id: R-M1-119
  verdict: DUPLICATE
  severity: P2 (R-F-109 is P3): raise the pair to P2. M1-AC10 passes an implementation that sets `hook.<event>.enabled=false` only for the three planted events, while a config hook on another event the commands fire (for example `pre-auto-gc` from a commit's auto gc, or `post-index-change`) still runs. That is an AC passing while WSP-10 fails.
  evidence: R-F-109 (ledger 148; a repair pending "if F-R2-V2 confirms it", per the packet); WSP-10 701; §5.1 X 816; M1-AC10 944. https://git-scm.com/docs/git-hook (fetched): `hook.<event>.enabled` "When set to `false`, no hooks fire for that event", and `hook.<friendly-name>.event` names one event from githooks(5).
  reason: Same gap as R-F-109 (§5.1 X plants every hook, M1-AC10 plants three hook files and one config hook), so it goes in with that repair, using the proposed AC text ("every event githooks(5) lists is planted, as a file in `hooks/` and as a config hook with a friendly name").
```

```
- id: R-M1-120
  verdict: CONFIRMED
  severity: P2
  evidence: PO-16 376 "The CLI doesn't start until its entry is written"; 380 "added as the post office lists it". Two readings: PO-1 205 (a start with no sign of life is a crash, restarted 1/5/30 s) against PO-1 209 and PO-9 304 (containment not set up means failed containment, PO-15: down, never restarted). PO-5 240 covers logs, and its "Records" means PO-6's, not tree entries. WSP-11 720 defines the matching case only for the guard's baseline. Neither §5.1 F 839 nor M1-AC16/18 has the case.
  reason: Whether an unwritable entry restarts the soldier three times or leaves it down changes what the owner sees, and on Linux a listing line that fails to append silently leaves a process outside the dead-post-office sweep (PO-16 385).
  fix: as proposed. PO-16: "If the entry can't be written, the CLI doesn't start, the containment has failed (PO-15), and the soldier's log and one transcript line say why. A listing line that can't be added is reported as PO-5 says for logs." M1-AC16 (or M1-AC18) adds the case.
```

```
- id: R-M1-121
  verdict: CONFIRMED
  severity: P3 (was P2): the start case is already defined through PO-1 209, PO-9 304 and PO-15 369 (the CLI doesn't start, the containment has failed, the soldier is down, and a reconnect's check gives PO-14's "doesn't match" message, PO-14 348, 355); only the macOS tool run and the AC case are missing
  evidence: PO-13 345 "checks each file against it before each run … A file that has changed is refused, for example after Shadow Army was updated under a running post office"; PO-14 348 (the check reruns only after a failed check or a failed containment); PO-17 393 (macOS tool runs: listing, stop and kill); PO-11 320 and WSP-11 720 (the guard relies on listings); M1-AC18 988 (a byte changed before the check only).
  reason: A macOS listing refused mid-turn has no stated effect on the guard's "a process that joined the tree" rule, and no AC replaces the helper after a passed check.
  fix: PO-13: "A run refused for its checksum is a failed containment (PO-15), at a session's start or during it, and the reconnect's check gives PO-14's message." M1-AC18 adds "the helper replaced after a passed check, then a second soldier started, and on macOS a listing run during a turn".
```

```
- id: R-M1-122
  verdict: CONFIRMED
  severity: P2
  evidence: M1-AC1 920 "has both ended within 10 seconds", 913 "ended 10 seconds later", 921 (the lease case: "gone within 10 seconds"); PO-7 263 "Once the CLI has exited, or 10 seconds after it was asked to, the post office ends its whole process tree"; PO-7 265 (in M1 the turn isn't stopped first); PO-10 309-310 (SIGTERM at 9.5 s on Linux and macOS only, the kill at 10 s), 318 "empty within 10 seconds after the kill began"; VER-2 860 (Windows runs these tests). The kill case of 921 is consistent with PO-1 209 and PO-10 317.
  reason: Measured from the shutdown, a fake that ignores its input on Windows is killed only at 10 s, so a correct implementation fails bullets 9 and 10 (the lease case), and bullet 2's "10 seconds later" gives no allowance for the kill itself.
  fix: as proposed, for M1-AC1 bullets 2 and 9 and bullet 10's lease case: "… its tree kill begins 10 seconds after the exit request (`SIGTERM` first at 9.5 s on Linux and macOS), and the tree is empty within 10 seconds after that."
```

```
- id: R-M1-123
  verdict: CONFIRMED
  severity: P2
  evidence: PO-1 201 "of two starts that find the same stale lock, only one wins"; M1-AC1 911-912 "Two starts racing on one stale lock end with one post office" (a fake clock and a fake `$`, but no ordering seam). The classic failure: A reads stale, B reads stale, A replaces, then B deletes A's fresh lock and writes its own. Exclusive create alone doesn't stop that.
  reason: Uncontrolled races rarely interleave in CI, so a non-atomic read, unlink and write passes the AC while two post offices can serve one folder, which is an AC that can pass while PO-1 fails.
  fix: M1-AC1 bullet 1: "Two starts on one stale lock, with the second's read and replacement forced between the first's read and its replacement, and in the reverse order, each end with one post office, and the other start gets the live-lock message."
```

```
- id: R-M1-124
  verdict: CONFIRMED
  severity: P2
  evidence: VER-6 868 "its lines are measured on a build of the same source instrumented for coverage, run by the same tests"; PO-17 400 "MUST NOT … create or write a file"; 408 (the Linux syscall trace "in every containment test"); M1-AC20 995. R-M1-111's pending repair (ledger 275: the coverage job is an exception and its build never ships) separates the bytes but doesn't exempt the trace. On macOS every guardian ends by a signal (PO-10 315: the job is removed, then every coalition member is SIGSTOPped and SIGKILLed), and gcov or LLVM profile counts are written only at a normal exit, so the macOS-only guardian code never reports its lines.
  reason: Read literally, the instrumented helper's coverage-file writes fail the syscall trace. Read loosely, the tests aren't "the same". Either way, a helper ended by a signal records no coverage, so VER-6's count can't be met honestly on macOS.
  fix: VER-6, merged with R-M1-111's repair: "The coverage build runs the containment tests in a job of its own (PO-21); the syscall trace and the import check apply to the shipped build only. It writes its counts only under a folder the test names, before each step that can end its own process, so a helper ended by a signal, as every macOS guardian is (PO-10), still counts its lines."
```

```
- id: R-M1-125
  verdict: DUPLICATE
  severity: P2
  evidence: R-F-70 (ledger 112, still open: "CH-2 reads claude's refusal from §5.1 C's recordings, but §5.1 C lists no refusal session … its synthetic path covers only CH-1's error kinds"; the `stop_reason: "refusal"` field is NEEDS-PROBE; proposed: §5.1 C builds a refusal from the vendor's documented shape, marked synthetic); R-M1-17 (ledger 181, the refusal field left to a probe). v0.11 is unchanged: CH-2 477, §5.1 C 790-792, M1-AC4 929.
  reason: Same gap, same probe and same proposed fix as R-F-70, which is still open, so it goes in with that repair.
```

```
- id: R-M1-126
  verdict: CONFIRMED
  severity: P2
  evidence: CH-2 465 (M1; C, L); 483 (a zero `total_cost_usd` is never a baseline); 484 (`/clear`, `/reset`, `/new`, and a total that falls below the baseline). M1-AC3 924 (three turns, no reset); M1-AC4 928 covers only the all-zero crash result of 482. VER-7 869 passes once any test names CH-2. M1 uses these figures in §5.1 L's measure (844) and the budget (848) for VER-9. D-11 concerns the Monarch's `/clear`, not a soldier's, so it doesn't apply.
  reason: An adapter that always subtracts the previous result passes every M1 AC, but after a soldier's `/clear`, a falling total or a zero-cost result it reports negative or double-counted costs, and those feed M1's live parity budget.
  fix: CH-2 becomes (M1; U, C, L). Add to M1-AC3: "Unit cases, with frames built from §5.1 C's claude recordings, for a zero-cost result followed by a costed one, a `/clear` turn, and a total below the baseline give each turn's figures as CH-2 says."
```
