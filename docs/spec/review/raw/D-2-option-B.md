# D-2 option B draft (5 s / 20 s), against snapshot be9deb0

Option B for D-2 is below, written as spec text. There are five changes against `.shadow/v2-tools/review/snapshots/v2@be9deb0.md`, each with the text it replaces. A short note of sources follows them.

**1. HOST-2, line 94**

Replaces:
```
- **HOST-2** (M1; I) The mod starts the post office the first time the army is used in a session, and stops it when the session ends. There is at most one post office per folder.
```
With:
```
- **HOST-2** (M1; I) The mod starts the post office the first time the army is used in a session, and again at the next use after it has stopped (PO-7). It stops it when the session ends. There is at most one post office per folder.
```

**2. PO-7, line 185 (first line)**

Replaces:
```
- **PO-7** (M1; I) **Shutdown.** When the Claude session ends, the post office closes every soldier session through that CLI's own exit, and leaves the worktrees and branches in place.
```
With:
```
- **PO-7** (M1; U, I, F) **Shutdown.** When the Claude session ends, the post office closes every soldier session through that CLI's own exit, and leaves the worktrees and branches in place. The release, the lease or the watch ends it, whichever comes first, and each ends it the same way.
```

**3. PO-7, line 186 (the "The lease" bullet)**

Replaces:
```
  - **The lease.** A living Claude process doesn't prove a living session, so the mod renews a lease with the post office every 10 seconds. After 30 seconds without a renewal, the post office treats the session as ended: it closes each session through its CLI, and exits. The lease works beside the post office's watch on the process that started it, and beside its process containment (PO-1).
```
With:
```
  - **Shutting down.** The post office records why it is stopping. Then it does these in order, for every soldier at once:
    1. It takes no new work. It refuses each command from the mod, saying why, as in `the army is stopping: no renewal for 20 s`, and sends nothing more to any CLI.
    2. Every queued message, and any message a soldier sends from then on (PO-4), ends as not delivered, with the reason (MSG-4).
    3. Each running turn is stopped through its CLI's own interrupt, background work included, as a stop does (MSG-9, CH-10). The stop answers no approval request: each closes with its turn, and nothing is approved (CH-6). A CLI with no interrupt, or whose turn hasn't ended 30 seconds after the stop, has its whole process tree ended (PO-1). The turn is finished as PO-8 says. Its message ends as interrupted, with the reason, unless its turn had already ended by itself; then it ends as PO-8 says. Nothing is sent again, and no session is resumed.
    4. Each session closes through its CLI's own exit. Once the CLI has exited, or 10 seconds after its session closed if it hasn't, its channel closes, which ends the CLI's whole process tree (PO-1).
    5. It releases the folder's lock (PO-1) and exits.
  - **The release.** At `session.end`, the mod MUST stop renewing the lease before it does anything else. It then sends one release: a Monarch command (PO-3) that names the Claude session. The post office answers it at once, then shuts down, with the reason `the Claude session ended`. If the release doesn't arrive, the lease or the watch ends the post office instead.
  - **The lease.** A living Claude process doesn't prove a living session, so the mod renews a lease with the post office.
    - The mod gives the post office the Claude session's id with the secret, on its standard input (PO-3).
    - From the moment the post office reports that it is ready, the mod sends a renewal every 5 seconds: a Monarch command that presents the secret (PO-3) and names the Claude session by its id. Each goes on time, whether or not the one before has been answered. Only a renewal renews the lease; no other command does.
    - The mod renews only while that session is its current one. It checks the session's id before each renewal. If the id has changed, it stops renewing and sends the release. It also stops when an answer says the lease has ended, or when the post office's output ends.
    - The gap is the time since the last renewal, counted as below. It starts at zero when the post office reports that it is ready. When it reaches 20 seconds, the post office ends the lease and shuts down, with the reason `no renewal for 20 s`.
    - The 5 and 20 seconds are fixed; no setting changes them.
  - **Counting the gap.** The post office MUST count the gap on a monotonic clock, such as Node's `performance.now()`, and MUST NOT use the wall clock for it. A change to the system time, the time zone or daylight saving neither ends the lease nor extends it.
    - Only the post office's own running time counts. It checks the lease every second. Each check adds the time since the previous check, or since the last renewal if that came later, but never more than 2 seconds. A longer interval means the post office itself wasn't running, so a pause adds at most 2 seconds to the gap, however long it lasted. That covers:
      - the computer sleeping or hibernating. Node's monotonic clock counts that time on Windows and macOS, though not on Linux;
      - the post office's process suspended, or its event loop stalled.
    - The gap is judged only at these checks. The lease ends at the first check at which the gap has reached 20 seconds.
    - Time the mod doesn't run counts in full while the post office runs, because the post office can't tell it from a session that has ended. So when Claude Code's process is suspended, or its event loop stalls, the renewals stop, and the lease ends as above. That includes ctrl+z in a POSIX terminal, unless it suspends the post office too.
  - **Late and stale renewals.**
    - A renewal MUST NOT revive a lease that has ended. After the release or the lease's end, each renewal is refused, saying when and why the lease ended.
    - A renewal or release with the right secret that names another Claude session is refused. It ends the lease at once, with the reason `the Claude session changed`. Only the mod holds the secret, so the session that started the post office is over.
    - A renewal from an older session that reaches a newer post office carries the older start's secret. It is refused and reported as PO-3 says, and changes nothing.
    - A renewal that names the right session can't be told from a valid one, even when the mod sent it after `session.end`. The mod's rule in the release is what prevents that.
  - **The watch.** At each check, the post office also confirms that the process that started it still runs. The check must be one a reused pid can't fool, such as its pid and start time, as the lock uses (PO-1). When that process has ended, the post office shuts down at once, without waiting for the lease, with the reason `the process that started it ended`. The watch can't see a session that ended while that process lives on, such as after `/clear` or `/resume` when the release didn't arrive. Nor can it see a mod that stopped renewing. The lease covers both.
  - **Containment.** However the post office shuts down, closing a channel ends its CLI's whole process tree (PO-1). Neither the lease nor the watch can act when the post office itself is killed outright; that case belongs to process containment (PO-1).
  - **What the owner sees.**
    - The post office's log, and the log of each session it closed, end with one line saying when and why it stopped, and what that ended, as in `14:02:31 · army stopped · no renewal for 20 s · Iron's turn interrupted · 1 message not delivered`. The post office's log also records the lease's start, each refused renewal, and each pause longer than 2 seconds, with its length. It never records a renewal one by one.
    - If the mod is still running, the post office's last event carries the same line, and the mod shows it once. Each message that ended says why in its row (MSG-4).
    - The next use of the army starts a new post office, with its sessions opened as at any start (HOST-2). If the mod's own last post office is still shutting down, the mod waits for it to exit first. When the last post office in that folder ended by its lease or its watch, the new one reads that line from the last one's log, and the mod shows it once, first.
```

**4. Section 5.1, fault tests: inserted after line 489** (`  - a cache going cold, on a fake clock;`)
```
  - the mod's lease running out, and a post office paused by sleep, a stopped process or a stalled event loop;
```

**5. M1-AC1, line 546**

Replaces:
```
- **M1-AC1** The post office starts with the first use of the army and stops with the session. Its lock holds its pid, start time and port. Without the mod's renewal for 30 seconds, it closes its sessions and exits. It binds only the loopback address and refuses `0.0.0.0` with an error (PO-1, PO-2, PO-7, HOST-2, SEC-1).
```
With:
```
- **M1-AC1** The post office starts with the first use of the army and stops with the session. Its lock holds its pid, start time and port. It binds only the loopback address and refuses `0.0.0.0` with an error (PO-1, PO-2, PO-7, HOST-2, SEC-1). The release, the lease and the watch work as PO-7 says. The tests use a fake claude, a fake `$` for the mod, and a fake monotonic clock and wall clock where time matters (PO-7):
  - renewals every 5 seconds keep the post office up through an hour, and its log has no line for any of them;
  - with no renewal, the post office ends the lease at its first check at least 20 seconds after the last one, and shuts down. The fake's running turn is stopped through its interrupt, and its open approval request is never answered. The running message ends as interrupted and a queued one as not delivered, each with the reason. The fake exits, the lock is released, and the post office exits;
  - a fake that ignores the interrupt has its process tree ended 30 seconds after the stop. A fake that doesn't exit has its tree ended 10 seconds after its session closed;
  - a check that comes an hour after the last renewal, as after sleep on Windows or macOS, leaves a gap of 2 seconds. A renewal 5 seconds later keeps the lease; without one, the lease ends 18 seconds after that check;
  - on Linux and macOS, the post office's process is stopped for 25 seconds and then continued (SIGSTOP, SIGCONT) while the mod renews, and its lease holds;
  - the wall clock set a day forward, then a day back, changes nothing;
  - a renewal after the lease has ended, or after the release, is refused, and the post office still exits. One with the right secret that names another session is refused and ends the lease at once. One with an earlier start's secret is refused and reported (PO-3);
  - at `session.end` the mod sends the release and no further renewal, even when the release fails. A mod whose session id has changed does the same;
  - when the process that started the post office ends, the post office shuts down at once, without waiting for the lease;
  - each log ends with the line PO-7 gives, and the next start shows it once.
```

---

**Note: sources** (checked 2026-10-14)

- **What Node reads.** `performance.now()` and `process.hrtime()` both read libuv's `uv_hrtime()`:
  - https://github.com/nodejs/node/blob/main/src/node_perf.cc
  - https://github.com/nodejs/node/blob/main/src/node_process_methods.cc

  Node's docs say only that `process.hrtime()` is "relative to an arbitrary time in the past, and not related to the time of day and therefore not subject to clock drift" (https://nodejs.org/api/process.html#processhrtimetime). Neither those docs, nor the entry for `performance.now()` (https://nodejs.org/api/perf_hooks.html#performancenow), nor libuv's `uv_hrtime()` docs (https://docs.libuv.org/en/v1.x/misc.html#c.uv_hrtime) say anything about sleep. So the answer comes from libuv's source and each system's own documentation.
- **Windows: the clock counts sleep.** libuv uses QueryPerformanceCounter for `uv_hrtime()` and for the loop time that timers use: https://github.com/libuv/libuv/blob/v1.x/src/win/util.c and https://github.com/libuv/libuv/blob/v1.x/src/win/core.c. Microsoft says QPC "returns the total number of ticks that have occurred since the Windows operating system was started, including the time when the machine was in a sleep state such as standby, hibernate, or connected standby". It also says QPC is "completely independent of the system time and UTC" (https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps).
- **macOS: the clock counts sleep.** libuv uses `mach_continuous_time()` for both (https://github.com/libuv/libuv/blob/v1.x/src/unix/darwin.c).
  - At tags v1.44.2 and v1.48.0 it is looked up with dlsym, falling back to `mach_absolute_time` only where it is missing.
  - From v1.49.0 it is called directly ("darwin: simplify uv_hrtime", https://github.com/libuv/libuv/blob/v1.x/ChangeLog).
  - Apple's XNU header describes it as "like mach_absolute_time, but advances during sleep" (https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/mach/mach_time.h). Apple's developer page for the function returned no text.
- **Linux: the clock does not count sleep.**
  - libuv uses CLOCK_MONOTONIC for `uv_hrtime()`. For the loop time it uses CLOCK_MONOTONIC_COARSE where that clock's resolution is 1 ms or better (https://github.com/libuv/libuv/blob/v1.x/src/unix/linux.c, https://github.com/libuv/libuv/blob/v1.x/src/unix/internal.h).
  - man clock_gettime(2) says CLOCK_MONOTONIC "does not count time that the system is suspended" and "is not affected by discontinuous jumps in the system time". CLOCK_BOOTTIME is the clock that includes suspend (https://man7.org/linux/man-pages/man2/clock_gettime.2.html).
- **Why the cap is per check.** libuv runs due timers before it polls for I/O again (https://docs.libuv.org/en/v1.x/design.html). So after a pause, a deadline timer can fire before renewals already waiting on the socket are read.
  - Codex's `C:\Users\johns\projects\AIConnections-m1\src\v2\lease.ts` does exactly this. It also expires the lease from `assertActive()` at the start of the first command after a pause, renewals included.
  - So on Windows and macOS, its lease ends on waking from any sleep longer than its limit. The text uses the 2-second cap per check instead.
- **Mod API facts relied on.**
  - From `.shadow/v2-tools/notes/m1-plan.md` (Claude Code 2.1.294's typings): `$.process.spawn` writes standard input once, and `session.end` fires once under a short shared time budget.
  - Not in the M0 report or the M1 plan, so they still need confirming in the typings: a repeating timer in the mod (Codex's draft uses `$.clock.every`), and the session's id (`$.session.id()` and `session.end`'s `sessionId`). Codex's draft uses both against Claude Code 2.1.296.
- **NEEDS-PROBE.**
  - Whether ctrl+z on Claude Code also stops the post office, which depends on whether `$.process.spawn` starts the child in Claude Code's process group.
  - Whether Windows Modern Standby suspends Claude Code and the post office together, or only one of them.
  - How the mod's own timer behaves across sleep. The text holds whatever that timer does, as long as the mod renews within about 12 seconds of the post office's first check after waking.
