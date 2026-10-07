# 0009: Live sessions through each CLI's own channel, with ACP outward

- **Status:** accepted by the owner, 2026-10-07
- **Replaces:** in part, 0007 (smart soldier sessions) in `docs/legacy/adr/`

## Context

v1 started a new CLI process for every message. On 2026-10-07 the same two-prompt task was measured on four CLIs, once as each CLI's normal headless run and once through a session held open:

| CLI | Normal: task | Live: task | Normal: follow-up | Live: follow-up |
|---|---|---|---|---|
| grok | 46.3k | 47.2k | 23.6k | 24.2k |
| claude | 66.7k | 62.6k | 35.9k | 36.1k |
| codex | 40.7k | 42.8k | 41.2k | 27.0k |
| agy | 28.6k | 29.5k | 16.1k | 16.8k |

A live session cost the same as the CLI's own run, within about 5%. No live follow-up re-read a file. Only grok speaks ACP natively. Claude Code and Codex have official ACP adapters, and agy has only community ones.

## Decision

A local post office holds one live session per soldier, each through that CLI's own live-session interface:
- claude: stream-json;
- codex: app-server;
- grok: ACP;
- agy: stream-json.

Toward Claude and the mod, the post office offers one interface, shaped like ACP. No third-party adapter sits between the post office and a vendor's CLI.

## Consequences

- There are four small adapters to maintain, each pinned to contract fixtures recorded from the real CLI (v2 spec CH-8, VER-4).
- Watching a soldier happens in the mod's pane. A vendor's own window can attach only where its CLI allows (codex app-server, grok's leader process).
- The official ACP adapters stay an option if they prove to keep the harness as installed (Q5).
