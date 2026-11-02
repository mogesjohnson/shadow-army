# D-3 option B draft (ship the helper prebuilt), against snapshot be9deb0

Option B for D-3 (Q8): ship the containment helper prebuilt, built, tested and checksummed in CI, so no compiler is needed.

Line numbers refer to `.shadow/v2-tools/review/snapshots/v2@be9deb0.md` (spec v0.6). The requirement IDs NEW-1 to NEW-10 and the AC IDs M1-AC9 to M1-AC15 are placeholders.

---

### 1. §2 Glossary

Old (line 59):
```markdown
- **Post office:** the local helper process that holds the soldiers' sessions and carries messages between them.
```
New:
```markdown
- **Post office:** the local process that holds the soldiers' sessions and carries messages between them.
```

Insert after line 60 (Channel):
```markdown
- **Containment:** what holds a soldier's CLI and every process it starts, so that the post office can find them all and end them. It is a subreaper on Linux, a launchd job's coalition on macOS and a Job Object on Windows (NEW-1).
- **Process tree:** a CLI and every process in its containment, including one whose parent has exited or that left its process group or session (NEW-1).
- **Containment helper:** the small native program that sets up containment on Linux and macOS. It ships prebuilt in Shadow Army's package, one for each supported system and processor (NEW-2, NEW-3).
```

### 2. PO-1

Old (line 165):
```markdown
  - A channel that crashes is restarted at most three times; after that it is down until the owner reconnects it.
```
New:
```markdown
  - A channel that crashes is restarted at most three times; after that it is down until the owner reconnects it. A channel whose containment failed is never restarted by itself (NEW-5).
```

Old (line 168):
```markdown
  - When a channel closes or restarts, the post office ends the CLI's whole process tree, so nothing the CLI started keeps running.
```
New:
```markdown
  - When a channel closes or restarts, the post office ends the CLI's whole process tree: every process in its containment (NEW-1). Nothing the CLI started keeps running, except work it handed to a service outside its containment (NEW-1).
```

### 3. New requirements: insert after line 212 (the end of PO-8)

```markdown
- **NEW-1** (M1; I, F) **Containment.** Every soldier's CLI runs in a containment that is set up before the CLI starts. The containment holds the CLI and every process the CLI starts, so the post office can find them all and end them (PO-1, PO-8).
  - **Linux.** The containment helper makes itself a child subreaper, starts the CLI as its child, and stays its parent for the session. When a process's parent exits, the kernel hands it to the nearest living subreaper. So everything the CLI starts stays below the helper, even a process that left its process group or session.
  - **macOS.** Each CLI runs as a launchd job of its own, in the owner's login session, with a label unique to the session. launchd starts the job in a coalition of its own. Every process the CLI starts stays in that coalition, even after its parent exits or it leaves its process group or session. Apple doesn't document this (NEW-8). Before the CLI starts, the post office confirms that the coalition is new: it holds the job's first process and nothing else, and it doesn't hold the post office.
  - **Windows.** The CLI runs in a Job Object that ends every process in it when the job closes (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`). Neither breakaway limit is set, so no process leaves the job. Windows has no containment helper.
  - **Ending a tree.** The containment stops and kills every process in it, then confirms that none is left:
    - on Linux, once the kernel reports that the helper has no child left (`wait` fails with `ECHILD`). The helper signals only its own children, and does so before it reaps them, so it never signals a reused pid;
    - on macOS, once the coalition holds no process. The helper first removes the job, so launchd doesn't start it again. It names each process by its unique id, so it never signals a reused pid;
    - on Windows, once the job has no active process.

    This takes at most 10 seconds. If it takes longer, the containment has failed (NEW-5).
  - **If the post office dies.** When the post office ends without closing a session, because it crashed or was killed, the containment ends that session's tree by itself as soon as its connection to the post office closes.
  - **Limits.** Containment holds the processes the CLI starts, and the processes they start. It doesn't hold work the CLI asks a service outside it to start: a systemd or launchd job, a cron or at entry, a container that a container engine runs, or a command sent to a tmux or screen server that was already running. Ending the tree doesn't end that work.
- **NEW-2** (M1; U, I) **Systems and processors.** The post office chooses the containment from Node.js's `process.platform` and `process.arch`:

  | `process.platform` | `process.arch` | Containment |
  |---|---|---|
  | `linux` | `x64` | the helper `native/linux-x64/sa-contain` |
  | `linux` | `arm64` | the helper `native/linux-arm64/sa-contain` |
  | `darwin` | `arm64` or `x64` | the helper `native/darwin/sa-contain`: one universal binary, with `arm64` and `x86_64` code |
  | `win32` | `x64` or `arm64` | a Job Object; no helper |
  | any other pair | | none, so no soldier starts (NEW-4) |

  - Each Linux binary is statically linked, so it doesn't depend on the system's C library. One binary per processor runs on glibc and musl distributions, old and new. It needs `/proc` and a kernel with `PR_SET_CHILD_SUBREAPER` (Linux 3.4 and later).
  - The macOS binary runs natively on Apple silicon and on Intel, whichever processor Node.js reports. Its minimum macOS version is the oldest one CI tests.
  - **Supported** means that CI ran the containment tests on that system and processor for the release. For macOS it also means the versions from the oldest to the newest that CI tested (NEW-10). Each release's notes list them. Linux distributions aren't listed: the check decides (NEW-4).
  - On a macOS newer than any CI tested, the check still decides (NEW-4), and `/army` says that version is untested.
- **NEW-3** (M1; I, R) **Packaging and installing.** Installing or running Shadow Army from its release package MUST NOT compile anything.
  - Shadow Army's release package is the npm package tarball that CI builds (NEW-9). It holds every binary of NEW-2 beside the post office's code. The same tarball is attached to the release on GitHub. It is also what the npm registry serves, when the project publishes there.
  - The package has no install script (`preinstall`, `install` or `postinstall`) and no `binding.gyp`. So npm builds and runs nothing when it installs the package, and `--ignore-scripts` changes nothing. Its `os` and `cpu` fields stay open: it installs anywhere, and NEW-4 refuses soldiers where there is no containment.
  - Nothing is downloaded at install or at run time. The helper comes inside the package from wherever npm gets the package: the registry, a mirror, npm's cache or a tarball. npm's own proxy and certificate settings apply (`proxy`, `https-proxy`, `cafile`). Shadow Army makes no network request of its own for the helper, so the helper works offline once installed.
  - The post office runs the helper from the installed package. It never runs a copy in a temporary folder, which may be mounted `noexec`.
  - The SHA-256 of each binary is written into the post office's code when the package is built. The post office checks the file against it before each use (NEW-4). A file that has changed is refused, for example after Shadow Army was updated under a running post office.
  - A checkout of the repository holds no binaries. There, `npm run build` compiles the helper for its own system with that system's C compiler, and writes its checksum into that build. That path is for contributors and CI only; nothing in the package compiles anything.
- **NEW-4** (M1; I, F) **The containment check.** A soldier MUST NOT run uncontained.
  - Each time the post office starts, and before any soldier starts, it checks containment:
    1. there is a helper for this system and processor (NEW-2), and the post office can run it;
    2. the helper's SHA-256 matches the one in the post office's code (NEW-3);
    3. a test process, started in containment exactly as a soldier's CLI is, starts a child that leaves its process group and session, and then exits. The post office ends the containment. It then confirms by its own means, not by the helper's report, that the child has ended: a signal 0 finds no such process.

    On Windows only step 3 runs, with a Job Object. The check takes at most 10 seconds.
  - If a step fails, no soldier starts. The post office keeps running and logs the failure (PO-5). The mod shows the failure in `/army` and as the error of each soldier the post office refuses. The message names what failed, the system and its version, the processor, and Shadow Army's version, as in:
    - `No containment helper for linux-riscv64, so no soldier can start. Supported: Linux x64 and arm64, macOS, Windows x64 and arm64.`
    - `The containment helper doesn't match Shadow Army 2.0.1. If Shadow Army was just updated, start a new Claude session; otherwise reinstall it. No soldier can start.`
    - `Containment failed its check on macOS 27.1 (arm64): a test process outlived its containment. No soldier can start. A newer Shadow Army may fix this.`
  - After a failed check, or after a session's containment failed (NEW-5), the check runs again when the owner reconnects or starts a soldier (r, HOST-5).
  - **Who decides.** This spec decides. No setting, flag, environment variable or command lets the owner or the Monarch start a soldier after a failed check.
- **NEW-5** (M1; F) **When containment fails during a session.** A session's containment has failed in any of these cases:
  - the helper ends before the post office asks it to;
  - the helper reports an error;
  - a tree hasn't ended 10 seconds after the post office asked (NEW-1). One cause is a process that runs as another user through `sudo`, which the owner's user can't signal.

  Then:
  - the post office ends every process of the session it can still find. The soldier is down, with an error that says what failed and names each process left, by pid and command, as in `Containment failed for Iron: 1 process couldn't be ended (4242 sudo make install). Iron is down and won't restart by itself.`;
  - the soldier isn't restarted by itself, whatever PO-1's count says. The owner reconnects it, and the check runs first (NEW-4);
  - a turn that was running isn't over while a process the post office named still runs (PO-8). The turn's guard stays open, and the soldier's queue waits. The post office tries again every 10 seconds. Once all the named processes have ended, it finishes the turn as PO-8 says;
  - if the helper ended first, the post office can't tell which processes remain. It finishes the turn as PO-8 says for a turn cut short. The error says that processes the turn started may still be running, and that what they change won't be on the turn's attribution card.
- **NEW-6** (M1; F, R) **An OS update that breaks the helper.** An update can change what containment rests on, most likely on macOS (NEW-8).
  - The first post office start after the update finds it. The check fails and no soldier starts, with a message that names the system, its version and the step that failed (NEW-4). Nothing else changes: records, logs, worktrees and branches stay as they are.
  - Nothing overrides the failed check (NEW-4). Soldiers start again once the owner installs a Shadow Army release whose check passes on that version.
  - The project finds the break too. NEW-10's weekly run tests the latest release on the newest runner image of each supported system, and a failure opens an issue. The fix ships as a patch release.
- **NEW-7** (M1; X, R) **What the containment helper may do.** It does only these operations, each named on its command line. It refuses any other operation, and does nothing.
  - **Linux:** make itself a child subreaper; start the CLI with exactly the program, arguments, folder and environment the post office gives it; stop, kill and reap its descendants.
  - **macOS:** read a process's coalition and unique id; list the processes in a coalition; stop and kill the processes in its session's coalition, by their unique ids; remove its session's launchd job.
  - **Both:** run its part of the check (NEW-4), and report each result to the post office as one line of JSON. It reports on a pipe of its own, never on the CLI's standard streams.

  It MUST NOT:
  - signal or change any process outside its session's containment, or end a coalition that holds the post office or launchd;
  - open a network connection or a listening socket, or create or write a file;
  - look into, keep or log the CLI's arguments, environment or standard streams, beyond passing them to the CLI unchanged. The Monarch's credential never reaches it (PO-3);
  - run with more than the owner's user's rights. It has no setuid or setgid bit and never asks for administrator rights, and its macOS signature grants no entitlement;
  - load any code except its own and the system's libraries;
  - leave anything behind. No process, launchd job or file of a session outlives the end of that session.

  Its source uses only the system's C library and headers, and has no third-party dependency. Tests enforce what they can:
  - on Linux, the tests trace the helper's own system calls and fail on any call outside an allowlist;
  - on macOS, CI fails if the binary imports a symbol outside an allowlist, or if its signature carries an entitlement.

  Review covers the rest.
- **NEW-8** (M1; R, L) **macOS: what containment rests on, and signing.**
  - **Mechanism.** There is a launchd job for each CLI, and that job's coalition (NEW-1). The job is made with `launchctl submit`. That command also tells launchd to keep the job's program alive after a failure, so the helper removes the job before it ends the coalition.
  - **Interfaces Apple doesn't publish.** Containment rests on these:
    - Apple documents neither coalitions nor launchd starting each job in a coalition of its own;
    - the coalition id (`PROC_PIDCOALITIONINFO`) is defined only in XNU's private header `proc_info_private.h`. That header also names the call that reads a process by its unique id (`__proc_info_extended_id`);
    - the helper lists processes, reads them and signals them by audit token through calls in `libproc.h`. That header says of itself that it "contains private interfaces" that "are subject to change in future releases";
    - launchctl's manual lists `submit` among its legacy subcommands.

    Apple can change any of these in an update, without notice. That is why the check proves containment on each Mac before a soldier starts (NEW-4). NEW-6 says what happens when an update breaks containment.
  - **Signing.** The macOS binary is signed with the project's Developer ID Application certificate, with the hardened runtime and a secure timestamp. It is notarized by Apple's notary service, as Apple requires for software distributed with a Developer ID. It claims no entitlement. A notarization ticket can't be stapled to a standalone binary; M1-AC15 confirms that an installed helper runs with the network off.
  - A Developer ID needs the project's Apple Developer Program membership. The signing and notary credentials are used only by the release workflow (NEW-9).
- **NEW-9** (M1; R) **Built, checked and attested in CI.**
  - **Where.** CI builds every binary from the commit it tests or releases, on GitHub-hosted runners. No binary that ships is built anywhere else.
  - **Pinned toolchains.** The Linux binaries are built in a container image named by its digest. The macOS binary is built with a named Xcode version on a named runner image. Changing either is a reviewed change to the workflow.
  - **Reproducible.** Two jobs on separate runners build each binary from the same commit. Their outputs MUST be byte-identical, with the macOS one compared before signing, or the run fails.
  - **Checksums.** The SHA-256 of every binary that ships goes into the post office's code (NEW-3), into a `SHA256SUMS` file in the package, and onto the release.
  - **Provenance.** Each binary and the package tarball get a GitHub artifact attestation, which `gh attestation verify <file> -R <owner>/<repo>` checks. A package published to the npm registry is published with provenance, which `npm audit signatures` checks. Both need the repository to be public when the release is built: npm makes no provenance for a private repository, and GitHub attests a private repository's builds only on GitHub Enterprise Cloud. A release built without them says so in its notes, and still has the checksums and the reproducible builds.
  - **The release.** The release workflow runs only for a release tag. In this order, it:
    1. builds the binaries again, and checks them against those the commit's CI run built and tested;
    2. signs and notarizes the macOS binary (NEW-8);
    3. runs the containment tests on the signed bytes, on every macOS runner of NEW-10;
    4. attests and publishes, only after the first three steps pass.

    The Apple credentials are secrets of a GitHub environment that only this workflow uses. For a private repository, environment secrets need GitHub Pro, Team or Enterprise. Where GitHub offers required reviewers (a public repository, or GitHub Enterprise), the owner approves each run.
- **NEW-10** (M1; R) **CI on every system and processor.**
  - Every CI run builds the binaries first (NEW-9), and every later job uses those bytes.
  - The containment tests (NEW-1, NEW-4, NEW-5, NEW-7) run on:
    - Linux x64 and arm64, on the oldest and the newest Ubuntu that GitHub hosts;
    - Alpine Linux (musl) in a container, on x64 and arm64;
    - macOS on Apple silicon and on Intel, each on the oldest and the newest version that GitHub hosts;
    - Windows x64 and arm64, for the Job Object.
  - **Install test.** On each of these systems, CI installs the package tarball with npm, using `--ignore-scripts`, with the network off once the package's dependencies are in npm's cache. It then starts a fake soldier through the installed helper. The test passes only if the helper is still executable and its checksum still matches.
  - **Weekly.** A scheduled run tests the latest release on the newest runner image of each supported system, so a new image is tested within a week of GitHub offering it. A failure opens an issue. GitHub turns off a public repository's schedules after 60 days without activity, so each release's checklist confirms the schedule is on.
  - **Release.** The signed macOS binary is tested again before it ships (NEW-9).
```

### 4. §5.1 Levels

Old (line 470):
```markdown
  - crash, restart and resume.
```
New:
```markdown
  - crash, restart and resume;
  - process containment with the binaries that ship, on each system and processor (NEW-1, NEW-10).
```

Old (line 475):
```markdown
  - The mod has no approval path.
```
New:
```markdown
  - The mod has no approval path.
  - The containment helper makes only its allowed system calls and imports, and signals nothing outside its containment (NEW-7).
```

Old (line 479):
```markdown
  - a CLI that leaves a child process running;
```
New:
```markdown
  - a CLI that leaves a child process running, and a CLI whose child leaves its process group and session and outlives its parent;
```

Old (line 491):
```markdown
  - a broken link in a worktree.
```
New:
```markdown
  - a broken link in a worktree;
  - a containment helper that is missing, can't be run, has changed, fails its check, or is killed during a session, and a process the owner's user can't signal (NEW-4, NEW-5).
```

### 5. §5.2 VER-2 and VER-6

Old (line 503):
```markdown
- **VER-2** (M1; R) **Three systems.** CI runs every test level except L on ubuntu, macos and windows.
```
New:
```markdown
- **VER-2** (M1; R) **Three systems.** CI runs every test level except L on ubuntu, macos and windows. The containment tests also run on each processor NEW-2 supports, with the binaries that ship (NEW-10).
```

Old (line 508):
```markdown
  - the post office and the channels keep at least 85% line coverage, counted over the three systems' runs together (VER-2): a line is covered when any system's run covers it;
```
New:
```markdown
  - the post office and the channels keep at least 85% line coverage, counted over the three systems' runs together (VER-2): a line is covered when any system's run covers it. The containment helper's C source counts as post office code: its lines are measured on an instrumented build of the same source, run by the same tests, and join the same count;
```

### 6. §6 M1

Old (line 538):
```markdown
- PO-1, PO-2, PO-3, PO-5, PO-7;
```
New:
```markdown
- PO-1, PO-2, PO-3, PO-5, PO-7;
- NEW-1 to NEW-10;
```

Insert after line 557 (M1-AC8):
```markdown
- **M1-AC9** Containment, with the binaries that ship, on each system and processor of NEW-10 (NEW-1, PO-1):
  - a fake CLI starts a child that leaves its process group and session, and then exits. Closing the channel ends the child within 10 seconds, and a signal 0 then finds no such process;
  - the same holds when the post office is killed instead of closing the channel. On macOS, no launchd job is left;
  - a process of the same user, outside the session, survives every one of these endings;
  - on macOS, the post office refuses to start the CLI with a test build of the helper that reports the post office's coalition as the job's, or with one whose coalition holds another process.
- **M1-AC10** Choosing and installing the helper (NEW-2, NEW-3):
  - on each system and processor, the post office uses the binary NEW-2 names. `lipo -archs` lists `x86_64 arm64` for the macOS binary, and each Linux binary is statically linked;
  - a system or processor with no binary, set through the test configuration (VER-5), gets NEW-4's message, and the post office keeps running;
  - the package has no install script and no `binding.gyp`. Installed with `--ignore-scripts` and the network off, it starts a fake soldier and runs the helper from the installed package.
- **M1-AC11** The check (NEW-4, NEW-6):
  - four helpers each make the post office refuse every soldier, each with its own message: a missing helper, one that can't be run, one with a byte changed, and a test build whose containment fails on purpose. The post office keeps running, and `/army` shows the message;
  - once the cause is gone, reconnecting reruns the check and starts the soldier;
  - review confirms that no setting, flag, environment variable or command starts a soldier after a failed check.
- **M1-AC12** Fault tests on Linux and macOS for containment that fails during a session (NEW-5, PO-1, PO-8):
  - a fake CLI's child runs as another user through `sudo`. Closing the channel fails after 10 seconds. The soldier is down, with an error that names that process, and it isn't restarted;
  - when this happens during a turn, the turn's guard stays open until the process ends, and then the turn is finished once;
  - killing the helper during a session puts the soldier down, and the soldier isn't restarted. Its turn is finished as cut short, and the error says that processes may still be running.
- **M1-AC13** The helper does only what NEW-7 allows (NEW-7):
  - on Linux, a trace of the helper's own system calls in every containment test stays inside the allowlist;
  - on macOS, the binary imports only allowlisted symbols, and its signature carries no entitlement;
  - no file in the package has a setuid or setgid bit, and an unknown operation is refused and changes nothing.
- **M1-AC14** A release dry run from a test tag (NEW-8, NEW-9, NEW-10, VER-2, VER-6):
  - each binary built twice is byte-identical, with the macOS one compared before signing, and matches what the commit's CI run tested;
  - the macOS binary carries the project's Developer ID, the hardened runtime and a secure timestamp. It is notarized, and the signed binary passes the containment tests on every macOS runner;
  - `SHA256SUMS`, the checksums in the post office's code and the binaries all agree;
  - `gh attestation verify` passes for each binary and for the tarball. Where attestations aren't available, the release notes say so;
  - CI's matrix covers every system and processor of NEW-10, the weekly run exists, and VER-6's count includes the helper's C lines.
- **M1-AC15** Live: on a Mac and on a Linux machine, neither of which has a C compiler, the owner installs the package tarball and starts a claude soldier, once with the network off. Nothing asks for a compiler, and macOS shows no prompt or notification. Closing the soldier leaves no process and no launchd job behind (NEW-3, NEW-8).
```

### 7. §7 Decisions

Insert after line 709:
```markdown
| 0016 | Process containment ships as a prebuilt helper for each system and processor, checked at every start | — |
```

### 8. §8 Q8

Old (line 720):
```markdown
- **Q8** M1's draft (#75) stops processes from escaping a closing session (PO-1) with a small C helper, compiled on the owner's machine the first time a session starts on Linux or macOS. It needs a C compiler there (on macOS, Xcode's command-line tools). On macOS it reads process details through structures Apple doesn't publish, so an update could break it; then it refuses to start a soldier rather than run one uncontained. Keep it, ship the helper prebuilt for each system and processor, or contain processes another way? Decide before v2.0.0.
```
New:
```markdown
- **Q8** *Answered (D-3):* the containment helper ships prebuilt in the package for each supported system and processor, and is built, tested and attested in CI (NEW-1 to NEW-10). Nothing is compiled on the owner's machine. On macOS, the helper still rests on interfaces Apple doesn't publish (NEW-8). When an update breaks it, no soldier starts on that system until a release passes the check (NEW-6).
```

---

## Note of sources

**Linux**
- The subreaper hands an orphan to "the nearest still living ancestor subreaper"; available since Linux 3.4: https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html
- `ECHILD` means "does not have any unwaited-for children"; a zombie keeps its PID until it is waited for: https://man7.org/linux/man-pages/man2/wait.2.html
- Signal 0 checks that a process exists; `EPERM` when the caller can't signal it: https://man7.org/linux/man-pages/man2/kill.2.html
- The `children` file "reliably provides a list of children only if all of the child processes are stopped or frozen". That is why NEW-1 ends on `ECHILD` and not on that file: https://man7.org/linux/man-pages/man5/proc_tid_children.5.html
- `noexec`: https://man7.org/linux/man-pages/man8/mount.8.html
- `-static` "prevents linking with the shared libraries": https://gcc.gnu.org/onlinedocs/gcc/Link-Options.html
- Recorded probe (D-3 prototype, WSL Ubuntu 24.04): a dynamic gcc 13 build needs glibc 2.34, so it wouldn't run on RHEL 8 or Ubuntu 20.04. A `-static` build avoids this. Compiling took 0.1 to 0.15 s.

**macOS**
- Universal binaries, `lipo`: https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary
- On Apple silicon every executable must be signed, an ad hoc signature is enough, and the toolchain signs at link time: https://developer.apple.com/documentation/macos-release-notes/macos-big-sur-11_0_1-universal-apps-release-notes
- Notarization is required for Developer ID software, with the hardened runtime, a Developer ID certificate and a secure timestamp: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- "It's not currently possible to staple tickets" to standalone binaries: https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
- Hardened runtime: https://developer.apple.com/documentation/security/hardened-runtime
- Developer ID: https://developer.apple.com/support/developer-id/
- The Apple Developer Program costs 99 USD a year: https://developer.apple.com/programs/
- Gatekeeper: https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web
- `PROC_PIDCOALITIONINFO`, and the `__proc_info_extended_id` flags: https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info_private.h
- libproc.h's "private interfaces … subject to change": https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.h
- `launchctl submit` keeps the program alive "in the event of failure" (Apple's open-source launchd manual, 2009): https://github.com/apple-oss-distributions/launchd/blob/main/man/launchctl.1

**Windows**
- `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and the breakaway limits: https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information

**Node.js and npm**
- `process.platform`, `process.arch` (the architecture Node.js was compiled for), and `process.kill(pid, 0)`: https://nodejs.org/api/process.html
- `files`, `os`, `cpu`, and `private` ("npm will refuse to publish it"): https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- Install scripts, and the `node-gyp rebuild` default when `binding.gyp` is present: https://docs.npmjs.com/cli/v11/using-npm/scripts
- `ignore-scripts`, `proxy`, `https-proxy`, `cafile`, `offline`: https://docs.npmjs.com/cli/v11/using-npm/config
- Provenance needs npm 9.5.0 or later, a GitHub-hosted runner and `id-token: write`; it is checked with `npm audit signatures`: https://docs.npmjs.com/generating-provenance-statements
- No provenance for private repositories: https://docs.npmjs.com/trusted-publishers

**GitHub**
- Runner labels, including `ubuntu-*-arm`, `macos-14/15/26`, `macos-15-intel`, `macos-26-intel` and `windows-11-arm`; passwordless `sudo`; private-repository minutes: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- Artifact attestations ("Who can use this feature?": on Free, Pro and Team, public repositories only; private repositories need Enterprise Cloud): https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations and https://docs.github.com/en/actions/concepts/security/artifact-attestations
- `gh attestation verify`: https://cli.github.com/manual/gh_attestation_verify
- Required reviewers (on Free, Pro and Team, public repositories only) and environment secrets: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- Schedules are disabled after 60 days without activity in a public repository: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

**Other**
- Definition of a reproducible build: https://reproducible-builds.org/docs/definition/

**Not settled by any document (NEEDS-PROBE, or settled by the ACs named)**
- launchd placing each submitted job in a coalition of its own, with descendants staying in it, is undocumented. M1's passing macOS CI shows it today, and NEW-4's check proves it on each Mac.
- That current launchctl(1) lists `submit` among its legacy subcommands comes from the manual installed with macOS. Apple hosts no copy of it; confirm it with `man launchctl` on each supported version.
- Whether the notary service accepts the helper is settled by M1-AC14. Whether an npm-installed, notarized standalone helper runs, online or offline, without any Gatekeeper prompt or "background item" notification when jobs are submitted is settled by M1-AC15.
- No npm document says that npm keeps a packaged file's executable bit. NEW-10's install test settles it.

**Facts outside the text that bear on this option**
- `https://github.com/mogesjohnson/shadow-army` returned 404 to an unauthenticated request on 2026-10-14, so the repository looks private, and `package.json` has `"private": true`. NEW-9's provenance therefore needs the repository to be public, or Enterprise Cloud for attestations. Environment secrets need a paid plan. Registry publishing needs `"private"` removed.
- Windows is outside this option. M1 sets up its Job Object through Windows PowerShell's `Add-Type`, which compiles C# at run time. Under AppLocker or App Control, PowerShell runs in ConstrainedLanguage mode, where `Add-Type` "can't load arbitrary C# code or Win32 APIs": https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_language_modes?view=powershell-5.1. NEW-1 and NEW-4 say what the Job Object must do on Windows, not how it is created.
