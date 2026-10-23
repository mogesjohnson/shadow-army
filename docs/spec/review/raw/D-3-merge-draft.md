D-3 (B) merge drafter, with R-M1-59, R-M1-61 and R-F-68, against v0.10 (v2@e7c33b4.md), 2026-10-20

D-3 (Q8, option B, the owner's answer of 2026-10-17), merged onto v0.10 together with R-M1-59, R-M1-61 and R-F-68. Old text comes from C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@e7c33b4.md. I grep-checked that each old text occurs exactly once. The blocks don't overlap. Placeholder IDs: NEW-D3-1 to NEW-D3-13 are all M1 and go in §4.2 after PO-8. NEW-D3-AC1 to NEW-D3-AC8 are M1 ACs. S7 is a new M1 spike.

D-3, §2: the post office is no longer called a "helper", so the word means only the containment helper.
<<< OLD
- **Post office:** the local helper process that holds the soldiers' sessions and carries messages between them.
=== NEW
- **Post office:** the local process that holds the soldiers' sessions and carries messages between them.
>>> END

D-3, §2: new entries for containment, the guardian and the containment helper.
<<< OLD
- **Channel:** the post office's connection to one soldier, through that CLI's own live-session interface.
=== NEW
- **Channel:** the post office's connection to one soldier, through that CLI's own live-session interface.
- **Containment:** what holds a soldier's CLI and every process it starts, so that the post office can list them all and end them: a subreaper on Linux, a launchd job's coalition on macOS and a Job Object on Windows (NEW-D3-1).
- **Guardian:** the process that holds one session's containment, starts the CLI in it, and ends its tree by itself when the post office is gone: the containment helper on Linux and macOS, Shadow Army's PowerShell script on Windows (NEW-D3-1).
- **Containment helper:** the small native program that sets up containment on Linux and macOS. It ships prebuilt in Shadow Army's package, one for each supported system and processor (NEW-D3-4, NEW-D3-5).
>>> END

R-M1-59 and R-F-68, PO-1: a channel whose containment failed is neither a crash nor restarted by itself.
<<< OLD
from M2 it resumes the previous one by id (CH-9, →M2).
=== NEW
from M2 it resumes the previous one by id (CH-9, →M2). A channel whose containment failed, at its start or later, is not a crash and is never restarted by itself (NEW-D3-7).
>>> END

D-3, R-M1-59 and R-F-68, PO-1: containment gets its mechanism. The 10 seconds now say what holds them when the guardian dies too, and a CLI that can't be contained doesn't start.
<<< OLD
  - **Containment.** When a channel closes or restarts, the post office ends the CLI's whole process tree: the CLI and every process that descends from it, one that starts a new session or forks twice included. If the post office's own process ends without closing a channel, however it ends, a kill or a crash included, that channel's whole process tree still ends within 10 seconds, through the containment that Q8 chooses, as far as it reaches.
=== NEW
  - **Containment.** Every CLI runs in a containment that is set up before it starts (NEW-D3-1). A CLI whose containment can't be set up doesn't start, and nothing starts it uncontained (NEW-D3-6). When a channel closes or restarts, the post office ends the CLI's whole process tree: the CLI and every process that descends from it, one that starts a new session or forks twice included (NEW-D3-2). If the post office's own process ends without closing a channel, however it ends, a kill or a crash included, that channel's guardian ends its whole process tree within 10 seconds (NEW-D3-2). If the guardian ends with the post office, NEW-D3-8 says what ends the tree, and when.
>>> END

D-3 and R-M1-59, PO-1: the residual adds what a Linux guardian killed from outside lets escape.
<<< OLD
That is a stated residual risk, and no guard or audit sees what such work changes after the turn.
=== NEW
That is a stated residual risk, and no guard or audit sees what such work changes after the turn. So is a process on Linux that no listing of its tree found (NEW-D3-3) when the guardian is ended from outside, alone or together with the post office: it keeps running too (NEW-D3-7, NEW-D3-8).
>>> END

D-3, PO-2: the macOS guardian's loopback port is covered, and the helper listens on none.
<<< OLD
Any other address is refused at start, with an error that says so.
=== NEW
Any other address is refused at start, with an error that says so. That includes the port a macOS guardian connects back to (NEW-D3-10). The containment helper listens on no port (NEW-D3-9).
>>> END

D-3, PO-7: the post office ended outright points to the case where the guardian ends too.
<<< OLD
Then no session closes through its CLI, and its process containment ends each soldier's whole process tree (PO-1).
=== NEW
Then no session closes through its CLI, and its process containment ends each soldier's whole process tree, as PO-1 and NEW-D3-8 say.
>>> END

D-3, PO-8: which processes joined the tree comes from the listing (taken from A's NEW-3).
<<< OLD
a process that joined the CLI's process tree during the turn (PO-1)
=== NEW
a process that joined the CLI's process tree during the turn (PO-1, NEW-D3-3)
>>> END

D-3, R-M1-59, R-M1-61 and R-F-68: the new requirements, inserted after PO-8. They are B's NEW-1 to NEW-10, with the parts the judge said to take from A and C.
<<< OLD
  - The guard and the claim audit run after a failed turn too (from v1 #22 and #16: `src/core/summon.ts` checks the guard and audits after a failed run).
=== NEW
  - The guard and the claim audit run after a failed turn too (from v1 #22 and #16: `src/core/summon.ts` checks the guard and audits after a failed run).
- **NEW-D3-1** (M1; I, F) **Containment.** Every soldier's CLI runs in a containment that is set up before the CLI starts. The containment holds the CLI, every process it starts and every process those start, so the post office can list them all (NEW-D3-3) and end them (NEW-D3-2). That includes a process that starts a new session or process group, forks twice, clears its environment or outlives its parent. Each session has a guardian: the process that holds its containment, starts the CLI in it, and ends the tree by itself when the post office is gone.
  - **Linux.** The guardian is the containment helper (NEW-D3-4). It marks itself a child subreaper (`PR_SET_CHILD_SUBREAPER`), leads a session and process group of its own, which the CLI joins, starts the CLI as its child, and stays its parent for the session. When a process in the tree loses its parent, the kernel hands it to its nearest living ancestor that is a subreaper: the guardian, or a process in the tree that marked itself one. So the process stays in the tree.
  - **macOS.** The guardian is the containment helper, run as a launchd job of its own in the owner's login session, with a label unique to the session. launchd starts the job in a coalition of its own. Every process started from the guardian, the CLI included, stays in that coalition, whatever its parent, process group or session. NEW-D3-10 says how the job starts and what it rests on.
  - **Windows.** The guardian is Shadow Army's PowerShell script (NEW-D3-11). It creates the CLI inside a Job Object, assigned as the process is created (`PROC_THREAD_ATTRIBUTE_JOB_LIST`). Every process the CLI creates joins the job too. The job allows no breakaway, and it ends every process in it when its last handle closes (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`). Only the guardian holds a handle to it. Windows has no containment helper.
  - **Apart from the post office.** A guardian is never a Node.js process. On Linux and macOS it runs in a session and process group apart from the post office's. So a signal to the post office's process group, or a command that ends Node.js processes by name, doesn't reach it.
  - **As if started directly.** The guardian starts the CLI with exactly the program, arguments, environment and working directory that the post office gives it, and on Linux and macOS with the post office's resource limits. What the post office writes reaches the CLI's standard input. The CLI's standard output and error reach the post office byte for byte, each in order. Containment adds nothing to the CLI's command and removes nothing from it (CH-7).
  - The post office learns when the CLI's own process exits, with its exit code or signal, even while the rest of its tree runs on (PO-1).
  - **At start.** A session whose containment isn't ready within 10 seconds, or whose macOS coalition isn't new (NEW-D3-10), doesn't start its CLI. Anything already started is ended, and the containment has failed (NEW-D3-7).
  - **What it is not.** Containment is cleanup, not a sandbox: it sets no file, network or permission policy. What Shadow Army enforces is the checkout guard and the claim audit (ARM-6, →M2; WSP-2, WSP-4, →M6). PO-1 lists the work it doesn't reach.
- **NEW-D3-2** (M1; I, F) **Ending a tree.** The post office ends a CLI's tree when its channel closes or restarts (PO-1), and when a stop falls back to ending the CLI (CH-10, →M2).
  - **In order.**
    - The CLI is asked to exit through its own exit, as PO-7 closes a session.
    - On Linux and macOS, a CLI that hasn't exited 9.5 seconds later gets `SIGTERM`.
    - Once the CLI has exited, or 10 seconds after it was asked to, every process still in the tree is killed.

    A lost connection (PO-1), a stop that falls back to ending the CLI (CH-10, →M2), a CLI whose process has already ended, and a post office that is gone skip the first two steps: the tree is killed at once.
  - **Only the system's word counts.** A tree has ended only when the system reports it empty. A list that the system documents as unreliable while processes run is never the proof. Linux's `/proc/<pid>/task/<tid>/children` is such a list.
    - **Linux.** The guardian kills each of its children, and each process it adopts as their parents die, and reaps them. It goes on until `wait` reports that it has no child left, living or exited (`ECHILD`). It signals only its own children. The kernel keeps their pids until they are reaped, so the guardian never signals a reused pid.
    - **macOS.** First the session's launchd job is removed, because launchd keeps a job made with `launchctl submit` alive after a failure. Then every living member of the session's coalition is stopped (`SIGSTOP`). Once all are stopped, they are killed (`SIGKILL`). This repeats until the coalition has no living member. Each signal goes through the process's audit token, which carries its pid version, so a reused pid is never signalled (NEW-D3-10).
    - **Windows.** The guardian terminates the job (`TerminateJobObject`) and waits until the job holds no active process.
  - **When the post office is gone.** The guardian watches its connection to the post office. If that connection closes without a close command, the guardian kills the tree at once. On macOS it ends every other member of its coalition first, and then has launchd remove its own job. On Windows, if the guardian is gone too, the job's last handle has closed, and the system has ended every process in the job.
  - **The limit.** The tree is empty within 10 seconds after the kill began. If it isn't, the containment has failed (NEW-D3-7).
  - **What is logged.** After each tree is ended, the soldier's log lists each process that was ended besides the CLI, with its pid and its command line through `redact()` (WSP-8).
- **NEW-D3-3** (M1; I) **Listing the tree.** The post office can list the processes in a CLI's containment at any moment. Each comes with an identity that a reused pid can't match:
  - Linux: each process whose chain of parents, read from `/proc/<pid>/stat`, reaches the guardian. Its identity is its pid and start time.
  - macOS: each living member of the session's coalition. Its identity is its pid and the kernel's unique id for the process (NEW-D3-10).
  - Windows: each process in the job. Its identity is its pid and creation time.

  PO-8 (→M2) and WSP-11 compare two lists to tell which processes joined the tree during a turn. A process that both starts and exits between two lists can be missed. Whatever it changed in the checkout is still on the turn's guard (ARM-6, →M2; WSP-4, →M6). Before it ends one listed process, as a stop does (MSG-9, →M3), the post office checks that the process's identity still matches.
- **NEW-D3-4** (M1; U, I) **Systems and processors.** The post office chooses the containment from Node.js's `process.platform` and `process.arch`:

  | `process.platform` | `process.arch` | Containment |
  |---|---|---|
  | `linux` | `x64` | the helper `native/linux-x64/sa-contain` |
  | `linux` | `arm64` | the helper `native/linux-arm64/sa-contain` |
  | `darwin` | `arm64` or `x64` | the helper `native/darwin/sa-contain`: one universal binary, with `arm64` and `x86_64` code |
  | `win32` | `x64` or `arm64` | a Job Object, through the script of NEW-D3-11; no helper |
  | any other pair | | none, so no soldier starts (NEW-D3-6) |

  - Each Linux binary is statically linked, so it doesn't depend on the system's C library, and one binary per processor runs on glibc and musl distributions, old and new. It needs `/proc` and Linux 3.4 or later, which has `PR_SET_CHILD_SUBREAPER`.
  - The macOS binary runs natively on Apple silicon and on Intel, whichever processor Node.js reports. Its minimum macOS version is the oldest one CI tests.
  - **Supported** means that CI ran the containment tests on that system and processor for the release (NEW-D3-13). For macOS it also means the versions from the oldest to the newest that CI tested. Each release's notes list them. Linux distributions aren't listed: the check decides (NEW-D3-6).
  - On a macOS newer than any that CI tested, the check still decides, and the post office's log says that version is untested.
- **NEW-D3-5** (M1; I, R) **Packaging and installing.** Installing or running Shadow Army from its release package MUST NOT compile anything.
  - The release package is the npm package tarball that CI builds (NEW-D3-12). It holds every binary of NEW-D3-4, and the Windows script and its C# file (NEW-D3-11), beside the post office's code. The same tarball is attached to the release on GitHub. It is also what the npm registry serves, when the project publishes there.
  - The package has no install script (`preinstall`, `install` or `postinstall`) and no `binding.gyp`. So npm builds and runs nothing when it installs the package, and `--ignore-scripts` changes nothing. Its `os` and `cpu` fields stay open: it installs anywhere, and NEW-D3-6 refuses soldiers where there is no containment.
  - Nothing is downloaded at install or at run time. The helper comes inside the package from wherever npm gets the package: the registry, a mirror, npm's cache or a tarball. npm's own proxy and certificate settings apply (`proxy`, `https-proxy`, `cafile`). Shadow Army makes no network request of its own for the helper, so once installed it works offline.
  - The post office runs the helper and the script from the installed package. It never runs a copy in a temporary folder, which may be mounted `noexec`, or one written from a string.
  - The SHA-256 of each binary, of the script and of its C# file is written into the post office's code when the package is built. The post office checks each file against it before each run. A file that has changed is refused, for example after Shadow Army was updated under a running post office.
  - A checkout of the repository holds no binaries. There, `npm run build` compiles the helper for its own system with that system's C compiler, and writes its checksum into that build. That path is for contributors and CI only; nothing in the package compiles anything.
- **NEW-D3-6** (M1; I, F) **No containment, no soldier.** A soldier's CLI MUST NOT start without containment.
  - **The check.** The post office checks containment on the machine as it is then, within 10 seconds. It does this when it starts, before any soldier starts, and again before a soldier is reconnected or started after a failed check or a failed containment (NEW-D3-7):
    1. there is a helper for this system and processor (NEW-D3-4), and the post office can run it. On Windows, the script and its C# file are there (NEW-D3-11);
    2. each file's SHA-256 matches the one in the post office's code (NEW-D3-5);
    3. on Linux, the helper sets the subreaper mark and reads it back. On macOS, the helper finds every call it looks up at run time, every structure has the size it expects, and a signal through its own audit token is delivered (NEW-D3-10). On Windows, the script runs in FullLanguage mode (NEW-D3-11);
    4. a probe, a script in Shadow Army's package, starts in containment exactly as a CLI does. It starts a child, which starts a new session, forks a grandchild and exits. The listing shows the probe and the grandchild (NEW-D3-3), and on macOS the coalition is new (NEW-D3-10). The tree is then killed with no grace. Only the probe and the grandchild hold a pipe open for writing; on macOS it is a named pipe. When that pipe reaches its end, both have ended. That is the proof, not the listing or the helper's report.
  - **When a step fails,** no soldier starts, and the post office keeps running. Its log, each soldier's log and one line in Claude's transcript say what failed. Each names the system and its version, the processor and Shadow Army's version. From M5, `/army` shows it on each soldier's row (HOST-9, →M5). For example:
    - `No containment helper for linux-riscv64, so no soldier can start. Supported: Linux x64 and arm64, macOS, Windows x64 and arm64.`
    - `The containment helper doesn't match Shadow Army 2.0.1. If Shadow Army was just updated, start a new Claude session; otherwise reinstall it. No soldier can start.`
    - `Containment failed its check on macOS 27.1 (arm64): a test process outlived its containment. No soldier can start. A newer Shadow Army may fix this.`
    - `Containment can't be set up on Windows 11 (arm64): PowerShell runs Shadow Army's script in ConstrainedLanguage mode, as under an AppLocker or App Control policy. An administrator can allow the script by its hash, listed in SHA256SUMS. No soldier can start.`
  - **Who decides.** This spec decides. No setting, flag, environment variable or command lets the owner or the Monarch start a soldier uncontained, and the owner is never asked to accept one. The owner's way forward is the message's: reinstall Shadow Army, update it, or have an administrator allow the script.
  - **A failure is not remembered.** A reconnect, or the next start of a soldier, runs the check again without restarting the post office.
  - **When it passes,** the post office's log names the containment (a subreaper, a coalition or a job) and the SHA-256 of each file it checked.
  - **An update of the system** can change what containment rests on, most likely on macOS (NEW-D3-10). The first check after such an update fails, and no soldier starts until the owner installs a release whose check passes on that version. Nothing else changes: records, logs, worktrees and branches stay as they are. The project finds the break through NEW-D3-13's weekly run, and the fix ships as a patch release.
- **NEW-D3-7** (M1; F) **When containment fails during a session.**
  - **A guardian ended from outside.** If a session's guardian ends while the session is open, and the post office didn't ask it to, the channel has crashed (PO-1). Before anything else, the post office ends what it can still reach:
    - **macOS.** It removes the session's launchd job, so launchd doesn't start the guardian again, and then ends the coalition by the id it recorded (NEW-D3-2, NEW-D3-8). Nothing escapes, and the channel restarts as after any crash (PO-1).
    - **Windows.** The job's last handle closed with the guardian, so the system has ended every process in the job. Nothing escapes, and the channel restarts as after any crash (PO-1).
    - **Linux.** The kernel has handed the guardian's descendants to a subreaper above it, or to init, out of Shadow Army's reach. The post office ends every process still in the guardian's process group, and each process of the tree's listings whose identity still matches (NEW-D3-3, NEW-D3-8). Others may still run, so the containment has failed.
  - **The containment has failed** when a Linux guardian was ended from outside, and on any system when:
    - the helper or the script reports an error;
    - a session's containment isn't ready at its start (NEW-D3-1);
    - a tree isn't empty 10 seconds after its kill began (NEW-D3-2). One cause is a process that runs as another user through `sudo`, which the owner's user can't signal.
  - **Then:**
    - The soldier is down. Its log and one line in Claude's transcript say what failed, and name each process left by its pid and its command line through `redact()` (WSP-8). For example: `Containment failed for Iron: 1 process couldn't be ended (4242 sudo make install). Iron is down and won't restart by itself.` Where the post office can't tell which processes remain, as after a Linux guardian was ended from outside, the error says that processes the CLI started may still be running.
    - The soldier isn't restarted by itself, whatever PO-1's count says. A reconnect runs the check first (NEW-D3-6), and starts the CLI only once no process the error named still runs.
    - A turn that was running isn't over while a process the post office named still runs (PO-8, →M2). The turn's guard stays open and the soldier's queue waits. The post office tries to end those processes again every 10 seconds, and once all have ended it finishes the turn as PO-8 (→M2) says. Where it can't tell which processes remain, it finishes the turn as cut short (PO-8, →M2), and the error says that what those processes change won't be on the turn's attribution card.
- **NEW-D3-8** (M1; I, F) **What a dead post office leaves.** A guardian can end together with the post office, for example when both are killed.
  - **The record.** Before a CLI starts, the post office adds an entry for its tree under `.shadow/v2/trees/`: one JSON Lines file per tree, each line flushed as it is written. A reader skips a line that doesn't parse, as for logs (PO-5). The CLI doesn't start until its entry is written. The entry holds:
    - the post office's pid and start time;
    - the guardian's identity, and the CLI's once it has started (NEW-D3-3);
    - on macOS, the launchd job's label and the coalition's id, which the kernel never reuses;
    - on Linux, the identity of each process each listing of the tree finds (NEW-D3-3), added as the post office lists it.

    The entry is removed once the tree has ended. It holds no secret and no nonce.
  - **The mod.** The post office's output can end with no shutdown event (PO-7). Then the mod has every tree that the post office's entries name ended at once, through the same code as the sweep below. It starts no post office for that (HOST-2).
  - **The sweep.** Before it opens any channel, and before it finishes what the last post office left open (PO-1), a post office ends every tree whose entry belongs to a post office that is no longer running. It judges that by the entry's pid and start time, as the lock does (PO-1):
    - **Linux.** Every recorded process whose identity still matches is ended. A process is never ended for its session or process-group id alone, because that id may now belong to an unrelated process.
    - **macOS.** The recorded job is removed if launchd still has it, and every member of the recorded coalition is ended (NEW-D3-2).
    - **Windows.** Nothing is left: the job ended when its last handle closed.
  - **macOS.** launchd starts a killed guardian again (NEW-D3-10). A guardian that can't reach its post office, at its start or later, ends every other member of its coalition and then has launchd remove its job. Spike S7 measures how soon.
  - Claude's transcript gets one line, as in `the post office stopped unexpectedly; 3 processes Iron and Igris started were ended`. The log names each process, with its command line through `redact()` (WSP-8).
  - **What is left running.** Until the mod or the next post office ends them, those processes keep running. If the mod ended too, as when Claude Code is killed, they keep running until a post office next starts in this folder. On Linux, a process that no listing found keeps running. Both are stated residual risks (PO-1).
- **NEW-D3-9** (M1; X, R) **What the containment helper may do.** It does only the operations below, each named on its command line. It refuses any other operation and does nothing.
  - **Linux.** As the guardian: mark itself a child subreaper, start the CLI, watch its pipe to the post office, and end and reap the tree (NEW-D3-1, NEW-D3-2). It also runs its part of the check (NEW-D3-6).
  - **macOS.** As the guardian: connect back to the post office, start the CLI, pass the CLI's standard streams, and end the rest of its own coalition (NEW-D3-10). As a tool the post office runs: read a process's coalition, unique id and status; list a coalition's members; stop and kill, by their audit tokens, the members of one coalition that the post office recorded for a session; and run its part of the check.
  - It reports each result to the post office as one line of JSON. The report goes on a pipe of its own, or, for the macOS guardian, on its connection, and never on the CLI's standard streams.

  It MUST NOT:
  - signal or change any process outside its session's containment, signal a process in the post office's own coalition or launchd's, or signal by a pid that may have been reused;
  - start any program except the CLI (or the check's probe in its place) and, on macOS, `/bin/launchctl remove` for its own session's job;
  - open a network connection, except the macOS guardian's one connection to the post office on the loopback address (PO-2), or listen on any port;
  - create or write a file;
  - look into, keep or log the CLI's arguments, environment or standard streams, beyond passing them to the CLI unchanged (CH-7);
  - receive the Monarch's secret (PO-3), in its arguments, its environment or its input;
  - run with more than the owner's user's rights. It has no setuid or setgid bit and never asks for administrator rights, and its macOS signature grants no entitlement;
  - load any code except its own and the system's libraries;
  - leave anything behind. No process, launchd job or file of a session outlives that session, except as NEW-D3-8 says.

  Its source is C. It uses only the system's C library and headers, and has no third-party dependency. Every change to it is reviewed as security code, against these lists and NEW-D3-10's. Tests enforce what they can:
  - on Linux, the tests trace the helper's own system calls in every containment test, and fail on any call outside an allowlist;
  - on macOS, CI fails if the binary imports a symbol outside an allowlist, or if its signature carries an entitlement.
- **NEW-D3-10** (M1; R, I, L) **macOS: the guardian, what it rests on, and signing.**
  - **Start.**
    - The post office has launchd start the session's guardian as a job of its own, with `launchctl submit` and a label unique to the session. `launchctl submit` needs no configuration file, and Shadow Army writes none: no launch agent, no login item.
    - The guardian connects back to the post office over the loopback address (PO-2) with a one-time nonce. The label is on its command line. The nonce reaches it in a file that only the owner's user can read, in a folder outside the folder's directory tree, and the post office removes that file once the guardian has connected. The Monarch's secret is never in either (PO-3).
    - Before it sends the CLI's command, the post office checks two things. launchd must list the guardian's pid under the session's label (`launchctl list`). The guardian's coalition must be new: not the post office's, and with no member but the guardian.
    - The post office records the coalition's id (NEW-D3-8), and passes the helper no other coalition.
  - **End.** As NEW-D3-2 says, with the job removed first. Because launchd keeps a job made with `launchctl submit` alive after a failure, a guardian that can't reach its post office ends the rest of its coalition and then has its job removed (NEW-D3-8).
  - **What it rests on.** Of all this, only `launchctl submit`, `list` and `remove` are documented, in launchctl's manual page, among its legacy subcommands. Everything else is an interface that Apple doesn't publish:
    - `proc_pidinfo`, `proc_listallpids` and `proc_signal_with_audittoken` come from `libproc.h`. That header's own comment says it "contains private interfaces", which "are subject to change in future releases";
    - the flavours that read a process's coalition, unique id and pid version (`PROC_PIDCOALITIONINFO`, `PROC_PIDUNIQIDENTIFIERINFO`), and their structures, come from `proc_info_private.h` in Apple's open-source kernel. The helper declares the structures itself;
    - `__proc_info_extended_id` ties each of those reads to one process by its unique id. No Apple header declares it;
    - the helper fills in an audit token with a pid and its pid version. The token's layout appears in Apple's kernel tests, not in its documentation;
    - Apple documents coalitions nowhere. That launchd gives each job a coalition of its own, and that a process's children join its coalition, is how Apple's kernel source and launchd behave today.

    Apple can change any of these in an update, without notice. The helper looks up the private calls each time it runs, not when it is built, and checks the size of every structure it reads. A missing call, a size that differs or a coalition that isn't new fails the check (NEW-D3-6), and then no soldier starts.
  - **Signing.** The macOS binary is signed with the project's Developer ID Application certificate, with the hardened runtime and a secure timestamp. Apple's notary service notarizes it, as Apple requires for software distributed with a Developer ID. It claims no entitlement. A notarization ticket can't be stapled to a standalone binary, so NEW-D3-AC8 confirms that an installed helper runs with the network off. A Developer ID needs the project's Apple Developer Program membership. The signing and notary credentials are used only by the release workflow (NEW-D3-12).
- **NEW-D3-11** (M1; I, F, R) **Windows: the script.**
  - The guardian is a PowerShell script that ships in Shadow Army's package as a file at a fixed path. Beside it is a C# file that declares Windows' job functions.
  - The post office runs the script from there, never from a copy written elsewhere. It uses Windows PowerShell 5.1, which ships with Windows, found by its absolute path in the Windows folder, never on `PATH`: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script>`. A Group Policy execution policy still overrides `Bypass`.
  - The script loads the C# file with `Add-Type -Path`, which compiles it into an in-memory assembly. No code sits in a string (VER-6).
  - The script does on Windows what NEW-D3-1 and NEW-D3-2 say. When its connection to the post office closes without a close command, it ends the job. If its own process ends, the job's last handle closes, and Windows ends every process in the job.
  - **ConstrainedLanguage mode.** An AppLocker or App Control for Business policy that doesn't allow the script makes PowerShell run it in ConstrainedLanguage mode. In that mode `Add-Type` can't load C# code or Win32 functions. The script checks its language mode before anything else, and in that mode it refuses with that reason. The check then fails (NEW-D3-6), and no soldier starts. An administrator decides whether soldiers run on that machine, by allowing the script by its hash, which each release lists in `SHA256SUMS` (NEW-D3-12). The hash changes whenever the script changes.
  - It needs Windows 10 or 11, or Windows Server 2016 or later.
- **NEW-D3-12** (M1; R) **Built, checked and attested in CI.**
  - **Where.** CI builds every binary from the commit it tests or releases, on GitHub-hosted runners. No binary that ships is built anywhere else.
  - **Pinned toolchains.** The Linux binaries are built in a container image named by its digest. The macOS binary is built with a named Xcode version on a named runner image. Changing either is a reviewed change to the workflow.
  - **Reproducible.** Two jobs on separate runners build each binary from the same commit. Their outputs MUST be byte-identical, with the macOS one compared before signing, or the run fails.
  - **Checksums.** The SHA-256 of every binary that ships, and of the Windows script and its C# file, goes into the post office's code (NEW-D3-5), into a `SHA256SUMS` file in the package, and onto the release.
  - **Provenance.** Each binary and the package tarball get a GitHub artifact attestation, which `gh attestation verify <file> -R <owner>/<repo>` checks. A package published to the npm registry is published with provenance, which `npm audit signatures` checks. Both need the repository to be public when the release is built: npm makes no provenance for a private repository, and GitHub attests a private repository's builds only on GitHub Enterprise Cloud. A release built without them says so in its notes, and still has the checksums and the reproducible builds.
  - **The release.** The release workflow runs only for a release tag. In this order, it:
    1. builds the binaries again, and checks them against those the commit's CI run built and tested;
    2. signs and notarizes the macOS binary (NEW-D3-10);
    3. runs the containment tests on the signed bytes, on every macOS runner of NEW-D3-13;
    4. attests and publishes, only after the first three steps pass.

    The Apple credentials are secrets of a GitHub environment that only this workflow uses. For a private repository, environment secrets need GitHub Pro, Team or Enterprise. Where GitHub offers required reviewers (a public repository, or GitHub Enterprise), the owner approves each run.
- **NEW-D3-13** (M1; R) **CI on every system and processor.**
  - Every CI run builds the binaries first (NEW-D3-12), and every later job uses those bytes.
  - The containment tests (NEW-D3-1 to NEW-D3-3, NEW-D3-6 to NEW-D3-9, NEW-D3-11) run on:
    - Linux x64 and arm64, on the oldest and the newest Ubuntu that GitHub hosts;
    - Alpine Linux (musl) in a container, on x64 and arm64;
    - macOS on Apple silicon and on Intel, each on the oldest and the newest version that GitHub hosts;
    - Windows x64 and arm64.
  - **Install test.** On each of these systems, CI installs the package tarball with npm, with `--ignore-scripts`, and with the network off once the package's dependencies are in npm's cache. It then starts a fake soldier through the installed helper or script. The test passes only if the helper is still executable and every checksum still matches.
  - **Weekly.** A scheduled run tests the latest release on the newest runner image of each supported system, so a new image is tested within a week of GitHub offering it. A failure opens an issue. GitHub turns off a public repository's schedules after 60 days without activity, so each release's checklist confirms that the schedule is on.
>>> END

D-3, §5.1 I: containment with what ships.
<<< OLD
  - crash, restart and resume.
=== NEW
  - crash, restart and resume;
  - containment on each system and processor, with the binaries and the script that ship: a CLI's detached child is listed and then ended, and the post office is killed with and without its guardian (NEW-D3-1 to NEW-D3-3, NEW-D3-8, NEW-D3-13).
>>> END

D-3, §5.1 X: the helper's limits.
<<< OLD
  - The mod has no approval path.
=== NEW
  - The mod has no approval path.
  - The containment helper makes only the system calls and imports its allowlists name, signals nothing outside its session's containment, and never receives the Monarch's secret (NEW-D3-9, PO-3).
>>> END

D-3, R-M1-59 and R-F-68, §5.1 F: containment that can't be set up, a guardian killed, and a process that can't be signalled.
<<< OLD
  - a broken link in a worktree.
=== NEW
  - a broken link in a worktree;
  - a containment helper or Windows script that is missing, can't be run, has changed or fails its check; a guardian killed during a session, and one killed together with the post office; and a process the owner's user can't signal (NEW-D3-6 to NEW-D3-8).
>>> END

D-3, VER-2: the containment tests also run on each processor, with the bytes that ship.
<<< OLD
- **VER-2** (M1; R) **Three systems.** CI runs every test level except L and R on ubuntu, macos and windows.
=== NEW
- **VER-2** (M1; R) **Three systems.** CI runs every test level except L and R on ubuntu, macos and windows. The containment tests also run on every system and processor that NEW-D3-13 lists, with the binaries and the script that ship.
>>> END

D-3 and R-M1-61, VER-6: how the helper's C counts. The Windows C# lives in a file of its own, and spike S7 finds how it is measured.
<<< OLD
Code in another language, such as a native helper or a PowerShell script, keeps the same bars through that language's own coverage tool, counted over the systems it runs on (VER-2).
=== NEW
Code in another language, such as a native helper or a PowerShell script, keeps the same bars through that language's own coverage tool, counted over the systems it runs on (VER-2). The containment helper's C counts as the post office's: its lines are measured on a build of the same source instrumented for coverage, run by the same tests, and join the same count (NEW-D3-9). The Windows script and its C# file count the same way. How their lines are measured is what spike S7 finds, since the C# is compiled at run time (NEW-D3-11).
>>> END

D-3, §6 M1: Implements.
<<< OLD
- PO-1, PO-2, PO-3, PO-5, PO-7;
=== NEW
- PO-1, PO-2, PO-3, PO-5, PO-7, NEW-D3-1 to NEW-D3-13;
>>> END

D-3, §6 M1: spike S7, which holds what only a live run settles (the judge took it from C for every option).
<<< OLD
- VER-1, VER-2, VER-3, VER-5, VER-6, VER-7, VER-9.
=== NEW
- VER-1, VER-2, VER-3, VER-5, VER-6, VER-7, VER-9.

- **S7 Containment**, a spike in M1, done before its containment ACs are claimed, with no model call. It answers:
  - on a Mac: whether a CLI started inside a launchd job raises a privacy prompt or notification that the same CLI started from a terminal doesn't, with the checkout in `~/Documents`; whether a helper with only an ad hoc signature, installed through npm, runs with no Gatekeeper prompt; and whether launchd starts a killed guardian again, after what delay, and in the same coalition;
  - on Windows: whether `Add-Type` works in a script that an AppLocker or App Control policy allows; whether Smart App Control puts the script into ConstrainedLanguage mode; how the windows runner applies a policy that doesn't allow the script, for NEW-D3-AC4; and how the C# file's lines are measured (VER-6);
  - on every system: whether any CLI needs to break away from its containment, and whether each CLI exits when its input ends.

  Its report goes on #63, and its findings go into NEW-D3-6, NEW-D3-8, NEW-D3-10, NEW-D3-11 and VER-6. A finding that would change what the owner pays or installs goes to the owner.
>>> END

D-3, R-M1-59, R-M1-61 and R-F-68: M1's containment ACs, inserted after M1-AC12.
<<< OLD
- **M1-AC12** Text from a fake claude holding ESC, a bidirectional control and a zero-width character shows each as a placeholder in the mod's transcript lines, and reaches Claude escaped the same way; its other characters are kept (SEC-6).
=== NEW
- **M1-AC12** Text from a fake claude holding ESC, a bidirectional control and a zero-width character shows each as a placeholder in the mod's transcript lines, and reaches Claude escaped the same way; its other characters are kept (SEC-6).
- **NEW-D3-AC1** Containment with the binaries and the script that ship, on each system and processor that NEW-D3-13 lists, with a fake CLI (NEW-D3-1, NEW-D3-2, NEW-D3-3, NEW-D3-11, PO-1):
  - the fake starts a child. The child starts a new session, clears its environment, forks a writer that appends to a file every 20 ms, and exits. The listing shows the writer with its identity. Closing the channel returns only once the file has stopped growing, within 10 seconds after the kill began, and the soldier's log names the writer;
  - the fake gets the arguments, environment and working directory it would get if the post office had started it directly, and on Linux and macOS the same resource limits. Its standard streams pass byte for byte. The post office hears the fake's own exit code while its writer still runs;
  - on Linux and macOS, a fake that ignores the end of its input gets `SIGTERM` 9.5 seconds after it was asked to exit. One that ignores both has its tree killed at 10 seconds. After a lost connection, the tree is killed with no grace;
  - a process of the same user outside the session survives every one of these endings;
  - on macOS, a test build of Shadow Army whose helper reports the post office's coalition as the job's, or whose job's coalition holds another process, starts no CLI, and the soldier is down with the reason;
  - on Windows, a child that asks to break away from the job fails to start. With the user's execution policy set to AllSigned, the job still starts. A process the fake creates through WMI outlives the close, as PO-1 says, and the test ends it.
- **NEW-D3-AC2** When the post office or a guardian dies (NEW-D3-2, NEW-D3-7, NEW-D3-8, PO-1):
  - the post office is killed while a fake's writer runs, once before and once after the fake's own process has exited. The writer stops within 10 seconds. On macOS, `launchctl list` then shows no Shadow Army job;
  - a session's guardian is killed while its writer runs. On macOS and Windows, the writer stops, launchd doesn't start the guardian again, and the channel restarts as after a crash. On Linux, a writer that stayed in the guardian's process group stops, and so does one that a listing found. The soldier is down and isn't restarted, and its error says that other processes may still run;
  - the post office and the guardian are killed together while the fake mod lives. On every system, a writer that a listing found stops within 10 seconds, and Claude's transcript gets one line with the count. With the mod gone too, the next post office in that folder ends the writer before it opens any channel. On Windows, the writer has already ended with its job;
  - a process that has since taken a recorded pid, with another start time, is left running;
  - review confirms that each guardian is the helper on Linux and macOS and the script on Windows, never a Node.js process, and that on Linux and macOS it runs in a session and process group of its own.
- **NEW-D3-AC3** Choosing and installing the helper (NEW-D3-4, NEW-D3-5):
  - on each system and processor, the post office uses the binary NEW-D3-4 names. `lipo -archs` lists `x86_64 arm64` for the macOS binary, and each Linux binary is statically linked;
  - in a unit test, a system or processor with no binary gets NEW-D3-6's message, and the post office keeps running;
  - the package has no install script and no `binding.gyp`. Installed with `--ignore-scripts` and the network off, it starts a fake soldier, running the helper or the script from the installed package.
- **NEW-D3-AC4** No containment, no soldier (NEW-D3-6, NEW-D3-11):
  - each of these, in turn, makes the check fail, and no soldier starts: a missing helper; one that can't be run; one with a byte changed; a test build of Shadow Army whose containment fails each step of the check on purpose; and, on Windows, a script with a byte changed, and the script under an AppLocker or App Control policy that doesn't allow it (spike S7). Each time the post office keeps running, and its log, each soldier's log and one line in Claude's transcript give NEW-D3-6's message for that cause;
  - once the cause is gone, a reconnect reruns the check without restarting the post office, and starts the soldier;
  - review confirms that no setting, flag, environment variable or command starts a soldier after a failed check.
- **NEW-D3-AC5** Containment that fails during a session, on Linux and macOS (NEW-D3-7, PO-1, PO-8, →M2):
  - a fake's child runs as another user through `sudo`, and its command line holds a `Bearer` value. Closing the channel fails 10 seconds after the kill began. The soldier is down, with an error that names that process with the value redacted, and it isn't restarted. A reconnect while that process runs starts no CLI;
  - when this happens during a turn, the turn's guard stays open until the process ends, and then the turn is finished once.
- **NEW-D3-AC6** The helper does only what NEW-D3-9 allows (NEW-D3-9, PO-3):
  - on Linux, a trace of the helper's own system calls in every containment test stays inside the allowlist;
  - on macOS, the binary imports only allowlisted symbols, and its signature carries no entitlement;
  - no file in the package has a setuid or setgid bit, and an unknown operation is refused and changes nothing;
  - the Monarch's secret is in no argument, environment, input or nonce file of the helper or of a guardian.
- **NEW-D3-AC7** A release dry run from a test tag (NEW-D3-10, NEW-D3-12, NEW-D3-13, VER-2, VER-6):
  - each binary built twice is byte-identical, with the macOS one compared before signing, and matches what the commit's CI run tested;
  - the macOS binary carries the project's Developer ID, the hardened runtime and a secure timestamp. It is notarized, and the signed binary passes the containment tests on every macOS runner;
  - `SHA256SUMS`, the checksums in the post office's code, the binaries, the script and its C# file all agree;
  - `gh attestation verify` passes for each binary and for the tarball. Where attestations aren't available, the release notes say so;
  - CI's matrix covers every system and processor of NEW-D3-13, the weekly run exists, and VER-6's count includes the helper's C and the Windows script's C#.
- **NEW-D3-AC8** Live: on a Mac and on a Linux machine, neither of which has a C compiler, the owner installs the package tarball and starts a claude soldier, once with the network off. Nothing asks for a compiler. On the Mac, the checkout is in `~/Documents` and the soldier reads a file there, and no system dialog, privacy prompt or notification appears. Closing the soldier leaves no process, and on the Mac no launchd job, behind. The run is written up on the PR (NEW-D3-5, NEW-D3-10).
>>> END

D-3, §8: Q8 closes and is recorded as answered, the way Q2 ("(answered by spike S2)") and Q6 ("(answered by VER-10)") are: the marker, the question, then the answer.
<<< OLD
- **Q8** M1's draft (#75) stops processes from escaping a closing session (PO-1) with a small C helper, compiled on the owner's machine the first time a session starts on Linux or macOS. It needs a C compiler there (on macOS, Xcode's command-line tools). On macOS it reads process details through structures Apple doesn't publish, so an update could break it; then it refuses to start a soldier rather than run one uncontained. Keep it, ship the helper prebuilt for each system and processor, or contain processes another way? Decide before v2.0.0.
=== NEW
- **Q8** (answered by D-3) How does the helper that contains each CLI's processes (PO-1) ship: compiled on the owner's machine at first use, as M1's draft (#75) does, prebuilt, or not at all? Prebuilt. There is one binary for each supported system and processor, built, tested, checksummed and attested in CI, inside Shadow Army's package, so nothing is compiled or downloaded on the owner's machine (NEW-D3-4, NEW-D3-5, NEW-D3-12). On macOS it still rests on interfaces Apple doesn't publish, so an update can stop every macOS soldier until a release fixes it. It never runs one uncontained (NEW-D3-6, NEW-D3-10). Windows needs no helper: a script that ships with Shadow Army holds each CLI in a Job Object (NEW-D3-11).
>>> END

**What I couldn't place, or left for others**
- **§7 Decisions.** There is no ADR for D-3. B proposed "0016 Process containment ships as a prebuilt helper …", but no ADR file exists, and header line 12 says "ADR-0008 to ADR-0015", which I didn't touch. The orchestrator decides whether D-3 gets an ADR.
- **D-4 (threat model)** should carry these residuals. I didn't write them into D-4's appendix:
  1. A guardian ended from outside on Linux, or killed together with the post office, lets processes that no listing found escape. On macOS and Linux, a tree also runs on until the mod or the next post office sweeps it if the mod dies too.
  2. macOS containment rests on interfaces Apple doesn't publish. An update can stop every macOS soldier; that fails closed.
  3. On Windows, under AppLocker or App Control, no soldier starts until an administrator allows the script. That limits availability; nothing escapes.
  4. Containment is cleanup, not a sandbox.
  5. Work handed to services outside the tree is already in PO-1 at line 204.
- **Owner prerequisites from the card** need actions outside the spec, so no spec line holds them: the Apple Developer Program (99 USD a year); a public repository, or Enterprise Cloud, for attestations; a paid GitHub plan for environment secrets in a private repository; and removing `"private": true` before npm publishing. NEW-D3-12 states the dependencies only.
- **Probes and S7.** probes.md's P-5, P-6, P-7, P-8 and P-10 map onto spike S7's items. P-9 applies only to option C and is dropped. Review-internal probe IDs are kept out of the spec.
- **HOST-2.** NEW-D3-8 adds a sweep run by the mod when the post office's output ends with no shutdown event (taken from C:116). I didn't edit HOST-2's text; whoever owns HOST-2 may want a cross-reference.
- **Codex must match** (read from C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts; no code copied):
  - The Linux guardian is a Node process that inherits the subreaper mark (line 52). NEW-D3-1 makes the guardian the helper itself.
  - The macOS guardian is a `node -e` string (lines 301 and 336-360), with its bootstrap file in tmpdir (216, 298).
  - The Windows script is written from a string into a temporary folder (419), and its C# sits in a here-string (506).
  - VER-6 and NEW-D3-5/-11 now forbid each of these.

**Findings against v0.10 (review schema)**

```
- severity: P2
  type: decision-needed
  location: Q8, PO-1 (docs/spec/v2.md:908, 203)
  claim: The owner's answer B says "prebuilt for each supported system and processor", yet Windows keeps a run-time C# compile through Add-Type, which is the one path that fails in locked-down enterprises and can't be measured for coverage.
  scenario: Windows 11 under an App Control policy -> PowerShell runs the unallowed script in ConstrainedLanguage mode, Add-Type can't load the C#, and no soldier starts until an administrator allowlists the script. Separately, VER-6 can't yet measure the in-memory C# (R-M1-61, P-10).
  evidence: about_Language_Modes (Add-Type blocked in ConstrainedLanguage); the App Control script enforcement page ("Any PowerShell script that isn't allowed by App Control policy still runs, but only in Constrained Language Mode"); the D-3 judge took C's Windows text "whichever option wins".
  fix: "decision: (a) keep the shipped script and Add-Type, as drafted (judge); (b) ship a prebuilt, Authenticode-signed Windows helper (x64, arm64) built in the same CI, which removes Add-Type, ConstrainedLanguage and the C# coverage gap, at the cost of a Windows code-signing certificate"
- severity: P2
  type: contradiction
  location: PO-1 (docs/spec/v2.md:199)
  claim: "A start counts as a crash when it ends before the CLI's first event", so a guardian whose containment fails at start would be restarted three times as a crash, while R-F-68 says such a soldier doesn't start.
  scenario: The macOS coalition isn't new at a session's start -> read as a crash, the channel restarts after 1 s, 5 s and 30 s; read as R-F-68, it is down until a reconnect.
  evidence: PO-1 line 199; ledger R-F-68.
  fix: applied in the blocks above. PO-1's Restarts sentence now says "A channel whose containment failed, at its start or later, is not a crash and is never restarted by itself (NEW-D3-7)", and NEW-D3-1 "At start" defines the case.
- severity: P2
  type: vendor-fact
  location: NEW-D3-2, NEW-D3-8, NEW-D3-10 (new text; replaces docs/spec/v2.md:203)
  claim: The macOS order rests on undocumented launchd behaviour: what `launchctl remove` does to the job's process and the rest of its process group, and whether a killed `launchctl submit` job restarts in the same coalition.
  scenario: If launchd restarts the guardian in a new coalition -> the restarted guardian ends nothing, and a tree whose guardian died with the post office runs until the mod's sweep or the next post office's.
  evidence: launchctl(1), legacy subcommands (only as `man launchctl`; unofficial copy at https://leancrew.com/all-this/man/man1/launchctl.html): `submit` "tells launchd to keep the program alive in the event of failure", `remove` "will return immediately and not block until the job has been stopped". NEEDS-PROBE (P-8, spike S7).
  fix: keep the sweep as the backstop, as drafted. Once S7 answers, NEW-D3-8 states the measured delay or drops the restarted-guardian sentence.
- severity: P2
  type: readiness
  location: M1, NEW-D3-AC7, NEW-D3-AC8, S7 (new text after docs/spec/v2.md:685, 735)
  claim: M1 can't close without a Mac, an Apple Developer ID and notarization, but probes P-5, P-6 and P-8 are still "waiting for the owner's go and a Mac".
  scenario: Codex finishes M1's code -> NEW-D3-AC7 (notarized dry run) and NEW-D3-AC8 (live Mac run) can't be evidenced, and M1 stalls.
  evidence: probes.md lines 11, 12 and 14; the D-3 card ("99 USD a year").
  fix: decision: the owner confirms Mac access and Developer Program enrolment before M1's containment ACs are claimed, or the dry run's signing step moves to the first release.
- severity: P3
  type: untestable
  location: VER-6 (docs/spec/v2.md:651)
  claim: How the Windows C# is measured still waits on spike S7 (R-M1-61, P-10), so VER-6's bar for it can't be checked yet.
  scenario: The windows CI job runs the script -> no tool reports the in-memory assembly's lines, and the 85% count leaves them out silently.
  evidence: ledger R-M1-61; the Add-Type page ("generates an in-memory assembly"; -Path also accepts DLL files, which may let CI load an instrumented build).
  fix: after S7, name the tool and the build in VER-6.
- severity: P3
  type: decision-needed
  location: §7 Decisions, header (docs/spec/v2.md:12, 886-897)
  claim: D-3 is a big decision (PLAYBOOK §14) with no ADR.
  scenario: A later reader looks for why containment ships prebuilt -> finds only Q8's one line.
  evidence: decisions.md D-3, "Kind: big".
  fix: decision: add ADR-0016 "Process containment ships prebuilt and is checked at every start", or record it in Q8 only.
```

**Sources**
- Files:
  - C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@e7c33b4.md
  - C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-3-option-B.md
  - C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-3-option-A.md
  - C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-3-option-C.md
  - C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-3-judge.md
  - C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md (D-3)
  - C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md (R-M1-5, -9, -50, -59, -60, -61, R-F-68)
  - C:\Users\johns\projects\AIConnections-review\docs\spec\review\probes.md
  - C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\settled.md
  - C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts (read only)
- Linux:
  - https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html
  - https://man7.org/linux/man-pages/man2/wait.2.html
  - https://man7.org/linux/man-pages/man5/proc_tid_children.5.html
  - https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html
  - https://man7.org/linux/man-pages/man2/kill.2.html
  - https://man7.org/linux/man-pages/man7/pipe.7.html
  - https://gcc.gnu.org/onlinedocs/gcc/Link-Options.html
- macOS:
  - https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.h
  - https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info_private.h
  - https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/coalition.c
  - https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_fork.c
  - https://github.com/apple-oss-distributions/xnu/blob/main/tests/proc_pidpath_audittoken.c
  - https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary
  - https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
  - https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
  - https://developer.apple.com/programs/
  - launchctl(1) (unofficial copy): https://leancrew.com/all-this/man/man1/launchctl.html
- Windows:
  - https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
  - https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute
  - https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/add-type?view=powershell-5.1 (-Path takes source files or DLLs and compiles source into an in-memory assembly; fetched 2026-10-20)
  - https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_language_modes?view=powershell-5.1
  - https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/design/script-enforcement (fetched 2026-10-20)
  - https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1
- npm, GitHub and Node.js:
  - https://docs.npmjs.com/cli/v11/using-npm/scripts
  - https://docs.npmjs.com/cli/v11/using-npm/config
  - https://docs.npmjs.com/generating-provenance-statements
  - https://docs.npmjs.com/trusted-publishers
  - https://docs.github.com/en/actions/reference/runners/github-hosted-runners
  - https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
  - https://cli.github.com/manual/gh_attestation_verify
  - https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
  - https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
  - https://nodejs.org/api/process.html
- Still NEEDS-PROBE (all in S7):
  - privacy prompts for a CLI started in a launchd job;
  - an ad-hoc-signed helper under Gatekeeper;
  - launchd's restart of a killed guardian, and its coalition;
  - Add-Type under a policy that allows the script, and Smart App Control;
  - measuring the C#;
  - whether npm keeps the executable bit (NEW-D3-13's install test settles this one).
