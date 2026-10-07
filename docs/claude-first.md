# Moving to a Claude-first Shadow Army

**Status.** The owner chose this direction on 2026-10-06 and 2026-10-07. The work is tracked in [#63](https://github.com/mogesjohnson/shadow-army/issues/63). The current `sa` CLI becomes **v1 (legacy)** and is frozen at the `v1.0.0` tag.

## Why we changed

v1 starts a new CLI process for every message, and a separate Monarch CLI plans each goal and writes its report. Measured on the owner's machine:

- **A simple one-task goal cost about 125k tokens:**
  - two Monarch calls (codex-astra, about 62k);
  - one soldier task (claude-sonnet, about 65k).
- **Shadow Army's own text was about 2k of that.** The plan prompt is about 1.6k tokens and a soldier's brief about 0.6k.
- **The rest is each CLI's own setup, sent again on every model request:**

  | CLI (as v1 launches it) | Tokens per request |
  |---|---|
  | claude | 31.5k |
  | codex | 20.1k |
  | grok | about 23k |

Next, the same task was sent to each CLI twice: once the normal way, and once through a **live session** held open with Shadow Army's instructions appended. The task was "read two files, say what the project is", followed by "which file has more lines?". All runs were on 2026-10-07.

| CLI (model) | Normal: task | Live: task | Normal: follow-up | Live: follow-up |
|---|---|---|---|---|
| grok (grok-4.7-build) | 46.3k | 47.2k | 23.6k | 24.2k |
| claude (sonnet) | 66.7k | 62.6k | 35.9k | 36.1k |
| codex (gpt-6.1-sol) | 40.7k | 42.8k | 41.2k | 27.0k |
| agy (gemini-3.1-pro-high) | 28.6k | 29.5k | 16.1k | 16.8k |

The conclusions:

- **A live session costs the same as the CLI's own run, within about 5%.** The difference is Shadow Army's appended instructions.
- **Every live follow-up was answered without re-reading the files.** In its normal follow-up, Codex chose to run a command to count the lines again.
- **The overhead lives inside each CLI.** So the savings come from:
  - keeping sessions open, so work isn't redone;
  - dropping the separate Monarch calls;
  - not starting a new process for every message.

  They don't come from trimming the vendors' harnesses.

## What the owner decided

Quotes are from the owner, with spelling tidied:

- "if we can have the chat windows always open then we fix the problem of the rereading. everyone can have a window open and waiting" (2026-10-06)
- "figure out a way to have the models message each other without starting a new window" (2026-10-06)
- "can we open ports for this connection of chat windows" (2026-10-07)
- "lets not strip down the harnesses that the corporate companies provide with the models (they have built in safeguards)" (2026-10-07)
- "if i am able to see the token usage then i can start new session myself" and a 200k handoff rule with a summary (2026-10-07)
- "in the pre-prompt sent we have to tell the models that they are in a group along with their roles and claude is the orchestrator" (2026-10-07)
- Treat the current setup as legacy, document the transition, and clean up GitHub before the new implementation (2026-10-07)

## The new design

```
 owner
   │
   ├── Claude Code session = the Monarch      side panes: one tab per soldier,
   │        │                                 a meter and a message field
   │        │ ACP
   │        ▼
   └── post office (local helper, 127.0.0.1 + secret)
            ├── Iron    claude-sonnet   stream-json, one process   worktree
            ├── Igris   codex-sol       codex app-server           worktree
            ├── Beru    grok            ACP (grok agent)           worktree
            └── Tusk    agy             stream-json, one process   worktree
```

- **Claude is the Monarch.** The owner's own Claude Code session plans, assigns work and reads the soldiers' summaries. No separate Monarch CLI plans and reports.
- **Each soldier is one live session of its own CLI**, open in its own worktree, with the vendor's harness exactly as installed. Soldiers keep their shadow names (the 2.0 spec's CFG-4 defaults).
- **The post office is a small local helper that holds those sessions.**
  - Outward, it offers one interface, ACP (the Agent Client Protocol), to Claude and the panes.
  - Inward, it uses each CLI's own live channel. Only Grok speaks ACP natively.

  | CLI | Live channel | Where the standing instructions go | Turn end and usage |
  |---|---|---|---|
  | claude | `claude -p --input-format stream-json --output-format stream-json`, one process | `--append-system-prompt` | `result` event, with usage and cost |
  | codex | `codex app-server`, JSON-RPC: `thread/start`, then `turn/start` per message | `developerInstructions` | `turn/completed`; `thread/tokenUsage/updated` also gives the context window |
  | grok | `grok agent stdio`, or `grok agent serve --bind 127.0.0.1:<port>` with a secret | `session/new` `_meta.rules` | the `session/prompt` result's `_meta.usage` |
  | agy | `agy --input-format stream-json --output-format stream-json`, one process; messages carry `"event": "user"` | the first message (agy has no append slot) | `result` event, with running totals |

- **Standing instructions.** Each soldier is told:
  - its shadow name, model and roles;
  - the whole team, with Claude as the Monarch;
  - the hard rules (Grok never reviews, agy never writes), `rules.md` and its `agent.md` section;
  - to reply in at most five lines;
  - the 200k handoff.

  The instructions are appended, never put in place of the vendor's prompt.
- **Messaging.** Claude, the owner and the soldiers send messages by name through the post office. A message is one more turn in the recipient's open session; no new session or window starts. Replies are short summaries. Full reports stay on disk, where they cost no tokens.
- **Meter and handoff.**
  - Each soldier shows its context use from its CLI's own numbers.
  - The owner can start a fresh session for any soldier.
  - At 200k tokens the soldier writes a handoff summary, and a fresh session starts with the standing instructions plus that summary.
  - Everything a session holds is re-sent with every message. It is cached while the session is busy, but after a few idle minutes the cache expires and the next message pays for the whole history again. So related work goes to the same session, and unrelated work starts fresh.
- **Windows.**
  - A Claude Code mod draws the soldier panes beside Claude's transcript.
  - Codex's own window can also attach to an app server (`codex --remote`), and Grok's clients can share one leader process; neither is tested yet.
- **Safety.**
  - Every listening port binds to 127.0.0.1 and needs a secret.
  - Vendor harnesses and their safeguards are never removed or replaced.
  - Autonomy still only chooses each vendor's own flags.

## What carries over and what becomes legacy

| Carries over | Becomes legacy (v1) |
|---|---|
| Shadow names, roles and the hard rules | The Ink chat (`sa` in a terminal, #30, #54) |
| `orchestratorDelegate.md` routing and `shadow.config.json` | The live dashboard of `sa run` |
| Worktrees, file leases, claims and the claim audit | `sa run`'s separate Monarch, with its plan and report calls |
| The checkout guard, link safety, apply and undo | A new CLI process for every brief |
| The Shadow Vault | The one-shot report parsers, which give way to live usage events |
| The terminal UI design system (the design canvas) | The 2.0 spec's Ink shell and wake model |

## Where the old work lives

- **v1's code:** the `v1.0.0` tag and the `legacy/v1` branch. The v1-only parts leave `main` in the first implementation PR of #63, so `main` never breaks in between.
- **The 2.0 spec (v0.16) and its ADRs:** [`docs/legacy/`](legacy/README.md). Their workspace and safety rules still apply.
- **Closed as superseded:** the 2.0 milestones (#40 to #52) and #32 with its PR #35. #57's mod ideas carry over into #63.

## Open questions

- **ACP adapters.** Official ACP adapters exist for Claude Code ([claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)) and Codex ([codex-acp](https://github.com/zed-industries/codex-acp)). They may later replace our own inward adapters if they keep the vendor's harness as installed. agy has only community adapters.
- **Grok's window.** Grok 4.7 runs a 256k window by default, and 500k is an option set in its config. Check whether long requests cost more per token.
- **The idle cache.** The meter should show when a session's cache has gone cold, so the owner knows a message will re-cache the whole history.

## Next steps

1. Finish v1: #62, #59, #31 and #55 merge, then tag `v1.0.0`.
2. Build the post office with live sessions for all four CLIs, and check token parity (#63 AC1, AC2).
3. Add the standing instructions and messaging (#63 AC3, AC4).
4. Add the meter and the 200k handoff (#63 AC6).
5. Add the side panes as a Claude Code mod (#63 AC5).
6. Remove v1-only code from `main`.
