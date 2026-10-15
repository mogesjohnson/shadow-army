# Decisions (spec 2.0 review)

Each decision: the question and its kind (big, technical or trivial; PLAYBOOK section 14), the options, the bake-off's record, the choice and who made it, and where it was applied. Big ones go to the owner as decision cards.

## Index

| ID | Question | Kind | Status | Applied |
|---|---|---|---|---|
| D-1 | The spec's name and revision scheme | big | card sent to the owner 2026-10-14 | — |
| D-2 | The lease timing: do the owner's 10 s / 30 s hold up against Codex's 5 s / 20 s? | technical unless the timing changes (then big) | prototype and both drafts done; judge next (option reviews dropped) | — |
| D-4 | A threat model (R-F-5) | big | card to batch | — |
| D-5 | Limits on queues, sends, sizes and logs (R-F-7) | big | card to batch | — |
| D-6 | How G7's "traced in CI" is met (R-F-36) | technical | to decide in the fix pass | — |
| D-7 | How the settled read-only rule reaches every soldier (R-F-3) | technical if A or C, big if B or D | bake-off in the fix pass | — |
| D-3 | Q8: how the C process helper ships (compile at first use, prebuilt, or another containment) | big | options A, B and C drafted, the Linux prototype done; next a judge, then the card | — |

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

## D-5 Limits: queues, sends, sizes and logs (from R-F-7)

- **Kind:** big (pulls H62, an after-v2.0 item, into 2.0, or accepts a residual risk). The values are technical once the option is chosen.
- **Question:** nothing bounds a soldier's queue, its send rate, a message's or a report's size, or the logs. A runaway soldier's sends become paid turns (G5); logs can fill the disk.
- **Options** (from verifier F-V1): A, caps now on queue depth, send rate, message and report size (refused with a reason), plus log size and rotation (H62 pulled in); B, the queue, send and size caps now, with logs left to H62 after v2.0 and the disk risk stated; C, no limits in v2.0, stated as a non-goal with the risk.
- **Next:** a card to the owner, batched. Leaning B.

## D-6 How G7's "traced in CI" is met (from R-F-36)

- **Kind:** technical (how things are tested; the document's structure). Verifier F-V3 judged it so.
- **Question:** G7 promises verification traced in CI, but VER-7 checks only the spec's own cross-references, and the AC-to-test link lives on each PR (VER-3, §6).
- **Options:** (a) tests name the requirement or AC IDs they verify, and VER-7 fails a requirement with U, C, I, X, F or S evidence that no test names; R and L stay on the PR (VER-8, §6); (b) reword G7: "Every requirement is verified: CI checks the trace (VER-7), and each PR maps its ACs to evidence (section 6)."
- **Next:** decide directly or by a small bake-off in the fix pass; it changes nothing the owner sees.

## D-7 How the settled read-only rule reaches every soldier (from R-F-3)

- **Kind:** technical if A or C wins; big if B or D (B changes SES-1 and what the meter shows; D amends an owner rule).
- **Question:** the settled rule says that with auto or full autonomy a read-only task runs in a throwaway snapshot. v2 carries it only for agy (ARM-6). Verifier F-V6 found that a snapshot per read-only task conflicts with one long-lived session per soldier (G2, SES-1) for soldiers that take both builds and reviews (Kaisel, Bellion).
- **Options** (from F-V6):
  - A: under auto or full, a soldier without the build role runs its whole session in a snapshot, as agy does; a builder's non-build turn is audited with no claims, so any write is reverted and reported as a read-violation; the guard covers every turn;
  - B: a builder's non-build brief goes to a second, snapshot session of that soldier;
  - C: each turn switches to the vendor's own read-only mode where the CLI has one, else A (rests on vendor modes, which agy ignores);
  - D: the owner amends the rule for v2, so that worktree isolation, the guard and the claim audit replace the snapshot.
- **Next:** a bake-off in the fix pass (drafts for A and C first, since either keeps the decision technical).

## Values set in the fix pass

Limits and defaults that a confirmed fix left open. The orchestrator set each from the evidence named, with no bake-off, because one answer was clearly sensible. Any of them can be overruled by the owner, or reopened by a round-2 reviewer with evidence.

| Value | Where | Set to | Why |
|---|---|---|---|
| A summary line's length (R-F-41) | §2, MSG-5, SI-1 | 120 characters | Five lines of 120 are 600 characters, the summary cap the archived 2.0 draft set (UPD-2); a line of 120 wraps to two rows at 80 columns. |
