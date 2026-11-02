

=== #63 comment 6046496852 at 2026-10-07T20:44:01Z

**v1 wrap-up, under the owner's go-ahead of 2026-10-07**

Done:
- `docs/claude-first.md` and the archived 2.0 spec and ADRs are in PR #64, along with a README note.
- The Grok and agy token under-count found while measuring is fixed in PR #65 (#62).
- Closed with their scope recorded: #33, #36 and #56 (their PRs merged), #53 and #9 (known v1 limits), and #32 with its PR #35 (superseded).
- The 2.0 line is closed: #38, PRs #39 and #61 (their text is archived in #64), milestones #40 to #52, and #57 (folded in here).
- A `legacy` label marks the v1 items still open. The 17 merged branches are deleted.

Left before `v1.0.0` is tagged:
- The owner merges #31, then #55 once it is retargeted to main.
- Codex reviews #59, #64 and #65, and they merge.
- Then the `v1.0.0` tag, the `legacy/v1` branch and a release note listing the known limits.


=== #63 comment 6047169738 at 2026-10-07T21:26:05Z

Codex reviewed and merged the three v1 wrap-up PRs:

- #59: a4abea873a0fb95f988ef17a7f4256f8b57a3082; reviewed head f92227a includes the additional exact-symlink-target regression correction.
- #65: 1fc360d8fc1cbc83f19b19dda5e04cb09b0e6f27; Grok/agy cached input accounting.
- #64: 4e11ec96ef7f3df1b06a571a5fcb86d5c400bb71; Claude-first decision record and exact archive of #61's spec/ADRs.

All reviewed PR heads passed CI on Windows, macOS and Ubuntu. Combined validation atop the main containing #31 and #55 passes build, no-emit typecheck and all 39 test files: 355 tests passed, 2 expected POSIX-only skips on Windows. Current main 4e11ec9 has exactly the same Git tree as the tested combination.

#58 and #62 are accepted with their evidence recorded. This completes the requested review/merge portion of the wrap-up. #63 remains open for the live-session helper, messaging, panes, meter/handoff and other implementation acceptance criteria.



=== #63 comment 6047776570 at 2026-10-07T22:05:24Z

**Progress, 2026-10-07**

- **v1 is finished.** `v1.0.0` and `v1.0.1` are released with their known limits, and `legacy/v1` points at `v1.0.1`. GitHub now holds only `main` and `legacy/v1`.
- **The v2 design canvas is done, and the owner accepted its decisions.** It has nine v2 pages (foundations, host, pane, messaging, sessions, post office, commands, screens) and the v1 boards as reference.
- **The v2 spec is up for review in PR #66:** `docs/spec/v2.md` and ADR-0008 to ADR-0013, with 84 requirements, 7 milestones and 34 ACs, and a traceability check that finds 0 problems.

Next, once #66 is accepted: the M0 spikes (S1 pane geometry and keys, S2 waking the Monarch, S3 context size and cache lifetimes, S4 the send tool's MCP injection, S5 the approval relay), then M1, the post office and the claude channel.


=== #63 comment 6051007290 at 2026-10-08T02:35:16Z

**The v2 spec is merged** (PR #66, 18a6918): `docs/spec/v2.md` and ADR-0008 to ADR-0013, with 87 requirements, milestones M0 to M6 and 36 ACs. Codex approved it after its four findings were fixed: separate credentials, byte-exact apply rollback, traceability, and key conflicts.

Next: the M0 spikes S1 to S5 (pane geometry and keys, waking the Monarch, context size and cache lifetimes, the send tool's MCP injection, the approval relay). Then M1: the post office and the claude channel.


=== #63 comment 6051525988 at 2026-10-08T03:24:27Z

## M0 spike report (2026-10-07)

All five spikes are answered. Sources:
- Claude Code 2.1.292's mod API reference (`claude-code.d.ts`, shipped with the CLI);
- each CLI's `--help` and its own docs;
- five short live probes, costing a few cents.

Findings change parts of the spec. A spec update PR follows this report.

### S1: The pane (from the mod API)

- **Placement.**
  - In Claude Code's full-screen layout the pane **docks beside the transcript from 110 columns**, not 144. On the main screen it sits inline above the prompt at any width.
  - A pane the mod opens on its own is placed only from 144 columns, or from 110 once the owner has opened it before. Otherwise it waits undrawn.
  - A pane opened by the owner's command, prompt or press is placed at any width.
  - **Spec change:** HOST-3. The canvas's "inline at 110" should be "docked at 110".
- **Width.** `$.ui.open` takes `columns`, the width wanted while docked, so 56 can be requested. A width the owner drags wins, and the default is "the share". Inline, it takes `rows`, defaulting to a third.
- **Keys.**
  - Hotkeys are one lowercase letter or digit, and when two share a hotkey the later wins. This confirms Codex's P2.
  - ctrl+x tab focuses the pane, Esc returns to the prompt, and ctrl+x x closes it.
  - Tab and the arrows walk the focus ring, so they can't be hotkeys. "← →" therefore moves between tab buttons rather than switching tabs directly.
  - `$.ui.scroll` exists, so i and k can scroll, and the engine scrolls with the wheel and its own keys too.
  - **Spec change:** HOST-5.
- **Option.** With more than one pane open, the engine draws its own tabs. One pane per soldier is an alternative to our own tab row; we keep ours for now.

### S2: Waking the Monarch (from the mod API, plus a measured analogue)

- **Mid-turn:** `$.session.append` adds a user-role row that the model reads from the running turn's next step. No extra turn is needed.
- **Idle:** append the row, then `$.prompt.submit`. That starts a turn of its own once the session is idle, and is never folded into a running turn.
- **Cost:** one request at the main session's context size, almost all cache reads while warm. As an analogue, a resumed claude follow-up of one line measured 36.1k tokens, 99.7% cache reads, about $0.008 on sonnet. For the owner's Opus session it scales with that session's size.
- **Recommendation:** keep MSG-8 (wake only when the brief asked for a reply). Add: summaries that arrive within a few seconds of each other share one wake.

### S3: Context size and cache lifetimes (live)

| CLI | Context size comes from |
|---|---|
| claude | the last `assistant` message's usage in stream-json: input + cache read + cache creation |
| codex | `thread/tokenUsage/updated` → `last`, plus `modelContextWindow` |
| grok | the session's `signals.json` on disk: `contextTokensUsed` (23,832 in the probe), and `contextWindowTokens` (256,000) |
| agy | each `step_update` event: `input_tokens` + `cache_read_tokens` (input excludes cache) |

- **Cache lifetimes:** Claude Code's reference gives 5 minutes for Anthropic; the others are not documented where we can rely on them.
- **Recommendation (spec change, SES-6):** detect cold from the CLI's own numbers, using a request whose cache reads fall to about zero, and learn each provider's lifetime from the gaps observed. Default to 5 minutes until measured.

### S4: The `send` tool in each CLI (help and docs)

- **claude:** `--mcp-config` takes a JSON string, which adds to the owner's servers rather than replacing them. An HTTP server with an `Authorization` header works.
- **codex:** `thread/start` takes a free-form `config`, so `mcp_servers.<name>` with a URL and headers should work. Verify in M3.
- **grok:** ACP `session/new` takes `mcpServers` per session (HTTP with headers is documented). This is the cleanest of the four.
- **agy:** there is **no per-session option.** `agy mcp add --type http --header` writes agy's own config. **Proposal:** agy gets no `send` tool in v2.0. It does research and tests only, and its replies come back as summaries anyway.

### S5: The approval relay (live)

- **claude:**
  - Without a handler, a write in default mode is **denied by itself** (`system/permission_denied`) and nothing is written. That is the safe default.
  - With `--permission-prompts host --permission-prompt-tool stdio`, claude sends a `control_request` (`can_use_tool`) with the tool, its exact input and claude's own suggestions, then waits for the answer.
  - **Spec change:** CH-2.
- **codex:** `item/commandExecution/requestApproval` and `item/fileChange/requestApproval`, with the decisions accept, acceptForSession, decline and cancel (from the app-server schema).
- **grok:** ACP `session/request_permission`, with its own options (per its docs).
- **agy: critical.** Asked to create a file, agy **wrote it without asking, in its default mode and also with `--mode plan`.** Its own log shows `write_to_file`. So "agy never writes" cannot rely on agy's mode.
  - **Spec change:** a new requirement that agy always runs in a throwaway read-only snapshot. Its writes are discarded and reported as a read-violation (2.0 WS-3), with the checkout guard on.



=== #63 comment 6153733136 at 2026-10-13T19:42:36Z

**Spec v0.4 is merged** (PR #69, de12b92), with Codex's approval at 19c70c4: 96 requirements, 51 ACs, 0 trace problems. Codex's seven findings (C1 to C7) were fixed before it approved. What v0.4 adds:

- **The owner's seven failure simulations as rules.** CH-1 keeps a rate limit, a context overflow and a refusal apart, and a refusal is not an error. PO-1 supervises each CLI's whole process tree, and only a process exit is a crash. MSG-1 passes another soldier's words only as quoted words.
- **A turn ends once, as the CLI's own end event says** (PO-8). A completed turn or a refusal is answered; a native failure is interrupted, with its error and partial edits. Background work keeps a turn open. A language server or MCP server that the CLI's configuration declares doesn't, but a job such a server starts for a tool call does.
- **Stopping.** A stop cancels every approval request its turn still has open, and approves nothing (CH-6, MSG-9). The soldier shows "stopping" (■) until the turn ends; a CLI that hasn't ended it after 30 seconds is ended, and its session resumed (CH-10).
- **No automatic resend.** An interrupted message is never sent again by Shadow Army or by a single key: r puts it back in the field to edit and resend (MSG-4).
- **The cold timer follows each CLI's own cache rules** (SES-6). A documented reset makes the estimate cold at once; any other change shows "cache unknown".
- **A session keeps the instructions it started with** (SI-4). ADR-0014 is accepted, and ADR-0011 is amended.

**M1 decisions (owner, 2026-10-13).** Codex builds M1 from its draft (#75), and Claude reviews it.
1. The mod's lease: a ping every 10 s; 30 s without one closes each session through its CLI and quits. It sits beside the draft's launcher watch and process containment.
2. One post office per folder, with a lock holding its pid, start time and port.
3. The mod stays in M1 (HOST-2, M1-AC1); `sa live` may stay as a dev tool.
4. Fakes are chosen through configuration (VER-5).
5. M1-AC3 replays a real, redacted recording, made again in VER-9 if the flags differ.
6. CI fails below 85% line coverage on the post office and channels.
7. Soldiers run in a snapshot of HEAD.

**Also merged:** #73, which gives every apply test 60 seconds on Windows CI (#72, closed).

**Next**
- **Spec v0.5 (#74):** the owner's v2.1 picks (Margin as the default, Gatehouse as the needs-you tab with a two-press "allow for this session", and the away digest), a brief's kind of work, Bellion's role, and ADR-0015. Codex's review found nothing new; it is up for Codex's verdict at its new head.
- **M1 (#75):** in progress.
- **Spike S6** (interrupt a turn and keep the session): claude, codex and grok's cancel are confirmed live. grok's pending-permission case and agy are left; the spike is paused.


=== #63 comment 6159653512 at 2026-10-14T02:38:35Z

**Spec v0.5 is merged** (PR #74, ab04992), with Codex's approval at 3b75621: 97 requirements, 53 ACs, 0 trace problems. Codex's review found no new P1 or P2. v0.5 adds the owner's picks from the v2.1 designs:

- **Margin is the default look** (VIS-1, HOST-11, ADR-0015). A soldier's rows in Claude's transcript carry its ▌ bar (`|` in ASCII).
- **One list of decisions, as the pane's first tab** (HOST-14). A new decision never replaces the card the owner is reading.
- **Two presses for "allow for this session"** (HOST-5, CH-6). A stop between the two presses closes the request, and nothing is sent.
- **While you were away** (HOST-15). After 10 minutes without input from the owner, once the army has settled, the mod adds one digest to Claude's transcript. It is drawn as notice rows, which are not added to Claude's conversation.
- **A brief's kind of work** (HOST-10, HOST-9, PO-6, ARM-2). The `send` tool and `/send` name the kind of work, and a kind the soldier may not do is refused before anything is sent: a review for grok, or a build for agy.
- **Bellion reviews and takes hard builds** (ARM-1). It is listed after claude-opus, so v1's routing doesn't change.

**Owner's decision on coverage (2026-10-13)**, adding to M1 decision 6. CI still fails below 85% line coverage overall. The security code needs 100% of its lines and branches covered: the code that creates the Monarch's credential, hands it over and checks it, the loopback-only rules, and redaction. The coverage settings name its files, so that code moves into small files of its own. Spec v0.6 writes this into VER-6.

**M1 (#75)** is paused at 04ab953 at the owner's request, still a draft ([Codex's checkpoint](https://github.com/mogesjohnson/shadow-army/pull/75#issuecomment-6158933802)). Its tests pass on all three systems. CI is red only on the new coverage gate, at 68% to 73%.

**Next: spec v0.6**, before M1 resumes.
- The S6 report, once grok's pending-permission case and agy's interrupt have run.
- Usage as each turn's own figures, never running totals (OBS-3, SES-7, HOST-15).
- M1's decisions in the spec text. Decision 1: the lease's 10 s ping and 30 s timeout (the branch uses 5 s and 20 s). Decision 2: the lock's pid, start time and port. The coverage rule, including how the three systems' results combine.
- What the process helper for M1-R1 requires on Linux and macOS.

