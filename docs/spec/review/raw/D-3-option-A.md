# D-3 option A draft (compile the helper at first use), against snapshot be9deb0

# D-3, option A: compile the process helper on the owner's machine at first use

- IDs NEW-1 to NEW-9 are placeholders.
- Line numbers refer to the frozen snapshot `.shadow/v2-tools/review/snapshots/v2@be9deb0.md` (docs/spec/v2.md at be9deb0).

## 1. §2 Glossary: insert after line 60 ("Channel")

Replaces: nothing.

```markdown
- **Containment:** what holds one soldier CLI's whole process tree, so that the post office can list it and end it: a child subreaper on Linux, a launchd job's coalition on macOS, a Job Object on Windows (NEW-1).
- **Guardian:** the process that holds one session's containment (NEW-1).
- **Process helper:** a small C program in this repository, compiled on the owner's Linux or macOS machine the first time a soldier starts there. It makes the system calls that containment needs (NEW-5).
```

## 2. PO-1, line 168

Replaces:
```markdown
  - When a channel closes or restarts, the post office ends the CLI's whole process tree, so nothing the CLI started keeps running.
```
With:
```markdown
  - When a channel closes or restarts, the post office ends the CLI's whole process tree: the CLI and every process that descends from it, all held in its containment (NEW-1). It does so as NEW-2 says, before anything else happens on that channel, and the CLI does not start again while any of its old tree still runs. NEW-1 says what containment does not reach.
```

## 3. PO-7, line 186 (its last sentence)

Replaces:
```markdown
The lease works beside the post office's watch on the process that started it, and beside its process containment (PO-1).
```
With:
```markdown
The lease works beside the post office's watch on the process that started it, and beside its process containment, which ends each tree by itself when the post office is gone (PO-1, NEW-2).
```

## 4. PO-8, lines 189 and 202

Line 189 replaces:
```markdown
or a process that joined the CLI's process tree during the turn (PO-1) and is not a session service.
```
With:
```markdown
or a process that joined the CLI's process tree during the turn, as the tree's listings show (PO-1, NEW-3), and is not a session service.
```

Line 202 replaces:
```markdown
Then the turn is over once the post office has ended the CLI's whole process tree (PO-1), background work included.
```
With:
```markdown
Then the turn is over once the post office has ended the CLI's whole process tree (PO-1), background work included, or once NEW-2's limit has passed when the tree cannot be ended.
```

## 5. New requirements: insert in §4.2 after line 212 (the end of PO-8)

Replaces: nothing.

```markdown
- **NEW-1** (M1; I, F) **Containment.** Each soldier's CLI runs in containment from the moment it is created, so that the post office can list its whole process tree (NEW-3) and end it (NEW-2). The tree is the CLI and every process that descends from it. That includes a process that starts a new session or process group, forks twice, or clears its environment.
  - **Linux.** The CLI's parent is the session's guardian, which has marked itself a child subreaper (`PR_SET_CHILD_SUBREAPER`). The guardian leads a process group of its own, which the CLI joins. When a process in the tree loses its parent, the kernel re-parents it to its nearest living ancestor that is a subreaper. That is the guardian, or a process in the tree that marked itself one, so the process stays in the tree.
  - **macOS.** The guardian runs as a launchd job of its own, in the coalition that launchd gives that job, and starts the CLI there. Every process started from the CLI joins the same coalition. NEW-6 says what this rests on.
  - **Windows.** The guardian creates the CLI inside a Job Object, assigned as the process is created (`PROC_THREAD_ATTRIBUTE_JOB_LIST`). Every process the CLI creates with `CreateProcess` joins the job too. The job allows no breakaway. It ends every process in it when its last handle closes (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`). Only the guardian holds a handle to it.
  - **As if started directly.** The post office starts one guardian per session. The guardian starts the CLI with the program, arguments, environment and working directory that the post office gives it, and on Linux and macOS with the post office's resource limits. What the post office writes reaches the CLI's standard input. The CLI's standard output and error reach the post office byte for byte, each in order. Containment adds nothing to the CLI's command and removes nothing from it (CH-7).
  - The post office learns when the CLI's own process exits, with its exit code or signal, even while the rest of its tree runs on (PO-1).
  - Once the helper is built and tested (NEW-7, NEW-8), a CLI whose containment is not ready within 15 seconds has failed to start. Anything already started is ended, and the channel is down with the reason (HOST-14).
  - **What containment does not reach.**
    - A program that a system service starts at the CLI's request does not descend from the CLI. That covers one started through `systemd-run` on Linux, through `launchctl submit` on macOS, or through WMI's `Win32_Process.Create` on Windows.
    - Soldiers run as the owner's user, so a process in the tree can end its own guardian. NEW-4 says what follows.
    - Containment is cleanup, not a sandbox. What Shadow Army enforces is the checkout guard and the claim audit (ARM-6, WSP-2, WSP-4).
- **NEW-2** (M1; I, F) **Ending the tree.** The post office ends a CLI's tree when its channel closes or restarts (PO-1), and when a stop falls back to ending the CLI (CH-10).
  - **In order.**
    - The CLI's standard input is closed, and the CLI has 2 seconds to exit by itself (PO-7).
    - Then, on Linux and macOS, the CLI gets `SIGTERM` and 0.5 seconds more.
    - Then every process still in the tree is killed.
  - **At once.** After a lost connection (PO-1), and whenever the post office itself is gone, there is no grace: the tree is killed straight away.
  - **Only the system's word counts.** The tree is ended only when the system reports it empty. A list that the system documents as unreliable while processes run is never the proof. Linux's `/proc/<pid>/task/<tid>/children` is such a list.
    - **Linux.**
      - The guardian kills each of its children, and each process it adopts as their parents die, and reaps them. It goes on until it has no child left, living or exited, as `wait` reports (`ECHILD`).
      - It signals only its own children. The kernel keeps their pids until they are reaped, so the guardian never signals a pid that has been reused.
    - **macOS.**
      - First the session's launchd job is removed (`launchctl remove`), because launchd keeps a job started with `launchctl submit` alive after a failure. Removing the job does not wait for its processes to stop.
      - Then every living member of the session's coalition is stopped (`SIGSTOP`). Once all are stopped, they are killed (`SIGKILL`). This repeats until the coalition has no living member.
      - Each signal goes through the process's audit token, which carries its pid version, so a reused pid is never signalled (NEW-6).
    - **Windows.** The guardian terminates the job (`TerminateJobObject`) and waits until the job holds no process.
  - **When the post office is gone.** The guardian watches its connection to the post office. If that connection closes without a close command, the guardian ends the tree at once. On macOS it then has launchd remove its own job. On Windows, if the guardian is gone too, the job's last handle has closed, and the system has ended every process in the job.
  - **The limit.** If the tree is not empty 10 seconds after the kill began:
    - the post office records what remains, with each process's identity (NEW-3);
    - the channel is down and does not restart by itself (PO-1). Its card says so, as in `Iron's CLI left 2 processes running (48211 node, 48230 sh), and Shadow Army could not end them`;
    - a turn waiting on the tree is finished then (PO-8), and its message's row names those processes;
    - r tries to end them again, and starts the CLI only once nothing of the old tree runs.
- **NEW-3** (M1; I) **Listing the tree.** The post office can list the processes in a CLI's containment at any moment. Each comes with an identity that a reused pid cannot match:
  - Linux: each process whose chain of parents, read from `/proc/<pid>/stat`, reaches the guardian. Its identity is its pid and start time.
  - macOS: each living member of the session's coalition. Its identity is its pid and the kernel's unique id for the process (NEW-6).
  - Windows: each process in the job. Its identity is its pid and creation time.

  PO-8 compares two lists to tell which processes joined the tree during a turn. A process that both starts and exits between two lists can be missed. Whatever it changed in the checkout is still on the turn's guard (ARM-6, WSP-4). Before ending one listed process, as MSG-9 does, the post office checks that the process's identity still matches.
- **NEW-4** (M1; F) **A guardian ended from outside.** If a session's guardian ends while its session is open, the channel has crashed (PO-1). Before anything else, the post office ends what it can still reach:
  - **macOS.** The post office removes the session's launchd job, so that launchd does not start the guardian again. Then it ends the coalition by the id it recorded (NEW-2, NEW-6). Nothing escapes.
  - **Windows.** The job's last handle closed with the guardian, so the system has already ended every process in the job. Nothing escapes.
  - **Linux.** The kernel has re-parented the guardian's descendants to a subreaper above it, or to init, out of Shadow Army's reach. The post office kills the guardian's process group, so every process that stayed in that group ends. The card says the rest may still run, as in `Iron's guardian ended unexpectedly, so processes that Iron's CLI started may still be running`.
  - The channel then restarts as after any crash (PO-1).
- **NEW-5** (M1; R, X) **The process helper.** On Linux and macOS, containment needs system calls that the process helper makes. The helper is one C source file in this repository, `native/process-supervisor.c`, compiled on the owner's machine (NEW-7). Windows needs no helper.
  - **What the owner installs.**
    - **Linux:**
      - Linux 3.4 or later, with `/proc` mounted;
      - a C compiler, with the C library's headers. Shadow Army runs the program that the `CC` environment variable names, or else `cc`. On Debian and Ubuntu, the `build-essential` package installs gcc, which `cc` runs, and the headers.
    - **macOS:** Xcode, or Xcode's command-line tools (`xcode-select --install`).
    - **Windows:** nothing; Windows 10, Windows Server 2016 or later.
    - The compiler is needed only to build the helper. That happens the first time a soldier starts on the machine, and again after an update of Shadow Army that changes the helper's source (NEW-7). An update of the system alone does not need it.
  - **What the helper does**, and nothing else:
    - **Linux.** The helper is the session's guardian. It marks itself a child subreaper, starts the CLI under itself, watches its connection to the post office, and ends and reaps the tree (NEW-2).
    - **macOS.** The helper reads a process's identity, status and coalition, and lists a coalition's living members. It stops and kills the members of the one coalition it is given, which is the session's. When it runs inside a session's coalition because the post office is gone, it ends every other member, and then has launchd remove that session's job.
    - It reports each result as one line of JSON on its standard output. It reports an error on its standard error, with a non-zero exit code.
  - **The helper MUST NOT:**
    - run with more rights than the owner's user, or ask for more: no setuid bit, no `sudo`, no entitlement;
    - open a network connection, write a file, or read anything but process information (on Linux, under `/proc`);
    - start any program except the CLI, on Linux, and `/bin/launchctl remove` for its own session's job, on macOS;
    - signal a process outside its session's containment, or a process in the post office's own coalition, or signal by a pid that may have been reused (NEW-2);
    - receive the Monarch's secret (PO-3), in its arguments, its environment or its input;
    - change the CLI's command, environment or working directory, or keep a copy of them (CH-7);
    - hold a prompt, a model or a tool policy, or decide anything about a turn.
- **NEW-6** (M1; R, I, L) **macOS: the mechanism, and what it rests on.**
  - **Start.**
    - The post office has launchd start the session's guardian as a job of its own, with `launchctl submit` and a label unique to the session.
    - `launchctl submit` needs no configuration file, and Shadow Army writes none: no launch agent, no login item.
    - The guardian connects back to the post office over the loopback (PO-2) with a one-time nonce.
    - Before the post office sends the CLI's command, it checks two things. Launchd must list the guardian's pid under the session's label (`launchctl list`). The guardian's coalition must be new: not the post office's, and with no member but the guardian.
    - Then the guardian starts the CLI.
    - The post office records the coalition's id for the session, and passes the helper no other coalition.
  - **End.** As NEW-2 says, with the job removed first.
  - **What it rests on.** Of all this, only `launchctl submit`, `list` and `remove` are documented, in launchctl's manual page, as legacy subcommands. Everything else is an interface that Apple does not publish:
    - `proc_pidinfo`, `proc_listallpids` and `proc_signal_with_audittoken` come from `libproc.h`. That header's own comment says it "contains private interfaces", which "are subject to change in future releases".
    - The flavours that read a process's coalition, unique id and pid version (`PROC_PIDCOALITIONINFO`, `PROC_PIDUNIQIDENTIFIERINFO`), and their structures, come from `proc_info_private.h` in Apple's open-source kernel. The helper declares the structures itself.
    - `__proc_info_extended_id` ties each of those reads to one process by its unique id. No Apple header declares it.
    - The helper fills in an audit token with a pid and its pid version. The token's layout appears in Apple's kernel tests, not in its documentation.
    - Apple documents coalitions nowhere. That launchd gives each job a coalition of its own, and that a process's children join its coalition, is how Apple's kernel source and launchd behave today.
  - Apple can change any of these in any update, without notice.
    - The helper looks up the private calls each time it runs, not when it is built.
    - It checks the size of every structure it reads.
    - A missing call, a size that differs, or a coalition that is not new fails the self-test (NEW-8), and then no soldier starts.
- **NEW-7** (M1; I, X, U) **Building the helper at first use.**
  - The first time the post office starts a soldier on Linux or macOS, it builds the helper. It does not when its cache already holds a build of this source for this system and processor.
  - The published package carries the helper's source and no compiled helper. Nothing is ever downloaded.
  - Before it compiles, the post office checks the source against the SHA-256 that the package records for it. It does not compile a source that differs.
  - **On macOS**, the post office first checks that Xcode or the command-line tools are installed: `xcode-select --print-path` must name a folder that holds them. It runs neither the compiler nor any other tool from the command-line tools for this check. Without the tools installed, running such a tool asks the owner to install them; Shadow Army never raises that prompt itself.
  - **The command** is fixed and runs with no shell: `<compiler> -std=c11 -O2 -Wall -Wextra <source> -o <temporary file>`.
    - The compiler is the program that `CC` names, or else `cc`.
    - It runs in the cache folder, with the post office's environment, and is stopped after 30 seconds.
    - A warning does not fail the build; it goes into the record.
    - On a Mac with Apple silicon, the compiler signs the helper ad hoc as it links it. That is the signature macOS needs to run it.
  - The build is written under a temporary name, and renamed into place only once it is complete. So two post offices that build at once never run a half-written helper.
  - **The cache** is `shadow-army/helper/` in the user's cache folder: `$XDG_CACHE_HOME` on Linux (or `~/.cache` when that is unset), and `~/Library/Caches` on macOS. The cache's folders, from the user's cache folder down, and every file in them MUST be owned by the user and writable by no one else. Otherwise the post office does not use the cache (NEW-8).
  - Each build sits in a folder named for its source's hash, the system and the processor. Once a newer build passes its self-test, older ones are removed. Deleting the cache is always safe: the next soldier start builds the helper again.
  - **The record.** The post office records these beside each build, and in its log (PO-5):
    - the source's SHA-256;
    - the compiler's path and the first line of its `--version` output;
    - the command, and the compiler's warnings;
    - the system and its version;
    - the helper's own SHA-256.
- **NEW-8** (M1; I, F, U) **No containment, no soldier.**
  - **The self-test.** The post office tests containment on the machine as it is now, before it starts its first soldier and after every build. The test has 10 seconds:
    - On Linux and macOS, the helper confirms what it needs. On Linux, that is the subreaper mark set and read back. On macOS, every private call is found, every structure has the size the helper expects, and a signal through the helper's own audit token is delivered.
    - On every system, a probe starts in containment, the way a CLI does. The probe starts a child, which starts a new session, forks a grandchild and exits. The listing shows the probe and the grandchild (NEW-3). On macOS, the probe's coalition is new (NEW-6).
    - The probe's tree is ended with no grace. A pipe is held for writing only by the probe and the grandchild. The test passes when that pipe reaches its end, which shows that both have ended without relying on the listing.
  - **When containment cannot be set up.** A soldier's CLI MUST NOT start without containment.
    - The post office starts no soldier when any of these holds:
      - the compiler or the command-line tools are missing;
      - the build fails or runs past 30 seconds;
      - the cache cannot be used;
      - the self-test fails.
    - Each soldier's channel is then down (HOST-14). Its card says what failed and what to do, as in:
      - `Iron can't start: Shadow Army needs a C compiler to build its process helper. Install one (Debian or Ubuntu: sudo apt install build-essential), then press r.`
      - `Iron can't start: Shadow Army needs Xcode's command-line tools to build its process helper. Run xcode-select --install, then press r.`
      - `Iron can't start: the process helper didn't build`, with the compiler's last 10 lines of output;
      - `Iron can't start: another user can change Shadow Army's helper folder, ~/.cache/shadow-army/helper`;
      - `Iron can't start: Shadow Army can't contain processes on macOS 27.1 (the job's coalition wasn't new). Check for a Shadow Army update.`
  - **Who decides.** No one runs a soldier uncontained.
    - No setting, flag or environment variable starts one, and the owner is never asked to accept one.
    - The owner's way forward is the card's: install what it names, or update Shadow Army.
  - **A failure is not remembered.**
    - r, or the next start of any soldier, builds and tests again, without restarting the post office.
    - A cached build that fails the self-test is built once more, where a compiler is available, and tested again before any soldier is refused.
  - **An update of the system** does not rebuild the helper. The cached build serves for as long as it passes the self-test.
    - An update that changes what the helper rests on (NEW-6) fails the self-test at the post office's next start.
    - No soldier starts until a release of Shadow Army supports the new system. The card names the system's version and the step that failed.
    - Updating Shadow Army changes the helper's source, so the next start builds the helper again.
- **NEW-9** (M1; R, X) **Checking the helper's source and build.**
  - **The source** is one C file. It uses only the C standard library and the system's own headers and libraries. Building it needs no package, no download and no tool besides the compiler.
  - Every change to the source is reviewed as security code. Its PR says so. The review checks the source against NEW-5's lists, and against NEW-6's list of what it rests on (R).
  - **CI** (VER-2):
    - compiles the source with warnings as errors (`-Werror`): with gcc and with clang on ubuntu, and with Xcode's clang on macos;
    - runs the containment tests against the build an owner's machine would make (NEW-7), and again against one built with AddressSanitizer and UndefinedBehaviorSanitizer;
    - checks that the packed package carries the helper's source byte for byte, with the SHA-256 it records, and no compiled helper.
  - **Reproducibility.** Each machine's own compiler and headers build the helper, so its bytes differ from machine to machine. No release can name one hash for it. What is fixed is its input: the source, by its hash, and the command (NEW-7). The record that NEW-7 keeps beside each build lets anyone repeat a build and compare.
```

## 6. §5.1 Levels

Unit tests, line 456. Replaces:
```markdown
  - `redact()` and config validation.
```
With:
```markdown
  - `redact()` and config validation;
  - the process helper's cache rules, and NEW-8's cards.
```

Integration tests, line 470. Replaces:
```markdown
  - crash, restart and resume.
```
With:
```markdown
  - crash, restart and resume;
  - containment on each system, with the helper built from source on ubuntu and macos: a CLI's detached child is listed, then ended (NEW-1 to NEW-3).
```

Security tests, line 475. Replaces:
```markdown
  - The mod has no approval path.
```
With:
```markdown
  - The mod has no approval path.
  - The process helper signals nothing outside its session's containment, and refuses the post office's own coalition.
  - A helper source whose hash differs, and a cache that another user can write, are refused.
  - The Monarch's secret reaches neither the helper nor a guardian.
```

Fault tests, line 479. Replaces:
```markdown
  - a CLI that leaves a child process running;
```
With:
```markdown
  - a CLI that leaves a child process running, including one that starts a new session, forks twice and clears its environment;
  - the post office killed while a session runs, and a guardian ended from outside (NEW-2, NEW-4);
  - no compiler, a build that fails or runs past 30 seconds, an unusable cache, and a self-test that fails, as after an update of the system (NEW-7, NEW-8);
```

Live checks, line 497. Replaces:
```markdown
  The budget is at most $2 of reported cost per release.
```
With:
```markdown
  The budget is at most $2 of reported cost per release. On macOS, the owner also checks that soldiers start and close with no system prompt or notification, and leave no launchd job behind (NEW-6).
```

Review, line 498. Replaces:
```markdown
- **Review (R).** The PR reviewer confirms the requirement in the code, citing file and line.
```
With:
```markdown
- **Review (R).** The PR reviewer confirms the requirement in the code, citing file and line. For the process helper, the reviewer also checks its source against NEW-5 and NEW-6 (NEW-9).
```

## 7. VER-2, line 503

Replaces:
```markdown
- **VER-2** (M1; R) **Three systems.** CI runs every test level except L on ubuntu, macos and windows.
```
With:
```markdown
- **VER-2** (M1; R) **Three systems.** CI runs every test level except L on ubuntu, macos and windows.
  - On ubuntu and macos, the tests build the process helper from its source with the runner's own compiler, at first use, as an owner's machine does (NEW-7). No test uses a helper built anywhere else.
  - CI also runs once a week on the newest runner images of the three systems. An update of a system that breaks containment then shows without any change to the code (NEW-8).
```

## 8. VER-6, line 508 (its first bullet)

Replaces:
```markdown
  - the post office and the channels keep at least 85% line coverage, counted over the three systems' runs together (VER-2): a line is covered when any system's run covers it;
```
With:
```markdown
  - the post office and the channels keep at least 85% line coverage, counted over the three systems' runs together (VER-2): a line is covered when any system's run covers it. The process helper's C source (NEW-5) is part of the post office. CI measures its lines with the compiler's own coverage tool on ubuntu and macos, and adds them to this count;
```

## 9. M1 Implements: insert after line 538

Replaces: nothing.
```markdown
- NEW-1 to NEW-9;
```

## 10. M1-AC7, line 556

Replaces:
```markdown
- **M1-AC7** CI runs every level except live on three systems, and both coverage bars hold. The traceability script runs and passes, and no CI job calls a model (VER-1, VER-2, VER-3, VER-5, VER-6, VER-7).
```
With:
```markdown
- **M1-AC7** CI runs every level except live on three systems, and both coverage bars hold, with the process helper's lines in the count. On ubuntu and macos, the containment tests run against a helper that the runner built from source. A weekly run on the newest images is scheduled. The traceability script runs and passes, and no CI job calls a model (VER-1, VER-2, VER-3, VER-5, VER-6, VER-7, NEW-9).
```

## 11. New ACs: insert after line 557 (M1-AC8)

Replaces: nothing.

```markdown
- **M1-AC9** Containment, on each of the three systems, with a fake CLI (NEW-1, NEW-2, NEW-3, PO-1):
  - the fake starts a child. The child starts a new session, clears its environment, forks a writer that appends to a file every 20 ms, and exits. The listing shows the writer with its identity. Closing the channel returns only once the file has stopped growing;
  - the fake gets the arguments, environment and working directory it would get if the post office had started it directly, and on Linux and macOS the same resource limits. Its standard streams pass byte for byte. The post office hears the fake's own exit code while its writer still runs;
  - a fake that exits when its input closes finishes its own cleanup first. One that ignores its input gets `SIGTERM` after 2 seconds on Linux and macOS, and is ended on Windows. One that ignores both is still ended;
  - after a lost connection, the tree is killed with no grace;
  - a guardian that cannot empty the tree (VER-5) leaves the channel down 10 seconds after the kill began. The card names the processes, and r does not start the CLI while they run.
- **M1-AC10** When the post office or a guardian dies (NEW-2, NEW-4, PO-1):
  - the post office is killed while a fake's writer runs, once before and once after the fake's own process has exited. The writer stops within 2 seconds. On macOS, `launchctl list` then shows no Shadow Army job;
  - a session's guardian is killed while its writer runs. On macOS and on Windows the writer stops, and launchd does not start the guardian again. On Linux, a writer that stayed in the guardian's process group stops, and the card says that other processes may still run. Each time, the channel then restarts as after a crash.
- **M1-AC11** Building the helper, on ubuntu and macos (NEW-5, NEW-7, NEW-9):
  - the first soldier start builds the helper into the cache, with its record beside it and in the log. The next start reuses it, with no compiler on the path;
  - a source whose SHA-256 differs from the package's record is not compiled. A cache folder or file that another user can write is not used;
  - two post offices that start soldiers at once both run a complete helper;
  - a compiler still running after 30 seconds is stopped, and no soldier starts;
  - once a newer build passes its self-test, the older build is gone. After the cache is deleted, the next start builds again.
- **M1-AC12** No containment, no soldier (NEW-8):
  - each of these causes is tried in turn: no compiler, a compiler that fails, an unusable cache, and a helper that fails each step of the self-test. With each, no CLI starts, every soldier's channel is down, and each card gives NEW-8's message for its cause. On windows, a failing self-test does the same;
  - on macOS, with Xcode and the command-line tools reported missing, neither the compiler nor any other tool from the command-line tools runs;
  - nothing in the configuration files, the command line or the environment starts a soldier anyway;
  - once the cause is fixed, r starts the soldier without restarting the post office;
  - a cached helper that fails the self-test is built once more and tested again before any soldier is refused.
- **M1-AC13** The helper stays within its limits (NEW-5, NEW-6, NEW-9):
  - review confirms against the source that the helper does only what NEW-5 allows. It also confirms that NEW-6 names every interface the helper uses that Apple does not publish;
  - the post office passes the helper only coalitions it recorded for a session. Given the post office's own coalition, the helper refuses it and signals nothing;
  - the Monarch's secret is in no argument, environment or input of the helper or of a guardian;
  - CI's gcc, clang and sanitizer builds pass. The packed package carries the helper's source, with the SHA-256 it records, and no compiled helper.
- **M1-AC14** Live, on macOS (NEW-6, NEW-7): on a Mac with the command-line tools, the owner starts two soldiers in a checkout under the home folder, runs the two-prompt task, and closes them. No system dialog, privacy prompt or notification appears, and `launchctl list` then shows no Shadow Army job.
```

## 12. Q8, line 720

Replaces:
```markdown
- **Q8** M1's draft (#75) stops processes from escaping a closing session (PO-1) with a small C helper, compiled on the owner's machine the first time a session starts on Linux or macOS. It needs a C compiler there (on macOS, Xcode's command-line tools). On macOS it reads process details through structures Apple doesn't publish, so an update could break it; then it refuses to start a soldier rather than run one uncontained. Keep it, ship the helper prebuilt for each system and processor, or contain processes another way? Decide before v2.0.0.
```
With:
```markdown
- **Q8** *Answered (D-3).* On Linux and macOS, each CLI is contained with a process helper compiled on the owner's machine at first use (NEW-5, NEW-7). The owner needs a C compiler there for the first build and after each update that changes the helper; on macOS, that is Xcode or its command-line tools. On macOS, containment rests on interfaces that Apple does not publish (NEW-6). When containment cannot be set up, as after an update of the system that breaks it, no soldier starts, and nothing can make one start uncontained (NEW-8).
```

---

## Sources

**Linux**
- PR_SET_CHILD_SUBREAPER(2const), https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html: added in Linux 3.4. An orphan is "reparented to the nearest still living ancestor subreaper". The attribute is not inherited across fork and is preserved across execve.
- proc_tid_children(5), https://man7.org/linux/man-pages/man5/proc_tid_children.5.html: the list is reliable "only if all of the child processes are stopped or frozen", and "Exiting children may cause non-exiting children to be omitted".
- wait(2), https://man7.org/linux/man-pages/man2/wait.2.html: ECHILD means "does not have any unwaited-for children". A zombie keeps its PID until it is waited for. Orphans go to init or to the nearest subreaper.
- proc_pid_stat(5), https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html: the fields ppid, pgrp, session, state (Z) and starttime.
- kill(2), https://man7.org/linux/man-pages/man2/kill.2.html: a process may signal any process of the same user, and a negative pid signals a whole process group.
- pipe(7), https://man7.org/linux/man-pages/man7/pipe.7.html: a read sees end-of-file once every write end is closed.
- systemd-run(1), https://man7.org/linux/man-pages/man1/systemd-run.1.html: a transient service runs "with the service manager as its parent process".
- XDG Base Directory specification, https://specifications.freedesktop.org/basedir/latest/: `$XDG_CACHE_HOME`, by default `$HOME/.cache`.
- Debian `build-essential`, https://packages.debian.org/stable/build-essential: depends on gcc, g++, libc6-dev, make and dpkg-dev.
  - Debian's gcc package registers `cc` as an alternative for gcc. That comes from the package's maintainer script, seen in an old copy on a mirror rather than in documentation: https://www.apt-browse.org/browse/debian/jessie/main/amd64/gcc/4:4.9.2-2/debian/postinst

**macOS**
- launchctl(1), LEGACY SUBCOMMANDS. Apple ships this page only as `man launchctl` and has no current copy online. The unofficial copy of the 2014 page is at https://leancrew.com/all-this/man/man1/launchctl.html. It says:
  - `submit` "tells launchd to keep the program alive in the event of failure";
  - `remove` "will return immediately and not block until the job has been stopped";
  - `list` shows the job's PID in its first column.
- Apple's XNU source:
  - `libproc.h`, https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.h: "contains private interfaces … subject to change in future releases". It declares `proc_pidinfo`, `proc_listallpids` and `proc_signal_with_audittoken`.
  - `proc_info_private.h`, https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info_private.h: `PROC_PIDUNIQIDENTIFIERINFO` 17 and `PROC_PIDCOALITIONINFO` 20, with their structures.
  - `libproc.c`, https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.c: `__proc_info_extended_id` is declared only in this file.
  - `osfmk/mach/coalition.h`, https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/mach/coalition.h: the coalition definitions sit under `PRIVATE`.
  - `osfmk/kern/coalition.c`, https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/coalition.c: coalition ids are "monotonically increasing", and privileged members such as launchd spawn processes into chosen coalitions.
  - `bsd/kern/kern_fork.c`, https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_fork.c: a forked child "always inherits the parent's coalitions".
  - `tests/proc_pidpath_audittoken.c`, https://github.com/apple-oss-distributions/xnu/blob/main/tests/proc_pidpath_audittoken.c: builds a token by hand (`val[5]` is the pid, `val[7]` the pid version), with no documentation of that layout.
- Apple developer documentation:
  - Installing the command-line tools, https://developer.apple.com/documentation/xcode/installing-the-command-line-tools: `xcode-select --install`. On a fresh macOS, running a tool from the package prompts the owner to install it. After a macOS upgrade, the installed tools "may be incompatible".
  - Configuring command-line tools settings, https://developer.apple.com/documentation/xcode/configuring-command-line-tools-settings: `xcode-select --print-path`, and the error it prints when no developer folder is set.
  - macOS Big Sur 11.0.1 Universal Apps release notes, https://developer.apple.com/documentation/macos-release-notes/macos-big-sur-11_0_1-universal-apps-release-notes: on Apple silicon an executable must be signed, and an ad-hoc signature is enough. `clang` and `ld` add it automatically.
  - File System Programming Guide, https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/MacOSXDirectories/MacOSXDirectories.html: `Caches` holds "cached data that can be regenerated".

**Windows**
- Job Objects, https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects:
  - a process's children join its job by default;
  - children created through `Win32_Process.Create` do not;
  - the two breakaway limits;
  - `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`;
  - `TerminateJobObject`.
- UpdateProcThreadAttribute, https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute: `PROC_THREAD_ATTRIBUTE_JOB_LIST`, supported from Windows 10 and Windows Server 2016.
- ReadFile, https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-readfile: once an anonymous pipe's write handle is closed, a read returns `ERROR_BROKEN_PIPE`.

**No official document covers these**
- That launchd gives each submitted job a coalition of its own rests on XNU source only. Codex's draft relies on it, and its tests pass on `macos-latest` (#63, 2026-10-14). NEW-8's self-test checks it on every machine.
- Whether a CLI started as a launchd job raises privacy prompts or notifications that the same CLI started from a terminal does not: NEEDS-PROBE. M1-AC14 is the live check for it.
- The output format of `launchctl list <label>` is not documented, so NEW-6 relies only on the documented PID column of `launchctl list`.

How Codex's draft works was read, without copying any code, from `C:\Users\johns\projects\AIConnections-m1` at 04ab953: `native/process-supervisor.c`, `src/v2/processTree.ts`, `scripts/build-process-supervisor.mjs` and `.github/workflows/ci.yml`.
