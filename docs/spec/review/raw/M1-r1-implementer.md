# M1 round 1, implementer (snapshot be9deb0)

- severity: P1
  type: contradiction
  location: M1 Implements (docs/spec/v2.md:536-544); CH-1 (docs/spec/v2.md:217)
  claim: The M1 text never says where a soldier runs or that a guard watches it. Settled decision 7 (a throwaway snapshot of HEAD) and the settled rule that auto or full needs the guard are both missing, and WSP-1 and WSP-4 wait for M6.
  scenario: The shipped shadow.config.json sets claude-sonnet to `auto`. CH-1 says to open "a session in a worktree", but no worktree exists before M6. Reading A: the session opens in the folder itself, and Iron edits the owner's uncommitted files with nothing to detect it. Reading B (the draft): a snapshot of HEAD, plus a guard on both the checkout and the snapshot. Any change fails the turn and marks the soldier down. The text also doesn't say whether a write in the snapshot is allowed, discarded or a read-violation, or whether the snapshot is deleted or kept (PO-7 keeps "worktrees").
  evidence: settled.md, M1 decision 7 and the design rule "With auto or full, a read-only task runs in a throwaway snapshot, and the checkout guard fails any task…". In section 4, "snapshot" appears only for agy (ARM-6, :384-387). Draft: src/v2/postOffice.ts:128-130 and :202-222.
  fix: In M1 and CH-1: "Until WSP-1 (M6), each session opens in a throwaway snapshot of HEAD under `.shadow/v2/`. The checkout guard covers each turn, as ARM-6 gives agy. A change to the snapshot or the checkout fails the turn as a read-violation." Add an M1 AC for it. decision: the snapshot is removed at close, or kept until the owner clears it.

- severity: P1
  type: gap
  location: CH-7 (docs/spec/v2.md:255); CH-2 (docs/spec/v2.md:221-224)
  claim: No table says which claude flags each autonomy level passes. If a level passes no flag, claude's starting mode comes from settings files or its built-in default, and either can be more permissive than "supervised".
  scenario: A soldier has no `autonomy`, so it is supervised. Reading A (pass no flag): `claude -p` starts in `default`. It starts in `auto` instead when the session doesn't fetch feature flags (for example with telemetry off, on v2.1.285+). It starts in `acceptEdits` when the snapshot's committed `.claude/settings.json` sets `defaultMode`. Either way, a "supervised" soldier acts without asking. Reading B (v1's mapping): plan for reads and acceptEdits for writes, but that needs a write flag, which M1 doesn't have. Reading C (the draft): always `plan`.
  evidence: https://code.claude.com/docs/en/permission-modes ("Which mode a session starts in"): for `claude -p`, "`default` in sessions that fetch feature flags. In sessions that don't, such as on a third-party provider or with telemetry off, `auto` with Claude Code v2.1.285 or later". A settings file's `defaultMode` values other than auto and bypassPermissions "apply from any settings file". 2.0 SAFE-10 (legacy spec :1048) has no table. v1: src/adapters/claude.ts:16-20. Draft: src/v2/claude.ts:30.
  fix: "Every adapter always passes its CLI's permission mode explicitly. For claude, supervised passes `--permission-mode plan` (decision: or `default`), auto passes `--permission-mode auto`, and full passes `--permission-mode bypassPermissions`." Give the same table for M2's CLIs.

- severity: P1
  type: gap
  location: PO-7 (docs/spec/v2.md:185-186); PO-1 (docs/spec/v2.md:168)
  claim: "Closes every soldier session through that CLI's own exit" gives no mechanism, time limit or fallback. claude's own exit can wait for background work and then take a new model turn after the owner's session has ended.
  scenario: Iron (autonomy `auto`) left `npm run dev` running in the background, and the owner quits Claude Code. Reading A (own exit, then wait): the post office closes Iron's stdin. claude stays up until the command ends or reaches its time limit, then takes one more turn, with tools, under `auto`. The post office can't exit and keeps the lock. Reading B (end the tree at once, as PO-1 says): claude's SessionEnd hooks and saved totals are lost. On Windows, Node has no graceful SIGTERM, so closing stdin is the only "own exit".
  evidence: https://code.claude.com/docs/en/headless ("Background tasks at exit"): "After Claude finishes its turn and stdin has closed, a claude -p run can stay open… the run waits until the command exits or reaches its time limit. Claude then takes one more turn with the outcome." Spike S6 saw that extra turn (s6-results.md). The draft had to guess: 2 s, then SIGTERM, 0.5 s, then a kill, with a 15 s fallback (src/v2/processTree.ts:95, :162-168).
  fix: "To close a session, the adapter stops the running turn and each background task through the CLI (claude: `interrupt`, then `stop_task`), ends the CLI's input, waits at most N seconds for it to exit, and then ends the whole tree (PO-1)." decision: N.

- severity: P1
  type: gap
  location: PO-1 (docs/spec/v2.md:164); HOST-2 (docs/spec/v2.md:94)
  claim: The spec lists what the lock holds, but not what a starting post office does when a lock already exists, whether its owner is alive, gone, or its pid has been reused. Nor does it say what a second Claude session in the same folder gets.
  scenario: (1) A power loss leaves a lock with pid 4242 and start time T. Reading A reclaims it, because the pid is gone or its start time differs. Reading B (the draft, which stores only the pid) refuses until the owner deletes `.shadow/v2/post-office.lock` by hand. (2) Two mods find the same stale lock and both reclaim it, so one folder has two post offices. (3) The owner runs the army from a second Claude Code window in the same repo. It can't join, because the secret exists only in the first mod's memory (PO-3), and its refusal is undefined.
  evidence: PO-1 says the start time "tells the process that wrote the lock apart from a later one that reuses its pid", but no rule uses it. Draft: src/v2/server.ts:26-37. 2.0 GUARD-5 ("a second sa … exits with a message naming the open chat", legacy spec :1076) was not carried over.
  fix: "A post office that finds the lock refuses, with '<text naming the pid>', while that pid is alive with that start time. Otherwise the lock is stale: the new post office replaces it atomically (exclusive create, then rename) and logs the stale one." decision: can a second Claude session in the folder take over, or is it only refused?

- severity: P1
  type: untestable
  location: HOST-2 (docs/spec/v2.md:94); M1-AC1 (docs/spec/v2.md:546)
  claim: "The first time the army is used" has no meaning in M1. M1 contains neither a command (HOST-9 is M5) nor a tool (HOST-10 is M3). So HOST-2's integration test has nothing to trigger it, and the owner has no M1 way to open, stop or reconnect a soldier.
  scenario: Built from the text, M1 ships a mod with nothing in it that uses the army. The draft invented `/army [open|inspect|stop] <soldier>`. HOST-9's `/army` has no such subcommands, and they overlap the later `/stop` and `/pane`. PO-1's "down until the owner reconnects it" has no reconnect in M1.
  evidence: M1's Implements list (:536-544); HOST-9 (:132); draft plugins/shadow-army/hooks/register.ts:207-229; settled M1 decision 3 ("`sa live` may stay as a dev tool").
  fix: decision: which M1 command counts as first use (for example HOST-9's `/army` list), and how M1 opens, stops and reconnects a soldier (a dev-only command, or `sa live`). Write the answer into M1's Implements and M1-AC1.

- severity: P1
  type: untestable
  location: WSP-8 (docs/spec/v2.md:409); SEC-4 (docs/spec/v2.md:419); VER-6 (docs/spec/v2.md:509)
  claim: Nothing defines what `redact()` removes. SEC-4's "no secret, token or credential" and VER-6's 100% branch coverage therefore test whatever the implementer invents.
  scenario: A soldier's tool result contains `"apiKey": "AIza…"` or an `xai-…` key. The draft's rules (key names, PEM blocks, Bearer, `sk-` and `gh*_` prefixes, `KEY=value`) log it word for word, and the draft's SEC-4 test still passes. An implementer who strips only the live credentials by value also passes.
  evidence: v2 only names `redact()` (:183, :409, :456, :474, :509). 2.0 SAFE-6 (legacy spec :1035) only says "A single `redact()` runs…". v1's `src/` has no `redact` (grep). ADR-0013:18 nonetheless lists it as carried over. Draft: src/v2/logs.ts:16-31.
  fix: "redact() replaces with `[REDACTED]`: the live credentials, matched by value (the Monarch's and each soldier's); the value of any key named <list>; and strings matching <named token patterns>. SEC-4 tests each class." decision: the classes and the patterns.

- severity: P1
  type: gap
  location: PO-5 (docs/spec/v2.md:183); section 5.1 fault tests (docs/spec/v2.md:490)
  claim: Section 5.1 lists "a failed log write" as a fault test, but no requirement says what the post office does when one happens.
  scenario: On Windows, an antivirus scan holds `.shadow/v2/logs/<session>.jsonl` (EBUSY), or the disk fills mid-turn. Reading A (the draft): the whole post office closes every soldier session. Reading B: the line is dropped, the failure is reported, and work goes on with an incomplete log. Reading C: the write is retried. The fault test can't be written without choosing one.
  evidence: draft src/v2/postOffice.ts:77-83 ("A broken audit must stop further work").
  fix: decision: stop the army, or carry on and report it; whether the line is retried; and the message text.

- severity: P1
  type: vendor-fact
  location: CH-2 (docs/spec/v2.md:226); M1-AC3 (docs/spec/v2.md:548)
  claim: "The turn totals come from `result`" gives wrong figures under either reading. `result.usage` covers one turn but only the main loop, and it is zero for a stopped turn. `total_cost_usd` and `modelUsage` are running totals for the whole process.
  scenario: Turn 1 costs $0.40 and turn 2 costs $0.10. Reading A (take `total_cost_usd` as the turn's cost): turn 2 is recorded as $0.50, and SES-7 and HOST-15 count turn 1 twice. Reading B (take `result.usage`): a turn whose subagent read 80k tokens shows only the main loop, and a stopped turn shows 0. After a resume, the running totals also include the restored spend.
  evidence: https://code.claude.com/docs/en/agent-sdk/cost-tracking ("Track costs in streaming input mode"): "`usage`: covers only that turn, and within it only the main agent loop … `total_cost_usd` and `modelUsage`: carry the running total for the whole call so far, plus any spend restored". s6-results.md: an interrupted turn's result has "usage … all zeros". The draft had to work around both (src/v2/claude.ts:273-295).
  fix: "A claude turn's tokens and cost are the difference between this `result`'s `modelUsage` and `total_cost_usd` and the previous `result`'s in the same process. A result that reports zero, or less than the last one, is 'not reported' and is never a new baseline. `result.usage` is kept raw (OBS-3)."

- severity: P2
  type: contradiction
  location: M1-AC2 (docs/spec/v2.md:547); PO-3 (docs/spec/v2.md:173)
  claim: M1-AC2 says the credential "travels only on the post office's standard input", while PO-3 and section 3 have every command present it over the loopback port.
  scenario: Reading A: each command carries the secret in a header (the draft sends `Authorization: Bearer`), which breaks AC2's literal wording. Reading B: AC2 is taken literally, so commands must prove they know the secret without sending it (for example an HMAC per request). That is a different protocol, with a different test.
  evidence: section 3 (:83): "The mod's commands present that secret". Draft: src/v2/server.ts:59-61; plugins/shadow-army/hooks/register.ts:57.
  fix: AC2: "The credential is handed over only on the post office's standard input. After that, each command presents it over the loopback connection. It appears in no file, command line, environment variable, output or log."

- severity: P2
  type: untestable
  location: PO-3 (docs/spec/v2.md:172); SEC-2 (docs/spec/v2.md:417)
  claim: "MUST NOT be written … anywhere a soldier can read" can't hold against a soldier running as the same user, which can read the post office's or the mod's memory. SEC-2's "no file" also has no defined scope.
  scenario: A soldier at `full` autonomy (or one whose command was approved) reads the post office's memory: on Linux with Yama ptrace_scope 0 through `/proc/<pid>/mem`, and on Windows by opening the process for memory reads (NEEDS-PROBE). It gets the secret and sends `approval` commands as the Monarch. SEC-2 checks only files, command lines and environment variables, so it still passes.
  evidence: https://www.kernel.org/doc/html/latest/admin-guide/LSM/Yama.html, scope 0: "a process can PTRACE_ATTACH to any other process running under the same uid". ADR-0012 already says soldiers "can read whatever the owner can".
  fix: Narrow the MUST: "…to disk, a command line, an environment variable, a log, an output, or any input a soldier receives. Reading the memory of a same-user process is a stated residual risk." SEC-2 names the places it checks: the folder and the OS temp directory, for files written during the test.

- severity: P2
  type: ambiguity
  location: HOST-2 (docs/spec/v2.md:94); PO-7 (docs/spec/v2.md:185)
  claim: "When the session ends" can mean the Claude Code process exiting, or any Claude Code SessionEnd, which also fires on `/clear` and `/resume`.
  scenario: The owner runs `/clear` to save the Monarch's tokens. Reading A (the draft): the lease is released and every soldier session closes. The next use starts a new post office, and the soldiers lose their live context, since there is no resume before M4. Reading B: soldiers survive `/clear` and `/resume`, and SES-1's "per Claude session" means per process.
  evidence: https://code.claude.com/docs/en/hooks lists SessionEnd's reasons as "`clear`, `resume`, `logout`, `prompt_input_exit`, `other`". Draft: plugins/shadow-army/README.md:22-26.
  fix: decision: the army lives per process, or per Claude session id. Then state it in HOST-2: "The Claude session ends when <…>; `/clear` and `/resume` <do / do not> end it."

- severity: P2
  type: gap
  location: PO-1 (docs/spec/v2.md:165-167)
  claim: The restart rule doesn't say over what span "three times" is counted, how long to wait between restarts, or whether a restart reopens the conversation (resume, CH-9, is M4) or starts a fresh one.
  scenario: Iron crashes at 10:00, 14:00, 18:00 and 22:00 in one long session. With a lifetime count (the draft), it is down for good after the fourth crash. With a count that resets after a completed turn, it never goes down. Each M1 restart in the draft starts a fresh claude with no `--resume`, so the soldier silently forgets the conversation while the Monarch briefs it as if it remembered.
  evidence: settled.md ("Stops and crashes"): "restarts it and reopens the session". CH-9 (:260) is M4. Draft: src/v2/postOffice.ts:161-181 (no reset, no delay, "replayed: false").
  fix: "A completed turn resets the count, and a restart waits <n> s. Until CH-9 (M4), a restart opens a fresh session with the same instructions and says so in the log and the event stream." Alternatively, decision: move claude's `--resume` into M1.

- severity: P2
  type: ambiguity
  location: PO-1 (docs/spec/v2.md:168); bears on D-3
  claim: "The CLI's whole process tree" is undefined for processes that leave it (setsid, a double fork, re-parenting). The text also doesn't say whether containment must hold when the post office itself dies, or what happens when the end of the tree can't be confirmed.
  scenario: The fake CLI starts a child that double-forks. Reading A (walk the tree by parent pid at close): the grandchild now hangs off init and keeps writing, yet M1-AC4 passes because it only uses a direct child. Reading B (end every descendant, even after the post office is killed): this needs kernel containment, which is Q8's helper. When the draft can't confirm the tree ended, it marks the soldier down and refuses to reconnect it; the spec gives no such outcome.
  evidence: M1-AC4 (:553) tests only "a process the fake CLI started and left running". Q8 (:720). Draft: src/v2/postOffice.ts:97-99 and :146-151.
  fix: "The tree is every process the CLI started, directly or not, including any that left its process group or was re-parented. If the end of the tree can't be confirmed, the soldier is down until <…>." decision: whether containment must hold when the post office is killed. That answer decides whether the helper in D-3 is needed at all. Add a detached child to M1-AC4.

- severity: P2
  type: gap
  location: PO-1 (docs/spec/v2.md:164)
  claim: "Process start time" has no source, format or precision, and Node.js has no API for another process's start time.
  scenario: The writer stores `Date.now() − uptime` (milliseconds, wall clock). The reader gets `ps -o lstart=` (whole seconds, local time), `/proc/<pid>/stat` (clock ticks since boot), or a Windows creation time. The values never match, so every live lock looks stale and a second post office starts. Or a clock change makes a stale lock look alive.
  evidence: Node's `process` object reports only its own uptime. The draft stores only the pid (src/v2/server.ts:28).
  fix: "The start time is the OS's own value for that pid (Linux: `/proc/<pid>/stat` field 22 plus the boot time; macOS: the process start time; Windows: the creation time). It is written and compared in the same form, to the second."

- severity: P2
  type: gap
  location: CH-2 (docs/spec/v2.md:223); CH-6 (docs/spec/v2.md:244)
  claim: M1 turns on the permission-relay flags but has no relay (CH-6 is M2) and no screen (M5), so a permission request in M1 waits forever, unseen.
  scenario: Kaisel (`auto`) takes an action that its CLI turns into a prompt, and a `can_use_tool` request arrives. Nobody can see or answer it in M1, so the turn waits until something stops it. The draft emits an "approval" event, but its M1 mod ignores it, logging only error, channel_down and containment_uncertain.
  evidence: CH-6: "An unanswered request stays pending… until the owner answers it or stops its turn". Draft: plugins/shadow-army/hooks/register.ts:128.
  fix: decision: M1 shows each request and lets the owner deny it or stop the turn; or, until CH-6 lands, M1 runs claude with `--permission-prompts none` (documented: "Claude Code denies them instead"), and M1-AC3's recording uses the same flags.

- severity: P2
  type: vendor-fact
  location: CH-2 (docs/spec/v2.md:222); HOST-1 (docs/spec/v2.md:93)
  claim: Nothing keeps Shadow Army's own mod out of a claude soldier. Once the mod is installed, it would load in every soldier's Claude Code. NEEDS-PROBE: whether a mod's commands and tools run under `-p`.
  scenario: The mod is installed (HOST-1) rather than loaded with `--plugin-dir`. A brief, or injected text, that starts with `/army …` runs as a command in the soldier's `-p` session. The soldier's copy of the mod starts a second post office in the soldier's own folder, which the per-folder lock doesn't cover, and opens more soldiers. From M3, the soldier's model would also get the Monarch's `send` tool.
  evidence: https://code.claude.com/docs/en/headless: in `-p`, "User-invoked skills and custom commands work. Include /skill-name in the prompt string". SET-2 (:439), which leaves out personal plugins, is M4.
  fix: decision: how soldiers start without the Shadow Army mod from M1 on: a setting that disables it for the soldier, or a marker the mod checks before it will start a post office.

- severity: P2
  type: ambiguity
  location: VER-5 (docs/spec/v2.md:506)
  claim: "Chosen through configuration" doesn't say which configuration, and one reading puts an executable path in a repository file.
  scenario: Reading A: a path key in shadow.config.json selects the fake. In a cloned repository, the first use of the army then runs that repository's own executable as "claude", with the owner's rights. Reading B (the draft): tests inject a `command` through ChannelOptions and ClientOptions, which ship in the product; VER-5 forbids that ("never through a code path that ships").
  evidence: draft src/v2/channel.ts:39-40; src/v2/client.ts:13-14; src/v2/fixture-main.testutil.ts:13.
  fix: decision: tests put `test/fakes/` first on PATH, or set a variable that only the test runner sets. Never a key in shadow.config.json.

- severity: P2
  type: contradiction
  location: PO-1 (docs/spec/v2.md:166); section 5.1 fault tests (docs/spec/v2.md:486)
  claim: In M1, a line from claude that can't be parsed is not a crash under PO-1, and CH-8's rule for it only arrives in M2, so the adapter's response is undefined.
  scenario: claude writes `{broken JSON}` mid-turn. Reading A (the draft): a transport failure, so the CLI is ended, restarted, and the turn interrupted. But PO-1 counts only a process ending or a lost connection as a crash. Reading B: an error event while the CLI keeps running; the turn can no longer be delimited, and it may never end.
  evidence: CH-8 (:259, M2): "A line that cannot be parsed is an error, never silently dropped". Draft: src/v2/claude.ts:138-141.
  fix: Move CH-8's line rule into M1 and finish it: "An unparseable line is an error event. The turn <goes on | ends as interrupted and the channel restarts>, and it <counts / doesn't count> as a crash."

- severity: P2
  type: vendor-fact
  location: CH-1 (docs/spec/v2.md:219); M1-AC4 (docs/spec/v2.md:552)
  claim: Nothing maps claude's documented error values onto CH-1's four kinds.
  scenario: A 529 `overloaded` could be a "rate limit", and the owner waits for a reset that never comes, or "another error". `billing_error` or `account_on_hold` could be "login needed" (HOST-6 shows "log in") or "another error". A context overflow arrives as `terminal_reason` `prompt_too_long`, or as `invalid_request` with the text "Prompt is too long"; the draft also matches the text.
  evidence: https://code.claude.com/docs/en/agent-sdk/typescript: the `SDKAssistantMessageError` values (`authentication_failed`, `oauth_org_not_allowed`, `account_on_hold`, `billing_error`, `rate_limit`, `overloaded`, …); "'overloaded': … a 529 … as opposed to 'rate_limit', which is a 429"; and `terminal_reason` includes `prompt_too_long`. Draft: src/v2/claude.ts:46-55.
  fix: Add a claude row: `rate_limit` (429) is a rate limit, with `rate_limit_event`'s reset time; `terminal_reason` `prompt_too_long` is a context overflow; `authentication_failed` and `oauth_org_not_allowed` are login needed; every other value is another error.

- severity: P2
  type: vendor-fact
  location: CH-2 (docs/spec/v2.md:223)
  claim: `--permission-prompts` needs claude v2.1.259 or later, but the spec names no minimum version and no outcome for an older CLI. CH-8 covers only newer versions.
  scenario: The owner has claude 2.1.250, so every launch exits on an unknown option. PO-1 counts each exit as a crash: three restarts, then down, reported as crashes rather than "update claude".
  evidence: https://code.claude.com/docs/en/cli-reference, `--permission-prompts`: "With the default `host`…", "Requires Claude Code v2.1.259 or later". https://code.claude.com/docs/en/headless: "Earlier versions reject it with an unknown-option error".
  fix: "CH-2 needs claude 2.1.259 or later. The adapter reads `claude --version` before opening a session and refuses an older one with '<text>', never as a crash." Alternatively, drop `--permission-prompts host`, since `host` is already the default.

- severity: P2
  type: vendor-fact
  location: CH-2 (docs/spec/v2.md:224); SI-2 (docs/spec/v2.md:276)
  claim: `--append-system-prompt` can't carry SI-1's multi-line text through an npm-installed `claude.cmd` on Windows, and CH-2 names no other route.
  scenario: On Windows with claude installed by npm, Node has to run the `.cmd` shim through cmd.exe. cmd.exe can't pass a line break inside an argument, and limits a command line to 8,191 characters. The instructions are cut short, or the launch fails. The draft guessed `--append-system-prompt-file` on Windows. NEEDS-PROBE on how claude is installed on the owner's machine.
  evidence: draft src/v2/claude.ts:92-98; https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows; https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/command-line-string-limitation. The CLI reference documents `--append-system-prompt-file`: "Load additional system prompt text from a file and append to the default prompt".
  fix: "The instructions go in `--append-system-prompt`, or in `--append-system-prompt-file` where the command line can't carry them (a file in the session's folder, removed at close)."

- severity: P2
  type: ambiguity
  location: Glossary, "Context size" (docs/spec/v2.md:69); CH-2 (docs/spec/v2.md:226)
  claim: "Input tokens, cached ones included" doesn't say whether cache writes count, and CH-2 names no fields.
  scenario: A cold turn reports `input_tokens` 4, `cache_creation_input_tokens` 141,000 and `cache_read_input_tokens` 0. Counting input plus cache reads, the meter shows 4; counting all three, it shows 141,004. M1-AC3's "context size parsed" passes either way.
  evidence: m0-report.md, S3: "input + cache read + cache creation". Draft: src/v2/claude.ts:211.
  fix: CH-2: "…that message's `input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens`."

- severity: P2
  type: untestable
  location: VER-9 (docs/spec/v2.md:514); section 5.1 live checks (docs/spec/v2.md:493-497); M1-AC8 (docs/spec/v2.md:557)
  claim: "Within 5%" doesn't say whether the bound is two-sided or an upper bound, or which tokens it counts. The two prompts aren't in the spec, and the recorded baseline itself falls outside a two-sided 5%.
  scenario: On 2026-10-07, claude's normal task took 66.7k tokens and the live one 62.6k (−6.1%). That fails a two-sided bound and passes an upper bound. SI-3 allows 1,500 tokens of instructions on every request, so a three-request task can add about 4.5k (7%) by design. Run-to-run noise is larger than the bound.
  evidence: docs/claude-first.md:21-28 (the prompts "read two files, say what the project is" and then "which file has more lines?", and the table).
  fix: decision: an upper bound or a two-sided one; which counts (input with cache reads and writes, plus output; summed over both prompts or per prompt); and a tolerance for run-to-run noise. Put the two prompts and the two files in section 5.1.

- severity: P2
  type: untestable
  location: M1-AC3 (docs/spec/v2.md:548); section 5.1 contract tests (docs/spec/v2.md:457-461)
  claim: M1-AC3 needs a real recording that contains a subagent's message, but none of the recordings 5.1 lists makes claude use a subagent.
  scenario: The owner records the two-prompt task. claude reads the two files without a subagent, so the replay can't show that "a subagent's message leaves the context size unchanged". The draft covers it with a hand-written frame (test/fakes/claude.mjs:94-96), which isn't the "real, redacted recording" of settled M1 decision 5.
  fix: Add "a prompt that makes claude use a subagent" to 5.1's recordings, or move that sentence of M1-AC3 to a fake-CLI test.

- severity: P2
  type: gap
  location: SI-3 (docs/spec/v2.md:277); M1-AC5 (docs/spec/v2.md:554)
  claim: SI-3 gives no way to count tokens offline, and no outcome when the owner's `rules.md` or `agent.md` pushes the instructions over 1,500.
  scenario: The owner's rules.md grows to 6 KB, about 2,100 tokens. Reading A (the draft): every soldier refuses to open. Reading B: rules.md is cut, which breaks SI-1. Reading C: the instructions go out with a warning. CI can't use claude's tokenizer without a network call and a key.
  evidence: draft src/v2/instructions.ts:19-22 (UTF-8 bytes ÷ 3) and :45-49 (throws).
  fix: "Tokens are counted as UTF-8 bytes ÷ 3, an upper bound. Instructions over 1,500 tokens <decision: stop the soldier from opening, with '<text>' | open it with a warning>."

- severity: P2
  type: ambiguity
  location: ARM-1 (docs/spec/v2.md:376-378); M1-AC6 (docs/spec/v2.md:555)
  claim: ARM-1 doesn't say whether codex-astra keeps the `orchestrate` role, and with it v1's Monarch, when it gains review and hard builds, or which file's order "listed after" refers to.
  scenario: Today codex-astra has `[orchestrate]`, is listed first, and is v1's `monarch.default`. Reading A: it becomes `[orchestrate, review, build]` with buildFor `[hard]`, moved after claude-opus, and v1's Monarch is unchanged. Reading B (the draft): it becomes `[review, build]`, and v1's Monarch moves to claude-opus, so v1's `sa run` plans with a different model before LEG-1.
  evidence: main's orchestratorDelegate.md front-matter; the draft's orchestratorDelegate.md:6-19. v1 orders the roster by orchestratorDelegate.md (src/core/roster.ts:46).
  fix: "codex-astra keeps `orchestrate` (v1's Monarch until LEG-1), gains review, and build with buildFor [hard], and is listed after claude-opus in orchestratorDelegate.md." Or decision.

- severity: P2
  type: gap
  location: ARM-3 (docs/spec/v2.md:381)
  claim: "They can be configured" names no setting and no uniqueness rule, even though names address messages, without regard to case (MSG-2).
  scenario: The owner names two soldiers "Iron" (or "Iron" and "iron"), or names one "grok", which is another soldier's key. `/army`, and later `send`, reach the wrong soldier, and nothing refuses it at start, unlike a duplicate `tag` (VIS-6).
  evidence: VIS-6 (:432). 2.0 CFG-3 had a per-soldier `shadowName` (legacy spec :1099). The draft has no such setting (src/v2/instructions.ts:15-17).
  fix: "`shadowName` in shadow.config.json sets a soldier's name. Names are unique without regard to case and differ from every soldier key; a clash is refused at start."

- severity: P2
  type: untestable
  location: VER-6 (docs/spec/v2.md:507-511)
  claim: "No code is left out of the count" can't be measured for containment code written in other languages or run in child processes, and line coverage counts some of that code as covered without testing it.
  scenario: The draft's Linux and macOS guardians are `String.raw` literals run with `node -e`. Its Windows supervisor is C# run through PowerShell, and there is native C. V8 counts a string literal's lines as covered once the module loads, and never sees the C or the C#. The 85% bar passes with that code untested.
  evidence: draft src/v2/processTree.ts:110-203, :336-382 and :504-609; native/process-supervisor.c.
  fix: "VER-6 counts the TypeScript and JavaScript files of the post office, the channels and the mod, named in the coverage settings. Code in another language, or run in a child process, lives in a file of its own and has its own fault tests (F)." Or decision.

- severity: P2
  type: untestable
  location: HOST-2 (docs/spec/v2.md:94)
  claim: HOST-2's only evidence is an integration test, but CI has no Claude Code to host the mod. The lifecycle HOST-2 states (first use, session end, losing the host) is never checked against the real host.
  scenario: Tests against a fake host pass, while in Claude Code the session-end release misses its 1.5-second budget, or on Windows the host's job object kills the post office before PO-7's own exit can run (a draft comment says so; NEEDS-PROBE).
  evidence: https://code.claude.com/docs/en/hooks: "SessionEnd hooks share a 1.5-second budget". Draft: plugins/shadow-army/README.md:31-35 ("Static plugin validation does not establish live HOST-2 acceptance…"); src/v2/client.ts:36-38.
  fix: Make it "HOST-2 (M1; I, L)". In the live check, the owner tries first use, reuse, `/clear`, a normal exit and a killed Claude Code, on Windows and on one POSIX system.

- severity: P2
  type: gap
  location: PO-5 (docs/spec/v2.md:183); WSP-8 (docs/spec/v2.md:409)
  claim: The logs have no format, file names, size limit or retention. WSP-8 narrows 2.0 SAFE-6 without saying whether its 30-day pruning and its coverage of "events, reports and fixtures" still apply.
  scenario: A six-hour session logs every thinking delta into one file that grows without limit and is never rotated or pruned. OBS-1 (M5) later has to find "the soldier's log" under a name nobody fixed. The text doesn't say whether the event stream to the mod is redacted; the draft redacts it.
  evidence: 2.0 SAFE-6 (legacy spec :1035): "…logs, events, briefs, reports and fixtures. Logs are pruned after 30 days." The spec's own rule (:31): "unless this spec restates it". Draft: src/v2/logs.ts:55-85.
  fix: "Logs are JSON Lines, one file per session (`<soldier>-<session>.jsonl`), plus `post-office-<start>.jsonl`. They are pruned after 30 days. redact() also runs on the event stream, reports and fixtures." decision: a size limit.

- severity: P2
  type: gap
  location: PO-3 (docs/spec/v2.md:173)
  claim: "The refusal is reported" has no limit, and any local process can read the port from the lock.
  scenario: A soldier reads the port from the lock (PO-1) and sends 1,000 bad requests a second. The post office writes 1,000 log lines and 1,000 events a second, so the log grows without limit and the mod's event stream floods.
  evidence: PO-1 (:164) puts the port in the lock. The draft records every refusal (src/v2/postOffice.ts:260).
  fix: "The first refusal is reported in full. After that, at most one report a minute, with the count since the last one."

- severity: P3
  type: gap
  location: PO-2 (docs/spec/v2.md:169); M1-AC1 (docs/spec/v2.md:546)
  claim: No setting chooses the address, so "refused at start" and M1-AC1's `0.0.0.0` case can only be reached from test code. The accepted strings aren't listed either.
  scenario: Is `localhost`, `127.0.0.2` or `::ffff:127.0.0.1` refused? The draft accepts exactly `127.0.0.1` and `::1`, through an internal option (src/v2/server.ts:40-41).
  fix: "The address is 127.0.0.1 or ::1, exactly. An internal option naming any other string is refused with: '<text>'."

- severity: P3
  type: ambiguity
  location: SI-1 (docs/spec/v2.md:275)
  claim: "The handoff instruction" can mean the summary's format, for when the post office asks for it (SES-4), or a rule to hand off by itself at 200k, which the model can't measure.
  scenario: The draft writes "At 200,000 context tokens, write a handoff…" (src/v2/instructions.ts:43). The model may then hand off at random times, or never.
  fix: "The handoff instruction: when asked for a handoff, reply under working on, done, decided, files and open."

- severity: P3
  type: editorial
  location: CH-7 (docs/spec/v2.md:254-255); M1-AC5 (docs/spec/v2.md:554)
  claim: CH-7's first bullet forbids "a flag that disables a safeguard", but the flag `full` maps to (`bypassPermissions`) disables the permission prompt. M1-AC5's flag test needs the exception stated.
  evidence: https://code.claude.com/docs/en/cli-reference, `--dangerously-skip-permissions`: "Skip permission prompts. Equivalent to `--permission-mode bypassPermissions`".
  fix: "…passes a flag that disables a safeguard, except the documented flag that the owner's autonomy level chooses."

Coverage: HOST-2; PO-1, PO-2, PO-3, PO-5, PO-7; CH-1, CH-2, CH-7; SI-1, SI-2, SI-3; ARM-1, ARM-3; WSP-8; SEC-1, SEC-2, SEC-4; VER-1, VER-2, VER-3, VER-5, VER-6, VER-7, VER-9; M1-AC1 to M1-AC8. Read for what M1 relies on: sections 0 to 3, section 5.1, PO-8, MSG-4, CH-6, CH-8, CH-9, CH-10, SI-4, ARM-2, SES-1, SES-4, HOST-1, HOST-9, HOST-10, SEC-3, SEC-5, M2-AC1 to M2-AC10. I found nothing at P0 to P2 in VER-1, VER-2, VER-3 or VER-7.
