# D-3 judge: Q8, how the process helper ships: A (compile at first use), B (prebuilt), C (no native helper), against spec v0.8. Recommends B, big. Rerun 2026-10-16 after session 2's run was cut off by the usage limit; 217,192 tokens, 48 tool calls, 16 min.

## D-3 (Q8) scores

| # | Criterion | A: compile at first use | B: prebuilt | C: no native helper | Why |
|---|---|---|---|---|---|
| 1 | Safety and security | 4 | 5 | 2 | **A and B** use the same containment. In the prototype it ended every process: 0 of 2,271 and 0 of 2,279 daemons were left (summary:20-29). Both end the tree at once when the post office dies. **B** adds one fixed binary, checked against a hash in the post office's code before each use (B:81) and tested by CI before release (B:140-148). **A** builds a different binary on each machine, so no release can name its hash (A:200). It keeps that build in a user cache that any process of the owner's user can replace, a full-autonomy soldier included (v2.md:208). A reuses whatever build the cache holds for the source's hash (A:148, A:158). **C** has escapes by design. On macOS it has only partial containment (C:26). In the prototype, polling missed every double-forked daemon (summary:35-39). C polls every 250 ms (C:50), slower than the prototype's 50 ms, and macOS may hide the marker it falls back on (C:79). On Linux, a process can leave the scope by a cgroup move (C:75). |
| 2 | Goals G1-G7, settled decisions | 4 | 5 | 2 | **B**: nothing to install (G2), and CI tests the bytes that ship (G7). **A**: a C compiler is needed on every Linux and macOS machine (A:110-115), and the binary that runs is never the one CI tested. **C**: there is no macOS soldier unless the owner allows the fallback and accepts its escape (C:98). VER-10's live macOS run before v2.0.0 (v2.md:645) would force that acceptance. Containment also stops being the lease's backstop that settled.md:22 records: on Linux and macOS, nothing ends a dead post office's trees by itself (C:116, C:124). More escapes mean more changes that no guard or audit sees (G6; C:81). The namespace fallback changes what the CLI sees and can break the vendor's own sandbox (C:20-24; ADR-0010). |
| 3 | Failure outcomes (seven simulations) | 4 | 4 | 2 | **Sims 1-2 (stream dies, cancel):** A and B end the whole tree, a double-forked daemon included. Under C's macOS partial containment, such a daemon keeps writing after the cancel, owned by no turn. **Sim 4 (retry after partial success):** all three refuse a restart while the old tree runs (A:96, B:35, C:62-66), but C's unseen escapes keep running behind the new session. **Sim 5 (stale cache):** A reuses a cached build after an OS update until its self-test fails (A:189-190), and never checks the build's content. B checks the hash before each use. C keeps its check's result for the post office's whole life (C:105), so fixing the cause needs a new post office; A and B re-check on r (A:187, B:94). A also adds build failures, all failing closed with a card: no compiler, or tools broken by a macOS upgrade (A:383). **Sims 3, 6, 7:** not reachable; containment involves no model call, model output or cost record. A and B share one gap, the guardian killed together with the post office (below). |
| 4 | Enterprise readiness (PLAYBOOK §10) | 2 | 4 | 2 | **A**: PLAYBOOK:216 names the compiler prerequisite as an issue. A binary that differs on each machine and has only an ad-hoc signature can't be allowlisted in advance by hash or by signer (A:200). **B**: no compiler, fixed hashes (B:81, :143), Developer ID and notarization (B:137), offline and proxy installs (B:79), and a table of supported systems (B:62-75). It leaves Windows out (B:342), and attestations need a public repository (B:144). **C**: no native code to approve, and the only draft that handles AppLocker (C:100-104). But macOS gets no soldier without an accepted escape, and the scope needs a systemd user manager (C:16), which containers and WSL without systemd lack. |
| 5 | Cost to the owner | 5 | 2 | 4 | **A**: no money. **B**: 99 USD a year for Apple's program (B:137-138). In a private repository, environment secrets need a paid GitHub plan (B:151). Attestations need a public repository or Enterprise Cloud, though B makes them optional (B:144). B's matrix (B:154-160) runs on macOS and arm64 runners, which in a private repository "use your GitHub account's allotment of free minutes, and are then charged at the per minute rates". **C**: no money, but the owner has to decide the macOS fallback. |
| 6 | Effort to build | 4 | 2 | 2 | **A**: M1 already has it. Still to do: the self-test, the cache rules, the source hash, the build record, C coverage, and moving the Linux guardian into C (A:117). **B**: all of A's work, plus static and universal builds, builds compared across two runners, signing, notarization, attestations, system-call and import allowlists, about 12 containment runners and a release workflow (B:139-161). **C**: it replaces M1's Linux and macOS code with a scope, a namespace, partial containment, markers, records, cleanup by the mod, and spike S7 (C:9-136). It would still need a watcher to meet v2.md:202. |
| 7 | How easily it can be undone | 5 | 4 | 3 | **A**: source only, and B can be added later. **B**: reversible, except a repository made public for attestations. **C**: it adds an owner setting (`containmentFallback`) and an on-disk record format, both needing a migration, and owners who accepted partial containment would see the behavior change. |

## The 10 seconds (R-M1-9, PO-1 at v2.md:202)

- **A meets it when the post office dies alone, on all three systems.** The guardian ends the tree at once when its connection closes (A:91), within the 10-second limit (A:92). M1 already does this: processTree.ts:175 (Linux), :346-353 (macOS), :555-557 (Windows).
- **A misses it when the guardian dies together with the post office.**
  - On Linux, the descendants are re-parented out of reach (A:106).
  - On macOS, the coalition is left, and nothing removes the job, which launchd keeps alive after a failure (A:371). M1's restarted guardian can't reconnect, because it deletes its bootstrap file at start (processTree.ts:340-341).
  - This is reachable: in A the macOS guardian is not the helper (A:123), and in M1 it is a `node -e` process (processTree.ts:301), so one `killall node` ends both. Neither draft states this case.
  - Windows still meets it, because the job closes with its last handle (processTree.ts:560).
- **B: the same as A** (B:59-60). B also never names the process on macOS that notices the post office's death. Its CLI "runs as a launchd job" (B:52, B:129), and a coalition watches nothing.
- **C meets it on Windows only** (C:31). On Linux and macOS, the mod ends a dead post office's trees "as soon as it sees" (C:116), with no time limit. If the mod is gone too, they run until the next post office starts in that folder (C:124), which may be never. M1-AC1 (v2.md:687) tests only the case where the mod lives.
- **What C would need to meet it:**
  - A watcher for each channel that is not the post office. It would be a Node script in a file of its own (VER-6), started detached in its own session, holding a pipe from the post office.
  - When that pipe ends without a close command, the watcher acts at once. It stops the scope (`systemctl --user stop`), or kills the namespace's first process, or stops and then kills the group, the session and the marker members. This is the role M1's guardians and C's own Windows script already play.
  - C's record and its sweep at the next start (C:108-124) stay as the backstop for a watcher killed too. On macOS, the watcher still ends only what partial containment finds.
  - For the namespace path only, wrapping `unshare --kill-child` in `setpriv --pdeathsig KILL` might let the kernel do it with no watcher. setpriv(1) warns that SELinux and AppArmor clear that signal when credentials change: NEEDS-PROBE.

## R-M1-5 and R-M1-50

- **R-M1-5 (v2.md:203): no option differs.** Work a CLI hands to a service escapes all three. Add to line 203's list:
  - a container engine, and a tmux or screen server that is already running (B:61);
  - `ssh localhost`, whose session sshd starts outside the tree (C:70).
- **R-M1-50 (VER-6, v2.md:641): no option differs either.**
  - A and B measure their C with the compiler's own coverage tool (A:287; B:222 uses an instrumented build of the same source).
  - C's TypeScript counts as it is.
  - Every option keeps code in strings today: M1's Linux and macOS guardians, and the Windows supervisor, whose PowerShell compiles C# through Add-Type (processTree.ts:110, :336, :504-506). Each option must move these into files.
  - Pester measures .ps1 commands only, so the C# needs a `.cs` file of its own and a .NET coverage tool. Whether C# compiled at run time can be counted that way is NEEDS-PROBE.

## Recommendation: B

1. **It keeps containment that held in every prototype run, and ends a tree at once when the post office dies** (B:60), so it meets v2.md:202. C instead states a macOS escape: every double-forked daemon escaped polling (summary:35-39). C also leaves trees running after a post office killed with its mod (C:124).
2. **Every machine runs one reproducible, checksummed binary that CI tested, with no compiler to install** (B:81, B:140-148; PLAYBOOK:211, :216). A runs a per-machine build that no release can name a hash for (A:200). It comes from a cache that any process of the owner's user can replace, and A uses it whenever a build for the source's hash is there (A:148).

## What B should take from the other drafts

B's changed lines cite v0.6. v0.8 already carries the rule at PO-1 (v2.md:202-203) and PO-7 (v2.md:237), so B's NEW-1 supplies only the mechanism, and its PO-1 replacement (B:44) is dropped.

**From A:**
- **The macOS guardian** (A:91, :118, :130-135): it connects back with a nonce, ends the coalition when the post office is gone, and has launchd remove its own job. B has no such process.
- **"As if started directly"** (A:69), including the post office's resource limits. Otherwise a launchd job runs with launchd's limits.
- **NEW-3's listing**, with identities that a reused pid can't match (A:97-102). PO-8 (v2.md:253) and MSG-9 need it, and B has no listing rule.
- **NEW-2's order and "only the system's word counts"** (A:77-90), with its timings aligned to v0.8's PO-7 (v2.md:244).
- **NEW-4's outcome on each system** for a guardian ended from outside (A:103-107), merged into B's NEW-5.
- **NEW-6's exact list of unpublished Apple interfaces**, with lookup at run time and size checks (A:137-146).
- **The self-test's proof by a pipe that reaches end-of-file** (A:169-170), in place of B's signal-0 check (B:87).
- **"Containment is cleanup, not a sandbox"** (A:75), for D-4.
- **A's live macOS check** (A:339), with the checkout in ~/Documents so that the NEEDS-PROBE on privacy prompts (A:400) is actually exercised.

**From C:**
- **The Windows text** (C:27-33, C:100-104, C:159, C:162), which applies whichever option wins:
  - the script ships as a file at a fixed path. M1 writes it from a string into a temporary folder (processTree.ts:419-421), which VER-6 now forbids and which an AppLocker path rule can't allow;
  - it detects ConstrainedLanguage mode and refuses with that reason;
  - an administrator allows it by hash or publisher;
  - Microsoft confirms that any script the policy doesn't allow "still runs, but only in Constrained Language Mode".
- **The on-disk record and the sweep before any channel opens** (C:108-124), as the backstop for a guardian killed with the post office.
  - It records each session's launchd label, its coalition id (never reused, A:379), and the CLI's pid and start time.
  - On macOS, a restarted guardian that still knew its session could end its own coalition and remove its job. NEEDS-PROBE: launchd's restart delay, and whether the restarted job keeps the same coalition.
- **"What the owner is told"** (C:82-86).
- **`redact()` on the command line of each process left running** (C:64), in B's error message (B:102).
- **Spike S7's items for every option:** Add-Type under a policy that allows the script, breakaway from the job, and whether each CLI exits when its input ends (C:134, C:372-373).

## Does any option need the owner to accept a residual risk?

- **C: yes, and that makes it big.**
  - On macOS, a process that leaves its group, loses its parent and carries no marker the post office can read outlives the session, accepted through `containmentFallback` (C:77-79, C:98).
  - On Linux, a process can leave the scope by a cgroup move (C:75).
  - As drafted, trees outlive a post office killed together with its mod.
- **A and B: nothing new** beyond the residual all three share, which v0.8 already states at v2.md:203 for D-4. Two more lines go into D-4:
  - A guardian killed from outside lets processes escape. Without C's record and sweep, the owner would also be accepting that a guardian killed together with the post office leaves the tree running, and on macOS a launchd job too.
  - macOS containment rests on unpublished Apple interfaces. An update can stop every macOS soldier until a release; that fails closed and is not an escape.
- **Every option on Windows:** under AppLocker or App Control, no soldier starts until an administrator allows the script. That is an availability limit, not an escape.

## Big or technical

Big, by PLAYBOOK §14: Q8 is listed as big (PLAYBOOK:346) because it changes what users must install. B also raises what the owner pays. C would need a residual risk accepted, which is security posture. Making a repository public is hard to undo (PLAYBOOK:338).

## Still NEEDS-PROBE

- **A and B:** whether a CLI started inside a launchd job raises macOS privacy prompts (A:400, B:337).
- **B:** whether an npm-installed helper with only an ad-hoc signature runs with no Gatekeeper prompt. Apple's Gatekeeper page doesn't settle it. If it does run, B could drop the Developer ID and its 99 USD a year, at the cost of allowlisting by signer.
- **Windows, all options:** whether Smart App Control puts the script into ConstrainedLanguage mode. I found no Microsoft page on it.

## Sources

**Files:**
- `A:`, `B:`, `C:` are line numbers in `C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-3-option-A.md`, `D-3-option-B.md` and `D-3-option-C.md`.
- `v2.md` is `C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md` (v0.8).
- `summary` is `C:\Users\johns\projects\AIConnections-review\docs\spec\review\prototypes\D-3\results\summary-main2-20261014-063708.txt`.
- `processTree.ts` is `C:\Users\johns\projects\AIConnections-m1\src\v2\processTree.ts`.
- `settled.md` and `PLAYBOOK` are in `C:\Users\johns\projects\AIConnections-review\docs\spec\review\`.

**Web:**
- [App Control script enforcement](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/design/script-enforcement)
- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [setpriv(1)](https://man7.org/linux/man-pages/man1/setpriv.1.html)
- [unshare(1)](https://man7.org/linux/man-pages/man1/unshare.1.html)
- [Pester code coverage](https://pester.dev/docs/usage/code-coverage)
- [Apple Gatekeeper](https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web)
