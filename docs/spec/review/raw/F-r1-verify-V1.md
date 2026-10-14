# F round 1, verifier F-V1 (security): R-F-1, 3, 4, 5, 7, 8, 28. Snapshot be9deb0. 242,812 tokens, 68 tool calls, 16 min.

- id: R-F-1
  verdict: CONFIRMED (touches H48)
  severity: P1
  evidence: Appendix A 729 and WSP-4 401 cite only v1 #22 and 2.0 GUARD-1 to GUARD-4. Outside Appendix C's rows 780 and 918, the spec has no GIT-1 to GIT-4, no fsmonitor and no hooksPath. The 2.0 draft has them at legacy 1051 (GIT-1 flags), 1052 (GIT-2 pinned filters), 1053-1060 (GIT-3 check before and after each command) and 1061 (GIT-4).
    - Codex's M1 draft shows the path is real. It runs git with no `-c` flags (`src/workspace/git.ts:11-17`). Its soldier snapshots are linked worktrees that share the common `.git/config` (`src/workspace/worktree.ts:56`). Its guard runs `git status` on the checkout and on the snapshot every turn (`src/v2/postOffice.ts:202,212`; `src/workspace/guard.ts:30`).
    - Git's docs: `core.fsmonitor` set to a path is a hook command that commands refreshing the index, such as `git status`, run (https://git-scm.com/docs/git-config). `git worktree add` runs post-checkout, and `--no-verify` doesn't suppress prepare-commit-msg (https://git-scm.com/docs/githooks). So v1's `--no-verify` (`src/workspace/audit.ts:82`) isn't enough.
    - It defeats WSP-7 (408), "No soldier code runs while the harness runs git".
    - Not settled: settled.md and ADR-0013 carry "the checkout guard" with no exclusion, and PLAYBOOK section 14 lists H48 as a technical defect fix.
    - Two corrections to the finding. The fingerprint half is arguably already imported: WSP-4 points to 2.0 GUARD-2's sentinel set (`.git/config`, `hooks/**`, `info/**`; legacy 1063-1064) through §0 line 31, which contradicts Appendix C row 918. G6's "v1's … safety carries over" is literally true, because v1 has the same gap (780).
  reason: A soldier with auto or full autonomy can plant a fsmonitor command, a filter or a hook in the shared git folder. The next harness git command (the guard's `git status`, M1's `git worktree add`, or the audit's commit) then runs it as the owner, outside the turn's process tree and before the guard compares anything. No v2 text turns these off.
  fix: Add "- **WSP-10** (M1; U, X) **Harness git runs nothing the repository configures** (from 2.0 GIT-1 to GIT-4). Every git command Shadow Army runs, the guard's and the claim audit's included:
    - turns off hooks (an empty `core.hooksPath`), fsmonitor, the pager, signing, external diffs and text conversions as 2.0 GIT-1 lists, with `--no-optional-locks`;
    - passes the owner's `filter.*` and line-ending settings as read at start (GIT-2);
    - commits with `--no-verify` (GIT-4).
    Before and after each command, it compares the shared git folder's effective config, `hooks/` and `info/` with those at start. A change stops harness git there and goes on an attribution card (GIT-3, ARM-6)."
    Then:
    - add the row "WSP-10 | 2.0 GIT-1 to GIT-4" to Appendix A;
    - put WSP-10 in M1's Implements with an AC, because M1's snapshots already run harness git (settled decision 7);
    - add to §5.1's X list: "a repository whose shared config names an fsmonitor command, a pager, a signing program, an external diff and a clean filter, with every hook present: no harness git command runs any of them, and the change is reported."

- id: R-F-3
  verdict: CONFIRMED
  severity: P1, for the missing rule (the glossary half alone would be P3)
  evidence: "supervised" appears nowhere in the spec. "Autonomy" appears only in ARM-1 (376) and CH-7 (255), both outside the frame. Its levels are defined only by reference, in 2.0's glossary (legacy 178), reached through CH-7's source.
    - settled.md 40-41 carries the CLAUDE.md rule: with auto or full, a read-only task runs in a throwaway snapshot.
    - 2.0 WS-3 applied to every soldier's read wake: "A non-ignored change after a read wake is a read-violation, and it is discarded" (legacy 821). ARM-6 (384-386) narrows it to agy.
    - Nothing else covers the other soldiers. WSP-2 (399) audits only "every writing turn". WSP-4 (401) watches the checkout, not the soldier's own worktree. So from M6, a claude, codex or grok turn on a non-build brief leaves its writes on its branch, where `/apply` (WSP-9, 410-412) takes them.
    - Overlaps: R-M1-23 covers M1's snapshot until WSP-1, and R-M1-24 covers each level's flags. Neither covers M6 or the glossary, so this is no duplicate.
    - A side note: HOST-9's `/mode ask|auto|plan` (132) is 2.0's write mode (legacy 365-370), not Claude Code's own mode. It is parked as R-F-26.
  reason: The settled rule that an auto or full read-only task keeps no writes is in v2 only for agy, so ARM-5's "writes need the build role" has no stated enforcement for the other soldiers once they get worktrees. The frame also never defines the term.
  fix:
    - §2, add: "- **Autonomy:** a soldier's permission level in `shadow.config.json`: `supervised`, `auto` or `full`, as in v1. It chooses only that CLI's documented flags (CH-7)."
    - §4.7, add: "- **ARM-7** (M6; I, X) **Only a build keeps what it writes** (v1's design rule; 2.0 WS-3). On a soldier with `auto` or `full` autonomy, a turn for a brief whose kind is not build keeps nothing it wrote. When the turn is over (PO-8), each non-ignored change in the soldier's worktree is discarded and reported as a read-violation, as ARM-6 does for agy. The checkout guard covers the turn (WSP-4)."
    - Add the row "ARM-7 | v1 (CLAUDE.md design rules); 2.0 WS-3" to Appendix A, and an M6 AC.
    - Fix it together with R-M1-23 (M1's snapshot) and R-M1-24 (the flag table).

- id: R-F-4
  verdict: REFUTED
  severity: P3 (was P2): at most wording; §5.1's bullets are examples at every level
  evidence: §5.1's lists are not a register of controls.
    - The U list (452-456) leaves out U-coded HOST-7 (128), SI-3 (277) and VIS-6 (430), and the I list (464-470) leaves out WSP-1 to WSP-6.
    - Every X-coded control has its own code and an AC that tests it: SEC-5 (420) through M3-AC8 (619-624), and ARM-6 (384) through M2-AC5 (569-573).
    - Appendix B's rules 2 and 4 (746, 748) trace requirements to codes and ACs, not to §5.1.
    - B2 (782) is an open Appendix C item, not a requirement; R-M1-1 carries it.
  reason: Nothing in the spec makes §5.1's bullets the list of controls, and every X-coded requirement the finding names already has its test in an AC.

- id: R-F-5
  verdict: DECISION
  severity: P2
  evidence: Outside Appendix C (947, H65: "It would need a threat model"), the spec never says "threat", "adversary" or "attacker".
    - Only fragments exist: PO-3 172 ("Soldiers run as the same user"), §1 51-52, and ADR-0012's context.
    - The 2.0 draft's threat model is at legacy 147-170.
    - PLAYBOOK §10 (207, 209) names "a threat-model appendix" as a new area to "propose to the owner as a decision first". Pass X1 (§8, 170) is scheduled to write it.
  reason: The gap is real. But by PLAYBOOK §10, adding the area goes to the owner first, and its content sets trust levels and accepts residual risks (B2, full-mode soldiers).
  options:
    - A: an informative threat-model appendix in the 2.0 draft's form, drafted in pass X1. It gives the assets, the actors with their trust levels, each trust boundary with its control and X test, what is prevented versus only detected, and the residual risks for the owner to accept.
    - B: the same as a normative §1 subsection, with a boundary-to-control-to-X-test table that Appendix B's script checks.
    - C: no threat model, stated as a non-goal (fails PLAYBOOK §10.1).
  big or technical: big. It is a new area under §10, and trust boundaries and accepting residual risk are security posture under §14.

- id: R-F-7
  verdict: DECISION
  severity: P2
  evidence: Nothing bounds the queue, a message, a report or a log.
    - MSG-3 (291, 293): queued messages go by themselves, and none is dropped silently.
    - PO-4 (178): `send` takes any text.
    - PO-5 (183) and PO-6 (184) set no size or retention, and MSG-5 (306) keeps the whole reply as the report.
    - §5.1's F list (476-491) has no full disk and no flood.
    - H62 (937, 793) leaves log limits to after v2.0. PLAYBOOK §10.3 (211) needs limits or an explicit non-goal.
    Weak parts of the finding:
    - "Soldiers at once" is bounded by the roster: SES-1 (334) gives one session per soldier, and ARM-4 (382) means soldiers can't create soldiers.
    - A same-user attacker can kill the post office outright. The realistic case is a runaway sender whose every queued message becomes a paid turn (G5, 43; see R-F-31).
    It overlaps R-M1-52 and R-M1-53 but duplicates neither.
  reason: Nothing bounds the queue, a message, a report or a log. Closing that either pulls H62, an after-v2.0 item, into 2.0, or records a residual risk.
  options:
    - A: caps now, each with an F test. Queue depth and send rate per soldier, refused with a reason (MSG-3's "never silently" allows that), and sizes for a message and a report. Plus log size and rotation, by pulling H62 into 2.0.
    - B: the queue, send and size caps now. Logs stay with H62 after v2.0, with the disk risk stated as a non-goal.
    - C: no limits in v2.0, stated as a non-goal with the residual risk.
  big or technical: big, because it pulls H62 forward or accepts a residual risk. The cap values themselves are technical once the option is chosen.

- id: R-F-8
  verdict: CONFIRMED
  severity: P3 (was P2): no boundary is crossed
  evidence: The sentence is at §3 85, and MSG-1 (285) and M3-AC7 (618) repeat it.
    - Shadow Army enforces the transport half: a soldier's `send(to, text)` carries text only (PO-4, 178), and nothing in Shadow Army reads a file into a message.
    - Every model already reads the same files as the same user (PO-3, 172), and G3 (41) is about context, so a pasted file opens no new path. The finding's exfiltration scenario fails.
    - Still, nothing can stop a soldier, or the Monarch writing a brief, from pasting a file's text, so "never file contents" is literally false.
  reason: The sentence states a convention about what models write as if Shadow Army guaranteed it. The transport rule is true and enforced, and the security consequence is nil.
  fix: §3 line 85: "**Files travel only through worktree branches.** Shadow Army never puts a file's contents or a transcript into a message; a message carries only what its sender wrote." Word MSG-1 and M3-AC7 the same way when unit M3 is reviewed.

- id: R-F-28
  verdict: CONFIRMED
  severity: P1
  evidence: Mods run under `claude -p`, per these vendor sources:
    - `.shadow/v2-tools/review/evidence/mod-api-2.1.294/reference.md` 69: "A headless `claude -p` always loads fresh".
    - The typings, `claude-code.d.ts` 2783: `$.session.surfaces()` is "Empty in a plain -p run".
    - 2.0 F47 (legacy 254, from Claude Code's docs): mods run "also under `claude -p`", and "an installed mod can approve a tool call that a deny rule refuses".
    What a mod can do there:
    - A tool registered in `session.start` "is listed by turn one" (reference.md 154-156).
    - A `tool.check` hook may answer `{ decision: "allow" }` before the mode settles an ask (`claude-code.d.ts` 3928-3941).
    - `CLAUDE_CODE_PLUGIN_DIRS` is read from the environment or from the user settings' `env` (reference.md 68), and soldiers inherit both.
    Partly covered:
    - SET-2 (439) leaves out the owner's personal plugins "where the CLI can". ADR-0010 (consequences, line 16) says plugins aren't the harness, so G2 does not keep them; the finding's G2 reading is wrong.
    - Claude can probably leave them out: `--settings` overrides settings keys for the session (https://code.claude.com/docs/en/cli-reference), and `enabledPlugins` is a settings key. That this override covers `enabledPlugins` is my inference, not verified.
    Not covered:
    - SET-2 is M4 (640), while claude soldiers run from M1 (539).
    - SET-2 doesn't say Shadow Army's own mod is among the plugins left out.
    - Nothing says what the mod does in a soldier's session, so HOST-2 (94) would start a second post office in the soldier's folder.
    - 2.0 had an explicit rule (SOLD-2, legacy 682: "neither launch may load an installed plugin or mod").
    The finding's SEC-3 framing is overstated: an owner-installed mod is the owner's configuration, not a Shadow Army code path. SET-2 exists to keep such mods out.
  reason: From M1 to M4, a claude soldier would load every installed mod, Shadow Army's own included. Its model can then call the Monarch's `send` and start a post office of its own, breaking ARM-4 and G1, and other mods can approve its tool calls. The text can close this without waiting for the probe.
  fix:
    - §3, add: "- **The mod acts only in the owner's session.** In a session the post office starts for a soldier, the mod registers no tool or command and starts nothing."
    - SET-2: name Shadow Army's own mod among the plugins left out, and make the first bullet hold for claude from M1 (CH-2).
    - Add an M1 AC: a fake installed mod that registers a tool and allows every `tool.check` is not loaded in a claude soldier.
    - The mechanism is technical, for example `--settings` turning each installed plugin off under `enabledPlugins`, and no `CLAUDE_CODE_PLUGIN_DIRS` in the soldier's environment.
    - Queue a live probe confirming that a stream-json `claude -p` soldier then lists no mod tool.
