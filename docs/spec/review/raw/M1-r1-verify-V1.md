# M1 round 1, verifier M1-V1 (security): R-M1-1, R-F-29, R-M1-2, R-M1-39, R-M1-24, R-M1-56, R-M1-53, R-M1-31. Snapshot be9deb0; v0.7 noted where it fixes one. 311,622 tokens, 78 tool calls, 19 min.

- id: R-M1-1
  verdict: DECISION
  severity: P1
  evidence: PO-3 172 ("MUST NOT be written to disk, a command line, an environment variable, or anywhere a soldier can read"). PO-3 173 and §3 83: every command presents the secret, so the mod and the post office both hold it for the whole session. SEC-2 417 and M1-AC2 547 check only files, command lines, the environment, output and logs, so they pass while 172's last clause fails. Appendix C B2 782 is this gap ("Decide how far PO-3 goes; at least, make the post office's memory unreadable where the system allows it"). PLAYBOOK §14: "Accepting a risk that can't be fixed (for example, B2 on one system) is big". D-4's card (decisions.md 101-109) already lists B2 as a residual for the owner to accept. ADR-0012:14 against its consequence at :22 ("A soldier cannot act as the Monarch"). Windows: https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights ("The ACLs in the default security descriptor for a process come from the primary or impersonation token of the creator"); PROCESS_VM_READ is refused only to protected processes, and node.exe is not one. Linux: https://www.kernel.org/doc/html/latest/admin-guide/LSM/Yama.html. Scope 0 lets any same-uid dumpable process attach. Scope 1 allows "only its descendants", and soldiers are descendants of the post office and of Claude Code, so scope 1 or more already shields both. Node has no prctl, so PR_SET_DUMPABLE would need native code. The mod's copy lives inside Claude Code, whose process protection no mod controls.
  reason: Real: a soldier that can run code can read the secret on Windows always, and on Linux at ptrace_scope 0. With it, the soldier can send briefs, stop soldiers and, from M2, answer approval requests as the Monarch, so PO-3 172 can't be met as written. How far PO-3 goes, and accepting what can't be fixed on Windows, is B2's open decision.
  options:
    - A: Harden where the system allows, and state the rest.
      - PO-3's MUST NOT names disk, command lines, environment variables, output and logs.
      - The post office checks the protection it relies on, and logs when it is missing. On Linux that is ptrace_scope 1 or more; on Windows, a process security descriptor that refuses memory reads by the owner's other processes, where one can be set.
      - An X test checks that protection where it is supported.
      - The residual goes into D-4's threat model: on Windows, the mod's copy inside Claude Code; on Linux, scope 0. ADR-0012's consequence is narrowed to match.
    - B: Soldiers run as another OS user or in a sandbox, so PO-3 holds as written. This is a new capability and a setup change.
    - C: As A, and on Linux at scope 0 soldiers start only if the owner allows it.
  big or technical: big. The Windows residual can't be fixed, so the owner accepts it; decide it with D-4's card. Under A, the hardening mechanism is technical and goes to a bake-off.
  v0.7: not fixed. PO-3 197-202, SEC-2 452 and M1-AC2 613 are unchanged.

- id: R-F-29
  verdict: DECISION
  severity: P1
  evidence: m0-report.md:47 (S4: claude's "--mcp-config takes a JSON string … An HTTP server with an Authorization header works"). https://code.claude.com/docs/en/cli-reference: `--mcp-config` "Load MCP servers from JSON files or strings". So Kaisel's credential sits on its command line or in a file, and every process of the owner's user can read either. On Linux every local user can read any command line, because /proc's hidepid "0 … the default if this mount option is not specified" (https://man7.org/linux/man-pages/man5/proc.5.html; https://man7.org/linux/man-pages/man5/proc_pid_cmdline.5.html). Those users can also reach loopback (PO-2 169). PO-4 177-181 says nothing about where a soldier's credential may be kept; only the Monarch's secret has PO-3 172's rule. SEC-5 420 and M3-AC8 test a soldier's own credential only, so they still pass while Iron sends with Kaisel's. ADR-0012:14: "soldiers run as the same user and can read whatever the owner can". codex's `thread/start` and grok's `session/new` already carry the config over stdio (CH-3, CH-4), off the command line. For claude, the Agent SDK's documented `setMcpServers` (https://code.claude.com/docs/en/agent-sdk/typescript) shows a route over claude's input; a probe would have to confirm its wire shape. The finding's Monarch-secret half is R-M1-1's (B2).
  reason: Real: built as S4 found, a claude soldier's credential is on its command line, so another soldier can send as that soldier, and on Linux another local user can too, while SEC-5 still passes. What the two kinds of credential defend against is the threat model's decision (D-4), and the Monarch half duplicates R-M1-1.
  options:
    - A: D-4's threat model says the credentials stop a confused or injected soldier that uses only its tools, not one that runs code to read other processes.
      - Each soldier credential stays off command lines and disk wherever the CLI allows: codex and grok over stdio; claude over its stream-json input if a probe confirms it, else in an owner-only file removed once the session is up.
      - SEC-5 and ADR-0012's consequences are narrowed to match, and the residual is stated.
    - B: Soldiers are isolated at the OS level (another user or a sandbox).
    - C: Keep S4's JSON string, and accept impersonation, and on Linux exposure to other local users, as a stated risk.
  big or technical: big: a trust boundary and an accepted residual. Under A or C, moving claude's credential off the command line is technical. Decide it with R-M1-1 and D-4.
  v0.7: not fixed. PO-4 203-209 and SEC-5 455 are unchanged.

- id: R-M1-2
  verdict: DECISION
  severity: P1
  evidence:
    - The config is read from the folder:
      - ARM-1 376 puts `cli`, `model` and `autonomy` in shadow.config.json, and the roster carries over from v1.
      - v1 reads the folder's copy first ("shadow.config.json in the working directory wins", C:\Users\johns\projects\AIConnections-review\src\core\config.ts:41-46). So does the draft (C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts:54 into src\core\roster.ts:72-80).
      - The archived 2.0 draft found this exact risk and gave it a trust card: D9 at :69 ("A cloned repository can silently raise its soldiers' autonomy"), and POL-1 and POL-2 at :1078-1079. Neither Appendix A (722-741) nor ADR-0013's carry-overs keeps it.
    - The vendor guards against it: Claude Code ignores `auto` and `bypassPermissions` set in a project's `.claude/settings.json` (https://code.claude.com/docs/en/permission-modes: "If you set "bypassPermissions" in those two files, it doesn't take effect either"). A repository's `autonomy: full` turned into `--permission-mode bypassPermissions` therefore goes around that safeguard (CH-7, ADR-0010).
    - Reading A is refuted: `cli` picks one of the adapters (CH-1 216; v1 src\core\army.ts:58; the draft's postOffice.ts:127).
    - Reading B holds on Windows:
      - The draft searches the soldier's cwd before PATH for .COM, .EXE, .BAT and .CMD (src\v2\processTree.ts:384-393, `[cwd, ...PATH]`). That cwd is a snapshot of HEAD, which holds the repository's committed files (postOffice.ts:130-142).
      - Node's own spawn also checks the child's cwd first: libuv's search_path says "check the current directory for file, then search all path directories" (https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/process.c).
      - execa's cross-spawn switches to the cwd and calls node-which, whose code says "windows always checks the cwd first" (https://raw.githubusercontent.com/npm/node-which/main/lib/index.js; https://raw.githubusercontent.com/moxystudio/node-cross-spawn/master/lib/util/resolveCommand.js). So harness git started that way (src\workspace\git.ts:11, `execa("git", args, { cwd })`) runs a git.exe or git.cmd committed in the folder.
      - node_modules/.bin is on PATH only under npm scripts, so the cwd is the real way in.
  reason: Real: a cloned repository's shadow.config.json sets every soldier's autonomy, up to bypassPermissions. On Windows, a committed claude.cmd, claude.exe or git.exe also runs in place of the real program. Whether the folder's files are trusted is a trust boundary for the owner; the program-resolution rule has one sensible answer and can be fixed now.
  options:
    - A: Carry over 2.0's POL-1 and POL-2. The folder's shadow.config.json, orchestratorDelegate.md, rules.md and agent.md are hashed. A new or changed one shows a trust card before any soldier starts, and the folder's config raises autonomy above supervised only through that card.
    - B: `cli`, `model` and `autonomy` come only from the owner's own config outside the folder; the folder's files may only restrict.
    - C: Trust the folder, and say so in D-4's threat model.
    - In every option, a technical fix to apply now:
      - Shadow Army starts each CLI, and git, from an absolute path found on PATH alone, never in the folder, a worktree or a snapshot. On Windows, the current directory is not searched.
      - `cli` must name one of the four adapters.
      - An X test plants claude.cmd, claude.exe and git.exe at a snapshot's root and in the folder, and shows that none of them runs.
  big or technical: big: a trust boundary, and what a repository may change without the owner; A also adds a card the owner answers. The resolution rule is technical.
  v0.7: not fixed. §0 31 now makes v1.0.1's code the detail of ARM-1 (405), which makes the folder-first reading explicit. WSP-10 (442) stops harness git from running what the repository's config names, but not a git.exe the repository commits.

- id: R-M1-39
  verdict: CONFIRMED
  severity: P2
  evidence: VER-5 506. Decision 4 (settled.md:25) names no configuration. C:\Users\johns\projects\AIConnections\.shadow\v2-tools\STATE.md:65 suggests it replaced the draft's "fakes chosen by a test factory". The draft still picks fakes through a shipped option, against VER-5's "never through a code path that ships": C:\Users\johns\projects\AIConnections-m1\src\v2\channel.ts:39-40 ("A configured executable is also how fake CLIs are selected in tests"), claude.ts:90, fixture-main.testutil.ts:13. client.ts:14 starts the post office, not a CLI, so it isn't VER-5's case. The other reading, a key in shadow.config.json that names an executable, would be read from the folder first (C:\Users\johns\projects\AIConnections-review\src\core\config.ts:41-46), so a clone would choose what runs (R-M1-2). PATH is configuration, so the fix keeps decision 4.
  reason: "Configuration" allows two readings: a shipped option, which VER-5's own second clause forbids, and a repository key, which lets a clone pick the executable. Putting test/fakes/ first on PATH is still configuration, adds no shipped code path, and is the only reading that stays safe under R-M1-2.
  fix: VER-5: "**Fake CLIs.** Fakes live in `test/fakes/` and are chosen through configuration: the test runner puts `test/fakes/` first on `PATH`, so the product starts a fake exactly as it starts the real CLI. No option or setting in the product names a fake, and `shadow.config.json` never names an executable." Apply it with R-M1-2's PATH-only rule.
  v0.7: not fixed. VER-5 571 is unchanged.

- id: R-M1-24
  verdict: CONFIRMED
  severity: P1
  evidence:
    - CH-2 221-224 lists claude's flags with no `--permission-mode`. CH-7 255 and 2.0's SAFE-10 (legacy :1048) give no table.
    - https://code.claude.com/docs/en/permission-modes, "Which mode a session starts in": for `claude -p`, "`default` in sessions that fetch feature flags. In sessions that don't, such as on a third-party provider or with telemetry off, `auto` with Claude Code v2.1.285 or later". A settings file's `defaultMode` other than auto and bypassPermissions applies "from any settings file", so a committed `.claude/settings.json` can start the soldier in `acceptEdits`. M1's snapshot of HEAD (settled decision 7) contains that file.
    - https://code.claude.com/docs/en/cli-reference: `--permission-mode` "Overrides `defaultMode` from settings files".
    - https://code.claude.com/docs/en/sessions, "Permission mode on resume": `claude -p --resume` starts in the mode a new `-p` run would, so a resume needs the flag too.
    - v1 always passes a mode (C:\Users\johns\projects\AIConnections-review\src\adapters\claude.ts:13-21): full `bypassPermissions`, auto `auto`, supervised `plan`, or `acceptEdits` with `--write`. The draft passes `plan` for supervised (C:\Users\johns\projects\AIConnections-m1\src\v2\claude.ts:30).
  reason: Real: nothing says which flag each level passes. A supervised claude soldier that gets none starts in auto (telemetry off, 2.1.285 or later) or in a committed acceptEdits, and acts without the owner. Making every adapter pass its mode explicitly, with v1's mapping for what M1 runs, fixes it in the text.
  fix:
    - CH-7, a new bullet: "Each adapter passes its CLI's permission mode at every autonomy level, on every start and resume, so the mode never comes from a settings file or the CLI's own default."
    - CH-2, a new bullet: "It passes `--permission-mode plan` for supervised, `--permission-mode auto` for auto and `--permission-mode bypassPermissions` for full, as v1 does for a task without `--write`. A supervised soldier's writing turns get their mode with ARM-5 (→M6)."
    - CH-3 to CH-5 give their own tables in M2.
    - M1-AC5 adds that the claude adapter passes the mode for each level. CH-9's AC (M2-AC11 in v0.7) adds that a resume passes it too.
  v0.7: not fixed. The new Autonomy entry (60) says "as in v1" but names no flag. CH-2 250-255 and CH-7 282-284 are unchanged.

- id: R-M1-56
  verdict: CONFIRMED
  severity: P3
  evidence: CH-7 254 forbids "a flag that disables a safeguard". Yet CH-7 255, ADR-0010 ("Autonomy only chooses each vendor's documented flags") and v1 (C:\Users\johns\projects\AIConnections-review\src\adapters\claude.ts:15-16) give `full` the flag `bypassPermissions`. That mode "disables permission prompts and safety checks" (https://code.claude.com/docs/en/permission-modes). https://code.claude.com/docs/en/cli-reference, `--dangerously-skip-permissions`: "Skip permission prompts. Equivalent to `--permission-mode bypassPermissions`". The design rule in C:\Users\johns\projects\AIConnections\CLAUDE.md has the missing words: "Shadow Army never adds or removes a vendor safeguard on its own". M1-AC5 554 tests only the system prompt and tools, so the clash falls on CH-7's R and U evidence, not on M1-AC5.
  reason: Read alone, CH-7's first bullet forbids the flag the owner's full level must pass. The design rule's "on its own" resolves this, and R-M1-24's table makes the clash explicit, so apply the two fixes together.
  fix: CH-7's first bullet: "No adapter replaces a system prompt or removes a tool, and none passes, on its own, a flag that disables a safeguard: such a flag, like claude's `bypassPermissions` for `full`, goes only where the owner's autonomy level chose it (ADR-0010)."
  v0.7: not fixed. CH-7 283 is unchanged.

- id: R-M1-53
  verdict: CONFIRMED
  severity: P2
  evidence: PO-3 173 reports every refusal, with no limit. PO-1 164 puts the port in the lock, and every local process can reach loopback (PO-2 169): a soldier that runs code, or another local user. The draft writes one event and one log line per refusal (C:\Users\johns\projects\AIConnections-m1\src\v2\server.ts:61-63, then postOffice.ts:260, then record() at 74-78), and chains one pending write for each. A coalesced report still meets ADR-0012:17 ("a refused connection is reported"). D-5 (from R-F-7), R-M1-52 and H62 bound how big logs grow, not this per-request amplification or the event stream.
  reason: Real: an unauthenticated local sender turns every bad request into a log line and an event, filling the disk and the mod's stream. If the mod falls behind, v0.7's PO-7 (214) also stops reading the soldiers' output past 16 MiB of unwritten events. A coalesced report keeps ADR-0012's rule and bounds the cost.
  fix: as proposed, in PO-3 173: "A wrong or missing secret is refused. The first refusal is reported in full; after that, at most one report a minute, with the count since the last one." M1-AC2 adds: "1,000 refused requests give one full report, then one a minute with the count."
  v0.7: not fixed. PO-3 200 is unchanged.

- id: R-M1-31
  verdict: CONFIRMED
  severity: P3 (was P2). PO-3 173 ("Every command from the mod presents it"), §3 83 and the diagram's "127.0.0.1 + secret" (78) fix the design. §3 87 says the post office's input is written once and then closed, so commands can only go over the port. A build that never sends the secret, such as an HMAC per request, would contradict PO-3's "presents it". Only AC2's verb is loose.
  evidence: M1-AC2 547 ("travels only on the post office's standard input"); PO-3 171 and 173; §3 78, 83 and 87. The draft and its mod send `Authorization: Bearer` with each command: C:\Users\johns\projects\AIConnections-m1\src\v2\server.ts:59-61 and C:\Users\johns\projects\AIConnections-m1\plugins\shadow-army\hooks\register.ts:57.
  reason: AC2's "travels only on standard input" contradicts the per-command presentation PO-3 requires. The requirement itself is clear, so rewording the AC is enough.
  fix: as proposed.
  v0.7: not fixed. M1-AC2 613 is unchanged.
