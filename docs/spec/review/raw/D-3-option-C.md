# D-3 option C draft (no native helper), against snapshot be9deb0

## Option C: no native helper (D-3, Q8)

Placement: NEW-1 to NEW-6 go in section 4.2, after PO-8 (after line 212). They take PO IDs (PO-9 onward) when the option is adopted. All six are new and replace nothing. The changed lines follow them.

### New requirements

- **NEW-1** (M1; R, I) **Containment on each system.** Each CLI runs inside a containment from the moment it starts. The containment uses only what its system ships.
  - Shadow Army MUST NOT compile, download or ship native code to contain processes. It needs no C compiler, no Xcode command-line tools and no native npm package. It uses only Node.js and the system tools named below.
  - **Linux: a systemd scope (full).** Where the owner's systemd user manager runs and the system uses the unified cgroup v2 hierarchy, the post office starts each CLI through `systemd-run --user --scope`.
    - The scope is named for the folder and the channel, with a random part. Stopping it kills every process in it at once (`KillSignal=SIGKILL`).
    - Every process the CLI starts, and every process those start, is born into the scope's cgroup, whatever its session, process group or parent. A process leaves the scope only by being moved (NEW-4).
    - The post office reads the scope's cgroup files and never writes them, because systemd owns them. It stops the scope only through the user manager (`systemctl --user stop`).
    - Only the CLI's cgroup changes. Its user, its process ids and the processes it can see stay as they are.
    - Needs: systemd, with a user manager for the owner, and cgroup v2. Under cgroup v2, `/proc/self/cgroup` is a single `0::` line. A desktop or SSH login starts a user manager. Elsewhere, `loginctl enable-linger` keeps one running. `systemd-run` and `systemctl` come with systemd.
  - **Linux: a PID namespace (full, and only if the owner allows it, NEW-5).** It is for a Linux without a usable scope, such as WSL without systemd.
    - The post office starts the CLI through util-linux's `unshare --user --map-current-user --pid --fork --kill-child --mount-proc`, in new user, PID and mount namespaces. Mounts made on the host still reach the CLI (`--propagation slave`).
    - A process can't leave its PID namespace. When the CLI ends, the kernel ends every process in the namespace, because the CLI is the namespace's first process.
    - It changes what the CLI sees, so it is never the default:
      - the CLI is the namespace's first process, so orphans in the namespace become its children;
      - the CLI's tools see only the namespace's processes;
      - files of any user other than the owner, root's included, show the overflow id 65534, so a tool that checks a file's owner can refuse to run.
    - A CLI runs in a namespace only after its adapter records, for that CLI's version, that the CLI's own sandbox works there (CH-7, CH-8, spike S7).
    - Needs: an `unshare` that has `--map-current-user`, and a system that lets the owner create a user namespace.
  - **Linux and macOS: partial containment (only if the owner allows it, NEW-5).** The CLI starts as the leader of a new session and process group (Node.js's `detached`). The post office watches the process table (NEW-2): it reads `/proc` on Linux and runs the system's `ps` on macOS. It needs nothing beyond the system. It is the only containment macOS has.
  - **Windows: a job object (full).**
    - For each channel, the post office runs a PowerShell script that ships with Shadow Army as text. The script runs in Windows PowerShell 5.1, which ships with Windows, as `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File`. Microsoft designed `Bypass` for a script built into a larger application. A Group Policy execution policy still overrides it.
    - The script creates a job object that allows no breakaway and ends its processes when its last handle closes (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`). It creates the CLI inside the job from the start (`PROC_THREAD_ATTRIBUTE_JOB_LIST`), and passes the CLI's standard streams through unchanged.
    - It declares Windows' job functions in C# through `Add-Type`, which compiles them into an in-memory .NET assembly. Nothing is installed, and no native code is built.
    - When the post office's connection to the script closes, the script ends the job. If the script's PowerShell process ends, the job's last handle closes, and Windows ends every process in the job.
    - Only the CLI's job changes. The CLI can still make jobs of its own inside it, as nested jobs.
    - Needs: Windows 10 or 11, or Windows Server 2016 or later, and Windows PowerShell running this script in FullLanguage mode (NEW-5).

- **NEW-2** (M1; U, I, F) **Reading the tree.** The post office reads each CLI's tree to know which processes are in it.
  - **Members:**
    - the CLI's own process;
    - with a scope, every process in the scope's cgroup and in the cgroups below it (`cgroup.procs`);
    - in a namespace, every process whose `/proc/<pid>/ns/pid` is the CLI's;
    - in partial containment, every process in the CLI's session (Linux: field 6 of `/proc/<pid>/stat`) or in its process group (macOS: `ps`'s `pgid`), and every process whose parent is a member;
    - on Windows, every process in the job;
    - with a scope and in partial containment, every process that carries the channel's marker.
  - Once a reading finds a process in the tree, the process stays a member until it exits, wherever it moves.
  - **The marker** is the environment variable `SHADOW_ARMY_MARK`, set to 16 random bytes in hex. Each channel start gets a new one.
    - A process inherits the marker unless a program starts it with a new environment.
    - On Linux the post office reads it from `/proc/<pid>/environ`. On macOS it reads it with `ps -E`, where the system shows other processes' environments; the check of NEW-5 finds out whether it does.
    - The marker grants nothing. It is not a credential (PO-3, PO-4).
  - **Identity.** A process is its id together with its start time: field 22 of `/proc/<pid>/stat` on Linux, and `ps`'s `lstart` on macOS. On Windows the post office reads the job's own process list.
  - **When.** The post office reads the tree:
    - every 250 ms while the soldier has a turn or work left running (PO-8);
    - every 2 seconds otherwise;
    - as each message goes in, after each end event, and before it ends a tree.
  - **During a turn.** A process joined the tree during a turn when a reading made after the turn's message went in finds it, and the reading made as the message went in did not (PO-8).
  - **Failure.** A failed reading, or one whose output can't be parsed, is never taken as an empty tree. The post office tries again for 10 seconds. After that the channel is down, with the error word for word.

- **NEW-3** (M1; I, F) **Ending a tree.** Ending a tree ends every member (NEW-2) at once, with SIGKILL or its Windows equivalent and no grace period. First the session is closed through its CLI, as PO-7 says.
  - With a scope, the post office asks the user manager to stop the scope. Then it ends every member outside the scope, as in partial containment.
  - In a namespace, the post office sends SIGKILL to the CLI, and the kernel ends every other process in the namespace.
  - In partial containment, the post office stops every member, and the CLI's process group, with SIGSTOP, then reads the tree again until no member is running. Then it sends SIGKILL to them all, and reads again until none is left. A stopped process can't start another, so a member that keeps forking can't outrun the end.
  - On Windows, the script terminates the job. It then checks the job's own accounting to confirm that no process in it is active.
  - The post office MUST NOT signal a process unless a reading made just before shows that id, with the same start time, in the tree.
  - **Left running.** The tree must be empty within 10 seconds, meaning no member is still running (a zombie counts as ended). If it isn't, the channel does not restart, whatever PO-1's count:
    - the soldier is down, and its state says why;
    - the soldier's log lists each process left: its id, its user, and its command line through `redact()` (WSP-8). From M5, `/army` and the pane list them too;
    - the usual case is a process that runs as another user, such as one started through `sudo`, which no process of the owner's may signal;
    - r reconnects once none of those processes is running.

- **NEW-4** (M1; R, F) **What can still escape, and what the owner is told.** A process escapes when it keeps running after its tree has been ended. Exactly these can escape:
  - **On every system:** a process that something outside the tree starts on the CLI's behalf. Containment holds only processes descended from the CLI. Examples:
    - on Linux: a process the user manager starts (`systemd-run --user`, `systemctl --user start`, or a service started over D-Bus); one a system daemon starts (cron, at, a container engine); and the processes of a login that PAM opens through pam_systemd (`ssh localhost`, `su -`), which get a scope of their own;
    - on macOS: a process that launchd or another daemon starts;
    - on Windows: a process created through WMI's `Win32_Process.Create` (Microsoft documents that it is outside the job), or by the Task Scheduler or a service.

    With a scope and in partial containment, the marker still finds such a process when it inherited the CLI's environment.
  - **With a scope:** also a process that moves itself, or is moved, into another of the owner's cgroups before a reading finds it, and carries no marker the post office can read. The kernel lets the owner's processes move between the cgroups the user manager delegates to the owner. `systemd-run --user --scope` makes such a move, and keeps the caller's environment.
  - **In a namespace:** nothing else. In the D-3 prototype (2026-10-14), the namespace ended every process in 20 of 20 runs.
  - **In partial containment:** also a process that, before a reading finds it, leaves the CLI's session (Linux) or process group (macOS), loses its parent, and carries no marker the post office can read.
    - A daemon that forks twice around `setsid` leaves its session and loses its parent at the same moment. In the D-3 prototype, every such daemon escaped both a process-group kill and a reading every 50 ms, in 20 of 20 runs. Only the marker can find such a daemon, and only when the daemon kept the CLI's environment.
    - The post office can't read a process's environment where the system forbids it. On macOS, where `ps` may show no other process's environment, no marker is read at all.
  - **On Windows:** nothing else. The job allows no breakaway, so a CLI feature that asks to break away fails, and the CLI reports the error as usual.
  - **What an escape means.** A process that escaped is not the turn's work (PO-8), and only the owner can end it. A change it makes to the checkout after the turn is over belongs to no turn, like the owner's own edits. So neither the guard nor the claim audit sees it (WSP-2, WSP-4, ARM-6).
  - **What the owner is told:**
    - before any soldier starts: the post office's log names each soldier's containment (scope, namespace, partial or job), and `/army` does too from M5. For a fallback it states the gap in one line, as in `partial (macOS): a process that leaves Iron's process group and loses its parent before a reading, with no marker, outlives the session`;
    - when the first soldier of a Claude session starts under a fallback: one line in Claude's transcript, with the same gap;
    - after each tree is ended: each member that was ended outside its scope or session, with its id and command, in the soldier's log;
    - a process that left without being seen can't be named afterwards. The statement made before the start is the owner's only notice of it.

- **NEW-5** (M1; U, I) **The check at start, and who decides.**
  - Before it opens any channel, the post office checks containment, within 10 seconds:
    - it starts a probe in a containment, as NEW-1 says;
    - it finds the probe and a child of the probe, as NEW-2 says;
    - it ends both, as NEW-3 says;
    - it notes whether it could read the probe's marker.
  - On Linux the post office tries the scope first. Where there is no usable scope, the owner's `containmentFallback` setting in `shadow.config.json` decides, and only the fallback set is tried:
    - `none`, the default: no soldier starts;
    - `namespace`: the PID namespace (Linux only);
    - `partial`: partial containment (Linux and macOS).
  - macOS has only partial containment, so with `none` or `namespace` no soldier starts there. Windows has no fallback, because without the job the post office can't tell which processes joined a tree (PO-8).
  - The post office MUST NOT start a soldier under a fallback the owner has not set. Shadow Army never sets `containmentFallback` itself. Any other value is refused at start, with an error that names the value.
  - A soldier that can't start shows error. Its message says what is missing, how to get full containment where the system offers it, and which setting to change, as in `Iron can't start: no systemd user manager is reachable. Log in, run loginctl enable-linger, or set containmentFallback in shadow.config.json (NEW-5)`. The reason quotes the failing tool's own error word for word: no `systemd-run`, an `unshare` the system refuses, `ps` output that can't be parsed, or Windows PowerShell missing, blocked, or in ConstrainedLanguage mode.
  - **ConstrainedLanguage mode** is how PowerShell runs under an AppLocker or App Control for Business policy.
    - In that mode `Add-Type` can't load C# code or Win32 functions, so the job can't be made, as the D-3 prototype reported.
    - The policy runs any script it allows in FullLanguage mode. So an administrator decides whether soldiers run on that machine, by allowing Shadow Army's script by its hash or by a publisher they trust. The hash changes whenever the script changes.
    - A Group Policy execution policy that requires signed scripts also overrides `-ExecutionPolicy Bypass`, and is likewise the administrator's to settle.
  - The check's result holds for the post office's whole life. A channel that can't start in that containment is never started another way. Its start fails with the tool's error, and PO-1's restart count applies.
  - **An OS update that breaks containment** makes the check fail at the next start, or makes a tree's end fail (NEW-3). Either is handled as above: the soldier doesn't start or is down, and its message says what failed. Nothing falls back silently. Each CI run makes the same check on the runner's current image (VER-2).

- **NEW-6** (M1; I, F) **What a dead post office leaves behind.**
  - Before a CLI starts, the post office adds an entry for it to a record under `.shadow/v2/`, beside the lock (PO-1). The entry holds:
    - the post office's own pid and start time;
    - the containment, and the scope's name if there is one;
    - the CLI's id and start time;
    - the marker.

    The CLI does not start until its entry is written. The entry is removed once the tree has ended. The record holds no secret.
  - When the post office ends without closing its channels, because it was killed or crashed, the mod ends every tree that the post office's entries name. It does this as soon as it sees the post office's process end, and before it starts another post office (HOST-2).
  - Before it opens any channel, a post office ends every tree whose entry belongs to a post office that is no longer running, judged by that entry's pid and start time (PO-1).
  - What is ended:
    - with a scope: the scope, stopped through the user manager, and then every process that carries the marker;
    - in a namespace: the recorded CLI, matched by id and start time. The kernel then ends the rest;
    - in partial containment: the recorded CLI, matched the same way, and every process that carries the marker. A process is never ended for its session or process-group id alone, because that id may now belong to an unrelated process;
    - on Windows: nothing is left. The script ended the job when the post office's connection closed. If the script had ended too, Windows ended the job's processes when the job's last handle closed.
  - Claude's transcript gets one line, as in `the post office stopped unexpectedly; 3 processes Iron and Igris started were ended`. The post office's log names each process.
  - Until then, those processes keep running. If the mod ended too, as when Claude Code is killed, they keep running until a post office next starts in this folder. In partial containment, a process the record can't identify, and that carries no marker, keeps running.

### New spike and acceptance criteria

**M1, before M1-AC1 (line 546).** New; replaces nothing.

- **S7 Containment**, a spike at the start of M1. It answers:
  - whether `systemd-run --user --scope` places a CLI that was started from a login's own scope, and whether it works on the CI runners;
  - whether each CLI's own sandbox works inside the PID namespace, and whether `sudo`, git and ssh do;
  - whether macOS's `ps -E` shows another process's environment;
  - whether `Add-Type` works in a script that an AppLocker or App Control policy allows.

  Its report goes on #63, and its findings go into NEW-1 to NEW-5 and into each adapter's table (CH-8).

**M1, after M1-AC8 (line 557).** New; replaces nothing.

- **M1-AC9** A scope, on ubuntu with its user manager, against a fake claude (NEW-1, NEW-2, NEW-3, NEW-4, PO-1):
  - the fake and every process it starts are in its scope, whatever their session;
  - closing the channel ends a child, a daemon that forks twice around `setsid`, and a process that ignores SIGTERM. Afterwards the scope is gone, and no process carrying the channel's marker is left;
  - a child that moves into a scope of its own through `systemd-run --user --scope` is found by its marker, ended, and named in the soldier's log;
  - a process the fake starts as a service with `systemd-run --user` outlives the close, as NEW-4 says. The test ends it.
- **M1-AC10** A namespace, on ubuntu with the user manager out of the post office's reach and `containmentFallback` set to `namespace` (NEW-1, NEW-3, NEW-5):
  - closing ends the fake, a daemon that forks twice around `setsid`, and a process that ignores SIGTERM;
  - the fake's tools see only the namespace's processes;
  - a CLI whose adapter does not record that its sandbox works in a namespace is not started in one, and its message says why.
- **M1-AC11** Partial containment, on ubuntu with the user manager out of reach and on macos, with `containmentFallback` set to `partial` (NEW-1, NEW-2, NEW-3, NEW-4):
  - closing ends a child, a grandchild that left the session or group while its parent was still running, and a daemon that forks twice around `setsid` but keeps the marker. On macos this applies only where the check found environments readable;
  - a member that forks without pause is ended within 10 seconds;
  - a daemon that forks twice with a new environment outlives the close, as NEW-4 says. The test ends it;
  - the post office's log and Claude's transcript state the gap, as NEW-4 says.
- **M1-AC12** The job, on windows, against a fake claude (NEW-1, NEW-3, NEW-4):
  - closing ends a child, and a grandchild whose parent has exited;
  - a child that asks to break away from the job fails to start;
  - a process created through WMI outlives the close, as NEW-4 says. The test ends it;
  - ending the script's PowerShell ends every process in its job;
  - with the user's execution policy set to AllSigned, the job still starts.
- **M1-AC13** The check (NEW-5):
  - with `containmentFallback` unset, no soldier starts on ubuntu with the user manager out of reach, or on macos. Each soldier shows error, with the reason, the way to full containment where there is one, and the setting;
  - fakes chosen as VER-5 says (a `systemd-run` that fails, an `unshare` that fails, `ps` output that can't be parsed, a PowerShell that reports ConstrainedLanguage mode) make the check fail or fall back exactly as NEW-5 says. Each reason quotes the fake's own error word for word. Nothing falls back to a containment the setting doesn't allow;
  - any other value of `containmentFallback` is refused at start.
- **M1-AC14** A member started through `sudo`, which the owner's processes can't signal, is left running after the close. This is tested on ubuntu with a scope and in partial containment, and on macos (NEW-3):
  - the channel is down and not restarted, and the soldier's state says why;
  - the soldier's log lists the process with its id, its user and its command line;
  - r reconnects once the test has ended the process.
- **M1-AC15** The post office is killed outright while a fake's child is running, in each containment (NEW-6, HOST-2):
  - the mod ends the child at once, and Claude's transcript gets one line with the count;
  - with the mod gone too, the next post office in that folder ends the child before it opens any channel;
  - a process that has since taken a recorded session's or process group's id, and carries no marker, is left running;
  - on windows, the child has already ended with its job.

**M2, after M2-AC10 (line 600).** New; replaces nothing.

- **M2-AC11** Turns on each system (PO-8, NEW-2):
  - M2-AC9's cases pass on ubuntu in each Linux containment, on macos and on windows;
  - a daemon that a fake starts during a turn and that forks twice around `setsid` keeps the turn open. With a scope and in partial containment, the post office finds it by its marker; in a namespace, it is a member already;
  - the turn is over only after a reading of the tree made after the end event;
  - a failed reading keeps the turn open. After 10 seconds the channel is down, with the error word for word.

### Changed lines

**Line 60, glossary.** New entries after "Channel". Replaces nothing.

- **Process tree:** a CLI's own process, and every process its containment holds: what the CLI started, and what those processes started (NEW-2).
- **Containment:** how the post office holds a CLI's process tree on its system: a systemd scope or a PID namespace on Linux, a job object on Windows, or partial containment through the process group and the process table (NEW-1).

**Line 94, HOST-2.** Replaces:

> - **HOST-2** (M1; I) The mod starts the post office the first time the army is used in a session, and stops it when the session ends. There is at most one post office per folder.

With:

- **HOST-2** (M1; I) The mod starts the post office the first time the army is used in a session, and stops it when the session ends. There is at most one post office per folder. If the post office ends without closing its channels, the mod ends what the channels left before it starts another post office (NEW-6).

**Line 168, PO-1.** Replaces:

>   - When a channel closes or restarts, the post office ends the CLI's whole process tree, so nothing the CLI started keeps running.

With:

  - When a channel closes or restarts, the post office ends the CLI's whole process tree as NEW-3 says, so nothing the CLI started keeps running. The only exceptions are the processes NEW-4 names for the system's containment (NEW-1), and the owner is told about those before any soldier starts.

**Line 186, PO-7.** Replaces its last sentence:

> The lease works beside the post office's watch on the process that started it, and beside its process containment (PO-1).

With:

The lease works beside the post office's watch on the process that started it, and beside its process containment (NEW-1). When the post office itself ends without closing its sessions, NEW-6 ends what they left.

**Line 189, PO-8.** Replaces the phrase:

> a process that joined the CLI's process tree during the turn (PO-1) and is not a session service

With:

a process that joined the CLI's process tree during the turn (NEW-2) and is not a session service

**Line 195, PO-8.** Replaces:

>     The work has ended when the CLI reports each task's end and each such process has exited, at the latest at the CLI's own time limit for background work. s stops it at any time (MSG-9): the adapter stops each task through its CLI and ends each such process, and the session stays open.

With:

    The work has ended when the CLI reports each task's end and a reading of the tree made after the end event shows that each such process has exited (NEW-2), at the latest at the CLI's own time limit for background work. s stops it at any time (MSG-9): the adapter stops each task through its CLI and ends each such process, and the session stays open.

**Line 211, PO-8.** Replaces:

>   - A change made after the turn is over belongs to no turn, so the owner's own edits between turns stay exempt. The next turn's guard starts from the checkout as it is when that turn's message goes in.

With:

  - A change made after the turn is over belongs to no turn, so the owner's own edits between turns stay exempt. So does a change made by a process that escaped the tree (NEW-4). The next turn's guard starts from the checkout as it is when that turn's message goes in.

**Lines 455–456, §5.1 Unit tests.** Replaces:

>   - parsers and name matching;
>   - `redact()` and config validation.

With:

  - parsers (the CLIs' output, `/proc`, cgroup files and `ps` output) and name matching;
  - `redact()`, config validation and the containment decision (NEW-5).

**Line 470, §5.1 Integration tests.** Replaces:

>   - crash, restart and resume.

With:

  - crash, restart and resume;
  - containment on each system: the check, ending a tree, and ending what a killed post office left (NEW-1 to NEW-6).

**Line 479, §5.1 Fault tests.** Replaces:

>   - a CLI that leaves a child process running;

With:

  - a CLI that leaves a child process running, in each containment (NEW-1);
  - a daemon that forks twice around `setsid`, with and without the marker (NEW-2, NEW-4);
  - a child that moves itself out of its scope, and processes that a service manager or WMI starts (NEW-4);
  - a member that forks without pause while its tree is being ended, and one the owner's processes can't signal (NEW-3);
  - the post office killed while a soldier's child is running (NEW-6);
  - a containment check that fails, on each system (NEW-5);

**Line 503, VER-2.** Replaces:

> - **VER-2** (M1; R) **Three systems.** CI runs every test level except L on ubuntu, macos and windows.

With:

- **VER-2** (M1; R) **Three systems.** CI runs every test level except L on ubuntu, macos and windows.
  - The ubuntu run keeps a user manager for its user (`loginctl enable-linger`) and allows unprivileged user namespaces. Its tests reach each Linux containment (NEW-1): the scope, and, with the user manager kept out of the post office's reach, the namespace and partial containment. The macos run tests partial containment, and the windows run tests the job.
  - Each run first makes NEW-5's check on the runner's image as it is. The run fails unless the check finds that system's containment: the scope on ubuntu, partial containment on macos, and the job on windows. So a runner-image update that breaks containment fails CI before an owner meets it.

**Line 509, VER-6.** Replaces:

>   - the security code has every line and every branch covered: making, handing over and checking the Monarch's credential (PO-3), the loopback-only rule (PO-2), and `redact()` (WSP-8), in the post office and in the mod. That code sits in files of its own, so the rule covers exactly it.

With:

  - the security code has every line and every branch covered: making, handing over and checking the Monarch's credential (PO-3), the loopback-only rule (PO-2) and `redact()` (WSP-8), in the post office and in the mod, and the decision whether a soldier may start under the containment the check found (NEW-5). That code sits in files of its own, so the rule covers exactly it.

**Line 538, M1 Implements.** Replaces:

> - PO-1, PO-2, PO-3, PO-5, PO-7;

With:

- PO-1, PO-2, PO-3, PO-5, PO-7, NEW-1 to NEW-6;

**Line 556, M1-AC7.** Replaces:

> - **M1-AC7** CI runs every level except live on three systems, and both coverage bars hold. The traceability script runs and passes, and no CI job calls a model (VER-1, VER-2, VER-3, VER-5, VER-6, VER-7).

With:

- **M1-AC7** CI runs every level except live on three systems, with every Linux containment included, and both coverage bars hold. Each run's containment check finds what VER-2 expects. The traceability script runs and passes, and no CI job calls a model (VER-1, VER-2, VER-3, VER-5, VER-6, VER-7, NEW-5).

**Line 720, Q8.** Replaces:

> - **Q8** M1's draft (#75) stops processes from escaping a closing session (PO-1) with a small C helper, compiled on the owner's machine the first time a session starts on Linux or macOS. It needs a C compiler there (on macOS, Xcode's command-line tools). On macOS it reads process details through structures Apple doesn't publish, so an update could break it; then it refuses to start a soldier rather than run one uncontained. Keep it, ship the helper prebuilt for each system and processor, or contain processes another way? Decide before v2.0.0.

With:

- **Q8** *Answered* (D-3, option C). Shadow Army compiles and ships no native code. Each system's own mechanism holds a CLI's processes (NEW-1):
  - on Linux, a systemd scope where the owner's user manager runs; otherwise a PID namespace or partial containment, if the owner allows it;
  - on macOS, partial containment, if the owner allows it;
  - on Windows, a job object, made through Windows PowerShell.

  NEW-4 says what can still escape and what the owner is told. NEW-5 says how a system without full containment is handled.

---

### Note of sources

**Recorded probe.** The coordinator's D-3 prototype (WSL Ubuntu 24.04, 20 runs per mechanism):
- a process-group kill, and polling `/proc` every 50 ms, let `setsid` double-fork daemons escape in every run;
- `systemd-run --user --scope` (without root) and `unshare --kill-child` ended every process;
- creating a job object through `Add-Type` fails under AppLocker's ConstrainedLanguage mode.

**Linux and systemd**
- systemd-run(1) (`--scope`, `--user`; the command inherits the caller's environment): https://man7.org/linux/man-pages/man1/systemd-run.1.html
- systemd.scope(5): https://man7.org/linux/man-pages/man5/systemd.scope.5.html
- systemd.kill(5) (scopes share `KillMode=`/`KillSignal=`; control-group is the default): https://man7.org/linux/man-pages/man5/systemd.kill.5.html
- systemctl(1): https://man7.org/linux/man-pages/man1/systemctl.1.html
- systemd.resource-control(5) (`Delegate=`, and a unit's cgroup made accessible to its `User=`): https://man7.org/linux/man-pages/man5/systemd.resource-control.5.html
- the user@.service unit (`Delegate=`, `User=%i`): https://github.com/systemd/systemd/blob/main/units/user%40.service.in
- systemd's cgroup delegation rules ("Never write to any of the attributes of a cgroup systemd created for you"; cgroup v1 removed in v258): https://systemd.io/CGROUP_DELEGATION/
- loginctl(1) (`enable-linger`): https://man7.org/linux/man-pages/man1/loginctl.1.html
- pam_systemd(8) (a login starts user@.service and gets a scope of its own): https://man7.org/linux/man-pages/man8/pam_systemd.8.html
- kernel cgroup v2 (a forked process is born into its parent's cgroup; `cgroup.procs`; migration and delegation-containment rules; `0::$PATH`): https://docs.kernel.org/admin-guide/cgroup-v2.html
- unshare(1): https://man7.org/linux/man-pages/man1/unshare.1.html
- pid_namespaces(7) (membership can't change; the first process adopts orphans; the kernel kills the namespace when it ends): https://man7.org/linux/man-pages/man7/pid_namespaces.7.html
- user_namespaces(7) (unmapped ids show as 65534): https://man7.org/linux/man-pages/man7/user_namespaces.7.html
- namespaces(7) (`/proc/<pid>/ns` links; user-namespace limits): https://man7.org/linux/man-pages/man7/namespaces.7.html
- proc_pid_stat(5): https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html
- proc_pid_environ(5): https://man7.org/linux/man-pages/man5/proc_pid_environ.5.html
- setsid(2): https://man7.org/linux/man-pages/man2/setsid.2.html
- kill(2): https://man7.org/linux/man-pages/man2/kill.2.html
- PR_SET_CHILD_SUBREAPER (orphans are re-parented): https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html
- WSL and systemd: https://learn.microsoft.com/en-us/windows/wsl/systemd

**POSIX and macOS**
- kill(): https://pubs.opengroup.org/onlinepubs/9799919799/functions/kill.html
- exec (environment inherited): https://pubs.opengroup.org/onlinepubs/9799919799/functions/exec.html
- _Exit (children re-parented to a system process): https://pubs.opengroup.org/onlinepubs/9799919799/functions/_Exit.html
- macOS ps(1), from Apple's adv_cmds (`-A`, `-E`, `-o pid,ppid,pgid,uid,lstart`): https://github.com/apple-oss-distributions/adv_cmds/blob/main/ps/ps.1
- Node.js `detached` (new session and process group on POSIX): https://nodejs.org/api/child_process.html

**Windows**
- Job Objects (inheritance; breakaway; `Win32_Process.Create` is outside the job; kill-on-close; nested jobs since Windows 8): https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- UpdateProcThreadAttribute (`PROC_THREAD_ATTRIBUTE_JOB_LIST`, Windows 10 and Server 2016): https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute
- QueryInformationJobObject: https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-queryinformationjobobject
- What is Windows PowerShell (ships in Windows; 5.1; .NET Framework): https://learn.microsoft.com/en-us/powershell/scripting/what-is-windows-powershell
- Add-Type (P/Invoke; in-memory assembly): https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/add-type?view=powershell-5.1
- about_Language_Modes (ConstrainedLanguage blocks C# and Win32 in `Add-Type`; AppLocker and WDAC; allowed scripts run in FullLanguage): https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_language_modes?view=powershell-5.1
- about_Execution_Policies (`Bypass` designed for embedded scripts; Group Policy precedence): https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1

**CI**
- GitHub-hosted runners (passwordless `sudo` on Linux and macOS; Windows runs as administrator): https://docs.github.com/en/actions/reference/runners/github-hosted-runners

**Still needs a live run (NEEDS-PROBE; spike S7 holds them)**
- `systemd-run --user --scope` started from outside user@.service (an SSH session's scope, or a GitHub runner's service with lingering on).
- Whether the runner's Ubuntu image needs unprivileged user namespaces turned on.
- Whether each CLI's own sandbox works inside the namespace, and whether `sudo`, git and ssh do.
- Whether macOS `ps -E` shows another same-user process's environment.
- Whether `Add-Type` works inside a script that AppLocker or App Control allows.
- Whether any CLI needs to break away from a job.
- Whether each CLI exits on standard-input EOF when the post office dies.
- Whether the marker finds the prototype's daemons. The prototype did not test the marker.

No code from `C:\Users\johns\projects\AIConnections-m1` was copied into this text.
