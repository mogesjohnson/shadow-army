Unit M1, round 2, vendor-fact checker, on v0.11 (v2@af97372.md), 2026-10-20

- severity: P2
  type: vendor-fact
  location: PO-9 Windows (snapshot v2@af97372.md:300), PO-15 (:365), PO-16 (:387), M1-AC15 (:976), M1-AC16 (:980)
  claim: The statements "Every process the CLI creates joins the job too" and "Nothing escapes" are wrong against Windows' own documentation. A process in the job can create a child whose parent is a process outside the job, and that child inherits the outside parent's job. A process can also copy the job's handle out of the guardian, which keeps the job open after the guardian dies.
  scenario: A soldier's tool calls CreateProcess with PROC_THREAD_ATTRIBUTE_PARENT_PROCESS set to a same-user process outside the job, such as explorer.exe or the owner's terminal. The new process takes that parent's job, so PO-10's TerminateJobObject never reaches it, and it keeps writing to the checkout after the session closes. A second path: a process in the job calls DuplicateHandle on the guardian (its default DACL grants the user PROCESS_DUP_HANDLE) and keeps a copy of the job handle. When the guardian is killed, the job's last handle doesn't close, so KILL_ON_JOB_CLOSE never fires. PO-15 says "Nothing escapes, and the channel restarts as after any crash", so the restart runs while the old tree is still alive. A non-hostile path exists too: `start <url>` or Invoke-Item hands the work to explorer or COM, which runs it outside the job. M1-AC15 tests only a breakaway request and WMI, so all three cases pass CI unnoticed.
  evidence: https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute, PROC_THREAD_ATTRIBUTE_PARENT_PROCESS: "Attributes inherited from the specified process include handles, the device map, processor affinity, priority, quotas, the process token, and job object"; the same page, under CHILD_PROCESS_POLICY: a process "able to access another process handle with PROCESS_CREATE_PROCESS ... may be possible to bypass" the restriction. PO-1's residual list (:210) names WMI and scheduled tasks, but neither parent spoofing nor shell/COM hand-off. D-3 treated a stated escape (option C on macOS) as a big, posture-level choice (decisions.md 83-86, 122). NEEDS-PROBE: whether a job without JOB_OBJECT_LIMIT_BREAKAWAY_OK refuses a PARENT_PROCESS whose parent is outside the job.
  fix: decision: (a) state it as a residual: add "a process created with another process as its parent, one handed to the shell or a COM server, and one that holds a copy of the job's handle" to PO-1's list; drop "Nothing escapes" from PO-15 and PO-16 for Windows; add a parent-spoofing case to M1-AC15 that the test ends; (b) also give the guardian a DACL that denies PROCESS_DUP_HANDLE and PROCESS_CREATE_PROCESS, which closes the handle copy but not spoofing through other processes, and still state the rest; (c) ask the owner whether a stated Windows escape is acceptable, as D-3 did for macOS.

- severity: P2
  type: vendor-fact
  location: PO-3 Memory, Windows (:225), residual (:227); SEC-2 (:725); M1-AC2 (:923)
  claim: Replacing the process's DACL does not protect the post office's memory on Windows. Its threads keep their own DACLs, built from the token's default DACL. The new DACL also doesn't deny PROCESS_CREATE_PROCESS, which lets another process make the post office the parent of a new process that inherits its handles.
  scenario: On Windows, a soldier running code as the owner opens a post office thread with THREAD_SUSPEND_RESUME, THREAD_GET_CONTEXT and THREAD_SET_CONTEXT, and hijacks it to copy out the Monarch's secret and, from M3, every soldier credential (PO-4 says these are shielded where PO-3 shields them). Alternatively, it opens the post office with PROCESS_CREATE_PROCESS and starts a child parented to it. If the post office's standard handles are inheritable, which NEEDS-PROBE, that child holds the event-stream pipe and can write forged events to the mod. Meanwhile the log says the post office is protected, and M1-AC2's test passes, because it only tries PROCESS_VM_READ and WRITE_DAC.
  evidence: https://learn.microsoft.com/en-us/windows/win32/procthread/thread-security-and-access-rights: "The ACLs in the default security descriptor for a thread come from the primary or impersonation token of the creator", and THREAD_SET_CONTEXT is "Required to write the context of a thread". UpdateProcThreadAttribute (URL above): PARENT_PROCESS needs PROCESS_CREATE_PROCESS and passes on the parent's handles. PO-3's denied list (:225) omits both thread rights and PROCESS_CREATE_PROCESS.
  fix: decision: (a) harden: add PROCESS_CREATE_PROCESS to the denied rights, set the same DACL on each of the post office's threads and on its token's default DACL so that later threads get it too, and have SEC-2 and M1-AC2 also try OpenThread with those rights and a PARENT_PROCESS start; (b) narrow the claim: log `memory protection: process DACL only (threads open)` and add the thread path and the parent-process path to PO-3's residual and Appendix D's residual 1.

- severity: P2
  type: gap
  location: PO-3 (:219, :221); §3 (:98); Appendix D actors (:1560-1570)
  claim: Any other Claude Code plugin in the owner's session can read the Monarch's secret, and read and rewrite the event stream, through a `process.spawn` hook. The spec states neither as a residual, and plugins appear in no actor row.
  scenario: The owner has a marketplace plugin with an `on("process.spawn")` hook. When the mod starts the post office, that hook receives `e.input`, which holds the 32-byte secret, and every stdout piece of the event stream. It can then command and stop soldiers on Linux and macOS too, where PO-3 says the secret is shielded at `ptrace_scope` 1 or more. It can also rewrite pieces before the mod reads them.
  evidence: claude-code.d.ts (2.1.294) 8022-8049: ProcessSpawnRequest is "The argument of `$.process.spawn(request)`, and the `e` its hooks see", including `input`, "Text written to the child's standard input". 3517-3523 shows a hook used "above another plugin's spawn: redact each piece before it reads it". PO-3 "The event stream ... reaches the mod only on the post office's standard output" (:221); Appendix D row 2 (:1577) says "prevented, except residual 1".
  fix: decision: (a) add to PO-3's residual: "Another Claude Code plugin in the owner's session that hooks `process.spawn` sees the secret in the spawn's input and every event the post office writes, and can change them", with a plugin row in Appendix D's actors; (b) a handover no spawn hook sees, which would be a new mechanism for the owner to choose.

- severity: P2
  type: vendor-fact
  location: WSP-10 (:701); M1-AC10 (:944); §5.1 X (:816)
  claim: `hook.<event>.enabled` first appears in git 2.55.0. Git 2.54.0 already runs hooks defined in config (`hook.<name>.command`) and has only the per-name `hook.<name>.enabled`. With git 2.54, WSP-10's switches leave config-defined hooks on, and the spec names no minimum git version.
  scenario: The owner's git is 2.54.x, and the config git reads holds `[hook "fmt"] event = post-checkout command = <program>`, either the owner's own or one a soldier added in an earlier run that became trusted at the next start (WSP-10 trusts the state at start). Harness git runs `git worktree add` for a snapshot with `-c hook.post-checkout.enabled=false`. That disables only a hook named "post-checkout", so <program> runs, against "Harness git runs nothing the repository names". M1-AC10's config-defined post-checkout hook fails the same way on a 2.54 runner.
  evidence: https://git-scm.com/docs/git-hook (last updated in 2.55.0): "`hook.<event>.enabled` ... When set to false, no hooks fire for that event". https://git-scm.com/docs/git-hook/2.54.0 documents `hook.<friendly-name>.command` and `hook.<friendly-name>.enabled` only; its history shows 2.54.0 (2026-04-20) and 2.55.0 (2026-06-29) as the changing releases. NEEDS-PROBE: what git 2.54 does with `-c hook.post-checkout.enabled=false`.
  fix: WSP-10: "Harness git reads `git --version` at start. Where git runs hooks defined in config but has no `hook.<event>.enabled` (2.54), it also passes `hook.<name>.enabled=false` for each `hook.<name>.command` the config git reads holds." Alternatively, refuse git 2.54.x with a message, as CH-2 does for an old claude. Add a 2.54 case to M1-AC10.

- severity: P2
  type: vendor-fact
  location: PO-14 message (:357); PO-19 ConstrainedLanguage (:431); PO-20 Checksums (:437)
  claim: An administrator can't use SHA256SUMS to allow the script. AppLocker's file hash rules use the file's Authenticode hash, which for a script is not its plain SHA-256.
  scenario: Under an AppLocker policy, the check fails. The administrator follows PO-14's message and adds a hash rule with the SHA-256 from SHA256SUMS. The rule never matches, so the script stays in ConstrainedLanguage mode and no soldier ever starts. After R-M1-96's repair (a prebuilt DLL), the DLL also needs a rule under DLL or App Control enforcement, which the message doesn't mention.
  evidence: https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/understanding-the-file-hash-rule-condition-in-applocker: "File hash rules use a system-computed Authenticode cryptographic hash of the identified file."
  fix: PO-14 and PO-19: "An administrator can allow the installed script (and its DLL, R-M1-96) with a hash rule made from the installed files, such as one New-AppLockerPolicy builds from them. SHA256SUMS lists their SHA-256 for checking, not for a policy." Signing the script for a publisher rule would be a new feature, so decision.

- severity: P2
  type: vendor-fact
  location: CH-2 (:474); M1-AC8 (:941)
  claim: CH-2 says only user or managed settings can turn `useAutoModeDuringPlan` off. The vendor's scope is "User, local, or managed", and a soldier's snapshot never has the folder's local settings file.
  scenario: The owner sets `useAutoModeDuringPlan: false` in the folder's `.claude/settings.local.json`, which Claude Code allows. The owner's own session asks for every command. Each soldier runs in a snapshot of HEAD (WSP-11), which lacks that gitignored file, so the classifier still approves commands without the owner. M1-AC8 says only "the owner's `useAutoModeDuringPlan` set to false", so a run that sets it in the local file fails the AC (`node -e` runs), and a run that sets it in user settings passes.
  evidence: https://code.claude.com/docs/en/settings-reference, `useAutoModeDuringPlan`: "Scope: User, local, or managed. A repository can't turn it off for you"; "A `false` in any of these files still turns it off". The legend defines Local as `.claude/settings.local.json`.
  fix: CH-2: "...in their user settings (`~/.claude/settings.json`) or managed settings. Claude Code also reads it from a folder's `.claude/settings.local.json`, but a soldier's snapshot (WSP-11) has no copy of that gitignored file, so a false set there doesn't reach soldiers." M1-AC8: "with `useAutoModeDuringPlan` false in `~/.claude/settings.json`".

- severity: P2
  type: vendor-fact
  location: CH-2 (:472), version bullet (:468); PO-9 As if started directly (:302)
  claim: "A removal of a critical path is handled as in auto mode, which denies it in a -p session" holds only from claude 2.1.281, while CH-2's oldest supported claude is 2.1.277. It also stops holding when the owner's environment, which the soldier inherits unchanged, sets either of two documented variables.
  scenario: (1) claude 2.1.278 runs a supervised soldier with the classifier on. The model issues a critical-path `rm`, and the denial the spec promises doesn't exist on that version. (2) The owner exported `CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT=1` or `CLAUDE_CODE_DISABLE_INLINE_SHELL_RM_PROMPT=1` for their own shell. PO-9 passes the post office's environment through as given (Codex's draft defaults to `process.env`, processTree.ts:276 and 415). So in an `auto` or plan-classifier turn, `rm -rf ~/<dir>` goes to the classifier instead of being denied, outside the checkout and outside the guard.
  evidence: https://code.claude.com/docs/en/permission-modes, Critical paths: "The `auto` and `bypassPermissions` handling requires Claude Code v2.1.281 or later. To turn it off, set `CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT=1` ... In `auto` mode, critical-path removals then go to the classifier instead". Line 795 of that page covers `CLAUDE_CODE_DISABLE_INLINE_SHELL_RM_PROMPT`. The env-vars page says the first must be set "in the environment that launches Claude Code".
  fix: CH-2: "...which denies it in a `-p` session (claude 2.1.281 or later, the version this rule needs, CH-8). Where the owner's environment sets `CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT=1`, the soldier inherits it and the classifier reviews such removals instead; no adapter changes it (CH-7)." Alternatively, raise the oldest supported claude to 2.1.281.

- severity: P2
  type: vendor-fact
  location: CH-2 (:472)
  claim: "Auto mode is available on the Anthropic API for the roster's Opus and Sonnet models, 4.6 or later" leaves out the other providers where Claude Code now offers auto mode by default, and the server-side and organization switches that can turn it off.
  scenario: An owner whose soldiers use Amazon Bedrock or Google's Agent Platform with Sonnet 5.5 reads this sentence as saying a supervised soldier's commands outside the read-only set are denied in M1 and come to the owner from M2. In fact the classifier approves them without the owner.
  evidence: https://code.claude.com/docs/en/permission-modes: "Model: on the Anthropic API and Claude Platform on AWS, Claude Opus 4.6 or later, Sonnet 4.6 or later, Haiku 5.5, or a Fable model. On Amazon Bedrock, Google Cloud's Agent Platform, Microsoft Foundry, and signed-in Claude apps gateway sessions, only Claude Sonnet 5 or later, Opus 4.7 or later, Haiku 5.5, and the Fable models"; "Anthropic may also have turned auto mode off server-side". The env-vars page: auto mode "is available by default on every provider".
  fix: CH-2: "Auto mode is available as claude's permission-mode documentation lists it: on the Anthropic API and Claude Platform on AWS for Opus and Sonnet 4.6 or later, and on Bedrock, Agent Platform, Foundry and the Claude apps gateway for Sonnet 5 or later and Opus 4.7 or later, unless an organization or Anthropic turns it off."

- severity: P2
  type: ambiguity
  location: ARM-7 trust card (:673, :675); M1-AC13 (:963)
  claim: `$.ui.ask` always offers free text under "Other" and returns that text, but ARM-7 defines only the two labels, a dismissal and a dialog that can't open, so a typed answer has no defined outcome.
  scenario: The owner types "yes" under Other. Reading A, where anything but `Not now` accepts, records the hashes and opens a `full` soldier. Reading B, exact label only, starts nothing.
  evidence: claude-code.d.ts 2406-2416: "resolves to the label they chose, or the text typed under 'Other' ... (so compare it with the labels exactly)"; AskOptions 667-668: "free text is the dialog's Other".
  fix: ARM-7: "Only the answer `Trust these files` accepts. Any other answer, text typed under the dialog's Other included, accepts nothing, as `Not now` does." M1-AC13 adds a typed "yes".

- severity: P3
  type: vendor-fact
  location: PO-7 Sleep, suspension and stalls (:251)
  claim: "Node's monotonic clock ... goes on through sleep and hibernation on Windows and macOS" names no Node or libuv version and cites nothing for Windows.
  scenario: On macOS this holds only for a libuv that uses mach_continuous_time. On Windows it rests on QueryPerformanceCounter's behaviour across sleep, which no cited document gives. The outcome is capped at 5 s either way, so only the explanation and the log line can be wrong.
  evidence: libuv src/unix/darwin.c today returns `mach_continuous_time()`. https://docs.libuv.org/en/v1.x/misc.html (uv_hrtime) says nothing about sleep. NEEDS-PROBE (Windows).
  fix: "Whether Node's monotonic clock runs on through sleep differs by system and Node version. Either way, at most 5 seconds of a step count."

- severity: P3
  type: editorial
  location: PO-3 Windows (:225)
  claim: "By the same shipped means as its Job Object (PO-1)" cites the wrong requirement: the Job Object and its script are PO-9 and PO-19.
  scenario: An implementer follows PO-1 and finds no Windows mechanism there.
  evidence: PO-9 (:300), PO-19 (:426-432).
  fix: "(PO-9, PO-19)".

Coverage: HOST-2; PO-1, PO-2, PO-3, PO-5, PO-7, PO-9 to PO-21; CH-1, CH-2 (auto memory, plan mode, `useAutoModeDuringPlan`, critical paths, auto-mode availability), CH-7; SI-1 to SI-3; ARM-1, ARM-3, ARM-7 (`$.ui.ask`, `$.ui.log`); WSP-8, WSP-10, WSP-11; SEC-1, SEC-2, SEC-4, SEC-6; VER-1 to VER-3, VER-5 to VER-7, VER-9; §0 to §3; §5.1 (U, C, I, X, F, S, L and the budget); M1 Implements, spike S7, M1-AC1 to M1-AC22. Checked and found sound: the 1,048,576-character spawn backpressure, `$.clock.every`, `$.session.id`, `isInteractive` (typings 2.1.294); Node pipes being synchronous on Windows; `CLAUDE_CODE_DISABLE_AUTO_MEMORY` (env-vars page) and the per-repository auto-memory directory shared across worktrees; CLAUDE.md loading from parent folders; plan mode's blocks in `-p`; protected paths in plan mode; `disableAutoMode`; MCP_TIMEOUT's 30000 ms default; libproc.h's "private interfaces" comment and the proc_info_private.h split (xnu source); notarization required for Developer ID software; PROC_THREAD_ATTRIBUTE_JOB_LIST on Windows 10 and Server 2016; GitHub's Ubuntu and Windows arm64 runners and the macos-15-intel and macos-26-intel images, for private repositories too; npm provenance needing a public repository. Not raised again: R-M1-89 to R-M1-106 (including the run-time Add-Type compile, R-M1-96; launchd restarts, R-M1-98; auto memory and settings `env`, R-M1-106; ExitPlanMode, R-M1-93) and grok's budget fields (F-r2).
