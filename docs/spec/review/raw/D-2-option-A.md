# D-2 option A draft (10 s / 30 s), against snapshot be9deb0

Option A for D-2: the mod renews every 10 s, and the post office ends after 30 s without a renewal. Line numbers refer to the snapshot `.shadow/v2-tools/review/snapshots/v2@be9deb0.md`.

---

**1. PO-7, the whole requirement (lines 185–186)**

Replaces:
```
- **PO-7** (M1; I) **Shutdown.** When the Claude session ends, the post office closes every soldier session through that CLI's own exit, and leaves the worktrees and branches in place.
  - **The lease.** A living Claude process doesn't prove a living session, so the mod renews a lease with the post office every 10 seconds. After 30 seconds without a renewal, the post office treats the session as ended: it closes each session through its CLI, and exits. The lease works beside the post office's watch on the process that started it, and beside its process containment (PO-1).
```
With:
```
- **PO-7** (M1; I, F) **Shutdown.** When the Claude session ends, the post office closes every soldier session through that CLI's own exit, and leaves the worktrees and branches in place.
  - **What starts it.** Three things start the same shutdown: the mod's request (at `session.end`, or once Claude's session id has changed), the lease's end, and the watch. The first one starts it; the others then change nothing.
  - **The lease.** A living Claude process doesn't prove a living session: after `/clear` or a resume the process goes on under a new session id, and a mod can hang or be stopped. So the mod renews a lease with the post office every 10 seconds, and the post office ends the lease after 30 seconds of its own running time without a renewal.
    - **Renewing.** The mod gives the post office Claude's session id (`$.session.id()`) with the secret at start (PO-3); without one, the post office refuses to start. Every 10 seconds, by its own timer (`$.clock.every`), the mod sends a renewal: a command that presents the secret and carries that session id. Only a renewal renews the lease. At most one renewal waits for its answer; one that falls due meanwhile is skipped. A renewal that fails is not retried early: the next one goes at its time.
    - **Only for its own session.** Before each renewal, the mod reads Claude's session id. Once it differs, the mod never renews that post office again, and asks it to shut down. At `session.end` the mod stops renewing first, then asks. If the request doesn't arrive within that hook's short time budget, the lease ends the post office instead.
    - **The clock.** The post office measures the lease on Node's monotonic clock (`performance.now()`). It MUST NOT use the wall clock for it, so a change of the system time, either way, changes nothing. Times it reports, such as when the lease ended, are wall-clock times for display only.
    - **The checks.** The gap starts at zero when the post office reports that it is ready, and goes back to zero with each renewal. Once a second, a check adds the time since the previous check, the last renewal or the start, whichever came last, but never more than 5 seconds. The lease ends at the first check that brings the gap to 30 seconds. Only a check ends it. Handling a renewal never measures time, so a renewal handled before that check renews the lease, however late it was sent.
    - **Sleep, suspension and stalls.** A step of more than 5 seconds between two checks means the post office did not run: the computer slept or hibernated (Windows' modern standby included), the post office was suspended by a debugger or a signal, or its event loop stalled. At most 5 seconds of it count, on every system. Node's monotonic clock stops while Linux is suspended, but goes on through sleep and hibernation on Windows and macOS, where the first check after waking sees one long step. Renewals sent while the post office was suspended wait at its port, and are handled when it runs again. The post office logs each such step with its length.
    - **The mod stopped or stalled.** Time in which the post office runs and the mod doesn't counts in full. That covers Claude Code stopped by job control (ctrl+z) or a debugger while the post office isn't, its event loop busy, and the mod's timer stopped. The lease ends once 30 seconds of it pass without a renewal.
    - **The event stream never holds the checks.** The checks MUST NOT wait on the post office's standard output. Claude Code blocks a child of the mod on its next write once 1,048,576 characters of its output wait unread, and Node writes to a pipe synchronously on Windows. So the post office writes its events without blocking its event loop. Past 16 MiB of events not yet written, it stops reading its soldiers' output until the mod has read them: the soldiers wait, and the checks go on.
    - **Refused renewals.** A renewal is refused, and renews nothing, when it carries another session id or when the lease has ended. An ended lease never comes back. The refusal gives the reason, and the post office logs it.
  - **The watch.** Once a second the post office also checks that the process that started it is still running. It tells that process apart from a later one that reuses its pid by its start time, as the lock does (PO-1). Once that process has ended, the post office shuts down at once, without waiting for the lease.
  - **Containment.** The lease and the watch need a running post office. The post office may be ended outright before its shutdown finishes, for example by Claude Code when the mod unloads, or by a crash. Then no session closes through its CLI, and its process containment (PO-1) ends each soldier's whole process tree, so nothing a soldier started keeps running.
  - **The shutdown,** whatever started it:
    - The post office records the reason and the time in its own log and in each soldier's (PO-5), and sends them as an event. The reason is one of `the session ended`, `no renewal from the mod for 30 s` and `the process that started it ended`.
    - From then on it refuses every command, renewals included, and every soldier's `send` (PO-4), giving that reason. Nothing is restarted or resumed (PO-1, CH-9).
    - It closes every soldier at the same time:
      - each queued message ends as not delivered, with the reason (MSG-4), and nothing more is sent;
      - a running turn is stopped as a stop stops it, background work included (MSG-9, CH-10, PO-8). Each approval request the turn has open is closed as a stop closes it, and nothing is approved (CH-6). The turn is finished as PO-8 says, and its message ends as a stopped turn's does (MSG-9), with the reason;
      - an attribution card raised then is not answered, and doesn't hold up the shutdown (ARM-6). Its paths go in the soldier's log, marked unanswered;
      - then the session closes through its CLI's own exit. Once the CLI has exited, or 10 seconds after it was asked to, the post office ends its whole process tree (PO-1) and revokes the soldier's credential (PO-4). A channel still starting has its process tree ended at once.
    - Once every session is closed, the post office releases its lock (PO-1) and exits. It doesn't wait for the mod to read its last events; the logs keep them.
    - Until M2 brings CH-10 and PO-8, a running turn is not stopped first: closing its session cuts it short.
  - **What the owner sees.**
    - The soldier's log (OBS-1) and the post office's log say when the army stopped and why. They also say what happened to each turn, queued message, approval request and card, as in `14:02:13 lease ended: no renewal from the mod for 30 s · turn stopped · 2 queued messages not delivered · session closed`.
    - The mod learns of the shutdown from the post office's last event, from a command refused for that reason, or from the end of the post office's output. A renewal that only fails tells it nothing. Then the mod stops renewing, and Claude's transcript gets one line, as in `the army stopped at 14:02:13: no renewal from the mod for 30 s · the next use starts it again`. While the pane is closed, a toast says so, as for a disconnection (HOST-8). The rows of the briefs it affected show how they ended, as far as its events told it (HOST-11, MSG-4). The records keep every ending (PO-6).
    - The next use of the army starts a new post office (HOST-2) once the old one has exited and released its lock. Until then, the mod says that the old one is still closing. The soldiers start new sessions (SES-1). The old sessions' logs and reports, and every worktree and branch, stay.
```

**2. M1-AC1 (line 546)**

Replaces:
```
- **M1-AC1** The post office starts with the first use of the army and stops with the session. Its lock holds its pid, start time and port. Without the mod's renewal for 30 seconds, it closes its sessions and exits. It binds only the loopback address and refuses `0.0.0.0` with an error (PO-1, PO-2, PO-7, HOST-2, SEC-1).
```
With:
```
- **M1-AC1** The post office starts with the first use of the army, starts again at the first use after it has shut down, and stops with the session. Its lock holds its pid, start time and port. It binds only the loopback address and refuses `0.0.0.0` with an error. Tests of the lease and the watch use a fake claude, a fake monotonic clock and a fake `$` (PO-1, PO-2, PO-7, HOST-2, SEC-1):
  - with a renewal every 10 seconds, the post office runs on. At the first check 30 seconds after the last renewal, it logs why and when, closes each session through the fake's exit, releases its lock and exits. A fake that ignores its exit has its process tree ended 10 seconds later;
  - the last renewal comes 9 seconds before a step of an hour between two checks, as after a sleep. The lease ends 16 seconds after the step, not at once. A renewal 10 seconds after the step keeps it, and so does one handled before the first check after the step. Moving the wall clock an hour either way changes nothing;
  - a post office started without a session id refuses to start. A renewal with another session id, and any renewal after the lease ended, is refused with its reason and renews nothing;
  - while nothing reads the post office's standard output, on each of the three systems (VER-2), the checks go on and the lease ends on time. Past 16 MiB of unwritten events, the post office stops reading the fake's output, and reads it again once the events have been read;
  - when the process that started it ends, the post office starts the same shutdown within 2 seconds, without waiting for the lease. A new process with that pid but another start time counts as ended;
  - the mod renews every 10 seconds, with at most one renewal waiting, and skips those that fall due meanwhile. Once Claude's session id changes, and at `session.end`, it stops renewing and asks the post office to shut down;
  - when the lease ends with the fake mid-turn, the turn is cut short. The soldier's log says when the army stopped, why, and that the turn was cut short. Claude's transcript gets one line saying so, and the next use starts a new post office once the old one has released its lock.
```

**3. HOST-2 (line 94)**

Replaces:
```
- **HOST-2** (M1; I) The mod starts the post office the first time the army is used in a session, and stops it when the session ends. There is at most one post office per folder.
```
With:
```
- **HOST-2** (M1; I) The mod starts the post office the first time the army is used in a session, and again at the first use after it has shut down (PO-7). It stops it when the session ends. There is at most one post office per folder.
```

**4. CH-6 (line 244)**

Replaces:
```
  - No adapter answers a request by itself. An unanswered request stays pending (spike S5) until the owner answers it or stops its turn.
```
With:
```
  - No adapter answers a request by itself. An unanswered request stays pending (spike S5) until the owner answers it or stops its turn, or the post office shuts down (PO-7), which closes it as a stop does.
```

**5. MSG-4, the "interrupted" line (line 297)**

Replaces:
```
    - **interrupted:** it was delivered, but no summary came back: the owner stopped the turn, the CLI crashed, the CLI reported the turn as failed (PO-8), or the owner answered n to the guard's attribution card (ARM-6). The turn may already have changed files, so the row shows the changes made since the turn began (MSG-11);
```
With:
```
    - **interrupted:** it was delivered, but no summary came back: the owner stopped the turn, the CLI crashed, the CLI reported the turn as failed (PO-8), the post office shut down (PO-7), or the owner answered n to the guard's attribution card (ARM-6). The turn may already have changed files, so the row shows the changes made since the turn began (MSG-11);
```

**6. SEC-3 (line 418)**

Replaces:
```
- **SEC-3** (M2; X, R) No code path answers a vendor's approval request without the owner (CH-6, HOST-12). A stop's cancellation is the owner's answer, and it approves nothing (CH-6).
```
With:
```
- **SEC-3** (M2; X, R) No code path answers a vendor's approval request without the owner (CH-6, HOST-12), except the cancellation that closes it when the post office shuts down (PO-7). A stop's cancellation is the owner's answer. Neither approves anything (CH-6).
```

**7. Section 5.1, Fault tests: insert after line 484 ("- a CLI whose turn does not end after a stop;")**
```
  - the mod's renewals stopping; a sleep, a suspended or stalled post office, a stopped mod and a wall-clock change, on a fake clock (PO-7);
```

**8. M2-AC7 (line 575, and a new bullet after line 581)**

Line 575 replaces `(CH-6, CH-10, SEC-3):` with `(CH-6, CH-10, SEC-3, PO-7):`.

Insert after line 581 ("- a fake whose turn has not ended 30 seconds after the stop is ended, and its turn is finished as PO-8 says;"):
```
  - when the lease ends while a request is open, the request is closed the same way and nothing is approved. The turn is finished as PO-8 says, and the session is closed, not resumed (PO-7);
```

**9. M3-AC11 (line 627)**

Replaces:
```
- **M3-AC11** A fault test disconnects a soldier that has a message queued. The message stays queued, says what it waits for, and goes by itself after the reconnect. A message the post office can no longer deliver ends as not delivered, with its reason (MSG-3, MSG-4).
```
With:
```
- **M3-AC11** A fault test disconnects a soldier that has a message queued. The message stays queued, says what it waits for, and goes by itself after the reconnect. A message the post office can no longer deliver ends as not delivered, with its reason. When the lease ends (PO-7), each queued message ends as not delivered, and the message whose turn was running ends as interrupted, each with the shutdown as its reason. Nothing more is sent, and the briefs' rows show both endings (MSG-3, MSG-4, PO-7).
```

---

**Sources**

- **Node's clock:** `performance.now()` is libuv's `uv_hrtime()`. Node's source has `#define PERFORMANCE_NOW() uv_hrtime()`: https://github.com/nodejs/node/blob/main/src/node_perf_common.h.
  - Node's documentation names no clock and says nothing about sleep: https://nodejs.org/api/perf_hooks.html#performancenow and https://nodejs.org/api/process.html#processhrtimetime ("relative to an arbitrary time in the past ... not subject to clock drift").
  - libuv's documentation says the same and nothing more: https://docs.libuv.org/en/v1.x/misc.html#c.uv_hrtime.
- **The OS clock under `uv_hrtime`, from libuv's v1.x source:**
  - Linux: `CLOCK_MONOTONIC` (`src/unix/linux.c`).
  - macOS: `mach_continuous_time()` (`src/unix/darwin.c`). This arrived in libuv 1.38.1, 2020-07-04: "darwin: work around clock jumping back in time", https://github.com/libuv/libuv/pull/2894. Every Node that `package.json`'s `"node": ">=20"` allows has it.
  - Windows: `QueryPerformanceCounter` (`src/win/util.c`).
- **Whether each clock counts sleep:**
  - Linux: `CLOCK_MONOTONIC` "does not count time that the system is suspended" and "is not affected by discontinuous jumps in the system time": https://man7.org/linux/man-pages/man2/clock_gettime.2.html.
  - macOS: `mach_continuous_time` "increments monotonically ... including while the system is asleep": https://developer.apple.com/documentation/kernel/1646199-mach_continuous_time.
  - Windows: QPC counts "the time when the machine was in a sleep state such as standby, hibernate, or connected standby", and "is completely independent of the system time and UTC": https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps.
  - Windows modern standby: the Desktop Activity Moderator "pauses all desktop applications": https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/integrating-apps-with-modern-standby.
- **Node I/O and timers:**
  - Writes to a pipe are "synchronous on Windows, asynchronous on POSIX", and "synchronous writes block the event loop": https://nodejs.org/api/process.html#a-note-on-process-io.
  - Timers fire with no exact timing: https://nodejs.org/api/timers.html.
- **Claude Code 2.1.294's mod API typings** (`claude-code.d.ts`, shipped with its plugin-authoring skill; on this machine under `C:\Users\johns\AppData\Local\Temp\claude\bundled-skills\2.1.294\`):
  - after `/clear` or a resume the process goes on under a new `$.session.id()`, and no `session.start` fires;
  - `session.end` has "one short wall-clock bound (1.5 s by default)";
  - `$.clock.every` runs one period at a time, and "a refused period ends the interval";
  - `$.clock.now()` gives the wall clock;
  - a `$.process.spawn` child is killed when the module unloads, and "blocks on its next write" once 1,048,576 characters wait unread.
- **NEEDS-PROBE:**
  - Whether a `$.clock.every` period that falls due during a sleep fires on waking. The typings don't say. The text holds either way: the first renewal after waking comes within 10 s, and at least 15 s of the lease are left.
  - Whether ctrl+z stops the post office along with Claude Code. That depends on the process group `$.process.spawn` gives its child, which isn't documented.
