D-4 drafter (option A, Appendix D), against v0.10 (v2@e7c33b4.md), 2026-10-20

D-4: the threat-model appendix, written against v0.10 (`C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@e7c33b4.md`)

I grepped both OLD texts: each occurs exactly once in the snapshot, and the two blocks don't overlap. The header's version line is untouched. Marks such as "(D-9)" stand for a requirement ID that one of the other drafters has not added yet. Residuals 7 and 8 come from this draft, not from an owner's answer, so they are marked "(for the owner to accept)".

```
D-4 (A): §0 points to the new appendix.
<<< OLD
It is a reference for review; nothing in it is a requirement.
=== NEW
It is a reference for review; nothing in it is a requirement.
- **Threat model.** Appendix D sets out the assets, the actors and how far each is trusted, each trust boundary with the requirement that controls it, and the residual risks. Like Appendix C, it is informative.
>>> END

D-4 (A): Appendix D, the threat model, after the last appendix.
<<< OLD
came into v0.5 (HOST-9, HOST-10, ARM-2). | `.shadow/v2-tools/v21/out/d6.txt` |
=== NEW
came into v0.5 (HOST-9, HOST-10, ARM-2). | `.shadow/v2-tools/v21/out/d6.txt` |

## Appendix D: Threat model

This appendix is informative: it adds no requirement and no acceptance criterion, and where it differs from a requirement, the requirement governs. Each control is named by the requirement that makes it, with that requirement's evidence codes and the ACs that check it. A mark such as (D-9) names an owner's decision whose requirement this text does not have yet.

**Assets.**

| Asset | Where it is |
|---|---|
| The owner's checkout and its uncommitted work | the folder (PO-1), with its git config, `hooks/`, `info/` and worktree metadata (WSP-10) |
| The control plane | the post office's commands and event stream, the Monarch's secret (PO-3), and each soldier's credential (PO-4) |
| The owner's decisions | vendors' approval requests (CH-6), the attribution card (ARM-6), and `/apply` (WSP-9) |
| The Monarch's context | Claude's conversation, where summaries and soldiers' words arrive (MSG-1, MSG-5), and the owner's Claude Code memory (D-19) |
| Secrets in the army's files | logs, records and reports (PO-5, PO-6, WSP-8) |
| Vendor accounts and quota | each CLI's login; every message is a paid turn (G5) |
| The rest of the owner's machine | the home folder, other repositories, and other processes |

**Actors, and how far each is trusted.**

| Actor | How far it is trusted |
|---|---|
| The owner | Fully. Only the owner answers a vendor's approval request, an attribution card or a trust card, and only the owner applies work (SEC-3, ARM-6, WSP-9, D-10). |
| The Monarch (the owner's Claude Code session) | With planning and briefs (ARM-4), and with its own edits in the checkout under the owner's Claude Code permissions. Shadow Army doesn't confine it (HOST-13, Q1). It never answers a soldier's approval request (SEC-3), and what it reads from soldiers can mislead it (MSG-1). |
| The mod and the post office | Shadow Army's own code, run as the owner and holding the Monarch's secret (PO-3). |
| A soldier's CLI, as installed | With the vendor's harness and safeguards, which stay whole (CH-7, ADR-0010). It is found on `PATH` alone (CH-1); Shadow Army doesn't check its binary beyond that. |
| A soldier's model, and what it runs | Not trusted: what it reads can mislead it. At `supervised` and `auto` the vendor's own permission system decides what it runs (CH-7). At `full` it runs with the owner's OS rights, and only a container or VM that the owner provides confines it. Its reach into Shadow Army is its credential (PO-4). |
| Repository content | Not trusted: files, git config, hooks and instructions files may be hostile, and may prompt-inject a soldier or the Monarch. |
| The folder's own `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` and `agent.md` | Trusted once the owner accepts their trust card (D-10). |
| Other processes of the owner's user | As far as the owner's user goes: as much as a `full` soldier. |
| Other local users, and the network | Not trusted. They reach only a loopback port, which refuses them without a credential (PO-2, PO-3, PO-4). |

**Trust boundaries.** Outcome says whether the control prevents the crossing or only detects it, and names the residual risk below that is left.

| # | Boundary | Control | Evidence | Outcome |
|---|---|---|---|---|
| 1 | The network to the post office | It binds only the loopback address (PO-2). | PO-2 (X), SEC-1 (X); M1-AC1 | prevented |
| 2 | A local process to the Monarch's commands and event stream | A secret made at each start and handed over only on standard input, never on disk, a command line or in the environment, with the event stream only on standard output (PO-3). The post office shields its own memory where the system allows, and logs which protection each machine gives it (D-9). | PO-3 (X), SEC-2 (X); M1-AC2 | prevented, except residual 1 |
| 3 | A soldier to the control plane | Its own credential, which serves only `send`, always as its own soldier, never appears on a command line, and is revoked when its session closes (PO-4). | PO-4 (C, I, X), SEC-5 (X); M3-AC8, M3-AC3 | prevented, except residual 1 |
| 4 | A soldier's words to the Monarch, other soldiers and the terminal | Shown as that soldier's quoted words, never as the owner's or the Monarch's instructions, and only the Monarch assigns work (MSG-1, MSG-6, ARM-4). Control and format characters show as placeholders (SEC-6). | MSG-1 (R, I), MSG-6 (I), SEC-6 (U, X); M3-AC3, M3-AC7, M1-AC12, M5-AC6 | the escapes are prevented; the injection is only framed, and a model can still follow quoted words |
| 5 | A soldier to a vendor's approval | Each request reaches the owner word for word, and only the owner's answer goes back. A stop or a shutdown closes it and approves nothing (CH-6, HOST-12, SEC-3). | CH-6 (C, I), HOST-12 (R, U), SEC-3 (X, R); M2-AC2, M2-AC7, M5-AC3 | prevented; what a vendor approves by itself is residual 6 |
| 6 | A soldier to the checkout, during its turn | The checkout guard: every change to the checkout and to the paths ARM-6 hashes is explained by records, or else goes on the attribution card, where n fails the turn. Before M2, any such change fails the turn (ARM-6, WSP-11, WSP-4). | ARM-6 (I, X, F), WSP-11 (I, F), WSP-4 (I); M1-AC11, M2-AC5, M2-AC8, M2-AC9, M6-AC1 | detected, not prevented: nothing write-protects the checkout, and the guard reverts nothing |
| 7 | A soldier's work to the folder | What a soldier writes in its snapshot is discarded and reported (WSP-11, ARM-6). Writes need the build role, and stay in the soldier's worktree under its claims (ARM-5, ARM-2, WSP-2). Only the owner's `/apply` brings them to the folder, all or nothing (WSP-9, WSP-5). | WSP-11 (I, F), ARM-5 (I), ARM-2 (U), WSP-2 (I), WSP-9 (I, S), WSP-5 (I, F); M1-AC11, M2-AC5, M3-AC5, M6-AC2, M6-AC5, M6-AC7 | prevented through Shadow Army's own paths; a direct write is row 6 |
| 8 | The repository to harness git | Harness git runs no hook, file system monitor, pager, signing program, external diff or text conversion. It passes the owner's filters as they were at start, runs a git found on `PATH` alone, and holds itself when the config, `hooks/`, `info/` or a worktree's metadata change (WSP-10). | WSP-10 (X, F); M1-AC10, M2-AC5 | prevented, except residual 7 |
| 9 | The repository to the programs that start | Each CLI and git start from an absolute path found on `PATH` alone, and `cli` names one of the four adapters (CH-1, WSP-10). | CH-1 (U, C), WSP-10 (X); M1-AC10 | prevented |
| 10 | The folder's own Shadow Army files to each soldier's CLI and autonomy | A trust card for a new or changed file before any soldier starts, and the only way the folder raises autonomy above `supervised` (D-10). A delegate file can only restrict (ARM-2). | (D-10); ARM-2 (U) | prevented, except residual 4 |
| 11 | Repository files a CLI reads by itself, to that CLI | None from Shadow Army: each CLI applies its own rules. A `claude -p` run uses the repository's settings-file hooks, its `env` block and helper commands, and its `.mcp.json` servers, with no trust dialog. The guard hashes `.claude/`, `.mcp.json`, `AGENTS.md` and `CLAUDE.md` in the checkout (ARM-6). | ARM-6 (I, X, F) | neither, for what the files already hold (residual 8); a change to the checkout's copies during a turn is detected |
| 12 | A soldier to processes that outlive its session | Containment ends the CLI's whole process tree when its channel closes, and within 10 seconds when the post office dies (PO-1, PO-7). It works through a prebuilt, checksummed helper on Linux and macOS and a Job Object on Windows (D-3). | PO-1 (I, F), PO-7 (U, I, F); M1-AC1, M1-AC4 | prevented within the tree, except residual 3; containment is cleanup, not a sandbox |
| 13 | A soldier, once the owner's session has ended | The lease and the watch shut the army down (PO-7). | PO-7 (U, I, F); M1-AC1, M1-AC8 | prevented |
| 14 | Secrets to the army's files and events | `redact()` runs on every log, record, report, brief and event (WSP-8), and the Monarch's secret and each soldier credential appear in none of them (SEC-4). | WSP-8 (U), SEC-4 (X); M1-AC2, M2-AC2, M3-AC2 | prevented for what `redact()` matches, except residual 5 |
| 15 | A soldier to the owner's Claude Code memory | Each claude soldier runs with auto memory off (D-19). | (D-19) | prevented through auto memory, except residual 2 |
| 16 | A soldier to vendor quota | Caps on queue depth, send rate, and message and report size, each refused with its reason (D-5), and the meter (G5). | (D-5) | prevented past the caps; logs are residual 9 |
| 17 | A soldier to the rest of the machine | None from Shadow Army. Only the vendor's own sandbox, where the CLI has one at that autonomy level, applies. | none | neither (the paragraph after the residual risks) |

In short, Shadow Army prevents crossings through its own interfaces (rows 1 to 3, 5, 7 to 10, and 12 to 16). It only detects a soldier's direct change to the checkout (row 6) and a git config change made while harness git runs (residual 7). It neither prevents nor detects what a CLI takes from the repository by itself (row 11), or what a soldier does elsewhere on the machine (row 17).

**Residual risks.** Each is accepted by the owner's decision, or stated by the requirement named beside it. The ones marked (for the owner to accept) await that acceptance.

1. **The Monarch's secret in memory** (D-9). On Windows, and on Linux at `ptrace_scope` 0, a soldier that can run code as the owner can read the Monarch's secret from the mod's or the post office's memory, and then act as the Monarch: issue any command and read the event stream. At `ptrace_scope` 1 or more, soldiers can't, since they descend from both. The post office logs which protection each machine has (D-9). A soldier credential that a CLI holds in its memory is open to the same read, and allows only `send` as that soldier (PO-4).
2. **What remains of shared memory** (D-19). With auto memory off, a claude soldier neither loads nor saves the owner's auto memory, and a subagent's own memory is off too. Each claude soldier still loads the owner's user instructions (`~/.claude/CLAUDE.md` and `~/.claude/rules/`), as Claude Code does for any session, and the `CLAUDE.md` files in its snapshot or worktree. A soldier that can write in the owner's home folder can still edit the memory files directly (the paragraph below).
3. **Work outside the process tree** (D-3, PO-1). Work a CLI hands to a service outside its tree keeps running, as PO-1 lists: a systemd, launchd or cron job, a scheduled task, a process started through WMI, a container engine, a tmux or screen server, a session that `ssh localhost` opens, or a vendor's own background service. No guard or audit sees what it changes after the turn. A containment helper killed from outside lets its tree escape until the next start sweeps it (D-3). macOS containment rests on interfaces Apple doesn't publish, so an update can stop every macOS soldier until a release; it fails closed (D-3). On Windows under AppLocker or App Control, no soldier starts until an administrator allows the containment script (D-3).
4. **The folder's own files, once trusted** (D-10). After the owner accepts a trust card, those files act as the owner's own until they change again. The card shows a change; it doesn't judge it.
5. **Secrets that `redact()` doesn't match** (SEC-4). Any other secret a soldier's CLI writes into its session, such as a value it read from a file or its environment, is logged as the CLI wrote it.
6. **What a vendor approves by itself** (CH-7, D-16). Shadow Army adds no command filter, and removes no vendor safeguard (ADR-0010). At `auto`, each vendor's own classifier or sandbox decides. A `supervised` claude soldier runs in claude's plan mode, where claude's classifier may approve a shell command outside the read-only set without the owner, unless the owner's own settings turn `useAutoModeDuringPlan` off (D-16).
7. **A git config change while harness git runs** (WSP-10; for the owner to accept). A soldier can change the shared git config, adding a filter for example, between WSP-10's check before a harness git command and git's own reading of the config. Whatever git then runs has run. The check after the command finds the change and holds harness git. WSP-10's command-line settings still keep hooks, the file system monitor, the pager, signing, external diffs and text conversion off.
8. **Repository files a CLI reads by itself** (row 11; for the owner to accept). Each CLI uses the repository's own configuration as its vendor's rules say. For a `claude -p` soldier, that includes hooks, the `env` block, helper commands and `.mcp.json` servers, with no trust dialog.
9. **Logs without a limit** (D-5). Log size and rotation come after 2.0 (H62). Logs are kept until the owner deletes them (WSP-8), so they can fill the disk; a failed write is handled as PO-5 says.

**Pending the owner's answer to D-7** (this paragraph is replaced once D-7 is answered). Under `auto` or `full`, Shadow Army neither prevents nor detects what a soldier writes outside its snapshot, its worktree and the checkout, such as in the home folder or another repository, as in v1. The guard covers only the checkout and the paths ARM-6 hashes (ARM-6, WSP-11). Only the vendor's own sandbox, where its CLI has one at that level, or a container or VM that the owner provides, confines such writes. This holds whatever D-7's answer. If the read-only rule reaches every soldier (D-7), three more things remain:
- what a read-only turn writes where git ignores files (build output, caches, installed packages) stays in a builder's worktree for its later turns, though never on its branch or in `/apply`;
- an edit the owner makes in a soldier's worktree during its read-only turn is reverted, and no copy is kept;
- a `.claude/` settings file that a read-only turn writes takes effect until the revert.
>>> END
```

**Not placed**
- Whether codex, grok or agy keep a memory shared across sessions of one user, which would let two codex soldiers (Bellion and Igris) share context, is not assessed. D-19 covers only claude. I have no vendor evidence either way, so I didn't raise it as a finding; it needs a probe.
- In residual 1, the sentence about a soldier credential in a CLI's memory follows from D-9's question ("what each credential defends against", R-F-29), but the owner's card names only the Monarch's secret. Confirm it with D-9's text, or drop the sentence.
- The 2.0 draft's "`sa doctor` warns when a `full` soldier runs outside a container or VM", and its non-goal N7, are not in v0.10. So the appendix names no such control, and says only that the owner provides any container.

**Findings against v0.10**

```
- severity: P1
  type: decision-needed
  location: CH-2 (docs/spec/v2.md:294), WSP-11 (510), PO-4 (223)
  claim: Every claude soldier runs `claude -p` in a copy of the repository, and a `-p` run connects the repository's `.mcp.json` servers and runs its settings-file hooks and helpers with no trust dialog. The owner's own interactive session asks before connecting those same `.mcp.json` servers, and D-10's trust card covers only Shadow Army's four files.
  scenario: A branch or a cloned repository commits a `.mcp.json` whose stdio server is `curl … | sh`. The owner declines it in their own Claude Code session. At the next `/army`, a supervised claude soldier opens in a snapshot of HEAD (WSP-11), and claude connects the server without asking, which runs the command as the owner with nobody asked. PO-4 adds Shadow Army's server "adding to it and never replacing it", so the project's servers stay.
  evidence: https://code.claude.com/docs/en/permissions, "What runs before you trust a folder": for "`claude -p` or the SDK, folder never trusted", servers in `.mcp.json` are "Connected without asking, approved or not"; hooks, the `env` block and helper commands are "Used". An interactive session in a folder trusted only through a parent folder "asks you before connecting them". The same page lists the vendor's own mitigations (`--setting-sources user`, `--bare`, `disabledMcpjsonServers`).
  fix: decision: (a) extend D-10's trust card to the folder's `.mcp.json` and `.claude/settings.json`, so no claude soldier opens until the owner accepts them; (b) pass a documented vendor flag that leaves out project MCP servers (weigh against ADR-0010, since it also drops the project's settings); (c) accept it as residual 8 of Appendix D.

- severity: P2
  type: contradiction
  location: §5.1 X (docs/spec/v2.md:607); WSP-10 (507); M1-AC10 (722)
  claim: §5.1 says a filter added after the post office started "never runs, because the change holds harness git first". But WSP-10 only compares the config before and after each command, and harness git runs while other soldiers' turns run.
  scenario: Soldier B, at auto, mid-turn, adds `filter.x.clean`/`smudge` to the shared config, and a `.gitattributes` in its snapshot names it. This happens after the before-check of harness git making soldier A's snapshot, and before git reads its config. `git worktree add` runs the smudge program; the after-check then holds harness git. M1-AC11 (732) makes a second soldier's snapshot during the first's turn, so this is in scope from M1. WSP-7 (492), "No soldier code runs while the harness runs git", is M6, and it is ambiguous whether it means every soldier or only "that soldier" (PO-8 261).
  evidence: v0.10 lines 507, 607, 722, 732, 492, 261. The 2.0 draft stated this exact case as "detected, not prevented" (legacy lines 170).
  fix: §5.1 X: "A filter added after the post office started, in any config scope, holds harness git at the next check, and no harness git command started after that check runs it; one added while a command runs is caught by the check after it (Appendix D, residual 7)." Also say whether WSP-7 covers every soldier.

- severity: P2
  type: vendor-fact
  location: PO-3 (docs/spec/v2.md:213); D-9
  claim: D-9's residual names Windows and Linux at ptrace_scope 0, but neither D-9's record nor the spec says whether a same-user soldier on macOS can read the mod's or the post office's memory, so Appendix D says nothing for macOS.
  scenario: An enterprise reviewer on macOS asks whether a soldier can read the Monarch's secret. Reading A, macOS is safe by omission. Reading B, it is unassessed. The post office's protection log (D-9) has no defined value for macOS.
  evidence: decisions.md D-9 (lines 261, 271) mention only Windows and Linux. NEEDS-PROBE: task_for_pid on a same-user Node process (Claude Code's and the post office's) from an unprivileged soldier, with and without Developer Mode.
  fix: decision: probe, then state macOS in D-9's text and in Appendix D's residual 1, either as shielded (with the mechanism) or as accepted.
```

No other P0 to P2 findings came up while drafting.

Coverage: PO-1 to PO-5, PO-7, PO-8; CH-1, CH-2, CH-6, CH-7; MSG-1, MSG-3, MSG-4, MSG-6, MSG-7; ARM-2, ARM-4 to ARM-6; WSP-2 to WSP-5, WSP-7 to WSP-11; SEC-1 to SEC-6; HOST-12, HOST-13; §0, §1, §5.1 X, Q1, Q8, Q9; M1-AC1, M1-AC2, M1-AC4, M1-AC8, M1-AC10 to M1-AC12, M2-AC2, M2-AC5, M2-AC7 to M2-AC9, M3-AC2, M3-AC3, M3-AC5, M3-AC7, M3-AC8, M5-AC3, M5-AC6, M6-AC1, M6-AC2, M6-AC5, M6-AC7.

**Sources**
- Snapshot `C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@e7c33b4.md`
- `C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md`: D-3, D-4, D-5, D-7, D-9, D-10, D-16, D-19
- `C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md`: R-F-5, R-F-29, R-M1-1, R-M1-2, R-M1-5, R-M1-59, R-M1-60, R-M1-82
- `C:\Users\johns\projects\AIConnections-review\docs\spec\review\settled.md`
- `C:\Users\johns\projects\AIConnections-review\docs\spec\review\PLAYBOOK.md`: sections 10 and 12
- The archived 2.0 draft: `C:\Users\johns\projects\AIConnections-review\docs\legacy\spec\shadow-army-2.0.md`, lines 147-170
- [Claude Code memory](https://code.claude.com/docs/en/memory): the auto memory toggle, `CLAUDE_CODE_DISABLE_AUTO_MEMORY`, one directory shared across worktrees, the user-scope CLAUDE.md and rules
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents): subagent memory is off when auto memory is off
- [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes): `useAutoModeDuringPlan`, protected paths, and a container required for unattended `bypassPermissions`
- [Claude Code permissions](https://code.claude.com/docs/en/permissions): what a `-p` run uses before the folder is trusted
- [Linux Yama](https://www.kernel.org/doc/html/latest/admin-guide/LSM/Yama.html): `ptrace_scope` 0 and 1
- [Windows process security and access rights](https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights): `PROCESS_VM_READ`, and the default security descriptor taken from the creator's token
