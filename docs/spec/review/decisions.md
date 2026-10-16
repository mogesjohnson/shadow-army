# Decisions (spec 2.0 review)

Each decision: the question and its kind (big, technical or trivial; PLAYBOOK section 14), the options, the bake-off's record, the choice and who made it, and where it was applied. Big ones go to the owner as decision cards.

## Index

| ID | Question | Kind | Status | Applied |
|---|---|---|---|---|
| D-1 | The spec's name and revision scheme | big | card sent to the owner 2026-10-14 | — |
| D-2 | The lease timing: do the owner's 10 s / 30 s hold up against Codex's 5 s / 20 s? | technical unless the timing changes (then big) | judged 2026-10-15: A, the owner's 10 s / 30 s, technical; to apply in M1's fix pass | — |
| D-4 | A threat model (R-F-5) | big | card to batch | — |
| D-5 | Limits on queues, sends, sizes and logs (R-F-7) | big | card to batch | — |
| D-6 | How G7's "traced in CI" is met (R-F-36) | technical | decided 2026-10-15 by the orchestrator: option (a) | v0.7: VER-7, Appendix B rule 9, M1-AC7 |
| D-7 | How the settled read-only rule reaches every soldier (R-F-3) | technical if A or C, big if B or D | bake-off in the fix pass | — |
| D-3 | Q8: how the C process helper ships (compile at first use, prebuilt, or another containment) | big | options A, B and C drafted, the Linux prototype done; next a judge, then the card | — |
| D-8 | The live checks' $2 budget per release: how a CLI that reports no cost counts, and what happens when it runs out (R-F-33, R-F-20) | big (money) | card to batch | — |
| D-9 | B2: how far PO-3 goes, and what each credential defends against (R-M1-1, R-F-29) | big (security posture; a residual to accept) | first verifier M1-V1 done; second verifier, then a card with D-4 | — |
| D-10 | How far the folder's own config and policy files are trusted (R-M1-2) | big (a trust boundary; A adds a card the owner answers) | first verifier M1-V1 done; second verifier, then a card | — |
| D-11 | What `/clear`, `/resume` and `/branch` do to the army (R-M1-20, R-F-38; with H38) | big (what the owner keeps, loses and pays) | first verifier M1-V2 done; a card to batch | — |
| D-12 | A mod reload or a lost hooks worker leaves a post office the new mod instance can't command (R-F-30) | technical if (a); (b) and (c) are big | (a) chosen by the orchestrator, 2026-10-15; second verifier due | — |
| D-13 | What starts the army in M1, which has no command or tool (R-M1-27) | technical | A chosen by the orchestrator, 2026-10-15 | — |
| D-14 | A line a CLI writes that can't be parsed (R-M1-18; H2) | technical | (c) chosen by the orchestrator, 2026-10-15 | — |
| D-15 | What M1 does with a claude permission request before the relay (R-M1-4) | technical | (a) chosen by the orchestrator, 2026-10-15 | — |
| D-16 | What a supervised claude soldier may run without the owner (R-M1-57) | big (what runs without the owner) | card drafted, to batch | — |

---

## D-1 The spec's name and revision scheme

- **Kind:** big (PLAYBOOK sections 11 and 14: the name and the release).
- **Options:**
  - A: title "Shadow Army 2.0: Specification"; drafts go on as revisions 0.7, 0.8 …; the text the owner accepts is revision 1.0; the product it specifies is release 2.0.0; the file stays `docs/spec/v2.md`; the archived draft becomes "the 2.0 draft" everywhere.
  - B: the same title, with the revision following the product (2.0-draft.7 … then 2.0).
  - C: keep "Shadow Army v2: Specification" and 0.x versions.
- **Recommended:** A. It keeps the document's revision apart from the product's version, and keeps the path that CI, `CLAUDE.md`, the ADRs and many comments cite. Renaming the old archived "2.0" draft to "the 2.0 draft" means "2.0" names one thing.
- **Card:** sent in the chat on 2026-10-14. Answer: pending.
- **Applied:** last, with the final rename (PLAYBOOK section 11), together with `trace-v2.mjs`'s carried-over pattern.

## D-2 The lease timing

- **Kind:** technical if 10 s / 30 s holds up (no question needed; Codex is told to match). Big if the agents would change it, because that reverses the owner's decision of 2026-10-13.
- **Question:** PO-7's lease: the mod renews every 10 s, and the post office ends after 30 s without a renewal (the owner's decision 1). Codex's draft (#75 at `04ab953`, `src/v2/lease.ts`) renews every 5 s and expires after 20 s. Which holds up, and how must the lease be measured so that a laptop that sleeps, a stalled event loop or a clock change never ends live sessions, while a dead Monarch still ends them promptly?
- **Options:** A 10 s / 30 s (the owner's, in the text); B 5 s / 20 s (as built). Each is tested with the same measurement rules, so the timing and the measurement are judged apart.
- **Bake-off:** drafters for A and B; option reviewers (chaos, red team, enterprise operator); a Sonnet prototype with a fake clock (`prototypes/D-2/`); a judge.
- **Record:**
  - **Prototype** (`prototypes/D-2/lease-sim.mjs`, `results.txt`; report `raw/D-2-prototype.md`): a seeded discrete-event simulation, 9 self-checks against closed-form predictions. Three clock models: K1 as built (`lease.ts`: monotonic clock, expiry checked in the timer and in `renew()`), K2 a clock that stops in sleep, K3 suspend-aware (a 1 s tick; a gap of more than 3 ticks counts as time the post office couldn't receive a renewal).
    - **The clock decides sleep, not the timing.** Node's `performance.now()` is libuv's `uv_hrtime()`: QueryPerformanceCounter on Windows and `mach_continuous_time` on macOS, both of which count sleep; only Linux's `CLOCK_MONOTONIC` stops. Under K1 every sleep lapses the lease, 216 of 216 runs, for A and B alike, in both wake orders. K3: 0 of 216. A post office stall of 25–35 s: K1 lapses (A 498/1000 at 25 s; B 1000/1000), K3 never.
    - **Timing.** A tolerates a Claude Code stall of up to 20 s (B 15 s); a lapse is certain from 30 s (B 20 s). A cleans up a dead Monarch in 20–30 s, mean 25 s (B 15–20 s, mean 17.5 s). A sends 360 renewals an hour (B 720). B survives two lost renewals in a row, A one.
    - **Two rules for K3:** a renewal never expires the lease (a strict `renew()` brings the sleep lapses back); only the tick decides, after its gap check.
    - Not modelled: real laptop sleep, HTTP retries. Unverified: B's 5 s interval equals Node's default HTTP keep-alive timeout (5 s), a known source of connection-reset races.
  - **Option A drafted** (`raw/D-2-option-A.md`): PO-7 rewritten whole: what starts a shutdown (the mod at `session.end` or a changed session id, the lease, the watch); renewals carry Claude's session id; the lease counted on the monotonic clock by a once-a-second check that counts at most 5 s per step (so sleep, suspension and stalls of the post office don't count, and the mod's do); the event stream never blocks the checks (Claude Code blocks a child's write past 1,048,576 unread characters; Windows pipe writes are synchronous); the watch on the starting process (pid and start time); containment when the post office is killed; the shutdown sequence (queued messages not delivered, running turns stopped as by s, open requests closed as by a stop, cards logged as unanswered, 10 s then end the tree); what the owner sees; restart at the next use. Plus HOST-2, CH-6, MSG-4, SEC-3, §5.1 F, M2-AC7 and M3-AC11 changes. Mod API facts from `evidence/mod-api-2.1.294/claude-code.d.ts`: `session.end` has a 1.5 s bound; `$.session.id()` changes after `/clear` or a resume with no `session.start`; `$.clock.every`; a spawned child is killed when the module unloads.
  - **Option B drafted** (`raw/D-2-option-B.md`): the same mechanism with 5 s / 20 s and a 2 s cap per check; adds an explicit five-step shutdown order, a `release` command at `session.end`, a renewal naming another session ends the lease at once, and "the next start shows why the last one stopped". Both drafts agree on the measurement: only the post office's own running time counts, checked once a second; a renewal never expires the lease; the watch on the starting process uses pid and start time.
  - **Next: the judge only.** The option reviews were dropped (2026-10-14, the owner's ask to save agents where it is worth it): the prototype settled the facts, and the two drafts share their mechanism. Give the judge both drafts, the prototype report and this record. If it picks A, apply A's PO-7 text with the best of B's shutdown details, record it here, and tell Codex to match `lease.ts` (10 s, 30 s, the per-check cap, no expiry inside `renew()` or `assertActive()`); no owner question is needed. If it picks B, that reverses the owner's decision: a card.

- **Judge** (2026-10-15, `raw/D-2-judge.md`): A scores 5, 5, 4, 4, 5, 4, 5 on the seven criteria, B 4, 2, 3, 3, 4, 3, 4. A is the owner's settled 10 s / 30 s, and nothing in the evidence overturns it: the measurement decided sleep and stalls, not the timing. With the shared measurement, A takes the safer side of the one trade-off the timing makes: it survives a 20 s Claude Code stall (B 15 s) and leaves the mod about 15 s after a wake (B 12-13 s), while B's gain, cleanup 5-10 s sooner, applies only when the watch can't see the end. Kind: technical.
- **Choice** (2026-10-15, the orchestrator, from the judge): **A**, taking from B: the values are fixed, and no setting changes them; the lease's start is logged, never each renewal (A's lines for long steps and refused renewals stay); at `session.end` the mod stops renewing before anything else, its release names the Claude session and one naming another is refused, and the post office answers the release at once, then shuts down (the whole `session.end` chain shares one 1.5 s bound); a renewal from an earlier start is refused, reported (PO-3) and changes nothing; the residual (a renewal naming the right session but sent after `session.end`) goes to D-4; a real-process test stops the post office with SIGSTOP for 40 s on Linux and macOS while the mod renews; B's test wording (B 81, 88); evidence code U on PO-7. Not taken: 5 s / 20 s, the 2 s cap per check, B 44, B 56 (D-11's), B 64 (shows the owner something new) and B 82-83 (M2 and M3 behaviour in M1).
- **Found by the judge:** neither draft limits how long a renewal may wait, and `$.http.fetch` takes no timeout, so under one-in-flight a renewal that never resolves holds back every later one; the fix pass sets a value. D-11 also needs A 20's first two sentences and A 59, and `session.end` itself fires for `clear` and `resume`, so "at `session.end`" already ends the army at `/clear`.
- **Codex must match:** the lease counts only the post office's own running time, in once-a-second checks of at most 5 s each, and a renewal never expires it (`lease.ts` 23-49, `server.ts` 73); the mod keeps renewing after a failed renewal (`fail()` in `register.ts` 81-92, called at 121, cancels the timer at the first error, so one lost renewal ends the army within 20 s).
- **Applied:** in M1's fix pass, with R-M1-8, R-F-11 and R-M1-10.

## D-3 Q8: how the C process helper ships

- **Kind:** big (it changes what users must install; supply chain; security posture if containment weakens).
- **Question:** PO-1 requires that nothing a CLI started keeps running after its channel closes. Codex's draft (#75 at `04ab953`) does this on Linux and macOS with `native/process-supervisor.c`, compiled with `cc` on the user's machine at first use: a subreaper on Linux, an isolated launchd coalition on macOS read through structures from Apple's private `proc_info_private.h`. Without a compiler, no session starts on Linux or macOS. Windows uses a Job Object.
- **Options:** A compile at first use (as built); B ship the helper prebuilt per system and processor, built and checked in CI; C contain processes without a native helper (each system's own mechanism, with any remaining gap stated).
- **Bake-off:** drafters for A, B and C; option reviewers (red team, enterprise operator, implementer, chaos); evidence from vendor and OS documentation and Codex's draft (read-only); an offline prototype where a fact can be measured locally (WSL Ubuntu is installed but stopped); a judge. Then a card to the owner.
- **Record:**
  - **Option A drafted** (`raw/D-3-option-A.md`): the helper compiled at first use, as NEW-1 to NEW-9 with ACs M1-AC9 to M1-AC14. It lists exactly which macOS interfaces are unpublished (`libproc.h` calls, `proc_info_private.h` flavours, `__proc_info_extended_id`, a hand-built audit token, launchd coalitions), a self-test before the first soldier, "no containment, no soldier" with no override, a SHA-256-checked source, and a cache that only the user can write.
  - **Option B drafted** (`raw/D-3-option-B.md`, resumed after the limit): the helper prebuilt per system and processor (static Linux x64 and arm64, one universal macOS binary; Windows keeps a Job Object), no install script and no download, its SHA-256 built into the post office and checked before each use, a containment check at every start with no override, reproducible builds compared across two runners, attestations, and CI on old and new Ubuntu, Alpine, macOS on Apple silicon and Intel, and Windows x64 and arm64 (NEW-1 to NEW-10, M1-AC9 to M1-AC15). Facts that bear on the owner's card:
    - notarizing the macOS helper needs an Apple Developer Program membership (99 USD a year) and a Developer ID;
    - GitHub artifact attestations and npm provenance need a public repository (or GitHub Enterprise Cloud); environment secrets in a private repository need a paid GitHub plan; publishing to npm needs `"private": true` removed from package.json;
    - **a Windows finding for any option:** M1's draft creates its Job Object through PowerShell's `Add-Type`, which compiles C# at run time. Under AppLocker or App Control, PowerShell runs in ConstrainedLanguage mode, where `Add-Type` can't load arbitrary C# or Win32 APIs (https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_language_modes?view=powershell-5.1). In a locked-down enterprise, Windows containment would fail. The spec says what the Job Object must do, not how it is created;
    - Linux binaries built statically, because a dynamic build on Ubuntu 24.04 needs glibc 2.34 (the prototype).
  - **Option C drafted** (`raw/D-3-option-C.md`, resumed twice after the limit): no native code at all.
    - Linux: a `systemd-run --user --scope` cgroup where the owner's user manager runs (full containment); otherwise, only if the owner sets `containmentFallback`, a PID namespace (`unshare --user --map-current-user --pid --fork --kill-child`), or "partial" containment (session and process group, a `/proc` or `ps` reading every 250 ms, and an environment marker).
    - macOS: only partial containment, so a soldier starts there only if the owner allows the fallback. A daemon that double-forks with a fresh environment escapes (the prototype: 20 of 20 under polling).
    - Windows: the Job Object through a shipped PowerShell script (`Add-Type`), which an AppLocker or App Control policy must allow by hash or publisher; under ConstrainedLanguage mode no soldier starts.
    - Adds a startup check, a record of each tree under `.shadow/v2/` so a dead post office's trees are ended later, and spike S7 for what only a live run can settle (scope from SSH or CI, CLI sandboxes inside a namespace, `ps -E` on macOS, `Add-Type` under an allowing policy).
    - It trades a compiler or a signing account for an owner-set fallback that accepts a stated escape on macOS: a security-posture choice, so big.
  - **All three options are drafted.** Next: one judge over the three drafts, the prototype and this record (prompt below), then the card to the owner.
  - **Prototype, Linux** (`prototypes/D-3/`; results `prototypes/D-3/results/summary-main2-20261014-063708.txt`; WSL Ubuntu 24.04, kernel 6.6, systemd 255, cgroup v2; 20 runs per mechanism; a fake CLI starts (a) a child, (b) a nohup child, (c) a setsid double-fork daemon, (d) a daemon every 5 ms):

    | Mechanism | (a) | (b) | (c) daemon | (d) daemon storm |
    |---|---|---|---|---|
    | kill the process group only | ended | ended | survived 20/20 | survived 20/20 (2,264 of 2,264) |
    | a subreaper helper (C), close requested | ended | ended | ended | ended (0 of 2,271) |
    | a subreaper helper, CLI killed first | ended | ended | ended | ended (0 of 2,279) |
    | `systemd-run --user --scope`, then kill the scope (no root) | ended | ended | ended | ended (0 of 2,286) |
    | bash polling `/proc` every 50 ms | ended | ended | survived 20/20 | survived 20/20 |
    | an environment tag swept through `/proc` | ended | ended | ended | ended (but a process can clear its environment) |
    | a PID namespace, `unshare --kill-child` | ended | ended | ended | ended |

    - A helper compiled with gcc 13 on Ubuntu 24.04 needs GLIBC_2.34 when linked dynamically (so it won't run on glibc 2.28 to 2.33, such as RHEL 8 or Ubuntu 20.04); `-static` removes that. Compiling at first use took 114 ms (dynamic) or 151 ms (static). Binary facts: `prototypes/D-3/results/binfacts-20261014-063708.txt`.
    - What it means: on Linux, process groups and polling are not enough; a subreaper, a cgroup scope or a PID namespace all hold. A systemd user manager or unprivileged user namespaces give a no-compiler route where present. macOS has no public equivalent (to research, for option C).
  - **Next:** redraft B and C; one judge over the three drafts, the prototype and the docs; then the card to the owner.

---

## Prompts to rerun (paths from the repository root)

**D-3 drafter, option B** (`spec-reviewer`; done in session 1, kept for reference): "Decision D-3 (open question Q8): how Shadow Army contains each CLI's process tree on Linux and macOS. Your task: draft an option. The spec as reviewed is `../review-scratch/v2@be9deb0.md` (PO-1 lines 163-168, PO-8 187-212, Q8 line 720). Codex's M1 draft (`../shadow-army-m1`, read only: `native/process-supervisor.c`, `src/v2/processTree.ts`) compiles a small C helper at first use: a subreaper on Linux, an isolated launchd coalition on macOS read through Apple's private `proc_info_private.h`; Windows uses a Job Object. Option A is drafted in `docs/spec/review/raw/D-3-option-A.md`; don't copy it. The Linux prototype's results are in `docs/spec/review/decisions.md` (D-3). Write option B, 'ship the helper prebuilt for each supported system and processor, built, tested and checksummed in CI, so no compiler is needed', as spec text in the spec's own style: the requirements (NEW-1, NEW-2 …, each with a milestone and evidence codes), their ACs, and the changed lines (PO-1, Q8, VER-2, §5.1 …), each with the text it replaces. Say: which systems and processors, and how a binary is chosen; how it is packaged and installed (offline, behind a proxy, an unsupported system); what happens where containment can't be set up, and who decides; what the helper may and may not do; for macOS, the mechanism, any interface Apple doesn't publish, and the signing or notarization it needs; how the binaries are built, checked and attested (reproducible builds, checksums, provenance); glibc compatibility (the prototype found a dynamic build on Ubuntu 24.04 needs glibc 2.34); CI on the three systems (VER-2, VER-6); and what an OS update that breaks it does. Ground every OS or packaging claim in official documentation and list the URLs after the text. Keep to this option. Return only the text, then the sources."

**D-3 drafter, option C** (`spec-reviewer`; done in session 1, kept for reference): the same context, then: "Write option C, 'no native helper: contain processes with each system's own mechanisms, without compiling or shipping native code, and state exactly what can still escape'. The Linux prototype found that killing the process group or polling `/proc` lets daemons escape every time, while `systemd-run --user --scope` (no root) and a PID namespace (`unshare --kill-child`) end everything. Weigh, per system: a cgroup scope where a systemd user manager runs, a PID namespace where unprivileged user namespaces are allowed, and process groups as the fallback on Linux; on macOS, process groups and sessions, and polling the process table with the system's own tools; on Windows, a Job Object (say how without native code, or keep whatever the post office has). Say what the user must have installed; exactly which processes can still escape on each system and what the owner is told; what happens where the mechanism is missing (refuse a soldier, or run with a warning, and who decides); CI on the three systems; and what an OS update that breaks it does. Ground every OS claim in official documentation and list the URLs after the text. Keep to this option. Return only the text, then the sources."

**D-3 judge** (`spec-verifier`), after B and C: the judge template in PLAYBOOK section 12, with the three drafts (`raw/D-3-option-*.md`), the prototype results and this record. It must also say whether any option needs the owner to accept a residual risk (big).

**D-2 judge** (`spec-verifier`): "Decision D-2: PO-7's lease. Options: A, the owner's 10 s / 30 s (`docs/spec/review/raw/D-2-option-A.md`); B, Codex's 5 s / 20 s (`raw/D-2-option-B.md`). Evidence: the prototype (`raw/D-2-prototype.md`, `prototypes/D-2/results.txt`) and the record above. Score each option from 1 to 5 on, in order: safety and security; the owner's goals and settled decisions (`docs/spec/review/settled.md`); failure outcomes (the seven simulations); enterprise readiness (PLAYBOOK section 10); cost to the owner; effort to build; how easily it is undone. A lower criterion breaks ties only. Return the scores as a table, your recommendation and its two strongest reasons, which parts of the other draft the winner should take, and whether the decision is big or technical by PLAYBOOK section 14 (changing the owner's 10 s / 30 s is big)."

## D-4 A threat model (from R-F-5)

- **Kind:** big (PLAYBOOK §10: a new area goes to the owner first; trust levels and accepting residual risk are security posture).
- **Question:** the spec has no threat model: no assets, actors, trust boundaries, or what is prevented versus only detected. The 2.0 draft had one (legacy lines 147-170).
- **Options** (from verifier F-V1): A, an informative appendix in the 2.0 draft's form, drafted in pass X1: assets, actors and their trust, each boundary with its control and X test, prevented versus detected, and the residual risks for the owner to accept; B, the same as a normative §1 subsection, with a boundary-to-control-to-test table that Appendix B's script checks; C, none, stated as a non-goal (fails PLAYBOOK §10.1).
- **Next:** a card to the owner, batched with the other big ones. Leaning A.
- **Card** (drafted 2026-10-15, to send with D-3's):

  ```
  D-4 Should the 2.0 spec have a threat model?
  Options: A an informative appendix: assets, actors and how far each is trusted, each trust boundary with its control and security test, what is prevented and what is only detected, and the risks you accept; B the same as a normative section 1 part, checked by the trace script; C none, stated as a non-goal.
  Tested: verifier F-V1 found none outside Appendix C; the archived 2.0 draft had one (lines 147-170); the review's enterprise checklist (PLAYBOOK 10.1) asks for one.
  Recommended: A, because an enterprise reviewer gets the boundaries and the residual risks in one place, and it adds no requirement until pass X1 drafts it.
  For you: you accept, in writing, the residual risks it lists (such as a same-user soldier reading the post office's memory, B2). Can be undone: yes, it is informative.
  ```

## D-5 Limits: queues, sends, sizes and logs (from R-F-7)

- **Kind:** big (pulls H62, an after-v2.0 item, into 2.0, or accepts a residual risk). The values are technical once the option is chosen.
- **Question:** nothing bounds a soldier's queue, its send rate, a message's or a report's size, or the logs. A runaway soldier's sends become paid turns (G5); logs can fill the disk.
- **Options** (from verifier F-V1): A, caps now on queue depth, send rate, message and report size (refused with a reason), plus log size and rotation (H62 pulled in); B, the queue, send and size caps now, with logs left to H62 after v2.0 and the disk risk stated; C, no limits in v2.0, stated as a non-goal with the risk.
- **Next:** a card to the owner, batched. Leaning B.
- **Card** (drafted 2026-10-15, to send with D-3's):

  ```
  D-5 Should v2.0 limit queues, sends, message and report sizes, and logs?
  Options: A caps on all of them now, log size and rotation included (pulls H62 into 2.0); B caps on queue depth, send rate and sizes now, logs after 2.0 with the disk risk stated; C no limits in 2.0, with the risk stated.
  Tested: verifier F-V1: nothing bounds a queue, a message, a report or a log; a runaway soldier's sends each become a paid turn (G5); MSG-3's "nothing is dropped silently" allows a refusal with its reason.
  Recommended: B, because it bounds what costs you money now, and it leaves log rotation, a new feature, after 2.0 as you planned it (H62).
  For you: a flood of sends is refused with a reason, and the agents set the cap values. Can be undone: yes.
  ```

## D-6 How G7's "traced in CI" is met (from R-F-36)

- **Kind:** technical (how things are tested; the document's structure). Verifier F-V3 judged it so.
- **Question:** G7 promises verification traced in CI, but VER-7 checks only the spec's own cross-references, and the AC-to-test link lives on each PR (VER-3, §6).
- **Options:** (a) tests name the requirement or AC IDs they verify, and VER-7 fails a requirement with U, C, I, X, F or S evidence that no test names; R and L stay on the PR (VER-8, §6); (b) reword G7: "Every requirement is verified: CI checks the trace (VER-7), and each PR maps its ACs to evidence (section 6)."
- **Next:** decide directly or by a small bake-off in the fix pass; it changes nothing the owner sees.
- **Choice** (2026-10-15, the orchestrator, no bake-off): **(a)**. Option (b) rewrites G7, one of the owner's goals, to fit what CI does today, which would make it a big decision; (a) makes CI do what G7 says, and only adds work for the builder. An enterprise reviewer asks which test proves each control, and today a test for SEC-2's property can be missing while coverage and VER-7 both pass (F-V3).
- **To apply:**
  - VER-7: each test names the requirement or AC IDs it verifies, in its title or a comment beside it; the script fails when a requirement of the current milestone or an earlier one, with U, C, I, X, F or S evidence, is named by no test, or when a test names an ID the spec doesn't have; R and L evidence stays on the PR (VER-8, section 6). CI names the current milestone.
  - Appendix B: a new rule 9 with the same test, which rule 7's script checks in CI only, since it needs the code.
  - M1-AC7: the trace script also passes this check for M1's requirements.

## D-7 How the settled read-only rule reaches every soldier (from R-F-3)

- **Kind:** technical if A or C wins; big if B or D (B changes SES-1 and what the meter shows; D amends an owner rule).
- **Question:** the settled rule says that with auto or full autonomy a read-only task runs in a throwaway snapshot. v2 carries it only for agy (ARM-6). Verifier F-V6 found that a snapshot per read-only task conflicts with one long-lived session per soldier (G2, SES-1) for soldiers that take both builds and reviews (Kaisel, Bellion).
- **Options** (from F-V6):
  - A: under auto or full, a soldier without the build role runs its whole session in a snapshot, as agy does; a builder's non-build turn is audited with no claims, so any write is reverted and reported as a read-violation; the guard covers every turn;
  - B: a builder's non-build brief goes to a second, snapshot session of that soldier;
  - C: each turn switches to the vendor's own read-only mode where the CLI has one, else A (rests on vendor modes, which agy ignores);
  - D: the owner amends the rule for v2, so that worktree isolation, the guard and the claim audit replace the snapshot.
- **Next:** a bake-off in the fix pass (drafts for A and C first, since either keeps the decision technical).
- **When it lands:** the glossary's Autonomy entry names the read-only rule too (fix check F-FC1's finding 6, R-F-58): "Among the CLI's flags it chooses only documented ones (CH-7); with `auto` or `full`, a read-only task also runs in a throwaway snapshot (<D-7's requirement>)."

## D-8 The live checks' $2 budget (from R-F-33 and R-F-20)

- **Kind:** big (money).
- **Question:** §5.1 L says "The budget is at most $2 of reported cost per release". codex and agy report tokens but no cost, and claude's cost is its own estimate, so the budget can't bound every check, and nothing says what happens when it runs out. R-F-33's verifiers left the clause to R-F-20, and R-F-20's to R-F-33, so it had no owner until this record.
- **Options:** A, keep $2 of reported cost, and count a CLI that reports none at its vendor's published prices (an estimate, against the non-goal "Cost figures beyond what each CLI reports"); B, $2 of reported cost plus a token cap for the CLIs that report no cost, and a check that would go past either one waits for the owner's go; C, no budget: each check's reported cost and tokens go on the PR (VER-8), and the owner stops when they choose.
- **Next:** a card to the owner, batched with D-4 and D-5. Leaning B: it keeps the non-goal and bounds every CLI.
- **Card** (drafted 2026-10-15, to send with D-3's):

  ```
  D-8 How should the live checks' $2 budget per release work?
  Options: A count a CLI that reports no cost at its vendor's list prices (an estimate, against the non-goal); B $2 of reported cost plus a token cap for the CLIs that report none, and a check that would go past either one waits for your go; C no budget: each check's cost and tokens go on the PR.
  Tested: codex and agy report tokens but no cost (CH-3, CH-5), and claude's cost is its own estimate (R-M1-12); on 2026-10-07 both runs of the parity task used about 90k to 200k tokens per CLI.
  Recommended: B, because it keeps the rule that Shadow Army never estimates cost, and it still bounds every CLI.
  For you: you accept the token cap the agents propose, and approve any check past a limit. Can be undone: yes.
  ```

## D-9 B2: how far PO-3 goes, and what each credential defends against (from R-M1-1 and R-F-29)

- **Kind:** big: a residual on Windows that can't be fixed, and a trust boundary (PLAYBOOK section 14). Decide it with D-4's threat model.
- **Question:** a soldier that can run code reads the Monarch's secret from the mod's or the post office's memory on Windows always, and on Linux at `ptrace_scope` 0 (Yama scope 1 already shields both, since soldiers are their descendants). A claude soldier's own credential sits on its command line (S4's `--mcp-config` JSON string), where any same-user process, and on Linux any local user, reads it. SEC-2 and SEC-5 test files, command lines and the environment only, so they pass while the gap is open.
- **Options** (verifier M1-V1):
  - A: harden where the system allows and state the rest. PO-3's MUST NOT names disk, command lines, environment variables, output and logs; the post office checks and logs the protection it relies on (Linux `ptrace_scope` 1 or more; a Windows process security descriptor where one can be set), with an X test; each soldier credential stays off command lines and disk where the CLI allows (codex and grok over stdio; claude over its stream-json input if a probe confirms it, else an owner-only file removed once the session is up); SEC-5 and ADR-0012's consequences narrowed; the residual in D-4;
  - B: soldiers run as another OS user or in a sandbox, so PO-3 and SEC-5 hold as written (a new capability and a setup change);
  - C: as A, and on Linux at scope 0 soldiers start only if the owner allows it.
- **Next:** the second verifier (M1-V7/V8), then a card with D-4. Under A, the hardening mechanism is technical and goes to a bake-off.

## D-10 How far the folder's own config is trusted (from R-M1-2)

- **Kind:** big: a trust boundary, and what a repository may change without the owner. The program-resolution rule inside it is technical and is fixed in M1's fix pass whatever wins.
- **Question:** v1 and Codex's draft read the folder's `shadow.config.json` first, so a cloned repository sets every soldier's autonomy, up to claude's `bypassPermissions`, which Claude Code itself refuses from a project's settings. The archived 2.0 draft had a trust card for this (D9, POL-1, POL-2) that v2 didn't carry over.
- **Options** (verifier M1-V1): A, carry over 2.0's POL-1 and POL-2: the folder's `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` and `agent.md` are hashed, and a new or changed one shows a trust card before any soldier starts, the only way the folder raises autonomy above supervised; B, `cli`, `model` and `autonomy` come only from the owner's own config outside the folder, and the folder's files may only restrict; C, trust the folder, and say so in D-4's threat model.
- **Next:** the second verifier, then a card.

## D-11 What `/clear`, `/resume` and `/branch` do to the army (from R-M1-20 and R-F-38)

- **Kind:** big: it decides what the owner keeps, loses and pays, and touches H38.
- **Question:** HOST-2, PO-7, SES-1 and WSP-1 depend on "the session", which the spec never defines. Claude Code's mod reference says `session.end` fires when the session ends or `/clear`, `/resume` or `/branch` runs, and no `session.start` fires after them; the process goes on under a new session id. Both D-2 drafts already end the army when the session id changes, so closing D-2 would decide this silently.
- **Options** (verifier M1-V2): A, the army lives as long as the Claude Code process and its mod, and `/clear`, `/resume` and `/branch` keep the soldiers and their sessions, with a summary card for an earlier brief arriving in the new conversation, marked as from the earlier one; B, each Claude session has its own army: any `session.end` ends it as PO-7 says, and the next use starts a new one; C, `/clear` keeps the army, and `/resume` and `/branch` end it, because another conversation takes over (what a resumed conversation gets stays with H38).
- **Applied meanwhile:** D-2's shutdown text goes in without its session-id clause until this is decided.
- **Next:** a card, batched with the other big ones.

## D-12 A mod reload leaves a post office the new instance can't command (from R-F-30)

- **Kind:** technical if (a), which changes no settled decision or ADR; (b) changes ADR-0012 and (c) reverses settled decision 2, so either would be big.
- **Question:** a save under `--plugin-dir`, `/reload-plugins` or a lost hooks worker reloads the mod inside a live session. The new instance has no secret and can't hear the event stream, which lives only on the old child's standard output (PO-3, ADR-0012).
- **Options** (verifier M1-V2): (a) a mod instance owns only the post office it started: at a reload that post office ends, with the module or by its lease within 30 s, its turns are cut short (PO-8), and the new instance starts its own at the next use once the old lock is stale (R-M1-3), with one transcript line; (b) a reload-safe handover, the secret kept in `$.state` and the event stream moved off standard output (changes ADR-0012); (c) one post office per Claude session (reverses settled decision 2).
- **Choice** (2026-10-15, the orchestrator): **(a)**, the only option that keeps every settled decision; the owner may overrule. A probe of whether a spawned child outlives a hot reload doesn't block it, since the lease ends a survivor anyway.
- **Next:** the second verifier (R-F-30 is P1), then apply in M1's fix pass.

## D-13 What starts the army in M1 (from R-M1-27)

- **Kind:** technical: milestone order and test entry points, within settled decision 3 (verifier M1-V3). Option B would turn big if its subcommands shipped in 2.0.
- **Question:** M1 implements neither HOST-9 (commands, M5) nor HOST-10 (the `send` tool, M3), so "the first time the army is used" means nothing in M1, and Codex's draft invented `/army open|inspect|stop`, which HOST-9 doesn't have.
- **Options:** A, HOST-9's `/army` comes forward to M1, list form only, as the first use, and `sa live` is named as M1's dev tool to open, message, stop and reconnect a claude soldier; B, the draft's dev-only `/army open|inspect|stop <soldier>`, replaced by HOST-9's commands in M5; C, no M1 trigger: M1-AC1 uses a fake `$`, and everything live in M1 goes through `sa live`.
- **Choice** (2026-10-15, the orchestrator): **A**, the verifier's recommendation: it adds nothing HOST-9 lacks, and it gives M1's live checks (M1-AC8, R-M1-51) a real trigger. The owner may overrule.
- **Next:** apply in M1's fix pass.

## D-14 A line a CLI writes that can't be parsed (from R-M1-18; Appendix C's H2)

- **Kind:** technical: PLAYBOOK section 14 lists H2 as technical; it fixes v2.0's failure handling and changes nothing the owner approves (verifier M1-V5).
- **Question:** PO-1 says only a process ending or a lost connection is a crash, CH-8 (M2) calls an unparseable line an error, and Codex's draft treats one as a lost connection. The outcome is undefined for all four channels.
- **Options:** (a) a lost connection: end the tree, finish the turn as cut short, and restart; (b) record the line word for word (redacted), show it as an error of the kind "another error", and carry on; (c) as (b), but ten unparseable lines in a row count as a lost connection (from 2.0 SOLD-6). In every option a line split across reads is joined first, and only one still incomplete when the stream ends is malformed.
- **Choice** (2026-10-15, the orchestrator, as M1-V5 recommends): **(c)**: one stray line costs no restart, and a stream that has turned to garbage still ends rather than hanging a turn M1 can't stop. H2 becomes Same. The owner may overrule.

## D-15 What M1 does with a claude permission request (from R-M1-4)

- **Kind:** technical: milestone order, as with D-13; v2.0's final behavior and approvals don't change (verifier M1-V5).
- **Question:** CH-2 runs claude with `--permission-prompts host --permission-prompt-tool stdio`, so every permission request goes to the host, but nothing answers or cancels one before CH-6 arrives in M2, and the turn waits until the channel closes.
- **Options:** (a) until CH-6 lands, CH-2 runs without `--permission-prompt-tool stdio`, so claude denies by itself whatever would prompt (spike S5); not `--permission-prompts none`, which also removes AskUserQuestion, against CH-7 and ADR-0010; (b) CH-6's claude half moves into M1, through D-13's `sa live`; (c) M1 states the hang and keeps its live check free of requests.
- **Choice** (2026-10-15, the orchestrator, as M1-V5 recommends): **(a)**, the smallest change: nothing hangs, M1's soldiers already run in a throwaway snapshot, and M2 restores the relay flags with CH-6. The owner may overrule.

## D-16 What a supervised claude soldier may run without the owner (from R-M1-57)

- **Kind:** big: it decides what runs without the owner (PLAYBOOK section 14), and option B changes what the owner approves (verifier M1-V9).
- **Question:** v1 maps supervised to claude's `plan` mode for a task that doesn't write (`src/adapters/claude.ts`), and R-M1-24's fix makes that explicit. Since claude 2.1.285, plan mode lets claude's classifier approve shell commands outside the read-only set wherever auto mode is available, which it is for the roster's Opus and Sonnet models; `useAutoModeDuringPlan` is on by default, and a repository can't turn it off. So a supervised soldier's read-only turn runs commands the owner never sees, while v1's own comments give the classifier to `auto` and say supervised refuses commands that need approval.
- **Options:** A, keep `plan`, and say what supervised then allows (the owner's own `useAutoModeDuringPlan: false` makes each such command ask, through the relay from M2); B, a supervised read-only turn passes `--permission-mode default`, so each such command comes to the owner from M2, and is denied in M1 (D-15); C, keep `plan`, and the adapter turns `useAutoModeDuringPlan` off (a probe first; it changes a vendor default, which the settled rules forbid).
- **Card** (drafted 2026-10-16):

  ```
  D-16 May a "supervised" claude soldier let claude's own classifier approve its shell commands?
  Options: A keep v1's plan mode, where claude's classifier approves commands outside the read-only set (your own useAutoModeDuringPlan: false would make each ask you); B use claude's default mode for a supervised soldier's read-only turns, so each such command asks you from M2 (and is refused in M1); C keep plan mode and have Shadow Army turn the classifier off (changes a vendor default, which your rules forbid).
  Tested: verifier M1-V9 checked claude's docs: plan mode's classifier is on by default for Opus and Sonnet and a repository can't turn it off; v1's comments say supervised refuses commands that need approval, but its code passes plan.
  Recommended: B, because supervised then means what v1 says it means, with auto left as the level that trusts the classifier, and it uses only a documented vendor flag.
  For you: more approval requests from supervised soldiers, from M2. Can be undone: yes, one mapping.
  ```

## Values set in the fix pass

Limits and defaults that a confirmed fix left open. The orchestrator set each from the evidence named, with no bake-off, because one answer was clearly sensible. Any of them can be overruled by the owner, or reopened by a round-2 reviewer with evidence.

| Value | Where | Set to | Why |
|---|---|---|---|
| A summary line's length (R-F-41) | §2, MSG-5, SI-1 | 120 characters | Five lines of 120 are 600 characters, the summary cap the archived 2.0 draft set (UPD-2); a line of 120 wraps to two rows at 80 columns. |
| The parity task's two files (R-F-33) | §5.1 L | `README.md` and `package.json` | The 2026-10-07 runs read "two files" that no record names; these two exist at every commit, and both kinds of run read the same ones, so the comparison stays fair as they change. |
| The parity check's runs (R-F-33) | §5.1 L | one each way; two more each way when a run fails on tokens alone, judged by the medians | One run keeps the owner's cost low; the repeats absorb a model's run-to-run spread (codex's normal follow-up re-ran a command on 2026-10-07) without letting one bad run decide. |
| A background task's follow-up wait (R-F-12) | PO-8 | 30 seconds after the task ended, on the monotonic clock | claude starts its follow-up turn on its own once a task ends (spike S6); a task stopped by s starts none. Waiting the same 30 s as CH-10's stop leaves room for a slow first event, and a later turn still gets its own guard and audit. A probe of claude's follow-up latency could shorten it. |
| The parity check's read rule (R-F-63) | §5.1 L | no tool call in the live follow-up opens either file, a shell command included; after a failure either way, at most one of the three live follow-ups may read | The same spread the token repeats absorb shows up as a model choosing to re-check (codex ran a command in its 2026-10-07 headless follow-up); two clean follow-ups out of three still show the session kept the context. |
| A crashed channel's restarts (R-M1-14) | PO-1, M1-AC4 | after 1 s, then 5 s, then 30 s; a fourth crash within 10 minutes of the first leaves it down; a reconnect, or 10 minutes without a crash, resets the count | The reviewer's proposal, which the verifier took as proposed: a start that fails at once no longer uses up all three restarts in under a second, and crashes days apart no longer add up to "down". |
| The pass rule (R-F-33) | §5.1 L, VER-9 | live total at most 1.05 times headless, over both prompts | One-sided, because a cheaper live session is the goal; over both prompts, because the follow-up is what a live session saves. On the 2026-10-07 data all four CLIs pass (claude -3.8%, codex -14.8%, grok +2.1%, agy +3.6%). |
