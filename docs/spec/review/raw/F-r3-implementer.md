F, round 3, implementer (spec-reviewer, Opus, high), on v0.15 (v2@8e45853.md), session 8, 2026-10-23

- severity: P2
  type: contradiction
  location: M1-AC15, M1-AC18 (.shadow/v2-tools/review/snapshots/v2@8e45853.md:1094, 1096, 1110, 1111); PO-21 (:456); PO-14 (:366); PO-13 (:353)
  claim: The ACs need a "test build of Shadow Army" whose helper, guardian or check misbehaves on purpose, but the spec never defines one, and PO-21 says every job after the build uses the shipped bytes.
  scenario: Reading A: a test build is a separate compile with fault-injection code. Then the containment jobs run bytes that PO-21:456 says they don't ("every later job uses those bytes, except VER-6's coverage job"), and the post office in that job needs other checksums baked in (PO-13:353), so I'd build a second post office too. Reading B: the shipped helper and post office have a hidden fault mode, turned on by an environment variable or an argument, so PO-21 holds. But then the release ships fault-injection code that an environment variable turns on, which PO-14:366's "No setting, flag, environment variable or command" is meant to rule out, and M1-AC21's "matches what the commit's CI run tested" (:1125) is ambiguous. Each reading breaks one of the two texts.
  evidence: "a test build of Shadow Army whose helper reports the post office's coalition as the job's" (:1094); "a test build whose guardian never reports ready" (:1096); "a test build of Shadow Army whose containment fails each step of the check on purpose" (:1110); "a test build whose check hangs at a step" (:1111); "test build" appears nowhere else. PO-21: "every later job uses those bytes, except VER-6's coverage job" (:456).
  fix: Add to PO-21: "A test build is built from the same source with fault injection compiled in, as `npm run build` does for contributors (PO-13), with its own checksums in its own post office build. It runs only in the jobs of the ACs that name it, never ships, and no switch in a shipped file turns its faults on. Every other job uses the shipped bytes."

- severity: P2
  type: untestable
  location: VER-6 (.shadow/v2-tools/review/snapshots/v2@8e45853.md:979); PO-19 (:436)
  claim: VER-6 says the Windows script "counts the same way" as the helper, through "that language's own coverage tool". But PowerShell's tool, Pester, can't measure a script that the post office starts as a separate `powershell.exe -File` process, and PO-19 forbids running any other copy.
  scenario: The containment tests start the guardian as PO-19:436 says: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script>`, run "from there, never from a copy written elsewhere". Pester measures code run inside its own Invoke-Pester session. So reading A: unit-test the script's functions in-process under Pester. That isn't "the same tests", and every path that ends with the job being killed (M1-AC16) goes unmeasured. Reading B: write an instrumented copy of the script that logs its own hits. That isn't "that language's own coverage tool", it is a copy PO-19 forbids, and its changed bytes fail PO-13's checksum check. Pester also reports commands, not lines ("735 analyzed Commands"), so it's unclear what the 85% "line" bar means for the script.
  evidence: VER-6: "Code in another language, such as a native helper or a PowerShell script, keeps the same bars through that language's own coverage tool ... The Windows script counts the same way" (:979). PO-19: "The post office runs the script from there, never from a copy written elsewhere" (:436). Pester's coverage page reports "analyzed Commands" and says nothing about child processes (https://pester.dev/docs/usage/code-coverage). NEEDS-PROBE: whether any Pester mode measures a script run in a child powershell.exe.
  fix: "The Windows script's commands are measured with Pester's code coverage, counted in commands, by tests that dot-source the script's functions and run them under Pester. The containment tests run the shipped script unmeasured. Commands that run only after the job is killed are listed by name in the coverage job, and the PR reviewer checks the list." Or decision: (a) as above; (b) a test-only instrumented copy, with PO-19 and PO-13 naming the exception.

- severity: P2
  type: ambiguity
  location: §5.1 L, the budget (.shadow/v2-tools/review/snapshots/v2@8e45853.md:951, 957-965)
  claim: The budget counts "every live check", and the text defines a live check as the two-prompt parity task. But it also budgets for VER-10's army runs, and it never says whether the other owner-run model calls count (M1-AC8, M1-AC14, M1-AC22, M6-AC11, M6-AC17's recordings, VER-4's contract recordings).
  scenario: Reading A: only the parity task counts. Then the dozens of contract-fixture sessions (§5.1 C, :894-903) and VER-10's three-system army runs with codex soldiers spend without limit and never wait for the owner's go, even though "The rest leaves room for VER-10's runs" (:964) says they come out of the cap. Reading B: every L run counts. Then a VER-10 run's tokens have no counting rule, since "the measure" (:954) is defined only as "the sum over both prompts", and the checker can't tell which run makes a check "one with no earlier figures". Under A, a release can pass $2 of claude cost with no go. Under B, the tool can't compute the spend.
  evidence: "Live checks (L). The owner runs the two-prompt task on each CLI" (:951); "Every live check run toward it since the tag before it counts: every milestone's, on every system, repeats included" (:957); "The rest leaves room for VER-10's runs" (:964); "For each run, the sum over both prompts" (:954).
  fix: decision: (a) every run the owner makes with a real model toward a release counts (L checks, contract recordings, live ACs), and for a run that isn't the parity task its tokens are the sum over all its turns, counted as the measure says; (b) only the parity task counts, and the text drops "VER-10's runs" from "Why 1,000,000", accepting that other live runs are unbudgeted.

- severity: P2
  type: ambiguity
  location: §2 Worktree (.shadow/v2-tools/review/snapshots/v2@8e45853.md:80); WSP-1 (:740); SES-1 (:637)
  claim: "One per soldier per Claude Code process" doesn't say what happens to a soldier's worktree and branch when the owner restarts Claude Code in the same folder: whether they are reused, replaced or left behind.
  scenario: Kaisel commits work on its branch, and the owner quits Claude Code without `/apply`. A new Claude Code process starts in the same folder, with the same army mark (WSP-11:771). Reading A, per process: the new post office makes a new worktree and branch for Kaisel. The old ones are "this army's own" through the old logs (WSP-10:767), but no text names them at start (WSP-1 names only worktrees "whose army's folder is gone"), and `/apply Kaisel` and `/diff Kaisel` show an empty new branch. The owner's unapplied work is orphaned with no message. Reading B, per folder: the new process reuses `shadow/<mark>/…` for Kaisel, which contradicts "per Claude Code process" in §2 and WSP-1. The branch name after `shadow/<mark>/` isn't given either, so the two readings also build different names.
  evidence: §2: "a soldier's own git worktree and branch, one per soldier per Claude Code process" (:80); WSP-1: "One worktree per soldier per Claude Code process ... At start, the log, and one line in Claude's transcript, name each such worktree whose army's folder is gone" (:740); SES-1: "one open session per Claude Code process" (:637).
  fix: decision: (a) a soldier's worktree and branch belong to its folder's army and are reused by the next Claude Code process there, with a new session (SES-1); (b) each process makes new ones, and at start the log and one transcript line name each earlier process's worktree with unapplied commits, which stays for the owner, as WSP-1 says for a gone army's.

- severity: P2
  type: vendor-fact
  location: §5.1 S (.shadow/v2-tools/review/snapshots/v2@8e45853.md:950)
  claim: The strip's snapshot width is given as "its column's width less the band's five-column mark". "The band" is defined nowhere in the spec, the five-column width isn't in the recorded mod API, and the API says the band's mark already sits outside `bodyColumns`.
  scenario: At a 110-column terminal, reading A renders the strip tree at 110 − 5 = 105 columns. Reading B renders it at the `bodyColumns` Claude Code gives, which per the reference already excludes the band's `[-]` mark. Then subtracting 5 more makes the snapshots 5 columns too narrow, or the right width only if the mark really is 5 columns. The committed snapshots then differ from what the live host draws, and the VIS-3/M5-AC7 checks at "under 50 columns" can pass or fail on a different width than the owner sees.
  evidence: §5.1 S: "the strip at its column's width less the band's five-column mark" (:950); "band" occurs only on that line. Mod reference: "A `Pane` or `AbovePrompt` hook sizes its tree to `e.props.bodyColumns` instead: the box it draws into, no cell of which lies under a mark of the engine's (its close mark and the band's `[-]` sit outside it)" (.shadow/v2-tools/review/evidence/mod-api-2.1.294/reference.md:113). No width is given there. NEEDS-PROBE: the `bodyColumns` an AbovePrompt band gets at 144, 110 and 80 columns, alone and beside a docked pane.
  fix: "the strip at the `bodyColumns` Claude Code gives the band above the prompt at each terminal width, alone and beside the docked pane (recorded by probe P-n: N, N and N columns)", with the probe's figures put in once recorded.

- severity: P2
  type: ambiguity
  location: VER-7 (.shadow/v2-tools/review/snapshots/v2@8e45853.md:980); Appendix B rule 9 (:1408)
  claim: "In its title or a comment beside it" doesn't say what counts as "beside" a test, so the trace script can be built so that one file comment satisfies rule 9 with no test at all.
  scenario: Reading A: the script scans each test file's text for IDs. Then a file whose header comment lists `PO-9 PO-10 PO-11`, above a single `it()` that checks something else, passes rule 9 for all three, and the guarantee "named by at least one test" is empty. Reading B: the script ties each ID to an `it`/`test` call, through its title or a comment on the line just before it or inside its body. This needs a parser for vitest, and a rule for the C, PowerShell and C# tests that VER-6 brings in. The two scripts pass different code.
  evidence: "Each test names the requirement or AC IDs it verifies, in its title or a comment beside it" (:980); rule 9: "is named by at least one test" (:1408).
  fix: "...in its title, or in a comment on the line directly above its `it`/`test` call (for tests in other languages, the same position above the test function). An ID anywhere else in a test file names nothing."

- severity: P2
  type: gap
  location: VER-5 (.shadow/v2-tools/review/snapshots/v2@8e45853.md:974); CH-1 (:473); M1-AC10 (:1063)
  claim: The product must start a fake "exactly as it starts the real CLI", but nothing says how a Windows CLI that is a `.cmd` shim is started or quoted, or which file wins when one `PATH` entry holds both `claude.exe` and `claude.cmd`.
  scenario: On Windows, npm-installed codex, grok and claude are `.cmd` shims. Node refuses to spawn a `.cmd` without a shell, so either the adapter (or the guardian) runs it through `cmd.exe`, and `cmd.exe` re-parses arguments such as `--model <trusted config value>` and an inline `--settings` JSON (M1-AC14:1088), where `%`, `&`, `^` and `"` change the command. Or it resolves the shim to `node <script>`, which is not "exactly as" the real CLI. With `claude.exe` and `claude.cmd` in one directory, reading A takes PATHEXT order (`.EXE` first), and reading B takes the first one listed. M1-AC10 tests only which directory wins. Two implementers build different launchers, and one may pass a config value to `cmd.exe` unescaped.
  evidence: VER-5: "so the product starts a fake exactly as it starts the real CLI (CH-1)" (:974); CH-1: "An adapter starts its CLI from an absolute path found on `PATH` alone ... On Windows the current folder is never searched" (:473); CH-2 knows of the shim only for the instructions ("as through a Windows `.cmd` shim", :484). Node.js: "Spawning .bat and .cmd files on Windows" (https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows); Codex's draft escapes "for both passes, as cross-spawn does" (C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts:403) and searches PATHEXT (:386), choices the spec doesn't make.
  fix: Add to CH-1: "On Windows, a name is looked up in each absolute `PATH` entry with each extension of `PATHEXT` in order, and the first match wins. A `.cmd` or `.bat` CLI is started through `cmd.exe /d /s /c` with every argument escaped for both `cmd.exe` and the program's own parser. An argument that can't be escaped safely, such as one holding `%`, goes through a file instead, as CH-2 does for the instructions. The fakes on Windows are `.cmd` shims, and the unit test covers the escaping."

- severity: P3
  type: gap
  location: Appendix B rule 7 (.shadow/v2-tools/review/snapshots/v2@8e45853.md:1406)
  claim: Rule 5 is checked "against the IDs of the spec on the PR's base branch", but CI also runs on pushes to `main`, where there is no PR base.
  scenario: After a merge, the push run on `main` has no base branch. One script skips rule 5 there, another compares against `HEAD~1`, and a third fails the build.
  evidence: "against the IDs of the spec on the PR's base branch, which CI fetches" (:1406).
  fix: "...on the PR's base branch, or on a push, the spec at the commit before the push, which CI fetches."

- severity: P3
  type: editorial
  location: Appendix A, the WSP-11 row (.shadow/v2-tools/review/snapshots/v2@8e45853.md:1381); WSP-11 (:779)
  claim: WSP-11's text carries a 2.0 source, "(from 2.0 WS-3)", that its Appendix A row leaves out.
  scenario: An implementer looking up WSP-11's 2.0 detail, as §0 tells them to (:31), never opens WS-3.
  evidence: WSP-11: "discarded with the rest and not reported (from 2.0 WS-3)" (:779); Appendix A: "WSP-11 | v1 (CLAUDE.md design rules; `src/core/summon.ts`)" (:1381).
  fix: Appendix A row: "WSP-11 | v1 (CLAUDE.md design rules; `src/core/summon.ts`); 2.0 WS-3".

- severity: P3
  type: gap
  location: VER-7 (.shadow/v2-tools/review/snapshots/v2@8e45853.md:980)
  claim: `docs/spec/implemented.txt` has no format, and nothing says how a requirement with two milestones (PO-18, PO-20, SI-2, VER-8, VER-9) counts as "of an earlier milestone".
  scenario: One script reads a first line `M2` and then one ID per line. Another expects `milestone: M2`. With M3 being built, whether SI-2 (M1, M2) is "earlier" depends on whether the first or the last milestone is used.
  evidence: "A committed file, `docs/spec/implemented.txt`, gives the milestone being built and the requirements implemented so far" (:980).
  fix: "Its first line is the milestone being built, as `M2`; each further line is one requirement ID. A requirement with two milestones is of an earlier milestone once both of its milestones are earlier than the one the file gives."

Coverage: header (:1-12); §0, §1 (G1-G7, non-goals), §2 (every glossary entry), §3; §5.1 U, C, I, X, F, S, L and the budget; VER-1 to VER-10; LEG-1; §6 M0 spikes S1-S5, M1 Implements, S7, M1-AC1 to M1-AC22, M2 Implements and M2-AC1 to M2-AC11, M3 Implements and M3-AC1 to M3-AC14, M4 Implements and M4-AC1 to M4-AC7, M5 Implements and M5-AC1 to M5-AC10, M6 Implements and M6-AC1 to M6-AC17; §7; §8 Q1-Q9; Appendix A (checked against every `(from …)` in the spec); Appendix B rules 1-9 (rules 3 and 4 checked against every requirement's milestone and each milestone's Implements and ACs; rule 8 checked for M1's ACs and PO-1's and PO-3's citations); Appendix D (assets, actors, rows 1-17, residuals 1-13, the closing paragraph). Cited and read: HOST-2, PO-1, PO-2, PO-3, PO-7 (:252-256), PO-12 to PO-14, PO-19 to PO-21, CH-1, CH-2 (:484), ARM-6, ARM-7, ARM-8, WSP-1 to WSP-12 (in part), SES-1, VIS-3; ADR files 0008-0015; settled.md; decisions D-8, D-11; ledger rows R-F-46, R-F-69, R-F-108, R-M1-61 (none raised again).
