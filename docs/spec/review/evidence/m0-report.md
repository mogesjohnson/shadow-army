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
