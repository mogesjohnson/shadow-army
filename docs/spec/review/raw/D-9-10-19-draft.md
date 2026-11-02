D-9 (A), D-10 (A) and D-19 (A) drafter, with R-M1-82, against v0.10 (v2@e7c33b4.md), 2026-10-20

Spec v0.11 drafts for D-9, D-10 and D-19, against v0.10 (snapshot v2@e7c33b4.md). I grepped every OLD text: each occurs exactly once, and no two blocks overlap. No block changes a line that D-3, D-4, D-5, D-8, D-16 or D-17 owns, so there are no "OVERLAP" blocks. Block 16 adds ACs after M1-AC12, where D-3's new M1 ACs may also land; the orchestrator should merge those.

```
D-9, D-10, D-19 applied as spec v0.11 text, against v0.10 (e7c33b4).

D-9: PO-3's MUST NOT names disk, command lines, environment variables, output and logs; the post office shields its memory where the system allows, logs it, and states the residual.
<<< OLD
  - The secret MUST NOT be written to disk, a command line, an environment variable, or anywhere a soldier can read. Soldiers run as the same user, so a file only the owner can read is not enough.
  - Every command from the mod presents it. A wrong or missing secret is refused. The first refusal is reported in full; after that, at most one report a minute, with the count since the last one.
  - The event stream, with every soldier's turns, reaches the mod only on the post office's standard output.
  - The secret is never printed whole; at most its last four characters are shown.
=== NEW
  - The secret MUST NOT be written to disk, a command line, an environment variable, the post office's output, Claude's transcript, or a log. Soldiers run as the same user, so a file only the owner can read is not enough.
  - Every command from the mod presents it. A wrong or missing secret is refused. The first refusal is reported in full; after that, at most one report a minute, with the count since the last one.
  - The event stream, with every soldier's turns, reaches the mod only on the post office's standard output.
  - The secret is never printed whole; at most its last four characters are shown.
  - **Memory.** The mod and the post office hold the secret in memory while the post office runs, and the post office also holds each soldier's credential (PO-4, →M3). Before it reads the secret from its standard input, the post office protects its own memory where the system allows, and its log's first lines name the protection it has, as in `memory protection: Yama ptrace_scope 1` or `memory protection: none · ptrace_scope 0`:
    - **Linux.** It reads Yama's `ptrace_scope` (`/proc/sys/kernel/yama/ptrace_scope`). At 1, only a process's ancestors, or a process with `CAP_SYS_PTRACE`, may attach to it or read its memory through `/proc/<pid>/mem`; at 2, only a process with `CAP_SYS_PTRACE`; at 3, none. Soldiers descend from both the post office and Claude Code, so at 1 or more they can read neither copy of the secret, nor another soldier's CLI. At 0, or where the file is missing because the kernel has no Yama, there is no protection.
    - **Windows.** By the same shipped means as its Job Object (PO-1), it replaces its own process's DACL (`SetSecurityInfo`) with one that grants no one `PROCESS_VM_READ`, `PROCESS_VM_WRITE`, `PROCESS_VM_OPERATION`, `PROCESS_CREATE_THREAD`, `PROCESS_DUP_HANDLE`, `WRITE_DAC` or `WRITE_OWNER`, and that holds an OWNER RIGHTS (`S-1-3-4`) entry, which takes away the owner's implicit right to change the DACL back. A handle opened before the change keeps its rights, as Claude Code's handle to the process it started does. Where the DACL can't be set, the log says `memory protection: none` with the reason, and the post office goes on.
    - **macOS.** It checks nothing, and the log says `memory protection: not checked`.
  - **What this doesn't stop** is a stated residual risk. A soldier that runs code as the owner can read the secret from the mod's copy, in Claude Code's own process, on Windows always and on Linux at `ptrace_scope` 0 or without Yama, where the post office's copy is open too. On Windows it can also read it from the post office where its DACL couldn't be set, and from any process through `SeDebugPrivilege` when Claude Code runs elevated. With the secret it can act as the Monarch: command and stop soldiers, read the event stream and, from M2, answer approval requests (CH-6, →M2). Shadow Army runs on a machine with no protection too; its log says which one it has.
>>> END

D-9: a soldier credential stays off disk where the CLI allows; claude's owner-only fallback file and its removal; the residual for soldier credentials.
<<< OLD
  - A soldier credential never appears on any process's command line. codex and grok take theirs over stdio, in `thread/start` and `session/new`; how claude takes its own, with nothing on its command line or on disk, is open question Q9.
=== NEW
  - A soldier credential never appears on any process's command line, and stays off disk wherever the CLI allows. codex and grok take theirs over stdio, in `thread/start` and `session/new`. claude takes its own over its stream-json input where it can (Q9). Until a probe shows it can, and wherever it can't, the post office writes the `send` server's entry, credential included, to an `--mcp-config` file that only the owner can read, beside the session's record as CH-2's instructions file is, never in a worktree or a snapshot. It removes the file once claude has answered the `initialize` control request (PO-1), or when the process ends, whichever comes first. Each start or resume of the process writes it anew.
    - A soldier that runs code as the owner can still take another soldier's credential: from that CLI's memory, or the post office's, where nothing shields it (PO-3), or from claude's file while it exists. With it, it can send under that soldier's name. That is a stated residual risk.
>>> END

D-9: PO-4 names claude's two ways in.
<<< OLD
  - The tool is added to claude, codex and grok soldiers through each CLI's own MCP configuration, adding to it and never replacing it: claude's `--mcp-config`, codex's `thread/start` config, and grok's `session/new` `mcpServers` (spike S4).
=== NEW
  - The tool is added to claude, codex and grok soldiers through each CLI's own MCP configuration, adding to it and never replacing it: claude's stream-json input or its `--mcp-config` file (Q9), codex's `thread/start` config, and grok's `session/new` `mcpServers` (spike S4).
>>> END

D-9: SEC-2 says what it proves, adds the memory-protection test, and names the residual.
<<< OLD
- **SEC-2** (M1; X) A test proves that a request without the Monarch's credential, or with a wrong one, reaches no soldier and is reported, and that the credential appears in no file, command line or environment variable (PO-3).
=== NEW
- **SEC-2** (M1; X) A test proves that a request without the Monarch's credential, or with a wrong one, reaches no soldier and is reported, and that the credential appears in no file, command line, environment variable, output or log (PO-3). A test on each of the three systems (VER-2) proves that the post office's log names the memory protection it has, and that where it has one, a fake soldier can neither read its memory nor change its DACL. Neither proves that the secret can't be read where PO-3 states the residual risk.
>>> END

D-9: SEC-5 narrowed to what the post office lets a credential do, with the on-disk rule.
<<< OLD
- **SEC-5** (M3; X) A test proves that a valid soldier credential cannot issue any Monarch command, read the event stream, read another soldier's session, log or record, or send under another soldier's name, and that no soldier credential appears on the command line of any process the post office starts (PO-4).
=== NEW
- **SEC-5** (M3; X) A test proves that a valid soldier credential cannot issue any Monarch command, read the event stream, read another soldier's session, log or record, or send under another soldier's name, and that no soldier credential appears on the command line of any process the post office starts, or on disk beyond the file PO-4 allows claude while it exists (PO-4). It proves what the post office lets a credential do, not that a credential stays with its soldier: a soldier that runs code as the owner can take another's, as PO-4's stated residual risk says.
>>> END

D-9, D-10: section 5.1's security tests name the memory protection and the trust card.
<<< OLD
  - The mod has no approval path.
=== NEW
  - The mod has no approval path.
  - The post office names its memory protection in its log, and where it has one, a soldier can't read its memory (PO-3).
  - A folder's new or changed `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` or `agent.md` starts no soldier until the owner trusts it (NEW-D10-1).
>>> END

D-9: M1-AC2 tests the memory-protection line on each system and a fake soldier's failed read.
<<< OLD
a key that a fake claude streams across three fragments appears in no log (PO-3, SEC-2, SEC-4, PO-5, WSP-8).
=== NEW
a key that a fake claude streams across three fragments appears in no log (PO-3, SEC-2, SEC-4, PO-5, WSP-8). With the system's answer faked, Linux `ptrace_scope` 0, 1, 2 and 3, a kernel without Yama, a Windows DACL that is set and one that can't be, and macOS each give their own `memory protection` line in the post office's log. On Linux at `ptrace_scope` 1, and on Windows with the DACL set, a fake soldier the post office started fails to read the post office's memory: through `/proc/<pid>/mem` on Linux, and on Windows by opening it for `PROCESS_VM_READ` or `WRITE_DAC` without enabling `SeDebugPrivilege` (PO-3, SEC-2, VER-2).
>>> END

D-9 (R-F-29): M3-AC8 tests SEC-5's command-line clause, which no AC tested, and claude's file.
<<< OLD
  A closed or freshened session's credential is refused (PO-4, SEC-5).
=== NEW
  A closed or freshened session's credential is refused. While each fake soldier runs, no process the post office started holds a soldier credential on its command line. A fake claude takes its credential over its stream-json input, or under PO-4's fallback from a file only the owner can read, which is gone once the fake has answered `initialize`, and also when a fake that never answers is ended (PO-4, SEC-5).
>>> END

D-9: Q9 narrowed to the stream-json route, with the owner-only file as the fallback.
<<< OLD
- **Q9** How does a claude soldier take its `send` credential with nothing on its command line or on disk: `setMcpServers` over its stream-json input, or a `headersHelper`? A probe settles it before M3 (PO-4).
=== NEW
- **Q9** Can a claude soldier take its `send` server and credential over its stream-json input, through the control request behind the Agent SDK's `setMcpServers`, which leaves the servers claude's own configuration declares in place? And under PO-4's fallback, has claude read its `--mcp-config` file by the time it answers `initialize`? A probe settles both before M3. Until it does, and if the first answer is no, claude takes them from PO-4's owner-only file (PO-4).
>>> END

D-9: Appendix C: B2 is decided, so it leaves the "could add" list.
<<< OLD
| Ideas | Could add | Touches |
|---|---|---|
| B2 | PO-3 keeps the Monarch's secret out of files, command lines and the environment. But on Windows, and on Linux where ptrace is unrestricted, a process can read the memory of another that runs as the same user. A soldier that can run code could take the secret from the post office or the mod, and then answer its own approval requests. Decide how far PO-3 goes; at least, make the post office's memory unreadable where the system allows it. | PO-3, SEC-2, SEC-3 |
=== NEW
| Ideas | Could add | Touches |
|---|---|---|
>>> END

D-9: Appendix C: B2's row says what PO-3 now does for the memory part (verdict unchanged).
<<< OLD
| v2 has no container or proxy. PO-3 keeps the Monarch's secret out of files, command lines and the environment. | In the CLI, for the proxy. The memory part points at a gap. Could add (v2.0): see the list above. |
=== NEW
| v2 has no container or proxy. PO-3 keeps the Monarch's secret out of files, command lines, the environment, output and logs. | In the CLI, for the proxy. For the memory part, PO-3 shields the post office's memory where the system allows (Yama's `ptrace_scope` on Linux, the process's DACL on Windows), logs which protection each machine has, and states the rest as a residual risk. |
>>> END

D-10: glossary entry for the trust card.
<<< OLD
- **Attribution card:** the guard's decision on changes no record explains: y says they are the owner's, n fails the turn (ARM-6).
=== NEW
- **Attribution card:** the guard's decision on changes no record explains: y says they are the owner's, n fails the turn (ARM-6).
- **Trust card:** the owner's acceptance, by their hashes, of the folder's own `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` and `agent.md`, before any soldier starts there (NEW-D10-1).
>>> END

D-10: the new requirement, carried over from 2.0 POL-1 and POL-2, at the end of section 4.7.
<<< OLD
### 4.8 Workspaces and safety, carried over (WSP)
=== NEW
- **NEW-D10-1** (M1; U, I, X) **The folder's own policy files need the owner's trust** (from 2.0 POL-1 and POL-2).
  - The policy files are `shadow.config.json`, `orchestratorDelegate.md`, `rules.md` and `agent.md`. One the folder has at its top level is used in place of the copy Shadow Army ships, as in v1 (`src/core/config.ts`, `src/core/rules.ts`). A shipped copy needs no trust.
  - **Hashed when read.** Whenever the post office reads the folder's policy files, at its start and wherever it reads them again, as for a fresh session (SI-4, →M4), it reads each file once, hashes those bytes with SHA-256, and uses those same bytes. It compares each hash with the one the owner last accepted for that file in that folder. A file is untrusted when the folder is new to Shadow Army, when the file is new or changed, or when a file accepted before is gone.
  - **Nothing starts on an untrusted file.** While any policy file is untrusted, no soldier's session opens in the folder, a restart (PO-1) or a resume (CH-9, →M2) included, and no snapshot is made for one. The soldier's log, and the use that needed it, say why, as in `the army waits for you to trust this folder's Shadow Army files`. A brief sent meanwhile waits in the soldier's queue (MSG-3, →M3). Sessions already open keep the instructions and autonomy they opened with (SI-4, →M4).
  - **The trust card.** The post office raises one card for the folder, however many soldiers wait on it, and the mod shows it, from M1:
    - as notice rows in Claude's transcript, which are not added to Claude's conversation: each untrusted file with `new`, `changed` or `gone` and the first 12 hex digits of its hash, and for `shadow.config.json` each soldier it sets above supervised, with its `cli`, `model` and `autonomy`, as in `Kaisel · claude · opus · full`. Text from the files is escaped as SEC-6 says. The card doesn't show the files' text; the owner reads them in the folder;
    - then in Claude Code's own question dialog (the mod API's `$.ui.ask`), which asks `Trust this folder's Shadow Army files?` with two options, `Not now` first, then `Trust these files`.

    `Trust these files` accepts exactly the hashes shown: the post office records them, and the waiting sessions open, each soldier at the autonomy the accepted file gives it. `Not now`, a dismissed dialog, or a dialog that can't open accepts nothing and starts nothing, and the next use shows the card again. A file that changed after the card was shown stays untrusted, and the card shows again with its new hash.
  - **Only the card.** The folder's files raise a soldier's autonomy above supervised only through an accepted card. No setting, flag, environment variable or file in the folder accepts a policy file.
  - **The record** of accepted hashes is kept in Shadow Army's own folder in the user's home, `~/.shadow-army/trust/`, one file per folder, named for the folder's name and a hash of its path as WSP-11 names snapshots, and written whole. It is never in the folder, so a repository can't ship its own acceptance. A record that can't be read or parsed counts as none, and the post office's log says so. If the record can't be written, nothing is accepted, and the use says why.
  - **Stated residual risks.** Claude Code passes the dialog through its hooks as an AskUserQuestion call, which a PreToolUse hook can answer, so a hook the owner installed, or one in the folder's own Claude Code settings, can accept the card. Any process of the owner's, a soldier that runs code included, can write the record. The files the card doesn't cover, such as `CLAUDE.md`, `AGENTS.md`, `.claude/` and `.mcp.json`, steer a soldier's CLI as its vendor intends, with no card. Where the folder lacks a policy file, the shipped copy applies with its own autonomy levels. v1's own commands, kept until LEG-1 (→M6), still read the folder's files with no card.

### 4.8 Workspaces and safety, carried over (WSP)
>>> END

D-10: M1 implements the new requirement.
<<< OLD
- ARM-1, ARM-3;
=== NEW
- ARM-1, ARM-3, NEW-D10-1;
>>> END

D-10, D-19: M1's new ACs, after M1-AC12 (D-3's new M1 ACs may land here too).
<<< OLD
- **M1-AC12** Text from a fake claude holding ESC, a bidirectional control and a zero-width character shows each as a placeholder in the mod's transcript lines, and reaches Claude escaped the same way; its other characters are kept (SEC-6).
=== NEW
- **M1-AC12** Text from a fake claude holding ESC, a bidirectional control and a zero-width character shows each as a placeholder in the mod's transcript lines, and reaches Claude escaped the same way; its other characters are kept (SEC-6).
- **NEW-D10-AC1** The folder's policy files and the trust card, with a fake `$` and a fake claude (NEW-D10-1, SEC-6):
  - a folder new to Shadow Army, with its own `shadow.config.json` that sets one soldier to `full` and its own `agent.md`: until the answer, no session opens and no snapshot is made. The rows name both files as `new` with their hashes, and that soldier with its `cli`, `model` and `full`, and `Not now` is the dialog's first option. `Not now`, a dismissed dialog and a dialog that rejects each start nothing, the use says why, and the next use shows the card again. `Trust these files` opens the session at `full`;
  - after that, one changed byte in `agent.md`, a new `rules.md`, and the accepted `shadow.config.json` deleted each show the card again, in turn, before the next session opens. A crash restart while a file is untrusted waits for the card, while another soldier's open session runs on;
  - a file changed between the card and `Trust these files` is not accepted, and the card shows again with its new hash;
  - an acceptance record placed in the folder accepts nothing. A record in `~/.shadow-army/trust/` that can't be parsed counts as none, and the log says so; one that can't be written accepts nothing;
  - a folder with none of the four files uses the shipped copies and shows no card;
  - a `shadow.config.json` whose model name holds ESC and a bidirectional control shows each as a placeholder in the rows.
- **NEW-D19-AC1** Every claude process the adapter starts, at each autonomy level, on a start and on a restart, has `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in its environment, also when the post office's own environment sets it to `0`. Live, with the owner's go, on one system: in a snapshot of a repository whose auto memory holds a `MEMORY.md`, and whose committed `.claude/settings.json` sets `autoMemoryEnabled` to true and the variable to `0` in its `env`, a claude soldier asked what its memory holds quotes none of that `MEMORY.md`, and, asked to remember a fact, leaves the memory directory unchanged. The run is written up on the PR (CH-2).
>>> END

D-10: Appendix A carries the new requirement's source.
<<< OLD
| ARM-3 | 2.0 CFG-3, CFG-4 |
=== NEW
| ARM-3 | 2.0 CFG-3, CFG-4 |
| NEW-D10-1 | 2.0 POL-1, POL-2 |
>>> END

D-19 (R-M1-82): each claude soldier runs with auto memory off; what the spec relies on until the live run.
<<< OLD
  - One long-lived `claude -p --input-format stream-json --output-format stream-json --verbose` process per soldier.
=== NEW
  - One long-lived `claude -p --input-format stream-json --output-format stream-json --verbose` process per soldier.
  - **Auto memory off.** The adapter starts each claude process with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in its environment, over any value the post office inherited, so claude neither loads nor writes its auto memory. Claude Code keeps one auto-memory directory per git repository, shared by all its worktrees, so a soldier's snapshot (WSP-11) would share the one the owner's own sessions load at every start. A soldier would then read the Monarch's `MEMORY.md`, and could save a memory that the owner's next session loads, outside briefs and reports (MSG-1, →M3). This changes one vendor default; it removes no tool and disables no safeguard (CH-7). Until a live run confirms it (NEW-D19-AC1), the spec relies on Claude Code's documentation, which says that with the variable set to 1 claude neither creates nor loads auto-memory files. `CLAUDE.md` files still load as the vendor intends.
>>> END
```

**ADR-0012 needs this note (not edited):**
- Its Decision says the Monarch's secret is never on disk, a command line or an environment variable. It should add output and logs, and say that the post office shields its own memory where the system allows (PO-3).
- Its Consequences say "A soldier cannot act as the Monarch or read another soldier's work, even with its own credential." That only holds for a soldier that stays inside its CLI's permission checks. A soldier that runs code as the owner can act as the Monarch, and send as another soldier, wherever PO-3's protection doesn't hold. That is the threat model's residual.
- SEC-3 needs no change. No Shadow Army code path answers an approval request without the owner; a soldier that stole the secret is the residual, not such a code path.

**Could not place:**
- **macOS.** The answer names only Linux and Windows. I wrote "checks nothing, logs `not checked`". Whether macOS stops a same-user process reading the post office's or Claude Code's memory without root is unverified: NEEDS-PROBE.
- **Making the post office non-dumpable on Linux at scope 0.** That needs native code inside the post office's own process. The answer doesn't call for it, so it is not in the text.
- **Threads on Windows.** The DACL covers the process object only. Node's threads keep their default DACLs, and whether control of a thread lets a same-user process reach the secret is NEEDS-PROBE. It is stated in the residual below, not in the spec.
- **OWNER RIGHTS on a process object.** Microsoft documents it only in archived Vista and Server 2008 pages, for securable objects in general. M1-AC2's Windows case is the proof: NEEDS-PROBE.
- **Fallback if the live check fails.** If NEW-D19-AC1 shows that a project's `autoMemoryEnabled` or `env` overrides the variable, the technical fallback is `--settings '{"autoMemoryEnabled": false}'`. The command-line scope sits above project and local settings. The answer didn't choose it, so it is not in the text.
- **The trust card is a dialog, not a pane card.** I used Claude Code's own question dialog (`$.ui.ask`, from the mod typings 2.1.294) from M1 on. That answers "what M1 does before the card exists": the card exists from M1. A pane card with y/n (HOST-5, HOST-14) can't be answered by a hook, but it would need HOST-14's list changed at M5. That is a choice for the orchestrator.

**Findings against v0.10:**

```
- severity: P2
  type: untestable
  location: SEC-5, M3-AC8 (docs/spec/v2.md:523, 801-806)
  claim: SEC-5's clause that no soldier credential appears on any command line (added in v0.8) is tested by no AC.
  scenario: a claude adapter passes `--mcp-config '{"...Authorization":"Bearer <cred>"}'`; every M3 AC passes; Appendix B rule 4 passes because M3-AC8 cites SEC-5.
  evidence: M3-AC8 lists only send, Monarch commands, the event stream and revocation.
  fix: block 8 above (M3-AC8 reads each process's command line and claude's file).
- severity: P2
  type: gap
  location: ARM-1 (docs/spec/v2.md:458)
  claim: v0.10 never says whether the folder's policy files or the shipped ones apply. D-10's "new or changed" needs one or the other.
  scenario: reading A uses only the folder's files and refuses a folder without them; reading B falls back to the shipped files (v1 src/core/config.ts:41-46), whose shadow.config.json sets codex-sol, grok and agy to full.
  evidence: v1 config.ts:41-46 and rules.ts:56-60 ("in the working directory wins"); shipped shadow.config.json lines 4-8.
  fix: NEW-D10-1's first bullet (v1's rule, stated, with the shipped autonomy as a residual).
- severity: P2
  type: ambiguity
  location: CH-2 (docs/spec/v2.md:298)
  claim: "beside the session's record" has no meaning in M1, because records arrive with PO-6 in M3.
  scenario: in M1 one builder writes the instructions file under .shadow/v2/, another under the OS temp folder; PO-1's cleanup of "any instructions file the last one left" can't find the second.
  evidence: PO-6 (M3) 229; PO-1 209.
  fix: "beside the session's log under `.shadow/v2/` (PO-5)". PO-4's new fallback file follows the same rule.
- severity: P2
  type: gap
  location: CH-4 (docs/spec/v2.md:314)
  claim: `grok agent serve` "bound to the loopback with a secret" never says how that secret reaches grok. On a command line or in the environment, any same-user process could drive the soldier.
  scenario: the adapter passes the serve secret as an argument; `ps -ef` shows it; another soldier connects to grok's port and prompts it.
  evidence: PO-4 220 covers only soldier credentials; ADR-0012 covers the two credential kinds only.
  fix: decision: stdio only for grok (drop `serve`), or the serve secret follows PO-4's rule (off command lines and disk where grok allows).
- severity: P2
  type: vendor-fact
  location: NEW-D19-AC1 / CH-2 auto memory (docs/spec/v2.md:294)
  claim: no document says whether CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 beats a project's `autoMemoryEnabled: true` or a settings `env` block in the snapshot, nor whether a `-p` session that another Claude Code session started has auto memory at all.
  scenario: a repository commits `.claude/settings.json` with `"env": {"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0"}`; if settings env wins, the soldier loads the Monarch's MEMORY.md.
  evidence: https://code.claude.com/docs/en/env-vars ("Set to 0 to force auto memory on…"; silent on 1 against the setting); https://code.claude.com/docs/en/settings ("An env block inside a settings file is an ordinary key"); https://code.claude.com/docs/en/memory (sessions another session started handle the toggle differently). NEEDS-PROBE (P-12).
  fix: the live check in NEW-D19-AC1; if it fails, also pass `--settings '{"autoMemoryEnabled": false}'`.
- severity: P2
  type: vendor-fact
  location: NEW-D10-1 trust card (draft)
  claim: the card's dialog can be answered by a hook. `$.ui.ask` is "A tool.call of AskUserQuestion through every hook but the calling one", and a PreToolUse hook can answer AskUserQuestion with updatedInput.answers.
  scenario: the owner keeps a hook that auto-answers questions; the trust card is accepted with no keypress; a cloned repository's `full` takes effect.
  evidence: evidence/mod-api-2.1.294/claude-code.d.ts 2406-2420; https://code.claude.com/docs/en/hooks (AskUserQuestion `answers` "supply it via updatedInput to answer programmatically").
  fix: stated as a residual in NEW-D10-1, with `Not now` as the first option; or decision: the card moves to the pane's keys (HOST-5) from M5.
```

**Residual risk, for D-4's appendix to quote:**

D-9: "On Windows, and on Linux where Yama's ptrace_scope is 0 or Yama is absent, a soldier that runs code as the owner can read the Monarch's secret from the mod's copy in Claude Code's own process, and on Linux at scope 0 from the post office too. It can then act as the Monarch: brief and stop soldiers, read every soldier's turns, and from M2 answer approval requests, its own included. On Windows the post office's DACL shields the post office only. It doesn't shield Claude Code's process, a process with SeDebugPrivilege (an elevated session), or, as far as anyone has checked, the post office's threads; where the DACL can't be set, nothing shields the post office. The same soldier can take another soldier's credential from that CLI's memory, or from claude's owner-only file before claude has read it, and send under that soldier's name. At Linux scope 1 or more, soldiers can read neither copy of the secret nor another soldier's CLI, because they descend from both holders. On macOS Shadow Army checks nothing, and how far the system stops a same-user process reading another's memory is unverified. Shadow Army logs which protection each machine has, and runs where there is none."

D-10: "The trust card covers only shadow.config.json, orchestratorDelegate.md, rules.md and agent.md. A repository's CLAUDE.md, AGENTS.md, .claude/ and .mcp.json still steer each soldier's CLI as its vendor intends, with no card. The card is Claude Code's own question dialog, which Claude Code passes through its hooks, so a hook the owner installed, or one in the repository's own Claude Code settings once the owner trusted the folder in Claude Code, can accept it. The acceptance record lives in the owner's home, where any process of the owner's, a soldier that runs code included, can write an acceptance. Where a folder lacks a policy file, Shadow Army's shipped copy applies with no card, and the shipped shadow.config.json sets some soldiers to auto and full. v1's own commands still read the folder's files with no card until v1-only code leaves in M6."

D-19: "Claude soldiers run with auto memory off, but until the live check runs this rests on Claude Code's documentation alone. Whether a repository's own Claude Code settings can turn it back on is undocumented, and the live check tests it. The setting covers Claude Code's auto memory only. The owner's user-level ~/.claude/CLAUDE.md and the repository's CLAUDE.md files still load into every claude soldier as the vendor intends, and a soldier that runs code as the owner can still write files the owner's sessions load. The other CLIs' own memory features, if any, are not covered."

**Sources:**
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/agent-sdk/typescript (setMcpServers)
- https://www.kernel.org/doc/html/latest/admin-guide/LSM/Yama.html
- https://man7.org/linux/man-pages/man2/ptrace.2.html
- https://man7.org/linux/man-pages/man5/proc_pid_mem.5.html
- https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights
- https://learn.microsoft.com/en-us/windows/win32/secauthz/sid-strings
- https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-vista/cc749445(v=ws.10) (OWNER RIGHTS, archived)
- https://technet.microsoft.com/en-us/library/dd125370 (Owner Rights, archived)
- C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts lines 2406-2420
- Review files read: C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md, ledger.md, probes.md, raw\M1-r1-verify-V1.md, raw\M1-r1-verify-V7.md
- C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\settled.md
- C:\Users\johns\projects\AIConnections-review\docs\adr\0012-local-only-post-office.md
- C:\Users\johns\projects\AIConnections-review\docs\legacy\spec\shadow-army-2.0.md lines 69 and 1078-1080
- v1: C:\Users\johns\projects\AIConnections-review\src\core\config.ts, rules.ts, delegate.ts, and shadow.config.json
- Codex's draft: C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts:54
