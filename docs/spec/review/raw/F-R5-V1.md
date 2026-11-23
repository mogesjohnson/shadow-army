# F-R5-V1: verifier for R-F-173 (spec-verifier, Opus, high; 2026-11-23, worker w1-f-round5). Packet: `batches/F-R5-V1.md`.

- id: R-F-173 (packet F-R5-V1)
  verdict: CONFIRMED
  severity: P1. It stays P1. A unit test can show the failure: a program the soldier planted in its snapshot runs as the owner. It runs outside a sandboxed CLI's (codex's) sandbox, and nothing holds or reports it. Row 9 claims "prevented". The precondition is a `.` or empty `PATH` entry ahead of the real program's folder. CH-1 and M1-AC10 :1111 already treat that precondition as a threat worth defending, so the protection is missing at the very point the spec claims it holds.
  evidence:
    - Snapshot `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/review/snapshots/v2@1d99e92.md`.
    - CH-1 :499 cleans `PATH` only for the CLI: "each CLI starts with the post office's `PATH` less every relative or empty entry ...".
    - WSP-10 :795 resolves the git binary "as CH-1 starts each CLI". It sets `GIT_DIR`, `GIT_WORK_TREE` and `GIT_COMMON_DIR`, and :796 sets `GIT_TERMINAL_PROMPT=0`, but nothing sets git's `PATH`.
    - HOST-2 :118 covers only how the mod finds Node.js.
    - M1-AC10 :1111 checks only the `PATH` the fake claude receives. Its :1110 case records harness git's environment for `GIT_DIR`, `GIT_WORK_TREE` and `GIT_COMMON_DIR` only.
    - Row 9 :1832 says "Each CLI starts with no relative or empty `PATH` entry ... prevented". Row 8 :1831 covers hooks, fsmonitor and config changes, not program lookup.
    - Residual 7 :1852 covers a config change racing a harness git command. Residual 15 :1865 accepts that a filter in the config at start runs as the owner's. Neither covers the owner's own filter resolving a bare program name to a file in the snapshot.
    - WSP-10 compares the config, `hooks/`, `info/` and worktree metadata (:798). A `.gitattributes` and an executable in the working tree are neither, so nothing is held. M1-AC10 :1105 holds only for a filter driver *added* after start.
    - The filter runs at all: WSP-10 :793 says a filter set at start "is the owner's, and runs". M1-AC10 :1105 itself assumes a touched file makes harness git run a filter.
    - Nothing in settled.md, the ADRs or the ledger limits the cleaned `PATH` to CLIs on purpose. R-M1-118 added the `.`/empty-entry case for the CLI only.
    - Git source, https://raw.githubusercontent.com/git/git/master/sub-process.c: `subprocess_start`, which starts a `filter.<driver>.process`, sets `use_shell = 1` and no `dir`.
    - Git source, https://raw.githubusercontent.com/git/git/master/run-command.c, three points. First, `prepare_shell_cmd` wraps the command in a shell when `argv[0]` holds a space or another metacharacter, so `git-lfs filter-process` runs under `sh -c`. Second, the shell is `SHELL_PATH` off Windows, and on native Windows `sh` is looked up in `PATH`. Third, git's own `locate_in_PATH` reads an empty entry as the current directory ("POSIX specifies an empty entry as the current directory"). A child with no `dir` inherits git's current directory.
    - POSIX XBD 8.3, https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap08.html: "A zero-length prefix is a legacy feature that indicates the current working directory". `.` is an actual pathname for the current directory.
    - https://git-scm.com/docs/gitattributes says nothing about a filter's working directory or its shell.
  reason: Harness git and every filter it runs inherit the post office's uncleaned `PATH`. A filter trusted at start and named by a bare name (git-lfs style) can therefore run an executable that the soldier wrote at its snapshot's root. That contradicts row 9's "prevented", and nothing else in the spec covers the case.

The packet asks whether a git-lfs-style filter trusted at start, run by a bare name, can resolve to a program in the snapshot as the text stands. On Linux and macOS it can, given these three facts:
1. The global config holds `filter.lfs.process = git-lfs filter-process`, which WSP-10 :793 trusts at start.
2. The post office's `PATH` holds `.` or an empty entry ahead of the folder where the real `git-lfs` lives. Git prepends only its own exec-path, and git-lfs is not normally there.
3. A harness git command runs in the snapshot and needs a clean result for a touched file, such as the guard's or the snapshot report's `git status` or `git diff`.

Git starts the filter through `/bin/sh -c`. The child has no `dir`, so it runs in git's current directory. That is the snapshot's top level, where Shadow Army runs it, and where git changes to for a command that needs a work tree. sh reads the empty entry or `.` as the current directory and runs the snapshot's `git-lfs` as the owner. A `clean = name %f` filter behaves the same way.

NEEDS-PROBE parts. These are not needed for the verdict, but should go to a probe or build note:
- **Git for Windows.** Does git's own `PATH` lookup of `sh`, and MSYS2 sh's lookup of the filter program, honour `.` and empty entries? Does the `git.exe` wrapper in `cmd\` prepend `mingw64\bin`, where the bundled `git-lfs.exe` lives, ahead of them? If git's lookup of `sh` honours them, a snapshot `sh.exe` is a second vector, and the fix below closes it too.
- **git's current directory** when Shadow Army runs it with a cwd outside the snapshot. The docs don't state it; git's source suggests the work tree's top. The fix makes the answer irrelevant.

Paste-ready fix against the snapshot (three edits):

1. WSP-10, git bullet (:795)
OLD:
```
  - runs a git found by its absolute path on `PATH` alone, as CH-1 starts each CLI, never one in the folder, a worktree or a snapshot, with `GIT_DIR`, `GIT_WORK_TREE` and `GIT_COMMON_DIR` in its environment naming
```
NEW:
```
  - runs a git found by its absolute path on `PATH` alone, as CH-1 starts each CLI, never one in the folder, a worktree or a snapshot, with CH-1's `PATH` in its environment, the post office's less every relative or empty entry and every entry in the folder, a worktree or a snapshot, compared by real path as CH-1 says, each one dropped named in the post office's log, and on Windows with `NoDefaultCurrentDirectoryInExePath=1`, so no program that git, a filter or a program a filter starts runs by name is taken from the repository's files; and with `GIT_DIR`, `GIT_WORK_TREE` and `GIT_COMMON_DIR` in its environment naming
```

2. M1-AC10, the last bullet (:1111): append at its end, after "none is searched or passed on, and the log names each."
NEW (appended):
```
 A filter set in the user's global git config before the post office starts, `filter.fakelfs.process = fake-lfs filter-process`, with a `fake-lfs` in `test/fakes/` and `.` and an empty entry ahead of it on the post office's `PATH`: a soldier at `auto` writes an executable `fake-lfs` at its snapshot's root and a `.gitattributes` naming `* filter=fakelfs`, and edits a tracked file. The harness git commands that follow, the guard's included, run the `test/fakes/` `fake-lfs` and never the snapshot's, and the git on `PATH` that records its environment (above) shows a `PATH` holding none of the dropped entries (WSP-10).
```

3. Appendix D row 9 (:1832), Control column
OLD:
```
Each CLI starts with no relative or empty `PATH` entry and none in the folder, a worktree or a snapshot, so a CLI's shim takes no program from the repository's files.
```
NEW:
```
Each CLI, and each harness git command, starts with no relative or empty `PATH` entry and none in the folder, a worktree or a snapshot, so neither a CLI's shim nor a filter that harness git runs takes a program from the repository's files by name; a filter command that names a path runs as residual 15 says.
```
Row 9's Evidence column already cites WSP-10 (X) and M1-AC10, so it needs no change. Row 8 and residual 15 can stay as they are.

The only files involved are the snapshot and the ledger row:
- `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/review/snapshots/v2@1d99e92.md`
- `C:/Users/johns/projects/AIConnections-worktrees/review/docs/spec/review/ledger.md` :212

No file was edited.
